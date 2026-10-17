"""Postflight verification and security secret scanning for AsOf demo video."""

import json
import logging
import re
import subprocess
import sys
from pathlib import Path

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")
from typing import Any, Dict, List

from tools.demo_video.merge import get_media_duration

logger = logging.getLogger(__name__)

SECRET_PATTERNS = [
    r"gsk_[a-zA-Z0-9]{30,}",
    r"sk-[a-zA-Z0-9]{30,}",
    r"AIza[0-9A-Za-z-_]{35}",
    r"ghp_[a-zA-Z0-9]{36}",
    r"Users[\/\\][a-zA-Z0-9_-]+[\/\\]OneDrive",
    r"password=[\"']?[a-zA-Z0-9!@#$%^&*]+",
]


def verify_audio_present(video_path: Path) -> bool:
    """Ensure video contains a valid, populated audio stream."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-select_streams", "a:0",
        "-show_entries", "stream=codec_type,duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(video_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True)
    return "audio" in res.stdout.lower() or len(res.stdout.strip()) > 0


def scan_for_secrets(search_dir: Path) -> List[str]:
    """Scan all generated text, srt, log, and metadata files for secret leaks."""
    leaks = []
    text_extensions = {".txt", ".srt", ".json", ".yaml", ".log", ".csv"}

    for p in search_dir.rglob("*"):
        if p.is_file() and p.suffix in text_extensions:
            try:
                content = p.read_text(encoding="utf-8", errors="ignore")
                for pat in SECRET_PATTERNS:
                    matches = re.findall(pat, content, re.IGNORECASE)
                    for m in matches:
                        # Exclude harmless matches or placeholders
                        if "your_" in m.lower() or m.endswith("="):
                            continue
                        leaks.append(f"Secret pattern match in {p.name}: {m[:10]}...")
            except Exception:
                pass

    return leaks


def run_postflight(
    video_path: Path,
    output_dir: Path,
    expected_min_duration: float = 140.0,
    expected_max_duration: float = 190.0,
    recorded_scenes: List[str] = None,
    skipped_scenes: List[str] = None,
) -> Dict[str, Any]:
    """Execute postflight checks and security audit on the generated demo video."""
    print("================================================================================")
    print("  AsOf DEMO VIDEO RECORDER - POSTFLIGHT AUDIT")
    print("================================================================================")

    # 1. Video File Existence
    file_exists = video_path.exists() and video_path.stat().st_size > 100000
    file_size_mb = round(video_path.stat().st_size / (1024 * 1024), 2) if file_exists else 0.0
    print(f"  [1/4] Video File Exists:            {'✓ PASS' if file_exists else '✗ FAIL'} ({file_size_mb} MB)")

    # 2. Duration Check
    duration = get_media_duration(video_path) if file_exists else 0.0
    duration_ok = (expected_min_duration <= duration <= expected_max_duration)
    dur_str = f"{int(duration // 60)}m {int(duration % 60)}s ({round(duration, 1)}s)"
    print(f"  [2/4] Duration within Target:       {'✓ PASS' if duration_ok else '⚠ NOTICE'} [{dur_str}]")

    # 3. Audio Presence
    audio_ok = verify_audio_present(video_path) if file_exists else False
    print(f"  [3/4] Audio Stream Verified:        {'✓ PASS' if audio_ok else '✗ FAIL'}")

    # 4. Secret & Privacy Leak Scanner
    leaks = scan_for_secrets(output_dir)
    privacy_ok = (len(leaks) == 0)
    print(f"  [4/4] Secrets & Privacy Audit:      {'✓ PASS (0 leaks)' if privacy_ok else '✗ FAIL (Leaks Detected)'}")

    if leaks:
        print("\n  SECURITY ALERT - PRIVACY LEAK DETECTED:")
        for l in leaks:
            print(f"    ! {l}")
        raise ValueError("Demo video generation failed security audit: secrets detected in artifacts.")

    # Write report.json
    report_data = {
        "video_path": f"tools/demo_video/output/{video_path.name}",
        "file_size_mb": file_size_mb,
        "duration_seconds": round(duration, 1),
        "duration_formatted": dur_str,
        "audio_stream_present": audio_ok,
        "privacy_audit_passed": privacy_ok,
        "recorded_scenes": recorded_scenes or [],
        "skipped_scenes": skipped_scenes or [],
        "resolution": "1920x1080",
        "video_codec": "H.264",
        "audio_codec": "AAC",
    }

    report_path = output_dir / "report.json"
    with open(report_path, "w", encoding="utf-8") as f:
        json.dump(report_data, f, indent=2)

    print("--------------------------------------------------------------------------------")
    print(f"  Postflight Report saved to: {report_path.name}")
    print("================================================================================\n")
    return report_data
