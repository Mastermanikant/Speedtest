// Direct execution test of speedtest-worker.js runUploadTest logic
// Mocking worker environment in Node.js

const { performance } = require('perf_hooks');

// Setup mock worker globals
global.performance = performance;
global.Uint8Array = Uint8Array;
global.setTimeout = setTimeout;
global.clearTimeout = clearTimeout;

let workerMessages = [];
global.postMessage = (msg) => {
  workerMessages.push(msg);
};

global.AbortController = class MockAbortController {
  constructor() {
    this.signal = {
      aborted: false,
      addEventListener: (evt, cb) => {
        this.onabort = cb;
      }
    };
  }
  abort() {
    this.signal.aborted = true;
    if (this.onabort) this.onabort();
  }
};

// Function to run mock test with simulated latency
async function testWorkerUploadWithLatency({ threadCount, delayMsPerChunk, testDurationMs = 2000 }) {
  workerMessages = [];

  // Mock fetch: simulates network upload duration of delayMsPerChunk for 1MB payload
  global.fetch = async (url, opts) => {
    if (opts?.signal?.aborted) throw new Error('AbortError');
    await new Promise((resolve, reject) => {
      const timer = setTimeout(resolve, delayMsPerChunk);
      if (opts?.signal) {
        opts.signal.addEventListener('abort', () => {
          clearTimeout(timer);
          reject(new Error('AbortError'));
        });
      }
    });
    return {
      ok: true,
      text: async () => 'OK'
    };
  };

  // Re-define calc90thPercentile and runUploadTest extracted from speedtest-worker.js
  function calc90thPercentile(samples) {
    if (samples.length === 0) return 0;
    samples.sort((a, b) => a - b);
    const lowerIndex = Math.floor(samples.length * 0.10);
    const upperIndex = Math.floor(samples.length * 0.95);
    const validSamples = samples.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : samples.length);
    if (validSamples.length === 0) return samples[Math.floor(samples.length / 2)];
    const sum = validSamples.reduce((a, b) => a + b, 0);
    return sum / validSamples.length;
  }

  const getUploadUrl = () => 'https://speed.cloudflare.com/__up';
  const measureLoadedLatency = async () => 15;

  let abortController = null;

  async function runUploadTest(options = {}) {
    const multiThread = typeof options === 'boolean' ? options : (options?.multiThread ?? true);
    const dataSaverMode = typeof options === 'object' && options !== null ? !!options.dataSaverMode : false;
    const MAX_DATA_SAVER_BYTES = 5 * 1024 * 1024;

    abortController = new global.AbortController();
    const signal = abortController.signal;
    const testDuration = testDurationMs;
    const startTime = performance.now();
    let isRunning = true;
    const threads = multiThread ? 4 : 1;
    const loadedLatencies = [];
    const speedSamples = [];
    let totalUploadedBytes = 0;
    let lastSampleTime = startTime;
    let lastSampleBytes = 0;

    const chunkSize = 1024 * 1024;
    const payload = new Uint8Array(chunkSize);

    const timer = setTimeout(() => {
      isRunning = false;
      if (abortController) abortController.abort();
    }, testDuration);

    const uploadTask = async (threadId) => {
      let reqId = 0;
      while (isRunning && !signal.aborted) {
        if (performance.now() - startTime >= testDuration) {
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
          if (isRunning && !signal.aborted) {
            totalUploadedBytes += payload.byteLength;
          }
        } catch (e) {
          break;
        }
      }
    };

    const samplerTask = async () => {
      while (isRunning && !signal.aborted) {
        await new Promise(r => {
          const t = setTimeout(r, 100);
          if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });

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

    const latencyTask = async () => {
      while (isRunning && !signal.aborted) {
        if (performance.now() - startTime >= testDuration) break;
        if (Math.random() < 0.2) {
          const lat = await measureLoadedLatency();
          if (lat && isRunning && !signal.aborted) loadedLatencies.push(lat);
        }
        await new Promise(r => {
          const t = setTimeout(r, 200);
          if (signal) signal.addEventListener('abort', () => { clearTimeout(t); r(); }, { once: true });
        });
      }
    };

    const tasks = Array.from({ length: threads }, (_, i) => uploadTask(i));

    try {
      await Promise.all([...tasks, latencyTask(), samplerTask()]);
    } catch (e) {
    } finally {
      clearTimeout(timer);
    }

    if (speedSamples.length === 0 && totalUploadedBytes > 0) {
      const totalSec = (performance.now() - startTime) / 1000;
      if (totalSec > 0) {
        const avgMbps = (totalUploadedBytes * 8) / (totalSec * 1000000);
        speedSamples.push(avgMbps);
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

    return { speedSamples, totalUploadedBytes, finalSpeedMbps };
  }

  return await runUploadTest({ multiThread: threadCount > 1 });
}

async function runDirectTests() {
  console.log('=== Running Direct Worker Execution Tests ===');
  
  // Scenario A: High speed network (chunk takes 50ms, i.e. 167 Mbps)
  console.log('\nScenario A: High Speed Network (50ms per 1MB chunk)');
  const resA1 = await testWorkerUploadWithLatency({ threadCount: 1, delayMsPerChunk: 50 });
  console.log(`Single-thread (1 thread): Total Uploaded = ${(resA1.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resA1.finalSpeedMbps.toFixed(2)} Mbps`);
  
  const resA4 = await testWorkerUploadWithLatency({ threadCount: 4, delayMsPerChunk: 50 });
  console.log(`Multi-thread (4 threads): Total Uploaded = ${(resA4.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resA4.finalSpeedMbps.toFixed(2)} Mbps`);

  // Scenario B: Moderate speed network (chunk takes 400ms, i.e. ~21 Mbps)
  console.log('\nScenario B: Moderate Speed Network (400ms per 1MB chunk)');
  const resB1 = await testWorkerUploadWithLatency({ threadCount: 1, delayMsPerChunk: 400 });
  console.log(`Single-thread (1 thread): Total Uploaded = ${(resB1.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resB1.finalSpeedMbps.toFixed(2)} Mbps`);
  
  const resB4 = await testWorkerUploadWithLatency({ threadCount: 4, delayMsPerChunk: 400 });
  console.log(`Multi-thread (4 threads): Total Uploaded = ${(resB4.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resB4.finalSpeedMbps.toFixed(2)} Mbps`);

  // Scenario C: Low/Moderate network (chunk takes 1200ms, i.e. ~7 Mbps)
  console.log('\nScenario C: Low Speed Network (1200ms per 1MB chunk)');
  const resC1 = await testWorkerUploadWithLatency({ threadCount: 1, delayMsPerChunk: 1200 });
  console.log(`Single-thread (1 thread): Total Uploaded = ${(resC1.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resC1.finalSpeedMbps.toFixed(2)} Mbps`);
  
  const resC4 = await testWorkerUploadWithLatency({ threadCount: 4, delayMsPerChunk: 1200 });
  console.log(`Multi-thread (4 threads): Total Uploaded = ${(resC4.totalUploadedBytes/(1024*1024)).toFixed(1)} MB | Final Result = ${resC4.finalSpeedMbps.toFixed(2)} Mbps`);
}

runDirectTests();
