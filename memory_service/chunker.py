"""Semantic chunking + lightweight knowledge-graph extraction for site.md docs.

A `site.md` is the enablement protocol a product publishes so Ross/Specter can
guide agents & humans. We split it by markdown headings (semantic sections,
not fixed token windows), then derive a small graph:

  nodes : one per document + one per section chunk
  edges : part_of    (section -> document)
          next_step  (section -> following section in same doc)
          mentions   (section -> another known site/sponsor it references)

This is GraphRAG-lite: real traversable structure without an LLM extraction
pass, so it is fast and deterministic for the demo. An optional LLM pass can
enrich `mentions` into typed relations later.
"""
import os
import re
import hashlib
from dataclasses import dataclass, field
from typing import List, Dict, Optional

_HEADING_RE = re.compile(r"^(#{1,6})\s+(.*)$")
_FRONTMATTER_RE = re.compile(r"^---\s*\n(.*?)\n---\s*\n", re.DOTALL)
_STOPWORDS = {
    "a", "an", "the", "and", "or", "but", "how", "do", "does", "did", "to", "of",
    "in", "on", "for", "with", "is", "are", "be", "you", "your", "this", "that",
    "it", "as", "at", "by", "from", "can", "will", "use", "using",
}


def _slug(text: str) -> str:
    s = re.sub(r"[^a-z0-9]+", "-", text.lower()).strip("-")
    return s or "section"


def _hash(*parts: str) -> str:
    return hashlib.sha1("::".join(parts).encode()).hexdigest()[:16]


def tokenize(text: str) -> List[str]:
    toks = re.split(r"[^a-zA-Z0-9]+", text.lower())
    out = []
    for t in toks:
        if not t or t in _STOPWORDS:
            continue
        if len(t) <= 2 and not t.isdigit():
            continue
        out.append(t)
    return out


@dataclass
class Chunk:
    chunk_id: str
    site_id: str
    protocol: str          # document slug (e.g. "render-deploy")
    section: str           # section slug
    heading: str
    content: str
    source_file: str
    order: int
    node_id: str
    tokens: List[str] = field(default_factory=list)
    embedding: List[float] = field(default_factory=list)


@dataclass
class Node:
    node_id: str
    site_id: str
    type: str              # "document" | "section"
    name: str
    summary: str
    source_file: str


@dataclass
class Edge:
    src: str
    dst: str
    relation: str          # part_of | next_step | mentions
    weight: float
    site_id: str


def _frontmatter(md: str) -> Dict[str, str]:
    m = _FRONTMATTER_RE.match(md)
    meta: Dict[str, str] = {}
    if m:
        for line in m.group(1).splitlines():
            if ":" in line:
                k, v = line.split(":", 1)
                meta[k.strip().lower()] = v.strip()
    return meta


def split_sections(md: str) -> List[Dict]:
    """Split markdown into sections at every heading. Preamble before the first
    heading becomes an 'overview' section."""
    sections: List[Dict] = []
    cur = {"heading": "Overview", "level": 1, "lines": []}
    for line in md.splitlines():
        m = _HEADING_RE.match(line)
        if m:
            if cur["lines"] and any(l.strip() for l in cur["lines"]):
                sections.append(cur)
            cur = {"heading": m.group(2).strip(), "level": len(m.group(1)), "lines": []}
        else:
            cur["lines"].append(line)
    if cur["lines"] and any(l.strip() for l in cur["lines"]):
        sections.append(cur)
    return sections


def chunk_site_md(
    path: str,
    content: str,
    site_id: Optional[str] = None,
    known_sites: Optional[List[str]] = None,
) -> Dict[str, List]:
    """Return {'chunks', 'nodes', 'edges'} for one site.md document."""
    meta = _frontmatter(content)
    fname = os.path.basename(path)
    protocol = _slug(meta.get("title") or os.path.splitext(fname)[0])
    site_id = site_id or meta.get("site") or meta.get("product") or protocol
    known_sites = [s.lower() for s in (known_sites or [])]

    doc_node = Node(
        node_id=_hash("doc", site_id, protocol),
        site_id=site_id,
        type="document",
        name=meta.get("title") or protocol,
        summary=content[:280],
        source_file=path,
    )

    chunks: List[Chunk] = []
    nodes: List[Node] = [doc_node]
    edges: List[Edge] = []

    body_md = _FRONTMATTER_RE.sub("", content, count=1)
    sections = split_sections(body_md)
    prev_node_id: Optional[str] = None
    for i, sec in enumerate(sections):
        body = "\n".join(sec["lines"]).strip()
        if not body:
            continue
        heading = sec["heading"]
        section_slug = _slug(heading)
        text = f"{heading}\n{body}"
        node_id = _hash(site_id, protocol, section_slug, str(i))
        chunk = Chunk(
            chunk_id=node_id,
            site_id=site_id,
            protocol=protocol,
            section=section_slug,
            heading=heading,
            content=text,
            source_file=path,
            order=i,
            node_id=node_id,
            tokens=tokenize(text),
        )
        chunks.append(chunk)
        nodes.append(Node(node_id, site_id, "section", heading, body[:280], path))

        # part_of : section -> document
        edges.append(Edge(node_id, doc_node.node_id, "part_of", 1.0, site_id))
        # next_step : previous section -> this section
        if prev_node_id:
            edges.append(Edge(prev_node_id, node_id, "next_step", 1.0, site_id))
        prev_node_id = node_id

        # mentions : references to another known site/sponsor
        low = text.lower()
        for other in known_sites:
            if other and other != site_id.lower() and other in low:
                edges.append(
                    Edge(node_id, _hash("doc", other, other), "mentions", 0.5, site_id)
                )

    return {"chunks": chunks, "nodes": nodes, "edges": edges}
