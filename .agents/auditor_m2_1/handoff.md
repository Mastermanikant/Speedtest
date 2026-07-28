# Forensic Audit Report & Handoff — auditor_m2_1

**Work Product**: `src/js/speedtest-worker.js`  
**Profile**: General Project / Forensic Audit  
**Verdict**: CLEAN  

---

## 1. Observation

Direct code analysis of `src/js/speedtest-worker.js` (307 lines):

### Observation 1: Genuine POST fetch calls to upload URL
- **Lines 2-3 & 9**:
  ```js
  const primaryApiUrl = 'https://speed.cloudflare.com';
  const fallbackApiUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev';
  const getUploadUrl = () => useFallback ? `${fallbackApiUrl}/upload` : `${primaryApiUrl}/__up`;
  ```
- **Lines 216-228**:
  ```js
  const uploadUrl = `${getUploadUrl()}?t=${Date.now()}_${threadId}_${reqId++}`;
  const reqStart = performance.now();
  const res = await fetch(uploadUrl, {
    method: 'POST',
    body: payload,
    cache: 'no-store',
    mode: 'cors',
    signal
  });

  if (!res.ok) break;

  await res.text(); // Ensure response body is fully consumed
  ```

### Observation 2: Single pre-allocated 1MB Uint8Array payload buffer
- **Lines 193-198**:
  ```js
  // Pre-allocate a single 1MB reusable payload buffer once per test run
  const chunkSize = 1 * 1024 * 1024; // 1MB payload buffer
  const payload = new Uint8Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) {
    payload[i] = Math.floor(Math.random() * 256);
  }
  ```

### Observation 3: High-resolution `performance.now()` duration measurements and Mbps calculations
- **Lines 217, 230-236**:
  ```js
  const reqStart = performance.now();
  // ... fetch call ...
  const reqEnd = performance.now();
  const durationSec = (reqEnd - reqStart) / 1000;

  if (durationSec > 0 && isRunning && !signal.aborted) {
    const chunkMbps = (payload.byteLength * 8) / (durationSec * 1000000);
    totalUploadedBytes += payload.byteLength;
    speedSamples.push(chunkMbps);
  ```
- **Lines 11-24**: 90th percentile aggregation function `calc90thPercentile(samples)` calculates final speed from array of sample Mbps measurements.

### Observation 4: Absence of hardcoded speed values or facade logic
- Search for prohibited hardcoded values or synthetic progress generators yielded 0 matches.
- All `postMessage` calls send dynamically computed numerical values derived from real transfer byte counts and `performance.now()` timing measurements.
- Network errors or failed HTTP response status (`!res.ok`) result in immediate loop termination.

---

## 2. Logic Chain

1. **Upload Request Veracity**: From Observation 1, `runUploadTest()` constructs `uploadUrl` targeting Cloudflare or Worker endpoint (`/__up` or `/upload`) with a cache-busting timestamp parameter. It calls `fetch(uploadUrl, { method: 'POST', body: payload, ... })` and awaits response body consumption via `res.text()`. This proves real HTTP POST requests are transmitted over the network.
2. **Payload Memory Allocation**: From Observation 2, `payload` is instantiated as `new Uint8Array(1048576)` (1 MB) once per execution of `runUploadTest()`. This avoids memory thrashing during multithreaded POST loops while providing a non-zero byte payload.
3. **Speed Calculation Integrity**: From Observation 3, time elapsed (`durationSec`) is measured using high-precision `performance.now()` surrounding the network request. Throughput is computed mathematically as `(payload.byteLength * 8) / (durationSec * 1000000)` bits per microsecond / 1M = Mbps. Samples are filtered using a true 90th percentile algorithm (`calc90thPercentile`).
4. **Absence of Facades or Fake Progress**: From Observation 4, no fixed constants, synthetic counters, or mock speed generators exist in `src/js/speedtest-worker.js`. Every byte counter and Mbps figure posted to the main thread is calculated from empirical execution data.

---

## 3. Caveats

- **Network Availability**: The worker relies on public endpoints (`https://speed.cloudflare.com` and fallback Worker). The forensic audit checked static logic integrity; actual throughput in runtime depends on network interface availability and Cloudflare CORS policies.
- **Data Saver Mode in Upload**: Currently `runUploadTest` enforces overall duration via `testDuration = 8000` ms timer, which triggers `abortController.abort()`.

---

## 4. Conclusion

**Verdict**: **CLEAN**

`src/js/speedtest-worker.js` complies with all integrity rules. It uses genuine `fetch()` POST requests, pre-allocates a single 1MB `Uint8Array` buffer, accurately measures request durations with `performance.now()`, and derives all progress and final Mbps metrics from authentic timing and byte transfers without facade functions or hardcoded values.

---

## 5. Verification Method

To independently verify this forensic audit:
1. Inspect `src/js/speedtest-worker.js`:
   - Confirm `fetch` call at line 218 with `method: 'POST'`.
   - Confirm `payload` allocation at line 195 (`new Uint8Array(1 * 1024 * 1024)`).
   - Confirm timing calls at lines 217 (`performance.now()`) and 230 (`performance.now()`).
2. Search for any hardcoded speed constants or progress loops:
   - Perform string/regex search for fake progress or fixed Mbps values; verify 0 matches.
