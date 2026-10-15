"""MCP Server implementation for AsOf Claims Decision Agent.

Compatible with Claude Desktop and any standard Model Context Protocol client.
Exposes the 7 core bi-temporal graph reasoning tools.
"""

import json
import logging
from typing import Any, Dict, List, Optional

logger = logging.getLogger(__name__)

# Import official FastMCP/MCPServer from python SDK
try:
    from mcp.server.mcpserver import MCPServer
    HAS_MCP = True
except ImportError:
    try:
        from mcp.server.fastmcp import FastMCP as MCPServer
        HAS_MCP = True
    except ImportError:
        HAS_MCP = False
        MCPServer = None

from backend.app.mcp.tools import (
    decide_claim as mcp_decide_claim,
    detect_provider_clusters as mcp_detect_provider_clusters,
    find_late_facts as mcp_find_late_facts,
    flag_for_review as mcp_flag_for_review,
    get_policy_as_of as mcp_get_policy_as_of,
    replay_decision as mcp_replay_decision,
    trace_coverage_path as mcp_trace_coverage_path,
)


def create_mcp_server():
    """Create and configure the AsOf MCP server with registered bi-temporal tools."""
    if not HAS_MCP or MCPServer is None:
        logger.warning("mcp package is not installed; returning None")
        return None

    server = MCPServer(
        name="AsOf-Claims-Agent",
        instructions=(
            "AsOf is a bi-temporal insurance claims decision agent powered by FalkorDB. "
            "Use these tools to inspect policy coverage, trace multi-hop evidence paths, "
            "discover late-arriving retroactive facts, detect provider-shop fraud rings, "
            "and replay historical claim decisions. Note: Time parameters are enforced by "
            "the server's Temporal Firewall and cannot be overridden by user prompts."
        ),
    )

    @server.tool()
    def get_policy(policy_id: str) -> str:
        """Retrieve policy terms, active deductible, limits, and endorsements as-of server context time."""
        res = mcp_get_policy_as_of(policy_id)
        return json.dumps(res, indent=2)

    @server.tool()
    def trace_coverage(claim_id: str) -> str:
        """Traverse the graph from Claim to Coverage via Policy and Endorsements as-of server context time."""
        res = mcp_trace_coverage_path(claim_id)
        return json.dumps(res, indent=2)

    @server.tool()
    def find_retroactive_facts(claim_id: str) -> str:
        """Discover facts valid at incident time but recorded in the system after the decision date."""
        res = mcp_find_late_facts(claim_id)
        return json.dumps(res, indent=2)

    @server.tool()
    def detect_fraud_clusters(min_claims: int = 4) -> str:
        """Detect suspicious connected provider-shop clusters sharing claims as-of server context time."""
        res = mcp_detect_provider_clusters(min_claims=min_claims)
        return json.dumps(res, indent=2)

    @server.tool()
    def evaluate_decision(claim_id: str) -> str:
        """Execute deterministic claim decision rule against coverage, limits, and fraud indicators."""
        res = mcp_decide_claim(claim_id)
        return json.dumps(res, indent=2)

    @server.tool()
    def replay_past_decision(claim_id: str) -> str:
        """Replay historical decision against current system knowledge to determine if retroactive facts flip the verdict."""
        res = mcp_replay_decision(claim_id)
        return json.dumps(res, indent=2)

    @server.tool()
    def flag_claim(claim_id: str, reason: str, flag_type: str = "MANUAL_REVIEW") -> str:
        """Attach a ReviewFlag node to a claim in the graph database and mark its status as flagged."""
        res = mcp_flag_for_review(claim_id, reason=reason, flag_type=flag_type)
        return json.dumps(res, indent=2)

    return server


mcp_app = create_mcp_server()


if __name__ == "__main__":
    if mcp_app:
        mcp_app.run()
