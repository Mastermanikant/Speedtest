import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const workerPath = path.resolve(__dirname, '../../src/js/speedtest-worker.js');
const workerCode = fs.readFileSync(workerPath, 'utf8');

let postDelayMs = 0;
let pingDelayMs = 0;
let activeRequests = 0;
let totalRequestsReceived = 0;
let totalBytesReceived = 0;

const server = http.createServer(async (req, res) => {
  activeRequests++;
  totalRequestsReceived++;

  const url = new URL(req.url, `http://${req.headers.host}`);

  req.on('data', (chunk) => {
    totalBytesReceived += chunk.length;
  });

  req.on('end', async () => {
    const delay = url.pathname.includes('up') || url.pathname.includes('upload') 
      ? postDelayMs 
      : pingDelayMs;

    if (delay > 0) {
      await new Promise(r => setTimeout(r, delay));
    }

    res.writeHead(200, {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'text/plain'
    });
    res.end('OK');
    activeRequests--;
  });

  req.on('error', () => {
    activeRequests--;
  });
});

await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
const port = server.address().port;

function createWorkerInstance({ forcePingOnLatency = false } = {}) {
  const messages = [];
  let onMsg = null;

  let customCode = workerCode;
  if (forcePingOnLatency) {
    customCode = customCode.replace('if (Math.random() < 0.2)', 'if (true)');
  }

  const sandbox = {
    console: {
      log: () => {},
      error: (...args) => sandbox._errors.push(args.join(' ')),
      warn: () => {}
    },
    _errors: [],
    setTimeout,
    clearTimeout,
    performance,
    Uint8Array,
    Math,
    Promise,
    Date,
    AbortController,
    fetch: async (url, opts) => {
      let parsedUrl;
      try {
        parsedUrl = new URL(url);
      } catch (e) {
        parsedUrl = new URL(url, `http://127.0.0.1:${port}`);
      }
      const targetUrl = `http://127.0.0.1:${port}${parsedUrl.pathname}${parsedUrl.search}`;
      return globalThis.fetch(targetUrl, opts);
    },
    postMessage: (msg) => {
      messages.push(msg);
      if (onMsg) onMsg(msg);
    },
    onmessage: null
  };
  sandbox.self = sandbox;

  vm.createContext(sandbox);
  vm.runInContext(customCode, sandbox);

  return {
    postMessage: (data) => {
      if (typeof sandbox.onmessage === 'function') {
        sandbox.onmessage({ data });
      }
    },
    messages,
    errors: sandbox._errors,
    onMessage: (cb) => { onMsg = cb; },
    sandbox
  };
}

function resetStats() {
  postDelayMs = 0;
  pingDelayMs = 0;
  activeRequests = 0;
  totalRequestsReceived = 0;
  totalBytesReceived = 0;
}

const testResults = [];

// ==========================================
// TEST 1: Rapid Abort Signal Cleanliness & Result Leak
// ==========================================
async function test1_rapidAbort() {
  console.log('\n==========================================');
  console.log('TEST 1: Rapid Abort (500ms Abort)');
  console.log('==========================================');
  resetStats();
  postDelayMs = 20;

  const worker = createWorkerInstance();
  worker.postMessage({ command: 'upload', options: { multiThread: true } });

  await new Promise(r => setTimeout(r, 500));
  const reqsBeforeAbort = totalRequestsReceived;

  worker.postMessage({ command: 'abort' });

  await new Promise(r => setTimeout(r, 500));
  const resultMsgs = worker.messages.filter(m => m.type === 'upload_result');

  console.log(`- Requests before abort: ${reqsBeforeAbort}`);
  console.log(`- Worker emitted upload_result after explicit abort: ${resultMsgs.length > 0}`);
  if (resultMsgs.length > 0) {
    console.log(`  Emitted data:`, JSON.stringify(resultMsgs[0].data));
  }

  const pass = resultMsgs.length === 0;

  testResults.push({
    id: 'T1',
    name: 'Rapid Abort Result Emission (Post-Abort State Leak)',
    verdict: pass ? 'PASS' : 'FAIL',
    findings: resultMsgs.length > 0 
      ? 'Worker emits upload_result with partial metrics when aborted instead of abort error or suppressed completion.'
      : 'No result emitted on abort.'
  });
}

// ==========================================
// TEST 2: Server Delay (200ms POST Latency)
// ==========================================
async function test2_serverDelay() {
  console.log('\n==========================================');
  console.log('TEST 2: Server Delay (200ms latency per POST chunk)');
  console.log('==========================================');
  resetStats();
  postDelayMs = 200;

  const worker = createWorkerInstance();
  worker.postMessage({ command: 'upload', options: { multiThread: true } });

  await new Promise(r => setTimeout(r, 1000));
  const reqsAt1s = totalRequestsReceived;

  worker.postMessage({ command: 'abort' });
  await new Promise(r => setTimeout(r, 500));

  const reqsAfterAbort = totalRequestsReceived - reqsAt1s;
  console.log(`- Requests in 1s under 200ms delay: ${reqsAt1s}`);
  console.log(`- Requests started after abort: ${reqsAfterAbort}`);
  console.log(`- Active requests remaining: ${activeRequests}`);

  const pass = reqsAfterAbort === 0 && activeRequests === 0;

  testResults.push({
    id: 'T2',
    name: 'Server Delay (200ms POST chunk delay & abort)',
    verdict: pass ? 'PASS' : 'FAIL',
    findings: pass ? 'Abort correctly interrupts pending delayed POST requests.' : 'Active requests or new requests leaked after abort.'
  });
}

