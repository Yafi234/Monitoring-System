// Comprehensive test for all 3 multi-unit stages: Silo Basah, Dryer, Silo Kering
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

function executeStepAdvance(itemId, targetStepId, selectedMachine, gilingType = null, isQueue = false) {
  const item = items.find(i => i.id === itemId);
  if (!item) return { success: false, reason: 'Item not found' };

  const currentIdx = (item.status === 'standby' || !item.currentStepId) ? -1 : getSubstepIndex(item.currentStepId);
  const targetIdx = getSubstepIndex(targetStepId);
  const isDirectGilingToPacking = (item.currentStepId === 'C-giling' && targetStepId === 'D-packing');
  const isStartingFromStandby = (currentIdx === -1);

  if (!isStartingFromStandby && targetIdx > currentIdx + 1 && !isDirectGilingToPacking) {
    return { success: false, reason: 'Cannot skip step' };
  }

  const coItems = getCoLocatedItems(item);
  const coItemIds = coItems.map(it => it.id);
  const totalGroupTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedGroupTonase = Math.round(totalGroupTonase * 10) / 10;

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

// ==========================================
// TEST SEQUENCE: Silo Basah -> Dryer -> Silo Kering -> Giling
// ==========================================
console.log('=== TEST STEP 1: SILO BASAH (SB 1 has 2 batches: 10T & 14T = 24T) ===');
items = [
  { id: 'A1', code: 'PDI-01', name: 'Pak Tono', supir: 'Tono', tonase: 10, currentStepId: 'A-silo', status: 'active', assignedMachines: { 'A-silo': 'Silo Basah 1' } },
  { id: 'A2', code: 'PDI-02', name: 'Pak Anto', supir: 'Anto', tonase: 14, currentStepId: 'A-silo', status: 'active', assignedMachines: { 'A-silo': 'Silo Basah 1' } },
  { id: 'A3', code: 'PDI-03', name: 'Pak Candra', supir: 'Candra', tonase: 10, currentStepId: 'B-dryer', status: 'active', assignedMachines: { 'B-dryer': 'Dryer 1' } }
];

console.log('SB 1 occupancy initially:', getMachineUnitOccupancy('A-silo', 'Silo Basah 1').totalTonase, 'Ton, count:', getMachineUnitOccupancy('A-silo', 'Silo Basah 1').count);

// Try moving to Dryer 1 which already has 10T (10 + 24 = 34 > 30 -> MUST FAIL)
const tryDryer1 = executeStepAdvance('A1', 'B-dryer', 'Dryer 1');
console.log('Try move SB 1 (24T) to Dryer 1 (10T) (expected failure):', tryDryer1.success ? 'UNEXPECTED SUCCESS' : 'FAILED AS EXPECTED');
if (tryDryer1.success) throw new Error('Dryer 1 capacity violation was not blocked!');

// Move to Dryer 2 (empty, 24 <= 30 -> SUCCESS)
const moveDryer2 = executeStepAdvance('A1', 'B-dryer', 'Dryer 2');
console.log('Move SB 1 to Dryer 2 result:', moveDryer2);
if (!moveDryer2.success || moveDryer2.movedCount !== 2) throw new Error('SB 1 move to Dryer 2 failed!');

const sb1After = getMachineUnitOccupancy('A-silo', 'Silo Basah 1');
const d2After = getMachineUnitOccupancy('B-dryer', 'Dryer 2');
console.log('After move: SB 1 count =', sb1After.count, 'Dryer 2 tonase =', d2After.totalTonase, 'count =', d2After.count);
if (sb1After.count !== 0 || d2After.totalTonase !== 24 || d2After.count !== 2) throw new Error('State mismatch after SB->Dryer move');

console.log('STEP 1 PASSED: Silo Basah batches moved together into Dryer 2!\n');

console.log('=== TEST STEP 2: DRYER (Dryer 2 has 2 batches: 24T) -> SILO KERING ===');
// Try move to SK 1 (empty -> SUCCESS)
const moveSK3 = executeStepAdvance('A2', 'C-silo', 'Silo Kering 3');
console.log('Move Dryer 2 to SK 3 result:', moveSK3);
if (!moveSK3.success || moveSK3.movedCount !== 2) throw new Error('Dryer 2 move to SK 3 failed!');

const d2AfterSK = getMachineUnitOccupancy('B-dryer', 'Dryer 2');
const sk3After = getMachineUnitOccupancy('C-silo', 'Silo Kering 3');
console.log('After move: Dryer 2 count =', d2AfterSK.count, 'SK 3 tonase =', sk3After.totalTonase, 'count =', sk3After.count);
if (d2AfterSK.count !== 0 || sk3After.totalTonase !== 24 || sk3After.count !== 2) throw new Error('State mismatch after Dryer->SK move');

console.log('STEP 2 PASSED: Dryer batches moved together into Silo Kering 3!\n');

console.log('=== TEST STEP 3: SILO KERING (SK 3 has 2 batches: 24T) -> MESIN GILING ===');
// Move SK 3 to C-giling
const moveGiling = executeStepAdvance('A1', 'C-giling', 'Mesin Giling 1', 'PK');
console.log('Move SK 3 to Giling result:', moveGiling);
if (!moveGiling.success || moveGiling.movedCount !== 2) throw new Error('SK 3 move to Giling failed!');

const sk3AfterGiling = getMachineUnitOccupancy('C-silo', 'Silo Kering 3');
console.log('After move: SK 3 count =', sk3AfterGiling.count, 'tonase =', sk3AfterGiling.totalTonase);
if (sk3AfterGiling.count !== 0) throw new Error('SK 3 must be empty after moving to Giling');

const itemA1 = items.find(i => i.id === 'A1');
const itemA2 = items.find(i => i.id === 'A2');
console.log('Item A1 in Giling: isQueued =', itemA1.isQueuedForGiling, 'startedAt =', itemA1.stepHistory['C-giling'].startedAt);
console.log('Item A2 in Giling: isQueued =', itemA2.isQueuedForGiling, 'queuedAt =', itemA2.stepHistory['C-giling'].queuedAt);
if (itemA1.isQueuedForGiling !== false || itemA2.isQueuedForGiling !== true) throw new Error('Giling queue assignment incorrect');

// Complete or advance A1 to Packing
console.log('Now advancing Item A1 to Packing...');
executeStepAdvance('A1', 'D-packing', 'Packing 1');
console.log('Item A2 status after A1 departs: isQueued =', itemA2.isQueuedForGiling, 'startedAt =', itemA2.stepHistory['C-giling'].startedAt);
if (itemA2.isQueuedForGiling !== false) throw new Error('Item A2 was not promoted to active in Giling');

console.log('STEP 3 PASSED: Silo Kering batches moved together to Giling with correct sequential queuing!\n');
console.log('ALL THREE STAGES (SILO BASAH, DRYER, SILO KERING) FULLY VERIFIED AND PASSING 100%!');
