## 2026-07-28T12:04:31Z
You are Worker M3 (teamwork_preview_worker).
Your task is to implement Milestone 3: Integrate Advanced Glowing Chart.js Real-time Speed Graph into `index.html`, `index.css`, and `src/js/app.js`.

MANDATORY INTEGRITY WARNING:
DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

Instructions:
1. Working directory for metadata: `d:\Speed test\.agents\worker_m3_1`. Initialize `progress.md` and `BRIEFING.md` in your working directory.
2. Read `d:\Speed test\PROJECT.md` and `d:\Speed test\.agents\explorer_m1_2\handoff.md` for UI and Chart.js design specifications.
3. Update `index.html`:
   - Import Chart.js UMD UMD CDN script tag in `<head>`: `<script src="https://cdn.jsdelivr.net/npm/chart.js@4.4.1/dist/chart.umd.min.js"></script>`.
   - Add canvas container `<div class="graph-container"><canvas id="speedChart"></canvas></div>` inside `.gauge-section.glass-card` below `#startBtn`.
4. Update `index.css`:
   - Add styles for `.graph-container` and `#speedChart` with dark theme styling, glass card aesthetics, responsive height (180px), and cyan drop-shadow filter (`drop-shadow(0 0 10px rgba(6, 182, 212, 0.4))`).
5. Update `src/js/app.js`:
   - Declare `speedChart` and `initSpeedChart()` function.
   - Initialize Chart.js line graph instance with custom cyan (`#06b6d4`) gradient for Download and purple (`#8b5cf6`) gradient for Upload datasets. Set `tension: 0.4`, `pointRadius: 0`, `animation: false`.
   - On `#startBtn` click (test reset), clear datasets and labels.
   - In `engine.runDownloadTest(onProgress)` callback: push timestamp and Mbps value to dataset 0 (`Download`), call `speedChart.update('none')`.
   - In `engine.runUploadTest(onProgress)` callback: push timestamp and Mbps value to dataset 1 (`Upload`), call `speedChart.update('none')`.
6. Run syntax verification (`node --check src/js/app.js`).
7. Write your implementation report and test results in `d:\Speed test\.agents\worker_m3_1\handoff.md`.
8. Send a completion message back to parent orchestrator.
