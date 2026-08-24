// Upload Speed Test Web Worker — v5 FINAL
//
// KEY FIX: Uses frankbase-speed-api (confirmed working with XHR from Web Worker)
// MEASUREMENT FIX: Count bytes via xhr.onload (status 200) only — NOT onprogress
// FORMULA: totalConfirmedBytes / totalElapsedSeconds = accurate wall-clock Mbps

const UPLOAD_URL = 'https://frankbase-speed-api.mastermanikant-in.workers.dev/api/upload';
const CHUNK_SIZE        = 512 * 1024; // 512 KB
const TEST_DURATION_MS  = 10000;      // 10 seconds
const CONCURRENCY       = 6;         // parallel connections

// Fill payload with pseudo-random bytes
const payload = new Uint8Array(CHUNK_SIZE);
for (let i = 0; i < CHUNK_SIZE; i++) payload[i] = Math.floor(Math.random() * 256);

// ─────────────────────────────────────────────────────────────────────────────
async function runUploadTest() {
  return new Promise((resolve) => {
    let isRunning           = true;
    let totalConfirmedBytes = 0; // counted ONLY on onload + status 200
    let completedRequests   = 0;
    let failedRequests      = 0;
    const activeXhrs = new Set(); // Rule 9: track for explicit abort
    const testStart  = performance.now();

    // ── Hard stop timer ───────────────────────────────────────────────────────
    const stopTimer = setTimeout(() => {
      isRunning = false;
      for (const xhr of activeXhrs) {
        try { xhr.abort(); } catch (e) {}
      }
    }, TEST_DURATION_MS);

    // ── Sampler: wall-clock speed every 500ms ─────────────────────────────────
    const samplerId = setInterval(() => {
      if (!isRunning) { clearInterval(samplerId); return; }
      if (totalConfirmedBytes === 0) return;
      const elapsedSec = (performance.now() - testStart) / 1000;
      // WALL-CLOCK FORMULA: total server-confirmed bytes / real elapsed seconds
      const mbps = (totalConfirmedBytes * 8) / (elapsedSec * 1_000_000);
      postMessage({ type: 'progress', mbps, completedRequests, totalConfirmedBytes,
                    elapsedSec: elapsedSec.toFixed(1) });
    }, 500);

    // ── Task done tracker ─────────────────────────────────────────────────────
    let finishedTasks = 0;
    function onTaskDone() {
      finishedTasks++;
      if (finishedTasks >= CONCURRENCY) {
        clearTimeout(stopTimer);
        clearInterval(samplerId);
        const totalElapsedSec = (performance.now() - testStart) / 1000;
        const finalMbps = totalConfirmedBytes > 0
          ? (totalConfirmedBytes * 8) / (totalElapsedSec * 1_000_000)
          : 0;
        resolve({ finalMbps, totalConfirmedBytes, completedRequests,
                  failedRequests, totalElapsedSec });
      }
    }

    // ── XHR upload task ───────────────────────────────────────────────────────
    function uploadTask(taskId) {
      function sendChunk() {
        if (!isRunning) { onTaskDone(); return; }

        const xhr = new XMLHttpRequest();
        const url = `${UPLOAD_URL}?t=${Date.now()}_${taskId}_${Math.random().toString(36).slice(2)}`;
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'text/plain'); // simple CORS, no preflight

        activeXhrs.add(xhr);

        // ✅ COUNT BYTES HERE — only when server confirms receipt (200 OK)
        // This is accurate: server actually received the data before responding.
        xhr.onload = () => {
          activeXhrs.delete(xhr);
          if (xhr.status === 200) {
            totalConfirmedBytes += CHUNK_SIZE;
            completedRequests++;
          } else {
            failedRequests++;
          }
          sendChunk(); // next chunk immediately
        };

        xhr.onerror = () => {
          activeXhrs.delete(xhr);
          failedRequests++;
          setTimeout(sendChunk, 100); // Rule 9: 100ms backoff on error
        };

        xhr.onabort = () => {
          activeXhrs.delete(xhr);
          onTaskDone(); // timer fired — this task is done
        };

        xhr.ontimeout = () => {
          activeXhrs.delete(xhr);
          failedRequests++;
          setTimeout(sendChunk, 100);
        };

        try {
          xhr.send(payload);
        } catch (e) {
          activeXhrs.delete(xhr);
          postMessage({ type: 'debug', msg: 'xhr.send() threw: ' + e.message });
          setTimeout(sendChunk, 100);
        }
      }
      sendChunk();
    }

    // ── Start all concurrent tasks ────────────────────────────────────────────
    for (let i = 0; i < CONCURRENCY; i++) {
      uploadTask(i);
    }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
async function runTest() {
  postMessage({ type: 'status', message: 'Connecting to upload server...' });

  // Warmup: fire-and-forget XHR to open connection before measurement
  const warmupXhr = new XMLHttpRequest();
  warmupXhr.open('POST', `${UPLOAD_URL}?warmup=1&t=${Date.now()}`, true);
  warmupXhr.setRequestHeader('Content-Type', 'text/plain');
  warmupXhr.timeout = 6000;
  const warmupDone = new Promise(res => {
    warmupXhr.onload = warmupXhr.onerror = warmupXhr.ontimeout = warmupXhr.onabort = () => res();
  });
  warmupXhr.send(new Uint8Array(64 * 1024));
  await warmupDone;

  postMessage({ type: 'status', message: `Measuring upload speed (${TEST_DURATION_MS / 1000}s)...` });
  const result = await runUploadTest();

  postMessage({
    type:                'result',
    finalMbps:           result.finalMbps,
    totalConfirmedBytes: result.totalConfirmedBytes,
    completedRequests:   result.completedRequests,
    failedRequests:      result.failedRequests,
    totalElapsedSec:     result.totalElapsedSec
  });
}

self.onmessage = (e) => {
  if (e.data.command === 'start') runTest();
};
