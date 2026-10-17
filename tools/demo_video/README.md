# AsOf Automated Demo Video Recorder

Automated video generator for **AsOf: Bi-Temporal Claims Decision Agent** (Graph Hacks, Track: *Agents That Act on Connected Data*, Primary Database: *FalkorDB*).

Drives the **real running application** (Next.js frontend, FastAPI backend, and FalkorDB graph) with smooth, human-like Playwright interactions and synchronized neural narration.

---

## 1. Prerequisites & Setup

### Requirements
- **Python 3.11+**
- **FFmpeg & FFprobe**: Installed and available on your system `PATH`.
- **Node.js 20+**: To run the Next.js frontend (`cd frontend && npm install`).
- **FalkorDB**: Running either locally via Docker (`docker compose up -d falkordb`) or remote FalkorDB Cloud (configured in `.env`).

### Dependencies Installation
```bash
python -m pip install playwright edge-tts pyyaml httpx
python -m playwright install chromium
```

---

## 2. Running the Pipeline

### Standard Execution (Full 7-Scene Video Generation)
```bash
python -m tools.demo_video.run
```
- Automatically checks that FalkorDB, FastAPI, and Next.js are running (spawns them if needed).
- Executes preflight verification.
- Injects live numbers into narration templates from the real database & benchmark results.
- Synthesizes neural text-to-speech narration per scene.
- Records 1080p browser actions synchronized to audio length.
- Stitches the scenes with opening/closing title cards and exports synchronized subtitles.
- Executes postflight verification and security secret audit.
- Generates `tools/demo_video/output/demo.mp4` (~2:45 min).

### Dry-Run Mode (Validation without Video Capture)
Quickly test storyboard endpoints, graph queries, and narration templates without capturing video:
```bash
python -m tools.demo_video.run --dry-run
```

### Single-Scene Retakes
Re-record any individual scene (1 through 7) without re-recording the entire storyboard:
```bash
python -m tools.demo_video.run --scene 3
```

### Silent Mode (Manual Voiceover Support)
Produce a silent video while generating synchronized `narration.srt` subtitles and a plain `narration.txt` script:
```bash
python -m tools.demo_video.run --silent
```

### Changing the Narration Voice
Select any Microsoft Edge Neural voice:
```bash
python -m tools.demo_video.run --voice en-US-BrianNeural
# or en-US-JennyNeural, en-US-GuyNeural, en-GB-SoniaNeural
```

### Subtitle Control
By default, subtitles are **NOT** burned into the video. A separate `narration.srt` file is always exported to `tools/demo_video/output/narration.srt` for external video players or voiceover timing. If burned-in visual text overlay is ever needed, pass:
```bash
python -m tools.demo_video.run --burn-subtitles
```

---

## 3. Storyboard Scenes Overview

| Scene | Timestamp | Focus | Real App Interaction |
|---|---|---|---|
| **1. Hook** | 0:00 - 0:20 | Problem statement & track | Displays AsOf header, track badge, and FalkorDB connectivity. |
| **2. Impact Scan** | 0:20 - 0:55 | Retroactive ingestion | Ingests backdated flood rider, live SSE scan streams in, affected claim `CLM-HERO-001` flagged for reconsideration. |
| **3. Hero Claim** | 0:55 - 1:35 | Time slider & verdict flip | Scrubs slider from June 8 to June 11; `DENIED` flips to `APPROVED`; endorsement node illuminates; as-decided vs as-now-known diff. |
| **4. Agent & MCP** | 1:35 - 2:00 | Autonomous tool loop & MCP | Displays tool call sequence and Groq explanation; runs clean `mcp_client_demo.py` terminal script. |
| **5. Why a Graph** | 2:00 - 2:20 | Multi-hop & fraud rings | Highlights 4-hop coverage walk and provider-shop syndicate; opens live Cypher modal showing real queries. |
| **6. Trust** | 2:20 - 2:40 | Cryptographic receipts & firewall | Verifies SHA-256 receipt (`PASS`), tampers with DB record (`FAIL`), restores (`PASS`), tests adversarial prompt against temporal firewall. |
| **7. Results** | 2:40 - 3:00 | Live benchmark & tagline | Displays live benchmark comparison (zero leaks in AsOf vs 12 in latest-state); closes with tagline: *"Reconstruct the past. Know what the system knew."* |

---

## 4. Output Artifacts

All outputs are saved to `tools/demo_video/output/`:
- `demo.mp4`: Final finished video (1920x1080, 30fps, H.264 video, AAC audio, ~2:45 duration).
- `narration.srt`: Synchronized subtitle file.
- `narration.txt`: Plain script with timestamps and exact wordings.
- `report.json`: Execution metadata, file size, duration, and security audit confirmation.

---

## 5. Notes on What Could Not Be Automated

1. **Hardware-Specific Video Encoding:** The pipeline uses standard software `libx264` via FFmpeg to guarantee universal compatibility. If hardware acceleration (NVENC / QuickSync) is desired, configure FFmpeg flags.
2. **External Claude Desktop GUI Interaction:** While the MCP server and real Python MCP client (`mcp_client_demo.py`) are fully automated, launching the third-party proprietary Claude Desktop app GUI directly is not scripted to avoid desktop window manager dependencies.
3. **FalkorDB Cloud Latency:** When querying remote FalkorDB Cloud over public internet, network latency (~100-200ms per query) governs live response times. For maximum performance, run local Docker (`localhost:6379`).
