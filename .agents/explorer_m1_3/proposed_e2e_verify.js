/**
 * Puppeteer Automated E2E Verification Script
 * Location: proposed in d:\Speed test\.agents\explorer_m1_3\proposed_e2e_verify.js
 * Target deployment: d:\Speed test\e2e_verify.js
 */

const puppeteer = require('puppeteer');
const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

const SERVER_PORT = 8000;
const SERVER_URL = `http://127.0.0.1:${SERVER_PORT}`;
const PROJECT_ROOT = path.resolve(__dirname, '..', '..');

function isServerRunning() {
  return new Promise((resolve) => {
    const req = http.get(`${SERVER_URL}/ping`, (res) => {
      resolve(res.statusCode === 200);
    });
    req.on('error', () => resolve(false));
    req.end();
  });
}

async function main() {
  let serverProcess = null;
  const running = await isServerRunning();

  if (!running) {
    console.log('🚀 Starting test_server.py process...');
    let serverScript = path.join(PROJECT_ROOT, 'test_server.py');
    serverProcess = spawn('python', [serverScript], { cwd: PROJECT_ROOT, stdio: 'ignore' });
    await new Promise((r) => setTimeout(r, 2000));
  } else {
    console.log('✅ Server already running.');
  }

  const browser = await puppeteer.launch({ headless: 'new' });
  const page = await browser.newPage();

  const pageErrors = [];
  page.on('pageerror', (err) => pageErrors.push(err.toString()));

  // Request interception for offline local execution
  await page.setRequestInterception(true);
  page.on('request', (req) => {
    const url = req.url();
    if (url.includes('speed.cloudflare.com') || url.includes('frankbase-speed-api')) {
      const rewritten = url
        .replace('https://speed.cloudflare.com', SERVER_URL)
        .replace('https://frankbase-speed-api.mastermanikant-in.workers.dev', SERVER_URL);
      req.continue({ url: rewritten });
    } else {
      req.continue();
    }
  });

  console.log(`🔗 Navigating to ${SERVER_URL}...`);
  await page.goto(SERVER_URL, { waitUntil: 'networkidle0' });

  // Click start button
  console.log('🖱️ Clicking START SPEED TEST...');
  await page.click('#startBtn');

  // Wait for test to complete
  await page.waitForFunction(
    () => {
      const label = document.getElementById('testPhaseLabel');
      return label && label.textContent.includes('Test Complete');
    },
    { timeout: 35000 }
  );

  const downloadSpeed = await page.$eval('#downloadValue', (el) => parseFloat(el.textContent));
  const uploadSpeed = await page.$eval('#uploadValue', (el) => parseFloat(el.textContent));

  console.log(`📈 Download Speed: ${downloadSpeed} Mbps`);
  console.log(`📈 Upload Speed: ${uploadSpeed} Mbps`);

  if (isNaN(downloadSpeed) || downloadSpeed <= 0) {
    throw new Error(`Download speed assertion failed: ${downloadSpeed} Mbps`);
  }
  if (isNaN(uploadSpeed) || uploadSpeed <= 0) {
    throw new Error(`Upload speed assertion failed: ${uploadSpeed} Mbps`);
  }
  if (pageErrors.length > 0) {
    throw new Error(`Page errors detected: ${pageErrors.join(', ')}`);
  }

  console.log('✨ Puppeteer E2E Verification Passed!');

  await browser.close();
  if (serverProcess) serverProcess.kill();
}

main().catch((err) => {
  console.error('❌ Test failed:', err);
  process.exit(1);
});
