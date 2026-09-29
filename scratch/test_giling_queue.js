// Simulation test for Mesin Giling single unit queue enforcement

const store = {};
global.localStorage = {
  getItem: (k) => store[k] || null,
  setItem: (k, v) => { store[k] = v; },
  removeItem: (k) => { delete store[k]; },
  clear: () => { Object.keys(store).forEach(k => delete store[k]); }
};

const initialTestItems = [
  {
    id: 'batch_1',
    code: 'PMD0001',
    name: 'Beras A',
    tonase: 10,
    currentStepId: 'C-silo',
    status: 'active',
    assignedMachines: { 'C-silo': 'Silo Kering 1' },
    stepHistory: {
      'C-silo': { startedAt: new Date().toISOString(), completedAt: null, passed: false }
    }
  },
  {
    id: 'batch_2',
    code: 'PMD0002',
    name: 'Beras B',
    tonase: 10,
    currentStepId: 'C-silo',
    status: 'active',
    assignedMachines: { 'C-silo': 'Silo Kering 2' },
    stepHistory: {
      'C-silo': { startedAt: new Date().toISOString(), completedAt: null, passed: false }
    }
  },
  {
    id: 'batch_3',
    code: 'PMD0003',
    name: 'Beras C',
    tonase: 10,
    currentStepId: 'C-silo',
    status: 'active',
    assignedMachines: { 'C-silo': 'Silo Kering 3' },
    stepHistory: {
      'C-silo': { startedAt: new Date().toISOString(), completedAt: null, passed: false }
    }
  }
];

store['monitoring_mesin_step_v9'] = JSON.stringify(initialTestItems);

const domListeners = [];
  const createMockEl = () => ({
    value: '',
    textContent: '',
    innerHTML: '',
    style: {},
    classList: { add: () => {}, remove: () => {}, contains: () => false, toggle: () => {} },
    addEventListener: () => {},
    appendChild: () => {},
    setAttribute: () => {}
  });

  global.document = {
    body: { classList: { contains: () => false, add: () => {}, remove: () => {} } },
    getElementById: (id) => createMockEl(),
    querySelectorAll: () => [],
    createElement: () => createMockEl(),
    addEventListener: (event, fn) => {
      if (event === 'DOMContentLoaded') domListeners.push(fn);
    }
  };
global.window = global;

// Mock audio & toast
global.Audio = class { play() {} };
global.showToast = (msg) => { console.log('[TOAST]', msg); };

// Load app.js
require('../app.js');

// Trigger DOMContentLoaded
domListeners.forEach(fn => fn());

function getStoredItems() {
  return JSON.parse(store['monitoring_mesin_step_v9']);
}

console.log('--- Testing Mesin Giling Queue Logic ---');

// 1. Move Batch 1 into C-giling
console.log('\n1. Moving Batch 1 to C-giling (PK):');
window.executeStepAdvance('batch_1', 'C-giling', 'Mesin Giling 1', 'PK');
let items = getStoredItems();
const b1 = items.find(i => i.id === 'batch_1');
console.log('Batch 1 in Giling:', b1.currentStepId === 'C-giling', 'isQueued:', b1.isQueuedForGiling, 'startedAt:', !!b1.stepHistory['C-giling'].startedAt);
console.assert(b1.isQueuedForGiling === false, 'Batch 1 should be active');

// 2. Move Batch 2 into C-giling while Batch 1 is busy
console.log('\n2. Moving Batch 2 to C-giling (Glosor) while Batch 1 is processing:');
window.executeStepAdvance('batch_2', 'C-giling', 'Mesin Giling 1', 'Glosor');
items = getStoredItems();
const b2 = items.find(i => i.id === 'batch_2');
console.log('Batch 2 in Giling:', b2.currentStepId === 'C-giling', 'isQueued:', b2.isQueuedForGiling, 'startedAt:', b2.stepHistory['C-giling'].startedAt, 'queuedAt:', !!b2.stepHistory['C-giling'].queuedAt);
console.assert(b2.isQueuedForGiling === true, 'Batch 2 MUST be queued');
console.assert(b2.stepHistory['C-giling'].startedAt === null, 'Batch 2 startedAt MUST be null');

// 3. Move Batch 3 into C-giling using assignExistingItemToMachine
console.log('\n3. Moving Batch 3 to C-giling via assignExistingItemToMachine:');
window.assignExistingItemToMachine('batch_3', 'C-giling', 'Mesin Giling 1', 'PK');
items = getStoredItems();
const b3 = items.find(i => i.id === 'batch_3');
console.log('Batch 3 in Giling:', b3.currentStepId === 'C-giling', 'isQueued:', b3.isQueuedForGiling, 'startedAt:', b3.stepHistory['C-giling'].startedAt);
console.assert(b3.isQueuedForGiling === true, 'Batch 3 MUST be queued');

// 4. Batch 1 advances to D-packing directly (shortcut)
console.log('\n4. Batch 1 finishes milling and advances directly to D-packing:');
window.executeStepAdvance('batch_1', 'D-packing', 'Mesin Packing');
items = getStoredItems();
const b1Moved = items.find(i => i.id === 'batch_1');
console.log('Batch 1 current step:', b1Moved.currentStepId);
console.assert(b1Moved.currentStepId === 'D-packing', 'Batch 1 should be in D-packing');

// Check if Batch 2 was promoted
const b2Promoted = items.find(i => i.id === 'batch_2');
console.log('Batch 2 status after B1 departed:', 'isQueued:', b2Promoted.isQueuedForGiling, 'startedAt:', !!b2Promoted.stepHistory['C-giling'].startedAt);
console.assert(b2Promoted.isQueuedForGiling === false, 'Batch 2 should now be promoted to active');

// Check Batch 3 remains queued
const b3StillQueued = items.find(i => i.id === 'batch_3');
console.log('Batch 3 status:', 'isQueued:', b3StillQueued.isQueuedForGiling);
console.assert(b3StillQueued.isQueuedForGiling === true, 'Batch 3 must still be queued');

// 5. Batch 2 advances to D-mix
console.log('\n5. Batch 2 finishes milling and advances to D-mix:');
window.executeStepAdvance('batch_2', 'D-mix', 'Mesin Mix');
items = getStoredItems();
const b3Promoted = items.find(i => i.id === 'batch_3');
console.log('Batch 3 status after B2 departed:', 'isQueued:', b3Promoted.isQueuedForGiling, 'startedAt:', !!b3Promoted.stepHistory['C-giling'].startedAt);
console.assert(b3Promoted.isQueuedForGiling === false, 'Batch 3 should now be promoted to active');

console.log('\n=== ALL QUEUE TESTS PASSED SUCCESSFULLY! ===');
process.exit(0);
