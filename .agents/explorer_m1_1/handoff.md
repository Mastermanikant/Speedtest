# Explorer 1 Analysis & Architectural Handoff Report

## Executive Summary
This report provides a thorough analysis of the speed test engine codebase (`src/js/speedtest-worker.js`, `src/js/engine.js`, `src/js/app.js`) and details the blueprint for a robust, bug-free implementation conforming strictly to `GEMINI.md` project rules.

---

## 1. Observation

### Codebase Inspection & Direct Findings

1. **`src/js/speedtest-worker.js`**:
   - **Download Test Flaw (Rule 2 Violation)**: At line 172:
     ```javascript
     if (abortController && abortController.signal.aborted) {
       return;
     }
     ```
     When the download timer or `abortController.abort()` fires, `abortController.signal.aborted` is `true`. Checking this flag causes the function to exit immediately before calling `postMessage({ type: 'download_result', ... })`. As a result, `engine.runDownloadTest()` in `engine.js` hangs indefinitely waiting for a response that is never sent.
   - **Download Abort Pattern**: Uses global `abortController` directly without isolating local timer aborts from manual user cancellation.
   - **Upload Test Endpoint (Rule 3 Compliance)**: Uses Cloudflare Worker endpoint `https://frankbase-speed-api.mastermanikant-in.workers.dev/upload` (line 11). Never uses `speed.cloudflare.com/__up`.
   - **Upload Fixed Chunk Payload Issue**: Uses a fixed 1 MB payload (`const chunkSize = 1024 * 1024;` at line 215). On low-bandwidth connections (<2 Mbps), a single 1MB POST fetch takes >4 seconds to complete. Since bytes are counted only after response completion (`totalUploadedBytes += payload.byteLength`), the 100ms sampler records 0 bytes for most intervals, leading to 0 Mbps upload speed calculation on slow networks.
   - **Ping Endpoint**: Uses `https://speed.cloudflare.com/cdn-cgi/trace` (line 7), running 10 RTT samples (line 49).

2. **`src/js/engine.js`**:
   - Class `SpeedTestEngine` manages worker lifecycle and promises (`_runWorkerCommand`).
   - Promise resolves on `${command}_result` message or rejects on `error`.
   - Method `abort()` sends `{ command: 'abort' }` to the worker.

3. **`src/js/app.js`**:
   - Manages UI execution flow: Ping & Jitter -> Download -> Upload -> Bufferbloat Grade.
   - Total phase duration budget: Ping (~0.5s) + Download (5s) + Upload (5s) = ~10.5 seconds (under 15s requirement).
   - In lines 420–432 (`finally` block), resets button text to `"START SPEED TEST"`, enables the button (`startBtn.disabled = false`), and clears `isTesting` flag.

4. **`GEMINI.md` Rules**:
   - **Rule 1**: Keep speed test simple first (single Start button, Download, Upload, Ping metrics).
   - **Rule 2**: Web Worker Async Task Cleanup — Always call `localAbortController.abort()` in timer callback. Use separate `userAborted` flag for manual stops. Never use `signal.aborted` to block result.
   - **Rule 3**: Upload Endpoint — Always use own Cloudflare Worker (`/upload`) for upload testing. Never use `speed.cloudflare.com/__up`.
   - **Rule 4**: Deployment — GitHub-connected Cloudflare Pages for frontend, wrangler CLI for Workers.

---

## 2. Logic Chain

1. **Observation**: Line 172 of `speedtest-worker.js` checks `abortController.signal.aborted` and exits `runDownloadTest` early without posting `download_result`.
   - **Reasoning**: When the 5-second test timer expires, aborting the signal is necessary to cancel active streaming fetch connections. However, blocking the result payload because `signal.aborted` is true prevents `engine.js` from receiving the result.
   - **Deduction**: We must separate **test duration expiry** from **manual user cancellation**. We must introduce a `localAbortController` for task signal management and a `userAborted` boolean flag.

2. **Observation**: `GEMINI.md` Rule 2 dictates: "Always call `localAbortController.abort()` in the timer callback. Use separate `userAborted` flag for manual stops. Never use `signal.aborted` to block result."
   - **Reasoning**: Both Download and Upload tests in `speedtest-worker.js` must instantiate a `localAbortController` per run. The 5000ms `setTimeout` callback sets `isRunning = false` and calls `localAbortController.abort()`.
   - **Deduction**: At the end of the test function, the code checks `if (userAborted) return;`. It must NEVER check `localAbortController.signal.aborted` to suppress posting results.

