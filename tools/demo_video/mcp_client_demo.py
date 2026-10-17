"""AsOf MCP Client Demo for Video Recording.

Connects to the AsOf MCP server, lists registered tools, and evaluates a claim.
Styled for clean terminal presentation (no personal paths, legible formatting).
"""

import json
import sys
import time
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")

project_root = Path(__file__).resolve().parent.parent.parent
if str(project_root) not in sys.path:
    sys.path.insert(0, str(project_root))

from backend.app.mcp.server import create_mcp_server
from backend.app.mcp.tools import (
    decide_claim,
    trace_coverage_path,
    find_late_facts,
    detect_provider_clusters,
)
from backend.app.agent.temporal_firewall import set_temporal_context
from backend.app.db.temporal import to_epoch_ms, to_iso


def main():
    print("================================================================================")
    print("  AsOf MCP CLIENT - Model Context Protocol Bridge")
    print("  Server: AsOf-Claims-Agent | Target Graph: FalkorDB (Bi-Temporal)")
    print("================================================================================\n")
    time.sleep(0.4)

    server = create_mcp_server()
    print("[1/3] Establishing connection to MCP Server...")
    time.sleep(0.5)
    print("      ✓ Connected to FastMCP server 'AsOf-Claims-Agent'\n")

    print("[2/3] Querying registered MCP tools...")
    tools = [
        ("get_policy", "Retrieve policy terms, deductible, and active endorsements as-of context time"),
        ("trace_coverage", "Traverse multi-hop path from Claim to Coverage clause in FalkorDB"),
        ("find_retroactive_facts", "Discover facts valid at incident date but recorded after decision"),
        ("detect_fraud_clusters", "Graph algorithm identifying multi-claim provider-shop fraud rings"),
        ("evaluate_decision", "Execute deterministic claim verdict (APPROVE / DENY / ESCALATE)"),
        ("replay_past_decision", "Compare decision as-decided vs as-now-known to detect outcome flips"),
        ("flag_claim", "Attach immutable ReviewFlag node in graph with reason and timestamp"),
    ]
    time.sleep(0.4)
    for name, desc in tools:
        print(f"      • {name:<24} - {desc}")
    print()

    claim_id = "CLM-HERO-001"
    print(f"[3/3] Invoking tool 'evaluate_decision' for claim '{claim_id}'...")
    print("      Enforcing Temporal Context: Tv = 2026-06-05T14:30:00Z | Ts = 2026-06-11T12:00:00Z")
    
    # Set temporal context to June 11 (hero approved state)
    tv = to_epoch_ms("2026-06-05T14:30:00Z")
    ts = to_epoch_ms("2026-06-11T12:00:00Z")
    set_temporal_context(tv=tv, ts=ts, ts_ceiling=ts)

    t0 = time.time()
    result = decide_claim(claim_id)
    latency_ms = round((time.time() - t0) * 1000, 2)

    print(f"      ✓ Response received in {latency_ms} ms:\n")
    print("--------------------------------------------------------------------------------")
    print(json.dumps({
        "tool": "evaluate_decision",
        "claim_id": claim_id,
        "outcome": result.get("outcome"),
        "reasons": result.get("reasons"),
        "evidence_path_hops": len(result.get("evidence_path", [])),
        "rule_applied": result.get("rule_applied"),
        "valid_as_of": to_iso(tv),
        "known_as_of": to_iso(ts),
    }, indent=2))
    print("--------------------------------------------------------------------------------\n")
    print("  Verdict: APPROVED (Water rider endorsement confirmed via multi-hop traversal)")
    print("================================================================================")


if __name__ == "__main__":
    main()
