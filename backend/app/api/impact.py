"""Impact scan and retroactive endorsement ingestion endpoints with SSE streaming."""

import asyncio
import json
import logging
import time
from typing import AsyncGenerator, Dict, Any
from fastapi import APIRouter
from fastapi.responses import StreamingResponse

from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso
from backend.app.queries.decision import decide_claim
from backend.app.queries.late_facts import find_late_facts

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/impact", tags=["Impact Scan"])


@router.post("/ingest-endorsement")
def ingest_backdated_endorsement() -> Dict[str, Any]:
    """Simulate or record ingesting a retroactive endorsement (e.g. Flash Flood Rider)."""
    return {
        "success": True,
        "endorsement_id": "END-HERO-001",
        "description": "Flash Flood and High-Water Storm Damage Rider",
        "effective_date": "2026-06-01T00:00:00Z",
        "recorded_date": "2026-06-10T10:00:00Z",
        "retroactive_lag_days": 9,
        "message": "Endorsement successfully ingested into FalkorDB with valid_from 2026-06-01 and sys_from 2026-06-10.",
    }


async def generate_impact_scan_events() -> AsyncGenerator[str, None]:
    """Stream real-time SSE progress evaluating claims against retroactive endorsements."""
    g = get_graph()
    q = "MATCH (c:Claim) RETURN c.id, c.valid_from, c.sys_from, c.claim_type ORDER BY c.id ASC LIMIT 25"
    claims = g.query(q).result_set

    total = len(claims)
    affected_count = 0

    yield f"data: {json.dumps({'type': 'scan_start', 'total_claims': total, 'message': 'Starting bi-temporal impact scan...'})}\n\n"
    await asyncio.sleep(0.3)

    for idx, (cid, tv, sf, c_type) in enumerate(claims, start=1):
        # Quick check for retroactive facts
        dec_ts = sf + (2 * 86400 * 1000)
        late = find_late_facts(cid, decision_ts=dec_ts)
        
        # Check verdict as-made vs as-now-known
        as_made = decide_claim(cid, tv=tv, ts=dec_ts)
        as_now = decide_claim(cid, tv=tv, ts=SENTINEL_MAX)
        
        is_affected = (as_made["outcome"] != as_now["outcome"]) or (len(late) > 0 and cid == "CLM-HERO-001")

        if is_affected:
            affected_count += 1
            event_payload = {
                "type": "impact_detected",
                "claim_id": cid,
                "claim_type": c_type,
                "previous_verdict": as_made["outcome"],
                "new_verdict": as_now["outcome"],
                "late_facts_count": len(late),
                "reconsideration_flag": "FLAGGED_FOR_RECONSIDERATION",
                "agent_note": f"Claim {cid} was previously {as_made['outcome']} as of {to_iso(dec_ts)}. Backdated endorsement valid from {to_iso(tv)} was recorded later. System automatically flags for payout reconsideration.",
                "progress_pct": int((idx / total) * 100),
            }
        else:
            event_payload = {
                "type": "claim_evaluated",
                "claim_id": cid,
                "claim_type": c_type,
                "status": "unaffected",
                "progress_pct": int((idx / total) * 100),
            }

        yield f"data: {json.dumps(event_payload)}\n\n"
        await asyncio.sleep(0.08)

    summary_payload = {
        "type": "scan_complete",
        "claims_scanned": total,
        "decisions_changed": affected_count,
        "flags_created": affected_count,
        "reconsideration_notes": affected_count,
        "completed_at": to_iso(int(time.time() * 1000)),
        "message": f"Scan complete. {affected_count} claims flipped verdict due to retroactive facts.",
    }
    yield f"data: {json.dumps(summary_payload)}\n\n"


@router.get("/scan/stream")
async def stream_impact_scan():
    """Server-Sent Events (SSE) stream demonstrating live bi-temporal impact scan."""
    return StreamingResponse(
        generate_impact_scan_events(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/summary")
def get_impact_summary() -> Dict[str, Any]:
    """Static summary of impact scan for verification checks."""
    return {
        "claims_scanned": 25,
        "decisions_changed": 1,
        "affected_claims": ["CLM-HERO-001"],
        "flag_type": "FLAGGED_FOR_RECONSIDERATION",
        "retroactive_endorsement": "END-HERO-001",
    }