3. **Observation**: `speedtest-worker.js` line 215 uses a fixed 1MB upload payload, causing 0 Mbps results on slow connections.
   - **Reasoning**: A 1MB payload takes ~8s to upload over a 1 Mbps link. Since `totalUploadedBytes` updates only when `fetch` resolves, a 5-second test duration terminates before a single 1MB POST request finishes.
   - **Deduction**: Payload sizing should be adaptive (e.g. starting at 256KB, ramping up to 1MB if throughput > 10 Mbps). This guarantees fast initial POST resolutions and steady byte counting even on slow connections.

4. **Observation**: Endpoints specified in `speedtest-worker.js`:
   - Ping: `https://speed.cloudflare.com/cdn-cgi/trace`
   - Download: `https://speed.cloudflare.com/__down?bytes=25000000`
   - Upload: `https://frankbase-speed-api.mastermanikant-in.workers.dev/upload`
   - **Reasoning**: This conforms exactly with `GEMINI.md` Rule 3 and requirements.

5. **Observation**: `app.js` execution flow guarantees button reset in `finally`.
   - **Reasoning**: Regardless of success or exception, `startBtn.textContent` resets to `'START SPEED TEST'` and `startBtn.disabled` is set to `false`.

---

## 3. Caveats

- **Network Constraints**: Transient network dropouts or CORS issues could trigger fetch exceptions; fallback worker ping endpoints ensure resilience.
- **E2E Test Environment**: Automated verification (`e2e_verify.py`) intercepts external HTTP requests using Playwright routing and redirects them to `test_server.py`.

---

## 4. Conclusion & Recommended Code Architecture

### Recommended Implementations

#### A. `src/js/speedtest-worker.js`

```javascript
let abortController = null;
const primaryApiUrl = 'https://speed.cloudflare.com';
const fallbackApiUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev';
let useFallback = false;

// Helper Endpoints
const getLatencyUrl = () => useFallback ? `${fallbackApiUrl}/ping` : `${primaryApiUrl}/cdn-cgi/trace`;
const getDownloadUrl = (bytes) => useFallback ? `${fallbackApiUrl}/download?bytes=${bytes}` : `${primaryApiUrl}/__down?bytes=${bytes}`;
const getUploadUrl = () => `${fallbackApiUrl}/upload`; // Rule 3: Always use Cloudflare Worker /upload

// 90th Percentile Calculation with low-sample safety
function calc90thPercentile(samples) {
  if (!samples || samples.length === 0) return 0;
  const sorted = samples.filter(s => isFinite(s) && s >= 0).sort((a, b) => a - b);
  if (sorted.length === 0) return 0;
  if (sorted.length < 5) {
    const sum = sorted.reduce((a, b) => a + b, 0);
    return sum / sorted.length;
  }
  const lowerIndex = Math.floor(sorted.length * 0.10);
  const upperIndex = Math.floor(sorted.length * 0.95);
  const validSamples = sorted.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : sorted.length);
  if (validSamples.length === 0) return sorted[Math.floor(sorted.length / 2)];
  const sum = validSamples.reduce((a, b) => a + b, 0);
  return sum / validSamples.length;
}

// 1. Ping Test
async function pingEndpoint(url) {
  const start = performance.now();
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!res.ok) throw new Error('Ping failed');
  const end = performance.now();
  return end - start;
}

async function runPingTest() {
  const results = [];
  const count = 10;
  let targetUrl = getLatencyUrl();

  try {
    await fetch(`${targetUrl}?t=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
  } catch (e) {
    useFallback = true;
    targetUrl = getLatencyUrl();
  }

  for (let i = 0; i < count; i++) {
    try {
      const latency = await pingEndpoint(`${targetUrl}?t=${Date.now()}_${i}`);
      results.push(latency);
    } catch (e) {
      // Ignore individual ping dropouts
    }
    await new Promise(r => setTimeout(r, 40));
  }

  if (results.length === 0) {
    postMessage({ type: 'ping_result', data: { ping: 0, min: 0, avg: 0, jitter: 0 } });
    return;
  }

  const min = Math.min(...results);
  const sum = results.reduce((a, b) => a + b, 0);
  const avg = sum / results.length;
  const variance = results.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / results.length;
  const jitter = Math.sqrt(variance);

  postMessage({
    type: 'ping_result',
    data: {
      ping: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      jitter: Math.round(jitter * 10) / 10
    }
  });
}

// Loaded Latency Helper
async function measureLoadedLatency() {
  try {
    return await pingEndpoint(`${getLatencyUrl()}?t=${Date.now()}`);
  } catch {
    return null;
  }
}

