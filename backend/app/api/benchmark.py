"""Benchmark API endpoints for AsOf."""

from fastapi import APIRouter, Query
from backend.app.benchmark.runner import get_latest_benchmark_results, run_benchmark

router = APIRouter(prefix="/benchmark", tags=["Benchmark"])


@router.get("/results")
def get_benchmark_results():
    """Retrieve the latest comparative benchmark results."""
    return get_latest_benchmark_results()


@router.post("/run")
def execute_benchmark(sample_limit: int = Query(30, ge=5, le=100)):
    """Run the live comparative benchmark against FalkorDB claims."""
    return run_benchmark(sample_limit=sample_limit)