// ==========================================
// TEST 3: Stalled Ping Latency (Missing signal in pingEndpoint)
// ==========================================
async function test3_stalledPingSignal() {
  console.log('\n==========================================');
  console.log('TEST 3: Stalled Ping Latency (Missing signal in pingEndpoint)');
  console.log('==========================================');
  resetStats();
  postDelayMs = 10;
  pingDelayMs = 3000; // 3 second delay on ping request

  const worker = createWorkerInstance({ forcePingOnLatency: true });

  worker.postMessage({ command: 'upload', options: { multiThread: true } });
  await new Promise(r => setTimeout(r, 100)); // wait for latency check ping to initiate

  const activeBeforeAbort = activeRequests;
  console.log(`- Active HTTP requests before abort: ${activeBeforeAbort} (includes 3s stalled ping)`);

  worker.postMessage({ command: 'abort' });
  await new Promise(r => setTimeout(r, 500));

  const activeAfterAbort = activeRequests;
  console.log(`- Active HTTP requests 500ms after abort: ${activeAfterAbort}`);

  // pingEndpoint() calls fetch(url) WITHOUT signal parameter.
  // So pingEndpoint continues executing on the network even after abort!
  const pingLeaked = activeAfterAbort > 0;
  const pass = !pingLeaked;

  testResults.push({
    id: 'T3',
    name: 'Stalled Ping Latency Cancellation (Un-signaled pingEndpoint)',
    verdict: pass ? 'PASS' : 'FAIL',
    findings: pingLeaked
      ? `pingEndpoint() does not pass signal to fetch(). Stalled ping request remained active on network after abort.`
      : 'Ping request aborted cleanly.'
  });
}

// ==========================================
// TEST 4: Rapid Start/Stop / Abort Cycles Memory Consumption
// ==========================================
async function test4_rapidCyclesMemory() {
  console.log('\n==========================================');
  console.log('TEST 4: Rapid Start/Stop / Abort Cycles (20 Cycles)');
  console.log('==========================================');
  resetStats();
  postDelayMs = 10;

  if (global.gc) global.gc();
  const initialHeap = process.memoryUsage().heapUsed;

  const worker = createWorkerInstance();

  for (let i = 1; i <= 20; i++) {
    worker.postMessage({ command: 'upload', options: { multiThread: true } });
    await new Promise(r => setTimeout(r, 80));
    worker.postMessage({ command: 'abort' });
    await new Promise(r => setTimeout(r, 20));
  }

  await new Promise(r => setTimeout(r, 500));

  if (global.gc) global.gc();
  const finalHeap = process.memoryUsage().heapUsed;
  const heapDiffMb = (finalHeap - initialHeap) / (1024 * 1024);

  console.log(`- Heap memory growth after 20 cycles: ${heapDiffMb.toFixed(2)} MB`);
  console.log(`- Active requests remaining: ${activeRequests}`);

  const pass = activeRequests === 0 && heapDiffMb < 5.0;

  testResults.push({
    id: 'T4',
    name: 'Memory & Teardown under 20 Rapid Start/Stop Cycles',
    verdict: pass ? 'PASS' : 'FAIL',
    findings: `Heap growth: ${heapDiffMb.toFixed(2)} MB, Active requests remaining: ${activeRequests}`
  });
}

// ==========================================
// TEST 5: Overlapping Upload Commands without Prior Abort
// ==========================================
async function test5_overlappingUploads() {
  console.log('\n==========================================');
  console.log('TEST 5: Overlapping Upload Commands without Prior Abort');
  console.log('==========================================');
  resetStats();
  postDelayMs = 100;

  const worker = createWorkerInstance();

  // Send 1st upload command
  worker.postMessage({ command: 'upload', options: { multiThread: true } });
  await new Promise(r => setTimeout(r, 150));
  const reqsRun1 = totalRequestsReceived;

  // Send 2nd upload command without sending abort first
  worker.postMessage({ command: 'upload', options: { multiThread: true } });
  await new Promise(r => setTimeout(r, 300));

  const resultMsgs = worker.messages.filter(m => m.type === 'upload_result');
  console.log(`- Total requests received after 2nd command: ${totalRequestsReceived}`);
  console.log(`- Active HTTP requests (expected 4 if previous aborted, 8 if orphaned): ${activeRequests}`);

  const isOrphaned = activeRequests > 5;
  const pass = !isOrphaned;

  // Clean up
  worker.postMessage({ command: 'abort' });
  await new Promise(r => setTimeout(r, 300));

  testResults.push({
    id: 'T5',
    name: 'Overlapping Upload Command Handling (Missing auto-abort)',
    verdict: pass ? 'PASS' : 'FAIL',
    findings: isOrphaned
      ? `Re-issuing 'upload' command without prior abort overwrites global abortController without aborting the previous run. Both runs execute concurrently (${activeRequests} active threads).`
      : 'Previous run auto-aborted cleanly.'
  });
}

// Run all tests
try {
  await test1_rapidAbort();
  await test2_serverDelay();
  await test3_stalledPingSignal();
  await test4_rapidCyclesMemory();
  await test5_overlappingUploads();
} catch (err) {
  console.error('Harness execution error:', err);
} finally {
  server.close();
}

console.log('\n================================================================');
console.log('SUMMARY OF EMPIRICAL TEST RESULTS');
console.log('================================================================');
console.table(testResults.map(r => ({
  ID: r.id,
  Test: r.name,
  Verdict: r.verdict,
  Findings: r.findings
})));

const overallPass = testResults.every(r => r.verdict === 'PASS');
console.log(`\nOVERALL VERDICT: ${overallPass ? 'PASS' : 'FAIL'}`);
