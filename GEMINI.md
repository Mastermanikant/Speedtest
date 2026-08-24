# Frankbase SpeedPulse - Project Rules

## Rule 1: Keep Speed Test Apps Simple First
Build the minimal viable version first - no Data Saver toggle, no Multi-Thread toggle.
Single 'START TEST' button. Show Download, Upload, Ping only.
Add complexity only after basics are verified working.

## Rule 2: Web Worker Async Task Cleanup
Always call localAbortController.abort() in the timer callback.
Use separate userAborted flag for manual stops. Never use signal.aborted to block result.

## Rule 3: Upload Endpoint
Always use own Cloudflare Worker (/upload) for upload testing.
Never use speed.cloudflare.com/__up from Web Worker context.

## Rule 4: Deployment
Prefer GitHub-connected Cloudflare Pages over wrangler CLI for frontend.
Use wrangler CLI only for Cloudflare Workers (backend API) or fast manual testing. When doing manual frontend deploys, the Pages project name is `frankbase-speed` (e.g., `npx wrangler pages deploy . --project-name=frankbase-speed`). On Windows, always use `npx wrangler deploy` to avoid PowerShell ExecutionPolicy errors.

## Rule 5: API Priority & Failover Architecture
- Primary API: Always use own Cloudflare Worker (`frankbase-speed-api.mastermanikant-in.workers.dev`) as 1st priority for Ping, Download, and Upload.
- Secondary Failover: Fallback to `speed.cloudflare.com` only as 2nd priority if primary worker fails or drops network.
- Account Hosting: Host Worker on primary Cloudflare account alongside Pages frontend for initial phase (< 2,000–5,000 tests/day). Migrate Worker API to a dedicated secondary Cloudflare Account only when traffic scales significantly.

## Rule 6: Upload Speed Testing Logic
To accurately measure upload speed against Cloudflare Workers without RTT bottlenecking:
1. Use large payload chunks (minimum 4MB).
2. Use request pipelining (e.g., keep 2 requests in-flight simultaneously).
3. Skip zero-byte delta intervals in the speed sampler.

## Rule 7: Local Git & GitHub Sync
If `git push` fails with SSL certificate errors (due to custom Git paths on this specific machine), temporarily run `git config http.sslVerify false`, execute the push, and then re-enable it. When writing batch scripts, never use `errorlevel` to check if a git remote exists; check if the command output is empty instead.

## Rule 8: Parallel Execution via Sub-Agents
When a user request involves multiple independent tasks (e.g., updating different parts of the UI, changing the frontend and backend simultaneously, or processing multiple files), ALWAYS invoke multiple sub-agents in parallel using the `invoke_subagent` tool. Do not execute these tasks sequentially yourself if they can be parallelized.

## Rule 9: Web Worker XHR Abort & Error Resilience
- **Explicit XHR Abort**: Always maintain an `activeXhrs` Set when using `XMLHttpRequest` in Web Workers. In the timer callback, explicitly call `xhr.abort()` for all pending requests; relying solely on `AbortController.signal` will leave XHR requests hanging.
- **Error Loop Prevention**: Any XHR error or exception handler inside continuous worker loops must include a minimal backoff delay (e.g. 100ms) before re-initiating requests to avoid tight-loop CPU spinning and 0 Mbps false metrics.

## Rule 10: Service Worker Cache Busting
When deploying updates to the frontend HTML, CSS, or JS, you MUST increment the cache version to prevent stale versions on custom domains:
1. In `service-worker.js`, increment `CACHE_NAME` (e.g., `hyperspeed-cache-v11` -> `v12`).
2. In `index.html`, increment the version query string in the registration script (e.g., `service-worker.js?v=11` -> `v12`).

## Rule 11: UI Animation State Independence
When building modular UIs with optional execution phases (like Smart Settings toggles that skip Ping or Download), core UI animation loops (like `requestAnimationFrame(animateGauge)`) MUST be initiated globally at the start of the test handler, completely independent of the individual phase logic. Tying animation loops to optional test phases causes the UI to freeze if that phase is bypassed.
