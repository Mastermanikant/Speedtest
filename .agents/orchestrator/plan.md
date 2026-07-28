# Master Execution Plan — Frankbase SpeedPulse Rebuild

## Objective
Rebuild Frankbase SpeedPulse internet speed test website in `d:\Speed test` with:
1. Fresh minimal dark UI (centered speedometer, Download/Upload/Ping result cards, glowing Chart.js graph, single START SPEED TEST button; NO Data Saver, NO Multi-Thread, NO history, NO bufferbloat).
2. Bug-free speed test engine:
   - Download 5s from `speed.cloudflare.com/__down` via periodic byte sampler
   - Upload 5s to `https://frankbase-speed-api.mastermanikant-in.workers.dev/upload` via periodic byte sampler (NEVER `speed.cloudflare.com/__up`)
   - Ping to `speed.cloudflare.com/cdn-cgi/trace`
   - Total test time < 15s
   - Web Worker timer calls `localAbortController.abort()` to cleanly exit async loops
   - Reset button to "START SPEED TEST" after completion
3. Real-time Chart.js graph (cyan download `#00f3ff`, purple upload `#9d4edd`).
4. GitHub deployment (git init/commit/push to `https://github.com/Mastermanikant/Speedtest.git`).
5. Mandatory adherence to project rules in `d:\Speed test\GEMINI.md`.

## Milestones & Strategy

### Milestone 1: Exploration & Codebase Analysis
- Dispatch 3 Explorers (`teamwork_preview_explorer`):
  - Explorer 1: Inspect `src/js/speedtest-worker.js` & `engine.js` for abort handling, timers, endpoints, byte sampler.
  - Explorer 2: Inspect `index.html`, `index.css`, `app.js` for minimal dark UI, Chart.js integration, single button state, removal of legacy toggles/history/bufferbloat.
  - Explorer 3: Inspect E2E test infra (`test_server.py`, `e2e_verify.py`) and git repository setup.

### Milestone 2: UI Rebuild & Speed Engine Implementation
- Worker (`teamwork_preview_worker`):
  - Refactor `index.html` & `index.css` to clean minimal dark UI.
  - Implement engine & Web Worker with periodic byte sampler, abort controller cleanup in timer, 5s download, 5s upload, ping RTT.
  - Implement Chart.js real-time glowing line graph (cyan download, purple upload).
- Dual Reviewers (`teamwork_preview_reviewer`): Check UI, engine logic, Rule 1-3 compliance, memory/abort safety.
- Dual Challengers (`teamwork_preview_challenger`): Execute static & runtime stress testing on engine & abort behavior.
- Forensic Auditor (`teamwork_preview_auditor`): Run integrity checks.

### Milestone 3: Automated E2E Testing & Playwright Verification
- Worker (`teamwork_preview_worker`):
  - Launch local server (`python -m http.server 8080`) and run Playwright script.
  - Validate: test completes < 20s, button resets to "START SPEED TEST", Download > 0, Upload > 0, Ping > 0, DOM has NO toggles/history.

### Milestone 4: GitHub Deployment
- Worker (`teamwork_preview_worker`):
  - Execute `git init`, set remote to `https://github.com/Mastermanikant/Speedtest.git`, commit, push to `main`.
  - Validate `git log`, `git remote -v`, and push output.

### Milestone 5: Forensic Audit & Final Gate
- Forensic Auditor (`teamwork_preview_auditor`): Complete final codebase integrity audit.
- Orchestrator: Report completion to Sentinel.
