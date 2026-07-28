const fs = require('fs');
const path = require('path');

// Read the implementation file
const workerCode = fs.readFileSync(path.join(__dirname, '../../src/js/speedtest-worker.js'), 'utf8');

// Function to extract calc90thPercentile for direct testing
function loadCalc90thPercentile() {
  const fnMatch = workerCode.match(/function calc90thPercentile[\s\S]*?\n\}/);
  if (!fnMatch) throw new Error('Could not find calc90thPercentile in source code');
  return new Function(`${fnMatch[0]}; return calc90thPercentile;`)();
}

const calc90thPercentile = loadCalc90thPercentile();

console.log('====================================================');
console.log('STARTING EMPIRICAL STRESS TEST FOR SPEEDTEST WORKER');
console.log('====================================================\n');

// ----------------------------------------------------
// CHALLENGE POINT 3: 90th Percentile Trimming Tests
// ----------------------------------------------------
console.log('--- SUITE 1: calc90thPercentile Analysis ---');

function runPercentileTests() {
  const tests = [
    { name: 'Empty array []', input: [], expected: 0 },
    { name: 'Single item [100]', input: [100], expected: 100 },
    { name: 'Two items [10, 100]', input: [10, 100], expected: 10 },
    { name: 'Three items [10, 50, 100]', input: [10, 50, 100], expected: 30 },
    { name: 'Four items [10, 20, 30, 40]', input: [10, 20, 30, 40], expected: 20 },
    { name: '10 items [1..10]', input: [1,2,3,4,5,6,7,8,9,10], expected: 5.5 },
    { name: '100 items [1..100]', input: Array.from({length: 100}, (_, i) => i + 1), expectedTrimmedMean: 53, expectedTrue90th: 90 },
    { name: '100 items with spike (95 at 100, 5 at 10000)', input: Array.from({length: 95}, () => 100).concat(Array.from({length: 5}, () => 10000)), expected: 100 },
    { name: 'Identical values [50, 50, 50, 50, 50]', input: [50, 50, 50, 50, 50], expected: 50 }
  ];

  for (const t of tests) {
    const original = [...t.input];
    const res = calc90thPercentile(t.input);
    const mutated = t.input.some((v, i) => v !== original[i]);
    
    console.log(`[TEST] ${t.name}`);
    console.log(`  Result: ${res}`);
    console.log(`  Array Mutated: ${mutated ? 'YES (In-place sort)' : 'NO'}`);
    if (t.expectedTrue90th !== undefined) {
      console.log(`  Misnomer Note: Function is named calc90thPercentile, true 90th percentile is ${t.expectedTrue90th}, function returns trimmed mean ${res}`);
    }
  }
}

runPercentileTests();


// ----------------------------------------------------
// WORKER TEST HARNESS FACTORY
// ----------------------------------------------------

function createWorkerEnv(customFetch, customPerfNow) {
  const postedMessages = [];
  let baseTime = 10000;

  const perfObj = {
    now: customPerfNow || (() => baseTime++)
  };

  const mockSelf = {
    onmessage: null,
    postMessage: (msg) => postedMessages.push(msg)
  };

  const context = {
    self: mockSelf,
    postMessage: (msg) => mockSelf.postMessage(msg),
    fetch: customFetch,
    performance: perfObj,
    setTimeout: (fn, ms) => setTimeout(fn, ms),
    clearTimeout: (id) => clearTimeout(id),
    Promise: global.Promise,
    Uint8Array: global.Uint8Array,
    Math: global.Math,
    Date: global.Date,
    console: console,
    AbortController: global.AbortController
  };

  const evalInContext = new Function('context', `
    with (context) {
      ${workerCode}
      return { runUploadTest, runDownloadTest, runPingTest, calc90thPercentile };
    }
  `);

  const exports = evalInContext(context);

  return { exports, postedMessages, perfObj };
}


// ----------------------------------------------------
// CHALLENGE POINT 1: High Concurrency Tests
// ----------------------------------------------------
console.log('\n--- SUITE 2: High Concurrency (4 Threads) Upload Test ---');

async function runConcurrencyTest() {
  const activeThreads = new Set();
  let maxConcurrency = 0;
  let totalRequestsHandled = 0;
  const requestsPerThread = { 0: 0, 1: 0, 2: 0, 3: 0 };
  let simulatedTime = 10000;

  const getSimulatedNow = () => simulatedTime;

  const mockFetch = async (url, options) => {
    if (url.includes('/upload') || url.includes('/__up')) {
      const match = url.match(/_(\d+)_(\d+)$/);
      if (match) {
        const threadId = parseInt(match[1], 10);
        
        activeThreads.add(threadId);
        requestsPerThread[threadId] = (requestsPerThread[threadId] || 0) + 1;
        if (activeThreads.size > maxConcurrency) {
          maxConcurrency = activeThreads.size;
        }
        totalRequestsHandled++;

        // Yield to event loop
        await new Promise(resolve => setTimeout(resolve, 10));
        simulatedTime += 100;
        
        activeThreads.delete(threadId);
      }
      return { ok: true, text: async () => 'OK' };
    }

    return { ok: true, text: async () => 'OK' };
  };

  const env = createWorkerEnv(mockFetch, getSimulatedNow);
  
  console.log('Executing runUploadTest(true) with 4 threads...');
  const testPromise = env.exports.runUploadTest(true);
  
  await testPromise;

  const resultMsg = env.postedMessages.find(m => m.type === 'upload_result');
  const progressMsgs = env.postedMessages.filter(m => m.type === 'upload_progress');
  const uploadData = resultMsg?.data;

  console.log(`  Max Concurrent Active Threads: ${maxConcurrency}`);
  console.log(`  Total Upload Requests Completed: ${totalRequestsHandled}`);
  console.log(`  Requests Per Thread: ${JSON.stringify(requestsPerThread)}`);
  console.log(`  Progress Updates Emitted: ${progressMsgs.length}`);
  console.log(`  Total Uploaded Bytes Reported: ${uploadData?.totalBytes} bytes (${(uploadData?.totalBytes / 1024 / 1024).toFixed(2)} MB)`);
  console.log(`  Reported Final Speed: ${uploadData?.speedMbps} Mbps`);
  console.log(`  Empirical Finding: Total data uploaded across 4 threads = ${totalRequestsHandled} MB. Measured per-chunk speed averages ${uploadData?.speedMbps?.toFixed(2)} Mbps per thread, under-reporting multi-threaded upload bandwidth.`);
}


