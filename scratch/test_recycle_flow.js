// Test recycling flow (Alur Pengulangan Mesin dari Silo Kering ke Dryer atau Silo Basah karena gabah masih basah)
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

function isGilingMachineBusy() { return false; }
function isMachineUnderMaintenance() { return false; }

function executeStepAdvance(itemId, targetStepId, selectedMachine) {
  const item = items.find(i => i.id === itemId);
  if (!item) return { success: false, reason: 'Item not found' };

  const currentIdx = (item.status === 'standby' || !item.currentStepId) ? -1 : getSubstepIndex(item.currentStepId);
  const targetIdx = getSubstepIndex(targetStepId);
  const isDirectGilingToPacking = (item.currentStepId === 'C-giling' && targetStepId === 'D-packing');
  const isStartingFromStandby = (currentIdx === -1);
  const isRecyclingFlow = (item.currentStepId === 'C-silo' && targetStepId === 'A-silo');

  // Validasi ketat: Alur proses TIDAK BOLEH terlewati! Kecuali bypass giling->packing, start standby, atau alur pengulangan C-silo -> A-silo
  if (!isStartingFromStandby && !isDirectGilingToPacking && !isRecyclingFlow) {
    if (targetIdx > currentIdx + 1) {
      return { success: false, reason: 'Cannot skip forward steps' };
    }
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

  const nowIso = new Date().toISOString();
  const oldStepId = item.currentStepId;
  const oldMachine = item.assignedMachines?.[oldStepId] || oldStepId;

  coItems.forEach((currItem) => {
    const itOldStepId = currItem.currentStepId;
    if (!currItem.stepHistory) currItem.stepHistory = {};
    if (!currItem.assignedMachines) currItem.assignedMachines = {};

    if (itOldStepId && currItem.stepHistory[itOldStepId]) {
      currItem.stepHistory[itOldStepId].completedAt = nowIso;
      currItem.stepHistory[itOldStepId].passed = true;
    }

    if (isRecyclingFlow) {
      currItem.recycleCount = (currItem.recycleCount || 0) + 1;
      currItem.isRecycled = true;
      if (!currItem.recycleLog) currItem.recycleLog = [];
      currItem.recycleLog.push({
        fromStep: 'C-silo',
        fromMachine: oldMachine,
        toStep: targetStepId,
        toMachine: selectedMachine,
        timestamp: nowIso,
        reason: 'Gabah Masih Basah'
      });

      // Reset passed flag for steps from targetIdx onward
      SUBSTEPS.forEach((step, idx) => {
        if (!currItem.stepHistory[step.id]) {
          currItem.stepHistory[step.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
        }
        if (idx >= targetIdx) {
          currItem.stepHistory[step.id].passed = false;
          currItem.stepHistory[step.id].completedAt = null;
        }
      });
      currItem.stepHistory[targetStepId].startedAt = nowIso;
    } else {
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
      currItem.stepHistory[targetStepId].startedAt = nowIso;
    }

    if (selectedMachine) {
      currItem.assignedMachines[targetStepId] = selectedMachine;
      currItem.stepHistory[targetStepId].machine = selectedMachine;
    }

    currItem.currentStepId = targetStepId;
    currItem.status = 'active';
  });

  return { success: true, isRecyclingFlow, movedCount: coItems.length, totalTonase: roundedGroupTonase };
}

// RUN TESTS
console.log('=== TEST 1: Silo Kering 3 (2 batches, 25T) returns to Silo Basah 1 (Pengulangan Alur Pabrik) ===');
items = [
  { id: '1', code: 'PMD-01', name: 'Pak Tono', supir: 'Tono', tonase: 10, currentStepId: 'C-silo', status: 'active', assignedMachines: { 'C-silo': 'Silo Kering 3' } },
  { id: '2', code: 'PMD-02', name: 'Pak Joko', supir: 'Joko', tonase: 15, currentStepId: 'C-silo', status: 'active', assignedMachines: { 'C-silo': 'Silo Kering 3' } }
];

console.log('SK 3 initially:', getMachineUnitOccupancy('C-silo', 'Silo Kering 3'));
console.log('Silo Basah 1 initially:', getMachineUnitOccupancy('A-silo', 'Silo Basah 1'));

const resRecycleSB = executeStepAdvance('1', 'A-silo', 'Silo Basah 1');
console.log('Recycle to Silo Basah 1 result:', resRecycleSB);
if (!resRecycleSB.success || resRecycleSB.movedCount !== 2) throw new Error('Recycle to Silo Basah failed');

const sk3AfterRecycle = getMachineUnitOccupancy('C-silo', 'Silo Kering 3');
const sb1AfterRecycle = getMachineUnitOccupancy('A-silo', 'Silo Basah 1');
console.log('SK 3 count after recycle (should be 0):', sk3AfterRecycle.count);
console.log('Silo Basah 1 count after recycle (should be 2, 25T):', sb1AfterRecycle.count, sb1AfterRecycle.totalTonase);

if (sk3AfterRecycle.count !== 0 || sb1AfterRecycle.count !== 2 || sb1AfterRecycle.totalTonase !== 25) {
  throw new Error('Occupancy mismatch after recycle to Silo Basah');
}

const item1 = items.find(i => i.id === '1');
console.log('Item 1 recycleCount:', item1.recycleCount, 'log:', item1.recycleLog);
if (item1.recycleCount !== 1) throw new Error('Recycle count should be 1');

console.log('TEST 1 PASSED: Silo Kering 3 to Silo Basah 1 succeeded!\n');

console.log('=== TEST 2: Re-advance from Silo Basah 1 to Dryer 2 after recycle ===');
const resReAdvanceDryer = executeStepAdvance('1', 'B-dryer', 'Dryer 2');
console.log('Re-advance result:', resReAdvanceDryer);
if (!resReAdvanceDryer.success || resReAdvanceDryer.movedCount !== 2) throw new Error('Re-advance to Dryer failed');

const d2After = getMachineUnitOccupancy('B-dryer', 'Dryer 2');
console.log('Dryer 2 occupancy:', d2After.count, d2After.totalTonase);
if (d2After.count !== 2 || d2After.totalTonase !== 25) throw new Error('Dryer 2 occupancy mismatch');

console.log('TEST 2 PASSED: Re-advancing from Silo Basah to Dryer succeeded!\n');
console.log('ALL RECYCLING TESTS PASSED 100%!');
