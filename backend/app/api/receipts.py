"""Cryptographic receipts and tamper verification endpoints for AsOf."""

import hashlib
import json
import logging
import time
from typing import Any, Dict, Optional
from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from backend.app.db.connection import get_graph
from backend.app.db.temporal import SENTINEL_MAX, to_iso

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/receipts", tags=["Receipts"])


def compute_decision_hash(claim_id: str, outcome: str, rule: str, valid_from: int, sys_from: int) -> str:
    """Deterministic cryptographic hash over decision attributes and temporal bounds."""
    raw = f"{claim_id}|{outcome}|{rule}|{valid_from}|{sys_from}"
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


class TamperRequest(BaseModel):
    claim_id: str
    tampered_outcome: str = "APPROVED"


class RestoreRequest(BaseModel):
    claim_id: str
    original_outcome: str = "DENIED"


@router.post("/generate/{claim_id}")
def generate_receipt(claim_id: str) -> Dict[str, Any]:
    """Generate and persist a cryptographic Receipt node for a claim's decision."""
    g = get_graph()
    q = """
    MATCH (d:Decision)-[:DECIDES]->(c:Claim {id: $claim_id})
    RETURN d.id, d.outcome, d.rule_applied, d.valid_from, d.sys_from
    LIMIT 1
    """
    res = g.query(q, params={"claim_id": claim_id})
    if not res.result_set:
        raise HTTPException(status_code=404, detail=f"No decision found for claim '{claim_id}'")

    d_id, outcome, rule, vf, sf = res.result_set[0]
    ev_hash = compute_decision_hash(claim_id, outcome, str(rule), vf, sf)
    receipt_id = f"RCP-{claim_id}-{int(time.time() * 1000)}"

    save_q = """
    MERGE (r:Receipt {claim_id: $claim_id})
    SET r.id = $receipt_id,
        r.evidence_hash = $ev_hash,
        r.algorithm = 'SHA-256',
        r.issued_ts = $issued_ts,
        r.valid_from = $vf,
        r.valid_to = $sent,
        r.sys_from = $issued_ts,
        r.sys_to = $sent,
        r.is_synthetic = true
    WITH r
    MATCH (d:Decision {id: $d_id})
    MERGE (r)-[:RECEIPT_OF]->(d)
    RETURN r.id, r.evidence_hash
    """
    now_ms = int(time.time() * 1000)
    g.query(
        save_q,
        params={
            "claim_id": claim_id,
            "receipt_id": receipt_id,
            "ev_hash": ev_hash,
            "d_id": d_id,
            "issued_ts": now_ms,
            "vf": vf,
            "sent": SENTINEL_MAX,
        },
    )

    return {
        "success": True,
        "receipt_id": receipt_id,
        "claim_id": claim_id,
        "evidence_hash": ev_hash,
        "algorithm": "SHA-256",
        "issued_at": to_iso(now_ms),
    }


@router.get("/verify/{claim_id}")
def verify_receipt(claim_id: str) -> Dict[str, Any]:
    """Cryptographically verify that the decision data has not been tampered with since receipt generation."""
    g = get_graph()
    q = """
    MATCH (r:Receipt {claim_id: $claim_id})-[:RECEIPT_OF]->(d:Decision)
    RETURN r.id, r.evidence_hash, r.algorithm, r.issued_ts,
           d.id, d.outcome, d.rule_applied, d.valid_from, d.sys_from
    LIMIT 1
    """
    res = g.query(q, params={"claim_id": claim_id})
    if not res.result_set:
        # Auto-generate receipt if none exists yet for demo convenience
        gen_res = generate_receipt(claim_id)
        res = g.query(q, params={"claim_id": claim_id})

    row = res.result_set[0]
    r_id, stored_hash, algo, issued_ts, d_id, cur_outcome, cur_rule, vf, sf = row

    recomputed_hash = compute_decision_hash(claim_id, cur_outcome, str(cur_rule), vf, sf)
    is_valid = (stored_hash == recomputed_hash)

    return {
        "status": "PASS" if is_valid else "FAIL",
        "verified": is_valid,
        "claim_id": claim_id,
        "receipt_id": r_id,
        "stored_hash": stored_hash,
        "current_hash": recomputed_hash,
        "decision_outcome": cur_outcome,
        "algorithm": algo,
        "message": "Cryptographic integrity intact. Verdict matches immutable receipt." if is_valid else "TAMPER DETECTED: Decision properties in database do not match cryptographic receipt!",
    }


@router.post("/tamper")
def tamper_decision(payload: TamperRequest) -> Dict[str, Any]:
    """Live demo endpoint: intentionally tamper with decision record to demonstrate cryptographic audit failure."""
    g = get_graph()
    q = """
    MATCH (d:Decision)-[:DECIDES]->(c:Claim {id: $claim_id})
    SET d.outcome = $tampered
    RETURN d.id, d.outcome
    """
    res = g.query(q, params={"claim_id": payload.claim_id, "tampered": payload.tampered_outcome})
    if not res.result_set:
        raise HTTPException(status_code=404, detail="Decision not found")

    return {
        "success": True,
        "claim_id": payload.claim_id,
        "tampered_outcome": payload.tampered_outcome,
        "notice": "Decision outcome maliciously flipped in database. Next verification MUST fail.",
    }


@router.post("/restore")
def restore_decision(payload: RestoreRequest) -> Dict[str, Any]:
    """Restore original decision outcome to return state to PASS."""
    g = get_graph()
    q = """
    MATCH (d:Decision)-[:DECIDES]->(c:Claim {id: $claim_id})
    SET d.outcome = $original
    RETURN d.id, d.outcome
    """
    g.query(q, params={"claim_id": payload.claim_id, "original": payload.original_outcome})
    return {
        "success": True,
        "claim_id": payload.claim_id,
        "restored_outcome": payload.original_outcome,
    }
