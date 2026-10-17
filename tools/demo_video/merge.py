"""FFmpeg video & audio stitching, title cards, and subtitle integration for AsOf."""

import json
import logging
import subprocess
from pathlib import Path
from typing import List, Optional

logger = logging.getLogger(__name__)


def get_media_duration(file_path: Path) -> float:
    """Measure exact duration of an audio or video file using ffprobe."""
    cmd = [
        "ffprobe",
        "-v", "error",
        "-show_entries", "format=duration",
        "-of", "default=noprint_wrappers=1:nokey=1",
        str(file_path),
    ]
    res = subprocess.run(cmd, capture_output=True, text=True, check=True)
    return float(res.stdout.strip())


def generate_title_card(
    output_path: Path,
    title: str,
    subtitle: str,
    duration: float = 2.5,
):
    """Generate an elegant 1920x1080 title card video with dark cyan styling."""
    from PIL import Image, ImageDraw, ImageFont
    output_path.parent.mkdir(parents=True, exist_ok=True)
    temp_img = output_path.parent / f"{output_path.stem}.png"

    # 1. Render card image via Pillow
    img = Image.new("RGB", (1920, 1080), color=(2, 6, 23))  # slate-950
    draw = ImageDraw.Draw(img)

    # Decorative tech border
    draw.rectangle([60, 60, 1860, 1020], outline=(30, 41, 59), width=2)
    draw.rectangle([70, 70, 1850, 1010], outline=(15, 23, 42), width=1)

    # Load typography
    font_paths = [
        "C:/Windows/Fonts/segoeui.ttf",
        "C:/Windows/Fonts/arial.ttf",
        "C:/Windows/Fonts/calibri.ttf",
    ]
    font_title = None
    font_sub = None
    for fp in font_paths:
        if Path(fp).exists():
            try:
                font_title = ImageFont.truetype(fp, 52)
                font_sub = ImageFont.truetype(fp, 28)
                break
            except Exception:
                pass
    if not font_title:
        font_title = ImageFont.load_default()
        font_sub = ImageFont.load_default()

    # Draw centered title
    bbox_t = draw.textbbox((0, 0), title, font=font_title)
    w_t = bbox_t[2] - bbox_t[0]
    h_t = bbox_t[3] - bbox_t[1]
    draw.text(((1920 - w_t) / 2, 470 - h_t / 2), title, fill=(255, 255, 255), font=font_title)

    # Draw centered subtitle
    bbox_s = draw.textbbox((0, 0), subtitle, font=font_sub)
    w_s = bbox_s[2] - bbox_s[0]
    draw.text(((1920 - w_s) / 2, 570), subtitle, fill=(56, 189, 248), font=font_sub)

    img.save(str(temp_img))

    # 2. Render MP4 loop with silent audio
    cmd = [
        "ffmpeg", "-y",
        "-loop", "1",
        "-i", str(temp_img),
        "-f", "lavfi",
        "-i", "anullsrc=r=44100:cl=stereo",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", str(duration),
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)

    if temp_img.exists():
        temp_img.unlink()


def merge_scene_video_and_audio(
    video_path: Path,
    audio_path: Path,
    output_path: Path,
    target_duration: Optional[float] = None,
) -> Path:
    """Mux scene video (WebM/MP4) with narration audio (MP3). Trim or pad to match audio length."""
    output_path.parent.mkdir(parents=True, exist_ok=True)
    audio_dur = get_media_duration(audio_path)
    eff_dur = target_duration or audio_dur

    cmd = [
        "ffmpeg", "-y",
        "-i", str(video_path),
        "-i", str(audio_path),
        "-map", "0:v:0",
        "-map", "1:a:0",
        "-c:v", "libx264",
        "-pix_fmt", "yuv420p",
        "-r", "30",
        "-vf", "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
        "-c:a", "aac",
        "-b:a", "192k",
        "-t", str(eff_dur),
        str(output_path),
    ]
    subprocess.run(cmd, capture_output=True, check=True)
    return output_path


def concat_scenes(
    scene_videos: List[Path],
    output_path: Path,
    subtitles_srt: Optional[Path] = None,
) -> Path:
    """Concatenate sequential scene videos and optionally burn in subtitles."""
    output_path.parent.mkdir(parents=True, exist_ok=True)

    inputs = []
    filter_parts = []
    for i, vid in enumerate(scene_videos):
        inputs.extend(["-i", str(vid.resolve())])
        filter_parts.append(f"[{i}:v][{i}:a]")

    fc = "".join(filter_parts) + f"concat=n={len(scene_videos)}:v=1:a=1[v][a]"
    cmd = (
        ["ffmpeg", "-y"]
        + inputs
        + [
            "-filter_complex", fc,
            "-map", "[v]",
            "-map", "[a]",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-r", "30",
            "-c:a", "aac",
            "-b:a", "192k",
            str(output_path),
        ]
    )
    subprocess.run(cmd, capture_output=True, check=True)

    # Optional: Burn-in subtitles if provided and verified
    if subtitles_srt and subtitles_srt.exists():
        subbed_output = output_path.parent / "demo_with_subs.mp4"
        clean_srt = str(subtitles_srt.resolve()).replace("\\", "/").replace(":", "\\:")
        sub_cmd = [
            "ffmpeg", "-y",
            "-i", str(output_path),
            "-vf", f"subtitles='{clean_srt}':force_style='FontSize=20,PrimaryColour=&H00FFFFFF,OutlineColour=&H00000000,BackColour=&H80000000,BorderStyle=4'",
            "-c:v", "libx264",
            "-pix_fmt", "yuv420p",
            "-c:a", "copy",
            str(subbed_output),
        ]
        try:
            subprocess.run(sub_cmd, capture_output=True, check=True)
            # Replace output_path with subbed version
            subbed_output.replace(output_path)
        except Exception as e:
            logger.warning("Subtitle burn-in skipped: %s", e)

    return output_path