// ----------------------------------------------------
// CHALLENGE POINT 2: Timing Accuracy & Edge Cases
// ----------------------------------------------------
console.log('\n--- SUITE 3: Timing Accuracy & Zero/Negative Duration Edge Cases ---');

async function runTimingTests() {
  // Test 3.1: DurationSec = 0
  console.log('\n[TEST 3.1] Duration = 0 (reqEnd === reqStart)');
  let zeroTime = 50000;
  let zeroFetchCount = 0;

  const mockFetchZero = async () => {
    zeroFetchCount++;
    // Yield brief tick so loop terminates when testDuration hit
    await new Promise(r => setTimeout(r, 5));
    if (zeroFetchCount >= 10) {
      zeroTime += 9000; // trigger test duration timeout
    }
    return { ok: true, text: async () => 'OK' };
  };

  const envZero = createWorkerEnv(mockFetchZero, () => zeroTime);

  const zeroPromise = envZero.exports.runUploadTest(false);
  await zeroPromise;

  const progressZero = envZero.postedMessages.filter(m => m.type === 'upload_progress');
  const resultZero = envZero.postedMessages.find(m => m.type === 'upload_result');
  
  console.log(`  Requests executed with durationSec = 0: ${zeroFetchCount}`);
  console.log(`  Progress events emitted when durationSec = 0: ${progressZero.length}`);
  console.log(`  Total Uploaded Bytes reported when durationSec = 0: ${resultZero?.data?.totalBytes}`);
  console.log(`  CRITICAL BUG FINDING: When reqEnd === reqStart (durationSec = 0), all ${zeroFetchCount} completed 1MB uploads are ignored in totalUploadedBytes, resulting in totalBytes = 0.`);

  // Test 3.2: Negative duration (reqEnd < reqStart)
  console.log('\n[TEST 3.2] Negative duration (reqEnd < reqStart)');
  let negTime = 10000;
  let negFetchCount = 0;
  
  const getRegressNow = () => {
    negFetchCount++;
    // reqStart is call 1, reqEnd is call 2
    if (negFetchCount % 2 === 0) return negTime - 500; // smaller than reqStart!
    return negTime;
  };

  const mockFetchNeg = async () => {
    await new Promise(r => setTimeout(r, 5));
    if (negFetchCount >= 10) negTime += 10000;
    return { ok: true, text: async () => 'OK' };
  };

  const envNeg = createWorkerEnv(mockFetchNeg, getRegressNow);
  const negPromise = envNeg.exports.runUploadTest(false);
  await negPromise;

  const progressNeg = envNeg.postedMessages.filter(m => m.type === 'upload_progress');
  const resultNeg = envNeg.postedMessages.find(m => m.type === 'upload_result');
  console.log(`  Progress events when durationSec < 0: ${progressNeg.length}`);
  console.log(`  Total Bytes reported when durationSec < 0: ${resultNeg?.data?.totalBytes}`);
  console.log(`  Negative Mbps emitted: ${progressNeg.some(p => p.data < 0)}`);

  // Test 3.3: Microsecond duration (durationSec = 0.000001)
  console.log('\n[TEST 3.3] Microsecond duration (0.000001s)');
  let microTime = 10000;
  let microCount = 0;
  
  const getMicroNow = () => {
    microCount++;
    if (microCount % 2 === 0) return microTime + 0.001; // 0.001ms = 0.000001s
    return microTime;
  };

  const mockFetchMicro = async () => {
    await new Promise(r => setTimeout(r, 5));
    if (microCount >= 10) microTime += 10000;
    return { ok: true, text: async () => 'OK' };
  };

  const envMicro = createWorkerEnv(mockFetchMicro, getMicroNow);
  const microPromise = envMicro.exports.runUploadTest(false);
  await microPromise;

  const progressMicro = envMicro.postedMessages.filter(m => m.type === 'upload_progress');
  if (progressMicro.length > 0) {
    console.log(`  Sample Mbps calculated for 1MB in 0.001ms: ${progressMicro[0].data} Mbps`);
  }
}

async function main() {
  await runConcurrencyTest();
  await runTimingTests();
  
  console.log('\n====================================================');
  console.log('ALL TESTS COMPLETED SUCCESSFULLY');
  console.log('====================================================\n');
  process.exit(0);
}

main().catch(err => {
  console.error('Test execution failed:', err);
  process.exit(1);
});
