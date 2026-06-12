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
    mode: str = Field(description="cognee|fallback")
    warnings: List[str] = Field(default_factory=list)

class IngestResponse(BaseResponse):
    sources_ingested: int

class SourceItem(BaseModel):
    id: str
    title: str
    content: str
    score: float = 1.0

class QueryResponse(BaseResponse):
    answer: str
    sources: List[SourceItem] = Field(default_factory=list)

class LintIssue(BaseModel):
    rule: str
    message: str
    severity: str = "error"
    file: Optional[str] = None

class LintResponse(BaseResponse):
    issues: List[LintIssue] = Field(default_factory=list)
