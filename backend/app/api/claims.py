"""Claims REST API endpoints for AsOf."""

import time
from typing import Any, Dict, List, Optional, Union
from fastapi import APIRouter, HTTPException, Query
from backend.app.api.graph_serializer import build_claim_graph_payload
from backend.app.api.models import (
    AsOfResponse,
    ClaimDetailResponse,
    ClaimListResponse,
    ClaimSummary,
    DecideRequest,
    FlagRequest,
    QueryLogItem,
    ReplayResponse,
)
from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, parse_timestamp, to_iso
from backend.app.queries.coverage import resolve_coverage_as_of
from backend.app.queries.decision import decide_claim, replay_decision
from backend.app.queries.policy import get_policy_as_of

router = APIRouter(prefix="/claims", tags=["Claims"])


@router.get("", response_model=ClaimListResponse)
def list_claims(
    limit: int = Query(50, ge=1, le=200),
    skip: int = Query(0, ge=0),
    status: Optional[str] = None,
    claim_type: Optional[str] = None,
):
    """Retrieve claims with linked policy and policyholder metadata."""
    g = get_graph()
    queries_log: List[QueryLogItem] = []

    count_cypher = """
    MATCH (c:Claim)
    WHERE ($status IS NULL OR c.status = $status)
      AND ($claim_type IS NULL OR c.claim_type = $claim_type)
    RETURN count(c)
    """
    count_params = {"status": status, "claim_type": claim_type}
    count_res = g.query(count_cypher, params=count_params)
    total = count_res.result_set[0][0] if count_res.result_set else 0

    queries_log.append(
        QueryLogItem(
            name="count_claims",
            cypher=count_cypher.strip(),
            parameters=count_params,
            description="Count total claims matching filter criteria",
        )
    )

    list_cypher = """
    MATCH (c:Claim)-[:FILED_AGAINST]->(p:Policy)<-[:HAS_POLICY]-(ph:Policyholder)
    OPTIONAL MATCH (d:Decision)-[:DECIDES]->(c)
    WHERE ($status IS NULL OR c.status = $status)
      AND ($claim_type IS NULL OR c.claim_type = $claim_type)
    RETURN c.id, c.claim_number, c.incident_date, c.filing_date, c.claim_type,
           c.amount, c.description, c.status, c.valid_from, c.sys_from,
           p.id, p.policy_number, ph.id, ph.name, d.outcome
    ORDER BY c.sys_from DESC
    SKIP $skip LIMIT $limit
    """
    list_params = {
        "status": status,
        "claim_type": claim_type,
        "skip": skip,
        "limit": limit,
    }
    list_res = g.query(list_cypher, params=list_params)

    queries_log.append(
        QueryLogItem(
            name="list_claims",
            cypher=list_cypher.strip(),
            parameters=list_params,
            description="Retrieve paginated claims with policy and decision metadata",
        )
    )

    claims: List[ClaimSummary] = []
    if list_res.result_set:
        for row in list_res.result_set:
            (
                c_id, c_num, inc_date, file_date, c_type, amt, desc, c_status,
                v_from, s_from, p_id, p_num, ph_id, ph_name, d_outcome
            ) = row
            claims.append(
                ClaimSummary(
                    id=c_id,
                    claim_number=c_num,
                    incident_date=inc_date,
                    filing_date=file_date,
                    claim_type=c_type,
                    amount=amt,
                    description=desc,
                    status=c_status,
                    valid_from=v_from,
                    valid_from_iso=to_iso(v_from) if v_from else None,
                    sys_from=s_from,
                    sys_from_iso=to_iso(s_from) if s_from else None,
                    policy_id=p_id,
                    policy_number=p_num,
                    policyholder_id=ph_id,
                    policyholder_name=ph_name,
                    latest_decision_outcome=d_outcome,
                )
            )

    return ClaimListResponse(total=total, claims=claims, queries=queries_log)


