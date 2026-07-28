// test_app_empirical.js
// Empirical test harness for app.js Chart.js dataset updates & reset logic

import fs from 'fs';
import path from 'path';

const appCode = fs.readFileSync(path.resolve('src/js/app.js'), 'utf8');

console.log('=== EMPIRICAL APP & CHART.JS ANALYSIS ===');

// 1. Regex & Structural Inspection
const appChecks = {
  chartVarDeclared: /let speedChart = null;/.test(appCode),
  initSpeedChartFn: /function initSpeedChart\(\)/.test(appCode),
  dataset0Download: /label:\s*['"]Download['"]/.test(appCode) && /borderColor:\s*['"]#06b6d4['"]/.test(appCode),
  dataset1Upload: /label:\s*['"]Upload['"]/.test(appCode) && /borderColor:\s*['"]#8b5cf6['"]/.test(appCode),
  animationFalse: /animation:\s*false/.test(appCode),
  chartResetOnStart: /speedChart\.data\.labels = \[\]/.test(appCode) &&
                     /speedChart\.data\.datasets\[0\]\.data = \[\]/.test(appCode) &&
                     /speedChart\.data\.datasets\[1\]\.data = \[\]/.test(appCode) &&
                     /speedChart\.update\(['"]none['"]\)/.test(appCode),
  downloadChartUpdate: /speedChart\.data\.labels\.push\(timestamp\)/.test(appCode) &&
                       /speedChart\.data\.datasets\[0\]\.data\.push\(mbpsVal\)/.test(appCode) &&
                       /speedChart\.data\.datasets\[1\]\.data\.push\(null\)/.test(appCode),
  uploadChartUpdate: /speedChart\.data\.datasets\[0\]\.data\.push\(null\)/.test(appCode) &&
                     /speedChart\.data\.datasets\[1\]\.data\.push\(mbpsVal\)/.test(appCode)
};

console.log('App & Chart.js checks:');
for (const [key, val] of Object.entries(appChecks)) {
  console.log(`  ${key}: ${val ? 'PASS' : 'FAIL'}`);
}

// 2. Mock Chart.js and test dataset state transitions
class MockChart {
  constructor(ctx, config) {
    this.ctx = ctx;
    this.type = config.type;
    this.data = config.data;
    this.options = config.options;
    this.updateCalls = [];
  }
  update(mode) {
    this.updateCalls.push(mode);
  }
}

// Test chart dataset behavior under simulation
const chartInstance = new MockChart(null, {
  type: 'line',
  data: {
    labels: [],
    datasets: [
      { label: 'Download', data: [] },
      { label: 'Upload', data: [] }
    ]
  },
  options: { animation: false }
});

console.log('\n--- Simulating Speed Test Lifecycle on Chart ---');

// Phase 0: Initial state
console.log('Initial labels length:', chartInstance.data.labels.length);
console.log('Initial dataset 0 length:', chartInstance.data.datasets[0].data.length);
console.log('Initial dataset 1 length:', chartInstance.data.datasets[1].data.length);

// Phase 1: Click startBtn (Reset Logic)
chartInstance.data.labels = [];
chartInstance.data.datasets[0].data = [];
chartInstance.data.datasets[1].data = [];
chartInstance.update('none');

console.log('\nAfter startBtn reset:');
console.log('Labels length:', chartInstance.data.labels.length);
console.log('Update calls count:', chartInstance.updateCalls.length);
console.log('Last update mode:', chartInstance.updateCalls[chartInstance.updateCalls.length - 1]);

// Phase 2: Download progress updates (5 points)
const testStartTime = Date.now();
for (let i = 1; i <= 5; i++) {
  const timestamp = `${(i * 0.5).toFixed(1)}s`;
  const mbpsVal = Number((10 + i * 5.2).toFixed(2));
  chartInstance.data.labels.push(timestamp);
  chartInstance.data.datasets[0].data.push(mbpsVal);
  chartInstance.data.datasets[1].data.push(null);
  chartInstance.update('none');
}

console.log('\nAfter Download updates (5 points):');
console.log('Labels:', chartInstance.data.labels);
console.log('Dataset 0 (Download):', chartInstance.data.datasets[0].data);
console.log('Dataset 1 (Upload):', chartInstance.data.datasets[1].data);

// Phase 3: Upload progress updates (5 points)
for (let i = 1; i <= 5; i++) {
  const timestamp = `${(2.5 + i * 0.5).toFixed(1)}s`;
  const mbpsVal = Number((5 + i * 3.1).toFixed(2));
  chartInstance.data.labels.push(timestamp);
  chartInstance.data.datasets[0].data.push(null);
  chartInstance.data.datasets[1].data.push(mbpsVal);
  chartInstance.update('none');
}

console.log('\nAfter Upload updates (5 points):');
console.log('Total Labels length:', chartInstance.data.labels.length);
console.log('Dataset 0 length:', chartInstance.data.datasets[0].data.length);
console.log('Dataset 1 length:', chartInstance.data.datasets[1].data.length);
console.log('Dataset 0 data:', chartInstance.data.datasets[0].data);
console.log('Dataset 1 data:', chartInstance.data.datasets[1].data);

// Phase 4: Second click on startBtn (Reset Logic test)
chartInstance.data.labels = [];
chartInstance.data.datasets[0].data = [];
chartInstance.data.datasets[1].data = [];
chartInstance.update('none');

console.log('\nAfter Second startBtn reset:');
console.log('Labels length:', chartInstance.data.labels.length);
console.log('Dataset 0 length:', chartInstance.data.datasets[0].data.length);
console.log('Dataset 1 length:', chartInstance.data.datasets[1].data.length);
console.log('Total update calls:', chartInstance.updateCalls.length);

console.log('=== EMPIRICAL APP VERIFICATION COMPLETE ===');
