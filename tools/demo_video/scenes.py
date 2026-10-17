"""Playwright storyboard scenes implementation for AsOf demo video."""

import asyncio
import time
from typing import Dict, Any
from playwright.sync_api import Page, expect

FRONTEND_URL = "http://localhost:3000"


def inject_cursor_overlay(page: Page):
    """Inject visible glowing cursor and click ripple into the browser page."""
    page.evaluate("""() => {
        if (window.__cursorInjected) return;
        window.__cursorInjected = true;

        const cursor = document.createElement('div');
        cursor.id = 'demo-cursor';
        cursor.style.position = 'fixed';
        cursor.style.width = '20px';
        cursor.style.height = '20px';
        cursor.style.borderRadius = '50%';
        cursor.style.backgroundColor = 'rgba(6, 182, 212, 0.7)';
        cursor.style.border = '2px solid white';
        cursor.style.boxShadow = '0 0 12px rgba(6, 182, 212, 0.9)';
        cursor.style.pointerEvents = 'none';
        cursor.style.zIndex = '999999';
        cursor.style.transition = 'transform 0.08s ease-out';
        cursor.style.transform = 'translate(-50%, -50%)';
        cursor.style.top = '100px';
        cursor.style.left = '100px';
        document.body.appendChild(cursor);

        window.addEventListener('mousemove', (e) => {
            cursor.style.left = e.clientX + 'px';
            cursor.style.top = e.clientY + 'px';
        });

        window.addEventListener('mousedown', (e) => {
            const ripple = document.createElement('div');
            ripple.style.position = 'fixed';
            ripple.style.left = (e.clientX - 15) + 'px';
            ripple.style.top = (e.clientY - 15) + 'px';
            ripple.style.width = '30px';
            ripple.style.height = '30px';
            ripple.style.borderRadius = '50%';
            ripple.style.border = '2px solid #38bdf8';
            ripple.style.pointerEvents = 'none';
            ripple.style.zIndex = '999998';
            ripple.style.animation = 'ripple-anim 0.5s ease-out forwards';
            document.body.appendChild(ripple);
            setTimeout(() => ripple.remove(), 500);
        });

        const style = document.createElement('style');
        style.innerHTML = `
            @keyframes ripple-anim {
                0% { transform: scale(0.8); opacity: 1; }
                100% { transform: scale(2.2); opacity: 0; }
            }
        `;
        document.head.appendChild(style);
    }""")


def human_move(page: Page, target_selector: str, steps: int = 15):
    """Smooth human-like mouse movement toward an element."""
    try:
        box = page.locator(target_selector).first.bounding_box()
        if box:
            x = box["x"] + box["width"] / 2
            y = box["y"] + box["height"] / 2
            page.mouse.move(x, y, steps=steps)
            time.sleep(0.15)
    except Exception:
        pass


def human_click(page: Page, selector: str):
    """Smooth move and click."""
    human_move(page, selector, steps=12)
    time.sleep(0.1)
    page.locator(selector).first.click()
    time.sleep(0.3)