@router.get("/{claim_id}", response_model=ClaimDetailResponse)
def get_claim(claim_id: str):
    """Retrieve full claim detail, linked entities, and UI graph representation."""
    g = get_graph()
    queries_log: List[QueryLogItem] = []

    detail_cypher = """
    MATCH (c:Claim {id: $claim_id})
    OPTIONAL MATCH (c)-[:FILED_AGAINST]->(p:Policy)<-[:HAS_POLICY]-(ph:Policyholder)
    OPTIONAL MATCH (c)-[:HANDLED_BY]->(pr:Provider)
    OPTIONAL MATCH (c)-[:REPAIRED_AT]->(s:Shop)
    OPTIONAL MATCH (d:Decision)-[:DECIDES]->(c)
    OPTIONAL MATCH (rf:ReviewFlag)-[:FLAGS]->(c)
    RETURN c, p, ph, pr, s, d, collect(distinct rf)
    """
    params = {"claim_id": claim_id}
    res = g.query(detail_cypher, params=params)

    queries_log.append(
        QueryLogItem(
            name="get_claim_detail",
            cypher=detail_cypher.strip(),
            parameters=params,
            description="Retrieve claim, linked policy, policyholder, service entities, and review flags",
        )
    )

    if not res.result_set:
        raise HTTPException(status_code=404, detail=f"Claim '{claim_id}' not found")

    row = res.result_set[0]
    c_raw, p_raw, ph_raw, pr_raw, s_raw, d_raw, rf_raw_list = row

    claim_props = dict(c_raw.properties) if hasattr(c_raw, "properties") else dict(c_raw)
    policy_props = dict(p_raw.properties) if p_raw and hasattr(p_raw, "properties") else (dict(p_raw) if p_raw else None)
    ph_props = dict(ph_raw.properties) if ph_raw and hasattr(ph_raw, "properties") else (dict(ph_raw) if ph_raw else None)
    pr_props = dict(pr_raw.properties) if pr_raw and hasattr(pr_raw, "properties") else (dict(pr_raw) if pr_raw else None)
    s_props = dict(s_raw.properties) if s_raw and hasattr(s_raw, "properties") else (dict(s_raw) if s_raw else None)
    d_props = dict(d_raw.properties) if d_raw and hasattr(d_raw, "properties") else (dict(d_raw) if d_raw else None)

    flags = []
    if rf_raw_list:
        for rf in rf_raw_list:
            if rf:
                flags.append(dict(rf.properties) if hasattr(rf, "properties") else dict(rf))

    graph = build_claim_graph_payload(claim_id=claim_id)

    return ClaimDetailResponse(
        claim=claim_props,
        policy=policy_props,
        policyholder=ph_props,
        provider=pr_props,
        shop=s_props,
        decision=d_props,
        flags=flags,
        graph=graph,
        queries=queries_log,
    )


@router.get("/{claim_id}/as-of", response_model=AsOfResponse)
def get_claim_as_of(
    claim_id: str,
    tv: Optional[Union[int, str]] = Query(None, description="Valid time (incident date) epoch-ms or ISO-8601"),
    ts: Optional[Union[int, str]] = Query(None, description="System knowledge time epoch-ms or ISO-8601"),
):
    """Evaluate claim coverage and deterministic decision as-of valid time tv and system time ts.
    
    Returns UI-shaped graph with 'known' vs 'not_yet_known' states relative to ts,
    plus complete log of executed Cypher queries for the UI 'View Query' modal.
    """
    g = get_graph()
    queries_log: List[QueryLogItem] = []

    # 1. Resolve tv and ts parameters
    parsed_tv = parse_timestamp(tv) if tv is not None else None
    parsed_ts = parse_timestamp(ts) if ts is not None else SENTINEL_MAX

    if parsed_tv is None:
        chk_res = g.query("MATCH (c:Claim {id: $id}) RETURN c.valid_from, c.sys_from", params={"id": claim_id})
        if not chk_res.result_set:
            raise HTTPException(status_code=404, detail=f"Claim '{claim_id}' not found")
        parsed_tv = chk_res.result_set[0][0]

    # 2. Coverage resolution as-of (tv, ts)
    cov_result = resolve_coverage_as_of(claim_id, tv=parsed_tv, ts=parsed_ts)
    queries_log.append(
        QueryLogItem(
            name="resolve_coverage_as_of",
            cypher="""
            MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
            MATCH (p)-[a:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
            WHERE a.valid_from <= $tv AND $tv < a.valid_to
              AND a.sys_from   <= $ts AND $ts < a.sys_to
              AND e.valid_from <= $tv AND $tv < e.valid_to
              AND e.sys_from   <= $ts AND $ts < e.sys_to
              AND ad.valid_from <= $tv AND $tv < ad.valid_to
              AND ad.sys_from   <= $ts AND $ts < ad.sys_to
              AND cov.valid_from <= $tv AND $tv < cov.valid_to
              AND cov.sys_from   <= $ts AND $ts < cov.sys_to
              AND cov.category = c.claim_type
            RETURN cov.id, cov.name, cov.limit, cov.deductible, e.id
            """.strip(),
            parameters={"claim_id": claim_id, "tv": parsed_tv, "ts": parsed_ts},
            description="Find coverage effective at incident time tv known to system at time ts",
        )
    )

    # 3. Decision execution as-of (tv, ts)
    dec_result = decide_claim(claim_id, tv=parsed_tv, ts=parsed_ts)
    queries_log.append(
        QueryLogItem(
            name="decide_claim",
            cypher="""
            MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
            WHERE c.sys_from <= $ts AND $ts < c.sys_to
            RETURN c.id, c.claim_type, c.amount, p.id, p.deductible, p.coverage_limit
            """.strip(),
            parameters={"claim_id": claim_id, "tv": parsed_tv, "ts": parsed_ts},
            description="Evaluate claim decision logic against coverage, deductible, limits, and fraud",
        )
    )

    # 4. Policy state as-of (tv, ts)
    pol_chk = g.query("MATCH (c:Claim {id: $id})-[:FILED_AGAINST]->(p:Policy) RETURN p.id", params={"id": claim_id})
    policy_state = None
    if pol_chk.result_set:
        policy_id = pol_chk.result_set[0][0]
        policy_state = get_policy_as_of(policy_id, tv=parsed_tv, ts=parsed_ts)
        queries_log.append(
            QueryLogItem(
                name="get_policy_as_of",
                cypher="""
                MATCH (p:Policy {id: $policy_id})
                OPTIONAL MATCH (p)-[ab:AMENDED_BY]->(e:Endorsement)
                WHERE (ab IS NULL OR (ab.valid_from <= $tv AND $tv < ab.valid_to AND ab.sys_from <= $ts AND $ts < ab.sys_to))
                RETURN p, collect(distinct e)
                """.strip(),
                parameters={"policy_id": policy_id, "tv": parsed_tv, "ts": parsed_ts},
                description="Retrieve policy and endorsement revisions active at (tv, ts)",
            )
        )

    # 5. Build UI graph payload with temporal states ('known' vs 'not_yet_known')
    evidence_path = dec_result.get("evidence_path") or cov_result.get("evidence_path") or []
    graph = build_claim_graph_payload(claim_id=claim_id, ts=parsed_ts, evidence_path=evidence_path)

    return AsOfResponse(
        claim_id=claim_id,
        as_of={
            "tv": parsed_tv,
            "tv_iso": to_iso(parsed_tv),
            "ts": parsed_ts,
            "ts_iso": to_iso(parsed_ts),
        },
        known_at_ts=dec_result.get("known_at_ts", True),
        decision=dec_result,
        coverage=cov_result,
        policy=policy_state,
        graph=graph,
        queries=queries_log,
    )


