# Empirical Handoff Report — Challenger M2_2

## Executive Summary
- **Overall Verdict**: **FAIL**
- **Target File**: `src/js/speedtest-worker.js` (and interaction with `src/js/engine.js` / `src/js/app.js`)
- **Key Failure Modes**:
  1. **Post-Abort Result Emission Leak**: `runUploadTest` emits `{ type: 'upload_result', data: ... }` even when explicitly cancelled via `command: 'abort'`. This causes `SpeedTestEngine.runUploadTest()` to resolve as a successful completion and `app.js` to render and persist truncated test metrics to history.
  2. **Concurrent Execution Leak on Overlapping Starts**: Dispatching an `upload` command while a previous upload test is running overwrites `abortController` without calling `.abort()` on the previous controller, creating orphaned concurrent upload threads that saturate network bandwidth and memory.

---

## 1. Observation

### Code Inspection
- **`src/js/speedtest-worker.js` (Lines 182–285)**:
  ```javascript
  async function runUploadTest(multiThread = true) {
    abortController = new AbortController();
    const signal = abortController.signal;
    ...
    try {
      await Promise.all([...tasks, latencyTask()]);
    } catch (e) {
      // Ignore any unhandled promise rejection if aborted
    } finally {
      clearTimeout(timer);
    }

    const finalSpeedMbps = calc90thPercentile(speedSamples);
    ...
    postMessage({
      type: 'upload_result',
      data: {
        speedMbps: finalSpeedMbps,
        totalBytes: totalUploadedBytes,
        loadedLatency: loadedLatencyAvg
      }
    });
  }
  ```
  - Observation: `runUploadTest` does not check `signal.aborted` after `Promise.all` resolves. It unconditionally emits `type: 'upload_result'`.
  - Observation: Line 183 (`abortController = new AbortController()`) does not check if an `abortController` already exists or call `abortController.abort()` before replacing the reference.

- **`src/js/speedtest-worker.js` (Lines 26 & 255)**:
  ```javascript
  async function pingEndpoint(url) {
    const start = performance.now();
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
    ...
  }
  ```
  - Observation: `pingEndpoint()` used by `measureLoadedLatency()` does not accept or pass `signal` to `fetch()`.

### Empirical Test Execution
- **Execution Command**:
  `node --expose-gc harness.js` (executed inside `d:\Speed test\.agents\challenger_m2_2`)

- **Verbatim Terminal Output**:
  ```text
  ==========================================
  TEST 1: Rapid Abort (500ms Abort)
  ==========================================
  - Requests before abort: 31
  - Worker emitted upload_result after explicit abort: true
    Emitted data: {"speedMbps":132.58228987498052,"totalBytes":28311552,"loadedLatency":10.97479999999996}

  ==========================================
  TEST 2: Server Delay (200ms latency per POST chunk)
  ==========================================
  - Requests in 1s under 200ms delay: 22
  - Requests started after abort: 0
  - Active requests remaining: 0

  ==========================================
  TEST 3: Stalled Ping Latency (Missing signal in pingEndpoint)
  ==========================================
  - Active HTTP requests before abort: 2 (includes 3s stalled ping)
  - Active HTTP requests 500ms after abort: 0

  ==========================================
  TEST 4: Rapid Start/Stop / Abort Cycles (20 Cycles)
  ==========================================
  - Heap memory growth after 20 cycles: 0.54 MB
  - Active requests remaining: 0

  ==========================================
  TEST 5: Overlapping Upload Commands without Prior Abort
  ==========================================
  - Total requests received after 2nd command: 23
  - Active HTTP requests (expected 4 if previous aborted, 8 if orphaned): 6

  ================================================================
  SUMMARY OF EMPIRICAL TEST RESULTS
  ================================================================
  ┌─────────┬──────┬────────────────────────────────────────────────────────────────┬─────────┬───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┐
  │ (index) │ ID   │ Test                                                           │ Verdict │ Findings                                                                                                                                                                  │
  ├─────────┼──────┼────────────────────────────────────────────────────────────────┼─────────┼───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┤
  │ 0       │ 'T1' │ 'Rapid Abort Result Emission (Post-Abort State Leak)'          │ 'FAIL'  │ 'Worker emits upload_result with partial metrics when aborted instead of abort error or suppressed completion.'                                                           │
  │ 1       │ 'T2' │ 'Server Delay (200ms POST chunk delay & abort)'                │ 'PASS'  │ 'Abort correctly interrupts pending delayed POST requests.'                                                                                                               │
  │ 2       │ 'T3' │ 'Stalled Ping Latency Cancellation (Un-signaled pingEndpoint)' │ 'PASS'  │ 'Ping request aborted cleanly.'                                                                                                                                           │
  │ 3       │ 'T4' │ 'Memory & Teardown under 20 Rapid Start/Stop Cycles'           │ 'PASS'  │ 'Heap growth: 0.54 MB, Active requests remaining: 0'                                                                                                                      │
  │ 4       │ 'T5' │ 'Overlapping Upload Command Handling (Missing auto-abort)'     │ 'FAIL'  │ "Re-issuing 'upload' command without prior abort overwrites global abortController without aborting the previous run. Both runs execute concurrently (3 active threads)." │
  └─────────┴──────┴────────────────────────────────────────────────────────────────┴─────────┴───────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────────┘
  ```

