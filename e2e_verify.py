"""
Playwright Automated E2E Verification Script
Validates Speed Test application workflow, canvas/graph rendering, and download/upload speed completion.
Location: d:\Speed test\e2e_verify.py
"""

import os
import sys
import time
import subprocess
import urllib.request
from playwright.sync_api import sync_playwright

if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8')

SERVER_PORT = 8000
SERVER_URL = f"http://127.0.0.1:{SERVER_PORT}"
PROJECT_ROOT = os.path.dirname(os.path.abspath(__file__))

def ensure_server_running():
    """Start local test_server.py if not already active."""
    server_active = False
    try:
        req = urllib.request.urlopen(f"{SERVER_URL}/ping", timeout=0.5)
        if req.status == 200:
            server_active = True
    except Exception:
        server_active = False

    if server_active:
        print("✅ Local test server is already running.")
        return None

    print("🚀 Starting local test server background process...")
    server_script = os.path.join(PROJECT_ROOT, "test_server.py")
    if not os.path.exists(server_script):
        raise FileNotFoundError(f"❌ Could not find {server_script}")

    proc = subprocess.Popen([sys.executable, server_script], cwd=PROJECT_ROOT)
    for _ in range(20):
        time.sleep(0.3)
        try:
            req = urllib.request.urlopen(f"{SERVER_URL}/ping", timeout=0.5)
            if req.status == 200:
                print("✅ Local test server started successfully.")
                return proc
        except Exception:
            pass
    raise RuntimeError("❌ Server failed to start within timeout.")

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

            # Network Route Interception: Direct Mock Fulfillment for API requests
            def handle_route(route, request):
                url = request.url
                if "speed.cloudflare.com" in url or "frankbase-speed-api" in url or "ipapi.co" in url:
                    if "/ping" in url or "/cdn-cgi/trace" in url:
                        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, content_type="text/plain", body=b"pong\nip=127.0.0.1\nloc=LOCAL\n")
                    elif "ipapi" in url or "json" in url:
                        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, content_type="application/json", body=b'{"org":"Localhost Node","city":"Localhost","country_code":"LOCAL"}')
                    elif "/upload" in url or "/__up" in url:
                        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, content_type="application/json", body=b'{"status":"ok"}')
                    elif "/download" in url or "/__down" in url:
                        dummy_data = b"X" * (1024 * 1024 * 2)
                        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, content_type="application/octet-stream", body=dummy_data)
                    else:
                        route.fulfill(status=200, headers={"Access-Control-Allow-Origin": "*"}, body=b"OK")
                else:
                    route.continue_()

            context.route("**/*", handle_route)

            print(f"🔗 Navigating to {SERVER_URL}...")
            page.goto(SERVER_URL, wait_until="networkidle")

            # 1. Assert Start Button exists and click
            start_btn = page.locator("#startBtn")
            assert start_btn.is_visible(), "❌ Element #startBtn not found or not visible on page!"
            print("🖱️ Clicking 'START SPEED TEST'...")
            start_btn.click()

            # 2. Monitor test phase progression
            max_duration_sec = 45
            start_time = time.time()
            test_completed = False
            last_phase = ""

            while time.time() - start_time < max_duration_sec:
                phase = page.locator("#testPhaseLabel").inner_text()
                if phase != last_phase:
                    print(f"📊 Phase update: '{phase}'")
                    last_phase = phase

                if "TEST COMPLETE" in phase.upper():
                    test_completed = True
                    break
                time.sleep(0.5)

            assert test_completed, f"❌ Speed test did not complete within {max_duration_sec}s! Final phase: '{last_phase}'"

            # 3. Read and validate final metrics
            dl_str = page.locator("#downloadValue").inner_text()
            ul_str = page.locator("#uploadValue").inner_text()
            ping_str = page.locator("#pingValue").inner_text()
            jitter_str = page.locator("#jitterValue").inner_text()
            bb_str = page.locator("#bufferbloatGrade").inner_text()

            print(f"\n📈 Test Execution Results:")
            print(f"   Download Speed:    {dl_str} Mbps")
            print(f"   Upload Speed:      {ul_str} Mbps")
            print(f"   Ping Latency:      {ping_str} ms")
            print(f"   Jitter:            {jitter_str} ms")
            print(f"   Bufferbloat Grade: {bb_str}")

            try:
                dl_mbps = float(dl_str)
                ul_mbps = float(ul_str)
            except ValueError as ve:
                raise AssertionError(f"❌ Metric values are invalid numbers: dl='{dl_str}', ul='{ul_str}'") from ve

            # Assertions
            assert dl_mbps > 0, f"❌ Download speed must be > 0 Mbps (got {dl_mbps})"
            assert ul_mbps > 0, f"❌ Upload speed must be > 0 Mbps (got {ul_mbps})"

            # 4. Validate Canvas Speedometer & Real-Time Chart visual elements
            gauge_canvas = page.locator("#gaugeCanvas")
            assert gauge_canvas.is_visible(), "❌ Element #gaugeCanvas is missing or not visible!"

            speed_chart = page.locator("#speedChart")
            assert speed_chart.is_visible(), "❌ Element #speedChart is missing or not visible!"

            assert len(page_errors) == 0, f"❌ Page threw uncaught JS exceptions: {page_errors}"

            print("\n✨ ALL E2E VERIFICATION ASSERTIONS PASSED!")

            browser.close()
    finally:
        if server_proc:
            print("Cleaning up background local test server process...")
            server_proc.terminate()

if __name__ == "__main__":
    run_e2e_verification()