@router.get("/{claim_id}/replay", response_model=ReplayResponse)
def replay_claim_decision(
    claim_id: str,
    current_ts: Optional[Union[int, str]] = Query(None, description="System replay time epoch-ms or ISO-8601"),
    decision_ts: Optional[Union[int, str]] = Query(None, description="Historical decision time epoch-ms or ISO-8601"),
):
    """Replay a past claim decision against current knowledge to uncover late-arriving facts and outcome flips."""
    queries_log: List[QueryLogItem] = []
    parsed_curr_ts = parse_timestamp(current_ts) if current_ts is not None else None
    parsed_dec_ts = parse_timestamp(decision_ts) if decision_ts is not None else None

    replay_res = replay_decision(claim_id, current_ts=parsed_curr_ts, decision_ts=parsed_dec_ts)
    if "error" in replay_res:
        raise HTTPException(status_code=404, detail=replay_res["error"])

    queries_log.append(
        QueryLogItem(
            name="replay_decision_diff",
            cypher="""
            MATCH (d:Decision)-[:DECIDES]->(c:Claim {id: $claim_id})
            RETURN d.outcome, d.sys_from, c.valid_from
            """.strip(),
            parameters={"claim_id": claim_id},
            description="Find historical decision record and incident time",
        )
    )
    queries_log.append(
        QueryLogItem(
            name="find_late_facts",
            cypher="""
            MATCH (c:Claim {id: $claim_id})-[:FILED_AGAINST]->(p:Policy)
            MATCH (p)-[ab:AMENDED_BY]->(e:Endorsement)-[ad:ADDS]->(cov:Coverage)
            WHERE ab.valid_from <= $incident_ts AND $incident_ts < ab.valid_to
              AND ab.sys_from   > $decision_ts
              AND $decision_ts  < ab.sys_to
            RETURN e.id, cov.id, ab.sys_from
            """.strip(),
            parameters={
                "claim_id": claim_id,
                "incident_ts": replay_res.get("incident_ts"),
                "decision_ts": replay_res["decision_as_made"].get("decision_ts"),
            },
            description="Retrieve retroactive endorsements recorded after decision timestamp",
        )
    )

    # Build UI graph showing known facts and late-arriving facts
    eval_ts = replay_res["decision_as_now_known"].get("replay_ts") or SENTINEL_MAX
    evidence_path = replay_res["decision_as_now_known"].get("evidence_path", [])
    graph = build_claim_graph_payload(claim_id=claim_id, ts=eval_ts, evidence_path=evidence_path)

    return ReplayResponse(
        claim_id=claim_id,
        outcome_changed=replay_res["outcome_changed"],
        decision_as_made=replay_res["decision_as_made"],
        decision_as_now_known=replay_res["decision_as_now_known"],
        late_facts=replay_res["late_facts"],
        graph=graph,
        queries=queries_log,
    )


