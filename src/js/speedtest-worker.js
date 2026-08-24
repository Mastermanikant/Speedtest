let abortController = null;
const primaryApiUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev';
const fallbackApiUrl = 'https://speed.cloudflare.com';
let useFallback = false;

// Helpers
const getLatencyUrl = () => useFallback ? `${fallbackApiUrl}/cdn-cgi/trace` : `${primaryApiUrl}/api/ping`;
const getDownloadUrl = (bytes) => useFallback ? `${fallbackApiUrl}/__down?bytes=${bytes}` : `${primaryApiUrl}/api/download?bytes=${bytes}`;

function calc90thPercentile(samples) {
  if (samples.length === 0) return 0;
  // Sort ascending (non-mutating)
  const sorted = samples.slice().sort((a, b) => a - b);
  // Discard top 5% (spikes) and bottom 10% (dips)
  const lowerIndex = Math.floor(sorted.length * 0.10);
  const upperIndex = Math.floor(sorted.length * 0.95);
  const validSamples = sorted.slice(lowerIndex, upperIndex > lowerIndex ? upperIndex : sorted.length);
  
  if (validSamples.length === 0) return sorted[Math.floor(sorted.length / 2)];
  
  const sum = validSamples.reduce((a, b) => a + b, 0);
  return sum / validSamples.length;
}

async function pingEndpoint(url) {
  const start = performance.now();
  const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
  if (!res.ok) throw new Error('Ping failed');
  const end = performance.now();
  return end - start;
}

async function runPingTest() {
  const results = [];
  const count = 10;
  let targetUrl = getLatencyUrl();

  // Warmup and fallback check
  try {
    await fetch(`${targetUrl}?t=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
  } catch (e) {
    useFallback = true;
    targetUrl = getLatencyUrl();
  }

  for (let i = 0; i < count; i++) {
    try {
      const latency = await pingEndpoint(`${targetUrl}?t=${Date.now()}_${i}`);
      results.push(latency);
    } catch (e) {
      // ignore
    }
    await new Promise(r => setTimeout(r, 40));
  }

  if (results.length === 0) {
    postMessage({ type: 'ping_result', data: { ping: 0, min: 0, avg: 0, jitter: 0 } });
    return;
  }

  const min = Math.min(...results);
  const sum = results.reduce((a, b) => a + b, 0);
  const avg = sum / results.length;
  const variance = results.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / results.length;
  const jitter = Math.sqrt(variance);

  postMessage({
    type: 'ping_result',
    data: {
      ping: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      jitter: Math.round(jitter * 10) / 10
    }
  });
}

async function measureLoadedLatency() {
  try {
    return await pingEndpoint(`${getLatencyUrl()}?t=${Date.now()}`);
  } catch {
    return null;
  }
}

async function runDownloadTest(dataSaverMode = false, multiThread = true) {
  if (abortController) { abortController.abort(); }
  abortController = new AbortController();
  const signal = abortController.signal;
  let totalDownloaded = 0;
  const maxDataSaverLimit = 5 * 1024 * 1024;
  const testDuration = 5000; // 5s per phase
  const startTime = performance.now();
  let isRunning = true;
  const threads = multiThread ? 4 : 1;
  const loadedLatencies = [];
  const speedSamples = [];
  let lastSampleTime = startTime;
  let lastSampleBytes = 0;

  // Hard timeout timer to unblock stalled fetch readers
  const timer = setTimeout(() => {
    isRunning = false;
    try { abortController.abort(); } catch (e) {}
  }, testDuration);

  // Adaptive logic
  let fetchSize = 25 * 1024 * 1024; // start with 25MB

  const downloadTask = async () => {
    while (isRunning) {
      try {
        const url = `${getDownloadUrl(fetchSize)}&t=${Date.now()}`;
        const res = await fetch(url, { signal, cache: 'no-store', mode: 'cors' });
        if (!res.ok) break;

        if (res.body) {
          const reader = res.body.getReader();
          while (isRunning) {
            const { done, value } = await reader.read();
            if (done) break;
            if (value) {
              totalDownloaded += value.length;
              const now = performance.now();
              
              // Sample speed every ~100ms
              if (now - lastSampleTime >= 100) {
                const elapsedSinceSample = (now - lastSampleTime) / 1000;
                const bytesSinceSample = totalDownloaded - lastSampleBytes;
                const currentMbps = (bytesSinceSample * 8) / (elapsedSinceSample * 1000000);
                
                speedSamples.push(currentMbps);
                
                // Adaptive chunk sizing (ramp up if we are eating data too fast)
                if (currentMbps > 200) {
                  fetchSize = 100 * 1024 * 1024; // Up to 100MB chunk for fast connections
                } else if (currentMbps > 50) {
                  fetchSize = 50 * 1024 * 1024;
                }

                // Send progress based on rolling average or raw sample
                postMessage({ type: 'download_progress', data: currentMbps });
                
                lastSampleTime = now;
                lastSampleBytes = totalDownloaded;
              }

              if (dataSaverMode && totalDownloaded >= maxDataSaverLimit) {
                isRunning = false;
                break;
              }
              if (now - startTime > testDuration) {
                isRunning = false;
                break;
              }
            }
          }
        }
        
        // Randomly measure loaded latency (approx 20% chance per fetch completion)
        if (Math.random() < 0.2) {
          const lat = await measureLoadedLatency();
          if (lat) loadedLatencies.push(lat);
        }
      } catch (e) {
        if (e.name !== 'AbortError') console.error('Download error:', e);
        break;
      }
    }
  };

  const tasks = Array.from({ length: threads }, () => downloadTask());
  try {
    await Promise.all(tasks);
  } catch (e) {} finally {
    clearTimeout(timer);
  }

  if (abortController && abortController.signal.aborted) {
    return;
  }

  const finalSpeedMbps = calc90thPercentile(speedSamples);
  const loadedLatencyAvg = loadedLatencies.length ? loadedLatencies.reduce((a, b) => a + b, 0) / loadedLatencies.length : 0;

  postMessage({
    type: 'download_result',
    data: {
      speedMbps: finalSpeedMbps,
      totalBytes: totalDownloaded,
      loadedLatency: loadedLatencyAvg
    }
  });
}



self.onmessage = async (e) => {
  const { command, options } = e.data;
  
  if (command === 'abort') {
    if (abortController) abortController.abort();
    return;
  }
  
  try {
    if (command === 'ping') {
      await runPingTest();
    } else if (command === 'download') {
      await runDownloadTest(options?.dataSaverMode, options?.multiThread);
    }
  } catch (err) {
    postMessage({ type: 'error', data: err.message });
  }
};
