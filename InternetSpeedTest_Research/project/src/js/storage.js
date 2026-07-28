export class SpeedTestStorage {
  constructor() {
    this.dbName = 'SpeedTestDB';
    this.storeName = 'history';
    this.db = null;
  }

  async init() {
    if (this.db) return;
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, 1);
      request.onerror = (e) => reject('IndexedDB error: ' + (e.target ? e.target.error : e));
      request.onsuccess = (e) => {
        this.db = e.target.result;
        resolve();
      };
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(this.storeName)) {
          db.createObjectStore(this.storeName, { keyPath: 'id', autoIncrement: true });
        }
      };
    });
  }

  async saveResult(resultObj) {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      
      const entry = {
        ...resultObj,
        timestamp: new Date().toISOString()
      };
      
      const request = store.add(entry);
      request.onsuccess = () => resolve(request.result);
      request.onerror = (e) => reject('Error saving result: ' + (e.target ? e.target.error : e));
    });
  }

  async getHistory() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readonly');
      const store = transaction.objectStore(this.storeName);
      const request = store.getAll();
      
      request.onsuccess = () => {
        resolve(request.result || []);
      };
      request.onerror = (e) => reject('Error getting history: ' + (e.target ? e.target.error : e));
    });
  }

  async clearHistory() {
    await this.init();
    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction([this.storeName], 'readwrite');
      const store = transaction.objectStore(this.storeName);
      const request = store.clear();
      
      request.onsuccess = () => resolve();
      request.onerror = (e) => reject('Error clearing history: ' + (e.target ? e.target.error : e));
    });
  }

  async exportCSV() {
    const history = await this.getHistory();
    if (!history || history.length === 0) return '';
    
    const headers = Object.keys(history[0]).join(',');
    const rows = history.map(entry => {
      return Object.values(entry).map(value => {
        if (typeof value === 'object' && value !== null) return `"${JSON.stringify(value).replace(/"/g, '""')}"`;
        return `"${String(value).replace(/"/g, '""')}"`;
      }).join(',');
    });
    
    return [headers, ...rows].join('\n');
  }
}

if (typeof window !== 'undefined') {
  window.SpeedTestStorage = SpeedTestStorage;
}
