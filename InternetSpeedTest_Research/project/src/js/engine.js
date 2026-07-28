export class SpeedTestEngine {
  constructor({ apiUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev', dataSaverMode = false, multiThread = true } = {}) {
    this.apiUrl = apiUrl.replace(/\/$/, '');
    this.fallbackApiUrl = 'https://speed.cloudflare.com';
    this.dataSaverMode = dataSaverMode;
    this.multiThread = multiThread;
    this.abortController = null;
    this.loadedPingDownload = 0;
    this.loadedPingUpload = 0;
    this.useFallback = false;
  }

  async _pingEndpoint(url) {
    const start = performance.now();
    const res = await fetch(url, { cache: 'no-store', mode: 'cors' });
    if (!res.ok) throw new Error(`Ping HTTP status ${res.status}`);
    const end = performance.now();
    return end - start;
  }

  async runPingTest() {
    const results = [];
    const count = 10;
    let targetUrl = `${this.apiUrl}/ping`;

    // Health check primary worker endpoint
    try {
      await fetch(`${targetUrl}?t=${Date.now()}`, { cache: 'no-store', mode: 'cors' });
    } catch (e) {
      console.warn('Primary worker ping endpoint failed, falling back to Cloudflare Edge:', e);
      this.useFallback = true;
      targetUrl = `${this.fallbackApiUrl}/cdn-cgi/trace`;
    }

    for (let i = 0; i < count; i++) {
      try {
        const url = this.useFallback 
          ? `${targetUrl}?t=${Date.now()}_${i}` 
          : `${this.apiUrl}/ping?t=${Date.now()}_${i}`;
        const latency = await this._pingEndpoint(url);
        results.push(latency);
      } catch (e) {
        console.error('Ping iteration error:', e);
      }
      await new Promise(r => setTimeout(r, 40));
    }

    if (results.length === 0) {
      return { ping: 0, min: 0, avg: 0, jitter: 0 };
    }

    const min = Math.min(...results);
    const sum = results.reduce((a, b) => a + b, 0);
    const avg = sum / results.length;
    const variance = results.reduce((a, b) => a + Math.pow(b - avg, 2), 0) / results.length;
    const jitter = Math.sqrt(variance);

    return {
      ping: Math.round(avg * 10) / 10,
      min: Math.round(min * 10) / 10,
      avg: Math.round(avg * 10) / 10,
      jitter: Math.round(jitter * 10) / 10
    };
  }

  async _measureLoadedLatency() {
    try {
      const url = this.useFallback 
        ? `${this.fallbackApiUrl}/cdn-cgi/trace?t=${Date.now()}` 
        : `${this.apiUrl}/ping?t=${Date.now()}`;
      return await this._pingEndpoint(url);
    } catch {
      return null;
    }
  }

  async runDownloadTest(onProgress) {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let totalDownloaded = 0;
    const maxDataSaverLimit = 5 * 1024 * 1024; // 5MB
    const testDuration = 8000; // 8 seconds test
    const startTime = performance.now();

    const getDownloadUrl = (size) => {
      if (this.useFallback) {
        return `${this.fallbackApiUrl}/__down?bytes=${size}&t=${Date.now()}`;
      }
      return `${this.apiUrl}/download?bytes=${size}&t=${Date.now()}`;
    };

    let chunkSize = 500 * 1024; // 500KB default
    try {
      const wStart = performance.now();
      const wRes = await fetch(getDownloadUrl(250000), { signal, cache: 'no-store', mode: 'cors' });
      const wBlob = await wRes.blob();
      const wEnd = performance.now();
      const wSpeedBps = (wBlob.size * 8) / ((wEnd - wStart) / 1000);
      
      if (wSpeedBps > 40 * 1000 * 1000) {
        chunkSize = 10 * 1024 * 1024; // 10MB
      } else if (wSpeedBps > 10 * 1000 * 1000) {
        chunkSize = 2 * 1024 * 1024; // 2MB
      }
    } catch (e) {
      console.warn('Download warmup fallback trigger:', e);
      this.useFallback = true;
    }

    const threads = this.multiThread ? 4 : 1;
    let isRunning = true;
    const loadedLatencies = [];

    const downloadChunk = async () => {
      while (isRunning) {
        try {
          const res = await fetch(getDownloadUrl(chunkSize), { signal, cache: 'no-store', mode: 'cors' });
          if (!res.ok) break;

          if (res.body) {
            const reader = res.body.getReader();
            while (isRunning) {
              const { done, value } = await reader.read();
              if (done) break;
              if (value) {
                totalDownloaded += value.length;
                const now = performance.now();
                const elapsedSecs = (now - startTime) / 1000;
                const currentMbps = (totalDownloaded * 8) / (elapsedSecs * 1000000);

                if (onProgress && elapsedSecs > 0) {
                  onProgress(currentMbps);
                }

                if (this.dataSaverMode && totalDownloaded >= maxDataSaverLimit) {
                  isRunning = false;
                  break;
                }
                if (now - startTime > testDuration) {
                  isRunning = false;
                  break;
                }
              }
            }
          } else {
            const blob = await res.blob();
            totalDownloaded += blob.size;
          }

          if (Math.random() < 0.2) {
            const lat = await this._measureLoadedLatency();
            if (lat) loadedLatencies.push(lat);
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.error('Download chunk error:', e);
          break;
        }
      }
    };

    const tasks = Array.from({ length: threads }, () => downloadChunk());
    await Promise.all(tasks);

    const endTime = performance.now();
    const elapsedSecs = (endTime - startTime) / 1000;
    const finalSpeedMbps = elapsedSecs > 0 ? (totalDownloaded * 8) / (elapsedSecs * 1000000) : 0;
    
    this.loadedPingDownload = loadedLatencies.length 
      ? loadedLatencies.reduce((a, b) => a + b, 0) / loadedLatencies.length 
      : 0;

    const result = new Number(finalSpeedMbps);
    result.speedMbps = finalSpeedMbps;
    result.totalBytes = totalDownloaded;
    result.loadedLatency = this.loadedPingDownload;
    return result;
  }

  async runUploadTest(onProgress) {
    this.abortController = new AbortController();
    const signal = this.abortController.signal;

    let totalUploaded = 0;
    const testDuration = 8000; // 8 seconds
    const startTime = performance.now();
    let isRunning = true;
    const threads = this.multiThread ? 4 : 1;
    const chunkSize = 1024 * 1024; // 1MB chunk
    const payload = new Uint8Array(chunkSize);
    const loadedLatencies = [];

    const getUploadUrl = () => {
      if (this.useFallback) {
        return `${this.fallbackApiUrl}/__up`;
      }
      return `${this.apiUrl}/upload`;
    };

    const uploadChunk = async () => {
      while (isRunning) {
        try {
          const res = await fetch(getUploadUrl(), {
            method: 'POST',
            body: payload,
            signal,
            cache: 'no-store',
            mode: 'cors'
          });

          if (!res.ok && !this.useFallback) {
            this.useFallback = true;
          }

          totalUploaded += chunkSize;
          const now = performance.now();
          const elapsedSecs = (now - startTime) / 1000;
          const currentMbps = (totalUploaded * 8) / (elapsedSecs * 1000000);

          if (Math.random() < 0.2) {
            const lat = await this._measureLoadedLatency();
            if (lat) loadedLatencies.push(lat);
          }

          if (onProgress && elapsedSecs > 0) {
            onProgress(currentMbps);
          }

          if (now - startTime > testDuration) {
            isRunning = false;
            break;
          }
        } catch (e) {
          if (e.name !== 'AbortError') console.error('Upload chunk error:', e);
          break;
        }
      }
    };

    const tasks = Array.from({ length: threads }, () => uploadChunk());
    await Promise.all(tasks);

    const endTime = performance.now();
    const elapsedSecs = (endTime - startTime) / 1000;
    const finalSpeedMbps = elapsedSecs > 0 ? (totalUploaded * 8) / (elapsedSecs * 1000000) : 0;

    this.loadedPingUpload = loadedLatencies.length 
      ? loadedLatencies.reduce((a, b) => a + b, 0) / loadedLatencies.length 
      : 0;

    const result = new Number(finalSpeedMbps);
    result.speedMbps = finalSpeedMbps;
    result.totalBytes = totalUploaded;
    result.loadedLatency = this.loadedPingUpload;
    return result;
  }

  calculateBufferbloatGrade(idlePing, loadedPing) {
    if (idlePing === undefined || loadedPing === undefined || loadedPing === 0) return 'A';
    const delta = loadedPing - idlePing;
    if (delta <= 5) return 'A+';
    if (delta <= 15) return 'A';
    if (delta <= 30) return 'B';
    if (delta <= 60) return 'C';
    if (delta <= 150) return 'D';
    return 'F';
  }

  abort() {
    if (this.abortController) {
      this.abortController.abort();
    }
  }
}

if (typeof window !== 'undefined') {
  window.SpeedTestEngine = SpeedTestEngine;
}
