const uploadUrl = 'https://frankbase-speed-api.mastermanikant-in.workers.dev/api/upload';

async function runUploadTest() {
  postMessage({ type: 'log', data: 'Worker initialized. Preparing 512KB payload buffer...' });

  const chunkSize = 512 * 1024; // 512 KB payload
  const payload = new Uint8Array(chunkSize);
  for (let i = 0; i < chunkSize; i++) payload[i] = Math.floor(Math.random() * 256);

  let isRunning = true;
  let totalUploadedBytes = 0;
  const testDuration = 5000;
  const startTime = performance.now();
  const activeXhrs = new Set();
  const speedSamples = [];

  const timer = setTimeout(() => {
    isRunning = false;
    for (const xhr of activeXhrs) {
      try { xhr.abort(); } catch (e) {}
    }
  }, testDuration);

  let lastSampleTime = startTime;
  let lastSampleBytes = 0;

  const uploadTask = async (threadId, pipeId) => {
    while (isRunning) {
      await new Promise((resolve) => {
        if (!isRunning) return resolve();
        const xhr = new XMLHttpRequest();
        const url = `${uploadUrl}?t=${Date.now()}_${threadId}_${pipeId}`;
        xhr.open('POST', url, true);
        xhr.setRequestHeader('Content-Type', 'text/plain');

        let lastLoaded = 0;
        xhr.upload.onprogress = (e) => {
          if (!isRunning) return;
          const delta = e.loaded - lastLoaded;
          if (delta > 0) {
            totalUploadedBytes += delta;
            lastLoaded = e.loaded;
          }
        };

        activeXhrs.add(xhr);

        xhr.onload = () => {
          activeXhrs.delete(xhr);
          if (lastLoaded < chunkSize) totalUploadedBytes += (chunkSize - lastLoaded);
          resolve();
        };

        xhr.onerror = () => {
          activeXhrs.delete(xhr);
          setTimeout(resolve, 100);
        };

        xhr.onabort = () => {
          activeXhrs.delete(xhr);
          resolve();
        };

        try {
          xhr.send(payload);
        } catch (e) {
          activeXhrs.delete(xhr);
          setTimeout(resolve, 100);
        }
      });
    }
  };

  const samplerTask = async () => {
    while (isRunning) {
      await new Promise(r => setTimeout(r, 100));
      if (!isRunning) break;

      const now = performance.now();
      const elapsedSec = (now - lastSampleTime) / 1000;
      const currentTotalBytes = totalUploadedBytes;

      if (currentTotalBytes > lastSampleBytes && elapsedSec > 0) {
        const deltaBytes = currentTotalBytes - lastSampleBytes;
        const currentMbps = (deltaBytes * 8) / (elapsedSec * 1000000);
        speedSamples.push(currentMbps);

        postMessage({
          type: 'progress',
          data: currentMbps,
          totalBytes: currentTotalBytes
        });

        lastSampleTime = now;
        lastSampleBytes = currentTotalBytes;
      }
    }
  };

  // Run 4 threads with 2 parallel requests each (8 total concurrent channels)
  const tasks = [];
  for (let t = 0; t < 4; t++) {
    for (let p = 0; p < 2; p++) {
      tasks.push(uploadTask(t, p));
    }
  }

  await Promise.all([...tasks, samplerTask()]);
  clearTimeout(timer);

  if (speedSamples.length === 0 && totalUploadedBytes > 0) {
    const totalSec = (performance.now() - startTime) / 1000;
    if (totalSec > 0) {
      const avgMbps = (totalUploadedBytes * 8) / (totalSec * 1000000);
      speedSamples.push(avgMbps);
    }
  }

  let finalMbps = 0;
  if (speedSamples.length > 0) {
    const sum = speedSamples.reduce((a, b) => a + b, 0);
    finalMbps = sum / speedSamples.length;
  }

  postMessage({
    type: 'result',
    data: {
      speedMbps: finalMbps,
      totalBytes: totalUploadedBytes
    }
  });
}

self.onmessage = (e) => {
  if (e.data.command === 'start') {
    runUploadTest();
  }
};
