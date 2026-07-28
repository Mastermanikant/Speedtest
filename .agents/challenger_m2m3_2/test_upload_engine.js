// Empirical Test Harness for Challenger 2
// Testing src/js/speedtest-worker.js functions & edge cases

const { performance } = require('perf_hooks');

// 1. Extract calc90thPercentile directly from speedtest-worker.js logic
function calc90thPercentile(samples) {
  if (samples.length === 0) return 0;
  // Sort ascending
  samples.sort((a, b) => a - b);
  // Discard top 5% (spikes) and bottom 10% (dips)
  const lowerIndex = Math.floor(samples.length * 0.10);
  const upperIndex = Math.floor(samples.length * 0.95);
  const validSamples = samples.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : samples.length);
  
  if (validSamples.length === 0) return samples[Math.floor(samples.length / 2)];
  
  const sum = validSamples.reduce((a, b) => a + b, 0);
  return sum / validSamples.length;
}

console.log('=== TEST 1: calc90thPercentile on Small & Edge Case Sample Counts ===');
const testCases = [
  { name: 'Empty array', samples: [] },
  { name: 'Single element [10]', samples: [10] },
  { name: 'Two elements [10, 20]', samples: [10, 20] },
  { name: 'Three elements [10, 20, 30]', samples: [10, 20, 30] },
  { name: 'Four elements [10, 20, 30, 40]', samples: [10, 20, 30, 40] },
  { name: 'Five elements [10, 20, 30, 40, 50]', samples: [10, 20, 30, 40, 50] },
  { name: 'Nine elements [1..9]', samples: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  { name: 'Ten elements [1..10]', samples: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] },
  { name: '20 elements (all 50)', samples: Array(20).fill(50) },
  { name: '10 elements with 8 zeros and 2 high spikes [0,0,0,0,0,0,0,0,83.88,83.88]', samples: [0,0,0,0,0,0,0,0,83.88,83.88] },
  { name: '40 elements with 35 zeros and 5 spikes [0...0, 83.88...83.88]', samples: [...Array(35).fill(0), ...Array(5).fill(83.88)] }
];

testCases.forEach(tc => {
  const inputCopy = [...tc.samples];
  const res = calc90thPercentile(inputCopy);
  console.log(`[${tc.name}] Length: ${tc.samples.length} -> Result: ${res}`);
  // Check index math detail
  const sorted = [...tc.samples].sort((a,b)=>a-b);
  const lowerIndex = Math.floor(sorted.length * 0.10);
  const upperIndex = Math.floor(sorted.length * 0.95);
  const validSamples = sorted.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : sorted.length);
  console.log(`   lowerIndex: ${lowerIndex}, upperIndex: ${upperIndex}, validSlice: [${validSamples.join(', ')}]`);
});


console.log('\n=== TEST 2: Upload Sampler Simulation at Various Speeds & Thread Counts ===');

function simulateUploadTest({ speedMbps, threads, testDurationMs = 8000, sampleIntervalMs = 100, chunkSize = 1024 * 1024 }) {
  // speedMbps is target network upload bandwidth in Mbps
  // 1MB chunk = 1,048,576 bytes = 8,388,608 bits
  const chunkBits = chunkSize * 8;
  const bitsPerMs = (speedMbps * 1e6) / 1000;
  const chunkDurationMs = chunkBits / (bitsPerMs / threads); // per thread

  let totalUploadedBytes = 0;
  const speedSamples = [];
  let lastSampleTime = 0;
  let lastSampleBytes = 0;

  // Track thread completion times
  // Thread i completes chunks at t = chunkDurationMs, 2*chunkDurationMs, etc.
  const threadNextCompletion = Array(threads).fill(0).map(() => chunkDurationMs);

  for (let currentTime = sampleIntervalMs; currentTime <= testDurationMs; currentTime += sampleIntervalMs) {
    // Check if any thread completed a chunk in (currentTime - sampleIntervalMs, currentTime]
    for (let i = 0; i < threads; i++) {
      while (threadNextCompletion[i] <= currentTime && threadNextCompletion[i] <= testDurationMs) {
        totalUploadedBytes += chunkSize;
        threadNextCompletion[i] += chunkDurationMs;
      }
    }

    const elapsedSec = (currentTime - lastSampleTime) / 1000;
    if (elapsedSec > 0) {
      const deltaBytes = totalUploadedBytes - lastSampleBytes;
      const currentMbps = (deltaBytes * 8) / (elapsedSec * 1000000);
      speedSamples.push(currentMbps);
      lastSampleTime = currentTime;
      lastSampleBytes = totalUploadedBytes;
    }
  }

  if (speedSamples.length === 0 && totalUploadedBytes > 0) {
    const totalSec = testDurationMs / 1000;
    const avgMbps = (totalUploadedBytes * 8) / (totalSec * 1000000);
    speedSamples.push(avgMbps);
  }

  const finalSpeed = calc90thPercentile(speedSamples);
  const actualAvgSpeed = (totalUploadedBytes * 8) / ((testDurationMs / 1000) * 1e6);

  return {
    targetSpeedMbps: speedMbps,
    threads,
    totalUploadedBytes,
    chunkDurationMs: Math.round(chunkDurationMs),
    sampleCount: speedSamples.length,
    sampleZeroCount: speedSamples.filter(s => s === 0).length,
    sampleNonZeroCount: speedSamples.filter(s => s > 0).length,
    maxSampleMbps: Math.max(...speedSamples, 0),
    actualAvgSpeedMbps: Number(actualAvgSpeed.toFixed(2)),
    calc90thPercentileMbps: Number(finalSpeed.toFixed(2))
  };
}