@router.post("/{claim_id}/decide")
def post_decide_claim(claim_id: str, payload: DecideRequest):
    """Execute deterministic claim decision and optionally persist Decision node in FalkorDB."""
    g = get_graph()
    queries_log: List[QueryLogItem] = []

    parsed_tv = parse_timestamp(payload.tv) if payload.tv is not None else None
    parsed_ts = parse_timestamp(payload.ts) if payload.ts is not None else None

    # Retrieve incident time if tv is omitted
    if parsed_tv is None:
        chk_res = g.query("MATCH (c:Claim {id: $id}) RETURN c.valid_from", params={"id": claim_id})
        if not chk_res.result_set:
            raise HTTPException(status_code=404, detail=f"Claim '{claim_id}' not found")
        parsed_tv = chk_res.result_set[0][0]

    dec = decide_claim(claim_id, tv=parsed_tv, ts=parsed_ts)

    queries_log.append(
        QueryLogItem(
            name="decide_claim",
            cypher="Bi-temporal decision resolution query evaluating policy, endorsement, and deductible rules",
            parameters={"claim_id": claim_id, "tv": parsed_tv, "ts": parsed_ts},
        )
    )

    persisted = False
    decision_id = None
    if not payload.dry_run:
        now_ts = int(time.time() * 1000)
        eff_ts = parsed_ts or now_ts
        decision_id = f"DEC-{claim_id}-{int(eff_ts / 1000)}"

        save_cypher = """
        CREATE (d:Decision {
            id: $dec_id,
            outcome: $outcome,
            reasons: $reasons,
            rule_applied: $rule_applied,
            valid_from: $tv,
            valid_to: $sent,
            sys_from: $ts,
            sys_to: $sent,
            is_synthetic: true
        })
        WITH d
        MATCH (c:Claim {id: $claim_id})
        SET c.status = toLower($outcome)
        CREATE (d)-[:DECIDES {
            valid_from: $tv,
            valid_to: $sent,
            sys_from: $ts,
            sys_to: $sent
        }]->(c)
        RETURN d.id
        """
        save_params = {
            "dec_id": decision_id,
            "outcome": dec["outcome"],
            "reasons": dec["reasons"],
            "rule_applied": dec["rule_applied"],
            "tv": parsed_tv,
            "ts": eff_ts,
            "sent": SENTINEL_MAX,
            "claim_id": claim_id,
        }
        g.query(save_cypher, params=save_params)
        persisted = True
        queries_log.append(
            QueryLogItem(
                name="persist_decision",
                cypher=save_cypher.strip(),
                parameters=save_params,
                description="Persist Decision node and link with DECIDES edge",
            )
        )

    graph = build_claim_graph_payload(
        claim_id=claim_id,
        ts=parsed_ts,
        evidence_path=dec.get("evidence_path", []),
    )

    return {
        "claim_id": claim_id,
        "persisted": persisted,
        "decision_id": decision_id,
        "decision": dec,
        "graph": graph,
        "queries": queries_log,
    }


@router.post("/{claim_id}/flag")
def flag_claim_for_review(claim_id: str, payload: FlagRequest):
    """Attach a ReviewFlag node to the claim in FalkorDB and update status to 'flagged'."""
    g = get_graph()
    now_ts = int(time.time() * 1000)
    flag_ts = parse_timestamp(payload.ts) if payload.ts is not None else now_ts
    flag_id = f"FLAG-{claim_id}-{int(flag_ts / 1000)}"

    chk = g.query("MATCH (c:Claim {id: $id}) RETURN c.valid_from", params={"id": claim_id})
    if not chk.result_set:
        raise HTTPException(status_code=404, detail=f"Claim '{claim_id}' not found")
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
    RETURN rf.id, rf.reason, rf.flag_type, rf.sys_from
    """
    params = {
        "claim_id": claim_id,
        "flag_id": flag_id,
        "reason": payload.reason,
        "flag_type": payload.flag_type,
        "v_from": valid_from,
        "s_from": flag_ts,
        "sent": SENTINEL_MAX,
    }
    res = g.query(flag_cypher, params=params)

    query_log = QueryLogItem(
        name="flag_claim_for_review",
        cypher=flag_cypher.strip(),
        parameters=params,
        description="Create ReviewFlag node, link via FLAGS edge, and set Claim status to flagged",
    )

    return {
        "success": True,
        "claim_id": claim_id,
        "flag_id": flag_id,
        "reason": payload.reason,
        "flag_type": payload.flag_type,
        "sys_from": flag_ts,
        "sys_from_iso": to_iso(flag_ts),
        "queries": [query_log],
    }
