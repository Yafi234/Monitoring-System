// Test: When batches from SK 4 move to C-giling, queued batches must remain in SK 4's occupancy and visual index
const UNIT_MAX_CAPACITY = 30.0;

let items = [
  {
    id: 'it1',
    code: 'PMD0002',
    name: 'Padi PMD0002',
    supir: 'KH soin',
    tonase: 15,
    currentStepId: 'C-giling',
    status: 'active',
    isQueuedForGiling: false,
    recycleCount: 1,
    assignedMachines: { 'C-silo': 'Silo Kering 4', 'C-giling': 'Mesin Giling 1' },
    stepHistory: { 'C-silo': { machine: 'Silo Kering 4', passed: true }, 'C-giling': { startedAt: '2026-09-30T10:00:00Z', gilingType: 'Glosor' } }
  },
  {
    id: 'it2',
    code: 'PMD0003',
    name: 'Padi PMD0003',
    supir: 'Budi',
    tonase: 7.5,
    currentStepId: 'C-giling',
    status: 'active',
    isQueuedForGiling: true,
    recycleCount: 1,
    gilingType: 'Glosor',
    assignedMachines: { 'C-silo': 'Silo Kering 4', 'C-giling': 'Mesin Giling 1' },
    stepHistory: { 'C-silo': { machine: 'Silo Kering 4' }, 'C-giling': { queuedAt: '2026-09-30T10:00:00Z', gilingType: 'Glosor' } }
  },
  {
    id: 'it3',
    code: 'PMD0009',
    name: 'Padi PMD0009',
    supir: 'Joko',
    tonase: 7.5,
    currentStepId: 'C-giling',
    status: 'active',
    isQueuedForGiling: true,
    recycleCount: 0,
    gilingType: 'Glosor',
    assignedMachines: { 'C-silo': 'Silo Kering 4', 'C-giling': 'Mesin Giling 1' },
    stepHistory: { 'C-silo': { machine: 'Silo Kering 4' }, 'C-giling': { queuedAt: '2026-09-30T10:00:00Z', gilingType: 'Glosor' } }
  }
];

function getMachineUnitOccupancy(stepId, machineUnitName, excludeItemId = null) {
  const isExcluded = (id) => {
    if (!excludeItemId) return false;
    if (Array.isArray(excludeItemId)) return excludeItemId.includes(id);
    return id === excludeItemId;
  };

  const normMachine = (name) => {
    if (!name) return '';
    return name.replace(/^SK\s*/i, 'Silo Kering ').trim();
  };
  const targetNorm = normMachine(machineUnitName);

  const matchingItems = items.filter(i => {
    if (isExcluded(i.id)) return false;
    if (i.status !== 'active' && i.status !== 'stopped') return false;

    // Normal check: item is currently at this step and assigned to this machine unit
    if (i.currentStepId === stepId && i.assignedMachines && normMachine(i.assignedMachines[stepId]) === targetNorm) {
      return true;
    }

    // Khusus Silo Kering (C-silo): jika barang sedang antri ke mesin giling (isQueuedForGiling),
    // barang tersebut secara fisik MASIH berada di Silo Kering asalnya dan masih menempati kapasitas!
    if (stepId === 'C-silo' && i.currentStepId === 'C-giling' && i.isQueuedForGiling) {
      const originSilo = i.assignedMachines?.['C-silo'] || i.stepHistory?.['C-silo']?.machine;
      if (originSilo && normMachine(originSilo) === targetNorm) {
        return true;
      }
    }

    return false;
  });

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

function promoteNextGilingQueue() {
  const queuedItem = items.find(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
  if (queuedItem) {
    queuedItem.isQueuedForGiling = false;
    const nowIso = new Date().toISOString();
    if (queuedItem.stepHistory && queuedItem.stepHistory['C-giling']) {
      queuedItem.stepHistory['C-giling'].startedAt = nowIso;
    }
    return queuedItem;
  }
  return null;
}

// TEST 1: Initial state
console.log('=== TEST 1: Silo Kering 4 occupancy with 1 active in Giling and 2 queued ===');
const occSK4Initial = getMachineUnitOccupancy('C-silo', 'Silo Kering 4');
console.log('SK 4 count:', occSK4Initial.count, '(expected: 2)');
console.log('SK 4 totalTonase:', occSK4Initial.totalTonase, 'Ton (expected: 15 Ton)');
console.log('SK 4 remainingCapacity:', occSK4Initial.remainingCapacity, 'Ton (expected: 15 Ton)');
console.log('SK 4 item codes:', occSK4Initial.items.map(i => i.code));

if (occSK4Initial.count !== 2) throw new Error('SK 4 count should be 2!');
if (occSK4Initial.totalTonase !== 15) throw new Error('SK 4 tonase should be 15!');
if (!occSK4Initial.items.some(i => i.code === 'PMD0003')) throw new Error('PMD0003 should be in SK 4!');
if (!occSK4Initial.items.some(i => i.code === 'PMD0009')) throw new Error('PMD0009 should be in SK 4!');

// TEST 2: Active batch (PMD0002) completes giling and moves to next step
console.log('\n=== TEST 2: PMD0002 completes giling -> promote next queue ===');
const activeItem = items.find(i => i.id === 'it1');
activeItem.currentStepId = 'D-mix'; // Moved to Mix
const promoted1 = promoteNextGilingQueue();
console.log('Promoted item:', promoted1.code, 'isQueued:', promoted1.isQueuedForGiling);

const occSK4AfterPromo1 = getMachineUnitOccupancy('C-silo', 'Silo Kering 4');
console.log('SK 4 count after promo 1:', occSK4AfterPromo1.count, '(expected: 1)');
console.log('SK 4 totalTonase:', occSK4AfterPromo1.totalTonase, 'Ton (expected: 7.5 Ton)');
console.log('SK 4 item codes:', occSK4AfterPromo1.items.map(i => i.code));

if (occSK4AfterPromo1.count !== 1) throw new Error('SK 4 count should be 1!');
if (occSK4AfterPromo1.items[0].code !== 'PMD0009') throw new Error('Only PMD0009 should remain in SK 4!');

// TEST 3: Next batch (PMD0003) completes giling -> promote last queue
console.log('\n=== TEST 3: PMD0003 completes giling -> promote last queue ===');
promoted1.currentStepId = 'D-mix';
const promoted2 = promoteNextGilingQueue();
console.log('Promoted item 2:', promoted2.code, 'isQueued:', promoted2.isQueuedForGiling);

const occSK4AfterPromo2 = getMachineUnitOccupancy('C-silo', 'Silo Kering 4');
console.log('SK 4 count after promo 2:', occSK4AfterPromo2.count, '(expected: 0)');
console.log('SK 4 totalTonase:', occSK4AfterPromo2.totalTonase, 'Ton (expected: 0 Ton)');
console.log('SK 4 remainingCapacity:', occSK4AfterPromo2.remainingCapacity, 'Ton (expected: 30 Ton)');

if (occSK4AfterPromo2.count !== 0) throw new Error('SK 4 should now be empty (0 count)!');
if (occSK4AfterPromo2.totalTonase !== 0) throw new Error('SK 4 should now have 0 tonase!');

console.log('\n>>> ALL TESTS PASSED SUCCESSFULLY! <<<');
