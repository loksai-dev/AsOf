"""Temporal Firewall for AsOf.

Ensures that LLM agent tools and external MCP clients can NEVER manipulate
or inject time parameters (tv, ts). All temporal coordinates are strictly
managed by the server context, and ts is enforced to never exceed ts_ceiling.
"""

from contextvars import ContextVar
from dataclasses import dataclass
from typing import Optional
from backend.app.db.temporal import SENTINEL_MAX, to_iso


class FirewallViolationError(Exception):
    """Raised when an operation attempts to query beyond the temporal ceiling or tamper with time context."""
    pass


@dataclass(frozen=True)
class TemporalContext:
    tv: int  # Real-world valid time (typically claim occurrence date)
    ts: int  # System transaction knowledge time (what the system knew)
    ts_ceiling: int  # Hard temporal firewall ceiling (cannot be exceeded)
    mode: str = "as_of"  # "as_of" or "latest"

    @property
    def tv_iso(self) -> str:
        return to_iso(self.tv)

    @property
    def ts_iso(self) -> str:
        return to_iso(self.ts)

    @property
    def ts_ceiling_iso(self) -> str:
        return to_iso(self.ts_ceiling)


# Context variable holding the active temporal coordinates for the current execution thread/task
_current_temporal_context: ContextVar[Optional[TemporalContext]] = ContextVar(
    "current_temporal_context",
    default=None,
)


def set_temporal_context(
    tv: int,
    ts: int,
    ts_ceiling: Optional[int] = None,
    mode: str = "as_of",
) -> TemporalContext:
    """Set the active server-managed temporal context.
    
    Enforces the invariant: ts <= ts_ceiling.
    """
    effective_ceiling = ts_ceiling if ts_ceiling is not None else ts

    if ts > effective_ceiling:
        raise FirewallViolationError(
            f"Temporal Firewall Violation: Requested knowledge time ts ({to_iso(ts)}) "
            f"exceeds the temporal ceiling ({to_iso(effective_ceiling)})."
        )

    ctx = TemporalContext(
        tv=tv,
        ts=ts,
        ts_ceiling=effective_ceiling,
        mode=mode,
    )
    _current_temporal_context.set(ctx)
    return ctx


def get_temporal_context() -> TemporalContext:
    """Retrieve the active server-managed temporal context.
    
    If none is explicitly set, defaults to latest-state with SENTINEL_MAX ceiling.
    """
    ctx = _current_temporal_context.get()
    if ctx is None:
        # Default fallback context: evaluation as of latest known time
        return TemporalContext(
            tv=SENTINEL_MAX,
            ts=SENTINEL_MAX,
            ts_ceiling=SENTINEL_MAX,
            mode="latest",
        )
    return ctx


def assert_firewall_integrity() -> None:
    """Assert that current context does not violate the temporal firewall."""
    ctx = get_temporal_context()
    if ctx.ts > ctx.ts_ceiling:
        raise FirewallViolationError(
            f"Temporal Firewall Compromised: Current ts ({to_iso(ctx.ts)}) "
            f"exceeds ceiling ({to_iso(ctx.ts_ceiling)})."
        )