---

## 2. Logic Chain

1. **Premise 1**: When user triggers an abort, `self.onmessage` calls `abortController.abort()`.
2. **Step 1**: In `runUploadTest`, `signal.aborted` becomes `true`, causing in-flight `fetch` POST requests to abort and `uploadTask` loops to terminate (`break`).
3. **Step 2**: `Promise.all` resolves and execution reaches lines 277-284 in `speedtest-worker.js`.
4. **Step 3**: `runUploadTest` does not evaluate `signal.aborted`. It calculates percentile speeds on truncated data (e.g., 28.3MB in 500ms = 132.58 Mbps) and posts `upload_result`.
5. **Step 4**: `SpeedTestEngine._runWorkerCommand` receives `upload_result`, resolves the upload promise successfully, and `app.js` updates UI displays and writes incomplete results to storage.
6. **Premise 2**: If `command: 'upload'` is sent while a test is active:
7. **Step 5**: Line 183 creates `abortController = new AbortController()`. The previous `abortController` is NOT aborted.
8. **Step 6**: Run #1's threads continue executing using their closure reference to Run #1's `signal` (which is still active).
9. **Step 7**: Run #2 spawns 4 new threads using Run #2's `signal`. Both runs execute concurrently, causing network contention and duplicate message emissions.

---

## 3. Caveats

1. **Browser vs Node.js Environment**: The harness executes in Node.js using VM contexts and standard `fetch`/`AbortController`. While Node.js DOM-like primitives mirror Web Workers accurately, browser event loop scheduling under extreme DOM rendering load may introduce minor timing variances.
2. **Ping Signal Leak**: Under standard conditions, `pingEndpoint` finishes quickly (within tens of milliseconds), masking the fact that `pingEndpoint` does not pass `AbortSignal` to its `fetch` call.

---

## 4. Conclusion & Recommendations

### Final Assessment: **FAIL**
`src/js/speedtest-worker.js` passes memory stability checks (heap growth < 0.6MB over 20 rapid cycles) and correctly halts in-flight POST requests on server delay (200ms). However, it fails critical cancellation contract mechanics:
1. **Emits completion result on explicit abort**.
2. **Does not auto-abort active runs when starting a new upload test**.

### Actionable Recommendations for Implementer:
1. **Check `signal.aborted` before emitting result**:
   ```javascript
   if (!signal.aborted) {
     postMessage({
       type: 'upload_result',
       data: { speedMbps: finalSpeedMbps, totalBytes: totalUploadedBytes, loadedLatency: loadedLatencyAvg }
     });
   }
   ```
2. **Auto-abort existing controller on new test start**:
   ```javascript
   if (abortController) {
     abortController.abort();
   }
   abortController = new AbortController();
   ```
3. **Pass `signal` to `pingEndpoint`**:
   ```javascript
   async function pingEndpoint(url, signal) {
     const start = performance.now();
     const res = await fetch(url, { cache: 'no-store', mode: 'cors', signal });
     ...
   }
   ```

---

## 5. Verification Method

To independently verify these findings:

1. Navigate to `d:\Speed test\.agents\challenger_m2_2`.
2. Run the Node.js test harness:
   ```bash
   node --expose-gc harness.js
   ```
3. Inspect summary table output. Confirm:
   - Test 1 (T1) reports `FAIL` due to `upload_result` emitted post-abort.
   - Test 5 (T5) reports `FAIL` due to active concurrent threads when starting an overlapping upload test.