const simCases = [
  { speedMbps: 2, threads: 1 },
  { speedMbps: 5, threads: 1 },
  { speedMbps: 10, threads: 1 },
  { speedMbps: 20, threads: 1 },
  { speedMbps: 50, threads: 1 },
  { speedMbps: 100, threads: 1 },
  { speedMbps: 2, threads: 4 },
  { speedMbps: 5, threads: 4 },
  { speedMbps: 10, threads: 4 },
  { speedMbps: 20, threads: 4 },
  { speedMbps: 50, threads: 4 },
  { speedMbps: 100, threads: 4 },
];

simCases.forEach(c => {
  const res = simulateUploadTest(c);
  console.log(`Target: ${res.targetSpeedMbps} Mbps (${res.threads} thread${res.threads > 1 ? 's' : ''}) | Chunk Time: ${res.chunkDurationMs}ms`);
  console.log(`  Uploaded: ${(res.totalUploadedBytes / (1024*1024)).toFixed(1)} MB | Actual Total Avg: ${res.actualAvgSpeedMbps} Mbps`);
  console.log(`  Samples: ${res.sampleCount} total (${res.sampleZeroCount} zero, ${res.sampleNonZeroCount} non-zero) | Max Sample Spike: ${res.maxSampleMbps.toFixed(2)} Mbps`);
  console.log(`  >>> calc90thPercentile Result: ${res.calc90thPercentileMbps} Mbps <<<`);
  if (Math.abs(res.calc90thPercentileMbps - res.targetSpeedMbps) > res.targetSpeedMbps * 0.3) {
    console.log(`  ⚠️ MISMATCH! Reported speed (${res.calc90thPercentileMbps} Mbps) severely deviates from actual speed (${res.actualAvgSpeedMbps} Mbps / target ${res.targetSpeedMbps} Mbps)`);
  }
  console.log('---');
});


console.log('\n=== TEST 3: Timing Calculation & Bit/Byte Unit Conversion Verification ===');

// Formula 1: (payload.byteLength * 8) / (durationSec * 1e6)
// Formula 2: (deltaBytes * 8) / (elapsedSec * 1000000)
// Check accuracy, floating point precision, and unit correctness

const payloadByteLength = 1024 * 1024; // 1,048,576 bytes
const durationSec = 0.5; // 500 ms

const formula1 = (payloadByteLength * 8) / (durationSec * 1e6);
const formula2 = (payloadByteLength * 8) / (durationSec * 1000000);

console.log(`1MB payload in 0.5s:`);
console.log(`  (1048576 * 8) / (0.5 * 1e6) = ${formula1} Mbps`);
console.log(`  1048576 bytes = ${1048576 * 8} bits = 8.388608 Mbit.`);
console.log(`  In 0.5 seconds: 8.388608 / 0.5 = ${8.388608 / 0.5} Mbps.`);
console.log(`  Formula exact match: ${formula1 === 16.777216}`);

console.log('\n=== TEST 4: Chart.js Offline Gracefulness Guard Verification ===');

// Simulate environment with typeof Chart === 'undefined'
const mockWindowWithoutChart = {};
function testChartGuard(hasChart) {
  let speedChart = null;
  function initSpeedChart() {
    const chartCanvas = { getContext: () => ({ createLinearGradient: () => ({ addColorStop: () => {} }) }) };
    const ChartClass = hasChart ? function MockChart() {} : undefined;
    if (!chartCanvas || typeof ChartClass === 'undefined') return 'GUARDED: Returned safely without error';
    speedChart = new ChartClass();
    return 'INITIALIZED';
  }
  return initSpeedChart();
}

console.log(`Without Chart.js (offline/failed CDN): ${testChartGuard(false)}`);
console.log(`With Chart.js: ${testChartGuard(true)}`);

// Test app.js chart update callbacks when speedChart is null
function testAppJsCallbacksWhenChartNull() {
  let speedChart = null; // Chart.js failed to load
  let downloadProgressCalled = false;
  let uploadProgressCalled = false;

  // Code snippet from app.js line 348-355:
  const downloadCallback = (speed) => {
    downloadProgressCalled = true;
    if (speedChart) {
      const timestamp = `1.0s`;
      speedChart.data.labels.push(timestamp);
    }
  };

  const uploadCallback = (speed) => {
    uploadProgressCalled = true;
    if (speedChart) {
      const timestamp = `1.0s`;
      speedChart.data.labels.push(timestamp);
    }
  };

  downloadCallback(50);
  uploadCallback(25);

  return { downloadProgressCalled, uploadProgressCalled };
}

console.log(`app.js callbacks when speedChart is null:`, testAppJsCallbacksWhenChartNull());
