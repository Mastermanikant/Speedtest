export class SpeedTestEngine {
  constructor({ apiUrl = '', dataSaverMode = false, multiThread = true } = {}) {
    this.apiUrl = apiUrl;
    this.dataSaverMode = dataSaverMode;
    this.multiThread = multiThread;
    
    // Create the Web Worker. The path is relative to the HTML file.
    this.worker = new Worker('./src/js/speedtest-worker.js');
    this.loadedPingDownload = 0;
    this.loadedPingUpload = 0;
  }

  _runWorkerCommand(command, options, onProgress) {
    return new Promise((resolve, reject) => {
      const messageHandler = (e) => {
        const { type, data } = e.data;
        
        if (type === 'error') {
          this.worker.removeEventListener('message', messageHandler);
          reject(new Error(data));
        } else if (type === `${command}_progress` && onProgress) {
          onProgress(data);
        } else if (type === `${command}_result`) {
          this.worker.removeEventListener('message', messageHandler);
          resolve(data);
        }
      };

      this.worker.addEventListener('message', messageHandler);
      this.worker.postMessage({ command, options });
    });
  }

  async runPingTest() {
    return await this._runWorkerCommand('ping');
  }

  async runDownloadTest(onProgress) {
    const result = await this._runWorkerCommand('download', {
      dataSaverMode: this.dataSaverMode,
      multiThread: this.multiThread
    }, onProgress);
    
    this.loadedPingDownload = result.loadedLatency;
    return result;
  }

  async runUploadTest(onProgress) {
    const result = await this._runWorkerCommand('upload', {
      multiThread: this.multiThread,
      dataSaverMode: this.dataSaverMode
    }, onProgress);
    
    this.loadedPingUpload = result.loadedLatency;
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
    if (this.worker) {
      this.worker.postMessage({ command: 'abort' });
    }
  }
}
