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
Use wrangler CLI only for Cloudflare Workers (backend API).

## Rule 5: API Priority & Failover Architecture
- Primary API: Always use own Cloudflare Worker (`frankbase-speed-api.mastermanikant-in.workers.dev`) as 1st priority for Ping, Download, and Upload.
- Secondary Failover: Fallback to `speed.cloudflare.com` only as 2nd priority if primary worker fails or drops network.
- Account Hosting: Host Worker on primary Cloudflare account alongside Pages frontend for initial phase (< 2,000–5,000 tests/day). Migrate Worker API to a dedicated secondary Cloudflare Account only when traffic scales significantly.

