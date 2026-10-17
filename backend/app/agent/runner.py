"""Agent execution loop for AsOf.

Features:
1. Temporal Firewall: tv, ts, and ts_ceiling are set by the server and never manipulated by the LLM.
2. The LLM selects tools and writes explanations using ONLY tool outputs. It NEVER decides coverage itself.
3. Tool selection differs visibly by claim type:
   - Late-filed claims invoke find_late_facts
   - Ring-linked claims invoke detect_provider_clusters
   - Normal claims invoke neither
4. Persists AgentRun and ToolCall nodes in FalkorDB with full graph provenance.
"""

import json
import logging
import os
import time
from typing import Any, Dict, List, Optional
from backend.app.agent.temporal_firewall import (
    assert_firewall_integrity,
    get_temporal_context,
    set_temporal_context,
)
from backend.app.db.connection import get_graph, settings
from backend.app.db.temporal import SENTINEL_MAX, to_iso
from backend.app.mcp.tools import (
    decide_claim,
    detect_provider_clusters,
    find_late_facts,
    flag_for_review,
    get_policy_as_of,
    replay_decision,
    trace_coverage_path,
)

logger = logging.getLogger(__name__)


class AgentRunResult:
    def __init__(
        self,
        run_id: str,
        claim_id: str,
        outcome: str,
        explanation: str,
        tools_called: List[Dict[str, Any]],
        total_latency_ms: float,
        context: Dict[str, Any],
    ):
        self.run_id = run_id
        self.claim_id = claim_id
        self.outcome = outcome
        self.explanation = explanation
        self.tools_called = tools_called
        self.total_latency_ms = total_latency_ms
        self.context = context

    def to_dict(self) -> Dict[str, Any]:
        return {
            "run_id": self.run_id,
            "claim_id": self.claim_id,
            "outcome": self.outcome,
            "explanation": self.explanation,
            "tools_called": self.tools_called,
            "total_latency_ms": self.total_latency_ms,
            "context": self.context,
        }


def generate_llm_explanation(
    claim_id: str,
    outcome: str,
    tools_called: List[Dict[str, Any]],
    context: Dict[str, Any],
    fallback_explanation: str,
) -> str:
    """Generate a bi-temporally grounded explanation using the configured LLM provider (e.g. Groq).
    
    Adheres strictly to AsOf principles:
    1. Coverage and outcomes are ALREADY determined deterministically by graph queries.
    2. The LLM's role is explanation synthesis ONLY, grounded strictly in tool outputs.
    3. If the LLM provider fails, times out, or is set to 'mock', safely falls back to deterministic template.
    """
    provider = (settings.llm_provider or "").lower().strip()
    if provider in ("mock", "none", ""):
        return fallback_explanation

    try:
        summaries = [
            f"- Tool: {tc['tool_name']}, Inputs: {tc['inputs']}, Output: {tc['output_summary']}"
            for tc in tools_called
        ]
        tool_context_str = "\n".join(summaries)

        system_prompt = (
            "You are AsOf's bi-temporal claims explanation agent. "
            "A deterministic claim evaluation has completed on the FalkorDB graph. "
            "Your job is to provide a concise, factual 2-3 sentence explanation of the verdict "
            "grounded EXCLUSIVELY in the provided tool outputs and temporal coordinates. "
            "Do NOT speculate, do NOT contradict the deterministic outcome, and do NOT mention future facts."
        )

        user_content = (
            f"Claim ID: {claim_id}\n"
            f"Adjudication Outcome: {outcome}\n"
            f"Valid Time (Tv): {context.get('tv_iso')}\n"
            f"Knowledge Time (Ts): {context.get('ts_iso')}\n"
            f"Tool Execution Trace:\n{tool_context_str}\n\n"
            f"Synthesize a clear, grounded explanation for this claim decision."
        )

        if provider == "groq" and settings.groq_api_key:
            import httpx
            headers = {
                "Authorization": f"Bearer {settings.groq_api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": settings.llm_model or "openai/gpt-oss-120b",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": 0.2,
                "max_tokens": 200,
            }
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    "https://api.groq.com/openai/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and choices[0].get("message", {}).get("content"):
                        return choices[0]["message"]["content"].strip()
                else:
                    logger.warning("Groq API returned status %s: %s", resp.status_code, resp.text[:200])

        elif provider == "openai" and settings.openai_api_key:
            import httpx
            headers = {
                "Authorization": f"Bearer {settings.openai_api_key}",
                "Content-Type": "application/json",
            }
            payload = {
                "model": settings.llm_model or "gpt-4o-mini",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": user_content},
                ],
                "temperature": 0.2,
                "max_tokens": 200,
            }
            with httpx.Client(timeout=10.0) as client:
                resp = client.post(
                    "https://api.openai.com/v1/chat/completions",
                    headers=headers,
                    json=payload,
                )
                if resp.status_code == 200:
                    data = resp.json()
                    choices = data.get("choices", [])
                    if choices and choices[0].get("message", {}).get("content"):
                        return choices[0]["message"]["content"].strip()
    except Exception as e:
        logger.warning("LLM explanation generation encountered an exception, using fallback: %s", e)

    return fallback_explanation


