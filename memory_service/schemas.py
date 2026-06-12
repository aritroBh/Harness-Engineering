from pydantic import BaseModel, Field
from typing import List, Optional, Any, Dict

class IngestRequest(BaseModel):
    files: List[str] = Field(default_factory=list)

class QueryRequest(BaseModel):
    query: str

class LintRequest(BaseModel):
    pass

class BaseResponse(BaseModel):
    ok: bool
    mode: str = Field(description="clickhouse|cognee|fallback")
    warnings: List[str] = Field(default_factory=list)

class IngestResponse(BaseResponse):
    sources_ingested: int

class SourceItem(BaseModel):
    id: str
    title: str
    content: str
    score: float = 1.0

class JourneyStep(BaseModel):
    step: int
    heading: str
    detail: str
    chunk_id: Optional[str] = None

class GraphContextItem(BaseModel):
    heading: str
    content: str
    relation: str
    site_id: Optional[str] = None
    protocol: Optional[str] = None
    chunk_id: Optional[str] = None

class QueryResponse(BaseResponse):
    answer: str
    sources: List[SourceItem] = Field(default_factory=list)
    # Structured enablement context for Harvey/Specter (Retr KG output)
    site_id: Optional[str] = None
    protocol: Optional[str] = None
    journey: List[JourneyStep] = Field(default_factory=list)
    graph_context: List[GraphContextItem] = Field(default_factory=list)

class LintIssue(BaseModel):
    rule: str
    message: str
    severity: str = "error"
    file: Optional[str] = None

class LintResponse(BaseResponse):
    issues: List[LintIssue] = Field(default_factory=list)
