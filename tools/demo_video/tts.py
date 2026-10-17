"""Text-to-speech narration generator and audio timing sync for AsOf."""

import asyncio
import os
import subprocess
from pathlib import Path
from typing import Dict, List, Optional
import edge_tts
import yaml

DEFAULT_VOICE = os.environ.get("TTS_VOICE", "en-US-AndrewNeural")


def get_audio_duration(audio_path: Path) -> float:
    """Measure exact duration of an audio file in seconds using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(audio_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())


async def _synthesize_edge_tts(text: str, output_path: Path, voice: str = DEFAULT_VOICE):
    """Async synthesis via edge-tts."""
    communicate = edge_tts.Communicate(text, voice)
    await communicate.save(str(output_path))


def generate_scene_audio(
    text: str,
    output_path: Path,
    voice: str = DEFAULT_VOICE,
    silent: bool = False,
    fallback_duration: float = 20.0,
) -> float:
    """Generate audio for a single scene and return its exact duration in seconds."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    if silent:
        # Generate silent audio track matching fallback target duration
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(fallback_duration),
            "-q:a", "9", "-acodec", "libmp3lame",
            str(output_path),
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        return fallback_duration

    # Generate edge-tts audio safely without event loop collision
    import concurrent.futures
    try:
        with concurrent.futures.ThreadPoolExecutor(max_workers=1) as executor:
            future = executor.submit(lambda: asyncio.run(_synthesize_edge_tts(text, output_path, voice=voice)))
            future.result(timeout=30.0)
        duration = get_audio_duration(output_path)
    except Exception as e:
        logger.warning("TTS synthesis failed or timed out (%s), generating silent track fallback.", e)
        cmd = [
            "ffmpeg", "-y",
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            "-t", str(fallback_duration),
            "-q:a", "9", "-acodec", "libmp3lame",
            str(output_path),
        ]
        subprocess.run(cmd, capture_output=True, check=True)
        duration = fallback_duration

    return duration


def format_srt_timestamp(seconds: float) -> str:
    """Convert float seconds to SRT timestamp format (HH:MM:SS,mmm)."""
    hrs = int(seconds // 3600)
    mins = int((seconds % 3600) // 60)
    secs = int(seconds % 60)
    millis = int((seconds - int(seconds)) * 1000)
    return f"{hrs:02d}:{mins:02d}:{secs:02d},{millis:03d}"


def export_subtitles_and_script(
    scene_items: List[Dict[str, any]],
    output_dir: Path,
):
    """Generate narration.srt and narration.txt with accurate cumulative timestamps."""
    srt_lines = []
    script_lines = []
    current_time = 0.0

    for idx, item in enumerate(scene_items, start=1):
        start_ts = format_srt_timestamp(current_time)
        end_time = current_time + item["duration"]
        end_ts = format_srt_timestamp(end_time)

        srt_lines.append(f"{idx}\n{start_ts} --> {end_ts}\n{item['text']}\n")
        script_lines.append(
            f"--- Scene {idx}: {item.get('name', 'Scene')} [{start_ts} - {end_ts}] ({round(item['duration'], 1)}s) ---\n"
            f"{item['text']}\n"
        )
        current_time = end_time

    srt_path = output_dir / "narration.srt"
    txt_path = output_dir / "narration.txt"

    with open(srt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(srt_lines))

    with open(txt_path, "w", encoding="utf-8") as f:
        f.write("\n".join(script_lines))

    return srt_path, txt_path
