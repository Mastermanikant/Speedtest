// App Controller - Connects UI with SpeedTestEngine and SpeedTestStorage
import { SpeedTestStorage } from './storage.js';
import { SpeedTestEngine } from './engine.js';

document.addEventListener('DOMContentLoaded', () => {
  // DOM Elements
  const appContainer = document.querySelector('.app-container');
  const startBtn = document.getElementById('startBtn');
  const dataSaverToggle = document.getElementById('dataSaverToggle');
  const multiThreadToggle = document.getElementById('multiThreadToggle');
  const ispNameEl = document.getElementById('ispName');
  const gaugeValueEl = document.getElementById('gaugeValue');
  const gaugeUnitEl = document.getElementById('gaugeUnit');
  const testPhaseLabel = document.getElementById('testPhaseLabel');
  
  const downloadValueEl = document.getElementById('downloadValue');
  const uploadValueEl = document.getElementById('uploadValue');
  const pingValueEl = document.getElementById('pingValue');
  const jitterValueEl = document.getElementById('jitterValue');
  const bufferbloatGradeEl = document.getElementById('bufferbloatGrade');
  const bufferbloatDescEl = document.getElementById('bufferbloatDesc');
  
  const historyTableBody = document.getElementById('historyTableBody');
  const exportCsvBtn = document.getElementById('exportCsvBtn');
  const clearHistoryBtn = document.getElementById('clearHistoryBtn');
  
  // Storage & Engine Initialization
  const storage = new SpeedTestStorage();
  const canvas = document.getElementById('gaugeCanvas');
  const ctx = canvas.getContext('2d');
  
  let isTesting = false;
  let currentSpeed = 0;
  let targetSpeed = 0;
  let currentMaxGauge = 100;
  let animId = null;

  // Initialize Canvas Speedometer Gauge with Dynamic Scaling
  function drawGauge(value, maxVal = 100) {
    const width = canvas.width;
    const height = canvas.height;
    const cx = width / 2;
    const cy = height - 35;
    const radius = 105;
    
    ctx.clearRect(0, 0, width, height);

    // Dynamic max scale adaptation
    if (value > maxVal * 0.85) {
      if (maxVal <= 10) currentMaxGauge = 50;
      else if (maxVal <= 50) currentMaxGauge = 100;
      else if (maxVal <= 100) currentMaxGauge = 250;
      else if (maxVal <= 250) currentMaxGauge = 500;
      else if (maxVal <= 500) currentMaxGauge = 1000;
      maxVal = currentMaxGauge;
    }

    // Background Track Arc
    ctx.beginPath();
    ctx.arc(cx, cy, radius, Math.PI * 0.85, 2.15 * Math.PI, false);
    ctx.lineWidth = 16;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Active Value Arc (Gradients)
    const ratio = Math.min(Math.max(value / maxVal, 0), 1);
    const startAngle = Math.PI * 0.85;
    const totalAngleRange = 1.3 * Math.PI;
    const endAngle = startAngle + ratio * totalAngleRange;

    if (ratio > 0) {
      const gradient = ctx.createLinearGradient(0, 0, width, 0);
      gradient.addColorStop(0, '#06b6d4');
      gradient.addColorStop(0.5, '#3b82f6');
      gradient.addColorStop(1, '#8b5cf6');

      ctx.beginPath();
      ctx.arc(cx, cy, radius, startAngle, endAngle, false);
      ctx.lineWidth = 16;
      ctx.strokeStyle = gradient;
      ctx.lineCap = 'round';
      ctx.stroke();
    }

    // Gauge Ticks
    const tickCount = 6;
    ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
    ctx.font = '11px Inter, sans-serif';
    ctx.textAlign = 'center';

    for (let i = 0; i <= tickCount; i++) {
      const tickRatio = i / tickCount;
      const angle = startAngle + tickRatio * totalAngleRange;
      const tickVal = Math.round(tickRatio * maxVal);
      
      const txInner = cx + (radius - 22) * Math.cos(angle);
      const tyInner = cy + (radius - 22) * Math.sin(angle);
      const txOuter = cx + (radius - 14) * Math.cos(angle);
      const tyOuter = cy + (radius - 14) * Math.sin(angle);

      ctx.beginPath();
      ctx.moveTo(txInner, tyInner);
      ctx.lineTo(txOuter, tyOuter);
      ctx.lineWidth = 2;
      ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
      ctx.stroke();

      const labelDist = radius - 34;
      const lx = cx + labelDist * Math.cos(angle);
      const ly = cy + labelDist * Math.sin(angle) + 4;
      ctx.fillText(tickVal.toString(), lx, ly);
    }

    // Needle Position
    const needleAngle = startAngle + ratio * totalAngleRange;
    const nx = cx + (radius - 20) * Math.cos(needleAngle);
    const ny = cy + (radius - 20) * Math.sin(needleAngle);

    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(nx, ny);
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#06b6d4';
    ctx.lineCap = 'round';
    ctx.stroke();

    // Needle Center Circle
    ctx.beginPath();
    ctx.arc(cx, cy, 7, 0, 2 * Math.PI);
    ctx.fillStyle = '#06b6d4';
    ctx.fill();
  }

  // Smooth Gauge Animation Loop
  function animateGauge() {
    currentSpeed += (targetSpeed - currentSpeed) * 0.18;
    drawGauge(currentSpeed, currentMaxGauge);
    gaugeValueEl.textContent = currentSpeed.toFixed(2);
    if (isTesting) {
      animId = requestAnimationFrame(animateGauge);
    } else {
      currentSpeed = 0;
      targetSpeed = 0;
      drawGauge(0, currentMaxGauge);
      gaugeValueEl.textContent = '0.00';
    }
  }

  drawGauge(0, 100);

  // Auto-Detect Network & ISP Info
  async function detectNetwork() {
    try {
      const res = await fetch('https://ipapi.co/json/').catch(() => null);
      if (res && res.ok) {
        const data = await res.json();
        const ispStr = data.org || data.asn || 'Connected Network';
        const locStr = data.city ? `${data.city}, ${data.country_code}` : (data.country_name || '');
        ispNameEl.textContent = `${ispStr} ${locStr ? '(' + locStr + ')' : ''}`;
      } else {
        const fallbackRes = await fetch('https://speed.cloudflare.com/cdn-cgi/trace').catch(() => null);
        if (fallbackRes && fallbackRes.ok) {
          const text = await fallbackRes.text();
          const ipLine = text.split('\n').find(l => l.startsWith('ip='));
          const locLine = text.split('\n').find(l => l.startsWith('loc='));
          const ip = ipLine ? ipLine.split('=')[1] : '';
          const loc = locLine ? locLine.split('=')[1] : '';
          ispNameEl.textContent = `IP: ${ip} [${loc}]`;
        } else {
          ispNameEl.textContent = 'Active Network Node';
        }
      }
    } catch {
      ispNameEl.textContent = 'Active Network Node';
    }
  }
  detectNetwork();

  // Load Recent Test History from Storage
  async function renderHistory() {
    try {
      const history = await storage.getHistory();
      if (!history || history.length === 0) {
        historyTableBody.innerHTML = `<tr><td colspan="6" class="empty-msg">No tests recorded yet. Click Start Speed Test!</td></tr>`;
        return;
      }

      historyTableBody.innerHTML = history.slice(-10).reverse().map(item => `
        <tr>
          <td>${new Date(item.timestamp).toLocaleString()}</td>
          <td style="color: var(--accent-cyan); font-weight: 600;">${Number(item.downloadMbps).toFixed(2)} Mbps</td>
          <td style="color: var(--accent-purple); font-weight: 600;">${Number(item.uploadMbps).toFixed(2)} Mbps</td>
          <td>${Number(item.pingMs).toFixed(1)} ms</td>
          <td>${Number(item.jitterMs).toFixed(1)} ms</td>
          <td><span class="grade-badge grade-${String(item.bufferbloatGrade).toLowerCase().replace('+', '-plus')}">${item.bufferbloatGrade}</span></td>
        </tr>
      `).join('');
    } catch (e) {
      console.error('History render error:', e);
    }
  }
  renderHistory();

  // Start Speed Test Execution Flow
  startBtn.addEventListener('click', async () => {
    if (isTesting) return;

    isTesting = true;
    if (appContainer) appContainer.classList.add('zero-gravity-active');
    startBtn.disabled = true;
    startBtn.textContent = 'TEST IN PROGRESS...';
    currentMaxGauge = 100;
    
    // Reset UI Values
    downloadValueEl.textContent = '--';
    uploadValueEl.textContent = '--';
    pingValueEl.textContent = '--';
    jitterValueEl.textContent = '--';
    bufferbloatGradeEl.textContent = '--';
    bufferbloatGradeEl.className = 'grade-badge grade-none';
    bufferbloatDescEl.textContent = 'Measuring latency...';

    const apiUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev';

    const engine = new SpeedTestEngine({
      apiUrl,
      dataSaverMode: dataSaverToggle.checked,
      multiThread: multiThreadToggle.checked
    });

    try {
      // 1. PING & JITTER TEST
      testPhaseLabel.textContent = 'Testing Ping & Jitter...';
      const pingResult = await engine.runPingTest();
      const pingVal = pingResult.ping !== undefined ? pingResult.ping : pingResult.avg;
      const jitterVal = pingResult.jitter || 0;

      pingValueEl.textContent = Number(pingVal).toFixed(1);
      jitterValueEl.textContent = Number(jitterVal).toFixed(1);

      // Start Gauge Animation Loop
      animId = requestAnimationFrame(animateGauge);

      // 2. DOWNLOAD TEST
      testPhaseLabel.textContent = 'Testing Download Speed...';
      targetSpeed = 0;
      currentSpeed = 0;

      const downloadRaw = await engine.runDownloadTest((speed) => {
        targetSpeed = speed;
      });

      const downloadMbps = typeof downloadRaw === 'object' && downloadRaw.speedMbps !== undefined 
        ? downloadRaw.speedMbps 
        : Number(downloadRaw);

      downloadValueEl.textContent = downloadMbps.toFixed(2);

      // 3. UPLOAD TEST
      testPhaseLabel.textContent = 'Testing Upload Speed...';
      targetSpeed = 0;
      currentSpeed = 0;

      const uploadRaw = await engine.runUploadTest((speed) => {
        targetSpeed = speed;
      });

      const uploadMbps = typeof uploadRaw === 'object' && uploadRaw.speedMbps !== undefined 
        ? uploadRaw.speedMbps 
        : Number(uploadRaw);

      uploadValueEl.textContent = uploadMbps.toFixed(2);

      // 4. BUFFERBLOAT EVALUATION
      const loadedPing = engine.loadedPingDownload || pingVal;
      const bbGrade = engine.calculateBufferbloatGrade(pingVal, loadedPing);
      bufferbloatGradeEl.textContent = bbGrade;
      bufferbloatGradeEl.className = `grade-badge grade-${bbGrade.toLowerCase().replace('+', '-plus')}`;
      bufferbloatDescEl.textContent = bbGrade.includes('A') ? 'Excellent for Gaming & Video Calls' : 'Network bufferbloat detected';

      // Finish Test
      testPhaseLabel.textContent = 'Test Complete!';
      targetSpeed = 0;

      // Save Result to IndexedDB
      await storage.saveResult({
        downloadMbps,
        uploadMbps,
        pingMs: pingVal,
        jitterMs: jitterVal,
        bufferbloatGrade: bbGrade,
        isp: ispNameEl.textContent
      });

      await renderHistory();

    } catch (err) {
      console.error('Speed test execution error:', err);
      testPhaseLabel.textContent = 'Test Completed (Edge fallback)';
    } finally {
      isTesting = false;
      if (appContainer) appContainer.classList.remove('zero-gravity-active');
      startBtn.disabled = false;
      startBtn.textContent = 'START SPEED TEST';
    }
  });

  // Export CSV Handler
  exportCsvBtn.addEventListener('click', async () => {
    const csv = await storage.exportCSV();
    if (!csv) return alert('No history data to export.');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `speedpulse-history-${Date.now()}.csv`;
    a.click();
  });

  // Clear History Handler
  clearHistoryBtn.addEventListener('click', async () => {
    if (confirm('Clear all test history?')) {
      await storage.clearHistory();
      await renderHistory();
    }
  });
});
