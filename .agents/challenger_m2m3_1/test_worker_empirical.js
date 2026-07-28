// test_worker_empirical.js
// Empirical test harness for speedtest-worker.js POST payload, signal binding, and progress messages

import fs from 'fs';
import path from 'path';

// Read worker source code
const workerCode = fs.readFileSync(path.resolve('src/js/speedtest-worker.js'), 'utf8');

console.log('=== EMPIRICAL WORKER ANALYSIS & TESTS ===');

// 1. Static AST/Regex Inspection of key requirements
const checks = {
  preallocPayload: /const payload = new Uint8Array\(chunkSize\)/.test(workerCode) && /const chunkSize = 1024 \* 1024/.test(workerCode),
  reusablePayload: /body:\s*payload/.test(workerCode),
  postMethod: /method:\s*['"]POST['"]/.test(workerCode),
  fetchSignal: /signal/.test(workerCode) && /signal:\s*abortController\.signal|signal\b/.test(workerCode),
  timingPerf: /performance\.now\(\)/.test(workerCode),
  progressMsg: /postMessage\(\{\s*type:\s*['"]upload_progress['"]/.test(workerCode),
  progressData: /data:\s*currentMbps/.test(workerCode) && /totalBytes:\s*totalUploadedBytes/.test(workerCode),
  resultMsg: /postMessage\(\{\s*type:\s*['"]upload_result['"]/.test(workerCode),
  trimmedAvg: /calc90thPercentile\(speedSamples\)/.test(workerCode),
  abortController: /abortController\.abort\(\)/.test(workerCode)
};

console.log('Check results:');
for (const [key, val] of Object.entries(checks)) {
  console.log(`  ${key}: ${val ? 'PASS' : 'FAIL'}`);
}

// 2. Behavioral Simulation with Mock Environment
let lastPostedMessages = [];
global.self = {
  postMessage: (msg) => {
    lastPostedMessages.push(msg);
  }
};
global.postMessage = global.self.postMessage;

// Mock fetch
let fetchCalls = [];
global.fetch = async (url, opts) => {
  fetchCalls.push({ url, opts });
  // simulate quick success
  return {
    ok: true,
    text: async () => 'OK',
    body: null
  };
};

// Execute worker code in node environment context
try {
  const evalCode = workerCode + '\n; global.runUploadTest = runUploadTest; global.runDownloadTest = runDownloadTest; global.calc90thPercentile = calc90thPercentile;';
  eval(evalCode);
  console.log('Worker script evaluated cleanly in mock environment.');
} catch (e) {
  console.error('Error evaluating worker script:', e);
}

// Perform empirical verification of calc90thPercentile
const testSamples = [10, 20, 30, 40, 50, 60, 70, 80, 90, 100, 200, 300, 400, 500, 600, 700, 800, 900, 1000, 2000];
const trimmedVal = global.calc90thPercentile(testSamples);
console.log(`calc90thPercentile sample test: output = ${trimmedVal}`);

// Test runUploadTest execution (mocked short duration test)
async function testUploadExecution() {
  console.log('\n--- Running Upload Engine Simulation ---');
  lastPostedMessages = [];
  fetchCalls = [];

  // Override performance.now to advance deterministically or use real timer
  const startTime = Date.now();
  
  // Launch runUploadTest with options
  const uploadPromise = global.runUploadTest({ multiThread: true, dataSaverMode: false });
  
  // Wait 1.5 seconds then abort or let timer finish
  await new Promise(r => setTimeout(r, 600));
  if (global.abortController) {
    global.abortController.abort();
  }
  
  await uploadPromise;
  
  console.log(`Fetch calls count: ${fetchCalls.length}`);
  if (fetchCalls.length > 0) {
    const firstCall = fetchCalls[0];
    console.log(`First fetch URL: ${firstCall.url}`);
    console.log(`First fetch Method: ${firstCall.opts.method}`);
    console.log(`First fetch Body length: ${firstCall.opts.body ? firstCall.opts.body.byteLength : 'N/A'}`);
    console.log(`First fetch Signal attached: ${!!firstCall.opts.signal}`);
    console.log(`First fetch Signal aborted state: ${firstCall.opts.signal?.aborted}`);
  }
  
  console.log(`Total messages posted: ${lastPostedMessages.length}`);
  const progressMsgs = lastPostedMessages.filter(m => m.type === 'upload_progress');
  const resultMsgs = lastPostedMessages.filter(m => m.type === 'upload_result');
  console.log(`Progress messages count: ${progressMsgs.length}`);
  console.log(`Result messages count: ${resultMsgs.length}`);
  if (progressMsgs.length > 0) {
    console.log('Sample progress message:', JSON.stringify(progressMsgs[0]));
  }
  if (resultMsgs.length > 0) {
    console.log('Result message:', JSON.stringify(resultMsgs[0]));
  }
}

testUploadExecution().then(() => {
  console.log('=== EMPIRICAL WORKER VERIFICATION COMPLETE ===');
}).catch(err => {
  console.error('Test execution failed:', err);
});
