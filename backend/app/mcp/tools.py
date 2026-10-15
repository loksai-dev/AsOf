"""MCP Tools for AsOf Claims Decision Agent.

Exposes graph reasoning operations to the LLM agent and external MCP clients.
Crucial Rule: Tools do NOT accept time parameters from the model.
All temporal coordinates (tv, ts) are injected strictly via TemporalContext.
"""

import time
from typing import Any, Dict, List, Optional
from backend.app.agent.temporal_firewall import assert_firewall_integrity, get_temporal_context
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso
from backend.app.queries.coverage import resolve_coverage_as_of
from backend.app.queries.decision import decide_claim as query_decide_claim
from backend.app.queries.decision import replay_decision as query_replay_decision
from backend.app.queries.fraud import detect_provider_clusters as query_detect_provider_clusters
from backend.app.queries.late_facts import find_late_facts as query_find_late_facts
from backend.app.queries.policy import get_policy_as_of as query_get_policy_as_of


def get_policy_as_of(policy_id: str) -> Dict[str, Any]:
    """Retrieve policy terms, active deductible, limits, and endorsements as-of the current temporal context.
    
    Args:
        policy_id: Unique policy identifier (e.g. 'POL-HERO-001').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    res = query_get_policy_as_of(policy_id, tv=ctx.tv, ts=ctx.ts)
    if not res:
        return {"error": f"Policy '{policy_id}' not found or inactive at context coordinates"}
    return res


def trace_coverage_path(claim_id: str) -> Dict[str, Any]:
    """Traverse graph from Claim to Coverage via Policy and Endorsements as-of the current temporal context.
    
    Args:
        claim_id: Unique claim identifier (e.g. 'CLM-HERO-001').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    return resolve_coverage_as_of(claim_id, tv=ctx.tv, ts=ctx.ts)


def find_late_facts(claim_id: str) -> List[Dict[str, Any]]:
    """Discover facts that were effective at the incident date but recorded after the decision timestamp.
    
    Args:
        claim_id: Unique claim identifier (e.g. 'CLM-HERO-001').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    return query_find_late_facts(claim_id, decision_ts=ctx.ts)


def detect_provider_clusters(min_claims: int = 4) -> List[Dict[str, Any]]:
    """Detect suspicious connected provider-shop clusters sharing claims as-of the current temporal context.
    
    Args:
        min_claims: Minimum number of shared claims across connected clinics and repair shops (default: 4).
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    return query_detect_provider_clusters(min_claims=min_claims, ts=ctx.ts)


def decide_claim(claim_id: str) -> Dict[str, Any]:
    """Execute deterministic claim decision rule against coverage, limits, and fraud indicators.
    
    Args:
        claim_id: Unique claim identifier (e.g. 'CLM-HERO-001').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    return query_decide_claim(claim_id, tv=ctx.tv, ts=ctx.ts)


def replay_decision(claim_id: str) -> Dict[str, Any]:
    """Replay historical decision against current system knowledge to determine if retroactive facts flip the verdict.
    
    Args:
        claim_id: Unique claim identifier (e.g. 'CLM-HERO-001').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    return query_replay_decision(claim_id, current_ts=ctx.ts)


def flag_for_review(
    claim_id: str,
    reason: str,
    flag_type: str = "MANUAL_REVIEW",
) -> Dict[str, Any]:
    """Attach a ReviewFlag node to a claim in the graph database and mark its status as flagged.
    
    Args:
        claim_id: Unique claim identifier to flag.
        reason: Explanation justifying adjuster escalation or fraud review.
        flag_type: Category of flag ('FRAUD_CLUSTER', 'LATE_FACTS_REVIEW', 'MANUAL_REVIEW').
    """
    assert_firewall_integrity()
    ctx = get_temporal_context()
    g = get_graph()

    now_ts = ctx.ts if ctx.ts < SENTINEL_MAX else int(time.time() * 1000)
    flag_id = f"FLAG-{claim_id}-{int(now_ts / 1000)}"

    chk = g.query("MATCH (c:Claim {id: $id}) RETURN c.valid_from", params={"id": claim_id})
    if not chk.result_set:
        return {"error": f"Claim '{claim_id}' not found"}
    valid_from = chk.result_set[0][0]

    flag_cypher = """
    MATCH (c:Claim {id: $claim_id})
    SET c.status = 'flagged'
    CREATE (rf:ReviewFlag {
        id: $flag_id,
        reason: $reason,
        flag_type: $flag_type,
        valid_from: $v_from,
        valid_to: $sent,
        sys_from: $s_from,
        sys_to: $sent,
        is_synthetic: true
    })
    CREATE (rf)-[:FLAGS {
        valid_from: $v_from,
        valid_to: $sent,
        sys_from: $s_from,
        sys_to: $sent
    }]->(c)
    RETURN rf.id
    """
    params = {
        "claim_id": claim_id,
        "flag_id": flag_id,
        "reason": reason,
        "flag_type": flag_type,
        "v_from": valid_from,
        "s_from": now_ts,
        "sent": SENTINEL_MAX,
    }
    g.query(flag_cypher, params=params)

    return {
        "success": True,
        "flag_id": flag_id,
        "claim_id": claim_id,
        "status": "flagged",
        "reason": reason,
        "flag_type": flag_type,
        "sys_from": now_ts,
        "sys_from_iso": to_iso(now_ts),
    }


# Export list of available tool definitions for registration
TOOL_REGISTRY = {
    "get_policy_as_of": get_policy_as_of,
    "trace_coverage_path": trace_coverage_path,
    "find_late_facts": find_late_facts,
    "detect_provider_clusters": detect_provider_clusters,
    "decide_claim": decide_claim,
    "replay_decision": replay_decision,
    "flag_for_review": flag_for_review,
}
