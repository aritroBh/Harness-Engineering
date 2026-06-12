"""Ross — the cloud knowledge-graph retrieval layer, backed by ClickHouse.

This implements the "Retr KG" arrow: Specter/Harvey POSTs a goal, Ross returns
the right enablement context as structured JSON.

Retrieval = GraphRAG hybrid:
  1. seed   : hybrid search = vector (cosineDistance) + keyword (multiSearchAny),
              fused with Reciprocal Rank Fusion (RRF)
  2. expand : 1-hop walk over kg_edges (next_step / mentions / part_of)
  3. assemble: ordered enablement journey + citations -> JSON for Harvey

If CLICKHOUSE_HOST is unset the store is disabled and the service falls back to
its existing local search, so the demo never hard-breaks.
"""
import os
import logging
from typing import List, Dict, Any, Optional, Tuple

from .chunker import chunk_site_md, tokenize, Chunk, Node, Edge

logger = logging.getLogger(__name__)

RRF_K = 60          # RRF damping constant
SEED_TOPN = 8       # per-channel candidates before fusion
FINAL_SEEDS = 5     # seeds kept after fusion
EXPAND_LIMIT = 6    # neighbours pulled during graph expansion


class ClickHouseRetriever:
    def __init__(self, embedder, known_sites: Optional[List[str]] = None):
        self.embedder = embedder
        self.known_sites = known_sites or []
        self.enabled = False
        self.client = None
        self.database = os.getenv("CLICKHOUSE_DATABASE", "default")

        host = os.getenv("CLICKHOUSE_HOST")
        if not host:
            logger.info("CLICKHOUSE_HOST unset -> ClickHouseRetriever disabled.")
            return
        # Accept either a bare host or a full URL (https://host:8443) in the env.
        host = host.replace("https://", "").replace("http://", "").split("/")[0].split(":")[0]
        try:
            import clickhouse_connect
            secure = os.getenv("CLICKHOUSE_SECURE", "true").lower() == "true"
            self.client = clickhouse_connect.get_client(
                host=host,
                port=int(os.getenv("CLICKHOUSE_PORT", "8443" if secure else "8123")),
                username=os.getenv("CLICKHOUSE_USER", "default"),
                password=os.getenv("CLICKHOUSE_PASSWORD", ""),
                database=self.database,
                secure=secure,
            )
            self.client.command("SELECT 1")
            self.enabled = True
            logger.info("ClickHouseRetriever connected to %s", host)
        except Exception as e:
            logger.warning("ClickHouse connection failed (%s) -> disabled.", e)
            self.enabled = False

    # ---------------------------------------------------------------- schema
    def init_schema(self):
        self.client.command(
            """
            CREATE TABLE IF NOT EXISTS doc_chunks (
                chunk_id    String,
                site_id     LowCardinality(String),
                protocol    LowCardinality(String),
                section     String,
                heading     String,
                content     String,
                source_file String,
                node_id     String,
                `order`     UInt32,
                tokens      Array(String),
                embedding   Array(Float32),
                ingested_at DateTime DEFAULT now()
            ) ENGINE = ReplacingMergeTree(ingested_at)
            ORDER BY (site_id, protocol, chunk_id)
            """
        )
        self.client.command(
            """
            CREATE TABLE IF NOT EXISTS kg_nodes (
                node_id String,
                site_id LowCardinality(String),
                type    LowCardinality(String),
                name    String,
                summary String,
                source_file String,
                ingested_at DateTime DEFAULT now()
            ) ENGINE = ReplacingMergeTree(ingested_at)
            ORDER BY (site_id, node_id)
            """
        )
        self.client.command(
            """
            CREATE TABLE IF NOT EXISTS kg_edges (
                src      String,
                dst      String,
                relation LowCardinality(String),
                weight   Float32,
                site_id  LowCardinality(String),
                ingested_at DateTime DEFAULT now()
            ) ENGINE = ReplacingMergeTree(ingested_at)
            ORDER BY (src, relation, dst)
            """
        )

    # ---------------------------------------------------------------- ingest
    def ingest_files(self, files: List[str], read_file) -> Tuple[int, List[str]]:
        """Chunk -> embed -> load into ClickHouse. `read_file(path)->str|None`."""
        docs = [{"source": p, "content": read_file(p)} for p in files]
        return self.ingest_documents(docs)

    def ingest_documents(self, docs: List[Dict]) -> Tuple[int, List[str]]:
        """Learn raw documents/interactions pushed by Specter.

        Each doc: {"content": str, "source"?: str, "site_id"?: str}. This is the
        write path for the Specter -> Ross learning loop (no files needed).
        """
        self.init_schema()
        warnings: List[str] = []
        all_chunks: List[Chunk] = []
        all_nodes: List[Node] = []
        all_edges: List[Edge] = []

        for d in docs:
            content = d.get("content")
            source = d.get("source") or d.get("title") or "interaction.md"
            if not content:
                warnings.append(f"skip empty: {source}")
                continue
            res = chunk_site_md(source, content, site_id=d.get("site_id"),
                                known_sites=self.known_sites)
            all_chunks.extend(res["chunks"])
            all_nodes.extend(res["nodes"])
            all_edges.extend(res["edges"])

        if not all_chunks:
            return 0, warnings + ["no chunks produced"]

        # Embed in one batch
        vectors = self.embedder.embed([c.content for c in all_chunks])
        for c, v in zip(all_chunks, vectors):
            c.embedding = v

        self.client.insert(
            "doc_chunks",
            [
                [c.chunk_id, c.site_id, c.protocol, c.section, c.heading, c.content,
                 c.source_file, c.node_id, c.order, c.tokens, c.embedding]
                for c in all_chunks
            ],
            column_names=["chunk_id", "site_id", "protocol", "section", "heading",
                          "content", "source_file", "node_id", "order", "tokens", "embedding"],
        )
        # de-dup nodes by id
        seen = {}
        for n in all_nodes:
            seen[n.node_id] = n
        self.client.insert(
            "kg_nodes",
            [[n.node_id, n.site_id, n.type, n.name, n.summary, n.source_file] for n in seen.values()],
            column_names=["node_id", "site_id", "type", "name", "summary", "source_file"],
        )
        self.client.insert(
            "kg_edges",
            [[e.src, e.dst, e.relation, e.weight, e.site_id] for e in all_edges],
            column_names=["src", "dst", "relation", "weight", "site_id"],
        )
        return len(all_chunks), warnings

    # ---------------------------------------------------------------- search
    def _vector_search(self, qvec: List[float], site_id: Optional[str]) -> List[Dict]:
        where = "WHERE site_id = {site:String}" if site_id else ""
        params: Dict[str, Any] = {"qvec": qvec, "topn": SEED_TOPN}
        if site_id:
            params["site"] = site_id
        rows = self.client.query(
            f"""
            SELECT chunk_id, site_id, protocol, heading, content, source_file, node_id,
                   cosineDistance(embedding, {{qvec:Array(Float32)}}) AS dist
            FROM doc_chunks
            {where}
            ORDER BY dist ASC
            LIMIT {{topn:UInt32}}
            """,
            parameters=params,
        ).result_rows
        return [self._row(r) | {"dist": r[7]} for r in rows]

    def _keyword_search(self, tokens: List[str], site_id: Optional[str]) -> List[Dict]:
        if not tokens:
            return []
        conds = ["multiSearchAny(lower(content), {toks:Array(String)})"]
        params: Dict[str, Any] = {"toks": tokens, "topn": SEED_TOPN}
        if site_id:
            conds.append("site_id = {site:String}")
            params["site"] = site_id
        rows = self.client.query(
            f"""
            SELECT chunk_id, site_id, protocol, heading, content, source_file, node_id,
                   length(arrayFilter(t -> positionCaseInsensitive(content, t) > 0,
                          {{toks:Array(String)}})) AS hits
            FROM doc_chunks
            WHERE {' AND '.join(conds)}
            ORDER BY hits DESC
            LIMIT {{topn:UInt32}}
            """,
            parameters=params,
        ).result_rows
        return [self._row(r) | {"hits": r[7]} for r in rows]

    @staticmethod
    def _row(r) -> Dict:
        return {
            "chunk_id": r[0], "site_id": r[1], "protocol": r[2], "heading": r[3],
            "content": r[4], "source_file": r[5], "node_id": r[6],
        }

    @staticmethod
    def _rrf(*ranked_lists: List[Dict]) -> List[Dict]:
        scores: Dict[str, float] = {}
        keep: Dict[str, Dict] = {}
        for lst in ranked_lists:
            for rank, item in enumerate(lst):
                cid = item["chunk_id"]
                scores[cid] = scores.get(cid, 0.0) + 1.0 / (RRF_K + rank + 1)
                keep.setdefault(cid, item)
        fused = [keep[c] | {"score": s} for c, s in scores.items()]
        fused.sort(key=lambda x: x["score"], reverse=True)
        return fused

    def _expand(self, seed_node_ids: List[str]) -> List[Dict]:
        if not seed_node_ids:
            return []
        rows = self.client.query(
            """
            SELECT c.heading, c.content, c.protocol, c.site_id, e.relation, c.chunk_id
            FROM kg_edges e
            INNER JOIN doc_chunks c ON c.node_id = e.dst
            WHERE e.src IN {seeds:Array(String)}
              AND e.relation IN ('next_step', 'mentions')
            LIMIT {lim:UInt32}
            """,
            parameters={"seeds": seed_node_ids, "lim": EXPAND_LIMIT},
        ).result_rows
        return [
            {"heading": r[0], "content": r[1], "protocol": r[2], "site_id": r[3],
             "relation": r[4], "chunk_id": r[5]}
            for r in rows
        ]

    # ---------------------------------------------------------------- query
    def retrieve(self, query_text: str, site_id: Optional[str] = None) -> Optional[Dict]:
        """The 'Retr KG' entrypoint. Returns structured enablement context, or
        None if disabled / no hits (so caller can fall back)."""
        if not self.enabled:
            return None
        try:
            qvec = self.embedder.embed_one(query_text)
            toks = tokenize(query_text)

            vec_hits = self._vector_search(qvec, site_id)
            kw_hits = self._keyword_search(toks, site_id)
            seeds = self._rrf(vec_hits, kw_hits)[:FINAL_SEEDS]
            if not seeds:
                return None

            neighbours = self._expand([s["node_id"] for s in seeds])

            # Assemble an ordered journey from the best-matching protocol
            top_proto = seeds[0]["protocol"]
            journey_rows = self.client.query(
                """
                SELECT heading, content, chunk_id
                FROM doc_chunks
                WHERE protocol = {proto:String}
                ORDER BY `order` ASC
                LIMIT 12
                """,
                parameters={"proto": top_proto},
            ).result_rows
            journey = [
                {"step": i + 1, "heading": r[0], "detail": r[1], "chunk_id": r[2]}
                for i, r in enumerate(journey_rows)
            ]

            answer = self._synthesize(query_text, seeds, journey)
            return {
                "answer": answer,
                "site_id": seeds[0]["site_id"],
                "protocol": top_proto,
                "seeds": seeds,
                "journey": journey,
                "graph_context": neighbours,
            }
        except Exception as e:
            logger.error("ClickHouse retrieve failed: %s", e)
            return None

    def stats(self) -> Dict:
        """Knowledge-size snapshot — useful to watch the memory grow as it learns."""
        if not self.enabled:
            return {"enabled": False}

        def count(table: str) -> int:
            try:
                return self.client.query(f"SELECT count() FROM {table}").result_rows[0][0]
            except Exception:
                return 0

        by_site = []
        try:
            rows = self.client.query(
                "SELECT site_id, count() FROM doc_chunks GROUP BY site_id ORDER BY count() DESC"
            ).result_rows
            by_site = [{"site_id": r[0], "chunks": r[1]} for r in rows]
        except Exception:
            pass
        return {
            "enabled": True,
            "chunks": count("doc_chunks"),
            "nodes": count("kg_nodes"),
            "edges": count("kg_edges"),
            "by_site": by_site,
        }

    @staticmethod
    def _synthesize(query: str, seeds: List[Dict], journey: List[Dict]) -> str:
        lines = [f"Enablement context for: {query}", ""]
        if journey:
            lines.append(f"Recommended path ({seeds[0]['site_id']} · {seeds[0]['protocol']}):")
            for step in journey[:8]:
                lines.append(f"  {step['step']}. {step['heading']}")
        else:
            for s in seeds[:3]:
                lines.append(f"- {s['heading']}")
        cites = sorted({s["source_file"] for s in seeds})
        lines.append("")
        lines.append("Sources: " + ", ".join(os.path.basename(c) for c in cites))
        return "\n".join(lines)
