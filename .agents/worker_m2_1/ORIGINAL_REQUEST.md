## 2026-07-28T06:32:01Z
You are Worker M2 (teamwork_preview_worker). Your task is to refactor the upload speed test engine in `d:\Speed test\src\js\speedtest-worker.js`.

Working Directory: `d:\Speed test\.agents\worker_m2_1`

Read the handoff report at `d:\Speed test\.agents\explorer_m1_1_gen2\handoff.md` and `d:\Speed test\PROJECT.md` for background context.

### Instructions:
1. Rewrite `runUploadTest` in `d:\Speed test\src\js\speedtest-worker.js`:
   - Replace legacy XHR `upload.onprogress` over a single 25MB buffer with Cloudflare's chunk-based POST technique using `fetch()`.
   - Pre-allocate a reusable 1MB payload buffer (`new Uint8Array(1024 * 1024)`) once.
   - Run `threads = multiThread ? 4 : 1` parallel async worker loops (`uploadTask`).
   - Each thread repeatedly posts small chunks (1MB or 5MB) using `fetch(url, { method: 'POST', body: payload, mode: 'cors', cache: 'no-store', signal })`.
   - Measure completion time for each POST request using `performance.now()`. Calculate instant speed (Mbps) = `(payload.byteLength * 8) / (durationSec * 1e6)`.
   - Post progress events: `postMessage({ type: 'upload_progress', data: mbps, totalBytes: totalUploadedBytes })`.
   - After `testDuration = 8000ms`, stop spawning requests, cancel in-flight fetches cleanly using `AbortController`, compute 90th percentile trimmed final upload speed (`calc90thPercentile`), and post `upload_result`.
2. Ensure `src/js/engine.js` compatibility is maintained (zero breaking interface changes).

MANDATORY INTEGRITY WARNING:
> DO NOT CHEAT. All implementations must be genuine. DO NOT hardcode test results, create dummy/facade implementations, or circumvent the intended task. A Forensic Auditor will independently verify your work. Integrity violations WILL be detected and your work WILL be rejected.

After completing code changes, verify your code syntax, write your handoff report to `d:\Speed test\.agents\worker_m2_1\handoff.md`, and notify parent via `send_message`.
