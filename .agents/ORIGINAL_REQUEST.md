# Original User Request

## 2026-07-28T06:14:11Z

# Teamwork Project Prompt — Draft

> Status: Ready for launch — awaiting user approval
> Goal: Finalize prompt → get user approval → delegate to teamwork_preview

Refactor the upload speed test logic to match Cloudflare's chunk-based technique (using concurrent small POST requests and tracking completion time instead of XHR progress) to prevent browser freezing, and integrate a real-time speed graph using Chart.js into the UI.

Working directory: d:\Speed test
Integrity mode: development

## Requirements

### R1. Cloudflare-style Upload Engine
Rewrite the upload testing logic in `speedtest-worker.js`. Instead of relying on `XMLHttpRequest.upload.onprogress` with a single massive file, spawn multiple threads that repeatedly POST small fixed-size chunks (e.g., 1MB or 5MB). Calculate the upload speed based on the time it takes for each HTTP request to fully complete.

### R2. Advanced Glowing Real-Time UI Speed Graph
Integrate Chart.js into the frontend (`index.html` and `app.js`). Add a responsive, moving line graph below the main speedometer that plots the download and upload speeds in real-time as the test progresses. The design must be an advanced glowing line chart that matches the current zero-gravity theme.

## Acceptance Criteria

### Functionality & Verification
- [ ] **Verification**: The agent team must run a local Python HTTP server in `d:\Speed test` and write a Playwright/Puppeteer script to automate a click on "START SPEED TEST".
- [ ] **Upload Logic**: The Playwright script logs must demonstrate that the upload phase completes successfully and reports a final speed > 0 Mbps, proving the UI does not hang.
- [ ] **Graph Logic**: The source code must include Chart.js initialization, and the `onProgress` callbacks in `app.js` must contain code that pushes new data points to the chart instance and calls `chart.update()`.

## 2026-07-28T08:21:18Z

Rebuild the Frankbase SpeedPulse internet speed test website in `d:\Speed test` with a fresh, minimal dark UI. Remove all complexity (Data Saver, Multi-Thread toggles, Test History, Bufferbloat). Keep only: Download speed, Upload speed, Ping, and a real-time glowing graph. The result must be completely bug-free with working upload speed.

Working directory: d:\Speed test
Integrity mode: development

## Requirements

### R1. Complete UI Rewrite (Fresh Dark Minimal Design)
Replace `index.html` and `index.css` entirely with a new, premium dark minimal design. The page must have: a large centered speedometer/number display, three result cards (Download, Upload, Ping), a single START TEST button, and a real-time line graph below. NO Data Saver toggle, NO Multi-Thread toggle, NO test history table, NO bufferbloat section. Design must feel modern and premium — not generic.

### R2. Bug-Free Speed Test Engine
The speed test must complete reliably every time:
- Download test: fetch data from `speed.cloudflare.com/__down`, measure speed via periodic byte-counting sampler, run for 5 seconds
- Upload test: POST data to `https://frankbase-speed-api.mastermanikant-in.workers.dev/upload`, measure speed via periodic byte-counting sampler, run for 5 seconds. NEVER use `speed.cloudflare.com/__up` for upload
- Ping test: measure round-trip time to `speed.cloudflare.com/cdn-cgi/trace`
- Total test time must be under 15 seconds
- After test completes, the START TEST button MUST reset (never stay stuck as "TEST IN PROGRESS...")
- The Web Worker timer MUST call `abortController.abort()` to cleanly exit all async loops

### R3. Real-Time Graph
Display a Chart.js line graph that plots download speed (cyan line) and upload speed (purple line) in real-time during the test. The graph must update as data arrives.

### R4. GitHub Deployment
Initialize git in `d:\Speed test`, add remote `https://github.com/Mastermanikant/Speedtest.git`, commit all files, and push to the `main` branch. The push must succeed.

## Acceptance Criteria

### Functionality
- [ ] Running `python -m http.server 8080` in `d:\Speed test` and opening `http://localhost:8080` in Playwright headless browser, clicking START TEST, and waiting — the test must complete in under 20 seconds
- [ ] After test completes, the button text must be "START SPEED TEST" (not "TEST IN PROGRESS...")
- [ ] Upload speed value must be a number > 0 (not "--" or "0.00") when tested against the fallback worker
- [ ] Download value and Ping value must be numbers > 0

### UI Quality
- [ ] No Data Saver toggle visible in the DOM
- [ ] No Multi-Thread toggle visible in the DOM
- [ ] No history table visible in the DOM
- [ ] Page has exactly one START TEST button

### Deployment
- [ ] `git log --oneline` shows at least one commit
- [ ] `git remote -v` shows `https://github.com/Mastermanikant/Speedtest.git`
- [ ] `git push` completes without error (or reports "Everything up-to-date")

