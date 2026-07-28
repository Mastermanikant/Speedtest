"""
Playwright Automated E2E Verification Script
Validates Speed Test application workflow, canvas/graph rendering, and upload speed completion.
Location: proposed in d:\Speed test\.agents\explorer_m1_3\proposed_e2e_verify.py
Target deployment: d:\Speed test\e2e_verify.py
"""

import os
import sys
import time
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright

SERVER_PORT = 8000
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"
PROJECT_ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))

def ensure_server_running():
    """Start local test_server.py if not already active."""
    try:
        urllib.request.urlopen(f"{SERVER_URL}/ping", timeout=1)
        print("✅ Local test server is already running.")
        return None
    except Exception:
        print("🚀 Starting local test server background process...")
        server_script = os.path.join(PROJECT_ROOT, "test_server.py")
        if not os.path.exists(server_script):
            # Fallback to proposed_test_server.py if test_server.py doesn't exist yet
            server_script = os.path.join(os.path.dirname(__file__), "proposed_test_server.py")

        proc = subprocess.Popen([sys.executable, server_script], cwd=PROJECT_ROOT)
        time.sleep(1.5)
        return proc

def run_e2e_verification():
    server_proc = ensure_server_running()
    console_logs = []
    page_errors = []

    try:
        with sync_playwright() as p:
            print("🌐 Launching Chromium browser...")
            browser = p.chromium.launch(headless=True)
            context = browser.new_context()
            page = context.new_page()

            # Attach console & error listeners
            page.on("console", lambda msg: console_logs.append(f"[{msg.type}] {msg.text}"))
            page.on("pageerror", lambda err: page_errors.append(str(err)))

            # Network Route Interception: Forward external API requests to local server
            def handle_route(route, request):
                url = request.url
                if "speed.cloudflare.com" in url or "frankbase-speed-api" in url:
                    rewritten_url = url.replace("https://speed.cloudflare.com", SERVER_URL)\
                                       .replace("https://frankbase-speed-api.mastermanikant-in.workers.dev", SERVER_URL)
                    route.continue_(url=rewritten_url)
                else:
                    route.continue_()

            page.route("**/*", handle_route)

            print(f"🔗 Navigating to {SERVER_URL}...")
            page.goto(SERVER_URL, wait_until="networkidle")

            # 1. Assert Start Button exists and click
            start_btn = page.locator("#startBtn")
            assert start_btn.is_visible(), "❌ Element #startBtn not found on page!"
            print("🖱️ Clicking 'START SPEED TEST'...")
            start_btn.click()

            # 2. Monitor test phase progression
            max_duration_sec = 35
            start_time = time.time()
            test_completed = False
            last_phase = ""

            while time.time() - start_time < max_duration_sec:
                phase = page.locator("#testPhaseLabel").inner_text()
                if phase != last_phase:
                    print(f"📊 Phase update: '{phase}'")
                    last_phase = phase

                if "Test Complete" in phase:
                    test_completed = True
                    break
                time.sleep(0.5)

            assert test_completed, f"❌ Speed test did not complete within {max_duration_sec}s! Final phase: '{last_phase}'"

            # 3. Read and validate final metrics
            dl_str = page.locator("#downloadValue").inner_text()
            ul_str = page.locator("#uploadValue").inner_text()
            ping_str = page.locator("#pingValue").inner_text()

            print(f"\n📈 Test Execution Results:")
            print(f"   Download Speed: {dl_str} Mbps")
            print(f"   Upload Speed:   {ul_str} Mbps")
            print(f"   Ping Latency:   {ping_str} ms")

            try:
                dl_mbps = float(dl_str)
                ul_mbps = float(ul_str)
            except ValueError as ve:
                raise AssertionError(f"❌ Metric values are invalid numbers: dl='{dl_str}', ul='{ul_str}'") from ve

            # Assertions
            assert dl_mbps > 0, f"❌ Download speed must be > 0 Mbps (got {dl_mbps})"
            assert ul_mbps > 0, f"❌ Upload speed must be > 0 Mbps (got {ul_mbps})"
            assert len(page_errors) == 0, f"❌ Page threw uncaught JS exceptions: {page_errors}"

            # 4. Validate Gauge / Graph visual elements
            gauge_canvas = page.locator("#gaugeCanvas")
            assert gauge_canvas.is_visible(), "❌ Element #gaugeCanvas is missing!"

            print("\n✨ ALL E2E VERIFICATION ASSERTIONS PASSED!")

            browser.close()
    finally:
        if server_proc:
            print("Cleaning up local test server process...")
            server_proc.terminate()

if __name__ == "__main__":
    run_e2e_verification()
