// Comprehensive test for assignExistingItemToMachine & getEligibleItemsForMachine for recycling flow
const UNIT_MAX_CAPACITY = 30.0;

const SUBSTEPS = [
  { id: 'A-silo', stageName: 'Tahap A', lineName: 'Silo Basah', unitCount: 4, unitPrefix: 'Silo Basah' },
  { id: 'B-dryer', stageName: 'Tahap B', lineName: 'Dryer (Pengeringan)', unitCount: 5, unitPrefix: 'Dryer' },
  { id: 'C-silo', stageName: 'Tahap C', lineName: 'Silo Kering', unitCount: 9, unitPrefix: 'Silo Kering' },
  { id: 'C-giling', stageName: 'Tahap C', lineName: 'Mesin Giling' },
  { id: 'D-mix', stageName: 'Tahap D', lineName: 'Mesin Mix' },
  { id: 'D-packing', stageName: 'Tahap D', lineName: 'Packing & Timbang' }
];

function getSubstepIndex(id) {
  return SUBSTEPS.findIndex(s => s.id === id);
}

let items = [
  {
    id: 'it-1',
    code: 'PMD-01',
    name: 'Padi Basah A',
    supir: 'Budi',
    tonase: 12,
    currentStepId: 'C-silo',
    status: 'active',
    assignedMachines: { 'C-silo': 'Silo Kering 2' },
    stepHistory: {
      'A-silo': { startedAt: '2026-09-28T01:00:00Z', completedAt: '2026-09-28T02:00:00Z', passed: true },
      'B-dryer': { startedAt: '2026-09-28T02:00:00Z', completedAt: '2026-09-28T04:00:00Z', passed: true },
      'C-silo': { startedAt: '2026-09-28T04:00:00Z', completedAt: null, passed: false }
    }
  },
  {
    id: 'it-2',
    code: 'PMD-02',
    name: 'Padi Basah B',
    supir: 'Hasan',
    tonase: 10,
    currentStepId: 'C-silo',
    status: 'active',
    assignedMachines: { 'C-silo': 'Silo Kering 2' },
    stepHistory: {
      'A-silo': { startedAt: '2026-09-28T01:00:00Z', completedAt: '2026-09-28T02:00:00Z', passed: true },
      'B-dryer': { startedAt: '2026-09-28T02:00:00Z', completedAt: '2026-09-28T04:00:00Z', passed: true },
      'C-silo': { startedAt: '2026-09-28T04:00:00Z', completedAt: null, passed: false }
    }
  }
];

function getCoLocatedItems(item) {
  if (!item || !item.currentStepId) return item ? [item] : [];
  const stepId = item.currentStepId;
  const machine = item.assignedMachines?.[stepId];
  return items.filter(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machine && (i.status === 'active' || i.status === 'stopped'));
}

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
  return {
    items: matchingItems,
    count: matchingItems.length,
    totalTonase: roundedTotal,
    remainingCapacity: Math.max(0, 30.0 - roundedTotal)
  };
}

function getEligibleItemsForMachine(stepId, machineName) {
  const result = [];
  // 3. Alur Pengulangan (Hanya Silo Basah)
  if (stepId === 'A-silo') {
    const processedSkUnits = new Set();
    const skItems = items.filter(i => i.currentStepId === 'C-silo' && (i.status === 'active' || i.status === 'stopped'));

    skItems.forEach(it => {
      const prevUnit = it.assignedMachines?.['C-silo'] || 'Silo Kering';
      if (processedSkUnits.has(prevUnit)) return;
      processedSkUnits.add(prevUnit);

      const groupItems = skItems.filter(i => (i.assignedMachines?.['C-silo'] || 'Silo Kering') === prevUnit);
      const groupTonase = groupItems.reduce((acc, i) => acc + (parseFloat(i.tonase) || 0), 0);
      const roundedGroupTonase = Math.round(groupTonase * 10) / 10;

      result.push({
        item: it,
        coItems: groupItems,
        isGroup: groupItems.length > 1,
        totalTonase: roundedGroupTonase,
        type: 'recycle',
        label: `Masih Basah (${prevUnit})`
      });
    });
  }
  return result;
}

// Test 1: getEligibleItemsForMachine on B-dryer (should be 0) and A-silo (should be 1)
const eligDryer = getEligibleItemsForMachine('B-dryer', 'Dryer 3');
console.log('Eligible items for Dryer 3 (should be 0):', eligDryer.length);
if (eligDryer.length !== 0) {
  console.error('FAIL: Dryer should not accept direct recycle anymore');
  process.exit(1);
}

const eligSB = getEligibleItemsForMachine('A-silo', 'Silo Basah 2');
console.log('Eligible items for Silo Basah 2:', eligSB.length);
if (eligSB.length !== 1 || !eligSB[0].isGroup || eligSB[0].totalTonase !== 22) {
  console.error('FAIL: Expected 1 grouped entry with 22 Ton for Silo Basah');
  process.exit(1);
}
console.log('PASS: getEligibleItemsForMachine correctly identified wet group for Silo Basah 2 (22 Ton)');

// Test 2: assignExistingItemToMachine recycling flow to A-silo
function assignExistingItemToMachine(itemId, targetStepId, selectedMachine) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const coItems = getCoLocatedItems(item);
  const coItemIds = coItems.map(it => it.id);
  const totalGroupTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedGroupTonase = Math.round(totalGroupTonase * 10) / 10;

  const occ = getMachineUnitOccupancy(targetStepId, selectedMachine, coItemIds);
  if (occ.totalTonase + roundedGroupTonase > UNIT_MAX_CAPACITY) {
    throw new Error('Over capacity');
  }

  const nowIso = new Date().toISOString();
  const oldStepId = item.currentStepId;
  const oldMachine = item.assignedMachines?.[oldStepId] || oldStepId;
  const targetIdx = getSubstepIndex(targetStepId);
  const isRecyclingFlow = (oldStepId === 'C-silo' && targetStepId === 'A-silo');

  coItems.forEach((currItem) => {
    const itOldStepId = currItem.currentStepId;
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
    }

    currItem.currentStepId = targetStepId;
    currItem.status = 'active';
    currItem.assignedMachines[targetStepId] = selectedMachine;
    currItem.stepHistory[targetStepId].machine = selectedMachine;
  });
}

assignExistingItemToMachine('it-1', 'A-silo', 'Silo Basah 2');

console.log('After assignExistingItemToMachine to Silo Basah 2:');
console.log('Item 1 step:', items[0].currentStepId, 'machine:', items[0].assignedMachines['A-silo'], 'recycleCount:', items[0].recycleCount);
console.log('Item 2 step:', items[1].currentStepId, 'machine:', items[1].assignedMachines['A-silo'], 'recycleCount:', items[1].recycleCount);
console.log('Silo Basah occupancy:', getMachineUnitOccupancy('A-silo', 'Silo Basah 2'));

if (items[0].currentStepId !== 'A-silo' || items[1].currentStepId !== 'A-silo' || items[0].recycleCount !== 1) {
  console.error('FAIL: Items did not move together or recycleCount was not updated');
  process.exit(1);
}

console.log('PASS: Both co-located items recycled to Silo Basah 2 together with updated recycleCount & logs!');
