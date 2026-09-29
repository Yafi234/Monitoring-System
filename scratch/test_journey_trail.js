// Test getItemJourneyTrail reconstruction and live journeyLog
const UNIT_MAX_CAPACITY = 30.0;

function calcDuration(startedAt, completedAt = new Date().toISOString()) {
  if (!startedAt) return '-';
  const start = new Date(startedAt).getTime();
  const end = new Date(completedAt).getTime();
  if (isNaN(start) || isNaN(end)) return '-';
  const diffMs = Math.max(0, end - start);
  const hours = Math.floor(diffMs / (1000 * 60 * 60));
  const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
  return `${hours}j ${mins}m`;
}

function getItemJourneyTrail(item) {
  if (item.journeyLog && item.journeyLog.length > 0) {
    return item.journeyLog;
  }

  const trail = [];
  const assigned = item.assignedMachines || {};
  const history = item.stepHistory || {};

  // 1. Silo Basah
  if (history['A-silo']?.passed || history['A-silo']?.startedAt || assigned['A-silo'] || item.masukAt) {
    trail.push({
      stepId: 'A-silo',
      stepName: 'Silo Basah',
      machine: assigned['A-silo'] || 'Silo Basah 1',
      startedAt: history['A-silo']?.startedAt || item.masukAt,
      completedAt: history['A-silo']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  // 2. Dryer (Siklus 1)
  if (history['B-dryer']?.passed || history['B-dryer']?.startedAt || assigned['B-dryer']) {
    trail.push({
      stepId: 'B-dryer',
      stepName: 'Dryer (Pengeringan)',
      machine: assigned['B-dryer'] || 'Dryer 1',
      startedAt: history['B-dryer']?.startedAt,
      completedAt: history['B-dryer']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  // 3. Silo Kering (Siklus 1)
  if (history['C-silo']?.passed || history['C-silo']?.startedAt || assigned['C-silo'] || item.recycleCount > 0) {
    trail.push({
      stepId: 'C-silo',
      stepName: 'Silo Kering',
      machine: assigned['C-silo'] || 'Silo Kering 1',
      startedAt: history['C-silo']?.startedAt,
      completedAt: history['C-silo']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  // 4. Riwayat Pengulangan (Recycle Trail)
  if (item.recycleLog && item.recycleLog.length > 0) {
    item.recycleLog.forEach((r, idx) => {
      trail.push({
        stepId: r.toStep,
        stepName: r.toStep === 'B-dryer' ? 'Dryer (Pengeringan Ulang)' : 'Silo Basah',
        machine: r.toMachine || (r.toStep === 'B-dryer' ? 'Dryer 1' : 'Silo Basah 1'),
        startedAt: r.timestamp,
        completedAt: null,
        isRecycle: true,
        reason: r.reason || 'Gabah Masih Basah',
        cycle: idx + 2
      });
      if (r.toStep === 'B-dryer' && (history['C-silo']?.passed || history['C-giling']?.passed || item.status === 'completed')) {
        trail.push({
          stepId: 'C-silo',
          stepName: 'Silo Kering',
          machine: assigned['C-silo'] || 'Silo Kering 1',
          startedAt: null,
          completedAt: null,
          isRecycle: false,
          cycle: idx + 2
        });
      }
    });
  } else if (item.recycleCount > 0) {
    for (let c = 1; c <= item.recycleCount; c++) {
      trail.push({
        stepId: 'B-dryer',
        stepName: 'Dryer (Pengeringan Ulang)',
        machine: assigned['B-dryer'] || 'Dryer 1',
        startedAt: null,
        completedAt: null,
        isRecycle: true,
        reason: 'Gabah Masih Basah',
        cycle: c + 1
      });
      if (history['C-silo']?.passed || history['C-giling']?.passed || item.status === 'completed') {
        trail.push({
          stepId: 'C-silo',
          stepName: 'Silo Kering',
          machine: assigned['C-silo'] || 'Silo Kering 1',
          startedAt: null,
          completedAt: null,
          isRecycle: false,
          cycle: c + 1
        });
      }
    }
  }

  // 5. Giling
  if (history['C-giling']?.passed || history['C-giling']?.startedAt || item.currentStepId === 'C-giling' || item.status === 'completed') {
    trail.push({
      stepId: 'C-giling',
      stepName: 'Mesin Giling',
      machine: `Giling (${item.gilingType || 'PK'})`,
      startedAt: history['C-giling']?.startedAt,
      completedAt: history['C-giling']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  // 6. Mix
  if (history['D-mix']?.passed && !history['D-mix']?.skipped) {
    trail.push({
      stepId: 'D-mix',
      stepName: 'Mesin Mix',
      machine: 'Mesin Mix',
      startedAt: history['D-mix']?.startedAt,
      completedAt: history['D-mix']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  // 7. Packing
  if (history['D-packing']?.passed || item.status === 'completed') {
    trail.push({
      stepId: 'D-packing',
      stepName: 'Packing & Timbang',
      machine: 'Packing',
      startedAt: history['D-packing']?.startedAt,
      completedAt: item.completedAt || history['D-packing']?.completedAt,
      isRecycle: false,
      cycle: 1
    });
  }

  return trail;
}

// Test with mock item matching PMD0005 in user screenshot
const mockPMD0005 = {
  id: 'pmd-05',
  code: 'PMD0005',
  name: 'Harto',
  supir: 'Harto',
  truk: 'H 8898',
  status: 'completed',
  currentStepId: 'D-packing',
  completedAt: '2026-09-28T09:47:00Z',
  masukAt: '2026-09-28T08:19:00Z',
  gilingType: 'Glosor',
  recycleCount: 1,
  isRecycled: true,
  recycleLog: [
    {
      fromStep: 'C-silo',
      fromMachine: 'Silo Kering 2',
      toStep: 'B-dryer',
      toMachine: 'Dryer 1',
      timestamp: '2026-09-28T09:00:00Z',
      reason: 'Gabah Masih Basah'
    }
  ],
  assignedMachines: {
    'A-silo': 'Silo Basah 1',
    'B-dryer': 'Dryer 1',
    'C-silo': 'Silo Kering 2',
    'C-giling': 'Mesin Giling 1'
  },
  stepHistory: {
    'A-silo': { startedAt: '2026-09-28T08:19:00Z', completedAt: '2026-09-28T08:35:00Z', passed: true },
    'B-dryer': { startedAt: '2026-09-28T09:00:00Z', completedAt: '2026-09-28T09:20:00Z', passed: true },
    'C-silo': { startedAt: '2026-09-28T09:20:00Z', completedAt: '2026-09-28T09:30:00Z', passed: true },
    'C-giling': { startedAt: '2026-09-28T09:30:00Z', completedAt: '2026-09-28T09:40:00Z', passed: true },
    'D-packing': { startedAt: '2026-09-28T09:40:00Z', completedAt: '2026-09-28T09:47:00Z', passed: true }
  }
};

const trail = getItemJourneyTrail(mockPMD0005);
console.log('Trail length:', trail.length);
trail.forEach((t, i) => {
  console.log(`${i + 1}. [${t.stepId}] ${t.machine} ${t.isRecycle ? '⚠️ (PENGULANGAN)' : ''}`);
});

const pillStrings = trail.map(t => {
  let label = t.machine;
  if (t.isRecycle) return `⚠️ ${label} [Ulang]`;
  return label;
});
console.log('Generated trail string:');
console.log(pillStrings.join(' ➔ '));
