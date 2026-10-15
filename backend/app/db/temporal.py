"""Bi-temporal constants and timestamp conversion helpers.

Every versioned fact in AsOf stores four integer epoch-millisecond properties:
- valid_from: when the fact became true in the real world
- valid_to: when the fact ceased being true in the real world
- sys_from: when the fact was recorded/known by the system
- sys_to: when the fact was superseded/closed by the system

Open-ended intervals use SENTINEL_MAX (9999999999999) instead of null.
"""

from datetime import datetime, timezone
from typing import Union

SENTINEL_MAX = 9999999999999
SENTINEL_MIN = 0


def to_epoch_ms(val: Union[int, float, str, datetime]) -> int:
    """Convert an ISO string, datetime, or number to integer epoch milliseconds (UTC)."""
    if isinstance(val, (int, float)):
        return int(val)
    if isinstance(val, datetime):
        if val.tzinfo is None:
            val = val.replace(tzinfo=timezone.utc)
        return int(val.timestamp() * 1000)
    if isinstance(val, str):
        # Handle simple date strings like "2026-06-01" or full ISO strings
        cleaned = val.strip()
        if len(cleaned) == 10 and cleaned.count("-") == 2:
            cleaned = f"{cleaned}T00:00:00Z"
        if cleaned.endswith("Z"):
            cleaned = cleaned[:-1] + "+00:00"
        dt = datetime.fromisoformat(cleaned)
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp() * 1000)
    raise ValueError(f"Cannot convert {val} of type {type(val)} to epoch milliseconds")


parse_timestamp = to_epoch_ms


def to_iso(epoch_ms: int) -> str:
    """Convert integer epoch milliseconds to ISO 8601 UTC string.

    Returns 'infinity' if equal to SENTINEL_MAX.
    """
    if epoch_ms >= SENTINEL_MAX:
        return "infinity"
    dt = datetime.fromtimestamp(epoch_ms / 1000.0, tz=timezone.utc)
    return dt.isoformat()


def as_of_predicate(alias: str = "n") -> str:
    """Return the parameterized Cypher condition for bi-temporal validity:
    valid_from <= $tv AND $tv < valid_to AND sys_from <= $ts AND $ts < sys_to
    """
    return (
        f"{alias}.valid_from <= $tv AND $tv < {alias}.valid_to "
        f"AND {alias}.sys_from <= $ts AND $ts < {alias}.sys_to"
    )
