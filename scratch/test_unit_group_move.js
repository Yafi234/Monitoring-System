// Test unit group move logic
const UNIT_MAX_CAPACITY = 30.0;

const SUBSTEPS = [
  { id: 'A-silo', stageName: 'Tahap A', lineName: 'Silo Basah', unitCount: 4, unitPrefix: 'Silo Basah' },
  { id: 'B-dryer', stageName: 'Tahap B', lineName: 'Dryer (Pengeringan)', unitCount: 5, unitPrefix: 'Dryer' },
  { id: 'C-silo', stageName: 'Tahap C', lineName: 'Silo Kering', unitCount: 9, unitPrefix: 'Silo Kering' },
  { id: 'C-giling', stageName: 'Tahap C', lineName: 'Mesin Giling' },
  { id: 'D-mix', stageName: 'Tahap D', lineName: 'Mesin Mix' },
  { id: 'D-packing', stageName: 'Tahap D', lineName: 'Packing & Timbang' }
];

function getSubstep(id) {
  return SUBSTEPS.find(s => s.id === id);
}

function getSubstepIndex(id) {
  return SUBSTEPS.findIndex(s => s.id === id);
}

let items = [];

function getMachineUnitOccupancy(stepId, machineUnitName, excludeItemId = null) {
  const isExcluded = (id) => {
    if (!excludeItemId) return false;
    if (Array.isArray(excludeItemId)) return excludeItemId.includes(id);
    return id === excludeItemId;
  };

  const matchingItems = items.filter(i => 
    !isExcluded(i.id) &&
    i.currentStepId === stepId &&
    (i.status === 'active' || i.status === 'stopped') &&
    i.assignedMachines &&
    i.assignedMachines[stepId] === machineUnitName
  );

  const totalTonase = matchingItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedTotal = Math.round(totalTonase * 10) / 10;
  const remaining = Math.max(0, Math.round((UNIT_MAX_CAPACITY - roundedTotal) * 10) / 10);
  const isFull = roundedTotal >= UNIT_MAX_CAPACITY;
  const percent = Math.min(100, Math.round((roundedTotal / UNIT_MAX_CAPACITY) * 100));

  return {
    items: matchingItems,
    count: matchingItems.length,
    totalTonase: roundedTotal,
    maxCapacity: UNIT_MAX_CAPACITY,
    remainingCapacity: remaining,
    isFull,
    percent
  };
}

function getCoLocatedItems(item) {
  if (!item || !item.currentStepId) return item ? [item] : [];
  const stepId = item.currentStepId;
  const isMultiCap = (stepId === 'A-silo' || stepId === 'B-dryer' || stepId === 'C-silo');
  if (!isMultiCap) return [item];
  const machine = item.assignedMachines?.[stepId];
  if (!machine) return [item];
  const group = items.filter(i => 
    i.currentStepId === stepId && 
    i.assignedMachines?.[stepId] === machine && 
    (i.status === 'active' || i.status === 'stopped')
  );
  return group.length > 0 ? group : [item];
}

function isGilingMachineBusy(excludeItemId = null) {
  return items.some(i => 
    i.id !== excludeItemId &&
    i.currentStepId === 'C-giling' &&
    !i.isQueuedForGiling &&
    (i.status === 'active' || i.status === 'stopped')
  );
}

function getActiveGilingItem() {
  return items.find(i => 
    i.currentStepId === 'C-giling' &&
    !i.isQueuedForGiling &&
    (i.status === 'active' || i.status === 'stopped')
  );
}

function getNextGilingQueuedItem() {
  const queued = items.filter(i => 
    i.currentStepId === 'C-giling' &&
    i.isQueuedForGiling &&
    (i.status === 'active' || i.status === 'stopped')
  );
  if (queued.length === 0) return null;
  queued.sort((a, b) => {
    const tA = a.stepHistory?.['C-giling']?.queuedAt || a.masukAt || '9999';
    const tB = b.stepHistory?.['C-giling']?.queuedAt || b.masukAt || '9999';
    return tA.localeCompare(tB);
  });
  return queued[0];
}

function promoteNextGilingQueue() {
  if (isGilingMachineBusy()) return;
  const nextItem = getNextGilingQueuedItem();
  if (nextItem) {
    nextItem.isQueuedForGiling = false;
    if (!nextItem.stepHistory) nextItem.stepHistory = {};
    if (!nextItem.stepHistory['C-giling']) nextItem.stepHistory['C-giling'] = {};
    nextItem.stepHistory['C-giling'].startedAt = new Date().toISOString();
  }
}