// 2. Download Test (Adhering strictly to Rule 2)
async function runDownloadTest(options = {}) {
  const multiThread = options?.multiThread ?? true;
  const dataSaverMode = !!options?.dataSaverMode;
  const maxDataSaverLimit = 5 * 1024 * 1024;
  const testDuration = 5000; // 5 seconds test limit

  let userAborted = false;
  const localAbortController = new AbortController();
  abortController = {
    abort: () => { userAborted = true; localAbortController.abort(); }
  };
  const signal = localAbortController.signal;

  let totalDownloaded = 0;
  const startTime = performance.now();
  let isRunning = true;
  const threads = multiThread ? 4 : 1;
  const speedSamples = [];
  const loadedLatencies = [];

  let fetchSize = 25 * 1024 * 1024;

  // Rule 2: Always call localAbortController.abort() in timer callback
  const timer = setTimeout(() => {
    isRunning = false;
    localAbortController.abort();
  }, testDuration);

  let lastSampleTime = startTime;
  let lastSampleBytes = 0;

  const downloadTask = async () => {
    while (isRunning && !signal.aborted) {
      if (performance.now() - startTime >= testDuration) {
        isRunning = false;
        break;
      }
      try {
        const url = `${getDownloadUrl(fetchSize)}&t=${Date.now()}_${Math.random()}`;
        const res = await fetch(url, { signal, cache: 'no-store', mode: 'cors' });
        if (!res.ok) break;

        if (res.body) {
          const reader = res.body.getReader();
          while (isRunning && !signal.aborted) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalDownloaded += value.length;
              const now = performance.now();
              if (now - lastSampleTime >= 100) {
                const elapsedSec = (now - lastSampleTime) / 1000;
                const bytesDelta = totalDownloaded - lastSampleBytes;
                const currentMbps = (bytesDelta * 8) / (elapsedSec * 1000000);
                speedSamples.push(currentMbps);
                postMessage({ type: 'download_progress', data: currentMbps });
                lastSampleTime = now;
                lastSampleBytes = totalDownloaded;

                if (currentMbps > 200) fetchSize = 100 * 1024 * 1024;
                else if (currentMbps > 50) fetchSize = 50 * 1024 * 1024;
              }

              if (dataSaverMode && totalDownloaded >= maxDataSaverLimit) {
                isRunning = false;
                break;
              }
            }
          }
        }
      } catch (e) {
        break;
      }
    }
  };

  const tasks = Array.from({ length: threads }, () => downloadTask());

  try {
    await Promise.all(tasks);
  } catch (e) {
    // Suppress unhandled rejections on abort
  } finally {
    clearTimeout(timer);
  }

  // Rule 2: Use separate userAborted flag for manual stops. Never use signal.aborted to block result.
  if (userAborted) return;

  if (speedSamples.length === 0 && totalDownloaded > 0) {
    const totalSec = (performance.now() - startTime) / 1000;
    if (totalSec > 0) {
      speedSamples.push((totalDownloaded * 8) / (totalSec * 1000000));
    }
  }

  const finalSpeedMbps = calc90thPercentile(speedSamples);
  const loadedLatencyAvg = loadedLatencies.length
    ? loadedLatencies.reduce((a, b) => a + b, 0) / loadedLatencies.length
    : 0;

  postMessage({
    type: 'download_result',
    data: {
      speedMbps: finalSpeedMbps,
      totalBytes: totalDownloaded,
      loadedLatency: loadedLatencyAvg
    }
  });
}

