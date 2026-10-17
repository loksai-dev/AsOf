"""AsOf Benchmark CLI entrypoint."""

import sys
from backend.app.benchmark.runner import run_benchmark

if __name__ == "__main__":
    limit = 50
    if len(sys.argv) > 1 and sys.argv[1].isdigit():
        limit = int(sys.argv[1])
    results = run_benchmark(sample_limit=limit)
    print("Benchmark completed. Results written to benchmark_results.json.")
    print(f"Claims Scanned: {results['claims_scanned']}")
    print(f"Decisions Changed: {results['decisions_changed']}")
    print(f"Latest State Leaks: {results['latest_state_leaks']} vs AsOf Leaks: {results['asof_leaks']}")
    print(f"Accuracy: AsOf {results['asof_accuracy']}% vs Latest {results['latest_state_accuracy']}%")
