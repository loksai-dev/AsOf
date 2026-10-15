"""Pydantic schemas and models for AsOf REST API."""

from typing import Any, Dict, List, Optional, Union
from pydantic import BaseModel, Field


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    state: str = Field(description="'known', 'not_yet_known', or 'superseded' relative to ts")
    name: Optional[str] = None
    title: Optional[str] = None
    amount: Optional[float] = None
    status: Optional[str] = None
    sys_from: Optional[int] = None
    sys_from_iso: Optional[str] = None
    sys_to: Optional[int] = None
    valid_from: Optional[int] = None
    valid_from_iso: Optional[str] = None
    valid_to: Optional[int] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str
    state: str = Field(description="'known', 'not_yet_known', or 'superseded' relative to ts")
    sys_from: Optional[int] = None
    sys_to: Optional[int] = None
    valid_from: Optional[int] = None
    valid_to: Optional[int] = None
    properties: Dict[str, Any] = Field(default_factory=dict)


class PathElement(BaseModel):
    id: Optional[str] = None
    label: Optional[str] = None
    type: Optional[str] = None
    name: Optional[str] = None
    description: Optional[str] = None
    status: Optional[str] = None


class GraphPayload(BaseModel):
    nodes: List[GraphNode] = Field(default_factory=list)
    edges: List[GraphEdge] = Field(default_factory=list)
    path: List[PathElement] = Field(default_factory=list)


class QueryLogItem(BaseModel):
    name: str
    cypher: str
    parameters: Dict[str, Any] = Field(default_factory=dict)
    description: Optional[str] = None


class ClaimSummary(BaseModel):
    id: str
    claim_number: str
    incident_date: Optional[str] = None
    filing_date: Optional[str] = None
    claim_type: str
    amount: float
    description: Optional[str] = None
    status: str
    valid_from: int
    valid_from_iso: Optional[str] = None
    sys_from: int
    sys_from_iso: Optional[str] = None
    policy_id: Optional[str] = None
    policy_number: Optional[str] = None
    policyholder_id: Optional[str] = None
    policyholder_name: Optional[str] = None
    latest_decision_outcome: Optional[str] = None


class ClaimListResponse(BaseModel):
    total: int
    claims: List[ClaimSummary]
    queries: List[QueryLogItem] = Field(default_factory=list)


class ClaimDetailResponse(BaseModel):
    claim: Dict[str, Any]
    policy: Optional[Dict[str, Any]] = None
    policyholder: Optional[Dict[str, Any]] = None
    provider: Optional[Dict[str, Any]] = None
    shop: Optional[Dict[str, Any]] = None
    decision: Optional[Dict[str, Any]] = None
    flags: List[Dict[str, Any]] = Field(default_factory=list)
    graph: GraphPayload
    queries: List[QueryLogItem] = Field(default_factory=list)


class AsOfResponse(BaseModel):
    claim_id: str
    as_of: Dict[str, Any]
    known_at_ts: bool
    decision: Dict[str, Any]
    coverage: Dict[str, Any]
    policy: Optional[Dict[str, Any]] = None
    graph: GraphPayload
    queries: List[QueryLogItem] = Field(default_factory=list)


class ReplayResponse(BaseModel):
    claim_id: str
    outcome_changed: bool
    decision_as_made: Dict[str, Any]
    decision_as_now_known: Dict[str, Any]
    late_facts: List[Dict[str, Any]]
    graph: GraphPayload
    queries: List[QueryLogItem] = Field(default_factory=list)


class DecideRequest(BaseModel):
    tv: Optional[Union[int, str]] = None
    ts: Optional[Union[int, str]] = None
    dry_run: bool = True


class FlagRequest(BaseModel):
    reason: str
    flag_type: str = "MANUAL_REVIEW"
    ts: Optional[Union[int, str]] = None


class ClusterSummary(BaseModel):
    cluster_id: str
    canonical_root_id: Optional[str] = None
    is_suspicious: bool
    algorithm: str
    evaluated_as_of_ts: Optional[int] = None
    evaluated_as_of_iso: Optional[str] = None
    total_entities: int
    total_providers: int
    total_shops: int
    total_claims: int
    total_billed_amount: float
    providers: List[Dict[str, Any]]
    shops: List[Dict[str, Any]]
    claims: List[Dict[str, Any]]
    graph: Optional[GraphPayload] = None


class ClusterListResponse(BaseModel):
    total_clusters: int
    suspicious_clusters: int
    evaluated_as_of_ts: Optional[int] = None
    evaluated_as_of_iso: Optional[str] = None
    clusters: List[ClusterSummary]
    queries: List[QueryLogItem] = Field(default_factory=list)
