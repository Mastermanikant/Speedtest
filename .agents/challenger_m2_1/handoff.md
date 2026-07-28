# Handoff Report — Challenger M2_1

**Target File**: `src/js/speedtest-worker.js`  
**Verdict**: **FAIL**

---

## 1. Observation

Empirical stress testing of `src/js/speedtest-worker.js` was conducted using a standalone Node.js test harness (`d:\Speed test\.agents\challenger_m2_1\test_harness.js`) simulating multi-threaded network environments, timing boundaries, and array samples.

### Direct Code Quotes & Findings

1. **Multi-Thread Upload Speed Calculation Flaw (Lines 234 & 272)**:
   ```javascript
   234: const chunkMbps = (payload.byteLength * 8) / (durationSec * 1000000);
   235: totalUploadedBytes += payload.byteLength;
   236: speedSamples.push(chunkMbps);
   ...
   272: const finalSpeedMbps = calc90thPercentile(speedSamples);
   ```
   - **Observation**: `chunkMbps` calculates the speed of an individual POST request on a single thread stream. When `multiThread = true` (4 parallel threads streaming POST requests), each thread records its own per-stream throughput (e.g. 20.97 Mbps per thread). `speedSamples` collects these per-stream rates, and `calc90thPercentile(speedSamples)` averages them to report `20.97 Mbps`.
   - **Empirical Output**:
     - Total uploaded data across 4 threads: `83 MB` in `2.0 seconds` (actual aggregate throughput = `83.88 Mbps`).
     - Reported final speed: `20.97 Mbps`.
     - **Discrepancy**: Reported speed is **4x lower** than actual connection upload bandwidth.

2. **Data Accounting Loss on Zero-Duration Requests (Lines 233-236)**:
   ```javascript
   233: if (durationSec > 0 && isRunning && !signal.aborted) {
   234:   const chunkMbps = (payload.byteLength * 8) / (durationSec * 1000000);
   235:   totalUploadedBytes += payload.byteLength;
   236:   speedSamples.push(chunkMbps);
   ...
   243: }
   ```
   - **Observation**: `totalUploadedBytes += payload.byteLength` is nested inside `if (durationSec > 0)`. When a fast request completes in `0ms` (`reqEnd === reqStart`, `durationSec = 0`), the `if` condition evaluates to `false`.
   - **Empirical Output**: In Test 3.1 with 10 completed 1MB uploads occurring at `durationSec = 0`:
     - Requests completed: `10` (10 MB uploaded).
     - `totalUploadedBytes` reported: `1,048,576 bytes` (1 MB counted only when clock ticked, 9 MB silently dropped).

3. **`calc90thPercentile` Mathematical Misnomer & In-Place Mutation (Lines 11-24)**:
   ```javascript
   11: function calc90thPercentile(samples) {
   12:   if (samples.length === 0) return 0;
   13:   // Sort ascending
   14:   samples.sort((a, b) => a - b);
   15:   // Discard top 5% (spikes) and bottom 10% (dips)
   16:   const lowerIndex = Math.floor(samples.length * 0.10);
   17:   const upperIndex = Math.floor(samples.length * 0.95);
   18:   const validSamples = samples.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : samples.length);
   ...
   23:   return sum / validSamples.length;
   24: }
   ```
   - **Observation**:
     - **Misnomer**: For array `[1..100]`, the true 90th percentile is `90`. `calc90thPercentile([1..100])` returns `53` because it computes an asymmetric 15% trimmed mean (discarding bottom 10% and top 5%), NOT the 90th percentile.
     - **Small Array Trimming**: For a 2-element array `[10, 100]`, `lowerIndex = 0`, `upperIndex = 1`. `slice(0, 1)` yields `[10]`, discarding 50% of data (the higher sample) and returning `10`.
     - **In-place Side Effect**: Line 14 `samples.sort((a, b) => a - b)` mutates the input array in-place.

---

## 2. Logic Chain

1. **Premise**: In multi-threaded mode (`multiThread = true`, 4 threads), overall upload speed is the sum of throughput across all active parallel connections over time (or total bytes uploaded divided by total elapsed test time).
2. **Step 1**: `runUploadTest` measures individual request durations per thread and pushes per-thread stream Mbps values to `speedSamples`.
3. **Step 2**: Averaging `speedSamples` across 4 concurrent threads produces the average single-stream speed, not total upload bandwidth. This causes a ~4x under-reporting of multi-threaded upload speed.
4. **Step 3**: `totalUploadedBytes` is coupled to `durationSec > 0`. If a request completes in 0ms (`reqEnd === reqStart`), `durationSec = 0`, skipping `totalUploadedBytes += payload.byteLength`. Successful uploads are omitted from total byte count.
5. **Step 4**: `calc90thPercentile` mutates input arrays, fails to compute 90th percentile (calculates asymmetric trimmed mean instead), and discards up to 50% of dataset on small sample sizes.

---

## 3. Caveats

- Node.js environment simulates web worker globals (`fetch`, `performance.now()`, `AbortController`). Real browser network environments experience physical network latency (>1ms), reducing the probability of `reqEnd === reqStart` to zero, though sub-millisecond high-speed local networks or mocked environments trigger it.
- Single-thread mode (`multiThread = false`) correctly reflects single-connection speed, but multi-thread mode remains affected by the stream aggregation flaw.

---

## 4. Conclusion

**Verdict: FAIL**

The refactored upload test logic in `src/js/speedtest-worker.js` contains 3 critical defects:
1. **Multi-Thread Upload Speed Under-Reporting**: Multi-thread mode (4 threads) measures individual stream chunk rates rather than aggregate upload bandwidth, under-reporting total upload speed by ~4x.
2. **Byte Accounting Corruption on Zero Duration**: `totalUploadedBytes` is inside `if (durationSec > 0)`, resulting in silent loss of uploaded bytes whenever `reqEnd === reqStart`.
3. **Trimmed Mean / Percentile Misnomer & Array Mutation**: `calc90thPercentile` mutates input arrays in-place and computes a 15% asymmetric trimmed mean (returning 53 for 1..100) instead of the actual 90th percentile (90).

---

## 5. Verification Method

To independently verify these findings:

1. **Run the test harness command**:
   ```powershell
   node "d:\Speed test\.agents\challenger_m2_1\test_harness.js"
   ```

2. **Expected Verification Output**:
   - `calc90thPercentile([1..100])`: Returns `53` (Expected true 90th percentile: `90`).
   - 4-Thread Upload Speed: Reported speed is `~20.97 Mbps` despite total aggregate throughput reaching `83.88 Mbps` across 4 active streams.
   - Zero-Duration Upload Accounting: Uploaded bytes are recorded as `0` or under-counted when `reqEnd === reqStart`.
