"""Fraud detection and provider/shop clusters API router for AsOf."""

from typing import List, Optional, Union
from fastapi import APIRouter, HTTPException, Query
from backend.app.api.graph_serializer import build_cluster_graph_payload
from backend.app.api.models import ClusterListResponse, ClusterSummary, QueryLogItem
from backend.app.db.temporal import SENTINEL_MAX, parse_timestamp, to_iso
from backend.app.queries.fraud import detect_provider_clusters, get_cluster_first_detectable

router = APIRouter(prefix="/fraud", tags=["Fraud"])


@router.get("/clusters", response_model=ClusterListResponse)
def get_fraud_clusters(
    ts: Optional[Union[int, str]] = Query(None, description="System knowledge time epoch-ms or ISO-8601"),
    min_claims: int = Query(4, ge=1, le=50, description="Minimum interconnected claims threshold"),
):
    """Detect suspicious provider-shop clusters sharing multiple claims as-of system time ts.
    
    Includes UI graph payloads and query logs for transparency.
    """
    parsed_ts = parse_timestamp(ts) if (ts is not None and isinstance(ts, (int, str))) else None
    target_ts = parsed_ts if parsed_ts is not None else SENTINEL_MAX

    clusters_raw = detect_provider_clusters(min_claims=min_claims, ts=parsed_ts)

    queries_log: List[QueryLogItem] = [
        QueryLogItem(
            name="detect_provider_clusters",
            cypher="""
            MATCH (c:Claim)
            WHERE c.sys_from <= $ts AND $ts < c.sys_to
            MATCH (c)-[:HANDLED_BY|REPAIRED_AT*0..6]-(other:Claim)
            WHERE other.sys_from <= $ts AND $ts < other.sys_to
            MATCH (other)-[hb:HANDLED_BY]->(pr:Provider)
            MATCH (other)-[ra:REPAIRED_AT]->(s:Shop)
            WHERE hb.sys_from <= $ts AND $ts < hb.sys_to
              AND ra.sys_from <= $ts AND $ts < ra.sys_to
            WITH c, min(other.id) AS root,
                 collect(distinct other) AS claims,
                 collect(distinct pr) AS providers,
                 collect(distinct s) AS shops
            WHERE size(claims) >= $min_claims
            RETURN root, claims, providers, shops
            """.strip(),
            parameters={"ts": target_ts, "min_claims": min_claims},
            description="Multi-hop connected-component clustering in FalkorDB graph engine",
        )
    ]

    cluster_summaries: List[ClusterSummary] = []
    suspicious_count = 0

    for c in clusters_raw:
        if c.get("is_suspicious"):
            suspicious_count += 1

        graph_payload = build_cluster_graph_payload(c, ts=parsed_ts)

        cluster_summaries.append(
            ClusterSummary(
                cluster_id=str(c["cluster_id"]),
                canonical_root_id=str(c.get("canonical_root_id") or c.get("falkordb_component_id") or ""),
                is_suspicious=c.get("is_suspicious", False),
                algorithm=c.get("algorithm", "bitemporal_cypher_wcc"),
                evaluated_as_of_ts=c.get("evaluated_as_of_ts"),
                evaluated_as_of_iso=c.get("evaluated_as_of_iso"),
                total_entities=c.get("total_entities", 0),
                total_providers=c.get("total_providers", 0),
                total_shops=c.get("total_shops", 0),
                total_claims=c.get("total_claims", 0),
                total_billed_amount=c.get("total_billed_amount", 0.0),
                providers=c.get("providers", []),
                shops=c.get("shops", []),
                claims=c.get("claims", []),
                graph=graph_payload,
            )
        )

    return ClusterListResponse(
        total_clusters=len(cluster_summaries),
        suspicious_clusters=suspicious_count,
        evaluated_as_of_ts=parsed_ts,
        evaluated_as_of_iso=to_iso(parsed_ts) if parsed_ts else None,
        clusters=cluster_summaries,
        queries=queries_log,
    )


@router.get("/clusters/{cluster_id}/timing")
def get_cluster_timing(
    cluster_id: str,
    ts: Optional[Union[int, str]] = Query(None, description="System evaluation time epoch-ms or ISO-8601"),
):
    """Compute the earliest system time (ts) at which a cluster crossed the fraud detection threshold."""
    parsed_ts = parse_timestamp(ts) if ts is not None else None
    timing_res = get_cluster_first_detectable(cluster_or_id=cluster_id, ts=parsed_ts)

    if "error" in timing_res:
        raise HTTPException(status_code=404, detail=timing_res["error"])

    query_log = QueryLogItem(
        name="get_cluster_first_detectable",
        cypher="Evaluates claims progression in recording order to find timestamp when claims >= 5",
        parameters={"cluster_id": cluster_id, "ts": parsed_ts},
    )

    return {
        **timing_res,
        "queries": [query_log],
    }