# =============================================================================
# SCENE 1: HOOK (0:00 to 0:20)
# =============================================================================
def record_scene_1_hook(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 1: Hook on Impact Scan page. Narrate problem and track."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Hover over branding and track badge
    human_move(page, "header", steps=20)
    time.sleep(1.5)

    human_move(page, "text=Bi-Temporal Claims Agent", steps=15)
    time.sleep(2.0)

    human_move(page, "text=FalkorDB:", steps=15)
    time.sleep(2.0)

    # Soft scroll / hover over hook title
    human_move(page, "h1", steps=15)
    time.sleep(2.0)

    # Pad remaining time to match narration audio
    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 2: IMPACT SCAN (0:20 to 0:55)
# =============================================================================
def record_scene_2_impact_scan(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 2: Click Ingest of backdated endorsement, show live SSE scan, affected claims."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Click Ingest Backdated Endorsement button
    ingest_btn = "button:has-text('Ingest Backdated Endorsement')"
    human_click(page, ingest_btn)

    # Watch progress bar and SSE event stream
    time.sleep(3.0)
    human_move(page, "text=Live SSE Event Stream", steps=15)
    time.sleep(3.0)

    # Hover over the affected claim card CLM-HERO-001
    affected_card = "text=CLM-HERO-001"
    human_move(page, affected_card, steps=20)
    time.sleep(3.5)

    # Hover over the verdict flip explanation
    human_move(page, "text=AS NOW KNOWN (JUNE 11)", steps=15)
    time.sleep(3.0)

    # Pad remaining time
    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 3: HERO CLAIM & TIME SLIDER (0:55 to 1:35)
# =============================================================================
def record_scene_3_hero_claim(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 3: Open hero claim, drag slider from June 8 to June 11, show verdict flip and faded nodes."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Navigate to Hero Claim tab
    human_click(page, "button:has-text('Hero Claim')")
    time.sleep(1.5)

    # Ensure slider starts at Position 0 (June 8)
    slider = page.locator("#system-time-slider")
    slider.fill("0")
    time.sleep(1.0)

    # Hover over the DENIED badge and faded "not yet known" endorsement node
    human_move(page, "text=DENIED", steps=15)
    time.sleep(2.0)

    human_move(page, "text=NOT YET KNOWN", steps=20)
    time.sleep(3.0)

    # Drag slider to Position 1 (June 11)
    slider_box = slider.bounding_box()
    if slider_box:
        start_x = slider_box["x"] + slider_box["width"] * 0.1
        end_x = slider_box["x"] + slider_box["width"] * 0.9
        y = slider_box["y"] + slider_box["height"] / 2

        page.mouse.move(start_x, y, steps=10)
        page.mouse.down()
        time.sleep(0.3)
        page.mouse.move(end_x, y, steps=25)
        page.mouse.up()
        slider.fill("1")

    time.sleep(2.5)

    # Pause on the APPROVED badge and illuminated endorsement node
    human_move(page, "text=APPROVED", steps=15)
    time.sleep(3.0)

    human_move(page, "text=END-HERO-001", steps=15)
    time.sleep(2.5)

    # Scroll down to compare as-decided vs as-now-known view
    human_move(page, "text=As-Decided vs. As-Now-Known Comparison", steps=15)
    time.sleep(3.5)

    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 4: AGENT & MCP (1:35 to 2:00)
# =============================================================================
def record_scene_4_agent_and_mcp(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 4: Show agent trace page, then demonstrate real MCP client execution."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Navigate to Agent & MCP tab
    human_click(page, "button:has-text('Agent & MCP')")
    time.sleep(1.5)

    # Click Run Agent Decision Loop
    human_click(page, "button:has-text('Run Agent Decision Loop')")
    time.sleep(2.5)

    # Highlight autonomous tool selection sequence
    human_move(page, "text=Autonomous Tool Selection Sequence", steps=15)
    time.sleep(2.5)

    # Highlight grounded LLM explanation
    human_move(page, "text=Grounded Agent Adjudication", steps=15)
    time.sleep(2.5)

    # Click Run Real MCP Client to execute tools/demo_video/mcp_client_demo.py
    human_click(page, "button:has-text('Run Real MCP Client')")
    time.sleep(3.0)

    # Highlight MCP terminal output
    human_move(page, "text=tools/demo_video/mcp_client_demo.py", steps=15)
    time.sleep(3.5)

    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 5: WHY A GRAPH (2:00 to 2:20)
# =============================================================================
def record_scene_5_why_graph(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 5: Show multi-hop evidence path and fraud cluster, then open View Query modal."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Navigate to Why Graph tab
    human_click(page, "button:has-text('Why Graph')")
    time.sleep(1.5)

    # Highlight fraud syndicate cluster
    human_move(page, "text=SYNDICATE DETECTED", steps=15)
    time.sleep(2.5)

    # Click View Cluster Cypher Query button
    human_click(page, "button:has-text('View Cluster Cypher Query')")
    time.sleep(1.5)

    # Pause on the live Cypher modal showing real query
    human_move(page, "pre:has-text('MATCH (c:Claim)')", steps=15)
    time.sleep(3.5)

    # Close modal
    human_click(page, "button:has-text('✕ Close')")
    time.sleep(1.0)

    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 6: TRUST & FIREWALL (2:20 to 2:40)
# =============================================================================
def record_scene_6_trust(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 6: Receipt verify PASS, tamper, show FAIL, restore PASS, adversarial firewall test."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Navigate to Trust & Firewall tab
    human_click(page, "button:has-text('Trust & Firewall')")
    time.sleep(1.5)

    # Highlight VERIFIED PASS badge
    human_move(page, "text=VERIFIED PASS", steps=15)
    time.sleep(2.0)

    # Click Malicious Tamper
    human_click(page, "button:has-text('Malicious Tamper')")
    time.sleep(1.5)

    # Highlight TAMPER DETECTED (FAIL) badge
    human_move(page, "text=TAMPER DETECTED", steps=15)
    time.sleep(2.5)

    # Click Restore Data Integrity
    human_click(page, "button:has-text('Restore Data Integrity')")
    time.sleep(1.5)

    # Move to Adversarial Testing panel and submit prompt
    human_move(page, "textarea", steps=15)
    time.sleep(1.0)
    human_click(page, "button:has-text('Send Adversarial Prompt')")
    time.sleep(2.5)

    # Highlight Firewall Invariant Enforced
    human_move(page, "text=Firewall Invariant Enforced", steps=15)
    time.sleep(2.5)

    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)


# =============================================================================
# SCENE 7: RESULTS & CLOSE (2:40 to 3:00)
# =============================================================================
def record_scene_7_results(page: Page, target_duration: float, data: Dict[str, Any]):
    """Scene 7: Benchmark page from real results file, close with tagline."""
    t0 = time.time()
    page.goto(FRONTEND_URL, wait_until="networkidle")
    inject_cursor_overlay(page)
    time.sleep(1.0)

    # Navigate to Benchmark tab
    human_click(page, "button:has-text('Benchmark')")
    time.sleep(1.5)

    # Highlight comparison table metrics
    human_move(page, "text=Future-Information Leaks", steps=15)
    time.sleep(2.5)

    human_move(page, "text=0 (Zero Leaks Guaranteed)", steps=15)
    time.sleep(2.5)

    human_move(page, "text=Verdict Accuracy vs Ground Truth", steps=15)
    time.sleep(2.5)

    # Scroll down to center on closing tagline card
    tagline = page.locator("text=Reconstruct the past. Know what the system knew.")
    tagline.scroll_into_view_if_needed()
    human_move(page, "text=Reconstruct the past. Know what the system knew.", steps=20)
    time.sleep(3.5)

    elapsed = time.time() - t0
    if elapsed < target_duration:
        time.sleep(target_duration - elapsed + 0.2)