function isMachineUnderMaintenance(stepId, machineUnitName) {
  return false;
}

function executeStepAdvance(itemId, targetStepId, selectedMachine, gilingType, isQueue) {
  const item = items.find(i => i.id === itemId);
  if (!item) return { success: false, reason: 'Item not found' };

  const currentIdx = (item.status === 'standby' || !item.currentStepId) ? -1 : getSubstepIndex(item.currentStepId);
  const targetIdx = getSubstepIndex(targetStepId);
  const isDirectGilingToPacking = (item.currentStepId === 'C-giling' && targetStepId === 'D-packing');
  const isStartingFromStandby = (currentIdx === -1);

  if (!isStartingFromStandby && targetIdx > currentIdx + 1 && !isDirectGilingToPacking) {
    return { success: false, reason: 'Cannot skip step' };
  }

  // Wajib ambil seluruh muatan yang satu unit fisik
  const coItems = getCoLocatedItems(item);
  const coItemIds = coItems.map(it => it.id);
  const totalGroupTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedGroupTonase = Math.round(totalGroupTonase * 10) / 10;

  // Validasi kapasitas target
  if (selectedMachine && (targetStepId === 'A-silo' || targetStepId === 'B-dryer' || targetStepId === 'C-silo')) {
    const occ = getMachineUnitOccupancy(targetStepId, selectedMachine, coItemIds);
    if (occ.totalTonase + roundedGroupTonase > UNIT_MAX_CAPACITY) {
      return { success: false, reason: `Target ${selectedMachine} over capacity: ${occ.totalTonase} + ${roundedGroupTonase} > 30` };
    }
  }

  const isGilingBusyInitially = (targetStepId === 'C-giling') ? isGilingMachineBusy(item.id) : false;
  const nowIso = new Date().toISOString();
  const oldStepId = item.currentStepId;

  coItems.forEach((currItem, idxInGroup) => {
    const itOldStepId = currItem.currentStepId;
    if (!currItem.stepHistory) currItem.stepHistory = {};
    if (!currItem.assignedMachines) currItem.assignedMachines = {};

    if (itOldStepId && currItem.stepHistory[itOldStepId]) {
      currItem.stepHistory[itOldStepId].completedAt = nowIso;
      currItem.stepHistory[itOldStepId].passed = true;
    }

    SUBSTEPS.forEach((step, idx) => {
      if (!currItem.stepHistory[step.id]) {
        currItem.stepHistory[step.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
      }
      if (idx < targetIdx) {
        if (!currItem.stepHistory[step.id].passed) {
          currItem.stepHistory[step.id].passed = true;
          if (!currItem.stepHistory[step.id].startedAt) currItem.stepHistory[step.id].startedAt = nowIso;
          if (!currItem.stepHistory[step.id].completedAt) currItem.stepHistory[step.id].completedAt = nowIso;
        }
      } else if (idx === targetIdx) {
        currItem.stepHistory[step.id].passed = false;
        currItem.stepHistory[step.id].completedAt = null;
      }
    });

    if (selectedMachine) {
      currItem.assignedMachines[targetStepId] = selectedMachine;
      currItem.stepHistory[targetStepId].machine = selectedMachine;
    }

    if (targetStepId === 'C-giling') {
      currItem.gilingType = gilingType || currItem.gilingType || 'PK';
      currItem.stepHistory['C-giling'].gilingType = currItem.gilingType;
      const mustQueue = isGilingBusyInitially || idxInGroup > 0 || !!isQueue;
      currItem.isQueuedForGiling = mustQueue;
      if (mustQueue) {
        currItem.stepHistory['C-giling'].startedAt = null;
        currItem.stepHistory['C-giling'].queuedAt = nowIso;
      } else {
        currItem.stepHistory['C-giling'].startedAt = nowIso;
        currItem.stepHistory['C-giling'].queuedAt = null;
      }
    } else {
      currItem.isQueuedForGiling = false;
      currItem.stepHistory[targetStepId].startedAt = nowIso;
    }

    currItem.currentStepId = targetStepId;
    currItem.status = 'active';
  });

  if (oldStepId === 'C-giling') {
    promoteNextGilingQueue();
  }

  return { success: true, movedCount: coItems.length, totalTonase: roundedGroupTonase };
}

// RUN TESTS
console.log('--- TEST 1: Dryer 2 with 2 batches (10T & 15T) moving together to Silo Kering 3 ---');
items = [
  { id: '1', code: 'PMD0001', name: 'Pak Joko', supir: 'Joko', tonase: 10, currentStepId: 'B-dryer', status: 'active', assignedMachines: { 'B-dryer': 'Dryer 2' } },
  { id: '2', code: 'PMD0002', name: 'Pak Budi', supir: 'Budi', tonase: 15, currentStepId: 'B-dryer', status: 'active', assignedMachines: { 'B-dryer': 'Dryer 2' } },
  { id: '3', code: 'PMD0003', name: 'Pak Andi', supir: 'Andi', tonase: 20, currentStepId: 'C-silo', status: 'active', assignedMachines: { 'C-silo': 'Silo Kering 1' } }
];

console.log('Occupancy Dryer 2 initially:', getMachineUnitOccupancy('B-dryer', 'Dryer 2'));
console.log('Occupancy SK 1 initially:', getMachineUnitOccupancy('C-silo', 'Silo Kering 1'));
console.log('Occupancy SK 3 initially:', getMachineUnitOccupancy('C-silo', 'Silo Kering 3'));

// Test moving to SK 1 (has 20T, 20 + 25 = 45 > 30 -> should fail)
let resFail = executeStepAdvance('1', 'C-silo', 'Silo Kering 1');
console.log('Try move to SK 1 (should fail):', resFail);
if (resFail.success !== false) throw new Error('Should have failed for SK 1');

// Test moving to SK 3 (empty, 0 + 25 = 25 <= 30 -> should succeed)
let resOk = executeStepAdvance('1', 'C-silo', 'Silo Kering 3');
console.log('Move to SK 3 result:', resOk);
if (!resOk.success) throw new Error('Should have succeeded');
if (resOk.movedCount !== 2) throw new Error('Both items must move!');

const d2After = getMachineUnitOccupancy('B-dryer', 'Dryer 2');
console.log('Dryer 2 after move (should be 0T):', d2After.totalTonase, 'items:', d2After.count);
if (d2After.count !== 0) throw new Error('Dryer 2 should be empty');

const sk3After = getMachineUnitOccupancy('C-silo', 'Silo Kering 3');
console.log('SK 3 after move (should be 25T, 2 items):', sk3After.totalTonase, 'items:', sk3After.count);
if (sk3After.totalTonase !== 25 || sk3After.count !== 2) throw new Error('SK 3 must have 25T and 2 items');

// Check item 1 and item 2 properties
const it1 = items.find(i => i.id === '1');
const it2 = items.find(i => i.id === '2');
if (it1.currentStepId !== 'C-silo' || it1.assignedMachines['C-silo'] !== 'Silo Kering 3') throw new Error('Item 1 failed');
if (it2.currentStepId !== 'C-silo' || it2.assignedMachines['C-silo'] !== 'Silo Kering 3') throw new Error('Item 2 failed');

console.log('TEST 1 PASSED!\n');

console.log('--- TEST 2: Move SK 3 (2 batches) to C-giling (Single machine queue) ---');
// Giling is currently idle. When we advance item 1 or item 2 to C-giling:
// Both must leave SK 3. Item 1 active, Item 2 queued.
let resGiling = executeStepAdvance('2', 'C-giling', 'Mesin Giling 1', 'PK');
console.log('Move to C-giling result:', resGiling);
if (!resGiling.success || resGiling.movedCount !== 2) throw new Error('Giling move failed');

const sk3AfterGiling = getMachineUnitOccupancy('C-silo', 'Silo Kering 3');
console.log('SK 3 after giling (should be 0T):', sk3AfterGiling.totalTonase, 'items:', sk3AfterGiling.count);
if (sk3AfterGiling.count !== 0) throw new Error('SK 3 must be empty after moving to giling');

console.log('Item 1 in giling: isQueued =', it1.isQueuedForGiling, 'startedAt =', it1.stepHistory['C-giling'].startedAt);
console.log('Item 2 in giling: isQueued =', it2.isQueuedForGiling, 'queuedAt =', it2.stepHistory['C-giling'].queuedAt);

if (it1.isQueuedForGiling !== false) throw new Error('First item should be active');
if (it2.isQueuedForGiling !== true) throw new Error('Second item should be queued');

console.log('Now advance Item 1 from Giling to D-packing...');
executeStepAdvance('1', 'D-packing', 'Packing 1');
console.log('After Item 1 leaves giling: Item 2 isQueued =', it2.isQueuedForGiling, 'startedAt =', it2.stepHistory['C-giling'].startedAt);
if (it2.isQueuedForGiling !== false) throw new Error('Item 2 should have been promoted to active');

console.log('TEST 2 PASSED!\n');
console.log('ALL TESTS PASSED 100%!');
