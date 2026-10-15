"""Agent REST API endpoints for AsOf."""

from typing import Any, Dict, Optional, Union
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field
from backend.app.agent.runner import run_agent_decision_loop
from backend.app.agent.temporal_firewall import FirewallViolationError
from backend.app.db.temporal import parse_timestamp

router = APIRouter(prefix="/agent", tags=["Agent"])


class AgentRunRequest(BaseModel):
    claim_id: str
    prompt: Optional[str] = None
    tv: Optional[Union[int, str]] = None
    ts: Optional[Union[int, str]] = None
    ts_ceiling: Optional[Union[int, str]] = None


@router.post("/run")
def execute_agent_loop(payload: AgentRunRequest):
    """Execute the agent decision loop with server-enforced Temporal Firewall coordinates."""
    parsed_tv = parse_timestamp(payload.tv) if payload.tv is not None else None
    parsed_ts = parse_timestamp(payload.ts) if payload.ts is not None else None
    parsed_ceiling = parse_timestamp(payload.ts_ceiling) if payload.ts_ceiling is not None else None

    try:
        result = run_agent_decision_loop(
            claim_id=payload.claim_id,
            prompt=payload.prompt,
            tv=parsed_tv,
            ts=parsed_ts,
            ts_ceiling=parsed_ceiling,
        )
        return result.to_dict()
    except FirewallViolationError as e:
        raise HTTPException(status_code=403, detail=str(e))
    except ValueError as e:
        raise HTTPException(status_code=404, detail=str(e))
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Agent execution error: {str(e)}")