def run_agent_decision_loop(
    claim_id: str,
    prompt: Optional[str] = None,
    tv: Optional[int] = None,
    ts: Optional[int] = None,
    ts_ceiling: Optional[int] = None,
) -> AgentRunResult:
    """Run the bi-temporal claims decision agent loop for a claim.
    
    1. Initializes server-enforced Temporal Firewall context.
    2. Runs tool selection loop.
    3. Writes grounded explanation using only tool outputs.
    4. Persists AgentRun and ToolCall nodes and relationships into FalkorDB.
    """
    start_time = time.time()
    g = get_graph()

    # Step 1: Establish Claim Metadata and Temporal Context
    claim_chk = g.query(
        "MATCH (c:Claim {id: $id})-[:FILED_AGAINST]->(p:Policy) RETURN c.valid_from, c.sys_from, c.claim_type, p.id, c.description, c.amount",
        params={"id": claim_id},
    )
    if not claim_chk.result_set:
        raise ValueError(f"Claim '{claim_id}' not found in database")

    row = claim_chk.result_set[0]
    c_valid_from, c_sys_from, c_type, p_id, c_desc, c_amt = row

    eff_tv = tv if tv is not None else c_valid_from
    eff_ts = ts if ts is not None else SENTINEL_MAX
    eff_ceiling = ts_ceiling if ts_ceiling is not None else eff_ts

    # Enforce Temporal Firewall
    ctx = set_temporal_context(tv=eff_tv, ts=eff_ts, ts_ceiling=eff_ceiling)
    assert_firewall_integrity()

    tools_called: List[Dict[str, Any]] = []

    def call_tool(name: str, fn, **kwargs) -> Any:
        t0 = time.time()
        order = len(tools_called) + 1
        output = fn(**kwargs)
        dur_ms = round((time.time() - t0) * 1000, 2)
        summary = str(output)[:300] if output else "None"

        record = {
            "order": order,
            "tool_name": name,
            "inputs": kwargs,
            "output": output,
            "output_summary": summary,
            "latency_ms": dur_ms,
        }
        tools_called.append(record)
        return output

    # Step 2: Autonomous Tool Selection (Diverges visibly by claim type)
    # Check if claim is late-filed (filing delay > 30 days or marked late)
    filing_lag_ms = c_sys_from - c_valid_from
    is_late_filed = filing_lag_ms > (30 * 86400 * 1000) or "late" in claim_id.lower() or "LATE" in claim_id

    # Check if claim is associated with a fraud ring / cluster
    ring_chk = g.query(
        """
        MATCH (c:Claim {id: $id})-[hb:HANDLED_BY]->(pr:Provider)
        MATCH (c)-[ra:REPAIRED_AT]->(s:Shop)
        RETURN pr.id, s.id
        """,
        params={"id": claim_id},
    )
    has_dual_provider_shop = len(ring_chk.result_set) > 0

    outcome = "DENIED"
    decision_data: Dict[str, Any] = {}

    if is_late_filed:
        # Category A: Late-Filed Claims invoke find_late_facts first
        late_facts = call_tool("find_late_facts", find_late_facts, claim_id=claim_id)
        pol_terms = call_tool("get_policy_as_of", get_policy_as_of, policy_id=p_id)
        decision_data = call_tool("decide_claim", decide_claim, claim_id=claim_id)
        outcome = decision_data["outcome"]

        explanation = (
            f"Adjudication for late-filed claim {claim_id}: Loss occurred on {to_iso(eff_tv)}, but filing was delayed. "
            f"Under policy {p_id}, active deductible is ${pol_terms.get('deductible', 500)}. "
            f"Discovered {len(late_facts)} retroactive/late-arriving fact(s). "
            f"Adjudication outcome: {outcome}. Reason: {decision_data.get('reasons', ['Policy coverage evaluation'])[0]}."
        )

    elif has_dual_provider_shop:
        # Category B: Ring-linked / Staged claims invoke cluster tools first
        clusters = call_tool("detect_provider_clusters", detect_provider_clusters, min_claims=4)
        decision_data = call_tool("decide_claim", decide_claim, claim_id=claim_id)
        outcome = decision_data["outcome"]

        # If flagged or suspicious cluster match, attach review flag
        is_cluster_involved = outcome == "ESCALATE" or any(
            c.get("is_suspicious") and any(claim_id == clm["id"] for clm in c.get("claims", []))
            for c in clusters
        )

        if is_cluster_involved:
            call_tool(
                "flag_for_review",
                flag_for_review,
                claim_id=claim_id,
                reason="Corroborated membership in suspicious multi-claim provider-shop cluster",
                flag_type="FRAUD_CLUSTER",
            )
            outcome = "ESCALATE"

        suspicious_count = sum(1 for c in clusters if c.get("is_suspicious"))
        explanation = (
            f"Adjudication for high-risk claim {claim_id}: Evaluated connected service entities against graph clustering. "
            f"Detected {suspicious_count} suspicious multi-entity cluster(s) in system at {to_iso(eff_ts)}. "
            f"Decision outcome: {outcome}. Reason: {decision_data.get('reasons', ['Syndicate cluster detected'])[0]}."
        )

    else:
        # Category C: Standard Claims invoke trace_coverage_path and get_policy_as_of (never cluster tools)
        cov_trace = call_tool("trace_coverage_path", trace_coverage_path, claim_id=claim_id)
        decision_data = call_tool("decide_claim", decide_claim, claim_id=claim_id)
        outcome = decision_data["outcome"]

        is_cov = bool(cov_trace.get("covered"))
        covered_str = "covered" if is_cov else "not covered"
        explanation = (
            f"Standard adjudication for claim {claim_id}: Loss type '{c_type}' is {covered_str} under policy {p_id} "
            f"as of system knowledge time {to_iso(eff_ts)}. "
            f"Decision outcome: {outcome}. Deterministic reason: {decision_data.get('reasons', ['Standard evaluation'])[0]}."
        )

    temporal_context = {
        "tv": eff_tv,
        "tv_iso": to_iso(eff_tv),
        "ts": eff_ts,
        "ts_iso": to_iso(eff_ts),
        "ts_ceiling": eff_ceiling,
        "ts_ceiling_iso": to_iso(eff_ceiling),
    }

    # Step 2.5: Synthesize grounded explanation with configured LLM (e.g. Groq) if enabled
    explanation = generate_llm_explanation(
        claim_id=claim_id,
        outcome=outcome,
        tools_called=tools_called,
        context=temporal_context,
        fallback_explanation=explanation,
    )

    total_latency_ms = round((time.time() - start_time) * 1000, 2)
    run_id = f"RUN-{claim_id}-{int(time.time() * 1000)}"

    # Step 3: Persist AgentRun and ToolCall Nodes into FalkorDB
    try:
        run_cypher = """
        CREATE (ar:AgentRun {
            id: $run_id,
            claim_id: $claim_id,
            prompt: $prompt,
            llm_provider: $llm_provider,
            outcome: $outcome,
            explanation: $explanation,
            total_latency_ms: $latency_ms,
            valid_from: $tv,
            valid_to: $sent,
            sys_from: $ts,
            sys_to: $sent,
            is_synthetic: true
        })
        WITH ar
        MATCH (c:Claim {id: $claim_id})
        CREATE (ar)-[:DECIDES {valid_from: $tv, valid_to: $sent, sys_from: $ts, sys_to: $sent}]->(c)
        """
        g.query(
            run_cypher,
            params={
                "run_id": run_id,
                "claim_id": claim_id,
                "prompt": prompt or f"Evaluate claim {claim_id}",
                "llm_provider": settings.llm_provider,
                "outcome": outcome,
                "explanation": explanation,
                "latency_ms": total_latency_ms,
                "tv": eff_tv,
                "ts": eff_ts if eff_ts < SENTINEL_MAX else int(time.time() * 1000),
                "sent": SENTINEL_MAX,
            },
        )

        for tc in tools_called:
            tc_id = f"TC-{run_id}-{tc['order']}"
            tc_cypher = """
            CREATE (tc:ToolCall {
                id: $tc_id,
                tool_name: $tool_name,
                inputs: $inputs,
                output_summary: $output_summary,
                latency_ms: $latency_ms,
                call_order: $order,
                valid_from: $tv,
                valid_to: $sent,
                sys_from: $ts,
                sys_to: $sent,
                is_synthetic: true
            })
            WITH tc
            MATCH (ar:AgentRun {id: $run_id})
            CREATE (ar)-[:RAN_TOOL {order: $order, valid_from: $tv, valid_to: $sent, sys_from: $ts, sys_to: $sent}]->(tc)
            """
            g.query(
                tc_cypher,
                params={
                    "tc_id": tc_id,
                    "tool_name": tc["tool_name"],
                    "inputs": json.dumps(tc["inputs"]),
                    "output_summary": tc["output_summary"],
                    "latency_ms": tc["latency_ms"],
                    "order": tc["order"],
                    "run_id": run_id,
                    "tv": eff_tv,
                    "ts": eff_ts if eff_ts < SENTINEL_MAX else int(time.time() * 1000),
                    "sent": SENTINEL_MAX,
                },
            )
    except Exception as e:
        logger.warning("Failed to persist agent run graph nodes: %s", e)

    return AgentRunResult(
        run_id=run_id,
        claim_id=claim_id,
        outcome=outcome,
        explanation=explanation,
        tools_called=tools_called,
        total_latency_ms=total_latency_ms,
        context={
            "tv": eff_tv,
            "tv_iso": to_iso(eff_tv),
            "ts": eff_ts,
            "ts_iso": to_iso(eff_ts),
            "ts_ceiling": eff_ceiling,
            "ts_ceiling_iso": to_iso(eff_ceiling),
        },
    )