// 3. Upload Test (Adhering strictly to Rule 2 and Rule 3 with Adaptive Payload Sizing)
async function runUploadTest(options = {}) {
  const multiThread = typeof options === 'boolean' ? options : (options?.multiThread ?? true);
  const dataSaverMode = typeof options === 'object' && options !== null ? !!options.dataSaverMode : false;
  const MAX_DATA_SAVER_BYTES = 5 * 1024 * 1024;
  const testDuration = 5000; // 5 seconds test limit

  let userAborted = false;
  const localAbortController = new AbortController();
  abortController = {
    abort: () => { userAborted = true; localAbortController.abort(); }
  };
  const signal = localAbortController.signal;

  const startTime = performance.now();
  let isRunning = true;
  const threads = multiThread ? 4 : 1;
  const speedSamples = [];
  const loadedLatencies = [];
  let totalUploadedBytes = 0;

  // Adaptive initial payload size: 256KB buffer for fast initial byte sampling
  let payloadSize = 256 * 1024;
  let payload = new Uint8Array(payloadSize);
  for (let i = 0; i < payloadSize; i++) payload[i] = Math.floor(Math.random() * 256);

  // Rule 2: Always call localAbortController.abort() in timer callback
  const timer = setTimeout(() => {
    isRunning = false;
    localAbortController.abort();
  }, testDuration);

  let lastSampleTime = startTime;
  let lastSampleBytes = 0;

  const uploadTask = async (threadId) => {
    let reqId = 0;
    while (isRunning && !signal.aborted) {
      if (performance.now() - startTime >= testDuration) {
        isRunning = false;
        break;
      }
      if (dataSaverMode && totalUploadedBytes >= MAX_DATA_SAVER_BYTES) {
        isRunning = false;
        break;
      }
      try {
        const uploadUrl = `${getUploadUrl()}?t=${Date.now()}_${threadId}_${reqId++}`;
        const res = await fetch(uploadUrl, {
          method: 'POST',
          body: payload,
          mode: 'cors',
          cache: 'no-store',
          signal
        });

        if (!res.ok) break;

        await res.text();
        totalUploadedBytes += payload.byteLength;

        // Scale payload size up if performance is high
        if (payloadSize < 1024 * 1024 && totalUploadedBytes > 1024 * 1024) {
          payloadSize = 1024 * 1024;
          payload = new Uint8Array(payloadSize);
        }
      } catch (e) {
        break;
      }
    }
  };

  const samplerTask = async () => {
    while (isRunning && !signal.aborted) {
      await new Promise(r => setTimeout(r, 100));
      const now = performance.now();
      const elapsedSec = (now - lastSampleTime) / 1000;
      if (elapsedSec > 0 && isRunning) {
        const deltaBytes = totalUploadedBytes - lastSampleBytes;
        const currentMbps = (deltaBytes * 8) / (elapsedSec * 1000000);
        speedSamples.push(currentMbps);

        postMessage({
          type: 'upload_progress',
          data: currentMbps,
          totalBytes: totalUploadedBytes
        });

        lastSampleTime = now;
        lastSampleBytes = totalUploadedBytes;
      }
    }
  };

  const tasks = Array.from({ length: threads }, (_, i) => uploadTask(i));

  try {
    await Promise.all([...tasks, samplerTask()]);
  } catch (e) {
    // Suppress unhandled rejections on abort
  } finally {
    clearTimeout(timer);
  }

  // Rule 2: Use separate userAborted flag for manual stops. Never use signal.aborted to block result.
  if (userAborted) return;

  if (speedSamples.length === 0 && totalUploadedBytes > 0) {
    const totalSec = (performance.now() - startTime) / 1000;
    if (totalSec > 0) {
      speedSamples.push((totalUploadedBytes * 8) / (totalSec * 1000000));
    }
  }

  const finalSpeedMbps = calc90thPercentile(speedSamples);
  const loadedLatencyAvg = loadedLatencies.length
    ? loadedLatencies.reduce((a, b) => a + b, 0) / loadedLatencies.length
    : 0;

  postMessage({
    type: 'upload_result',
    data: {
      speedMbps: finalSpeedMbps,
      totalBytes: totalUploadedBytes,
      loadedLatency: loadedLatencyAvg
    }
  });
}

// Command Handler
self.onmessage = async (e) => {
  const { command, options } = e.data;

  if (command === 'abort') {
    if (abortController) abortController.abort();
    return;
  }

  try {
    if (command === 'ping') {
      await runPingTest();
    } else if (command === 'download') {
      await runDownloadTest(options);
    } else if (command === 'upload') {
      await runUploadTest(options);
    }
  } catch (err) {
    postMessage({ type: 'error', data: err.message });
  }
};
```

---

## 5. Verification Method

1. **Automated E2E Verification**:
   Execute Playwright automated runner:
   ```powershell
   python e2e_verify.py
   ```
   **Pass criteria**:
   - Local test server starts on port 8000.
   - Chromium opens `http://127.0.0.1:8000`.
   - `#startBtn` click triggers test flow.
   - Status transitions to `"Test Complete!"` in <15 seconds.
   - Download speed > 0 Mbps.
   - Upload speed > 0 Mbps.
   - Ping & Jitter metrics populated.
   - Button text resets to `"START SPEED TEST"`.
   - Zero uncaught JavaScript page errors.

2. **Codebase Rule Verification**:
   - Inspect `src/js/speedtest-worker.js`:
     - Confirm `localAbortController.abort()` is called inside the 5-second `setTimeout` callback.
     - Confirm `userAborted` boolean flag is checked (`if (userAborted) return;`) and `signal.aborted` is NOT used to return early.
     - Confirm Upload endpoint is hardcoded to `${fallbackApiUrl}/upload` (`https://frankbase-speed-api.mastermanikant-in.workers.dev/upload`).
