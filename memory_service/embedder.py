"""Pluggable embedding provider for the Ross retrieval layer.

Selects a provider via env `EMBED_PROVIDER`:
  - truefoundry : OpenAI-compatible gateway (base_url + key + model)   [sponsor]
  - voyage      : Voyage AI (Anthropic-recommended)                    [api key]
  - openai      : OpenAI embeddings
  - local       : fastembed / sentence-transformers (zero-key, offline)

TrueFoundry, Voyage and OpenAI all expose an OpenAI-style POST /embeddings
returning {"data": [{"embedding": [...], "index": n}, ...]}, so a single
httpx client handles all three — only base_url / model / auth differ.
"""
import os
import logging
from typing import List

import httpx

logger = logging.getLogger(__name__)

# Default endpoints per provider (base_url, default_model)
_PROVIDER_DEFAULTS = {
    "voyage":      ("https://api.voyageai.com/v1", "voyage-3"),
    "openai":      ("https://api.openai.com/v1", "text-embedding-3-small"),
    # TrueFoundry gateway base_url is workspace-specific -> must come from env.
    "truefoundry": (None, None),
}


class Embedder:
    def __init__(self):
        self.provider = os.getenv("EMBED_PROVIDER", "truefoundry").lower()
        self.api_key = (
            os.getenv("EMBED_API_KEY")
            or os.getenv("TRUEFOUNDRY_API_KEY")
            or os.getenv("VOYAGE_API_KEY")
            or os.getenv("OPENAI_API_KEY")
        )

        default_base, default_model = _PROVIDER_DEFAULTS.get(self.provider, (None, None))
        self.base_url = os.getenv("EMBED_BASE_URL", default_base or "")
        self.model = os.getenv("EMBED_MODEL", default_model or "")
        self.dim = int(os.getenv("EMBED_DIM", "0")) or None  # optional hint

        self._local_model = None
        self.enabled = True

        if self.provider == "local":
            self._init_local()
        else:
            if not self.base_url or not self.model:
                logger.warning(
                    "Embedder[%s] missing EMBED_BASE_URL / EMBED_MODEL. Disabled.",
                    self.provider,
                )
                self.enabled = False
            if not self.api_key:
                logger.warning("Embedder[%s] missing API key. Disabled.", self.provider)
                self.enabled = False

    def _init_local(self):
        try:
            from fastembed import TextEmbedding
            self._local_model = TextEmbedding(
                model_name=os.getenv("EMBED_MODEL", "BAAI/bge-small-en-v1.5")
            )
        except Exception as e:
            logger.warning("fastembed unavailable (%s). Embedder disabled.", e)
            self.enabled = False

    def embed(self, texts: List[str]) -> List[List[float]]:
        """Return one embedding vector per input text."""
        if not texts:
            return []
        if not self.enabled:
            raise RuntimeError(f"Embedder[{self.provider}] is not configured.")

        if self.provider == "local":
            return [list(map(float, v)) for v in self._local_model.embed(texts)]

        # OpenAI-compatible HTTP call (TrueFoundry / Voyage / OpenAI)
        url = f"{self.base_url.rstrip('/')}/embeddings"
        # A browser-like User-Agent is required: TrueFoundry's gateway sits behind
        # Cloudflare, which blocks default Python UAs with HTTP 403 (error 1010).
        headers = {
            "Authorization": f"Bearer {self.api_key}",
            "Content-Type": "application/json",
            "User-Agent": os.getenv(
                "EMBED_USER_AGENT",
                "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 "
                "(KHTML, like Gecko) Chrome/124.0 Safari/537.36",
            ),
        }
        payload = {"model": self.model, "input": texts}
        with httpx.Client(timeout=60) as client:
            resp = client.post(url, headers=headers, json=payload)
            resp.raise_for_status()
            data = resp.json()["data"]
        # Preserve input order
        data.sort(key=lambda d: d.get("index", 0))
        return [d["embedding"] for d in data]

    def embed_one(self, text: str) -> List[float]:
        return self.embed([text])[0]
