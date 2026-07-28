# Project: Speed Test Refactor & Glowing Speed Graph

## Architecture
- Frontend: `index.html`, `index.css`, `src/js/app.js` (UI speedometer, Chart.js glowing graph, web worker interface)
- Speedtest Worker: `src/js/speedtest-worker.js`, `src/js/engine.js` (Web Worker handling download & chunk-based concurrent upload POST requests)
- Verification & Backend: `test_server.py` (Python threaded HTTP server handling static files & speed endpoints) and `e2e_verify.py` (Playwright automated runner script)

## Milestones
| # | Name | Scope | Dependencies | Status |
|---|------|-------|-------------|--------|
| 1 | Codebase Exploration | Analyze existing worker, frontend app, CSS, HTML, and backend scripts | none | DONE |
| 2 | Cloudflare Upload Engine Refactor | Rewrite upload logic in worker to chunked concurrent POSTs tracking completion times | M1 | IN_PROGRESS |
| 3 | Glowing Chart.js Speed Graph | Integrate Chart.js glowing line chart in `index.html` & `app.js` with real-time updates | M1 | PLANNED |
| 4 | Automated E2E Verification | Python server setup & Playwright script automating speed test & validating upload > 0 Mbps & graph updates | M2, M3 | PLANNED |

## Interface Contracts
### Web Worker (`src/js/speedtest-worker.js`) ↔ Main Thread (`src/js/engine.js` / `src/js/app.js`)
- Commands sent to worker: `{ command: 'upload', options: { multiThread: boolean, dataSaverMode: boolean, apiUrl: string } }`
- Progress events posted from worker: `{ type: 'upload_progress', data: speedMbps, totalBytes: number }`
- Final result event: `{ type: 'upload_result', data: { speedMbps: number, totalBytes: number, loadedLatency: number } }`

### UI (`src/js/app.js`) ↔ Chart.js Instance (`#speedChart`)
- Chart initialization: Chart.js UMD import in `<head>`, canvas `<canvas id="speedChart">` in `<div class="graph-container">` inside `.gauge-section.glass-card`.
- Real-time update: `speedChart.data.labels.push(timestamp)`, `speedChart.data.datasets[0].data.push(speed)` for Download, `speedChart.data.datasets[1].data.push(speed)` for Upload, `speedChart.update('none')`.

## Code Layout
- Web worker logic: `src/js/speedtest-worker.js`
- Engine wrapper: `src/js/engine.js`
- Frontend logic: `src/js/app.js`, `index.html`, `index.css`
- E2E Test infrastructure: `test_server.py`, `e2e_verify.py`
