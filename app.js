/**
 * MONITORING ALUR PROSES MESIN - BERTAHAP, DIALOG INPUT LENGKAP & WARNA HIJAU AKTIF
 * Alur Sequential:
 * Silo Basah (1-4) -> Dryer (1-5) -> Silo Kering (1-9) -> Mesin Giling (PK/Glosor) -> Mix -> Packing -> SELESAI
 */

const STAGES = [
  { key: 'A', name: 'Silo Basah', hint: '4 Unit Silo Basah' },
  { key: 'B', name: 'Dryer', hint: '5 Unit Dryer' },
  { key: 'C', name: 'Silo Kering & Giling', hint: '9 Silo Kering • 1 Mesin Giling' },
  { key: 'D', name: 'Mix & Packing', hint: 'Mixer • Packing' }
];

const STAGE_KEYS = STAGES.map(s => s.key);

// 6 Tahapan berurutan sesuai konfigurasi pabrik:
// Silo Basah (1-4) -> Dryer (1-5) -> Silo Kering (1-9) -> Mesin Giling (1 Unit: PK/Glosor) -> Mix -> Packing
const SUBSTEPS = [
  { 
    id: 'A-silo', 
    stageKey: 'A', 
    trackKey: 'silo', 
    stageName: 'Kategori A: Silo Basah', 
    lineName: 'Silo Basah', 
    unitCount: 4, 
    unitPrefix: 'Silo Basah' 
  },
  { 
    id: 'B-dryer', 
    stageKey: 'B', 
    trackKey: 'dryer', 
    stageName: 'Kategori B: Dryer', 
    lineName: 'Dryer', 
    unitCount: 5, 
    unitPrefix: 'Dryer' 
  },
  { 
    id: 'C-silo', 
    stageKey: 'C', 
    trackKey: 'silo', 
    stageName: 'Kategori C: Silo Kering', 
    lineName: 'Silo Kering', 
    unitCount: 9, 
    unitPrefix: 'Silo Kering' 
  },
  { 
    id: 'C-giling', 
    stageKey: 'C', 
    trackKey: 'giling', 
    stageName: 'Kategori C: Proses Giling', 
    lineName: 'Mesin Giling', 
    unitCount: 1, 
    unitPrefix: 'Mesin Giling' 
  },
  { 
    id: 'D-mix', 
    stageKey: 'D', 
    trackKey: 'mix', 
    stageName: 'Kategori D: Mix', 
    lineName: 'Mix' 
  },
  { 
    id: 'D-packing', 
    stageKey: 'D', 
    trackKey: 'packing', 
    stageName: 'Kategori D: Packing', 
    lineName: 'Packing' 
  }
];

function getSubstep(id) {
  return SUBSTEPS.find(s => s.id === id);
}

function getSubstepIndex(id) {
  return SUBSTEPS.findIndex(s => s.id === id);
}

function getSubstepsByStage(stageKey) {
  return SUBSTEPS.filter(s => s.stageKey === stageKey);
}

function getLineName(stageKey, trackKey) {
  const step = SUBSTEPS.find(s => s.stageKey === stageKey && s.trackKey === trackKey);
  return step ? step.lineName : (trackKey === 'atas' ? 'Atas' : 'Bawah');
}

// Kapasitas Maksimal per Unit Mesin (Silo Basah, Dryer, Silo Kering: 30 Ton per unit)
const UNIT_MAX_CAPACITY = 30;

/**
 * Menghitung tingkat keterisian & daftar muatan sebuah unit mesin (Kapasitas 30 Ton)
 * Bisa menampung beberapa barang sekaligus selama total tonase belum penuh (<= 30 Ton).
 */
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

// Helper untuk mengambil seluruh batch padi yang berada dalam satu unit mesin fisik yang sama (Silo Basah, Dryer, Silo Kering)
// Sesuai aturan pabrik: barang dalam satu unit tidak bisa dipisah saat dialirkan ke tahap berikutnya
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
window.getCoLocatedItems = getCoLocatedItems;

// Helper occupancy ringkas untuk backward compatibility
function getOccupiedMachines(stepId, currentItemId) {
  const occupied = {};
  items.forEach(i => {
    if (i.id !== currentItemId && i.currentStepId === stepId && (i.status === 'active' || i.status === 'stopped')) {
      const m = i.assignedMachines && i.assignedMachines[stepId];
      if (m) {
        if (!occupied[m]) occupied[m] = [];
        occupied[m].push(`${i.code} (${i.tonase || 10}T)`);
      }
    }
  });
  const res = {};
  Object.keys(occupied).forEach(m => {
    res[m] = occupied[m].join(', ');
  });
  return res;
}

function isGilingMachineBusy(currentItemId) {
  return items.some(i => i.id !== currentItemId && i.currentStepId === 'C-giling' && !i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
}

function getActiveGilingItem() {
  return items.find(i => i.currentStepId === 'C-giling' && !i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
}

function promoteNextGilingQueue() {
  const queuedItem = items.find(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
  if (queuedItem) {
    queuedItem.isQueuedForGiling = false;
    const nowIso = new Date().toISOString();
    if (queuedItem.stepHistory && queuedItem.stepHistory['C-giling']) {
      queuedItem.stepHistory['C-giling'].startedAt = nowIso;
    }
    saveData();
    renderTable();
    showToast(`Mesin Giling sekarang aktif untuk ${queuedItem.code} (${queuedItem.gilingType || 'PK'})!`);
    return queuedItem;
  }
  return null;
}

function isMixMachineBusy(currentItemId) {
  return items.some(i => i.id !== currentItemId && i.currentStepId === 'D-mix' && !i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
}

function getActiveMixItem() {
  return items.find(i => i.currentStepId === 'D-mix' && !i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
}

function promoteNextMixQueue() {
  const queuedItem = items.find(i => i.currentStepId === 'D-mix' && i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
  if (queuedItem) {
    queuedItem.isQueuedForMix = false;
    const nowIso = new Date().toISOString();
    if (queuedItem.stepHistory && queuedItem.stepHistory['D-mix']) {
      queuedItem.stepHistory['D-mix'].startedAt = nowIso;
    }
    saveData();
    renderTable();
    showToast(`Mesin Mix sekarang aktif untuk ${queuedItem.code} (${queuedItem.name || ''})!`);
    return queuedItem;
  }
  return null;
}

// DEFAULT: HANYA 1 BARANG (A1) DENGAN STATUS KOSONG / STANDBY SESUAI SKETSA LOGBOOK
const DEFAULT_ITEMS = [
  {
    id: 'x1',
    code: 'PMD0001',
    supir: 'Supri',
    truk: 'B 9123 TG',
    jenisPadi: 'Inpari 32',
    name: 'Padi PMD0001 - Supri',
    jenis: 'Inpari 32',
    tonase: 10.0,
    tonaseAkhir: null,
    selesaiLokasi: 'Gudang',
    catatanSelesai: '',
    masukAt: null,
    completedAt: null,
    stoppedAt: null,
    stopReason: '',
    stopLog: [],
    currentStepId: null, // Kosong / Standby
    status: 'standby',   // 'standby' | 'active' | 'completed' | 'stopped'
    assignedMachines: {},
    gilingType: '',
    isQueuedForGiling: false,
    isQueuedForMix: false,
    stepHistory: {
      'A-silo': { startedAt: null, completedAt: null, passed: false, stops: [], machine: null },
      'B-dryer': { startedAt: null, completedAt: null, passed: false, stops: [], machine: null },
      'C-silo': { startedAt: null, completedAt: null, passed: false, stops: [], machine: null },
      'C-giling': { startedAt: null, completedAt: null, passed: false, stops: [], machine: null, gilingType: null },
      'D-mix': { startedAt: null, completedAt: null, passed: false, stops: [] },
      'D-packing': { startedAt: null, completedAt: null, passed: false, stops: [] }
    }
  }
];

let items = [];
let activeModalItemId = null;
let pendingStepTransition = null;
const STORAGE_KEY = 'monitoring_mesin_step_v9';
const MAINTENANCE_STORAGE_KEY = 'monitoring_mesin_maintenance_v1';
let machineMaintenance = {};

function loadMachineMaintenance() {
  try {
    const saved = localStorage.getItem(MAINTENANCE_STORAGE_KEY);
    if (saved) {
      machineMaintenance = JSON.parse(saved);
    } else {
      machineMaintenance = {};
    }
  } catch (e) {
    console.error('Error loading machineMaintenance:', e);
    machineMaintenance = {};
  }
}

function saveMachineMaintenance() {
  try {
    localStorage.setItem(MAINTENANCE_STORAGE_KEY, JSON.stringify(machineMaintenance));
  } catch (e) {
    console.error('Error saving machineMaintenance:', e);
  }
}

function getMaintenanceKey(stepId, machineName) {
  return `${stepId}::${machineName}`;
}

function isMachineUnderMaintenance(stepId, machineName) {
  if (!stepId || !machineName) return false;
  const key = getMaintenanceKey(stepId, machineName);
  return !!machineMaintenance[key];
}

function getMachineMaintenanceInfo(stepId, machineName) {
  if (!stepId || !machineName) return null;
  const key = getMaintenanceKey(stepId, machineName);
  return machineMaintenance[key] || null;
}

function setMachineMaintenance(stepId, machineName, reason) {
  if (!stepId || !machineName) return;
  const key = getMaintenanceKey(stepId, machineName);
  const nowIso = new Date().toISOString();
  const cleanReason = (reason && reason.trim()) ? reason.trim() : 'Perbaikan / Kendala Mesin';
  
  machineMaintenance[key] = {
    stepId,
    machineName,
    reason: cleanReason,
    startedAt: nowIso
  };
  saveMachineMaintenance();

  // Jika mesin ini sedang memproses batch aktif, hentikan batch tersebut
  let affectedItem = null;
  if (stepId === 'C-giling') {
    affectedItem = getActiveGilingItem();
  } else if (stepId === 'D-mix' || stepId === 'D-packing') {
    affectedItem = items.find(i => i.currentStepId === stepId && i.status === 'active');
  } else {
    affectedItem = items.find(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machineName && i.status === 'active');
  }

  if (affectedItem) {
    affectedItem.status = 'stopped';
    affectedItem.stoppedAt = nowIso;
    affectedItem.stopReason = `Perbaikan Mesin: ${cleanReason}`;
    if (!affectedItem.stopLog) affectedItem.stopLog = [];
    affectedItem.stopLog.push({
      stoppedAt: nowIso,
      resumedAt: null,
      reason: `Perbaikan Mesin: ${cleanReason}`
    });
    saveData();
    renderTable();
  }

  renderFloorPlan();
  showToast(`⚠️ ${machineName} berhasil ditandai PERBAIKAN!`);
}

function clearMachineMaintenance(stepId, machineName) {
  if (!stepId || !machineName) return;
  const key = getMaintenanceKey(stepId, machineName);
  if (!machineMaintenance[key]) return;

  delete machineMaintenance[key];
  saveMachineMaintenance();

  // Jika ada batch di mesin ini yang tadi terhenti karena perbaikan, otomatis resume
  let affectedItem = null;
  if (stepId === 'C-giling') {
    affectedItem = items.find(i => i.currentStepId === stepId && i.status === 'stopped');
  } else if (stepId === 'D-mix' || stepId === 'D-packing') {
    affectedItem = items.find(i => i.currentStepId === stepId && i.status === 'stopped');
  } else {
    affectedItem = items.find(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machineName && i.status === 'stopped');
  }

  if (affectedItem) {
    affectedItem.status = 'active';
    const nowIso = new Date().toISOString();
    if (affectedItem.stopLog && affectedItem.stopLog.length > 0) {
      const lastStop = affectedItem.stopLog[affectedItem.stopLog.length - 1];
      if (!lastStop.resumedAt) {
        lastStop.resumedAt = nowIso;
      }
    }
    affectedItem.stoppedAt = null;
    affectedItem.stopReason = null;
    saveData();
    renderTable();
  } else {
    // Jika tidak ada batch aktif yang terhenti, periksa apakah ada antrian yang siap dipromosikan
    if (stepId === 'C-giling') {
      promoteNextGilingQueue();
    } else if (stepId === 'D-mix') {
      promoteNextMixQueue();
    }
  }

  renderFloorPlan();
  showToast(`Perbaikan ${machineName} SELESAI. Mesin kembali siap!`);
}

function openMaintenanceModal(stepId, machineName) {
  const modal = document.getElementById('machineMaintenanceModal');
  if (!modal) return;

  const stepIdInput = document.getElementById('maintenanceStepId');
  const machineNameInput = document.getElementById('maintenanceMachineName');
  const displayEl = document.getElementById('maintenanceMachineDisplay');
  const reasonInput = document.getElementById('maintenanceReasonInput');

  if (stepIdInput) stepIdInput.value = stepId;
  if (machineNameInput) machineNameInput.value = machineName;
  if (displayEl) displayEl.textContent = machineName;

  const existing = getMachineMaintenanceInfo(stepId, machineName);
  if (reasonInput) {
    reasonInput.value = existing ? existing.reason : '';
  }

  document.querySelectorAll('#maintenanceChips .chip-btn').forEach(btn => {
    btn.classList.remove('active');
    if (existing && btn.textContent.trim().toLowerCase() === existing.reason.trim().toLowerCase()) {
      btn.classList.add('active');
    }
  });

  modal.classList.add('open');
  if (reasonInput) {
    setTimeout(() => reasonInput.focus(), 120);
  }
}

function closeMaintenanceModal() {
  const modal = document.getElementById('machineMaintenanceModal');
  if (modal) modal.classList.remove('open');
}

function selectMaintenanceChip(btn) {
  const reasonInput = document.getElementById('maintenanceReasonInput');
  if (!reasonInput) return;

  const text = btn.textContent.trim();
  reasonInput.value = text;

  document.querySelectorAll('#maintenanceChips .chip-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  reasonInput.focus();
}

function handleMaintenanceSubmit(e) {
  if (e) e.preventDefault();
  const stepId = document.getElementById('maintenanceStepId')?.value;
  const machineName = document.getElementById('maintenanceMachineName')?.value;
  const reason = document.getElementById('maintenanceReasonInput')?.value || 'Perbaikan Mesin';

  if (!stepId || !machineName) return;

  setMachineMaintenance(stepId, machineName, reason);
  closeMaintenanceModal();
}

window.isMachineUnderMaintenance = isMachineUnderMaintenance;
window.getMachineMaintenanceInfo = getMachineMaintenanceInfo;
window.setMachineMaintenance = setMachineMaintenance;
window.clearMachineMaintenance = clearMachineMaintenance;
window.openMaintenanceModal = openMaintenanceModal;
window.closeMaintenanceModal = closeMaintenanceModal;
window.selectMaintenanceChip = selectMaintenanceChip;
window.handleMaintenanceSubmit = handleMaintenanceSubmit;

/**
 * ============================================================
 * PUSAT KELOLA & INPUT PERBAIKAN MESIN (DENAH INTERAKTIF 21 MESIN PABRIK)
 * ============================================================
 */
let selectedMaintMachine = { stepId: 'A-silo', machineName: 'Silo Basah 1' };

function getMachineStepId(machineName) {
  if (!machineName) return 'A-silo';
  if (machineName.startsWith('Silo Basah')) return 'A-silo';
  if (machineName.startsWith('Dryer')) return 'B-dryer';
  if (machineName.startsWith('Silo Kering')) return 'C-silo';
  if (machineName.startsWith('Mesin Giling') || machineName === 'Mesin Giling') return 'C-giling';
  if (machineName.startsWith('Mesin Mix') || machineName === 'Mix') return 'D-mix';
  if (machineName.startsWith('Mesin Packing') || machineName === 'Packing') return 'D-packing';
  return 'A-silo';
}

function openMaintenanceManagerModal(preferredStepId, preferredMachineName) {
  const modal = document.getElementById('maintenanceManagerModal');
  if (!modal) return;

  if (preferredMachineName) {
    selectedMaintMachine = {
      stepId: preferredStepId || getMachineStepId(preferredMachineName),
      machineName: preferredMachineName
    };
  } else {
    // Jika ada mesin yang sedang dalam perbaikan, otomatis pilih mesin tersebut agar langsung terlihat
    const maintKeys = Object.keys(machineMaintenance || {});
    if (maintKeys.length > 0) {
      const firstMaint = machineMaintenance[maintKeys[0]];
      selectedMaintMachine = {
        stepId: firstMaint.stepId,
        machineName: firstMaint.machineName
      };
    } else if (!selectedMaintMachine || !selectedMaintMachine.machineName) {
      selectedMaintMachine = { stepId: 'A-silo', machineName: 'Silo Basah 1' };
    }
  }

  renderMaintenanceManager();
  modal.classList.add('open');
}
window.openMaintenanceManagerModal = openMaintenanceManagerModal;

function closeMaintenanceManagerModal() {
  const modal = document.getElementById('maintenanceManagerModal');
  if (modal) modal.classList.remove('open');
}
window.closeMaintenanceManagerModal = closeMaintenanceManagerModal;

function selectMaintMachine(stepId, machineName) {
  selectedMaintMachine = { stepId, machineName };
  renderMaintenanceManager();
}
window.selectMaintMachine = selectMaintMachine;

function selectManagerChip(reasonText) {
  const input = document.getElementById('maintManagerReasonInput');
  if (input) {
    input.value = reasonText;
    input.focus();
  }
  document.querySelectorAll('#maintManagerChips .chip-btn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === reasonText.trim());
  });
}
window.selectManagerChip = selectManagerChip;

function submitManagerMaintenance() {
  if (!selectedMaintMachine) return;
  const input = document.getElementById('maintManagerReasonInput');
  const reason = input?.value?.trim() || 'Perbaikan Mesin';
  setMachineMaintenance(selectedMaintMachine.stepId, selectedMaintMachine.machineName, reason);
  renderMaintenanceManager();
}
window.submitManagerMaintenance = submitManagerMaintenance;

function clearManagerMaintenance() {
  if (!selectedMaintMachine) return;
  clearMachineMaintenance(selectedMaintMachine.stepId, selectedMaintMachine.machineName);
  renderMaintenanceManager();
}
window.clearManagerMaintenance = clearManagerMaintenance;

function updateManagerMaintenanceReason() {
  if (!selectedMaintMachine) return;
  const input = document.getElementById('maintManagerEditReasonInput');
  const newReason = input?.value?.trim() || 'Perbaikan Mesin';
  const key = getMaintenanceKey(selectedMaintMachine.stepId, selectedMaintMachine.machineName);
  if (machineMaintenance[key]) {
    machineMaintenance[key].reason = newReason;
    saveMachineMaintenance();
    renderMaintenanceManager();
    renderFloorPlan();
    showToast(`Catatan perbaikan ${selectedMaintMachine.machineName} berhasil diperbarui!`);
  }
}
window.updateManagerMaintenanceReason = updateManagerMaintenanceReason;

function renderMaintenanceManager() {
  const summaryEl = document.getElementById('maintManagerSummaryBar');
  const denahEl = document.getElementById('maintInteractiveDenah');
  const panelEl = document.getElementById('maintSelectedPanel');
  if (!denahEl || !panelEl) return;

  const ZONES = [
    {
      key: 'A',
      badgeClass: 'badge-a',
      title: 'A: Silo Basah (4 Unit)',
      stepId: 'A-silo',
      machines: ['Silo Basah 1', 'Silo Basah 2', 'Silo Basah 3', 'Silo Basah 4']
    },
    {
      key: 'B',
      badgeClass: 'badge-b',
      title: 'B: Dryer (5 Unit)',
      stepId: 'B-dryer',
      machines: ['Dryer 1', 'Dryer 2', 'Dryer 3', 'Dryer 4', 'Dryer 5']
    },
    {
      key: 'C',
      badgeClass: 'badge-c',
      title: 'C: Silo Kering & Giling',
      machinesWithSteps: [
        { stepId: 'C-silo', name: 'Silo Kering 1', short: 'SK 1' },
        { stepId: 'C-silo', name: 'Silo Kering 2', short: 'SK 2' },
        { stepId: 'C-silo', name: 'Silo Kering 3', short: 'SK 3' },
        { stepId: 'C-silo', name: 'Silo Kering 4', short: 'SK 4' },
        { stepId: 'C-silo', name: 'Silo Kering 5', short: 'SK 5' },
        { stepId: 'C-silo', name: 'Silo Kering 6', short: 'SK 6' },
        { stepId: 'C-silo', name: 'Silo Kering 7', short: 'SK 7' },
        { stepId: 'C-silo', name: 'Silo Kering 8', short: 'SK 8' },
        { stepId: 'C-silo', name: 'Silo Kering 9', short: 'SK 9' },
        { stepId: 'C-giling', name: 'Mesin Giling 1', short: 'Giling 1', isProminent: true }
      ]
    },
    {
      key: 'D',
      badgeClass: 'badge-d',
      title: 'D: Mix & Packing',
      machinesWithSteps: [
        { stepId: 'D-mix', name: 'Mesin Mix', short: 'Mesin Mix' },
        { stepId: 'D-packing', name: 'Mesin Packing', short: 'Mesin Packing' }
      ]
    }
  ];

  let totalMachines = 21;
  let repairCount = 0;
  let activeCount = 0;

  function getMaintUnitInfo(stepId, machineName) {
    const isRepair = isMachineUnderMaintenance(stepId, machineName);
    const maint = isRepair ? getMachineMaintenanceInfo(stepId, machineName) : null;
    let activeItem = null;

    if (stepId === 'C-giling') {
      activeItem = getActiveGilingItem();
    } else if (stepId === 'D-mix') {
      activeItem = getActiveMixItem();
    } else if (stepId === 'D-packing') {
      activeItem = items.find(i => i.currentStepId === stepId && (i.status === 'active' || i.status === 'stopped'));
    } else {
      activeItem = items.find(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machineName && (i.status === 'active' || i.status === 'stopped'));
    }

    if (isRepair) repairCount++;
    else if (activeItem) activeCount++;

    return { isRepair, maint, activeItem };
  }

  // Pre-calculate count
  repairCount = 0;
  activeCount = 0;

  let denahHtml = '';
  ZONES.forEach(zone => {
    let tilesHtml = '';
    const isZoneC = zone.key === 'C';

    const renderSingleTile = (stepId, machineName, shortName, isProminent = false) => {
      const info = getMaintUnitInfo(stepId, machineName);
      const isSelected = selectedMaintMachine && selectedMaintMachine.stepId === stepId && selectedMaintMachine.machineName === machineName;

      let tileClass = 'maint-tile';
      let pillHtml = '';
      let subHtml = '';

      if (info.isRepair) {
        tileClass += ' is-repair';
        pillHtml = `<span class="maint-tile-pill repair">🔴 PERBAIKAN</span>`;
        subHtml = `<span style="color:#fca5a5; font-weight:600;">${escapeHtml(info.maint.reason || 'Kendala')}</span>`;
      } else if (info.activeItem) {
        tileClass += ' is-active';
        pillHtml = `<span class="maint-tile-pill active">🟢 AKTIF</span>`;
        subHtml = `<span>${escapeHtml(info.activeItem.code)} (${info.activeItem.tonase || 10}T)</span>`;
      } else {
        tileClass += ' is-standby';
        pillHtml = `<span class="maint-tile-pill standby">STANDBY</span>`;
        subHtml = `<span style="color:var(--text-muted);">Siap Pakai</span>`;
      }

      if (isSelected) {
        tileClass += ' is-selected';
      }

      const displayName = shortName || machineName;
      const prominentStyle = isProminent ? 'style="grid-column: span 3; border-top: 1.5px dashed rgba(255,255,255,0.15); margin-top: 4px;"' : '';

      return `
        <div class="${tileClass}" ${prominentStyle} onclick="selectMaintMachine('${stepId}', '${escapeHtml(machineName)}')">
          <div class="maint-tile-top">
            <span class="maint-tile-name" title="${escapeHtml(machineName)}">${escapeHtml(displayName)}</span>
            ${pillHtml}
          </div>
          <div class="maint-tile-sub">${subHtml}</div>
        </div>
      `;
    };

    if (zone.machines) {
      tilesHtml = `
        <div class="maint-grid-tiles">
          ${zone.machines.map(m => renderSingleTile(zone.stepId, m, m)).join('')}
        </div>
      `;
    } else if (isZoneC) {
      const skTiles = zone.machinesWithSteps.filter(m => m.stepId === 'C-silo').map(m => renderSingleTile(m.stepId, m.name, m.short)).join('');
      const gilingTile = zone.machinesWithSteps.find(m => m.stepId === 'C-giling');
      const gilingHtml = gilingTile ? renderSingleTile(gilingTile.stepId, gilingTile.name, 'Mesin Giling 1', true) : '';

      tilesHtml = `
        <div class="maint-grid-tiles grid-silo-3x3">
          ${skTiles}
          ${gilingHtml}
        </div>
      `;
    } else {
      tilesHtml = `
        <div class="maint-grid-tiles">
          ${zone.machinesWithSteps.map(m => renderSingleTile(m.stepId, m.name, m.short)).join('')}
        </div>
      `;
    }

    denahHtml += `
      <div class="maint-zone-card">
        <div class="maint-zone-head">
          <span class="maint-zone-title">
            <span class="maint-zone-badge ${zone.badgeClass}">${zone.key}</span>
            <span>${escapeHtml(zone.title)}</span>
          </span>
        </div>
        ${tilesHtml}
      </div>
    `;
  });

  denahEl.innerHTML = denahHtml;

  // Summary bar
  const standbyCount = Math.max(0, totalMachines - repairCount - activeCount);
  if (summaryEl) {
    summaryEl.innerHTML = `
      <div class="maint-sum-item">
        <span class="maint-sum-dot total"></span>
        <span>Total: <strong>${totalMachines} Unit Mesin</strong></span>
      </div>
      <div class="maint-sum-item">
        <span class="maint-sum-dot repair"></span>
        <span>Sedang Perbaikan: <strong style="${repairCount > 0 ? 'color:#ef4444; font-weight:800;' : ''}">${repairCount} Unit</strong></span>
      </div>
      <div class="maint-sum-item">
        <span class="maint-sum-dot active"></span>
        <span>Sedang Berjalan: <strong style="color:#10b981;">${activeCount} Unit</strong></span>
      </div>
      <div class="maint-sum-item">
        <span class="maint-sum-dot standby"></span>
        <span>Standby (Siap): <strong style="color:#94a3b8;">${standbyCount} Unit</strong></span>
      </div>
    `;
  }

  // Selected Machine Action Panel
  if (!selectedMaintMachine) {
    selectedMaintMachine = { stepId: 'A-silo', machineName: 'Silo Basah 1' };
  }

  const { stepId, machineName } = selectedMaintMachine;
  const isRepair = isMachineUnderMaintenance(stepId, machineName);
  const maintInfo = isRepair ? getMachineMaintenanceInfo(stepId, machineName) : null;

  let activeItem = null;
  if (stepId === 'C-giling') {
    activeItem = getActiveGilingItem();
  } else if (stepId === 'D-mix') {
    activeItem = getActiveMixItem();
  } else if (stepId === 'D-packing') {
    activeItem = items.find(i => i.currentStepId === stepId && (i.status === 'active' || i.status === 'stopped'));
  } else {
    activeItem = items.find(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machineName && (i.status === 'active' || i.status === 'stopped'));
  }

  let panelHtml = '';

  if (isRepair) {
    panelHtml = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid rgba(239, 68, 68, 0.35); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 20px;">🔴</span>
            <strong style="font-size: 15px; color: #ef4444;">${escapeHtml(machineName)} Sedang Dalam Perbaikan</strong>
          </div>
          <span class="maint-tile-pill repair" style="font-size: 10px; padding: 4px 8px;">STATUS: PERBAIKAN</span>
        </div>

        <div style="background: rgba(239, 68, 68, 0.12); border: 1.5px solid rgba(239, 68, 68, 0.35); border-radius: 10px; padding: 12px 14px; font-size: 12.5px; line-height: 1.55; color: #fecaca;">
          <div>Kendala: <strong style="color: #ffffff; font-size: 13.5px;">${escapeHtml(maintInfo.reason || 'Perbaikan Mesin')}</strong></div>
          <div style="margin-top: 4px; font-size: 11.5px; color: #fca5a5;">
            Mulai perbaikan: <strong>${formatDateTimeShort(maintInfo.startedAt)} WIB</strong> (Sedang berlangsung ${calcDuration(maintInfo.startedAt)})
          </div>
          ${activeItem ? `
            <div style="margin-top: 8px; padding-top: 8px; border-top: 1px dashed rgba(239, 68, 68, 0.3); font-size: 11.5px; color: #fef08a;">
              ⚠️ Batch yang sedang tertahan di mesin ini: <strong>${escapeHtml(activeItem.code)} (${escapeHtml(activeItem.name)})</strong>. Batch akan otomatis aktif kembali saat perbaikan selesai.
            </div>
          ` : ''}
        </div>

        <div style="display: flex; gap: 10px; flex-wrap: wrap; align-items: center;">
          <button type="button" class="btn btn-add" style="background: #10b981; border: none; color: #ffffff; font-weight: 800; padding: 11px 18px; font-size: 13px;" onclick="clearManagerMaintenance()">
            Selesai Perbaikan (Kembalikan ke Siap / Standby)
          </button>
        </div>

        <div style="margin-top: 4px; border-top: 1px solid var(--border-glass); padding-top: 10px;">
          <label style="font-size: 11.5px; color: var(--text-muted); display: block; margin-bottom: 5px;">Ubah / Koreksi Catatan Kendala:</label>
          <div style="display: flex; gap: 8px;">
            <input type="text" id="maintManagerEditReasonInput" value="${escapeHtml(maintInfo.reason || '')}" style="flex: 1; background: var(--bg-glass-input); border: 1px solid var(--border-glass); border-radius: 8px; padding: 7px 12px; color: inherit; font-size: 12.5px; outline: none;">
            <button type="button" class="btn btn-outline" onclick="updateManagerMaintenanceReason()" style="padding: 7px 14px; font-size: 12px;">
              Simpan Perubahan
            </button>
          </div>
        </div>
      </div>
    `;
  } else {
    let activeNoticeHtml = '';
    if (activeItem) {
      activeNoticeHtml = `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: 10px; padding: 10px 14px; font-size: 12px; color: #fde68a;">
          ⚠️ <strong>Mesin sedang memproses batch ${escapeHtml(activeItem.code)} (${escapeHtml(activeItem.name)})</strong>. Menandai perbaikan akan otomatis MENJEDA (Stop) batch ini dan mencatat kendala perbaikan mesin di logbook.
        </div>
      `;
    } else {
      activeNoticeHtml = `
        <div style="background: rgba(148, 163, 184, 0.1); border: 1px solid var(--border-glass); border-radius: 10px; padding: 10px 14px; font-size: 12px; color: var(--text-lavender);">
          ℹ️ <strong>Mesin saat ini Standby (Kosong)</strong>. Jika ditandai perbaikan, mesin tidak dapat dipilih atau dimasuki barang baru sampai perbaikan diselesaikan.
        </div>
      `;
    }

    panelHtml = `
      <div style="display: flex; flex-direction: column; gap: 12px;">
        <div style="display: flex; align-items: center; justify-content: space-between; border-bottom: 1px solid var(--border-glass); padding-bottom: 8px;">
          <div style="display: flex; align-items: center; gap: 8px;">
            
            <strong style="font-size: 14.5px; color: #ffffff;">Lapor Perbaikan / Kendala: ${escapeHtml(machineName)}</strong>
          </div>
          <span class="maint-tile-pill ${activeItem ? 'active' : 'standby'}" style="font-size: 10px; padding: 3px 8px;">
            ${activeItem ? '🟢 SEDANG AKTIF' : 'STANDBY'}
          </span>
        </div>

        ${activeNoticeHtml}

        <div>
          <label style="font-size: 11.5px; font-weight: 700; color: var(--text-lavender); display: block; margin-bottom: 6px;">
            Pilih Jenis Kendala Cepat:
          </label>
          <div class="quick-chips-grid" id="maintManagerChips" style="display: flex; flex-wrap: wrap; gap: 6px;">
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Pembersihan Rutin')">Pembersihan Rutin</button>
            <button type="button" class="chip-btn chip-danger active" onclick="selectManagerChip('Ganti Bearing/Part')">Ganti Bearing/Part</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Kerusakan Motor')">Kerusakan Motor</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Conveyor Macet')">Conveyor Macet</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Kebocoran Fisik')">Kebocoran Fisik</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Pengecekan Sensor')">Pengecekan Sensor</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Overheat Dinamo')">Overheat Dinamo</button>
            <button type="button" class="chip-btn chip-danger" onclick="selectManagerChip('Kalibrasi Timbangan')">Kalibrasi Timbangan</button>
          </div>
        </div>

        <div>
          <label for="maintManagerReasonInput" style="font-size: 11.5px; font-weight: 700; color: var(--text-lavender); display: block; margin-bottom: 5px;">
            Penjelasan / Tindakan Perbaikan:
          </label>
          <input type="text" id="maintManagerReasonInput" value="Ganti Bearing/Part" placeholder="Tuliskan kendala atau tindakan perbaikan mesin..." style="width: 100%; box-sizing: border-box; background: var(--bg-glass-input); border: 1.5px solid var(--border-glass); border-radius: 8px; padding: 9px 12px; color: inherit; font-size: 13px; outline: none;">
        </div>

        <div style="display: flex; justify-content: flex-end; gap: 10px; margin-top: 4px;">
          <button type="button" class="btn btn-del" style="background: #ef4444; border: none; color: #ffffff; font-weight: 800; padding: 10px 18px; font-size: 13px;" onclick="submitManagerMaintenance()">
            🔴 Mulai Status Perbaikan (${escapeHtml(machineName)})
          </button>
        </div>
      </div>
    `;
  }

  panelEl.innerHTML = panelHtml;
}
window.renderMaintenanceManager = renderMaintenanceManager;


function loadData() {
  loadMachineMaintenance();
  try {
    const saved = localStorage.getItem(STORAGE_KEY) || localStorage.getItem('monitoring_mesin_step_v8');
    if (saved) {
      items = JSON.parse(saved);
    } else {
      items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
      saveData();
    }

    // Pastikan struktur stopLog, assignedMachines, dan migrasi ID step lama
    items.forEach(item => {
      if (!item.stopLog) item.stopLog = [];
      if (!item.stepHistory) item.stepHistory = {};
      if (!item.assignedMachines) item.assignedMachines = {};
      if (item.isQueuedForGiling === undefined) item.isQueuedForGiling = false;
      if (item.isQueuedForMix === undefined) item.isQueuedForMix = false;
      if (!item.gilingType) item.gilingType = '';
      if (!item.supir) item.supir = '';
      if (!item.truk) item.truk = '';
      if (!item.jenisPadi) item.jenisPadi = item.jenis || 'Inpari 32';
      if (!item.recycleCount) item.recycleCount = 0;
      if (!item.recycleLog) item.recycleLog = [];
      if (!item.journeyLog) item.journeyLog = [];
      if (item.recycleLog.length > 0 && item.recycleCount === 0) {
        item.recycleCount = item.recycleLog.length;
        item.isRecycled = true;
      }

      // Migrasi data legacy awal ke format kode baru PMD0001
      if ((item.code === 'X1' || item.code === 'A1') && item.id === 'x1') {
        item.code = 'PMD0001';
        item.supir = item.supir || 'Supri';
        item.truk = item.truk || 'B 9123 TG';
        item.jenisPadi = item.jenisPadi || 'Inpari 32';
        if (item.name === 'Barang Masuk 1' || item.name === 'Padi A1 - Supri') item.name = 'Padi PMD0001 - Supri';
      }

      // Migrasi data dari format 8-step versi lama
      if (item.stepHistory['A-atas'] || item.stepHistory['A-bawah']) {
        const histA = item.stepHistory['A-bawah'] || item.stepHistory['A-atas'];
        if (!item.stepHistory['A-silo']) {
          item.stepHistory['A-silo'] = { ...histA, machine: 'Silo Basah 1' };
          item.assignedMachines['A-silo'] = 'Silo Basah 1';
        }
      }
      if (item.stepHistory['B-atas']) {
        if (!item.stepHistory['B-dryer']) {
          item.stepHistory['B-dryer'] = { ...item.stepHistory['B-atas'], machine: 'Dryer 1' };
          item.assignedMachines['B-dryer'] = 'Dryer 1';
        }
      }
      if (item.stepHistory['B-bawah']) {
        if (!item.stepHistory['C-silo']) {
          item.stepHistory['C-silo'] = { ...item.stepHistory['B-bawah'], machine: 'Silo Kering 1' };
          item.assignedMachines['C-silo'] = 'Silo Kering 1';
        }
      }
      if (item.stepHistory['C-atas'] || item.stepHistory['C-bawah']) {
        const histC = item.stepHistory['C-atas'] || item.stepHistory['C-bawah'];
        const gType = item.stepHistory['C-atas'] ? 'PK' : 'Glosor';
        if (!item.stepHistory['C-giling']) {
          item.stepHistory['C-giling'] = { ...histC, gilingType: gType, machine: 'Mesin Giling 1' };
          item.gilingType = gType;
          item.assignedMachines['C-giling'] = 'Mesin Giling 1';
        }
      }
      if (item.stepHistory['D-atas'] && !item.stepHistory['D-mix']) {
        item.stepHistory['D-mix'] = { ...item.stepHistory['D-atas'] };
      }
      if (item.stepHistory['D-bawah'] && !item.stepHistory['D-packing']) {
        item.stepHistory['D-packing'] = { ...item.stepHistory['D-bawah'] };
      }

      // Migrasi currentStepId
      if (item.currentStepId === 'A-atas' || item.currentStepId === 'A-bawah') item.currentStepId = 'A-silo';
      else if (item.currentStepId === 'B-atas') item.currentStepId = 'B-dryer';
      else if (item.currentStepId === 'B-bawah') item.currentStepId = 'C-silo';
      else if (item.currentStepId === 'C-atas' || item.currentStepId === 'C-bawah') item.currentStepId = 'C-giling';
      else if (item.currentStepId === 'D-atas') item.currentStepId = 'D-mix';
      else if (item.currentStepId === 'D-bawah') item.currentStepId = 'D-packing';

      // Pastikan semua substep terdefinisi
      SUBSTEPS.forEach(s => {
        if (!item.stepHistory[s.id]) {
          item.stepHistory[s.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
        } else if (!item.stepHistory[s.id].stops) {
          item.stepHistory[s.id].stops = [];
        }
      });
    });
  } catch (e) {
    items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
  }
}

function saveData() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (e) {
    console.error(e);
  }
}

// Indonesian Date & Time Formatter
const ID_DAYS = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ID_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

function formatClock(date) {
  const h = String(date.getHours()).padStart(2, '0');
  const m = String(date.getMinutes()).padStart(2, '0');
  const s = String(date.getSeconds()).padStart(2, '0');
  return `${h}.${m}.${s}`;
}

function formatDate(date) {
  const day = ID_DAYS[date.getDay()];
  const dateNum = date.getDate();
  const month = ID_MONTHS[date.getMonth()];
  return `${day}, ${dateNum} ${month}`;
}

function formatTime(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${h}:${m}`;
}

function formatDateTimeShort(iso) {
  if (!iso) return '-';
  const d = new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = ID_MONTHS_SHORT[d.getMonth()];
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month}, ${h}:${m}`;
}

function calcDuration(startIso, endIso) {
  if (!startIso) return '-';
  const start = new Date(startIso).getTime();
  const end = endIso ? new Date(endIso).getTime() : Date.now();
  if (isNaN(start) || isNaN(end)) return '-';
  const diffMs = Math.max(0, end - start);
  const diffMins = Math.floor(diffMs / 60000);
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  if (hours > 0) return `${hours}j ${mins}m`;
  return `${mins}m`;
}

// Convert ISO string to datetime-local input string (YYYY-MM-DDTHH:mm) in local timezone
function toLocalInputDateTime(iso) {
  const d = iso ? new Date(iso) : new Date();
  if (isNaN(d.getTime())) return '';
  const pad = n => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());
  const hh = pad(d.getHours());
  const mi = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd}T${hh}:${mi}`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function runClock() {
  const clockEl = document.getElementById('liveClock');
  const dateEl = document.getElementById('liveDate');
  function update() {
    const now = new Date();
    if (clockEl) clockEl.textContent = formatClock(now);
    if (dateEl) dateEl.textContent = formatDate(now);
  }
  update();
  setInterval(update, 1000);
}

function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.style.display = 'block';
  setTimeout(() => {
    toast.style.display = 'none';
  }, 3500);
}

/**
 * Pencatatan Riwayat Perjalanan Langkah Alur Mesin (Chronological Journey Log)
 * Mencatat setiap perpindahan mesin termasuk siklus pengulangan gabah masih basah
 */
function recordJourneyStep(item, targetStepId, selectedMachine, isRecycle = false, reason = '', gilingType = null) {
  if (!item.journeyLog) item.journeyLog = [];
  const nowIso = new Date().toISOString();

  // Tutup langkah perjalanan aktif sebelumnya
  const openStep = item.journeyLog.find(j => !j.completedAt);
  if (openStep) {
    openStep.completedAt = nowIso;
    openStep.duration = calcDuration(openStep.startedAt, nowIso);
  }

  const stepObj = getSubstep(targetStepId);
  const cycleNum = isRecycle ? (item.recycleCount || 1) : (item.recycleCount ? (item.recycleCount + 1) : 1);
  const machineName = selectedMachine || (targetStepId === 'C-giling' ? `Giling (${gilingType || item.gilingType || 'PK'})` : (stepObj ? stepObj.lineName : targetStepId));

  item.journeyLog.push({
    id: 'j-' + Date.now() + '-' + Math.random().toString(36).substr(2, 4),
    stepId: targetStepId,
    stepName: stepObj ? stepObj.lineName : targetStepId,
    machine: machineName,
    startedAt: nowIso,
    completedAt: null,
    isRecycle: !!isRecycle,
    cycle: cycleNum,
    reason: reason || (isRecycle ? 'Gabah Masih Basah' : ''),
    gilingType: targetStepId === 'C-giling' ? (gilingType || item.gilingType || 'PK') : null
  });
}
window.recordJourneyStep = recordJourneyStep;

/**
 * Dapatkan Riwayat Alur Lengkap Barang (Mendukung rekurensi/pengulangan pengeringan)
 */
function getItemJourneyTrail(item) {
  if (item.journeyLog && item.journeyLog.length > 0) {
    return item.journeyLog;
  }

  // Rekonstruksi dari stepHistory + recycleLog + assignedMachines
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
window.getItemJourneyTrail = getItemJourneyTrail;

/**
 * 1. Mulai langkah pertama (Silo Basah) untuk barang yang masih berstatus kosong/standby
 */
function startFirstStep(itemId) {
  openStepConfirmModal(itemId, 'A-silo', false);
}
window.startFirstStep = startFirstStep;

/**
 * Eksekusi Pindah Step (Dengan Pencatatan Waktu Otomatis & Pemilihan Mesin)
 */
function executeStepAdvance(itemId, targetStepId, selectedMachine, gilingType, isQueue) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const currentIdx = (item.status === 'standby' || !item.currentStepId) ? -1 : getSubstepIndex(item.currentStepId);
  const targetIdx = getSubstepIndex(targetStepId);
  const isDirectGilingToPacking = (item.currentStepId === 'C-giling' && targetStepId === 'D-packing');
  const isStartingFromStandby = (currentIdx === -1);
  const isRecyclingFlow = (item.currentStepId === 'C-silo' && (targetStepId === 'B-dryer' || targetStepId === 'A-silo'));

  // Validasi ketat: Alur proses TIDAK BOLEH terlewati! (Kecuali dari Giling langsung ke Packing, mulai dari Standby, atau Alur Pengulangan Gabah Masih Basah)
  if (!isStartingFromStandby && !isDirectGilingToPacking && !isRecyclingFlow) {
    if (targetIdx > currentIdx + 1) {
      const nextStep = SUBSTEPS[currentIdx + 1];
      showToast(`⛔ Alur tidak boleh terlewati! Selesaikan proses secara bertahap (Tahap berikutnya: ${nextStep.lineName}).`);
      return;
    }
  }

  // Wajib ambil seluruh muatan padi yang berada dalam satu unit mesin fisik (Silo Basah, Dryer, Silo Kering)
  // Aturan pabrik: muatan satu unit wajib dialirkan bersamaan ke unit tujuan yang sama dan tidak dapat dipisah
  const coItems = getCoLocatedItems(item);
  const coItemIds = coItems.map(it => it.id);
  const totalGroupTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedGroupTonase = Math.round(totalGroupTonase * 10) / 10;

  // Validasi: Mesin tujuan tidak boleh sedang dalam perbaikan
  if (selectedMachine && isMachineUnderMaintenance(targetStepId, selectedMachine)) {
    const maint = getMachineMaintenanceInfo(targetStepId, selectedMachine);
    showToast(`⛔ Mesin ${selectedMachine} sedang dalam perbaikan (${maint?.reason || 'Kendala'})! Tidak dapat digunakan.`);
    return;
  }

  // Validasi Kapasitas Max 30 Ton per Unit (Silo Basah, Dryer, Silo Kering)
  if (selectedMachine && (targetStepId === 'A-silo' || targetStepId === 'B-dryer' || targetStepId === 'C-silo')) {
    const occ = getMachineUnitOccupancy(targetStepId, selectedMachine, coItemIds);
    if (occ.totalTonase + roundedGroupTonase > UNIT_MAX_CAPACITY) {
      const extraMsg = coItems.length > 1 ? ` (Total ${coItems.length} padi dalam satu unit asal: ${roundedGroupTonase} Ton)` : '';
      showToast(`⛔ ${selectedMachine} melebihi batas kapasitas 30 Ton! (Saat ini: ${occ.totalTonase} Ton + butuh ${roundedGroupTonase} Ton${extraMsg} = ${Math.round((occ.totalTonase + roundedGroupTonase)*10)/10} Ton). Silakan pilih unit lain.`);
      return;
    }
  }

  // Jika belum ada mesin dipilih secara spesifik, cari unit yang muat seluruh muatan grup
  if (!selectedMachine) {
    const stepObj = getSubstep(targetStepId);
    if (stepObj && stepObj.unitCount > 1) {
      const isMultiCap = (targetStepId === 'A-silo' || targetStepId === 'B-dryer' || targetStepId === 'C-silo');
      let chosen = null;
      if (isMultiCap) {
        for (let u = 1; u <= stepObj.unitCount; u++) {
          const uName = `${stepObj.unitPrefix} ${u}`;
          if (isMachineUnderMaintenance(targetStepId, uName)) continue;
          const occ = getMachineUnitOccupancy(targetStepId, uName, coItemIds);
          if (occ.count === 0 && roundedGroupTonase <= UNIT_MAX_CAPACITY) {
            chosen = uName;
            break;
          }
        }
        if (!chosen) {
          for (let u = 1; u <= stepObj.unitCount; u++) {
            const uName = `${stepObj.unitPrefix} ${u}`;
            if (isMachineUnderMaintenance(targetStepId, uName)) continue;
            const occ = getMachineUnitOccupancy(targetStepId, uName, coItemIds);
            if (occ.remainingCapacity >= roundedGroupTonase) {
              chosen = uName;
              break;
            }
          }
        }
      }
      if (!chosen) chosen = `${stepObj.unitPrefix} 1`;
      selectedMachine = chosen;
    }
  }

  // Validasi Khusus C-giling: Mesin Giling tunggal (1 unit) tidak bisa dipakai bersamaan - harus antri jika sedang memproses!
  const isGilingBusyInitially = (targetStepId === 'C-giling') ? isGilingMachineBusy(item.id) : false;
  if (targetStepId === 'C-giling') {
    const isMaint = isMachineUnderMaintenance('C-giling', 'Mesin Giling 1');
    if (isMaint) {
      const maint = getMachineMaintenanceInfo('C-giling', 'Mesin Giling 1');
      showToast(`⛔ Mesin Giling sedang dalam perbaikan (${maint?.reason || 'Kendala'})! Tidak dapat digunakan.`);
      return;
    }
  }

  // Validasi Khusus D-mix: Mesin Mix tunggal (1 unit) TIDAK BISA LANGSUNG DIPAKAI jika sedang digunakan barang lain atau perbaikan!
  const isMixBusyInitially = (targetStepId === 'D-mix') ? isMixMachineBusy(item.id) : false;
  if (targetStepId === 'D-mix') {
    const isMaint = isMachineUnderMaintenance('D-mix', 'Mix') || isMachineUnderMaintenance('D-mix', 'Mesin Mix');
    if (isMaint) {
      const maint = getMachineMaintenanceInfo('D-mix', 'Mix') || getMachineMaintenanceInfo('D-mix', 'Mesin Mix');
      showToast(`⛔ Mesin Mix sedang dalam perbaikan (${maint?.reason || 'Kendala'})! Tidak dapat digunakan.`);
      return;
    }
    if (isMixBusyInitially && !isQueue) {
      const activeItem = getActiveMixItem();
      showToast(`⛔ Mesin Mix sedang memproses ${activeItem?.code || 'barang lain'}! Tidak bisa langsung masuk, harus antri.`);
      return;
    }
  }

  const nowIso = new Date().toISOString();
  const oldStepId = item.currentStepId;
  const oldMachine = item.assignedMachines?.[oldStepId] || oldStepId;

  // Proses seluruh barang dalam grup secara bersamaan ke target yang sama
  coItems.forEach((currItem, idxInGroup) => {
    const itOldStepId = currItem.currentStepId;
    if (!currItem.stepHistory) currItem.stepHistory = {};
    if (!currItem.assignedMachines) currItem.assignedMachines = {};

    if (!currItem.masukAt) {
      currItem.masukAt = nowIso;
    }

    // Selesaikan step saat ini
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

      // Reset status passed untuk tahap target dan tahap sesudahnya agar alur berjalan kembali
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
      // Tandai step sebelum target sebagai passed (D-mix dilewati jika langsung ke Packing)
      SUBSTEPS.forEach((step, idx) => {
        if (!currItem.stepHistory[step.id]) {
          currItem.stepHistory[step.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
        }
        if (idx < targetIdx) {
          if (isDirectGilingToPacking && step.id === 'D-mix') {
            currItem.stepHistory['D-mix'].passed = true;
            currItem.stepHistory['D-mix'].skipped = true;
            currItem.stepHistory['D-mix'].startedAt = null;
            currItem.stepHistory['D-mix'].completedAt = null;
          } else if (!currItem.stepHistory[step.id].passed) {
            currItem.stepHistory[step.id].passed = true;
            if (!currItem.stepHistory[step.id].startedAt) currItem.stepHistory[step.id].startedAt = currItem.masukAt || nowIso;
            if (!currItem.stepHistory[step.id].completedAt) currItem.stepHistory[step.id].completedAt = nowIso;
          }
        } else if (idx === targetIdx) {
          currItem.stepHistory[step.id].passed = false;
          currItem.stepHistory[step.id].completedAt = null;
          currItem.stepHistory[step.id].skipped = false;
        }
      });
    }

    // Simpan unit mesin tujuan yang sama untuk seluruh muatan padi
    if (selectedMachine) {
      currItem.assignedMachines[targetStepId] = selectedMachine;
      currItem.stepHistory[targetStepId].machine = selectedMachine;
    }

    // Khusus C-giling: tentukan PK atau Glosor & status antrian (1 unit tunggal, wajib antri jika sibuk / antrian grup)
    if (targetStepId === 'C-giling') {
      currItem.gilingType = gilingType || currItem.gilingType || 'PK';
      currItem.stepHistory['C-giling'].gilingType = currItem.gilingType;
      // Jika giling sedang sibuk, atau ini muatan ke-2 dst dalam grup, atau isQueue bernilai true -> harus masuk antrian giling
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
    }

    // Khusus D-mix: jika ada antrian mix (1 unit tunggal)
    if (targetStepId === 'D-mix') {
      const mustQueueMix = isMixBusyInitially || idxInGroup > 0 || !!isQueue;
      currItem.isQueuedForMix = mustQueueMix;
      if (mustQueueMix) {
        currItem.stepHistory['D-mix'].startedAt = null;
        currItem.stepHistory['D-mix'].queuedAt = nowIso;
      } else {
        currItem.stepHistory['D-mix'].startedAt = nowIso;
        currItem.stepHistory['D-mix'].queuedAt = null;
      }
    } else {
      currItem.isQueuedForMix = false;
      if (targetStepId !== 'C-giling') {
        currItem.stepHistory[targetStepId].startedAt = nowIso;
      }
    }

    // Tutup stop event jika ada yang masih open saat berpindah tahap
    if (currItem.stopLog) {
      currItem.stopLog.forEach(s => {
        if (!s.resumedAt) {
          s.resumedAt = nowIso;
          s.duration = calcDuration(s.stoppedAt, nowIso);
        }
      });
    }
    if (itOldStepId && currItem.stepHistory && currItem.stepHistory[itOldStepId] && currItem.stepHistory[itOldStepId].stops) {
      currItem.stepHistory[itOldStepId].stops.forEach(st => {
        if (!st.resumedAt) {
          st.resumedAt = nowIso;
          st.duration = calcDuration(st.stoppedAt, nowIso);
        }
      });
    }

    currItem.currentStepId = targetStepId;
    currItem.status = 'active';
    currItem.stoppedAt = null;
    currItem.stopReason = '';

    // Catat ke log perjalanan kronologis alur mesin
    recordJourneyStep(
      currItem, 
      targetStepId, 
      selectedMachine, 
      isRecyclingFlow, 
      isRecyclingFlow ? 'Gabah Masih Basah' : '', 
      targetStepId === 'C-giling' ? currItem.gilingType : null
    );
  });

  // Jika baru saja meninggalkan C-giling, bangunkan antrean giling berikutnya!
  if (oldStepId === 'C-giling') {
    promoteNextGilingQueue();
  }

  // Jika baru saja meninggalkan D-mix, bangunkan antrean mix berikutnya!
  if (oldStepId === 'D-mix') {
    promoteNextMixQueue();
  }

  saveData();
  renderTable();

  const targetStep = getSubstep(targetStepId);
  const machineName = selectedMachine || (targetStepId === 'C-giling' ? `Giling (${item.gilingType})` : targetStep.lineName);

  if (isRecyclingFlow) {
    const unitLabel = coItems.length > 1 ? `Muatan ${coItems.length} padi dari ${oldMachine}` : `${item.code} (${oldMachine})`;
    showToast(`⚠️ Alur Pengulangan: ${unitLabel} (${roundedGroupTonase} Ton) dialirkan kembali ke ${machineName} untuk pengeringan ulang (gabah masih basah)!`);
  } else if (coItems.length > 1) {
    showToast(`Muatan ${coItems.length} padi dari ${oldMachine} (Total ${roundedGroupTonase} Ton) berhasil dialirkan bersamaan ke ${machineName}!`);
  } else if (targetStepId === 'C-giling' && item.isQueuedForGiling) {
    showToast(`${item.code} masuk antrian Mesin Giling (${item.gilingType}). Otomatis aktif saat mesin kosong.`);
  } else if (targetStepId === 'D-mix' && item.isQueuedForMix) {
    showToast(`${item.code} masuk antrian Mesin Mix. Otomatis aktif saat mesin mix kosong.`);
  } else {
    showToast(`${item.code} aktif di ${targetStep.stageName} • ${machineName}`);
  }
}
window.executeStepAdvance = executeStepAdvance;

/**
 * 2. MODAL TERHENTI & INPUT PENJELASAN
 */
function openStopModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const curStep = getSubstep(item.currentStepId);
  const stepName = curStep ? `${curStep.stageName} (${curStep.lineName})` : 'Alur Mesin';

  document.getElementById('stopItemId').value = item.id;
  document.getElementById('stopStepInfo').textContent = `${item.code} • ${stepName}`;
  document.getElementById('stopReasonInput').value = item.stopReason || '';

  // Reset chip active state
  document.querySelectorAll('#stopReasonChips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === (item.stopReason || ''));
  });

  document.getElementById('stopModal').classList.add('open');
}
window.openStopModal = openStopModal;

function closeStopModal() {
  document.getElementById('stopModal').classList.remove('open');
}

function selectStopChip(text) {
  const input = document.getElementById('stopReasonInput');
  input.value = text;
  document.querySelectorAll('#stopReasonChips .chip-btn').forEach(btn => {
    btn.classList.toggle('active', btn.textContent.trim() === text);
  });
}
window.selectStopChip = selectStopChip;

function handleStopSubmit(e) {
  e.preventDefault();
  const itemId = document.getElementById('stopItemId').value;
  const reason = document.getElementById('stopReasonInput').value.trim() || 'Kendala Mesin';

  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const currentStep = getSubstep(item.currentStepId);
  const stepName = currentStep ? currentStep.lineName : 'Mesin';
  const nowIso = new Date().toISOString();

  item.status = 'stopped';
  item.stoppedAt = nowIso;
  item.stopReason = reason;

  if (!item.stopLog) item.stopLog = [];
  if (!item.stepHistory) item.stepHistory = {};

  // Cek apakah ada stop event aktif pada step ini yang belum di-resume (misal user hanya mengedit alasan)
  const openStop = item.stopLog.slice().reverse().find(s => !s.resumedAt && s.stepId === item.currentStepId);
  if (openStop) {
    openStop.reason = reason;
  } else {
    const stopRecord = {
      id: 'stop_' + Date.now(),
      stepId: item.currentStepId,
      stepName: stepName,
      stageName: currentStep ? currentStep.stageName : 'Alur Mesin',
      stoppedAt: nowIso,
      resumedAt: null,
      reason: reason
    };
    item.stopLog.push(stopRecord);

    // Catat juga ke history step yang sedang aktif
    if (item.currentStepId) {
      if (!item.stepHistory[item.currentStepId]) item.stepHistory[item.currentStepId] = {};
      if (!item.stepHistory[item.currentStepId].stops) item.stepHistory[item.currentStepId].stops = [];
      item.stepHistory[item.currentStepId].stops.push(stopRecord);
    }
  }

  saveData();
  renderTable();
  closeStopModal();

  if (activeModalItemId === itemId) {
    openDetailModal(itemId);
  }
  showToast(`⚠️ Terhenti: ${item.code} di ${stepName} (${reason}). Riwayat kendala tersimpan.`);
}

/**
 * Resume Machine (Nyalakan kembali setelah selesai perbaikan)
 */
function resumeMachine(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const currentStep = getSubstep(item.currentStepId);
  const stepName = currentStep ? currentStep.lineName : 'Mesin';
  const nowIso = new Date().toISOString();

  item.status = 'active';
  item.stoppedAt = null;

  // Tutup stop event yang masih open di stopLog
  if (item.stopLog) {
    item.stopLog.forEach(s => {
      if (!s.resumedAt) {
        s.resumedAt = nowIso;
        s.duration = calcDuration(s.stoppedAt, nowIso);
      }
    });
  }

  // Tutup stop event di stepHistory
  if (item.stepHistory) {
    Object.keys(item.stepHistory).forEach(sId => {
      if (item.stepHistory[sId] && item.stepHistory[sId].stops) {
        item.stepHistory[sId].stops.forEach(st => {
          if (!st.resumedAt) {
            st.resumedAt = nowIso;
            st.duration = calcDuration(st.stoppedAt, nowIso);
          }
        });
      }
    });
  }

  saveData();
  renderTable();
  if (activeModalItemId === itemId) {
    openDetailModal(itemId);
  }
  showToast(`▶ MESIN RESUME! ${item.code} kembali beroperasi di ${stepName} (indikator hijau aktif). Riwayat terhenti tercatat di riwayat.`);
}
window.resumeMachine = resumeMachine;

/**
 * 3. MODAL TELAH SELESAI (INPUT WAKTU PENYELESAIAN)
 */
function openCompleteModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  document.getElementById('completeItemId').value = item.id;
  document.getElementById('completeItemInfo').textContent = `${item.code} - ${item.name}`;
  
  // Default datetime: existing completedAt atau saat ini
  const initialTime = item.completedAt || new Date().toISOString();
  document.getElementById('inputCompleteTime').value = toLocalInputDateTime(initialTime);
  const defaultNote = (item.recycleCount > 0)
    ? `Diulang ${item.recycleCount}x pengeringan (gabah masih basah)`
    : '';
  document.getElementById('inputCompleteNote').value = item.catatanSelesai || defaultNote;
  document.getElementById('inputCompleteTonase').value = item.tonaseAkhir || item.tonase || '';

  // Penempatan selesai: Gudang vs Mobil
  const locVal = item.selesaiLokasi || 'Gudang';
  const radioEl = document.querySelector(`input[name="completeLocationRadio"][value="${locVal}"]`);
  if (radioEl) radioEl.checked = true;

  document.getElementById('completeModal').classList.add('open');
}
window.openCompleteModal = openCompleteModal;

function closeCompleteModal() {
  document.getElementById('completeModal').classList.remove('open');
}

function handleCompleteSubmit(e) {
  e.preventDefault();
  const itemId = document.getElementById('completeItemId').value;
  const timeVal = document.getElementById('inputCompleteTime').value;
  const note = document.getElementById('inputCompleteNote').value.trim();
  const tonase = parseFloat(document.getElementById('inputCompleteTonase').value);
  const selectedRadio = document.querySelector('input[name="completeLocationRadio"]:checked');
  const lokasiSelesai = selectedRadio ? selectedRadio.value : 'Gudang';

  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const finishDate = timeVal ? new Date(timeVal) : new Date();
  const finishIso = !isNaN(finishDate.getTime()) ? finishDate.toISOString() : new Date().toISOString();

  // Tutup stop event jika ada yang masih open
  if (item.stopLog) {
    item.stopLog.forEach(s => {
      if (!s.resumedAt) {
        s.resumedAt = finishIso;
        s.duration = calcDuration(s.stoppedAt, finishIso);
      }
    });
  }
  if (item.stepHistory) {
    Object.keys(item.stepHistory).forEach(sId => {
      if (item.stepHistory[sId] && item.stepHistory[sId].stops) {
        item.stepHistory[sId].stops.forEach(st => {
          if (!st.resumedAt) {
            st.resumedAt = finishIso;
            st.duration = calcDuration(st.stoppedAt, finishIso);
          }
        });
      }
    });
  }

  // Selesaikan seluruh tahapan alur (tetap jaga status skipped jika lewat langsung packing)
  SUBSTEPS.forEach(step => {
    if (!item.stepHistory[step.id]) item.stepHistory[step.id] = {};
    if (item.stepHistory[step.id].skipped) {
      item.stepHistory[step.id].passed = true;
    } else {
      item.stepHistory[step.id].passed = true;
      if (!item.stepHistory[step.id].startedAt) item.stepHistory[step.id].startedAt = item.masukAt || finishIso;
    }
  });

  // Tahap terakhir (D-packing: Packing) selesai pada finishIso
  if (item.stepHistory['D-packing']) {
    item.stepHistory['D-packing'].completedAt = finishIso;
  }

  // Selesaikan langkah terakhir pada log perjalanan kronologis mesin
  if (item.journeyLog && item.journeyLog.length > 0) {
    const lastOpen = item.journeyLog.find(j => !j.completedAt);
    if (lastOpen) {
      lastOpen.completedAt = finishIso;
      lastOpen.duration = calcDuration(lastOpen.startedAt, finishIso);
    }
  }

  // Jika barang yang selesai sebelumnya di mesin giling atau mix, bangunkan antrean
  if (item.currentStepId === 'C-giling') {
    promoteNextGilingQueue();
  }
  if (item.currentStepId === 'D-mix') {
    promoteNextMixQueue();
  }

  item.status = 'completed';
  item.completedAt = finishIso;
  item.catatanSelesai = note || (item.recycleCount > 0 ? `Diulang ${item.recycleCount}x pengeringan (gabah masih basah)` : '');
  item.selesaiLokasi = lokasiSelesai;
  if (!isNaN(tonase) && tonase > 0) {
    item.tonaseAkhir = tonase;
  }

  saveData();
  renderTable();
  closeCompleteModal();

  if (activeModalItemId === itemId) {
    openDetailModal(itemId);
  }
  const locLabel = lokasiSelesai === 'Mobil' ? 'Langsung di Mobil' : 'Gudang';
  showToast(`${item.code} telah selesai (${locLabel})! Dicatat selesai: ${formatDateTimeShort(finishIso)}.`);
}

/**
 * 3B. MODAL UBAH WAKTU TAHAP TERTENTU (EDIT STEP TIME)
 */
function openEditStepTimeModal(itemId, stepId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const step = getSubstep(stepId);
  if (!step) return;

  const history = item.stepHistory && item.stepHistory[stepId] ? item.stepHistory[stepId] : {};

  document.getElementById('editStepItemId').value = item.id;
  document.getElementById('editStepId').value = stepId;
  document.getElementById('editStepTitle').textContent = `${item.code} • ${step.stageName} (${step.lineName})`;

  const startTime = history.startedAt || item.masukAt || new Date().toISOString();
  const endTime = history.completedAt || new Date().toISOString();

  document.getElementById('inputStepStartTime').value = toLocalInputDateTime(startTime);
  document.getElementById('inputStepEndTime').value = toLocalInputDateTime(endTime);

  document.getElementById('editStepTimeModal').classList.add('open');
}
window.openEditStepTimeModal = openEditStepTimeModal;

function closeEditStepTimeModal() {
  document.getElementById('editStepTimeModal').classList.remove('open');
}

function handleEditStepTimeSubmit(e) {
  e.preventDefault();
  const itemId = document.getElementById('editStepItemId').value;
  const stepId = document.getElementById('editStepId').value;
  const startVal = document.getElementById('inputStepStartTime').value;
  const endVal = document.getElementById('inputStepEndTime').value;

  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (!item.stepHistory) item.stepHistory = {};
  if (!item.stepHistory[stepId]) item.stepHistory[stepId] = { passed: true };

  if (startVal) {
    const sDate = new Date(startVal);
    if (!isNaN(sDate.getTime())) item.stepHistory[stepId].startedAt = sDate.toISOString();
  }

  if (endVal) {
    const eDate = new Date(endVal);
    if (!isNaN(eDate.getTime())) {
      const eIso = eDate.toISOString();
      item.stepHistory[stepId].completedAt = eIso;
      item.stepHistory[stepId].passed = true;

      // Jika tahap D-packing dan item completed, sinkronkan juga completedAt
      if (stepId === 'D-packing' && item.status === 'completed') {
        item.completedAt = eIso;
      }
    }
  }

  saveData();
  renderTable();
  closeEditStepTimeModal();

  if (activeModalItemId === itemId) {
    openDetailModal(itemId);
  }
  showToast(`Waktu selesai untuk ${getSubstep(stepId).lineName} berhasil diperbarui.`);
}

/**
 * 4. MODAL & CETAK REKAPITULASI LAPORAN LENGKAP
 */
function openRekapModal() {
  const todayStr = new Date().toISOString().slice(0, 10);
  const inputTgl = document.getElementById('rekapTanggal');
  if (inputTgl) inputTgl.value = todayStr;

  const lastPetugas = localStorage.getItem('monitoring_last_petugas');
  if (lastPetugas) {
    const pEl = document.getElementById('rekapPetugas');
    if (pEl) pEl.value = lastPetugas;
  }

  // Otomatis deteksi shift aktif saat ini
  const nowHour = new Date().getHours();
  const shiftSelect = document.getElementById('rekapShift');
  if (shiftSelect) {
    if (nowHour >= 8 && nowHour < 17) {
      shiftSelect.value = 'Shift 1 (08.00 - 17.00)';
    } else if (nowHour >= 17 || nowHour < 2) {
      shiftSelect.value = 'Shift 2 (17.00 - 02.00)';
    } else {
      shiftSelect.value = 'Semua Shift (Harian Penuh)';
    }
  }

  document.getElementById('rekapModal').classList.add('open');
}
window.openRekapModal = openRekapModal;

function closeRekapModal() {
  document.getElementById('rekapModal').classList.remove('open');
}

function handleRekapSubmit(e) {
  e.preventDefault();
  const judul = document.getElementById('rekapJudul').value.trim() || 'Laporan Monitoring Alur Proses Mesin';
  const tanggal = document.getElementById('rekapTanggal').value;
  const petugas = document.getElementById('rekapPetugas').value.trim() || 'Operator Produksi';
  const shift = document.getElementById('rekapShift').value;
  const filter = document.getElementById('rekapFilter').value;
  const catatan = document.getElementById('rekapCatatan').value.trim();

  try {
    localStorage.setItem('monitoring_last_petugas', petugas);
  } catch (err) {}

  // Filter data sesuai pilihan
  let filteredItems = [...items];
  if (filter === 'active') {
    filteredItems = items.filter(i => i.status === 'active');
  } else if (filter === 'completed') {
    filteredItems = items.filter(i => i.status === 'completed');
  } else if (filter === 'stopped') {
    filteredItems = items.filter(i => i.status === 'stopped');
  }

  // Hitung ringkasan
  const totalBarang = items.length;
  const totalAktif = items.filter(i => i.status === 'active').length;
  const totalSelesai = items.filter(i => i.status === 'completed').length;
  const totalTerhenti = items.filter(i => i.status === 'stopped').length;

  const tglFormatted = tanggal ? formatDate(new Date(tanggal)) : formatDate(new Date());
  const nowClock = formatClock(new Date());

  // Bangun HTML printable
  let html = `
    <div class="report-header-banner">
      <div>
        <h1 style="font-size: 18px; margin: 0 0 4px 0; text-transform: uppercase; letter-spacing: 0.5px;">${escapeHtml(judul)}</h1>
        <div style="font-size: 12px; color: #475569;">Pabrik Penggilingan & Pemrosesan Gabah / Beras &bull; SCADA Floor Monitoring</div>
      </div>
      <div style="text-align: right; font-size: 11px;">
        <div><strong>Waktu Cetak:</strong> ${formatDate(new Date())}, ${nowClock} WIB</div>
        <div><strong>Petugas Cetak:</strong> ${escapeHtml(petugas)}</div>
      </div>
    </div>

    <div class="report-meta-box">
      <div><strong>Tanggal Laporan:</strong> ${tglFormatted}</div>
      <div><strong>Shift Kerja:</strong> ${escapeHtml(shift)}</div>
      <div><strong>Filter Tampilan:</strong> ${filter.toUpperCase()} (${filteredItems.length} dari ${totalBarang} barang)</div>
      <div><strong>Total Barang:</strong> ${totalBarang} Lot</div>
      <div><strong>Sedang Berjalan:</strong> ${totalAktif} Lot</div>
      <div><strong>Telah Selesai:</strong> ${totalSelesai} Lot &bull; <strong>Terhenti:</strong> ${totalTerhenti} Lot</div>
    </div>

    <table class="report-print-table">
      <thead>
        <tr>
          <th style="width: 30px; text-align: center;">No</th>
          <th style="width: 60px;">Kode</th>
          <th>Nama Barang</th>
          <th>Bahan & Tonase</th>
          <th>Status / Posisi Terakhir</th>
          <th>Waktu Masuk</th>
          <th>Waktu Selesai</th>
          <th>Durasi</th>
          <th>Catatan / Keterangan</th>
        </tr>
      </thead>
      <tbody>
  `;

  if (filteredItems.length === 0) {
    html += `<tr><td colspan="9" style="text-align: center; padding: 15px; color: #64748b;">Tidak ada data barang yang sesuai dengan filter.</td></tr>`;
  } else {
    filteredItems.forEach((item, idx) => {
      const curStep = getSubstep(item.currentStepId);
      let statusStr = '';
      if (item.status === 'completed') {
        const locLabel = item.selesaiLokasi === 'Mobil' ? 'Langsung di Mobil' : 'Gudang';
        statusStr = `Selesai (${locLabel})`;
      } else if (item.status === 'stopped') statusStr = `⚠️ Terhenti (${curStep ? curStep.lineName : 'Mesin'})`;
      else if (item.status === 'active') statusStr = `▶ Aktif (${curStep ? curStep.lineName : 'Proses'})`;
      else statusStr = 'Standby (Kosong)';

      const durasiStr = item.masukAt ? calcDuration(item.masukAt, item.completedAt) : '-';
      
      let ketParts = [];
      if (item.status === 'stopped') {
        ketParts.push(`⚠️ Alasan Stop: ${escapeHtml(item.stopReason || 'Kendala Mesin')}`);
      } else if (item.stopLog && item.stopLog.length > 0) {
        const troubleSummaries = item.stopLog.map(s => `${s.stepName} (${escapeHtml(s.reason || 'Kendala')}, ${s.duration || calcDuration(s.stoppedAt, s.resumedAt)})`).join('; ');
        ketParts.push(`⚠️ Pernah Terhenti: ${troubleSummaries}`);
      }
      if (item.catatanSelesai) {
        ketParts.push(escapeHtml(item.catatanSelesai));
      }
      const ketStr = ketParts.length > 0 ? ketParts.join(' • ') : '-';

      const tonaseStr = item.tonaseAkhir ? `${item.tonaseAkhir} Ton (Awal: ${item.tonase || '-'})` : (item.tonase ? `${item.tonase} Ton` : '-');

      html += `
        <tr>
          <td style="text-align: center;">${idx + 1}</td>
          <td><strong>${escapeHtml(item.code)}</strong></td>
          <td>${escapeHtml(item.name)}</td>
          <td>${escapeHtml(item.jenis || '-')}, ${tonaseStr}</td>
          <td><strong>${statusStr}</strong></td>
          <td>${formatDateTimeShort(item.masukAt)}</td>
          <td>${formatDateTimeShort(item.completedAt)}</td>
          <td>${durasiStr}</td>
          <td>${ketStr}</td>
        </tr>
      `;
    });
  }

  html += `
      </tbody>
    </table>

    <!-- Rincian Waktu Tiap Tahap Mesin -->
    <h3 style="font-size: 13px; margin: 16px 0 8px 0; border-bottom: 1px solid #cbd5e1; padding-bottom: 4px;">Rincian Jam Penyelesaian per Tahap Mesin</h3>
    <table class="report-print-table" style="font-size: 10px;">
      <thead>
        <tr>
          <th>Kode</th>
          <th>Silo Basah (1-4)</th>
          <th>Dryer (1-5)</th>
          <th>Silo Kering (1-9)</th>
          <th>Giling (PK/Glosor)</th>
          <th>Mix</th>
          <th>Packing</th>
        </tr>
      </thead>
      <tbody>
  `;

  filteredItems.forEach(item => {
    html += `<tr><td><strong>${escapeHtml(item.code)}</strong></td>`;
    SUBSTEPS.forEach(s => {
      const h = item.stepHistory && item.stepHistory[s.id] ? item.stepHistory[s.id] : {};
      const unitName = (item.assignedMachines && item.assignedMachines[s.id]) || (s.id === 'C-giling' && item.gilingType ? `Giling: ${item.gilingType}` : '');
      const unitLabel = unitName ? `<div style="font-size:8.5px; opacity:0.85;">${escapeHtml(unitName)}</div>` : '';

      if (h.skipped) {
        html += `<td style="color: #94a3b8; font-style: italic; font-size: 8.5px;">Lewat (Tanpa Mix)</td>`;
      } else if (h.passed && h.completedAt) {
        html += `<td>${unitLabel}${formatTime(h.completedAt)}</td>`;
      } else if (item.currentStepId === s.id && item.status === 'active') {
        if ((s.id === 'C-giling' && item.isQueuedForGiling) || (s.id === 'D-mix' && item.isQueuedForMix)) {
          html += `<td style="background: #fef3c7; color: #b45309; font-weight: bold;">${unitLabel}Antri</td>`;
        } else {
          html += `<td style="background: #e0f2fe; font-weight: bold;">${unitLabel}Aktif</td>`;
        }
      } else if (item.currentStepId === s.id && item.status === 'stopped') {
        html += `<td style="background: #fee2e2; color: #dc2626; font-weight: bold;">${unitLabel}Stop</td>`;
      } else {
        html += `<td style="color: #94a3b8;">-</td>`;
      }
    });
    html += `</tr>`;
  });

  html += `
      </tbody>
    </table>
  `;

  if (catatan) {
    html += `
      <div style="margin-top: 14px; padding: 10px 14px; border: 1px solid #cbd5e1; background: #f8fafc; border-radius: 4px; font-size: 11px;">
        <strong>Catatan & Evaluasi Operasional:</strong><br>
        <p style="margin: 4px 0 0 0; white-space: pre-wrap;">${escapeHtml(catatan)}</p>
      </div>
    `;
  }


  const printArea = document.getElementById('printReportArea');
  if (printArea) {
    printArea.innerHTML = html;
  }

  closeRekapModal();
  setTimeout(() => {
    window.print();
  }, 300);
}

/**
 * Handle Track Click dengan Pencegahan Kesalahan Kelewatan
 */
function handleTrackClick(itemId, targetStepId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (item.status === 'stopped') {
    const curStep = getSubstep(item.currentStepId);
    showToast(`⚠️ Mesin sedang terhenti di ${curStep ? curStep.lineName : 'tahap ini'}. Klik ▶ Resume atau ubah alasan terhenti.`);
    return;
  }

  // Jika item sedang antri di Mesin Giling
  if (item.currentStepId === 'C-giling' && item.isQueuedForGiling) {
    if (targetStepId === 'C-giling') {
      openDetailModal(item.id);
    } else {
      showToast(`${item.code} sedang mengantri Mesin Giling. Menunggu mesin giling kosong sebelum dapat lanjut.`);
    }
    return;
  }

  // Jika item sedang antri di Mesin Mix
  if (item.currentStepId === 'D-mix' && item.isQueuedForMix) {
    if (targetStepId === 'D-mix') {
      openDetailModal(item.id);
    } else {
      showToast(`${item.code} sedang mengantri Mesin Mix. Menunggu mesin mix kosong sebelum dapat lanjut.`);
    }
    return;
  }

  // Jika barang masih berstatus Kosong / Standby
  if (item.status === 'standby' || !item.currentStepId) {
    if (targetStepId === 'A-silo') {
      startFirstStep(itemId);
    } else {
      openStepConfirmModal(itemId, targetStepId, true);
    }
    return;
  }

  const currentStepId = item.currentStepId;
  const currentIdx = getSubstepIndex(currentStepId);
  const targetIdx = getSubstepIndex(targetStepId);

  // Jika mengklik track yang sedang aktif, buka riwayat waktu
  if (currentStepId === targetStepId && item.status === 'active') {
    openDetailModal(item.id);
    return;
  }

  // Jika barang sudah selesai sepenuhnya
  if (item.status === 'completed') {
    openDetailModal(item.id);
    return;
  }

  // Khusus alur dari Mesin Giling ke Packing: diizinkan langsung tanpa melalui Mix
  if (currentStepId === 'C-giling' && targetStepId === 'D-packing') {
    openStepConfirmModal(itemId, 'D-packing', false);
    return;
  }

  // Alur Pengulangan Mesin: dari Silo Kering ke Dryer atau Silo Basah (karena gabah masih basah)
  if (currentStepId === 'C-silo' && (targetStepId === 'B-dryer' || targetStepId === 'A-silo')) {
    openStepConfirmModal(itemId, targetStepId, false);
    return;
  }

  // Jika klik adalah langkah tepat berikutnya (normal bertahap)
  if (targetIdx === currentIdx + 1) {
    openStepConfirmModal(itemId, targetStepId, false);
    return;
  }

  // Jika pengguna melompati 2 langkah atau lebih ke depan
  if (targetIdx > currentIdx + 1) {
    openStepConfirmModal(itemId, targetStepId, true);
    return;
  }

  // Jika pengguna mengklik langkah yang sudah pernah lewat
  if (targetIdx < currentIdx) {
    if (confirm(`Peringatan: Langkah ${getSubstep(targetStepId).lineName} sudah pernah dilewati. Apakah Anda ingin mengembalikan posisi ${item.code} ke langkah ini?`)) {
      executeStepAdvance(itemId, targetStepId);
    }
  }
}
window.handleTrackClick = handleTrackClick;

/**
 * Quick Advance Button: Lanjut ke Tepat 1 Langkah Berikutnya
 */
function advanceOneStep(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (item.status === 'standby' || !item.currentStepId) {
    startFirstStep(itemId);
    return;
  }

  if (item.status === 'completed') {
    const locLabel = item.selesaiLokasi === 'Mobil' ? 'Langsung di Mobil' : 'Gudang';
    showToast(`${item.code} sudah selesai proses (${locLabel}).`);
    return;
  }

  // Jika sedang antri di Mesin Giling, tahan agar tidak melompat sebelum diproses!
  if (item.currentStepId === 'C-giling' && item.isQueuedForGiling) {
    showToast(`${item.code} masih dalam antrian Mesin Giling. Menunggu mesin kosong dan proses giling selesai.`);
    return;
  }

  // Jika sedang antri di Mesin Mix, tahan agar tidak melompat sebelum diproses!
  if (item.currentStepId === 'D-mix' && item.isQueuedForMix) {
    showToast(`${item.code} masih dalam antrian Mesin Mix. Menunggu mesin kosong dan proses mix selesai.`);
    return;
  }

  const currentIdx = getSubstepIndex(item.currentStepId);
  if (currentIdx < SUBSTEPS.length - 1) {
    const nextStepId = SUBSTEPS[currentIdx + 1].id;
    openStepConfirmModal(itemId, nextStepId, false);
  } else {
    // Selesai semua tahap (Packing selesai -> Input Telah Selesai)
    openCompleteModal(itemId);
  }
}
window.advanceOneStep = advanceOneStep;

/**
 * Selection Helper Functions for Machine Unit & Giling Type
 */
function selectModalMachineUnit(unitName) {
  if (!pendingStepTransition) return;
  const targetStepId = pendingStepTransition.targetStepId;

  if (isMachineUnderMaintenance(targetStepId, unitName)) {
    const maint = getMachineMaintenanceInfo(targetStepId, unitName);
    showToast(`⚠️ ${unitName} sedang dalam perbaikan (${maint?.reason || 'Kendala'})! Silakan pilih mesin lain.`);
    return;
  }

  // Cek kapasitas unit 30 Ton untuk Silo Basah, Dryer, dan Silo Kering
  if (targetStepId === 'A-silo' || targetStepId === 'B-dryer' || targetStepId === 'C-silo') {
    const curItem = items.find(i => i.id === pendingStepTransition.itemId);
    const coItems = curItem ? getCoLocatedItems(curItem) : [];
    const totalMovingTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
    const roundedMovingTonase = Math.round(totalMovingTonase * 10) / 10;
    const coItemIds = coItems.map(it => it.id);
    const occ = getMachineUnitOccupancy(targetStepId, unitName, coItemIds);

    if (occ.totalTonase + roundedMovingTonase > UNIT_MAX_CAPACITY) {
      const extraMsg = coItems.length > 1 ? ` (Total ${coItems.length} padi dari unit asal: ${roundedMovingTonase} Ton)` : '';
      showToast(`⚠️ ${unitName} tidak muat! Sisa kapasitas ${occ.remainingCapacity} Ton, butuh ${roundedMovingTonase} Ton${extraMsg} (Max: 30 Ton). Pilih unit lain.`);
      return;
    }
  }

  pendingStepTransition.selectedMachine = unitName;
  document.querySelectorAll('#machineSelectContainer .machine-card').forEach(card => {
    const isThis = card.getAttribute('data-machine-unit') === unitName;
    card.classList.toggle('selected', isThis);
  });
}
window.selectModalMachineUnit = selectModalMachineUnit;

function selectModalGilingType(type) {
  if (!pendingStepTransition) return;
  pendingStepTransition.gilingType = type;
  document.querySelectorAll('#machineSelectContainer .giling-card').forEach(card => {
    const isThis = card.getAttribute('data-giling-type') === type;
    card.classList.toggle('selected', isThis);
  });
}
window.selectModalGilingType = selectModalGilingType;

let currentConfirmItemId = null;

function switchStepModalTarget(newTargetStepId) {
  if (currentConfirmItemId) {
    openStepConfirmModal(currentConfirmItemId, newTargetStepId, false);
  }
}
window.switchStepModalTarget = switchStepModalTarget;

/**
 * Modal Konfirmasi Bertahap / Peringatan Kelewatan & Pemilihan Unit Mesin
 */
function openStepConfirmModal(itemId, targetStepId, isSkipping) {
  currentConfirmItemId = itemId;
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  // Khusus dari C-giling ke D-packing diizinkan langsung (bukan pelanggaran urutan)
  if (item.currentStepId === 'C-giling' && targetStepId === 'D-packing') {
    isSkipping = false;
  }

  // Alur Pengulangan Mesin: Dari Silo Kering (C-silo) ke Dryer (B-dryer) atau Silo Basah (A-silo) karena masih basah
  const isRecyclingFlow = (item.currentStepId === 'C-silo' && (targetStepId === 'B-dryer' || targetStepId === 'A-silo'));
  if (isRecyclingFlow) {
    isSkipping = false;
  }

  const currentStep = getSubstep(item.currentStepId);
  const currentIdx = (item.status === 'standby' || !item.currentStepId) ? -1 : getSubstepIndex(item.currentStepId);
  const recommendedNextStep = currentIdx === -1 ? SUBSTEPS[0] : (currentIdx < SUBSTEPS.length - 1 ? SUBSTEPS[currentIdx + 1] : null);

  // Jika isSkipping, alur WAJIB diarahkan ke langkah berurutan (tidak boleh dilompati)
  const actualTargetStep = isSkipping ? recommendedNextStep : getSubstep(targetStepId);
  if (!actualTargetStep) return;

  // Cek barang-barang yang satu unit mesin dengan item ini (aturan pabrik: wajib pindah bersamaan)
  const coItems = getCoLocatedItems(item);
  const totalMovingTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedMovingTonase = Math.round(totalMovingTonase * 10) / 10;
  const coItemIds = coItems.map(it => it.id);
  const isGroupMove = coItems.length > 1;
  const sourceMachineName = item.assignedMachines?.[item.currentStepId] || item.currentStepId || 'Unit Asal';

  let initialMachine = null;
  let initialGilingType = item.gilingType || 'PK';

  // Siapkan container pemilihan mesin
  const container = document.getElementById('machineSelectContainer');
  if (container) {
    container.innerHTML = '';

    if (actualTargetStep.unitCount && actualTargetStep.unitCount > 1) {
      // Mesin dengan banyak unit (Silo Basah 4 unit, Dryer 5 unit, Silo Kering 9 unit - Kapasitas 30 Ton / unit)
      const currentItemTonase = roundedMovingTonase;

      // Default ke mesin yang tersimpan jika muat & tidak perbaikan
      initialMachine = (item.assignedMachines && item.assignedMachines[actualTargetStep.id]);
      if (initialMachine) {
        const isMaint = isMachineUnderMaintenance(actualTargetStep.id, initialMachine);
        const occ = getMachineUnitOccupancy(actualTargetStep.id, initialMachine, coItemIds);
        if (isMaint || occ.totalTonase + currentItemTonase > UNIT_MAX_CAPACITY) {
          initialMachine = null;
        }
      }

      // Jika belum ada default, cari unit pertama yang masih muat seluruh muatan grup dan tidak perbaikan
      if (!initialMachine) {
        for (let u = 1; u <= actualTargetStep.unitCount; u++) {
          const uName = `${actualTargetStep.unitPrefix} ${u}`;
          const isMaint = isMachineUnderMaintenance(actualTargetStep.id, uName);
          const occ = getMachineUnitOccupancy(actualTargetStep.id, uName, coItemIds);
          if (!isMaint && occ.totalTonase + currentItemTonase <= UNIT_MAX_CAPACITY) {
            initialMachine = uName;
            break;
          }
        }
      }

      // Jika masih belum ada (misal semua unit tidak cukup muat), pilih unit yang memiliki sisa kapasitas terbesar
      if (!initialMachine) {
        let maxFree = -1;
        for (let u = 1; u <= actualTargetStep.unitCount; u++) {
          const uName = `${actualTargetStep.unitPrefix} ${u}`;
          const isMaint = isMachineUnderMaintenance(actualTargetStep.id, uName);
          const occ = getMachineUnitOccupancy(actualTargetStep.id, uName, coItemIds);
          if (!isMaint && occ.remainingCapacity > maxFree) {
            maxFree = occ.remainingCapacity;
            initialMachine = uName;
          }
        }
      }
      if (!initialMachine) initialMachine = `${actualTargetStep.unitPrefix} 1`;

      let cardsHtml = '';
      for (let u = 1; u <= actualTargetStep.unitCount; u++) {
        const uName = `${actualTargetStep.unitPrefix} ${u}`;
        const occ = getMachineUnitOccupancy(actualTargetStep.id, uName, coItemIds);
        const isUnderMaint = isMachineUnderMaintenance(actualTargetStep.id, uName);
        const maintInfo = isUnderMaint ? getMachineMaintenanceInfo(actualTargetStep.id, uName) : null;
        const isSelected = uName === initialMachine;
        const willFit = occ.totalTonase + currentItemTonase <= UNIT_MAX_CAPACITY;
        const isFull = occ.totalTonase >= UNIT_MAX_CAPACITY;

        let occClass = '';
        if (isUnderMaint) {
          occClass = 'in-maintenance';
        } else if (isFull) {
          occClass = 'occupied full';
        } else if (!willFit) {
          occClass = 'occupied over-capacity';
        } else if (occ.totalTonase > 0) {
          occClass = 'partially-filled';
        }
        const selClass = isSelected ? 'selected' : '';

        let statusHtml = '';
        if (isUnderMaint) {
          statusHtml = `<span class="machine-card-status stopped" style="color:#ef4444; font-weight:700;">⚠️ Perbaikan (${escapeHtml(maintInfo?.reason || 'Kendala')})</span>`;
        } else if (isFull) {
          statusHtml = `<span class="machine-card-status busy">🔴 Penuh (${occ.totalTonase}/30 Ton)</span>`;
        } else if (!willFit) {
          statusHtml = `<span class="machine-card-status busy" style="color:#f59e0b;">⚠️ Sisa ${occ.remainingCapacity}T (Kurang ${Math.round((currentItemTonase - occ.remainingCapacity)*10)/10}T untuk ${currentItemTonase}T)</span>`;
        } else if (occ.totalTonase > 0) {
          statusHtml = `<span class="machine-card-status free" style="color:#34d399;">Terisi ${occ.totalTonase}/30T (Muat, Sisa ${occ.remainingCapacity}T)</span>`;
        } else {
          statusHtml = `<span class="machine-card-status free">🟢 Kosong (Sisa 30 Ton)</span>`;
        }

        // Daftar nama batch yang ada di unit ini
        let namesHtml = '';
        if (occ.items.length > 0) {
          const namesList = occ.items.map(it => `<strong>${escapeHtml(it.code)}</strong> (${escapeHtml(it.supir || it.name || '-')}: ${it.tonase || 0}T)`).join(', ');
          namesHtml = `
            <div style="font-size: 10px; color: var(--text-lavender); margin-top: 5px; line-height: 1.35; background: rgba(0,0,0,0.28); border-radius: 6px; padding: 4px 6px; text-align: left;">
              <em>Atas nama:</em> ${namesList}
            </div>
          `;
        }

        // Mini bar visualisasi kapasitas
        const meterColor = occ.percent >= 100 ? '#ef4444' : (occ.percent > 70 ? '#f59e0b' : '#10b981');
        const capBarHtml = `
          <div style="background: rgba(255,255,255,0.08); border-radius: 4px; height: 5px; overflow: hidden; margin: 4px 0 2px 0;">
            <div style="width: ${occ.percent}%; height: 100%; background: ${meterColor};"></div>
          </div>
        `;

        cardsHtml += `
          <div class="machine-card ${selClass} ${occClass}" data-machine-unit="${escapeHtml(uName)}" onclick="selectModalMachineUnit('${escapeHtml(uName)}')">
            <div class="machine-card-name" style="display:flex; justify-content:space-between; align-items:center;">
              <span>${escapeHtml(uName)}</span>
              <span style="font-size: 10.5px; opacity: 0.85; font-weight: normal;">${occ.totalTonase}/30 Ton</span>
            </div>
            ${capBarHtml}
            ${statusHtml}
            ${namesHtml}
          </div>
        `;
      }

      const groupBannerHtml = isGroupMove ? `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; font-size: 12px; color: #fde68a; line-height: 1.55;">
          <div style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: flex; align-items: center; gap: 7px; color: #f59e0b;">
            <span>⚠️</span>
            <span>Muatan 1 Unit Wajib Pindah Bersamaan (${coItems.length} Padi • Total ${roundedMovingTonase} Ton)</span>
          </div>
          Unit asal [<strong>${escapeHtml(sourceMachineName)}</strong>] berisi <strong>${coItems.length} muatan padi</strong>:
          <div style="margin: 6px 0; padding: 6px 10px; background: rgba(0,0,0,0.28); border-radius: 8px; font-size: 11px;">
            ${coItems.map(c => `<strong style="color:#60a5fa;">${escapeHtml(c.code)}</strong> (${escapeHtml(c.supir || c.name || '-')}: <strong>${c.tonase || 0}T</strong>)`).join(' + ')} = <strong style="color:#34d399;">${roundedMovingTonase} Ton</strong>
          </div>
          Sesuai aturan pabrik, seluruh muatan dalam satu unit <em>tidak dapat dipisah</em> dan wajib dialirkan bersamaan ke unit tujuan yang sama.
        </div>
      ` : '';

      container.innerHTML = `
        ${groupBannerHtml}
        <div class="machine-select-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px; color: var(--text-lavender); display:flex; justify-content:space-between; align-items:center;">
          <span>Pilih Unit Mesin (${actualTargetStep.unitCount} Unit • Kapasitas Max 30T/Unit):</span>
          <span style="font-size: 11px; color: #10b981;">Total Muatan: <strong>${currentItemTonase} Ton</strong>${isGroupMove ? ` (${coItems.length} Padi)` : ''}</span>
        </div>
        <div class="machine-grid" style="display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 8px;">
          ${cardsHtml}
        </div>
      `;
    } else if (actualTargetStep.id === 'C-giling') {
      // Proses Giling: 1 Mesin Giling Tunggal + Pilihan Output PK / Glosor
      initialMachine = 'Mesin Giling 1';
      const isBusy = isGilingMachineBusy(item.id);
      const activeItem = getActiveGilingItem();
      const isMaint = isMachineUnderMaintenance('C-giling', 'Mesin Giling 1');
      const maintGiling = isMaint ? getMachineMaintenanceInfo('C-giling', 'Mesin Giling 1') : null;

      const groupGilingBanner = isGroupMove ? `
        <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px; font-size: 12px; color: #fde68a; line-height: 1.55;">
          <div style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: flex; align-items: center; gap: 7px; color: #f59e0b;">
            <span>⚠️</span>
            <span>Muatan 1 Unit Dialirkan Bersamaan ke Penggilingan (${coItems.length} Padi • Total ${roundedMovingTonase} Ton)</span>
          </div>
          Unit asal [<strong>${escapeHtml(sourceMachineName)}</strong>] berisi <strong>${coItems.length} muatan padi</strong>:
          <div style="margin: 6px 0; padding: 6px 10px; background: rgba(0,0,0,0.28); border-radius: 8px; font-size: 11px;">
            ${coItems.map(c => `<strong style="color:#60a5fa;">${escapeHtml(c.code)}</strong> (${escapeHtml(c.supir || c.name || '-')}: <strong>${c.tonase || 0}T</strong>)`).join(' + ')} = <strong style="color:#34d399;">${roundedMovingTonase} Ton</strong>
          </div>
          Muatan pertama akan langsung diproses (atau antri jika mesin sibuk), dan muatan berikutnya akan langsung berada dalam antrian penggilingan berurutan.
        </div>
      ` : '';

      if (isMaint) {
        container.innerHTML = `
          ${groupGilingBanner}
          <div style="background: rgba(239, 68, 68, 0.14); border: 1.5px solid rgba(239, 68, 68, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; font-size: 12px; line-height: 1.55; color: #fca5a5;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 7px; color: #ef4444;">
              <span style="font-size: 18px;">⚠️</span>
              <span>Mesin Giling Sedang Dalam Perbaikan</span>
            </div>
            Alasan kendala: <strong>${escapeHtml(maintGiling?.reason || 'Kendala Mesin')}</strong>.
            <br><br>
            Mesin giling (1 unit) saat ini sedang mengalami perbaikan dan tidak dapat digunakan. Silakan tunggu hingga perbaikan selesai.
          </div>
        `;
      } else if (isBusy && activeItem) {
        const selPk = initialGilingType === 'PK' ? 'selected' : '';
        const selGlosor = initialGilingType === 'Glosor' ? 'selected' : '';
        const queuedCount = items.filter(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped')).length;

        container.innerHTML = `
          ${groupGilingBanner}
          <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 13px 15px; margin-bottom: 12px; font-size: 12px; line-height: 1.55; color: #fde68a;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 5px; display: flex; align-items: center; gap: 7px; color: #f59e0b;">
              <span>⚠️</span>
              <span>Mesin Giling Sedang Memproses (Wajib Masuk Antrian)</span>
            </div>
            Mesin Giling tunggal (1 unit) saat ini sedang aktif memproses: <strong>${escapeHtml(activeItem.code)} - ${escapeHtml(activeItem.name)}</strong> (${escapeHtml(activeItem.gilingType || 'PK')}).
            <br>
            Barang <strong>${escapeHtml(item.code)}</strong> tidak bisa langsung diproses bersamaan dan akan masuk ke <strong>Antrian Giling</strong> ${queuedCount > 0 ? `(Urutan ke-${queuedCount + 1})` : '(Urutan ke-1)'}.
          </div>
          <div class="machine-select-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px; color: var(--text-lavender);">
            Pilih Target Hasil Penggilingan (Saat Giliran Tiba):
          </div>
          <div class="giling-choice-box">
            <div class="giling-card ${selPk}" data-giling-type="PK" onclick="selectModalGilingType('PK')">
              <div class="giling-icon" style="font-size:14px; font-weight:800;">PK</div>
              <div class="giling-title">PK (Pecah Kulit)</div>
              <div class="giling-sub">Proses giling kulit gabah</div>
            </div>
            <div class="giling-card ${selGlosor}" data-giling-type="Glosor" onclick="selectModalGilingType('Glosor')">
              <div class="giling-icon" style="font-size:14px; font-weight:800;">GL</div>
              <div class="giling-title">Glosor (Blosor)</div>
              <div class="giling-sub">Proses poles beras putih</div>
            </div>
          </div>
        `;
      } else {
        const selPk = initialGilingType === 'PK' ? 'selected' : '';
        const selGlosor = initialGilingType === 'Glosor' ? 'selected' : '';

        container.innerHTML = `
          ${groupGilingBanner}
          <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; color: #34d399; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🟢</span>
            <span><strong>Mesin Giling Siap:</strong> Mesin giling (1 unit) saat ini kosong dan dapat langsung memproses.</span>
          </div>
          <div class="machine-select-title" style="font-size: 12px; font-weight: 700; margin-bottom: 6px; color: var(--text-lavender);">
            Pilih Hasil Penggilingan (Wajib):
          </div>
          <div class="giling-choice-box">
            <div class="giling-card ${selPk}" data-giling-type="PK" onclick="selectModalGilingType('PK')">
              <div class="giling-icon" style="font-size:14px; font-weight:800;">PK</div>
              <div class="giling-title">PK (Pecah Kulit)</div>
              <div class="giling-sub">Proses giling kulit gabah</div>
            </div>
            <div class="giling-card ${selGlosor}" data-giling-type="Glosor" onclick="selectModalGilingType('Glosor')">
              <div class="giling-icon" style="font-size:14px; font-weight:800;">GL</div>
              <div class="giling-title">Glosor (Blosor)</div>
              <div class="giling-sub">Proses poles beras putih</div>
            </div>
          </div>
        `;
      }
    } else if (actualTargetStep.id === 'D-mix') {
      // Proses Mix: 1 Mesin Mix Tunggal
      initialMachine = 'Mesin Mix';
      const isBusyMix = isMixMachineBusy(item.id);
      const activeMixItem = getActiveMixItem();
      const isMaintMix = isMachineUnderMaintenance('D-mix', 'Mix') || isMachineUnderMaintenance('D-mix', 'Mesin Mix');
      const maintMix = isMaintMix ? (getMachineMaintenanceInfo('D-mix', 'Mix') || getMachineMaintenanceInfo('D-mix', 'Mesin Mix')) : null;

      if (isMaintMix) {
        container.innerHTML = `
          <div style="background: rgba(239, 68, 68, 0.14); border: 1.5px solid rgba(239, 68, 68, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; font-size: 12px; line-height: 1.55; color: #fca5a5;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 7px; color: #ef4444;">
              <span style="font-size: 18px;">⚠️</span>
              <span>Mesin Mix Sedang Dalam Perbaikan</span>
            </div>
            Alasan kendala: <strong>${escapeHtml(maintMix?.reason || 'Kendala Mesin')}</strong>.
            <br><br>
            Mesin Mix (1 unit) saat ini sedang mengalami perbaikan dan tidak dapat digunakan. Silakan tunggu hingga perbaikan selesai.
          </div>
        `;
      } else if (isBusyMix && activeMixItem) {
        container.innerHTML = `
          <div style="background: rgba(245, 158, 11, 0.12); border: 1.5px solid rgba(245, 158, 11, 0.45); border-radius: 12px; padding: 14px 16px; margin-bottom: 8px; font-size: 12px; line-height: 1.55; color: #fde68a;">
            <div style="font-weight: 800; font-size: 13px; margin-bottom: 6px; display: flex; align-items: center; gap: 7px; color: #f59e0b;">
              <span style="font-size: 18px;">⛔</span>
              <span>Mesin Mix Sedang Digunakan (Masih Ada Barang)</span>
            </div>
            Saat ini mesin Mix sedang memproses: <strong>${escapeHtml(activeMixItem.code)} - ${escapeHtml(activeMixItem.name)}</strong>.
            <br><br>
            Barang <strong>${escapeHtml(item.code)}</strong> tidak dapat langsung aktif di mesin Mix karena kapasitas mesin hanya 1 batch. Barang harus masuk ke <strong>Antrian Mix</strong> atau klik <strong>Kembali</strong>.
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 10px 14px; margin-bottom: 12px; font-size: 12px; color: #34d399; display: flex; align-items: center; gap: 8px;">
            <span style="font-size: 18px;">🟢</span>
            <span><strong>Mesin Mix Siap:</strong> Mesin Mix (1 unit) saat ini kosong dan dapat langsung memproses.</span>
          </div>
        `;
      }
    } else {
      // D-packing
      if (item.currentStepId === 'C-giling') {
        container.innerHTML = `
          <div style="background: rgba(16, 185, 129, 0.12); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; font-size: 12px; color: #34d399; line-height: 1.5;">
            <div style="font-weight: 800; font-size: 12.5px; margin-bottom: 4px; display: flex; align-items: center; gap: 6px;">
              <span>Jalur Pintas: Langsung ke Packing & Timbang (Tanpa Mix)</span>
            </div>
            Beras dari Mesin Giling akan langsung dialirkan ke tahap <strong>Packing</strong>. Tahap <strong>Mix</strong> otomatis ditandai dilewati (Lewat / Tanpa Mix).
          </div>
        `;
      } else {
        container.innerHTML = `
          <div style="background: rgba(99, 102, 241, 0.08); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 8px 12px; font-size: 11.5px; color: var(--text-lavender); display: flex; align-items: center; gap: 8px;">
            <span>ℹ️</span>
            <span>Tahap <strong>${escapeHtml(actualTargetStep.lineName)}</strong> siap dijalankan.</span>
          </div>
        `;
      }
    }

    // Jika item saat ini sedang di Mesin Giling, tampilkan pilihan jalur (Mix vs Packing)
    if (item.currentStepId === 'C-giling') {
      const isMixActive = actualTargetStep.id === 'D-mix';
      const isPackActive = actualTargetStep.id === 'D-packing';
      const pathChooserHtml = `
        <div style="margin-bottom: 14px; padding: 10px 12px; background: rgba(255, 255, 255, 0.04); border: 1px solid rgba(255, 255, 255, 0.1); border-radius: 10px;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--text-lavender); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>PILIHAN JALUR KELUAR DARI GILING:</span>
            <span style="font-size: 10.5px; color: var(--text-muted); font-weight: normal;">Bisa ke Mix atau Packing</span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px;">
            <button type="button" class="giling-path-btn" onclick="switchStepModalTarget('D-mix')" style="padding: 9px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; text-align: center; border: 1.5px solid ${isMixActive ? '#6366f1' : 'rgba(255,255,255,0.12)'}; background: ${isMixActive ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isMixActive ? '#fff' : 'var(--text-muted)'};">
              1. Lewat Mesin Mix
            </button>
            <button type="button" class="giling-path-btn" onclick="switchStepModalTarget('D-packing')" style="padding: 9px 8px; border-radius: 8px; font-size: 11.5px; font-weight: 700; cursor: pointer; text-align: center; border: 1.5px solid ${isPackActive ? '#10b981' : 'rgba(255,255,255,0.12)'}; background: ${isPackActive ? 'rgba(16, 185, 129, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isPackActive ? '#fff' : 'var(--text-muted)'};">
              2. Langsung ke Packing (Tanpa Mix)
            </button>
          </div>
        </div>
      `;
      container.innerHTML = pathChooserHtml + container.innerHTML;
    }

    // Jika item saat ini sedang di Silo Kering (C-silo), tampilkan pilihan alur: Lanjut ke Giling atau Ulang jika gabah masih basah
    if (item.currentStepId === 'C-silo') {
      const isGilingActive = actualTargetStep.id === 'C-giling';
      const isDryerActive = actualTargetStep.id === 'B-dryer';
      const isSiloBasahActive = actualTargetStep.id === 'A-silo';

      const pathChooserHtml = `
        <div style="margin-bottom: 14px; padding: 11px 13px; background: rgba(255, 255, 255, 0.04); border: 1.5px solid ${isRecyclingFlow ? 'rgba(245, 158, 11, 0.45)' : 'rgba(255, 255, 255, 0.1)'}; border-radius: 10px;">
          <div style="font-size: 11.5px; font-weight: 700; color: var(--text-lavender); margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>PILIHAN ALUR KELUAR DARI SILO KERING:</span>
            <span style="font-size: 10.5px; color: ${isRecyclingFlow ? '#f59e0b' : 'var(--text-muted)'}; font-weight: 700;">
              ${isRecyclingFlow ? '⚠️ Alur Pengulangan (Gabah Masih Basah)' : 'Alur Normal: Lanjut ke Giling'}
            </span>
          </div>
          <div style="display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 8px;">
            <button type="button" class="giling-path-btn" onclick="switchStepModalTarget('C-giling')" style="padding: 9px 6px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; text-align: center; border: 1.5px solid ${isGilingActive ? '#10b981' : 'rgba(255,255,255,0.12)'}; background: ${isGilingActive ? 'rgba(16, 185, 129, 0.22)' : 'rgba(255,255,255,0.03)'}; color: ${isGilingActive ? '#fff' : 'var(--text-muted)'};">
              1. Lanjut ke Giling
            </button>
            <button type="button" class="giling-path-btn" onclick="switchStepModalTarget('B-dryer')" style="padding: 9px 6px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; text-align: center; border: 1.5px solid ${isDryerActive ? '#f59e0b' : 'rgba(255,255,255,0.12)'}; background: ${isDryerActive ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isDryerActive ? '#fff' : 'var(--text-muted)'};">
              2. Ulang ke Dryer (Basah)
            </button>
            <button type="button" class="giling-path-btn" onclick="switchStepModalTarget('A-silo')" style="padding: 9px 6px; border-radius: 8px; font-size: 11px; font-weight: 700; cursor: pointer; text-align: center; border: 1.5px solid ${isSiloBasahActive ? '#f59e0b' : 'rgba(255,255,255,0.12)'}; background: ${isSiloBasahActive ? 'rgba(245, 158, 11, 0.25)' : 'rgba(255,255,255,0.03)'}; color: ${isSiloBasahActive ? '#fff' : 'var(--text-muted)'};">
              3. Ulang Silo Basah (Basah)
            </button>
          </div>
          ${isRecyclingFlow ? `
            <div style="margin-top: 8px; font-size: 11px; color: #fde68a; line-height: 1.45; background: rgba(0,0,0,0.25); border-radius: 6px; padding: 6px 8px;">
              ⚠️ <em>Kondisi gabah di Silo Kering masih berkadar air tinggi / belum cukup kering. Gabah dialirkan kembali ke <strong>${escapeHtml(actualTargetStep.lineName)}</strong> untuk pengeringan ulang. Seluruh muatan unit (${roundedMovingTonase}T) akan pindah bersamaan.</em>
            </div>
          ` : ''}
        </div>
      `;
      container.innerHTML = pathChooserHtml + container.innerHTML;
    }
  }

  const isBusyGiling = actualTargetStep.id === 'C-giling' && isGilingMachineBusy(item.id);
  const isMaintGiling = actualTargetStep.id === 'C-giling' && isMachineUnderMaintenance('C-giling', 'Mesin Giling 1');
  const isGilingBlocked = isMaintGiling;

  const isBusyMix = actualTargetStep.id === 'D-mix' && isMixMachineBusy(item.id);
  const isMaintMix = actualTargetStep.id === 'D-mix' && (isMachineUnderMaintenance('D-mix', 'Mix') || isMachineUnderMaintenance('D-mix', 'Mesin Mix'));

  pendingStepTransition = (isGilingBlocked || isMaintMix) ? null : {
    itemId,
    targetStepId: actualTargetStep.id,
    selectedMachine: initialMachine,
    gilingType: initialGilingType,
    isQueue: isBusyGiling || isBusyMix
  };

  if (currentStep) {
    document.getElementById('stepCurrentName').textContent = `${currentStep.stageName} (${currentStep.lineName})`;
    document.getElementById('stepCurrentTime').textContent = `Dicatat selesai jam sekarang`;
  } else {
    document.getElementById('stepCurrentName').textContent = 'Belum Dimulai (Standby)';
    document.getElementById('stepCurrentTime').textContent = 'Siap masuk jalur permesinan';
  }

  document.getElementById('stepNextName').textContent = `${actualTargetStep.stageName} • ${actualTargetStep.lineName}`;
  const nextLabelEl = document.getElementById('stepNextLabel');
  if (nextLabelEl) {
    if (isRecyclingFlow) {
      nextLabelEl.textContent = `Tahap Pengulangan (Gabah Masih Basah ➔ ${actualTargetStep.lineName})`;
    } else if (item.currentStepId === 'C-giling') {
      nextLabelEl.textContent = actualTargetStep.id === 'D-packing' 
        ? 'Tahap Berikutnya (Jalur Langsung Tanpa Mix)' 
        : 'Tahap Berikutnya (Jalur Lewat Mix)';
    } else {
      nextLabelEl.textContent = 'Tahap Berikutnya (Wajib Bertahap)';
    }
  }

  const warningBox = document.getElementById('stepSkipWarning');
  const normalActions = document.getElementById('stepModalActions');
  const skipActions = document.getElementById('stepSkipActions');
  const btnConfirm = document.getElementById('btnConfirmStep');
  const btnQueueMix = document.getElementById('btnQueueMixStep');
  const btnBackOnly = document.getElementById('btnBackOnlyStep');

  if (isGilingBlocked || isMaintMix) {
    // Mesin sedang perbaikan: TIDAK BISA DIPAKAI, TOMBOLNYA HANYA ADA KEMBALI
    warningBox.style.display = 'none';
    normalActions.style.display = 'flex';
    skipActions.style.display = 'none';
    if (btnConfirm) btnConfirm.style.display = 'none';
    if (btnQueueMix) btnQueueMix.style.display = 'none';
    if (btnBackOnly) btnBackOnly.style.display = 'block';
  } else if (isBusyGiling) {
    // Mesin Giling sedang dipakai: Tombol konfirmasi menjadi Masuk Antrian Penggilingan
    warningBox.style.display = 'none';
    normalActions.style.display = 'flex';
    skipActions.style.display = 'none';
    if (btnConfirm) {
      btnConfirm.style.display = 'block';
      btnConfirm.textContent = isGroupMove 
        ? `Masuk Antrian Giling (${coItems.length} Padi • ${roundedMovingTonase}T)`
        : 'Masuk Antrian Penggilingan';
    }
    if (btnQueueMix) btnQueueMix.style.display = 'none';
    if (btnBackOnly) btnBackOnly.style.display = 'none';
  } else if (isBusyMix) {
    // Mesin Mix sedang dipakai: Tampilkan opsi Masuk Antrian Mix dan Kembali
    warningBox.style.display = 'none';
    normalActions.style.display = 'flex';
    skipActions.style.display = 'none';
    if (btnConfirm) btnConfirm.style.display = 'none';
    if (btnQueueMix) btnQueueMix.style.display = 'block';
    if (btnBackOnly) btnBackOnly.style.display = 'block';
  } else if (isSkipping) {
    warningBox.style.display = 'flex';
    const curName = currentStep ? currentStep.lineName : 'Awal (Standby)';
    const clickedTarget = getSubstep(targetStepId);
    const clickedName = clickedTarget ? clickedTarget.lineName : targetStepId;
    document.getElementById('stepWarningMsg').textContent = 
      `Barang ${item.code} saat ini di [${curName}]. Anda tidak boleh melompati langsung ke [${clickedName}]. Alur permesinan wajib berurutan ke [${actualTargetStep.lineName}].`;
    normalActions.style.display = 'none';
    skipActions.style.display = 'flex';

    if (recommendedNextStep) {
      document.getElementById('btnFollowSequence').textContent = `Ikuti Alur Bertahap (Lanjut ke ${actualTargetStep.lineName})`;
    }
    if (btnConfirm) {
      btnConfirm.style.display = 'block';
      btnConfirm.textContent = isGroupMove 
        ? `Pindahkan Semua (${coItems.length} Padi • ${roundedMovingTonase}T)`
        : 'Selesaikan & Lanjut ke Tahap Berikutnya';
      btnConfirm.style.background = isGroupMove ? 'linear-gradient(135deg, #10b981, #059669)' : '';
    }
    if (btnQueueMix) btnQueueMix.style.display = 'none';
    if (btnBackOnly) btnBackOnly.style.display = 'none';
  } else {
    warningBox.style.display = 'none';
    normalActions.style.display = 'flex';
    skipActions.style.display = 'none';
    if (btnConfirm) {
      btnConfirm.style.display = 'block';
      if (isRecyclingFlow) {
        btnConfirm.textContent = isGroupMove 
          ? `Ulang Pengeringan (${coItems.length} Padi • ${roundedMovingTonase}T ➔ ${actualTargetStep.lineName})`
          : `Ulang Pengeringan (Masih Basah ➔ ${actualTargetStep.lineName})`;
        btnConfirm.style.background = 'linear-gradient(135deg, #d97706, #b45309)';
      } else if (item.currentStepId === 'C-giling' && actualTargetStep.id === 'D-packing') {
        btnConfirm.textContent = 'Selesaikan Giling & Langsung ke Packing (Tanpa Mix)';
        btnConfirm.style.background = 'linear-gradient(135deg, #059669, #10b981)';
      } else if (isGroupMove) {
        btnConfirm.textContent = `Pindahkan Semua (${coItems.length} Padi • ${roundedMovingTonase}T)`;
        btnConfirm.style.background = 'linear-gradient(135deg, #10b981, #059669)';
      } else {
        btnConfirm.textContent = 'Selesaikan & Lanjut ke Tahap Berikutnya';
        btnConfirm.style.background = '';
      }
    }
    if (btnQueueMix) btnQueueMix.style.display = 'none';
    if (btnBackOnly) btnBackOnly.style.display = 'none';
  }

  document.getElementById('stepConfirmModal').classList.add('open');
}

function closeStepConfirmModal() {
  document.getElementById('stepConfirmModal').classList.remove('open');
  const btnConfirm = document.getElementById('btnConfirmStep');
  const btnQueueMix = document.getElementById('btnQueueMixStep');
  const btnBackOnly = document.getElementById('btnBackOnlyStep');
  if (btnConfirm) {
    btnConfirm.style.display = 'block';
    btnConfirm.textContent = 'Selesaikan & Lanjut ke Tahap Berikutnya';
    btnConfirm.style.background = '';
  }
  if (btnQueueMix) btnQueueMix.style.display = 'none';
  if (btnBackOnly) btnBackOnly.style.display = 'none';
  pendingStepTransition = null;
  currentConfirmItemId = null;
}

function confirmQueueMix() {
  if (pendingStepTransition && pendingStepTransition.targetStepId === 'D-mix') {
    executeStepAdvance(
      pendingStepTransition.itemId,
      'D-mix',
      'Mesin Mix',
      null,
      true
    );
    closeStepConfirmModal();
  }
}
window.confirmQueueMix = confirmQueueMix;

/**
 * Update Papan Ringkasan Utilisasi Mesin (SCADA Live Unit Monitor)
 */
function updateScadaOverview() {
  const elSiloBasah = document.getElementById('metricSiloBasah');
  const elDryer = document.getElementById('metricDryer');
  const elSiloKering = document.getElementById('metricSiloKering');
  const elGiling = document.getElementById('metricGiling');

  // Silo Basah: 4 unit @ 30T = 120T max
  let occUnitsA = 0;
  let tonA = 0;
  for (let u = 1; u <= 4; u++) {
    const occ = getMachineUnitOccupancy('A-silo', `Silo Basah ${u}`);
    if (occ.count > 0) occUnitsA++;
    tonA += occ.totalTonase;
  }

  // Dryer: 5 unit @ 30T = 150T max
  let occUnitsB = 0;
  let tonB = 0;
  for (let u = 1; u <= 5; u++) {
    const occ = getMachineUnitOccupancy('B-dryer', `Dryer ${u}`);
    if (occ.count > 0) occUnitsB++;
    tonB += occ.totalTonase;
  }

  // Silo Kering: 9 unit @ 30T = 270T max
  let occUnitsC = 0;
  let tonC = 0;
  for (let u = 1; u <= 9; u++) {
    const occ = getMachineUnitOccupancy('C-silo', `Silo Kering ${u}`);
    if (occ.count > 0) occUnitsC++;
    tonC += occ.totalTonase;
  }

  const fmtTon = t => Number(t.toFixed(1));

  if (elSiloBasah) elSiloBasah.textContent = `${occUnitsA}/4 Unit (${fmtTon(tonA)}/120T)`;
  if (elDryer) elDryer.textContent = `${occUnitsB}/5 Unit (${fmtTon(tonB)}/150T)`;
  if (elSiloKering) elSiloKering.textContent = `${occUnitsC}/9 Unit (${fmtTon(tonC)}/270T)`;

  if (elGiling) {
    const activeGiling = getActiveGilingItem();
    const queuedGiling = items.filter(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
    if (activeGiling) {
      const qText = queuedGiling.length > 0 ? ` • ${queuedGiling.length} Antri` : '';
      elGiling.innerHTML = `<span style="color:#ef4444; font-weight:700;">🔴 ${activeGiling.code} (${activeGiling.gilingType || 'PK'})</span>${qText}`;
    } else {
      elGiling.innerHTML = `<span style="color:#10b981; font-weight:700;">🟢 Kosong (Standby)</span>`;
    }
  }

  const elMix = document.getElementById('metricMix');
  if (elMix) {
    const activeMix = getActiveMixItem();
    const queuedMix = items.filter(i => i.currentStepId === 'D-mix' && i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
    if (activeMix) {
      const qText = queuedMix.length > 0 ? ` • ${queuedMix.length} Antri` : '';
      elMix.innerHTML = `<span style="color:#ef4444; font-weight:700;">🔴 ${activeMix.code}</span>${qText}`;
    } else {
      elMix.innerHTML = `<span style="color:#10b981; font-weight:700;">🟢 Kosong (Standby)</span>`;
    }
  }

  const maintCount = Object.keys(machineMaintenance || {}).length;
  const maintBadge = document.getElementById('maintTopBadge');
  if (maintBadge) {
    maintBadge.textContent = maintCount;
    maintBadge.style.display = maintCount > 0 ? 'inline-flex' : 'none';
  }
}

/**
 * View Mode: Terkunci ke 'both' (Keduanya: Denah Mesin + Tabel Alur aktif bersamaan)
 */
let currentViewMode = 'both';

function setViewMode(mode = 'both') {
  currentViewMode = mode;
  try {
    localStorage.setItem('monitoring_mesin_view_mode', mode);
  } catch (e) {}

  const btnFloor = document.getElementById('viewBtnFloor');
  const btnTable = document.getElementById('viewBtnTable');
  const btnBoth = document.getElementById('viewBtnBoth');
  if (btnFloor) btnFloor.classList.toggle('active', mode === 'floor');
  if (btnTable) btnTable.classList.toggle('active', mode === 'table');
  if (btnBoth) btnBoth.classList.toggle('active', mode === 'both');

  const floorEl = document.getElementById('factoryFloorPlan');
  const tableEl = document.getElementById('tableBoardCard');
  if (floorEl) {
    floorEl.style.display = (mode === 'floor' || mode === 'both') ? 'block' : 'none';
  }
  if (tableEl) {
    tableEl.style.display = (mode === 'table' || mode === 'both') ? 'block' : 'none';
  }
}
window.setViewMode = setViewMode;

/**
 * Kontrol Tampilan Denah: Fit-to-Screen (Pas Layar) vs Scroll Mode (Mode Geser)
 */
function setFloorFitMode(mode) {
  const card = document.getElementById('factoryFloorPlan');
  const btnFit = document.getElementById('btnFitScreen');
  const btnScroll = document.getElementById('btnScrollScreen');
  if (!card) return;

  if (mode === 'scroll') {
    card.classList.remove('fit-mode');
    card.classList.add('scroll-mode');
    if (btnFit) btnFit.classList.remove('active');
    if (btnScroll) btnScroll.classList.add('active');
    try { localStorage.setItem('monitoring_mesin_floor_fit_mode', 'scroll'); } catch(e) {}
    showToast('↔️ Mode Geser aktif: Denah diperlebar dengan geser horizontal');
  } else {
    card.classList.remove('scroll-mode');
    card.classList.add('fit-mode');
    if (btnFit) btnFit.classList.add('active');
    if (btnScroll) btnScroll.classList.remove('active');
    try { localStorage.setItem('monitoring_mesin_floor_fit_mode', 'fit'); } catch(e) {}
    showToast('Pas Layar aktif: Seluruh denah muat 1 layar penuh tanpa digeser');
  }
}
window.setFloorFitMode = setFloorFitMode;

/**
 * Zoom Skala Denah Mesin
 */
let currentFloorZoom = 1.0;
function setFloorZoom(level) {
  currentFloorZoom = Math.min(Math.max(level, 0.65), 1.5);
  currentFloorZoom = Math.round(currentFloorZoom * 100) / 100;
  const canvas = document.getElementById('floorCanvas');
  const display = document.getElementById('zoomLevelDisplay');
  if (canvas) {
    if (currentFloorZoom === 1.0) {
      canvas.style.transform = '';
      canvas.style.transformOrigin = '';
      canvas.style.width = '100%';
    } else {
      canvas.style.transform = `scale(${currentFloorZoom})`;
      canvas.style.transformOrigin = 'top left';
      canvas.style.width = `${(100 / currentFloorZoom).toFixed(2)}%`;
    }
  }
  if (display) {
    display.textContent = `${Math.round(currentFloorZoom * 100)}%`;
  }
  try { localStorage.setItem('monitoring_mesin_floor_zoom', currentFloorZoom); } catch(e) {}
}
window.setFloorZoom = setFloorZoom;

function adjustFloorZoom(delta) {
  setFloorZoom(currentFloorZoom + delta);
}
window.adjustFloorZoom = adjustFloorZoom;

function resetFloorZoom() {
  setFloorZoom(1.0);
}
window.resetFloorZoom = resetFloorZoom;

/**
 * RENDER INTERACTIVE PLANT FLOOR PLAN (DENAH MESIN PABRIK SESUAI GAMBAR USER)
 * Menampilkan tata letak mesin: Silo Basah (4), Dryer (5), Silo Kering (9), Mesin Giling (1), Mix, Packing
 */
function renderFloorPlan() {
  const canvas = document.getElementById('floorCanvas');
  if (!canvas) return;

  let activeCount = 0;
  let stoppedCount = 0;
  let standbyCount = 0;

  // Helper untuk mendapatkan status sebuah mesin unit
  function getUnitState(stepId, machineUnitName) {
    const maint = getMachineMaintenanceInfo(stepId, machineUnitName);

    if (stepId === 'C-giling') {
      const activeItem = getActiveGilingItem();
      if (maint) {
        return {
          state: 'maintenance',
          item: activeItem || null,
          maint: maint,
          gilingType: activeItem ? (activeItem.gilingType || 'PK') : 'PK',
          startedAt: activeItem?.stepHistory?.['C-giling']?.startedAt,
          stoppedAt: maint.startedAt,
          stopReason: maint.reason
        };
      }
      if (activeItem) {
        return {
          state: activeItem.status === 'stopped' ? 'stopped' : 'active',
          item: activeItem,
          gilingType: activeItem.gilingType || 'PK',
          startedAt: activeItem.stepHistory?.['C-giling']?.startedAt,
          stoppedAt: activeItem.stoppedAt,
          stopReason: activeItem.stopReason
        };
      }
      return { state: 'standby', item: null };
    }

    if (stepId === 'D-mix') {
      const activeItem = getActiveMixItem();
      if (maint) {
        return {
          state: 'maintenance',
          item: activeItem || null,
          maint: maint,
          startedAt: activeItem?.stepHistory?.['D-mix']?.startedAt,
          stoppedAt: maint.startedAt,
          stopReason: maint.reason
        };
      }
      if (activeItem) {
        return {
          state: activeItem.status === 'stopped' ? 'stopped' : 'active',
          item: activeItem,
          startedAt: activeItem.stepHistory?.['D-mix']?.startedAt,
          stoppedAt: activeItem.stoppedAt,
          stopReason: activeItem.stopReason
        };
      }
      return { state: 'standby', item: null };
    }

    if (stepId === 'D-packing') {
      const item = items.find(i => i.currentStepId === 'D-packing' && (i.status === 'active' || i.status === 'stopped'));
      if (maint) {
        return {
          state: 'maintenance',
          item: item || null,
          maint: maint,
          startedAt: item?.stepHistory?.['D-packing']?.startedAt,
          stoppedAt: maint.startedAt,
          stopReason: maint.reason
        };
      }
      if (item) {
        return {
          state: item.status === 'stopped' ? 'stopped' : 'active',
          item: item,
          startedAt: item.stepHistory?.['D-packing']?.startedAt,
          stoppedAt: item.stoppedAt,
          stopReason: item.stopReason
        };
      }
      return { state: 'standby', item: null };
    }

    // Untuk A-silo, B-dryer, C-silo
    const item = items.find(i => i.currentStepId === stepId && i.assignedMachines?.[stepId] === machineUnitName && (i.status === 'active' || i.status === 'stopped'));
    if (maint) {
      return {
        state: 'maintenance',
        item: item || null,
        maint: maint,
        startedAt: item?.stepHistory?.[stepId]?.startedAt,
        stoppedAt: maint.startedAt,
        stopReason: maint.reason
      };
    }
    if (item) {
      return {
        state: item.status === 'stopped' ? 'stopped' : 'active',
        item: item,
        startedAt: item.stepHistory?.[stepId]?.startedAt,
        stoppedAt: item.stoppedAt,
        stopReason: item.stopReason
      };
    }
    return { state: 'standby', item: null };
  }

  // Render Box Mesin Biasa
  function renderMachineBoxHtml(stepId, machineName) {
    const isMultiUnitStep = (stepId === 'A-silo' || stepId === 'B-dryer' || stepId === 'C-silo');
    let cardClass = 'machine-box m-box-' + stepId.toLowerCase();
    let statusPillHtml = '';
    let bodyHtml = '';
    const shortName = stepId === 'C-silo' ? machineName.replace('Silo Kering ', 'SK ') : machineName;

    if (isMultiUnitStep) {
      const occ = getMachineUnitOccupancy(stepId, machineName);
      const maint = getMachineMaintenanceInfo(stepId, machineName);

      if (maint) {
        stoppedCount++;
        cardClass += ' has-kendala';
        statusPillHtml = `<span class="m-status-pill stopped">PERBAIKAN</span>`;

        let stoppedBatchesText = '';
        if (occ.items.length > 0) {
          stoppedBatchesText = `
            <div style="font-size: 10px; color: #fecaca; margin-top: 4px; line-height: 1.3;">
              Tertahan (${occ.totalTonase}/30T): ${occ.items.map(it => `<strong>${escapeHtml(it.code)}</strong> (${escapeHtml(it.supir || it.name || '-')})`).join(', ')}
            </div>
          `;
        }

        bodyHtml = `
          <div class="m-trouble-alert" title="${escapeHtml(maint.reason || 'Perbaikan Mesin')}">
            ⚠️ ${escapeHtml(maint.reason || 'Perbaikan Mesin')}
          </div>
          <div class="m-timer-tag" style="color:#ef4444;">Perbaikan ${calcDuration(maint.startedAt)}</div>
          ${stoppedBatchesText}
          <div class="m-quick-btn-row">
            <button class="m-btn-mini resume" onclick="event.stopPropagation(); clearMachineMaintenance('${stepId}', '${escapeHtml(machineName)}')" title="Selesaikan perbaikan">Selesai</button>
            <button class="m-btn-mini stop" onclick="event.stopPropagation(); openMaintenanceModal('${stepId}', '${escapeHtml(machineName)}')" title="Ubah alasan perbaikan">Alasan</button>
          </div>
        `;
      } else if (occ.items.length === 0) {
        standbyCount++;
        cardClass += ' is-standby';
        statusPillHtml = `<span class="m-status-pill standby">0/30T</span>`;
        bodyHtml = `
          <div class="m-cap-strip" title="Kapasitas: 0/30 Ton • Siap diisi hingga 30 Ton">
            <div class="m-cap-bar-bg"><div class="m-cap-bar-fill" style="width: 0%;"></div></div>
            <div class="m-cap-bar-text">
              <span>0/30 Ton</span>
              <span style="color:#34d399; font-weight:700;">Sisa 30T</span>
            </div>
          </div>
        `;
      } else {
        const anyStopped = occ.items.some(it => it.status === 'stopped');
        if (anyStopped) {
          stoppedCount++;
          cardClass += ' has-kendala';
          statusPillHtml = `<span class="m-status-pill stopped">⚠️ KENDALA</span>`;
        } else {
          activeCount++;
          cardClass += ' is-active';
          if (occ.isFull) {
            statusPillHtml = `<span class="m-status-pill active" style="background:rgba(239,68,68,0.22); color:#f87171; border-color:rgba(239,68,68,0.45);">🔴 30/30T</span>`;
          } else {
            statusPillHtml = `<span class="m-status-pill active"><span class="summary-dot running-dot" style="width:5px;height:5px;"></span> ${occ.totalTonase}/30T</span>`;
          }
        }

        const meterColor = occ.percent >= 100 ? '#ef4444' : (occ.percent > 70 ? '#f59e0b' : '#10b981');
        const capMeterHtml = `
          <div class="m-cap-strip" title="Terisi: ${occ.totalTonase}/30 Ton (${occ.percent}%) • Sisa ${occ.remainingCapacity} Ton">
            <div class="m-cap-bar-bg">
              <div class="m-cap-bar-fill" style="width: ${occ.percent}%; background: ${meterColor};"></div>
            </div>
            <div class="m-cap-bar-text">
              <span><strong>${occ.totalTonase}</strong>/30T (${occ.items.length} Padi)</span>
              <span style="color: ${occ.remainingCapacity > 0 ? '#34d399' : '#ef4444'}; font-weight:700;">${occ.remainingCapacity > 0 ? `Sisa ${occ.remainingCapacity}T` : 'Penuh'}</span>
            </div>
          </div>
        `;

        const batchChipsHtml = `
          <div class="m-batches-stack">
            ${occ.items.map(it => {
              const itDuration = it.stepHistory?.[stepId]?.startedAt ? calcDuration(it.stepHistory[stepId].startedAt) : '-';
              const isItStopped = it.status === 'stopped';
              const ownerName = escapeHtml(it.supir || it.name || 'Padi');
              const codeText = escapeHtml(it.code);
              const tonText = `${it.tonase || 10}T`;

              let miniBtns = '';
              if (isItStopped) {
                miniBtns = `
                  <button class="m-btn-mini resume" onclick="event.stopPropagation(); resumeMachine('${it.id}')" title="Resume batch ${codeText}">Resume</button>
                  <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${it.id}')" title="Ubah kendala">Alasan</button>
                `;
              } else {
                miniBtns = `
                  <button class="m-btn-mini advance" onclick="event.stopPropagation(); advanceOneStep('${it.id}')" title="Lanjut ke langkah berikutnya">Lanjut</button>
                  <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${it.id}')" title="Hentikan batch ${codeText}">Stop</button>
                `;
              }

              return `
                <div class="m-unit-batch-chip ${isItStopped ? 'is-stopped' : 'is-running'}" onclick="event.stopPropagation(); openDetailModal('${it.id}')" title="Atas nama: ${ownerName} (${codeText} - ${tonText}). Klik untuk detail riwayat.">
                  <div class="m-chip-row-top">
                    <span class="m-chip-code">${codeText}</span>
                    <span class="m-chip-owner" title="Atas nama: ${ownerName}">${ownerName}</span>
                    <span class="m-chip-ton">${tonText}</span>
                  </div>
                  <div class="m-chip-row-bot">
                    <span class="m-chip-timer" style="${isItStopped ? 'color:#ef4444; font-weight:700;' : ''}">
                      ${isItStopped ? '⚠️ Stop: ' + escapeHtml(it.stopReason || 'Kendala') : itDuration}
                    </span>
                    <div class="m-chip-actions" onclick="event.stopPropagation();">
                      ${miniBtns}
                    </div>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        `;
        bodyHtml = capMeterHtml + batchChipsHtml;
      }
    } else {
      // Untuk single process: D-packing (atau fallback getUnitState)
      const info = getUnitState(stepId, machineName);
      if (info.state === 'stopped' || info.state === 'maintenance') {
        stoppedCount++;
        cardClass += ' has-kendala';
        const pillLabel = info.state === 'maintenance' ? 'PERBAIKAN' : 'KENDALA';
        statusPillHtml = `<span class="m-status-pill stopped">${pillLabel}</span>`;
        const titleText = info.item 
          ? `<strong>${escapeHtml(info.item.code)}</strong>`
          : `<strong style="color:#ef4444; font-size:10.5px;">PERBAIKAN</strong>`;
        const timerLabel = info.state === 'maintenance' ? 'Perbaikan' : 'Terhenti';
        let quickBtns = info.state === 'maintenance' ? `
          <button class="m-btn-mini resume" onclick="event.stopPropagation(); clearMachineMaintenance('${stepId}', '${escapeHtml(machineName)}')" title="Selesaikan perbaikan mesin ini">Selesai</button>
          <button class="m-btn-mini stop" onclick="event.stopPropagation(); openMaintenanceModal('${stepId}', '${escapeHtml(machineName)}')" title="Lihat atau ubah catatan perbaikan">Alasan</button>
        ` : `
          <button class="m-btn-mini resume" onclick="event.stopPropagation(); resumeMachine('${info.item.id}')" title="Nyalakan kembali mesin">Resume</button>
          <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${info.item.id}')" title="Ubah penjelasan kendala">Alasan</button>
        `;
        bodyHtml = `
          <div class="m-batch-highlight">${titleText}</div>
          <div class="m-trouble-alert" title="${escapeHtml(info.stopReason || 'Perbaikan Mesin')}">${escapeHtml(info.stopReason || 'Perbaikan Mesin')}</div>
          <div class="m-timer-tag" style="color:#ef4444;">${timerLabel} ${calcDuration(info.stoppedAt)}</div>
          <div class="m-quick-btn-row">${quickBtns}</div>
        `;
      } else if (info.state === 'active') {
        activeCount++;
        cardClass += ' is-active';
        statusPillHtml = `<span class="m-status-pill active"><span class="summary-dot running-dot" style="width:5px;height:5px;"></span> Aktif</span>`;
        bodyHtml = `
          <div class="m-batch-highlight">
            <strong>${escapeHtml(info.item.code)}</strong>
            <span style="font-size: 10.5px; opacity: 0.85;">(${info.item.tonase || 10}T)</span>
          </div>
          <div class="m-batch-sub" title="${escapeHtml(info.item.name)}">${escapeHtml(info.item.name)}</div>
          <div class="m-timer-tag">Jalan ${calcDuration(info.startedAt)}</div>
          <div class="m-quick-btn-row">
            <button class="m-btn-mini advance" onclick="event.stopPropagation(); advanceOneStep('${info.item.id}')" title="Lanjut ke langkah berikutnya">Lanjut</button>
            <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${info.item.id}')" title="Hentikan mesin jika ada kendala">Stop</button>
          </div>
        `;
      } else {
        standbyCount++;
        cardClass += ' is-standby';
        statusPillHtml = `<span class="m-status-pill standby">Standby</span>`;
        bodyHtml = '';
      }
    }

    let mixQueueHtml = '';
    if (stepId === 'D-mix') {
      const queuedMix = items.filter(i => i.currentStepId === 'D-mix' && i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
      if (queuedMix.length > 0) {
        mixQueueHtml = `
          <div class="giling-queue-box" style="margin-top: 6px; padding: 4px 6px;">
            <div class="giling-queue-title" style="font-size: 9.5px;">Antrian Mix (${queuedMix.length} Menunggu):</div>
            <div class="giling-queue-chips">
              ${queuedMix.map(q => `<span class="queue-chip-tag" title="${escapeHtml(q.name)}">${escapeHtml(q.code)}</span>`).join('')}
            </div>
          </div>
        `;
      }
    }

    return `
      <div class="${cardClass}" onclick="openMachineModal('${stepId}', '${escapeHtml(machineName)}')" title="Klik untuk lihat detail mesin & isi muatan (${escapeHtml(machineName)})">
        <div class="m-head">
          <div class="m-title-area">
            <span class="m-name" title="${escapeHtml(machineName)}">
              <span class="name-full">${escapeHtml(machineName)}</span>
              <span class="name-abbr">${escapeHtml(shortName)}</span>
            </span>
          </div>
          ${statusPillHtml}
        </div>
        ${(bodyHtml || mixQueueHtml) ? `<div class="m-body">${bodyHtml}${mixQueueHtml}</div>` : ''}
      </div>
    `;
  }

  // 1. Zone A: Silo Basah (4 Unit)
  let zoneAHtml = '';
  for (let u = 1; u <= 4; u++) {
    zoneAHtml += renderMachineBoxHtml('A-silo', `Silo Basah ${u}`);
  }

  // 2. Zone B: Dryer (5 Unit)
  let zoneBHtml = '';
  for (let u = 1; u <= 5; u++) {
    zoneBHtml += renderMachineBoxHtml('B-dryer', `Dryer ${u}`);
  }

  // 3. Zone C - Silo Kering (9 Unit: Grid 3x3)
  let siloKeringHtml = '';
  for (let u = 1; u <= 9; u++) {
    siloKeringHtml += renderMachineBoxHtml('C-silo', `Silo Kering ${u}`);
  }

  // 4. Zone C - Mesin Giling (1 Unit Prominen)
  const gilingState = getUnitState('C-giling', 'Mesin Giling 1');
  const queuedGiling = items.filter(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));

  let gilingCardClass = 'giling-large-card';
  let gilingPillHtml = '';
  let gilingCycleHtml = '';
  let gilingBodyHtml = '';

  if (gilingState.state === 'stopped' || gilingState.state === 'maintenance') {
    stoppedCount++;
    gilingCardClass += ' has-kendala';
    const gilingPill = gilingState.state === 'maintenance' ? 'PERBAIKAN' : 'KENDALA';
    gilingPillHtml = `<span class="m-status-pill stopped">${gilingPill}</span>`;
    
    const cycleLabel = gilingState.state === 'maintenance' ? 'DALAM PERBAIKAN' : `TERHENTI (${escapeHtml(gilingState.gilingType || 'PK')})`;
    gilingCycleHtml = `
      <div class="giling-cycle-badge stopped">
        <span class="summary-dot stopped-dot" style="width:6px;height:6px;"></span>
        <span>${cycleLabel}</span>
      </div>
    `;

    const gilingTitle = gilingState.item 
      ? `<strong>${escapeHtml(gilingState.item.code)} - ${escapeHtml(gilingState.item.name)}</strong>`
      : `<strong style="color:#ef4444; font-size:13px;">MESIN GILING SEDANG PERBAIKAN</strong>`;

    let quickBtnsGiling = '';
    if (gilingState.state === 'maintenance') {
      quickBtnsGiling = `
        <button class="m-btn-mini resume" onclick="event.stopPropagation(); clearMachineMaintenance('C-giling', 'Mesin Giling 1')">Selesai</button>
        <button class="m-btn-mini stop" onclick="event.stopPropagation(); openMaintenanceModal('C-giling', 'Mesin Giling 1')">Alasan</button>
      `;
    } else {
      quickBtnsGiling = `
        <button class="m-btn-mini resume" onclick="event.stopPropagation(); resumeMachine('${gilingState.item.id}')">Resume</button>
        <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${gilingState.item.id}')">Alasan</button>
      `;
    }

    gilingBodyHtml = `
      <div class="m-batch-highlight">
        ${gilingTitle}
      </div>
      <div class="m-trouble-alert" style="margin-top:6px;">${escapeHtml(gilingState.stopReason || 'Perbaikan Mesin Giling')}</div>
      <div class="m-timer-tag" style="color:#ef4444;">Perbaikan ${calcDuration(gilingState.stoppedAt)}</div>
      <div class="m-quick-btn-row">
        ${quickBtnsGiling}
      </div>
    `;
  } else if (gilingState.state === 'active') {
    activeCount++;
    gilingCardClass += ' is-active';
    gilingPillHtml = `<span class="m-status-pill active"><span class="summary-dot running-dot" style="width:5px;height:5px;"></span> Aktif</span>`;
    const typeLabel = gilingState.gilingType === 'Glosor' ? 'Glosor (Blosor)' : 'PK (Pecah Kulit)';
    gilingCycleHtml = `
      <div class="giling-cycle-badge">
        <span class="summary-dot running-dot" style="width:6px;height:6px;"></span>
        <span>Sedang Menggiling</span>
      </div>
      <div style="font-size: 11px; font-weight: 800; color: #2563eb; text-align: center;">Hasil: ${typeLabel}</div>
    `;
    gilingBodyHtml = `
      <div class="m-batch-highlight">
        <strong>${escapeHtml(gilingState.item.code)}</strong>
        <span style="font-size: 10px; opacity: 0.85;">(${gilingState.item.tonase || 10} Ton)</span>
      </div>
      <div class="m-batch-sub">${escapeHtml(gilingState.item.name)}</div>
      <div class="m-timer-tag">Giling ${calcDuration(gilingState.startedAt)}</div>
      <div class="m-quick-btn-row">
        <button class="m-btn-mini advance" onclick="event.stopPropagation(); advanceOneStep('${gilingState.item.id}')">Lanjut ke Mix</button>
        <button class="m-btn-mini stop" onclick="event.stopPropagation(); openStopModal('${gilingState.item.id}')">Stop</button>
      </div>
    `;
  } else {
    standbyCount++;
    gilingPillHtml = `<span class="m-status-pill standby">Standby</span>`;
    gilingCycleHtml = '';
    gilingBodyHtml = '';
  }

  let queueBoxHtml = '';
  if (queuedGiling.length > 0) {
    queueBoxHtml = `
      <div class="giling-queue-box">
        <div class="giling-queue-title">Antrian Giling (${queuedGiling.length} Menunggu):</div>
        <div class="giling-queue-chips">
          ${queuedGiling.map(q => `<span class="queue-chip-tag" title="${escapeHtml(q.name)}">${escapeHtml(q.code)} (${escapeHtml(q.gilingType || 'PK')})</span>`).join('')}
        </div>
      </div>
    `;
  }

  // 5. Zone D: Mix & Packing
  const mixBoxHtml = renderMachineBoxHtml('D-mix', 'Mesin Mix');
  const packingBoxHtml = renderMachineBoxHtml('D-packing', 'Mesin Packing');

  // 6. Selesai: Gudang & Mobil
  const gudangBatches = items.filter(i => i.status === 'completed' && i.selesaiLokasi !== 'Mobil');
  const mobilBatches = items.filter(i => i.status === 'completed' && i.selesaiLokasi === 'Mobil');

  // Rakit seluruh HTML Canvas
  canvas.innerHTML = `
    <!-- Zone A: Silo Basah (4 Unit) -->
    <div class="plant-zone zone-a">
      <div class="zone-header">
        <span class="zone-badge zone-badge-a">A</span>
        <span class="zone-title">Silo Basah</span>
        <span class="zone-count">4 Unit</span>
      </div>
      <div class="zone-machines-stack">
        ${zoneAHtml}
      </div>
    </div>

    <!-- Arrow A -> B -->
    <div class="flow-connector">
      <div class="flow-arrow-pill" title="Alur menuju Dryer">➔</div>
    </div>

    <!-- Zone B: Dryer (5 Unit) -->
    <div class="plant-zone zone-b">
      <div class="zone-header">
        <span class="zone-badge zone-badge-b">B</span>
        <span class="zone-title">Dryer</span>
        <span class="zone-count">5 Unit</span>
      </div>
      <div class="zone-machines-stack">
        ${zoneBHtml}
      </div>
    </div>

    <!-- Arrow B -> C -->
    <div class="flow-connector">
      <div class="flow-arrow-pill" title="Alur menuju Silo Kering">➔</div>
    </div>

    <!-- Zone C: Silo Kering (9 Unit: 3x3) & Proses Giling (1 Unit) -->
    <div class="plant-zone zone-c">
      <div class="zone-header">
        <span class="zone-badge zone-badge-c">C</span>
        <span class="zone-title">Silo Kering &amp; Giling</span>
        <span class="zone-count">9 Silo • 1 Giling</span>
      </div>
      <div class="zone-c-body">
        <!-- Silo Kering 9 Unit (Grid 3x3) -->
        <div class="silo-kering-section">
          <div class="silo-kering-grid-3x3" title="Silo Kering 1 s/d 9 (Grid 3x3)">
            ${siloKeringHtml}
          </div>
        </div>

        <!-- Internal Arrow Silo Kering -> Giling -->
        <div class="flow-connector">
          <div class="flow-arrow-pill" style="width:22px;height:22px;font-size:11px;" title="Menuju Mesin Giling">➔</div>
        </div>

        <!-- Proses Giling 1 Unit -->
        <div class="giling-pillar">
          <div class="${gilingCardClass}" onclick="openMachineModal('C-giling', 'Mesin Giling')" title="Klik untuk lihat detail Mesin Giling">
            <div class="m-head">
              <div class="m-title-area">
                <span class="m-name">Mesin Giling</span>
              </div>
              ${gilingPillHtml}
            </div>
            ${gilingCycleHtml}
            ${gilingBodyHtml ? `<div class="m-body">${gilingBodyHtml}</div>` : ''}
            ${queueBoxHtml}
          </div>
        </div>
      </div>
    </div>

    <!-- Arrow C -> D -->
    <div class="flow-connector">
      <div class="flow-arrow-pill" title="Alur menuju Mix & Packing">➔</div>
    </div>

    <!-- Zone D: Mix -> Down Arrow -> Packing -->
    <div class="plant-zone zone-d">
      <div class="zone-header">
        <span class="zone-badge zone-badge-d">D</span>
        <span class="zone-title">Mix &amp; Packing</span>
        <span class="zone-count">2 Proses</span>
      </div>
      <div class="zone-d-body">
        <div class="silo-kering-label">Proses 1: Mix</div>
        ${mixBoxHtml}

        <div class="zone-vertical-arrow-box" title="Dari Mix berlanjut ke Packing">
          ↓
        </div>

        <div class="silo-kering-label">Proses 2: Packing</div>
        ${packingBoxHtml}
      </div>
    </div>

    <!-- Arrow D -> Finish -->
    <div class="flow-connector">
      <div class="flow-arrow-pill" title="Alur barang selesai">➔</div>
    </div>

    <!-- Zone Finish: Selesai (Gudang & Mobil) -->
    <div class="plant-zone zone-finish">
      <div class="zone-header">
        <span class="zone-badge finish">E</span>
        <span class="zone-title">Selesai</span>
        <span class="zone-count">${gudangBatches.length + mobilBatches.length} Selesai</span>
      </div>
      <div class="finish-body">
        <div class="finish-card gudang">
          <div class="finish-card-title">
            <span>Di Gudang</span>
          </div>
          <div class="finish-card-count">${gudangBatches.length} <span style="font-size:12px;font-weight:normal;">Lot</span></div>
          <div class="finish-card-sub">${gudangBatches.map(b => b.code).join(', ') || 'Belum ada'}</div>
        </div>

        <div class="finish-card mobil">
          <div class="finish-card-title">
            <span>Di Mobil</span>
          </div>
          <div class="finish-card-count">${mobilBatches.length} <span style="font-size:12px;font-weight:normal;">Lot</span></div>
          <div class="finish-card-sub">${mobilBatches.map(b => b.code).join(', ') || 'Belum ada'}</div>
        </div>
      </div>
    </div>
  `;

  // Update summary badge counts
  const elRunning = document.getElementById('countRunning');
  const elStopped = document.getElementById('countStopped');
  const elStandby = document.getElementById('countStandby');
  if (elRunning) elRunning.textContent = activeCount;
  if (elStopped) elStopped.textContent = stoppedCount;
  if (elStandby) elStandby.textContent = standbyCount;
}

/**
 * Dapatkan daftar batch padi yang siap dimasukkan ke mesin tertentu:
 * 1. Padi yang berstatus STANDBY (belum ada di mesin mana pun)
 * 2. Padi dari tahap sebelumnya yang siap dipindahkan ke mesin ini
 */
function getEligibleItemsForMachine(stepId, machineName) {
  const result = [];

  // 1. Barang yang berstatus Standby
  items.filter(i => (i.status === 'standby' || !i.currentStepId) && i.status !== 'completed').forEach(it => {
    result.push({
      item: it,
      coItems: [it],
      isGroup: false,
      totalTonase: Math.round((parseFloat(it.tonase) || 10) * 10) / 10,
      type: 'standby',
      label: 'STANDBY'
    });
  });

  // 2. Barang dari tahap sebelumnya yang sedang aktif / stopped untuk dipindahkan ke mesin ini
  const prevStepMap = {
    'B-dryer': 'A-silo',
    'C-silo': 'B-dryer',
    'C-giling': 'C-silo',
    'D-mix': 'C-giling',
    'D-packing': 'D-mix'
  };
  const prevStepId = prevStepMap[stepId];
  if (prevStepId) {
    const isPrevMultiCap = (prevStepId === 'A-silo' || prevStepId === 'B-dryer' || prevStepId === 'C-silo');
    
    if (isPrevMultiCap) {
      // Kelompokkan per unit mesin fisik asal agar muatan satu unit tampil sebagai 1 kesatuan (wajib pindah bersamaan)
      const processedUnits = new Set();
      const prevItems = items.filter(i => i.currentStepId === prevStepId && (i.status === 'active' || i.status === 'stopped'));

      prevItems.forEach(it => {
        const prevUnit = it.assignedMachines?.[prevStepId] || 'Unit';
        if (processedUnits.has(prevUnit)) return;
        processedUnits.add(prevUnit);

        const groupItems = prevItems.filter(i => (i.assignedMachines?.[prevStepId] || 'Unit') === prevUnit);
        const groupTonase = groupItems.reduce((acc, i) => acc + (parseFloat(i.tonase) || 0), 0);
        const roundedGroupTonase = Math.round(groupTonase * 10) / 10;

        result.push({
          item: it,
          coItems: groupItems,
          isGroup: groupItems.length > 1,
          totalTonase: roundedGroupTonase,
          type: 'transfer',
          label: `Dari ${prevUnit}`
        });
      });
    } else {
      items.filter(i => i.currentStepId === prevStepId && (i.status === 'active' || i.status === 'stopped')).forEach(it => {
        const prevMachine = it.assignedMachines?.[prevStepId] || prevStepId;
        result.push({
          item: it,
          coItems: [it],
          isGroup: false,
          totalTonase: Math.round((parseFloat(it.tonase) || 10) * 10) / 10,
          type: 'transfer',
          label: `Dari ${prevMachine}`
        });
      });
    }
  }

  // Khusus D-packing: Bisa langsung dari C-giling (tanpa lewat mix)
  if (stepId === 'D-packing') {
    items.filter(i => i.currentStepId === 'C-giling' && (i.status === 'active' || i.status === 'stopped')).forEach(it => {
      if (!result.some(r => r.item.id === it.id)) {
        result.push({
          item: it,
          coItems: [it],
          isGroup: false,
          totalTonase: Math.round((parseFloat(it.tonase) || 10) * 10) / 10,
          type: 'transfer',
          label: 'Dari Mesin Giling'
        });
      }
    });
  }

  // 3. Alur Pengulangan (Gabah Masih Basah): Jika membuka Dryer atau Silo Basah, muatan Silo Kering (C-silo) yang masih basah dapat dialirkan ke sini
  if (stepId === 'B-dryer' || stepId === 'A-silo') {
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
window.getEligibleItemsForMachine = getEligibleItemsForMachine;

/**
 * Masukkan Padi yang Sudah Ada (Standby / Pindahan) Langsung ke Mesin Tertentu (1-Klik Tanpa Ketik Data)
 */
function assignExistingItemToMachine(itemId, targetStepId, selectedMachine, gilingType = null) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (isMachineUnderMaintenance(targetStepId, selectedMachine)) {
    const maint = getMachineMaintenanceInfo(targetStepId, selectedMachine);
    showToast(`⛔ Mesin ${selectedMachine} sedang dalam perbaikan (${maint?.reason || 'Kendala'})!`);
    return;
  }

  // Wajib ambil seluruh muatan padi yang berada dalam satu unit mesin fisik (Silo Basah, Dryer, Silo Kering)
  // Aturan pabrik: muatan satu unit wajib dialirkan bersamaan ke unit tujuan yang sama dan tidak dapat dipisah
  const coItems = getCoLocatedItems(item);
  const coItemIds = coItems.map(it => it.id);
  const totalGroupTonase = coItems.reduce((acc, it) => acc + (parseFloat(it.tonase) || 0), 0);
  const roundedGroupTonase = Math.round(totalGroupTonase * 10) / 10;

  const isMultiCap = (targetStepId === 'A-silo' || targetStepId === 'B-dryer' || targetStepId === 'C-silo');

  if (isMultiCap) {
    const occ = getMachineUnitOccupancy(targetStepId, selectedMachine, coItemIds);
    if (occ.totalTonase + roundedGroupTonase > UNIT_MAX_CAPACITY) {
      const extraMsg = coItems.length > 1 ? ` (Total ${coItems.length} padi dalam satu unit asal: ${roundedGroupTonase} Ton)` : '';
      showToast(`⛔ ${selectedMachine} melebihi batas kapasitas 30 Ton! (Saat ini: ${occ.totalTonase}T + butuh ${roundedGroupTonase}T${extraMsg} = ${Math.round((occ.totalTonase + roundedGroupTonase)*10)/10} Ton).`);
      return;
    }
  }

  const isGilingBusyInitially = (targetStepId === 'C-giling') ? isGilingMachineBusy(item.id) : false;
  const isMixBusyInitially = (targetStepId === 'D-mix') ? isMixMachineBusy(item.id) : false;

  const nowIso = new Date().toISOString();
  const oldStepId = item.currentStepId;
  const oldMachine = item.assignedMachines?.[oldStepId] || oldStepId;
  const targetIdx = getSubstepIndex(targetStepId);
  const isRecyclingFlow = (oldStepId === 'C-silo' && (targetStepId === 'B-dryer' || targetStepId === 'A-silo'));

  // Proses seluruh barang dalam grup secara bersamaan ke target mesin yang sama
  coItems.forEach((currItem, idxInGroup) => {
    const itOldStepId = currItem.currentStepId;
    if (!currItem.stepHistory) currItem.stepHistory = {};
    if (!currItem.assignedMachines) currItem.assignedMachines = {};

    if (!currItem.masukAt) {
      currItem.masukAt = nowIso;
    }

    // Selesaikan step lama jika sebelumnya ada di step lain
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

      // Reset status passed untuk tahap target dan tahap sesudahnya agar alur berjalan kembali
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
      // Tandai step sebelum target sebagai passed
      SUBSTEPS.forEach((step, idx) => {
        if (!currItem.stepHistory[step.id]) {
          currItem.stepHistory[step.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
        }
        if (idx < targetIdx) {
          currItem.stepHistory[step.id].passed = true;
          if (!currItem.stepHistory[step.id].startedAt) currItem.stepHistory[step.id].startedAt = nowIso;
          if (!currItem.stepHistory[step.id].completedAt) currItem.stepHistory[step.id].completedAt = nowIso;
        }
      });
    }

    // Set di step target
    currItem.currentStepId = targetStepId;
    currItem.status = 'active';
    currItem.assignedMachines[targetStepId] = selectedMachine;
    if (!currItem.stepHistory[targetStepId]) {
      currItem.stepHistory[targetStepId] = { startedAt: null, completedAt: null, passed: false, stops: [] };
    }
    currItem.stepHistory[targetStepId].machine = selectedMachine;
    currItem.stepHistory[targetStepId].completedAt = null;
    currItem.stepHistory[targetStepId].passed = false;
    currItem.stoppedAt = null;
    currItem.stopReason = '';

    if (targetStepId === 'C-giling') {
      currItem.gilingType = gilingType || currItem.gilingType || 'PK';
      currItem.stepHistory['C-giling'].gilingType = currItem.gilingType;
      const mustQueue = isGilingBusyInitially || idxInGroup > 0;
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
    }

    if (targetStepId === 'D-mix') {
      const mustQueueMix = isMixBusyInitially || idxInGroup > 0;
      currItem.isQueuedForMix = mustQueueMix;
      if (mustQueueMix) {
        currItem.stepHistory['D-mix'].startedAt = null;
        currItem.stepHistory['D-mix'].queuedAt = nowIso;
      } else {
        currItem.stepHistory['D-mix'].startedAt = nowIso;
        currItem.stepHistory['D-mix'].queuedAt = null;
      }
    } else {
      currItem.isQueuedForMix = false;
      if (targetStepId !== 'C-giling' && !isRecyclingFlow) {
        currItem.stepHistory[targetStepId].startedAt = nowIso;
      }
    }

    // Catat ke log perjalanan kronologis alur mesin
    recordJourneyStep(
      currItem, 
      targetStepId, 
      selectedMachine, 
      isRecyclingFlow, 
      isRecyclingFlow ? 'Gabah Masih Basah' : '', 
      targetStepId === 'C-giling' ? currItem.gilingType : null
    );
  });

  // Jika item sebelumnya meninggalkan C-giling atau D-mix, bangunkan antrean berikutnya!
  if (oldStepId === 'C-giling') {
    promoteNextGilingQueue();
  }
  if (oldStepId === 'D-mix') {
    promoteNextMixQueue();
  }

  saveData();
  renderTable();

  if (isRecyclingFlow) {
    const unitLabel = coItems.length > 1 ? `Muatan ${coItems.length} padi dari ${oldMachine}` : `${item.code} (${oldMachine})`;
    showToast(`⚠️ Alur Pengulangan: ${unitLabel} (${roundedGroupTonase} Ton) berhasil dialirkan kembali ke ${selectedMachine} untuk pengeringan ulang (gabah masih basah)!`);
  } else if (coItems.length > 1) {
    showToast(`Muatan ${coItems.length} padi dari ${oldMachine} (Total ${roundedGroupTonase} Ton) berhasil dimasukkan bersamaan ke ${selectedMachine}!`);
  } else {
    const supirName = item.supir || item.name || 'Padi';
    const itemTon = parseFloat(item.tonase) || 10;
    if (targetStepId === 'C-giling' && item.isQueuedForGiling) {
      showToast(`${item.code} (${supirName} - ${itemTon}T) masuk antrian Mesin Giling (${item.gilingType}). Otomatis aktif saat mesin selesai memproses.`);
    } else if (targetStepId === 'D-mix' && item.isQueuedForMix) {
      showToast(`${item.code} (${supirName} - ${itemTon}T) masuk antrian Mesin Mix. Otomatis aktif saat mesin mix selesai.`);
    } else {
      showToast(`${item.code} (${supirName} - ${itemTon}T) berhasil dimasukkan ke ${selectedMachine}!`);
    }
  }

  // Buka ulang modal mesin agar isi muatan & kapasitas terbaru langsung terlihat
  openMachineModal(targetStepId, selectedMachine);
}
window.assignExistingItemToMachine = assignExistingItemToMachine;

/**
 * MODAL DETAIL & KONTROL MESIN
 * Dibuka saat salah satu kotak mesin pada denah visual diklik
 */
function openMachineModal(stepId, machineName) {
  const modal = document.getElementById('machineDetailModal');
  const titleEl = document.getElementById('machineModalTitle');
  const contentEl = document.getElementById('machineModalContent');
  if (!modal || !contentEl) return;

  const step = getSubstep(stepId);
  const stepName = step ? step.stageName : 'Mesin';
  titleEl.textContent = `${machineName} • ${stepName}`;

  // Cek apakah mesin ini sedang dalam status perbaikan (maintenance)
  const maintInfo = getMachineMaintenanceInfo(stepId, machineName);

  let html = '';

  // 1. JIKA MESIN SEDANG DALAM PERBAIKAN:
  if (maintInfo) {
    let trappedBatches = '';
    if (stepId === 'A-silo' || stepId === 'B-dryer' || stepId === 'C-silo') {
      const occ = getMachineUnitOccupancy(stepId, machineName);
      if (occ.items.length > 0) {
        trappedBatches = `
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(239,68,68,0.3); font-size: 12px; color: #fecaca;">
            Batch tertahan (${occ.totalTonase}/30 Ton): ${occ.items.map(it => `<strong>${escapeHtml(it.code)}</strong> (${escapeHtml(it.supir || it.name || '-')})`).join(', ')}
          </div>
        `;
      }
    } else {
      const it = (stepId === 'C-giling') ? getActiveGilingItem() : items.find(i => i.currentStepId === stepId && (i.status === 'active' || i.status === 'stopped'));
      if (it) {
        trappedBatches = `
          <div style="margin-top: 10px; padding-top: 8px; border-top: 1px dashed rgba(239,68,68,0.3); font-size: 12px; color: #fecaca;">
            Batch tertahan: <strong>${escapeHtml(it.code)}</strong> (${escapeHtml(it.name)})
          </div>
        `;
      }
    }

    html += `
      <div style="background: rgba(239, 68, 68, 0.15); border: 1.5px solid rgba(239, 68, 68, 0.45); border-radius: 12px; padding: 14px; margin-bottom: 16px;">
        <div style="display: flex; align-items: center; justify-content: space-between; color: #f87171; font-weight: 800; font-size: 13.5px; margin-bottom: 6px;">
          <span>MESIN SEDANG DALAM PERBAIKAN</span>
          <span class="m-status-pill stopped" style="font-size: 9.5px; padding: 2px 7px;">PERBAIKAN</span>
        </div>
        <div style="font-size: 13px; color: #ffffff; margin-bottom: 4px;">
          <strong>Kendala / Tindakan:</strong> <span style="color: #fca5a5;">${escapeHtml(maintInfo.reason || 'Perbaikan Mesin')}</span>
        </div>
        <div style="font-size: 12px; color: #94a3b8;">
          Mulai perbaikan: <strong>${formatDateTimeShort(maintInfo.startedAt)}</strong> (${calcDuration(maintInfo.startedAt)})
        </div>
        ${trappedBatches}
      </div>

      <div style="display: flex; flex-direction: column; gap: 8px;">
        <button class="btn btn-add" style="background: #10b981; border: none; width: 100%; justify-content: center; font-weight: 700; padding: 11px;" onclick="clearMachineMaintenance('${stepId}', '${escapeHtml(machineName)}'); closeMachineModal();">
          🟢 Selesai Perbaikan (Kembali Siap / Standby)
        </button>
        <button class="btn btn-outline" style="width: 100%; justify-content: center;" onclick="openMaintenanceModal('${stepId}', '${escapeHtml(machineName)}'); closeMachineModal();">
          Ubah Catatan Perbaikan
        </button>
        <button class="btn btn-subtle" style="width: 100%; justify-content: center;" onclick="closeMachineModal();">
          Tutup
        </button>
      </div>
    `;

    contentEl.innerHTML = html;
    modal.classList.add('open');
    return;
  }

  // 2. PILIHAN TINDAKAN UTAMA: (A) Masukkan Barang (Standby / Input Baru), (B) Mesin Dalam Kendala
  const isMultiCap = (stepId === 'A-silo' || stepId === 'B-dryer' || stepId === 'C-silo');
  let occ = null;
  let canInput = true;
  let inputSubtext = '';
  let inputTitle = `Masukkan Barang ke ${escapeHtml(machineName)}`;

  if (isMultiCap) {
    occ = getMachineUnitOccupancy(stepId, machineName);
    if (occ.remainingCapacity <= 0) {
      canInput = false;
      inputTitle = `Unit Penuh (30/30 Ton)`;
      inputSubtext = `Kapasitas 30 Ton sudah penuh. Pindahkan muatan dulu sebelum mengisi barang baru.`;
    } else {
      inputSubtext = `Input padi/gabah baru langsung ke unit ini • Tersedia <strong>${occ.remainingCapacity} Ton</strong>`;
    }
  } else if (stepId === 'C-giling') {
    const activeGiling = getActiveGilingItem();
    if (activeGiling) {
      inputSubtext = `Mesin sedang aktif (${activeGiling.code}). Padi baru akan masuk antrian giling.`;
    } else {
      inputSubtext = `Input padi baru langsung ke Mesin Giling (Mulai proses giling PK / Glosor)`;
    }
  } else {
    inputSubtext = `Input barang masuk langsung ke tahap ${escapeHtml(machineName)}`;
  }

  // Dapatkan daftar padi yang sudah ada (Standby atau pindahan tahap sebelumnya)
  const eligibleItems = canInput ? getEligibleItemsForMachine(stepId, machineName) : [];

  let inputActionContentHtml = '';

  if (!canInput) {
    inputActionContentHtml = `
      <div style="background: rgba(239, 68, 68, 0.12); border: 1.5px solid rgba(239, 68, 68, 0.35); border-radius: 12px; padding: 12px 14px; font-size: 12px; color: #fca5a5; display: flex; align-items: center; gap: 10px;">
        <span style="font-size: 20px;">⛔</span>
        <div>
          <strong style="color: #f87171; font-size: 12.5px;">Unit Mesin Penuh (30/30 Ton)</strong>
          <div style="color: #cbd5e1; font-size: 11px; margin-top: 2px;">Muatan harus dipindahkan ke tahap berikutnya sebelum dapat menerima padi baru.</div>
        </div>
      </div>
    `;
  } else if (eligibleItems.length > 0) {
    inputActionContentHtml = `
      <!-- Pilihan A: Pilih dari Padi yang Sudah Ada (Standby / Antrian) -->
      <div class="standby-picker-box">
        <div class="standby-picker-header">
          <div style="display:flex; align-items:center; gap: 6px;">
            
            <strong style="color: #34d399; font-size: 12px;">PILIH PADI STANDBY / SUDAH ADA (${eligibleItems.length}):</strong>
          </div>
          <span style="font-size: 10.5px; color: var(--text-lavender);">1-Klik Masuk • Tanpa Ketik Ulang</span>
        </div>

        <div class="standby-picker-list">
          ${eligibleItems.map(elig => {
            const it = elig.item;
            const isGroup = elig.isGroup;
            const coCount = elig.coItems ? elig.coItems.length : 1;
            const itTon = elig.totalTonase || (parseFloat(it.tonase) || 10);
            let fits = true;
            let warningText = '';
            if (isMultiCap && occ) {
              if (occ.totalTonase + itTon > 30.0) {
                fits = false;
                warningText = `Tidak Muat (+${itTon}T > Sisa ${occ.remainingCapacity}T)`;
              }
            }

            let codeDisplay = '';
            let ownerDisplay = '';
            let subDisplay = '';
            const badgeLabel = elig.type === 'standby' ? 'STANDBY' : (elig.type === 'recycle' ? '⚠️ MASIH BASAH' : elig.label);
            const tagClass = elig.type === 'standby' ? 'tag-standby' : (elig.type === 'recycle' ? 'tag-recycle' : 'tag-transfer');

            if (isGroup) {
              const codes = elig.coItems.map(c => c.code).join(', ');
              const owners = elig.coItems.map(c => c.supir || c.name || '-').join(' + ');
              codeDisplay = `${coCount} Padi Bersamaan (${escapeHtml(codes)})`;
              ownerDisplay = `${escapeHtml(owners)}`;
              subDisplay = `Muatan 1 unit wajib pindah bersamaan (${elig.coItems.map(c => `${c.code}: ${c.tonase || 0}T`).join(' + ')})`;
            } else {
              codeDisplay = escapeHtml(it.code);
              ownerDisplay = escapeHtml(it.supir || it.name || '-');
              const trukText = it.truk ? `Plat: ${escapeHtml(it.truk)}` : '';
              const jenisText = escapeHtml(it.jenisPadi || it.jenis || 'Inpari 32');
              subDisplay = `${jenisText}${trukText ? ` &bull; ${trukText}` : ''}`;
            }

            return `
              <div class="standby-picker-item ${fits ? '' : 'is-disabled'}">
                <div class="standby-picker-left">
                  <div class="standby-picker-top">
                    <span class="standby-picker-code">${codeDisplay}</span>
                    <span class="standby-picker-tag ${tagClass}">${escapeHtml(badgeLabel)}</span>
                    <strong class="standby-picker-owner" title="${ownerDisplay}">${ownerDisplay}</strong>
                    <span class="standby-picker-ton">${itTon}T</span>
                  </div>
                  <div class="standby-picker-bot">
                    <span>${subDisplay}</span>
                  </div>
                </div>
                <div class="standby-picker-right" style="display:flex; gap: 5px;">
                  ${fits ? (
                    stepId === 'C-giling' ? `
                      <button type="button" class="btn btn-add btn-sm" style="background: linear-gradient(135deg, #10b981, #059669); border:none; font-weight:700; padding: 5px 8px; font-size: 11px; border-radius: 7px; white-space: nowrap; cursor: pointer;" 
                              onclick="assignExistingItemToMachine('${it.id}', 'C-giling', 'Mesin Giling 1', 'PK')" title="${isGilingMachineBusy(it.id) ? 'Masukkan ke Antrian Giling PK' : 'Mulai Giling PK'}">
                        ${isGilingMachineBusy(it.id) ? 'Antri PK' : 'Giling PK'}${isGroup ? ` (${coCount})` : ''}
                      </button>
                      <button type="button" class="btn btn-sm" style="background: rgba(99, 102, 241, 0.25); border: 1.5px solid #6366f1; color: #fff; font-weight:700; padding: 5px 8px; font-size: 11px; border-radius: 7px; white-space: nowrap; cursor: pointer;" 
                              onclick="assignExistingItemToMachine('${it.id}', 'C-giling', 'Mesin Giling 1', 'Glosor')" title="${isGilingMachineBusy(it.id) ? 'Masukkan ke Antrian Giling Glosor' : 'Mulai Giling Glosor'}">
                        ${isGilingMachineBusy(it.id) ? 'Antri Glosor' : 'Giling Glosor'}${isGroup ? ` (${coCount})` : ''}
                      </button>
                    ` : (elig.type === 'recycle' ? `
                      <button type="button" class="btn btn-sm" style="background: linear-gradient(135deg, #d97706, #b45309); border:none; color:#fff; font-weight:700; padding: 6px 11px; font-size: 11px; border-radius: 8px; white-space: nowrap; cursor: pointer;" 
                              onclick="assignExistingItemToMachine('${it.id}', '${stepId}', '${escapeHtml(machineName)}')">
                        ${stepId === 'B-dryer' ? `Keringkan Ulang (${itTon}T)` : `Ulang Silo Basah (${itTon}T)`}
                      </button>
                    ` : `
                      <button type="button" class="btn btn-add btn-sm" style="background: linear-gradient(135deg, #10b981, #059669); border:none; font-weight:700; padding: 6px 12px; font-size: 11.5px; border-radius: 8px; white-space: nowrap; cursor: pointer;" 
                              onclick="assignExistingItemToMachine('${it.id}', '${stepId}', '${escapeHtml(machineName)}')">
                        ${isGroup ? `Pindahkan Semua (${itTon}T)` : ((stepId === 'D-mix' && isMixMachineBusy(it.id)) ? 'Antri Mix' : 'Masukkan')}
                      </button>
                    `)
                  ) : `
                    <span class="standby-picker-warn">${warningText}</span>
                  `}
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Pilihan B: Input Padi Baru (Truk Datang dari Luar) -->
      <button type="button" class="machine-choice-btn choice-new-input" 
              onclick="openAddModal('${stepId}', '${escapeHtml(machineName)}'); closeMachineModal();">
        <div class="machine-choice-icon" style="font-size:18px; font-weight:800;">+</div>
        <div class="machine-choice-body">
          <div class="machine-choice-title">Input Padi Baru (Truk Datang dari Luar)</div>
          <div class="machine-choice-sub">Isi formulir data lengkap jika padi baru tiba di pabrik</div>
        </div>
        <div class="machine-choice-arrow">➔</div>
      </button>
    `;
  } else {
    inputActionContentHtml = `
      <button type="button" class="machine-choice-btn choice-input" 
              onclick="openAddModal('${stepId}', '${escapeHtml(machineName)}'); closeMachineModal();">
        <div class="machine-choice-icon" style="font-size:18px; font-weight:800;">+</div>
        <div class="machine-choice-body">
          <div class="machine-choice-title">${inputTitle}</div>
          <div class="machine-choice-sub">${inputSubtext} (Belum ada padi standby di antrian)</div>
        </div>
        <div class="machine-choice-arrow">➔</div>
      </button>
    `;
  }

  html += `
    <div style="font-size: 11px; font-weight: 700; color: var(--text-lavender); text-transform: uppercase; letter-spacing: 0.5px; margin-bottom: 8px;">
      Pilih Tindakan Mesin:
    </div>

    <div class="machine-action-choices">
      ${inputActionContentHtml}

      <!-- Pilihan Mesin Dalam Kendala / Perbaikan -->
      <button type="button" class="machine-choice-btn choice-kendala" 
              onclick="openMaintenanceModal('${stepId}', '${escapeHtml(machineName)}'); closeMachineModal();">
        <div class="machine-choice-icon">⚠️</div>
        <div class="machine-choice-body">
          <div class="machine-choice-title">Mesin Dalam Kendala / Perbaikan</div>
          <div class="machine-choice-sub">Laporkan kerusakan, kendala operasional, atau set perbaikan mesin</div>
        </div>
        <div class="machine-choice-arrow">➔</div>
      </button>
    </div>
  `;

  // 3. INFORMASI STATUS & MUATAN MESIN
  if (isMultiCap && occ) {
    const meterColor = occ.percent >= 100 ? '#ef4444' : (occ.percent > 70 ? '#f59e0b' : '#10b981');
    html += `
      <div style="background: var(--bg-glass-input); border: 1.5px solid var(--border-glass); border-radius: 12px; padding: 12px 14px; margin-bottom: 14px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
          <span style="font-size: 11.5px; font-weight: 700; color: var(--text-lavender);">KAPASITAS UNIT (MAX 30 TON):</span>
          <span style="font-size: 12.5px; font-weight: 800; color: ${meterColor};">${occ.totalTonase} / 30.0 Ton (${occ.percent}%)</span>
        </div>
        <div style="background: rgba(255,255,255,0.08); border-radius: 6px; height: 8px; overflow: hidden; margin-bottom: 6px;">
          <div style="width: ${occ.percent}%; height: 100%; background: ${meterColor}; border-radius: 6px; transition: width 0.3s ease;"></div>
        </div>
        <div style="display: flex; justify-content: space-between; font-size: 11px;">
          <span style="color: var(--text-muted);">Sisa Ruang:</span>
          <strong style="color: ${occ.remainingCapacity > 0 ? '#34d399' : '#ef4444'};">${occ.remainingCapacity > 0 ? `${occ.remainingCapacity} Ton (Bisa diisi)` : 'Penuh'}</strong>
        </div>
      </div>
    `;

    if (occ.items.length > 0) {
      html += `
        <div style="margin-bottom: 12px;">
          <div style="font-size: 11.5px; font-weight: 700; color: #ffffff; margin-bottom: 8px; display: flex; align-items: center; justify-content: space-between;">
            <span>Daftar Padi di Mesin Ini (${occ.items.length} Batch):</span>
            <span style="font-size: 10.5px; color: var(--text-muted); font-weight: normal;">Atas Nama Pemilik / Supir</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 8px; max-height: 240px; overflow-y: auto; padding-right: 4px;">
            ${occ.items.map(it => {
              const startedAt = it.stepHistory?.[stepId]?.startedAt;
              const durasi = startedAt ? calcDuration(startedAt) : '-';
              const isStopped = it.status === 'stopped';
              const supirName = it.supir || it.name || '-';
              const trukPlat = it.truk || '-';
              const jenis = it.jenisPadi || it.jenis || 'Inpari 32';

              return `
                <div style="background: rgba(255, 255, 255, 0.035); border: 1px solid ${isStopped ? 'rgba(239,68,68,0.5)' : 'rgba(255,255,255,0.1)'}; border-radius: 10px; padding: 9px 11px; font-size: 12px;">
                  <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
                    <div style="display: flex; align-items: center; gap: 6px;">
                      <span style="font-family: 'JetBrains Mono', monospace; font-weight: 800; color: #60a5fa; font-size: 12px;">${escapeHtml(it.code)}</span>
                      <strong style="color: #ffffff; font-size: 11.5px;">${escapeHtml(supirName)}</strong>
                    </div>
                    <span style="background: rgba(16, 185, 129, 0.15); border: 1px solid rgba(16, 185, 129, 0.3); padding: 1px 6px; border-radius: 5px; font-weight: 800; color: #34d399; font-size: 10.5px;">${it.tonase || 10} Ton</span>
                  </div>
                  <div style="font-size: 10.5px; color: var(--text-lavender); margin-bottom: 6px;">
                    Truk: <strong>${escapeHtml(trukPlat)}</strong> &bull; Jenis: ${escapeHtml(jenis)} &bull; ${isStopped ? `<span style="color:#ef4444; font-weight:700;">⚠️ Terhenti: ${escapeHtml(it.stopReason || 'Kendala')}</span>` : `Jalan ${durasi}`}
                  </div>
                  <div style="display: flex; gap: 5px; justify-content: flex-end; flex-wrap: wrap;">
                    <button class="btn btn-outline btn-sm" style="font-size: 10.5px; padding: 2.5px 7px;" onclick="openDetailModal('${it.id}'); closeMachineModal();">Detail</button>
                    ${isStopped ? `
                      <button class="btn btn-add btn-sm" style="background:#10b981; font-size: 10.5px; padding: 2.5px 7px;" onclick="resumeMachine('${it.id}'); closeMachineModal();">Resume</button>
                    ` : `
                      <button class="btn btn-outline btn-sm" style="color:#f87171; border-color:rgba(239,68,68,0.4); font-size: 10.5px; padding: 2.5px 7px;" onclick="openStopModal('${it.id}'); closeMachineModal();">Stop</button>
                    `}
                    ${stepId === 'C-silo' ? `
                      <button class="btn btn-outline btn-sm" style="color:#f59e0b; border-color:rgba(245,158,11,0.5); font-size: 10px; padding: 2.5px 6px;" onclick="openStepConfirmModal('${it.id}', 'B-dryer', false); closeMachineModal();" title="Kembalikan gabah ke Dryer karena masih basah">Ulang Dryer</button>
                      <button class="btn btn-outline btn-sm" style="color:#f59e0b; border-color:rgba(245,158,11,0.5); font-size: 10px; padding: 2.5px 6px;" onclick="openStepConfirmModal('${it.id}', 'A-silo', false); closeMachineModal();" title="Kembalikan gabah ke Silo Basah karena masih basah">Ulang SB</button>
                    ` : ''}
                    <button class="btn btn-advance btn-sm" style="font-size: 10.5px; padding: 2.5px 7px;" onclick="advanceOneStep('${it.id}'); closeMachineModal();">Lanjut</button>
                  </div>
                </div>
              `;
            }).join('')}
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(16, 185, 129, 0.06); border: 1px dashed rgba(16, 185, 129, 0.3); border-radius: 10px; padding: 12px; text-align: center; color: #34d399; font-size: 11.5px; margin-bottom: 12px;">
          🟢 Unit ini saat ini kosong (Standby) dan siap menerima muatan hingga 30 Ton.
        </div>
      `;
    }
  } else {
    // Single unit: C-giling, D-mix, D-packing
    let item = (stepId === 'C-giling') ? getActiveGilingItem() : items.find(i => i.currentStepId === stepId && (i.status === 'active' || i.status === 'stopped'));
    if (item) {
      const isStopped = item.status === 'stopped';
      const startedAt = item.stepHistory?.[stepId]?.startedAt;
      const durasi = startedAt ? calcDuration(startedAt) : '-';

      html += `
        <div style="background: ${isStopped ? 'rgba(239, 68, 68, 0.12)' : 'rgba(16, 185, 129, 0.1)'}; border: 1.5px solid ${isStopped ? 'rgba(239, 68, 68, 0.35)' : 'rgba(16, 185, 129, 0.3)'}; border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;">
          <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px;">
            <span style="font-weight: 800; font-size: 12.5px; color: #ffffff;">Barang Sedang Diproses:</span>
            <span class="m-status-pill ${isStopped ? 'stopped' : 'active'}" style="font-size: 9.5px; padding: 1.5px 6px;">${isStopped ? 'TERHENTI' : 'AKTIF'}</span>
          </div>
          <div style="font-size: 13.5px; font-weight: 800; color: #60a5fa; margin-bottom: 2px;">
            ${escapeHtml(item.code)} - ${escapeHtml(item.name)}
          </div>
          <div style="font-size: 11px; color: var(--text-lavender); margin-bottom: 8px;">
            Jenis: ${escapeHtml(item.jenis || '-')} &bull; Tonase: ${item.tonase || 10} Ton &bull; ${isStopped ? `<span style="color:#ef4444; font-weight:700;">⚠️ ${escapeHtml(item.stopReason || 'Kendala')}</span>` : `Jalan ${durasi}`}
          </div>
          <div style="display: flex; gap: 6px; justify-content: flex-end;">
            <button class="btn btn-outline btn-sm" style="font-size: 11px; padding: 3px 8px;" onclick="openDetailModal('${item.id}'); closeMachineModal();">Detail</button>
            ${isStopped ? `
              <button class="btn btn-add btn-sm" style="background:#10b981; font-size: 11px; padding: 3px 8px;" onclick="resumeMachine('${item.id}'); closeMachineModal();">Resume</button>
            ` : `
              <button class="btn btn-outline btn-sm" style="color:#f87171; border-color:rgba(239,68,68,0.4); font-size: 11px; padding: 3px 8px;" onclick="openStopModal('${item.id}'); closeMachineModal();">Stop</button>
            `}
            <button class="btn btn-advance btn-sm" style="font-size: 11px; padding: 3px 8px;" onclick="advanceOneStep('${item.id}'); closeMachineModal();">Lanjut</button>
          </div>
        </div>
      `;
    } else {
      html += `
        <div style="background: rgba(148, 163, 184, 0.08); border: 1px solid var(--border-glass); border-radius: 10px; padding: 12px; text-align: center; color: var(--text-lavender); font-size: 11.5px; margin-bottom: 12px;">
          🟢 ${escapeHtml(machineName)} saat ini dalam status Standby (Siap digunakan).
        </div>
      `;
    }

    // Tampilkan daftar antrian jika stepId === 'C-giling' atau 'D-mix'
    if (stepId === 'C-giling') {
      const queuedGiling = items.filter(i => i.currentStepId === 'C-giling' && i.isQueuedForGiling && (i.status === 'active' || i.status === 'stopped'));
      if (queuedGiling.length > 0) {
        html += `
          <div style="background: rgba(245, 158, 11, 0.08); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 800; font-size: 12px; color: #f59e0b;">Antrian Mesin Giling (${queuedGiling.length} Batch Menunggu):</span>
              <span style="font-size: 10.5px; color: var(--text-muted);">Diproses berurutan otomatis</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${queuedGiling.map((q, idx) => {
                const qDuration = q.stepHistory?.['C-giling']?.queuedAt ? calcDuration(q.stepHistory['C-giling'].queuedAt) : '-';
                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 7px 10px; font-size: 11.5px;">
                    <div>
                      <span style="font-weight: 800; color: #f59e0b; margin-right: 6px;">#${idx + 1}</span>
                      <strong style="color: #60a5fa;">${escapeHtml(q.code)}</strong>
                      <span style="color: var(--text-lavender); margin-left: 4px;">${escapeHtml(q.supir || q.name || '-')} (${q.tonase || 10}T)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="font-weight: 700; color: #fff; background: rgba(255,255,255,0.08); padding: 2px 6px; border-radius: 4px; font-size: 10px;">${escapeHtml(q.gilingType || 'PK')}</span>
                      <span style="color: var(--text-muted); font-size: 10.5px;">Antri ${qDuration}</span>
                      <button class="btn btn-outline btn-sm" style="font-size: 10.5px; padding: 2px 6px;" onclick="openDetailModal('${q.id}'); closeMachineModal();">Detail</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
    } else if (stepId === 'D-mix') {
      const queuedMix = items.filter(i => i.currentStepId === 'D-mix' && i.isQueuedForMix && (i.status === 'active' || i.status === 'stopped'));
      if (queuedMix.length > 0) {
        html += `
          <div style="background: rgba(245, 158, 11, 0.08); border: 1.5px solid rgba(245, 158, 11, 0.35); border-radius: 12px; padding: 12px 14px; margin-bottom: 12px;">
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px;">
              <span style="font-weight: 800; font-size: 12px; color: #f59e0b;">Antrian Mesin Mix (${queuedMix.length} Batch Menunggu):</span>
              <span style="font-size: 10.5px; color: var(--text-muted);">Diproses berurutan otomatis</span>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${queuedMix.map((q, idx) => {
                const qDuration = q.stepHistory?.['D-mix']?.queuedAt ? calcDuration(q.stepHistory['D-mix'].queuedAt) : '-';
                return `
                  <div style="display: flex; justify-content: space-between; align-items: center; background: rgba(0, 0, 0, 0.25); border: 1px solid rgba(255, 255, 255, 0.08); border-radius: 8px; padding: 7px 10px; font-size: 11.5px;">
                    <div>
                      <span style="font-weight: 800; color: #f59e0b; margin-right: 6px;">#${idx + 1}</span>
                      <strong style="color: #60a5fa;">${escapeHtml(q.code)}</strong>
                      <span style="color: var(--text-lavender); margin-left: 4px;">${escapeHtml(q.supir || q.name || '-')} (${q.tonase || 10}T)</span>
                    </div>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span style="color: var(--text-muted); font-size: 10.5px;">Antri ${qDuration}</span>
                      <button class="btn btn-outline btn-sm" style="font-size: 10.5px; padding: 2px 6px;" onclick="openDetailModal('${q.id}'); closeMachineModal();">Detail</button>
                    </div>
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }
    }
  }

  html += `
    <div style="margin-top: 14px;">
      <button class="btn btn-subtle" style="width: 100%; justify-content: center; padding: 9px;" onclick="closeMachineModal();">
        Tutup
      </button>
    </div>
  `;

  contentEl.innerHTML = html;
  modal.classList.add('open');
}
window.openMachineModal = openMachineModal;

function closeMachineModal() {
  const m = document.getElementById('machineDetailModal');
  if (m) m.classList.remove('open');
}
window.closeMachineModal = closeMachineModal;

/**
 * Render Tabel Monitoring SCADA & Floor Plan
 */
function renderTable() {
  updateScadaOverview();
  renderFloorPlan();
  if (typeof currentLogbookView !== 'undefined' && currentLogbookView === 'mutasi') {
    renderMutasiRiwayat();
  } else {
    renderLogPadiSheet();
  }
  if (typeof updateLogbookTabBadges === 'function') {
    updateLogbookTabBadges();
  }

  const tbody = document.getElementById('tableBody');
  if (!tbody) return;
  tbody.innerHTML = '';

  if (items.length === 0) {
    const trEmpty = document.createElement('tr');
    trEmpty.innerHTML = `
      <td colspan="5" style="text-align: center; padding: 40px 20px; color: var(--text-lavender);">
        <div style="font-size: 16px; font-weight:700; color:var(--text-muted); margin-bottom: 8px;">[KOSONG]</div>
        <div style="font-weight: 600; font-size: 15px; margin-bottom: 4px;">Belum ada baris barang masuk</div>
        <div style="font-size: 12.5px; opacity: 0.8; margin-bottom: 16px;">Klik tombol <strong>+ Tambah Barang Masuk</strong> di kanan atas untuk memulai pencatatan baru.</div>
        <button class="btn btn-add" onclick="openAddModal()" style="display: inline-flex; align-items: center; gap: 6px; margin: 0 auto;">
          <span>+</span> Tambah Barang Masuk
        </button>
      </td>
    `;
    tbody.appendChild(trEmpty);
    return;
  }

  items.forEach(item => {
    const tr = document.createElement('tr');
    tr.className = 'batch-row';

    // Kolom 1: Informasi Barang Masuk
    const tdItem = document.createElement('td');
    tdItem.className = 'cell-item';

    const currentStep = getSubstep(item.currentStepId);
    let posText = '';
    let posClass = '';
    let actionBtnHtml = '';

    if (item.status === 'completed') {
      const finishTimeStr = item.completedAt ? ` ${formatTime(item.completedAt)}` : '';
      const locLabel = item.selesaiLokasi === 'Mobil' ? 'Langsung di Mobil' : 'Gudang';
      posText = `Selesai • ${locLabel}${finishTimeStr}`;
      posClass = 'completed';
      actionBtnHtml = `
        <button class="btn-subtle" onclick="openCompleteModal('${item.id}')" title="Ubah Waktu Selesai & Hasil Akhir" style="padding: 4px 8px; font-size: 11px;">
          Waktu Selesai
        </button>
      `;
    } else if (item.status === 'standby' || !currentStep) {
      posText = 'Kosong • Standby';
      posClass = 'standby';
      actionBtnHtml = `
        <button class="btn-start-action" onclick="startFirstStep('${item.id}')" title="Klik Start untuk mulai alur mesin (indikator hijau aktif)">
          Start
        </button>
      `;
    } else if (item.status === 'stopped') {
      const machineTitle = (item.assignedMachines && item.assignedMachines[currentStep.id]) || (currentStep.id === 'C-giling' ? `Giling (${item.gilingType || 'PK'})` : currentStep.lineName);
      const reasonTag = item.stopReason ? ` <span class="stopped-reason-tag">(${escapeHtml(item.stopReason)})</span>` : '';
      posText = `<span class="badge-stopped-clickable" onclick="openStopModal('${item.id}')" title="Klik untuk lihat / ubah penjelasan terhenti">⚠️ Terhenti • ${escapeHtml(machineTitle)}${reasonTag}</span>`;
      posClass = 'stopped';
      actionBtnHtml = `
        <button class="btn-resume-action" onclick="resumeMachine('${item.id}')" title="Nyalakan kembali mesin setelah selesai perbaikan">
          Resume
        </button>
        <button class="btn-stop-action" onclick="openStopModal('${item.id}')" title="Ubah penjelasan kendala terhenti" style="background: rgba(239, 68, 68, 0.15); border: 1px solid rgba(239, 68, 68, 0.4); color: #f87171; padding: 4px 7px; font-size: 11px;">
          Alasan
        </button>
      `;
    } else if (currentStep.id === 'C-giling' && item.isQueuedForGiling) {
      // Sedang antri di mesin giling
      posText = `<span class="beacon-amber-live" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span> <span>Antri Giling (${item.gilingType || 'PK'})</span>`;
      posClass = 'queued';
      actionBtnHtml = `
        <button class="btn-subtle" onclick="openDetailModal('${item.id}')" title="Sedang menunggu giliran mesin giling" style="border-color: rgba(245, 158, 11, 0.5); color: #fbbf24; font-size: 11px; padding: 4px 8px;">
          Antri Giling
        </button>
      `;
    } else if (currentStep.id === 'D-mix' && item.isQueuedForMix) {
      // Sedang antri di mesin mix
      posText = `<span class="beacon-amber-live" style="background:#f59e0b; box-shadow:0 0 8px #f59e0b;"></span> <span>Antri Mix</span>`;
      posClass = 'queued';
      actionBtnHtml = `
        <button class="btn-subtle" onclick="openDetailModal('${item.id}')" title="Sedang menunggu giliran mesin mix" style="border-color: rgba(245, 158, 11, 0.5); color: #fbbf24; font-size: 11px; padding: 4px 8px;">
          Antri Mix
        </button>
      `;
    } else {
      // 1. STATUS AKTIF = WARNA HIJAU (BEACON GREEN LIVE)
      const machineTitle = (item.assignedMachines && item.assignedMachines[currentStep.id]) || (currentStep.id === 'C-giling' ? `Giling (${item.gilingType || 'PK'})` : currentStep.lineName);
      posText = `<span class="beacon-green-live"></span> <span>${currentStep.stageKey} • ${escapeHtml(machineTitle)}</span>`;
      posClass = 'active';
      actionBtnHtml = `
        <button class="btn-advance-step" onclick="advanceOneStep('${item.id}')" title="Lanjut ke langkah berikutnya secara bertahap">
          Lanjut
        </button>
        <button class="btn-stop-action" onclick="openStopModal('${item.id}')" title="Hentikan alur mesin (input penjelasan kendala)">
          Stop
        </button>
      `;
    }

    const supirTrukText = [
      item.supir ? escapeHtml(item.supir) : '',
      item.truk ? escapeHtml(item.truk) : '',
      escapeHtml(item.jenisPadi || item.jenis || '')
    ].filter(Boolean).join(' &bull; ');

    tdItem.innerHTML = `
      <div class="item-wrapper">
        <div class="item-code-row">
          <div style="display: flex; align-items: center; gap: 4px;">
            <span class="item-code">${escapeHtml(item.code)}</span>
            <button class="btn-icon-edit" onclick="openEditModal('${item.id}')" title="Ubah Data Barang & Truk">Ubah</button>
            <button class="btn-icon-del" onclick="deleteItem('${item.id}')" title="Hapus Baris Barang Ini">Hapus</button>
          </div>
          <div style="display: flex; gap: 6px; align-items: center;">
            ${actionBtnHtml}
            <button class="btn-view-history" onclick="openDetailModal('${item.id}')" title="Buka Riwayat Waktu Lengkap">
              Riwayat
            </button>
          </div>
        <div class="item-name item-name-clickable" onclick="openEditModal('${item.id}')" title="Klik untuk ubah data barang">
          ${escapeHtml(item.name)}
          ${item.recycleCount > 0 ? `<span style="display:inline-flex; align-items:center; gap:3px; margin-left:6px; font-size:10px; font-weight:700; padding:1px 6px; border-radius:4px; background:rgba(245,158,11,0.18); border:1px solid rgba(245,158,11,0.45); color:#f59e0b;" title="Gabah telah diulang pengeringan ${item.recycleCount}x karena masih basah">⚠️ Ulang ${item.recycleCount}x (Masih Basah)</span>` : ''}
        </div>
        ${supirTrukText ? `<div style="font-size: 11px; color: var(--text-lavender); margin-1px 0 3px 0;">${supirTrukText} (${item.tonase || 10}T)</div>` : ''}
        <div class="item-badge-pos ${posClass}">${posText}</div>
      </div>
    `;
    tr.appendChild(tdItem);

    const isStandby = item.status === 'standby' || !item.currentStepId;
    const currentStepIdx = isStandby ? -1 : (item.status === 'completed' ? 999 : getSubstepIndex(item.currentStepId));
    const nextStepIdx = currentStepIdx + 1;

    // Kolom 2-5: Tahapan Mesin (A, B, C, D)
    STAGES.forEach((stage) => {
      const tdStage = document.createElement('td');
      tdStage.className = 'cell-stage';

      const trackPair = document.createElement('div');
      trackPair.className = 'track-pair';

      const substeps = getSubstepsByStage(stage.key);

      substeps.forEach((step) => {
        const stepIdx = getSubstepIndex(step.id);
        const history = item.stepHistory && item.stepHistory[step.id] ? item.stepHistory[step.id] : {};

        let displayLineTitle = step.lineName;
        if (item.assignedMachines && item.assignedMachines[step.id]) {
          displayLineTitle = item.assignedMachines[step.id];
        } else if (step.id === 'C-giling' && item.gilingType) {
          displayLineTitle = `Giling: ${item.gilingType}`;
        }

        let stateClass = 'is-pending';
        let statusBadgeHtml = '';
        let tooltip = '';

        if (item.status === 'completed') {
          if (history.skipped) {
            stateClass = 'is-skipped';
            statusBadgeHtml = `<span class="track-badge skipped">⏭ Lewat (Tanpa Mix)</span>`;
            tooltip = `${displayLineTitle} - Dilewati (Langsung ke Packing tanpa Mix)`;
          } else if (history.passed) {
            stateClass = 'is-passed';
            statusBadgeHtml = `<span class="track-badge passed">Selesai ${formatTime(history.completedAt)}</span>`;
            tooltip = `${displayLineTitle} - Selesai: ${formatDateTimeShort(history.completedAt)}`;
          } else {
            stateClass = 'is-pending';
            statusBadgeHtml = `<span class="track-badge standby">Standby</span>`;
          }
        } else if (isStandby) {
          stateClass = 'is-pending';
          statusBadgeHtml = `<span class="track-badge standby">Standby</span>`;
          tooltip = `${displayLineTitle} - Standby (Kosong)`;
        } else {
          // Item Aktif Sedang Berjalan, Mengantri, atau Terhenti
          if (item.currentStepId === step.id) {
            if (item.status === 'stopped') {
              stateClass = 'is-stopped';
              statusBadgeHtml = `<span class="track-badge stopped">⚠️ Terhenti</span>`;
              tooltip = `MESIN TERHENTI di ${displayLineTitle}! ${item.stopReason ? `(${item.stopReason})` : ''} Klik tombol Resume setelah selesai perbaikan.`;
            } else if (step.id === 'C-giling' && item.isQueuedForGiling) {
              stateClass = 'is-queued';
              statusBadgeHtml = `<span class="track-badge queued">Antri Giling</span>`;
              tooltip = `${item.code} sedang mengantri Mesin Giling (${item.gilingType || 'PK'}). Otomatis aktif saat mesin kosong.`;
            } else if (step.id === 'D-mix' && item.isQueuedForMix) {
              stateClass = 'is-queued';
              statusBadgeHtml = `<span class="track-badge queued">Antri Mix</span>`;
              tooltip = `${item.code} sedang mengantri Mesin Mix. Otomatis aktif saat mesin kosong.`;
            } else {
              stateClass = 'is-active';
              statusBadgeHtml = `
                <span class="track-badge active">
                  <span class="beacon-green-live"></span>
                  <span>Sedang Aktif</span>
                </span>
              `;
              tooltip = `Sedang Diproses di ${displayLineTitle} sejak ${formatTime(history.startedAt)} WIB (Indikator Hijau Aktif)`;
            }
          } else if (history.passed) {
            if (history.skipped) {
              stateClass = 'is-skipped';
              statusBadgeHtml = `<span class="track-badge skipped">⏭ Lewat (Tanpa Mix)</span>`;
              tooltip = `${displayLineTitle} - Dilewati (Langsung ke Packing tanpa Mix)`;
            } else {
              stateClass = 'is-passed';
              statusBadgeHtml = `<span class="track-badge passed">Selesai ${formatTime(history.completedAt)}</span>`;
              tooltip = `Selesai pada: ${formatDateTimeShort(history.completedAt)} (Durasi: ${calcDuration(history.startedAt, history.completedAt)})`;
            }
          } else {
            stateClass = 'is-pending';
            statusBadgeHtml = `<span class="track-badge standby">Standby</span>`;

            if (stepIdx === nextStepIdx) {
              tooltip = `Klik untuk melanjutkan ke ${displayLineTitle}`;
            } else if (item.currentStepId === 'C-giling' && step.id === 'D-packing') {
              tooltip = `Klik untuk langsung lanjut ke Packing (Tanpa Mix)`;
            } else {
              tooltip = `Tahap ${displayLineTitle} terkunci (alur proses mesin wajib berurutan)`;
            }
          }
        }

        const bar = document.createElement('div');
        const singleTrackClass = (substeps.length === 1) ? 'single-track' : '';
        bar.className = `track-bar ${stateClass} ${singleTrackClass}`.trim();
        bar.innerHTML = `
          <span class="track-line-name">${escapeHtml(displayLineTitle)}</span>
          ${statusBadgeHtml}
        `;
        bar.setAttribute('data-tooltip', tooltip);

        bar.addEventListener('click', () => {
          handleTrackClick(item.id, step.id);
        });

        trackPair.appendChild(bar);
      });

      tdStage.appendChild(trackPair);
      tr.appendChild(tdStage);
    });

    tbody.appendChild(tr);
  });
}

/**
 * Modal Riwayat Waktu Lengkap (Detail Modal)
 */
function openDetailModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  activeModalItemId = itemId;

  document.getElementById('modalCode').textContent = item.code;
  document.getElementById('modalName').textContent = item.name;
  document.getElementById('modalMeta').textContent = item.masukAt ? `Masuk Alur: ${formatDateTimeShort(item.masukAt)}` : 'Status: Belum Dimulai (Kosong)';

  const currentStep = getSubstep(item.currentStepId);
  const currentPosEl = document.getElementById('modalPosisi');
  if (item.status === 'completed') {
    const locLabel = item.selesaiLokasi === 'Mobil' ? 'Langsung di Mobil' : 'Di Gudang';
    currentPosEl.innerHTML = `Selesai (${locLabel}) ${item.completedAt ? `&bull; Selesai: <strong>${formatDateTimeShort(item.completedAt)}</strong>` : ''}`;
  } else if (item.status === 'standby' || !currentStep) {
    currentPosEl.textContent = 'Belum Dimulai (Standby)';
  } else if (item.status === 'stopped') {
    const curMachine = (item.assignedMachines && item.assignedMachines[currentStep.id]) || (currentStep.id === 'C-giling' ? `Giling: ${item.gilingType || 'PK'}` : currentStep.lineName);
    currentPosEl.innerHTML = `
      <span style="color:#ef4444; font-weight:800;">⚠️ TERHENTI</span>: ${currentStep.stageName} • ${escapeHtml(curMachine)}
      ${item.stopReason ? `<span style="font-weight: normal; color: #fca5a5;"> (${escapeHtml(item.stopReason)})</span>` : ''}
      <button class="btn-subtle" onclick="openStopModal('${item.id}')" style="margin-left: 8px; font-size: 11px; padding: 2px 8px; cursor: pointer;">Edit Ubah Penjelasan</button>
    `;
  } else if (currentStep.id === 'C-giling' && item.isQueuedForGiling) {
    currentPosEl.innerHTML = `<span style="color:#f59e0b; font-weight:700;">Mengantri Mesin Giling (${escapeHtml(item.gilingType || 'PK')})</span> &bull; Menunggu giliran mesin kosong`;
  } else if (currentStep.id === 'D-mix' && item.isQueuedForMix) {
    currentPosEl.innerHTML = `<span style="color:#f59e0b; font-weight:700;">Mengantri Mesin Mix</span> &bull; Menunggu giliran mesin kosong`;
  } else {
    const curMachine = (item.assignedMachines && item.assignedMachines[currentStep.id]) || (currentStep.id === 'C-giling' ? `Giling: ${item.gilingType || 'PK'}` : currentStep.lineName);
    currentPosEl.innerHTML = `<span class="beacon-green-live"></span> ${currentStep.stageName} • ${escapeHtml(curMachine)} (Sedang Berjalan)`;
  }

  const supirEl = document.getElementById('modalSupir');
  if (supirEl) supirEl.textContent = item.supir || '-';
  const trukEl = document.getElementById('modalTruk');
  if (trukEl) trukEl.textContent = item.truk || '-';
  const jenisEl = document.getElementById('modalJenis');
  if (jenisEl) jenisEl.textContent = item.jenisPadi || item.jenis || 'Inpari 32';
  const tonaseDisplay = item.tonaseAkhir ? `${item.tonaseAkhir} Ton (Awal: ${item.tonase || '-'})` : (item.tonase ? `${item.tonase} Ton` : '-');
  document.getElementById('modalTonase').textContent = tonaseDisplay;

  // Render Trouble History Banner jika ada kejadian stop tercatat atau alur pengulangan
  const troubleBannerEl = document.getElementById('modalTroubleBanner');
  if (troubleBannerEl) {
    let bannersHtml = '';
    if (item.stopLog && item.stopLog.length > 0) {
      bannersHtml += `
        <div class="modal-trouble-history-banner">
          <span style="font-size: 16px;">⚠️</span>
          <div>
            <strong>Catatan Kendala (${item.stopLog.length}x Terhenti):</strong>
            <span>Pernah terjadi kendala mesin terhenti pada: ${item.stopLog.map(s => `<strong>${s.stepName || 'Mesin'}</strong> (${escapeHtml(s.reason || 'Kendala')}${s.resumedAt ? ` - ${s.duration || calcDuration(s.stoppedAt, s.resumedAt)}` : ' - Masih Terhenti'})`).join(', ')}.</span>
          </div>
        </div>
      `;
    }
    if (item.recycleCount > 0 && item.recycleLog && item.recycleLog.length > 0) {
      const logsText = item.recycleLog.map(r => `<strong>${r.fromMachine || 'Silo Kering'} ➔ ${r.toMachine || r.toStep}</strong> (${formatTime(r.timestamp)} WIB)`).join(', ');
      bannersHtml += `
        <div class="modal-trouble-history-banner" style="background: rgba(245, 158, 11, 0.12); border-color: rgba(245, 158, 11, 0.45); color: #fde68a; margin-top: 8px;">
          <span style="font-size: 16px;">⚠️</span>
          <div>
            <strong style="color: #f59e0b;">Pengulangan Siklus Mesin (${item.recycleCount}x Pengeringan Ulang):</strong>
            <span>Gabah di Silo Kering masih berkadar air tinggi dan dialirkan ulang: ${logsText}.</span>
          </div>
        </div>
      `;
    }
    if (bannersHtml) {
      troubleBannerEl.innerHTML = bannersHtml;
      troubleBannerEl.style.display = 'block';
    } else {
      troubleBannerEl.innerHTML = '';
      troubleBannerEl.style.display = 'none';
    }
  }

  // Render detail timeline per sub-step
  const timelineEl = document.getElementById('modalTimeline');
  timelineEl.innerHTML = '';

  SUBSTEPS.forEach((step) => {
    const history = item.stepHistory && item.stepHistory[step.id] ? item.stepHistory[step.id] : {};
    let status = 'pending';
    let statusLabel = 'Belum';

    const displayUnit = (item.assignedMachines && item.assignedMachines[step.id]) || (step.id === 'C-giling' && item.gilingType ? `Giling: ${item.gilingType}` : step.lineName);

    if (item.status === 'completed' || history.passed) {
      if (history.skipped) {
        status = 'skipped';
        statusLabel = '⏭ Dilewati (Tanpa Mix)';
      } else {
        status = 'passed';
        statusLabel = 'Selesai';
      }
    } else if (item.currentStepId === step.id) {
      if (item.status === 'stopped') {
        status = 'stopped';
        statusLabel = '⚠️ Terhenti';
      } else if (step.id === 'C-giling' && item.isQueuedForGiling) {
        status = 'queued';
        statusLabel = 'Antri Giling';
      } else if (step.id === 'D-mix' && item.isQueuedForMix) {
        status = 'queued';
        statusLabel = 'Antri Mix';
      } else {
        status = 'active';
        statusLabel = 'Sedang Berjalan';
      }
    }

    const card = document.createElement('div');
    card.className = (status === 'skipped') ? 'step-card is-skipped' : `step-card is-${status}`;

    let timingText = '';
    let editButtonHtml = '';

    if (status === 'skipped') {
      timingText = `<span style="color: #94a3b8; font-style: italic;">Tahap ini dilewati &bull; Dari Mesin Giling langsung dialirkan ke Packing (Tanpa Mix)</span>`;
      editButtonHtml = '';
    } else if (status === 'passed') {
      timingText = `Mulai: ${formatTime(history.startedAt)} &bull; Selesai: <strong>${formatDateTimeShort(history.completedAt)}</strong> (Durasi: ${calcDuration(history.startedAt, history.completedAt)})`;
      editButtonHtml = `
        <button type="button" class="btn-step-edit-time" onclick="openEditStepTimeModal('${item.id}', '${step.id}')" title="Ubah waktu selesai tahap ini">
          Ubah Jam
        </button>
      `;
    } else if (status === 'active') {
      timingText = `Mulai: <strong>${formatTime(history.startedAt)} WIB</strong> (Sedang berjalan ${calcDuration(history.startedAt)})`;
    } else if (status === 'queued') {
      timingText = `<span style="color:#f59e0b;">Mengantri mesin sejak ${formatTime(history.queuedAt || history.startedAt)} WIB (Menunggu mesin kosong)</span>`;
    } else if (status === 'stopped') {
      timingText = `<span style="color:#ef4444;">Terhenti sejak ${formatTime(item.stoppedAt)} WIB ${item.stopReason ? `&bull; Alasan: ${escapeHtml(item.stopReason)}` : ''}</span>`;
    } else {
      timingText = `Menunggu giliran alur permesinan`;
    }

    // Ambil riwayat kejadian stop yang pernah dialami di tahap ini
    const stepStops = (history.stops && history.stops.length > 0)
      ? history.stops
      : (item.stopLog ? item.stopLog.filter(s => s.stepId === step.id) : []);

    let stopAlertHtml = '';
    if (stepStops.length > 0) {
      stopAlertHtml = `
        <div class="step-stop-list">
          ${stepStops.map(st => {
            const timeRange = st.resumedAt 
              ? `${formatTime(st.stoppedAt)} - ${formatTime(st.resumedAt)} (${st.duration || calcDuration(st.stoppedAt, st.resumedAt)})`
              : `sejak ${formatTime(st.stoppedAt)} WIB (Sedang Terhenti)`;
            return `
              <div class="step-stop-alert">
                <span class="stop-badge-icon">⚠️</span>
                <span>Pernah Terhenti: <strong>${timeRange}</strong> &bull; Alasan: <strong class="stop-reason-highlight">${escapeHtml(st.reason || 'Kendala Mesin')}</strong></span>
              </div>
            `;
          }).join('')}
        </div>
      `;
    }

    card.innerHTML = `
      <div class="step-info-left">
        <div class="step-main-title">
          <span>${step.stageName}</span>
          <span class="step-track-tag">${escapeHtml(displayUnit)}</span>
        </div>
        <div class="step-timing-info">${timingText}</div>
        ${stopAlertHtml}
      </div>
      <div style="display: flex; align-items: center; gap: 8px;">
        ${editButtonHtml}
        <span class="step-status-tag ${status}">
          ${status === 'active' ? '<span class="beacon-green-live"></span> ' : ''}${statusLabel}
        </span>
      </div>
    `;

    timelineEl.appendChild(card);
  });

  const btnAdvance = document.getElementById('btnAdvanceNext');
  const btnComplete = document.getElementById('btnMarkComplete');
  const btnModalStop = document.getElementById('btnModalStop');
  const btnModalResume = document.getElementById('btnModalResume');

  if (item.status === 'completed') {
    btnAdvance.style.display = 'none';
    btnComplete.style.display = 'inline-flex';
    btnComplete.textContent = 'Ubah Waktu Selesai';
    if (btnModalStop) btnModalStop.style.display = 'none';
    if (btnModalResume) btnModalResume.style.display = 'none';
  } else if (item.status === 'standby' || !item.currentStepId) {
    btnAdvance.style.display = 'inline-flex';
    btnAdvance.textContent = 'Start Tahap A (Silo Basah)';
    btnComplete.style.display = 'none';
    if (btnModalStop) btnModalStop.style.display = 'none';
    if (btnModalResume) btnModalResume.style.display = 'none';
  } else if (item.status === 'stopped') {
    btnAdvance.style.display = 'none';
    btnComplete.style.display = 'none';
    if (btnModalStop) btnModalStop.style.display = 'none';
    if (btnModalResume) btnModalResume.style.display = 'inline-flex';
  } else if ((item.currentStepId === 'C-giling' && item.isQueuedForGiling) || (item.currentStepId === 'D-mix' && item.isQueuedForMix)) {
    btnAdvance.style.display = 'none';
    btnComplete.style.display = 'none';
    if (btnModalStop) btnModalStop.style.display = 'none';
    if (btnModalResume) btnModalResume.style.display = 'none';
  } else {
    btnAdvance.style.display = 'inline-flex';
    if (item.currentStepId === 'C-giling') {
      btnAdvance.textContent = 'Lanjut (Pilih Mix / Packing)';
    } else {
      btnAdvance.textContent = 'Lanjut ke Tahap Berikutnya';
    }
    btnComplete.style.display = 'inline-flex';
    btnComplete.textContent = 'Selesai';
    if (btnModalStop) btnModalStop.style.display = 'inline-flex';
    if (btnModalResume) btnModalResume.style.display = 'none';
  }

  document.getElementById('detailModal').classList.add('open');
}
window.openDetailModal = openDetailModal;

function closeDetailModal() {
  document.getElementById('detailModal').classList.remove('open');
  activeModalItemId = null;
}

/**
 * Hapus Barang Berdasarkan ID
 */
function deleteItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  if (confirm(`⚠️ Yakin ingin menghapus baris ${item.code} (${item.name}) dari daftar alur proses?`)) {
    const wasInGiling = item.currentStepId === 'C-giling' && !item.isQueuedForGiling;
    const wasInMix = item.currentStepId === 'D-mix' && !item.isQueuedForMix;
    items = items.filter(i => i.id !== itemId);
    if (wasInGiling) {
      promoteNextGilingQueue();
    }
    if (wasInMix) {
      promoteNextMixQueue();
    }
    saveData();
    renderTable();

    // Tutup modal detail atau edit jika sedang terbuka
    if (activeModalItemId === itemId) {
      closeDetailModal();
    }
    const editModal = document.getElementById('editModal');
    if (editModal && editModal.classList.contains('open')) {
      closeEditModal();
    }

    showToast(`Baris ${item.code} berhasil dihapus.`);
  }
}
window.deleteItem = deleteItem;

function deleteBatch() {
  if (activeModalItemId) {
    deleteItem(activeModalItemId);
  }
}

/**
 * Tambah Barang Baru (Kode Otomatis PMD0001, PMD0002... dengan Supir, Truk, Jenis Padi)
 */
function getNextItemCode() {
  let maxPmd = 0;
  items.forEach(i => {
    if (i && i.code) {
      const m = String(i.code).match(/^PMD(\d+)$/i);
      if (m) {
        const val = parseInt(m[1], 10);
        if (val > maxPmd) maxPmd = val;
      }
    }
  });
  const nextNum = maxPmd + 1;
  return `PMD${String(nextNum).padStart(4, '0')}`;
}
window.getNextItemCode = getNextItemCode;

/**
 * Update pilihan unit mesin spesifik di form Tambah Barang Masuk
 */
function updateAddFormUnitOptions(stepId, preselectedUnit = null) {
  const container = document.getElementById('targetUnitContainer');
  const selectEl = document.getElementById('inputTargetUnit');
  const badgeEl = document.getElementById('targetUnitCapacityBadge');
  const hintEl = document.getElementById('targetUnitHint');
  const gilingContainer = document.getElementById('gilingTypeContainer');
  if (!container || !selectEl) return;

  if (gilingContainer) {
    gilingContainer.style.display = (stepId === 'C-giling') ? 'block' : 'none';
  }

  const isMultiCap = (stepId === 'A-silo' || stepId === 'B-dryer' || stepId === 'C-silo');
  if (!isMultiCap) {
    container.style.display = 'none';
    if (badgeEl) badgeEl.textContent = '';
    if (hintEl) hintEl.textContent = '';
    return;
  }

  container.style.display = 'block';
  selectEl.innerHTML = '';

  const stepObj = getSubstep(stepId);
  if (!stepObj) return;

  let bestUnit = preselectedUnit;
  for (let u = 1; u <= stepObj.unitCount; u++) {
    const uName = `${stepObj.unitPrefix} ${u}`;
    const occ = getMachineUnitOccupancy(stepId, uName);
    const isMaint = isMachineUnderMaintenance(stepId, uName);
    const maintInfo = isMaint ? getMachineMaintenanceInfo(stepId, uName) : null;

    const opt = document.createElement('option');
    opt.value = uName;

    if (isMaint) {
      opt.textContent = `⚠️ ${uName} — Sedang Perbaikan (${maintInfo?.reason || 'Kendala'})`;
      opt.disabled = true;
    } else if (occ.isFull) {
      opt.textContent = `🔴 ${uName} — Penuh (30/30 Ton)`;
      opt.disabled = true;
    } else if (occ.count > 0) {
      opt.textContent = `${uName} — Sisa ${occ.remainingCapacity} Ton (Terisi ${occ.totalTonase}/30T)`;
      if (!bestUnit) bestUnit = uName;
    } else {
      opt.textContent = `🟢 ${uName} — Kosong (Sisa 30 Ton)`;
      if (!bestUnit) bestUnit = uName;
    }

    selectEl.appendChild(opt);
  }

  if (bestUnit) {
    selectEl.value = bestUnit;
  }

  const refreshUnitHint = () => {
    const chosen = selectEl.value;
    if (!chosen) return;
    const occ = getMachineUnitOccupancy(stepId, chosen);
    if (badgeEl) {
      badgeEl.textContent = `Sisa: ${occ.remainingCapacity} Ton`;
      badgeEl.style.color = occ.remainingCapacity > 0 ? '#10b981' : '#ef4444';
    }
    if (hintEl) {
      if (occ.items.length > 0) {
        const whoList = occ.items.map(it => `${it.code} (${it.supir || it.name || '-'}: ${it.tonase || 0}T)`).join(', ');
        hintEl.innerHTML = `Terisi: <strong>${occ.totalTonase}/30T</strong> &bull; Atas nama: ${escapeHtml(whoList)}. Maksimal muatan baru: <strong>${occ.remainingCapacity} Ton</strong>.`;
      } else {
        hintEl.innerHTML = `Unit kosong siap diisi muatan penuh hingga <strong>30 Ton</strong>.`;
      }
    }
    const inputTonase = document.getElementById('inputTonase');
    if (inputTonase && (!inputTonase.value || parseFloat(inputTonase.value) > occ.remainingCapacity)) {
      if (occ.remainingCapacity > 0) {
        inputTonase.value = Math.min(10.0, occ.remainingCapacity);
      }
    }
  };

  selectEl.onchange = refreshUnitHint;
  refreshUnitHint();
}
window.updateAddFormUnitOptions = updateAddFormUnitOptions;

function openAddModal(targetStepId = null, targetMachineUnit = null) {
  document.getElementById('addForm').reset();
  const nextCode = getNextItemCode();
  const inputKode = document.getElementById('inputKode');
  const inputSupir = document.getElementById('inputSupir');
  const inputTruk = document.getElementById('inputTruk');
  const inputJenisPadi = document.getElementById('inputJenisPadi');
  const inputNama = document.getElementById('inputNama');
  const inputTonase = document.getElementById('inputTonase');
  const inputStartStep = document.getElementById('inputStartStep');

  if (inputKode) inputKode.value = nextCode;
  if (inputSupir) inputSupir.value = '';
  if (inputTruk) inputTruk.value = '';
  if (inputJenisPadi) inputJenisPadi.value = 'Inpari 32';
  if (inputNama) inputNama.value = `Padi ${nextCode}`;
  if (inputTonase) inputTonase.value = '10.0';

  const defaultStep = targetStepId || (inputStartStep ? inputStartStep.value : 'A-silo') || 'A-silo';
  if (inputStartStep) {
    inputStartStep.value = defaultStep;
  }

  updateAddFormUnitOptions(defaultStep, targetMachineUnit);

  const bannerEl = document.getElementById('addModalStandbyBanner');
  if (bannerEl) {
    const standbyList = items.filter(i => (i.status === 'standby' || !i.currentStepId) && i.status !== 'completed');
    if (standbyList.length > 0) {
      bannerEl.style.display = 'block';
      const destText = targetMachineUnit ? `ke <strong>${escapeHtml(targetMachineUnit)}</strong>` : 'ke mesin';
      bannerEl.innerHTML = `
        <div style="background: rgba(16, 185, 129, 0.1); border: 1.5px solid rgba(16, 185, 129, 0.35); border-radius: 10px; padding: 10px 12px; font-size: 11.5px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 6px;">
            <span style="font-weight: 800; color: #34d399;">PADI STANDBY TERSEDIA (${standbyList.length})</span>
            <span style="color: var(--text-lavender); font-size: 10.5px;">Pilih untuk langsung masukkan ${destText}:</span>
          </div>
          <div style="display: flex; flex-direction: column; gap: 5px; max-height: 120px; overflow-y: auto;">
            ${standbyList.map(st => `
              <div style="display:flex; justify-content:space-between; align-items:center; background: rgba(255,255,255,0.04); padding: 5px 8px; border-radius: 6px;">
                <div style="font-size: 11px;">
                  <strong style="color:#60a5fa; font-family:'JetBrains Mono';">${escapeHtml(st.code)}</strong>
                  <span style="color:#ffffff;"> &bull; ${escapeHtml(st.supir || st.name)}</span>
                  <span style="color:var(--text-lavender);"> (${st.tonase || 10}T)</span>
                </div>
                <button type="button" class="btn btn-add btn-sm" style="font-size: 10.5px; padding: 3px 8px; background: #10b981; border: none; font-weight: 700; cursor: pointer;" onclick="assignExistingItemToMachine('${st.id}', '${defaultStep}', ${targetMachineUnit ? `'${escapeHtml(targetMachineUnit)}'` : 'null'}); closeAddModal();">
                  Masukkan
                </button>
              </div>
            `).join('')}
          </div>
        </div>
      `;
    } else {
      bannerEl.style.display = 'none';
      bannerEl.innerHTML = '';
    }
  }

  document.getElementById('addModal').classList.add('open');
}
window.openAddModal = openAddModal;

function closeAddModal() {
  document.getElementById('addModal').classList.remove('open');
}

function handleAddSubmit(e) {
  e.preventDefault();
  const inputKodeEl = document.getElementById('inputKode');
  const inputSupirEl = document.getElementById('inputSupir');
  const inputTrukEl = document.getElementById('inputTruk');
  const inputJenisPadiEl = document.getElementById('inputJenisPadi');
  const inputNamaEl = document.getElementById('inputNama');
  const inputTonaseEl = document.getElementById('inputTonase');
  const inputStartStepEl = document.getElementById('inputStartStep');
  const inputTargetUnitEl = document.getElementById('inputTargetUnit');
  const targetUnitContainer = document.getElementById('targetUnitContainer');

  const kode = (inputKodeEl ? inputKodeEl.value.trim().toUpperCase() : '') || getNextItemCode();
  const supir = inputSupirEl ? inputSupirEl.value.trim() : '';
  const truk = inputTrukEl ? inputTrukEl.value.trim().toUpperCase() : '';
  const jenisPadi = (inputJenisPadiEl && inputJenisPadiEl.value.trim()) || 'Inpari 32';
  let nama = inputNamaEl ? inputNamaEl.value.trim() : '';
  if (!nama || nama.startsWith('Barang Masuk') || nama.startsWith('Padi ')) {
    nama = supir ? `Padi ${kode} - ${supir}` : `Padi ${kode}`;
  }
  const tonase = parseFloat(inputTonaseEl ? inputTonaseEl.value : 10) || 10.0;
  const startStep = inputStartStepEl ? inputStartStepEl.value : 'A-silo';
  const chosenUnit = (targetUnitContainer && targetUnitContainer.style.display !== 'none' && inputTargetUnitEl) ? inputTargetUnitEl.value : null;

  const nowIso = new Date().toISOString();
  const stepHistory = {};

  SUBSTEPS.forEach(s => {
    stepHistory[s.id] = { startedAt: null, completedAt: null, passed: false, stops: [] };
  });

  let currentStepId = null;
  let status = 'standby';
  let isQueued = false;
  let gilingType = '';
  const assignedMachines = {};

  if (startStep && startStep !== 'standby') {
    const startIdx = getSubstepIndex(startStep);
    currentStepId = startStep;
    status = 'active';

    SUBSTEPS.forEach((step, idx) => {
      if (idx < startIdx) {
        stepHistory[step.id].passed = true;
        stepHistory[step.id].startedAt = nowIso;
        stepHistory[step.id].completedAt = nowIso;
      } else if (idx === startIdx) {
        stepHistory[step.id].startedAt = nowIso;
      }
    });

    const isMultiCap = (startStep === 'A-silo' || startStep === 'B-dryer' || startStep === 'C-silo');
    const stepObj = getSubstep(startStep);

    if (isMultiCap) {
      let targetUnit = chosenUnit;
      if (targetUnit) {
        if (isMachineUnderMaintenance(startStep, targetUnit)) {
          showToast(`⛔ Unit ${targetUnit} sedang dalam perbaikan! Silakan pilih unit lain.`);
          return;
        }
        const occ = getMachineUnitOccupancy(startStep, targetUnit);
        if (occ.totalTonase + tonase > UNIT_MAX_CAPACITY) {
          showToast(`⛔ ${targetUnit} tidak muat! Kapasitas saat ini ${occ.totalTonase}/30 Ton, sisa ${occ.remainingCapacity} Ton (Anda memasukkan ${tonase} Ton).`);
          return;
        }
        assignedMachines[startStep] = targetUnit;
        stepHistory[startStep].machine = targetUnit;
      } else {
        // Cari unit yang masih kosong dahulu jika muat
        for (let u = 1; u <= stepObj.unitCount; u++) {
          const uName = `${stepObj.unitPrefix} ${u}`;
          if (isMachineUnderMaintenance(startStep, uName)) continue;
          const occ = getMachineUnitOccupancy(startStep, uName);
          if (occ.count === 0 && tonase <= UNIT_MAX_CAPACITY) {
            assignedMachines[startStep] = uName;
            stepHistory[startStep].machine = uName;
            break;
          }
        }
        // Jika tidak ada unit kosong, cari unit yang masih muat (kapasitas sisa >= tonase)
        if (!assignedMachines[startStep]) {
          for (let u = 1; u <= stepObj.unitCount; u++) {
            const uName = `${stepObj.unitPrefix} ${u}`;
            if (isMachineUnderMaintenance(startStep, uName)) continue;
            const occ = getMachineUnitOccupancy(startStep, uName);
            if (occ.remainingCapacity >= tonase) {
              assignedMachines[startStep] = uName;
              stepHistory[startStep].machine = uName;
              break;
            }
          }
        }
        if (!assignedMachines[startStep]) {
          assignedMachines[startStep] = `${stepObj.unitPrefix} 1`;
          stepHistory[startStep].machine = `${stepObj.unitPrefix} 1`;
        }
      }
    } else if (stepObj && stepObj.unitCount > 1) {
      const occupied = getOccupiedMachines(startStep, null);
      for (let u = 1; u <= stepObj.unitCount; u++) {
        const uName = `${stepObj.unitPrefix} ${u}`;
        if (!occupied[uName] && !isMachineUnderMaintenance(startStep, uName)) {
          assignedMachines[startStep] = uName;
          stepHistory[startStep].machine = uName;
          break;
        }
      }
      if (!assignedMachines[startStep]) {
        for (let u = 1; u <= stepObj.unitCount; u++) {
          const uName = `${stepObj.unitPrefix} ${u}`;
          if (!isMachineUnderMaintenance(startStep, uName)) {
            assignedMachines[startStep] = uName;
            stepHistory[startStep].machine = uName;
            break;
          }
        }
      }
      if (!assignedMachines[startStep]) {
        assignedMachines[startStep] = `${stepObj.unitPrefix} 1`;
      }
    } else if (startStep === 'C-giling') {
      const inputGilingTypeEl = document.getElementById('inputGilingType');
      gilingType = (inputGilingTypeEl && inputGilingTypeEl.value) || 'PK';
      stepHistory['C-giling'].gilingType = gilingType;
      assignedMachines['C-giling'] = 'Mesin Giling 1';
      stepHistory['C-giling'].machine = 'Mesin Giling 1';
      const isBusy = isGilingMachineBusy(null);
      isQueued = isBusy;
      if (isBusy) {
        stepHistory['C-giling'].queuedAt = nowIso;
        stepHistory['C-giling'].startedAt = null;
      }
    } else if (startStep === 'D-mix') {
      assignedMachines['D-mix'] = 'Mesin Mix';
      stepHistory['D-mix'].machine = 'Mesin Mix';
    } else if (startStep === 'D-packing') {
      assignedMachines['D-packing'] = 'Mesin Packing';
      stepHistory['D-packing'].machine = 'Mesin Packing';
    }
  }

  const newItem = {
    id: 'item_' + Date.now(),
    code: kode,
    supir: supir,
    truk: truk,
    jenisPadi: jenisPadi,
    name: nama,
    jenis: jenisPadi,
    tonase: tonase,
    tonaseAkhir: null,
    selesaiLokasi: 'Gudang',
    catatanSelesai: '',
    masukAt: status === 'active' ? nowIso : null,
    completedAt: null,
    stoppedAt: null,
    stopReason: '',
    currentStepId: currentStepId,
    status: status,
    assignedMachines: assignedMachines,
    gilingType: gilingType,
    isQueuedForGiling: isQueued,
    stepHistory: stepHistory,
    stopLog: []
  };

  items.push(newItem);
  saveData();
  renderTable();
  closeAddModal();
  showToast(`Padi Masuk ${kode} (${supir ? supir + ' • ' : ''}${jenisPadi}) berhasil dicatat!`);
}

/**
 * Edit Nama & Informasi Barang (Supir, Truk, Jenis Padi, Tonase)
 */
function openEditModal(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const setVal = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = val !== undefined && val !== null ? val : '';
  };

  setVal('editItemId', item.id);
  setVal('editKode', item.code || '');
  setVal('editSupir', item.supir || '');
  setVal('editTruk', item.truk || '');
  setVal('editJenisPadi', item.jenisPadi || item.jenis || '');
  setVal('editTonase', item.tonase || 10);
  setVal('editNama', item.name || '');

  document.getElementById('editModal').classList.add('open');
}
window.openEditModal = openEditModal;

function closeEditModal() {
  document.getElementById('editModal').classList.remove('open');
}

function handleEditSubmit(e) {
  e.preventDefault();
  const getVal = (id) => {
    const el = document.getElementById(id);
    return el ? el.value.trim() : '';
  };

  const id = getVal('editItemId');
  const kode = getVal('editKode').toUpperCase() || 'A1';
  const supir = getVal('editSupir');
  const truk = getVal('editTruk').toUpperCase();
  const jenisPadi = getVal('editJenisPadi') || 'Inpari 32';
  let nama = getVal('editNama');
  if (!nama || nama.startsWith('Barang Masuk') || nama.startsWith('Padi ')) {
    nama = supir ? `Padi ${kode} - ${supir}` : `Padi ${kode}`;
  }
  const tonase = parseFloat(getVal('editTonase')) || 10.0;

  const item = items.find(i => i.id === id);
  if (item) {
    // Validasi tonase baru jika sedang berada di unit mesin berkapasitas 30 Ton
    if (item.currentStepId && (item.currentStepId === 'A-silo' || item.currentStepId === 'B-dryer' || item.currentStepId === 'C-silo')) {
      const curMachine = item.assignedMachines?.[item.currentStepId];
      if (curMachine) {
        const occ = getMachineUnitOccupancy(item.currentStepId, curMachine, item.id);
        if (occ.totalTonase + tonase > UNIT_MAX_CAPACITY) {
          showToast(`⛔ Tonase baru (${tonase}T) melebihi batas kapasitas 30 Ton di ${curMachine}! (Saat ini terisi: ${occ.totalTonase}T, sisa: ${occ.remainingCapacity}T).`);
          return;
        }
      }
    }

    const oldCode = item.code;
    item.code = kode;
    item.supir = supir;
    item.truk = truk;
    item.jenisPadi = jenisPadi;
    item.jenis = jenisPadi;
    item.name = nama;
    item.tonase = tonase;

    saveData();
    renderTable();
    closeEditModal();
    if (activeModalItemId === id) {
      openDetailModal(id);
    }
    showToast(`Informasi berhasil diubah: ${oldCode} ➔ ${kode} (${nama})`);
  }
}

/**
 * BUKU CATATAN & CEK BARANG MASUK (LOG TRUK & PADI SESUAI SKETSA)
 * Fitur:
 * 1. Tab [Mesin Aktif]: Kartu alur mesin yang sedang aktif / standby (pentok penuh 5-7 kolom)
 * 2. Tab [Mutasi Riwayat]: Rekap mutasi barang yang sudah selesai (kode, supir, truk, padi, tonase, gudang/mobil, cetak slip)
 */
let currentLogbookView = 'active'; // 'active' | 'mutasi'
let currentLogPadiFilter = 'all';
let currentLogPadiSearch = '';

function switchLogbookView(mode) {
  currentLogbookView = mode === 'mutasi' ? 'mutasi' : 'active';

  const tabActive = document.getElementById('tabActiveLog');
  const tabMutasi = document.getElementById('tabMutasiLog');
  const sheetList = document.getElementById('logPadiSheetList');
  const mutasiContainer = document.getElementById('mutasiSheetContainer');
  const colPills = document.getElementById('colCountPills');
  const layoutPills = document.getElementById('layoutSwitchPills');

  if (tabActive) tabActive.classList.toggle('active', currentLogbookView === 'active');
  if (tabMutasi) tabMutasi.classList.toggle('active', currentLogbookView === 'mutasi');

  if (currentLogbookView === 'mutasi') {
    if (sheetList) sheetList.style.display = 'none';
    if (mutasiContainer) mutasiContainer.style.display = 'block';
    if (colPills) colPills.style.display = 'none';
    renderMutasiRiwayat();
  } else {
    if (sheetList) sheetList.style.display = 'grid';
    if (mutasiContainer) mutasiContainer.style.display = 'none';
    if (colPills) colPills.style.display = 'flex';
    renderLogPadiSheet();
  }
  updateLogbookTabBadges();
}
window.switchLogbookView = switchLogbookView;

function updateLogbookTabBadges() {
  const activeCount = items.filter(i => i.status !== 'completed').length;
  const mutasiCount = items.filter(i => i.status === 'completed').length;
  const badgeActive = document.getElementById('badgeActiveCount');
  const badgeMutasi = document.getElementById('badgeMutasiCount');
  const totalCountEl = document.getElementById('logPadiTotalCount');
  if (badgeActive) badgeActive.textContent = String(activeCount);
  if (badgeMutasi) badgeMutasi.textContent = String(mutasiCount);
  if (totalCountEl) totalCountEl.textContent = `${items.length} Padi`;
}
window.updateLogbookTabBadges = updateLogbookTabBadges;

function setLogPadiFilter(filter) {
  currentLogPadiFilter = filter;
  document.querySelectorAll('#logFilterPills .log-filter-btn').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.filter === filter);
  });

  if (filter === 'completed') {
    switchLogbookView('mutasi');
  } else {
    if (currentLogbookView === 'mutasi') {
      switchLogbookView('active');
    } else {
      renderLogPadiSheet();
    }
  }
}
window.setLogPadiFilter = setLogPadiFilter;

function handleLogPadiSearch(query) {
  currentLogPadiSearch = (query || '').trim().toLowerCase();
  const clearBtn = document.getElementById('btnClearLogSearch');
  if (clearBtn) {
    clearBtn.style.display = currentLogPadiSearch ? 'block' : 'none';
  }
  if (currentLogbookView === 'mutasi') {
    renderMutasiRiwayat();
  } else {
    renderLogPadiSheet();
  }
}
window.handleLogPadiSearch = handleLogPadiSearch;

function clearLogPadiSearch() {
  const input = document.getElementById('logPadiSearchInput');
  if (input) input.value = '';
  handleLogPadiSearch('');
}
window.clearLogPadiSearch = clearLogPadiSearch;

let currentGridCols = 'auto';
try {
  currentGridCols = localStorage.getItem('monitoring_mesin_grid_cols') || 'auto';
} catch(e) {}

function setGridColumns(cols) {
  currentGridCols = String(cols);
  try {
    localStorage.setItem('monitoring_mesin_grid_cols', currentGridCols);
  } catch(e) {}
  applyGridColumns();
}
window.setGridColumns = setGridColumns;

function applyGridColumns() {
  const container = document.getElementById('logPadiSheetList');
  if (!container) return;

  // Update active state on buttons
  const buttons = document.querySelectorAll('#colCountPills .col-btn');
  buttons.forEach(btn => {
    btn.classList.toggle('active', btn.getAttribute('data-cols') === currentGridCols);
  });

  const viewport = document.getElementById('floorPlanViewport');
  const isSide = viewport && viewport.classList && typeof viewport.classList.contains === 'function' && viewport.classList.contains('layout-side');
  if (isSide) {
    container.style.gridTemplateColumns = 'none';
    return;
  }

  // Hitung jumlah kartu aktif aktual (abaikan placeholder empty-state)
  let childCards = [];
  if (typeof container.querySelectorAll === 'function') {
    childCards = Array.from(container.querySelectorAll('.log-compact-card'));
  } else if (container.children && typeof container.children[Symbol.iterator] === 'function') {
    childCards = Array.from(container.children).filter(el => el.classList && el.classList.contains && el.classList.contains('log-compact-card'));
  }
  const cardCount = childCards.length;

  const hasEmptyState = typeof container.querySelector === 'function' ? !!container.querySelector('.log-empty-state') : false;
  if (cardCount === 0 || hasEmptyState) {
    container.style.gridTemplateColumns = '1fr';
    return;
  }

  if (currentGridCols === 'auto') {
    // Mode Auto: Pentok 100% full width edge-to-edge tanpa menyisakan ruang kosong di kanan
    if (cardCount <= 7) {
      container.style.gridTemplateColumns = `repeat(${cardCount}, minmax(0, 1fr))`;
    } else {
      // Jika lebih dari 7 kartu, tata dalam grid 5-7 kolom per baris agar muat proporsional
      const cols = Math.min(Math.max(Math.ceil(cardCount / 2), 5), 7);
      container.style.gridTemplateColumns = `repeat(${cols}, minmax(0, 1fr))`;
    }
  } else {
    const targetCols = parseInt(currentGridCols, 10) || 5;
    // Jika jumlah kartu kurang dari target kolom (misal ada 5 kartu tapi dipilih 6 kolom),
    // pentokin penuh selebar kartu yang ada agar tidak menyisakan kolom kosong di kanan
    const effectiveCols = cardCount < targetCols ? cardCount : targetCols;
    container.style.gridTemplateColumns = `repeat(${effectiveCols}, minmax(0, 1fr))`;
  }
}
window.applyGridColumns = applyGridColumns;

if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
  window.addEventListener('resize', () => {
    applyGridColumns();
  });
}

function setKodeLayout(mode) {
  const viewport = document.getElementById('floorPlanViewport');
  const btnBottom = document.getElementById('btnLayoutBottom');
  const btnSide = document.getElementById('btnLayoutSide');
  const btnHide = document.getElementById('btnLayoutHide');
  if (!viewport) return;

  viewport.classList.remove('layout-bottom', 'layout-side', 'layout-hidden');
  if (btnBottom) btnBottom.classList.remove('active');
  if (btnSide) btnSide.classList.remove('active');
  if (btnHide) btnHide.classList.remove('active');

  if (mode === 'side') {
    viewport.classList.add('layout-side');
    if (btnSide) btnSide.classList.add('active');
  } else if (mode === 'hidden') {
    viewport.classList.add('layout-hidden');
    if (btnHide) btnHide.classList.add('active');
  } else {
    // Default: 'bottom'
    viewport.classList.add('layout-bottom');
    if (btnBottom) btnBottom.classList.add('active');
    mode = 'bottom';
  }

  try {
    localStorage.setItem('monitoring_mesin_kode_layout', mode);
  } catch(e) {}

  applyGridColumns();
}
window.setKodeLayout = setKodeLayout;

function scrollToKodePenjelasan(tab) {
  const viewport = document.getElementById('floorPlanViewport');
  if (viewport && viewport.classList.contains('layout-hidden')) {
    setKodeLayout('bottom');
  }
  if (tab === 'mutasi') {
    switchLogbookView('mutasi');
  } else if (tab === 'active') {
    switchLogbookView('active');
  }
  const card = document.getElementById('penjelasanKodeCard');
  if (card) {
    card.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    card.classList.add('flash-highlight');
    setTimeout(() => card.classList.remove('flash-highlight'), 1800);
    const searchInput = document.getElementById('logPadiSearchInput');
    if (searchInput) searchInput.focus();
  }
}
window.scrollToKodePenjelasan = scrollToKodePenjelasan;
window.scrollToLogPadi = scrollToKodePenjelasan;
window.toggleKodeSidebar = scrollToKodePenjelasan;

function renderLogPadiSheet() {
  const container = document.getElementById('logPadiSheetList');
  if (!container) return;

  updateLogbookTabBadges();

  let filtered = items;
  // Default di tab Mesin Aktif: barang yang selesai dipisahkan ke Mutasi Riwayat
  if (currentLogPadiFilter === 'active') {
    filtered = filtered.filter(i => i.status === 'active' || i.status === 'stopped');
  } else if (currentLogPadiFilter === 'standby') {
    filtered = filtered.filter(i => i.status === 'standby' || !i.currentStepId);
  } else if (currentLogPadiFilter === 'completed') {
    filtered = filtered.filter(i => i.status === 'completed');
  } else {
    // 'all': di tampilan aktif, tampilkan barang yang sedang berjalan & standby
    filtered = filtered.filter(i => i.status !== 'completed');
  }

  if (currentLogPadiSearch) {
    filtered = filtered.filter(i => {
      const code = (i.code || '').toLowerCase();
      const supir = (i.supir || '').toLowerCase();
      const truk = (i.truk || '').toLowerCase();
      const jenis = (i.jenisPadi || i.jenis || '').toLowerCase();
      const name = (i.name || '').toLowerCase();
      return code.includes(currentLogPadiSearch) || 
             supir.includes(currentLogPadiSearch) || 
             truk.includes(currentLogPadiSearch) || 
             jenis.includes(currentLogPadiSearch) || 
             name.includes(currentLogPadiSearch);
    });
  }

  if (filtered.length === 0) {
    const completedCount = items.filter(i => i.status === 'completed').length;
    if (currentLogPadiSearch) {
      container.innerHTML = `
        <div class="log-empty-state" style="grid-column: 1 / -1; padding: 18px;">
          
          <div>Tidak ada data mesin aktif cocok dengan <strong>"${escapeHtml(currentLogPadiSearch)}"</strong></div>
          <button type="button" class="btn btn-outline" onclick="clearLogPadiSearch()" style="margin-top: 8px; font-size: 11px; padding: 3px 8px;">Reset Pencarian</button>
        </div>
      `;
    } else if (completedCount > 0 && items.length === completedCount) {
      container.innerHTML = `
        <div class="log-empty-state" style="grid-column: 1 / -1; padding: 18px;">
          
          <div style="font-weight: 700; margin-bottom: 4px;">Seluruh ${completedCount} barang saat ini telah selesai diproses.</div>
          <div style="font-size: 11px; opacity: 0.8; margin-bottom: 10px;">Data dapat dicek di rekap mutasi atau tambahkan padi baru.</div>
          <div style="display: flex; justify-content: center; gap: 8px;">
            <button type="button" class="btn btn-outline btn-sm" onclick="switchLogbookView('mutasi')">Buka Mutasi Riwayat</button>
            <button type="button" class="btn btn-add btn-sm" onclick="openAddModal()">+ Tambah Padi</button>
          </div>
        </div>
      `;
    } else {
      container.innerHTML = `
        <div class="log-empty-state" style="grid-column: 1 / -1; padding: 18px;">
          
          <div>Belum ada data barang masuk yang aktif.</div>
          <button type="button" class="btn btn-add btn-sm" onclick="openAddModal()" style="margin-top: 8px; font-size: 11px; padding: 4px 10px;">+ Tambah Padi</button>
        </div>
      `;
    }
    return;
  }

  container.innerHTML = filtered.map(item => {
    const currentStep = getSubstep(item.currentStepId);
    let statusText = 'Standby';
    let statusClass = 'standby';
    let statusIcon = '';

    if (item.status === 'completed') {
      const locLabel = item.selesaiLokasi === 'Mobil' ? 'Mobil' : 'Gudang';
      statusText = `Selesai (${locLabel})`;
      statusClass = 'completed';
      statusIcon = 'Selesai';
    } else if (item.status === 'stopped') {
      const machineTitle = (item.assignedMachines && item.assignedMachines[currentStep?.id]) || currentStep?.lineName || 'Mesin';
      statusText = `Kendala • ${machineTitle}`;
      statusClass = 'stopped';
      statusIcon = '⚠️';
    } else if (currentStep?.id === 'C-giling' && item.isQueuedForGiling) {
      statusText = `Antri Giling (${item.gilingType || 'PK'})`;
      statusClass = 'queued';
      statusIcon = '';
    } else if (currentStep?.id === 'D-mix' && item.isQueuedForMix) {
      statusText = `Antri Mix`;
      statusClass = 'queued';
      statusIcon = '';
    } else if (item.status === 'active' && currentStep) {
      const machineTitle = (item.assignedMachines && item.assignedMachines[currentStep.id]) || (currentStep.id === 'C-giling' ? `Giling (${item.gilingType || 'PK'})` : currentStep.lineName);
      statusText = `${currentStep.stageKey} • ${machineTitle}`;
      statusClass = 'active';
      statusIcon = '🟢';
    }

    return `
      <div class="log-compact-card" id="logRow_${item.id}">
        <!-- Baris Atas: Kode Unik PMD0001, Status Badge, dan Tonase -->
        <div class="log-card-top-row">
          <div class="log-code-badge-col">
            <span class="log-code-box">${escapeHtml(item.code)}</span>
            <span class="log-code-colon">:</span>
          </div>
          <div class="log-status-tag ${statusClass}">
            <span>${statusIcon}</span>
            <span>${escapeHtml(statusText)}</span>
          </div>
          <span class="log-card-tonase">${item.tonase || 10}T</span>
        </div>

        <!-- Baris Tengah: Pill Supir, Truk, dan Jenis Padi -->
        <div class="log-card-specs-row">
          <span class="spec-pill supir-pill" title="Supir"><strong>${escapeHtml(item.supir || '-')}</strong></span>
          <span class="spec-pill truk-pill" title="No. Truk"><strong>${escapeHtml(item.truk || '-')}</strong></span>
          <span class="spec-pill padi-pill" title="Jenis Padi"><strong>${escapeHtml(item.jenisPadi || item.jenis || 'Gabah')}</strong></span>
        </div>

        <!-- Baris Bawah: Waktu Masuk dan Tombol Aksi -->
        <div class="log-card-action-row">
          <span class="log-card-time">${item.masukAt ? formatDateTimeShort(item.masukAt) : 'Belum Mulai'}</span>
          <div class="log-actions-cluster">
            <button type="button" class="btn-log-action" onclick="openDetailModal('${item.id}')" title="Lihat riwayat alur lengkap">Detail Cek</button>
            <button type="button" class="btn-log-action" onclick="openEditModal('${item.id}')" title="Ubah supir, truk, jenis padi">Edit Ubah</button>
            <button type="button" class="btn-log-action" onclick="deleteItem('${item.id}')" title="Hapus barang ini" style="color: #f87171;">Hapus</button>
          </div>
        </div>
      </div>
    `;
  }).join('');
  applyGridColumns();
}
window.renderLogPadiSheet = renderLogPadiSheet;

/**
 * MUTASI RIWAYAT BARANG SELESAI (WAREHOUSE STOCK MUTATION LOG)
 * Rekap mutasi barang yang sudah selesai:
 * Kode barang, supir, truk, jenis padi, tonase, gudang/mobil, durasi, dan cetak bukti slip
 */
function renderMutasiRiwayat() {
  const container = document.getElementById('mutasiSheetContainer');
  if (!container) return;

  updateLogbookTabBadges();

  let completedList = items.filter(i => i.status === 'completed');

  if (currentLogPadiSearch) {
    completedList = completedList.filter(i => {
      const code = (i.code || '').toLowerCase();
      const supir = (i.supir || '').toLowerCase();
      const truk = (i.truk || '').toLowerCase();
      const jenis = (i.jenisPadi || i.jenis || '').toLowerCase();
      const name = (i.name || '').toLowerCase();
      return code.includes(currentLogPadiSearch) || 
             supir.includes(currentLogPadiSearch) || 
             truk.includes(currentLogPadiSearch) || 
             jenis.includes(currentLogPadiSearch) || 
             name.includes(currentLogPadiSearch);
    });
  }

  const totalCompleted = completedList.length;
  const totalTonase = completedList.reduce((acc, i) => acc + (parseFloat(i.tonaseAkhir || i.tonase) || 0), 0);
  const countGudang = completedList.filter(i => i.selesaiLokasi !== 'Mobil').length;
  const countMobil = completedList.filter(i => i.selesaiLokasi === 'Mobil').length;

  let contentHtml = `
    <div class="mutasi-summary-bar">
      <div class="mutasi-stats-cluster">
        <div class="mutasi-stat-box">
          <span class="mutasi-stat-num">${totalCompleted} Batch</span>
          <span class="mutasi-stat-lbl">Total Selesai</span>
        </div>
        <div class="mutasi-stat-box">
          <span class="mutasi-stat-num" style="color: #10b981;">${totalTonase.toFixed(1)} T</span>
          <span class="mutasi-stat-lbl">Total Tonase</span>
        </div>
        <div class="mutasi-stat-box">
          <span class="mutasi-stat-num" style="color: #60a5fa;">${countGudang} Padi</span>
          <span class="mutasi-stat-lbl">Masuk Gudang</span>
        </div>
        <div class="mutasi-stat-box">
          <span class="mutasi-stat-num" style="color: #34d399;">${countMobil} Padi</span>
          <span class="mutasi-stat-lbl">Muat Truk</span>
        </div>
      </div>

      <div class="mutasi-actions-group">
        <button type="button" class="btn btn-outline btn-sm" onclick="printMutasiReport()" title="Cetak Rekap Laporan Mutasi Barang Selesai">
          Cetak Rekap Mutasi
        </button>
        <button type="button" class="btn btn-subtle btn-sm" onclick="exportMutasiCSV()" title="Unduh Data Mutasi format CSV / Excel">
          Ekspor CSV
        </button>
        <button type="button" class="btn btn-outline btn-sm" onclick="switchLogbookView('active')" title="Kembali ke tampilan kartu mesin aktif">
          Lihat Mesin Aktif
        </button>
      </div>
    </div>
  `;

  if (completedList.length === 0) {
    if (currentLogPadiSearch) {
      contentHtml += `
        <div class="log-empty-state" style="padding: 24px;">
          
          <div>Tidak ada riwayat mutasi cocok dengan pencarian <strong>"${escapeHtml(currentLogPadiSearch)}"</strong></div>
          <button type="button" class="btn btn-outline btn-sm" onclick="clearLogPadiSearch()" style="margin-top: 8px;">Reset Pencarian</button>
        </div>
      `;
    } else {
      contentHtml += `
        <div class="log-empty-state" style="padding: 28px;">
          
          <div style="font-weight: 700; font-size: 13.5px; margin-bottom: 4px;">Belum ada riwayat barang yang selesai diproses</div>
          <div style="font-size: 11.5px; opacity: 0.8; max-width: 500px; margin: 0 auto 12px auto;">
            Ketika barang menyelesaikan seluruh tahapan alur (Silo Basah ➔ Dryer ➔ Silo Kering ➔ Giling) dan dipindahkan ke Gudang atau Truk, riwayat mutasi akan otomatis tercatat di sini.
          </div>
          <button type="button" class="btn btn-outline btn-sm" onclick="switchLogbookView('active')">
            Buka Tampilan Mesin Aktif
          </button>
        </div>
      `;
    }
    container.innerHTML = contentHtml;
    return;
  }

  // Sort descending: yang baru selesai di atas
  const sortedList = [...completedList].sort((a, b) => {
    const timeA = a.completedAt ? new Date(a.completedAt).getTime() : 0;
    const timeB = b.completedAt ? new Date(b.completedAt).getTime() : 0;
    return timeB - timeA;
  });

  const tableRowsHtml = sortedList.map((item, idx) => {
    const locBadge = item.selesaiLokasi === 'Mobil'
      ? `<span class="mutasi-loc-badge mobil">Muat Truk</span>`
      : `<span class="mutasi-loc-badge gudang">Masuk Gudang</span>`;

    // Jejak alur mesin yang dilewati (lengkap dengan jejak siklus pengulangan)
    const trailItems = getItemJourneyTrail(item);
    const trailHtml = trailItems.length > 0 
      ? trailItems.map(t => {
          let label = '';
          if (t.stepId === 'A-silo') label = `Silo Basah (${t.machine?.replace('Silo Basah ', '') || '1'})`;
          else if (t.stepId === 'B-dryer') label = `Dryer (${t.machine?.replace('Dryer ', '') || '1'})`;
          else if (t.stepId === 'C-silo') label = `Silo Kering (${t.machine?.replace('Silo Kering ', '') || '1'})`;
          else if (t.stepId === 'C-giling') label = `Giling (${item.gilingType || 'PK'})`;
          else if (t.stepId === 'D-mix') label = `Mix`;
          else if (t.stepId === 'D-packing') label = `Packing`;
          else label = t.machine || t.stepName;

          if (t.isRecycle) {
            return `<span class="trail-mini-pill trail-recycle" title="Pengeringan Ulang Siklus ke-${t.cycle} (Gabah Masih Basah)">⚠️ ${escapeHtml(label)} [Ulang]</span>`;
          }
          return `<span class="trail-mini-pill">${escapeHtml(label)}</span>`;
        }).join(' ➔ ')
      : '<span style="opacity: 0.6;">Alur Lengkap</span>';

    // Durasi total
    let durationStr = '-';
    if (item.masukAt && item.completedAt) {
      const durMs = Math.max(0, new Date(item.completedAt).getTime() - new Date(item.masukAt).getTime());
      const hours = Math.floor(durMs / (1000 * 60 * 60));
      const mins = Math.floor((durMs % (1000 * 60 * 60)) / (1000 * 60));
      durationStr = `${hours}j ${mins}m`;
    }

    const tonaseAwal = item.tonase || 10;
    const tonaseAkhir = item.tonaseAkhir || item.tonase || 10;

    // Catatan Mutasi Selesai
    let catatanHtml = '';
    if (item.recycleCount > 0) {
      catatanHtml = `
        <div style="display: flex; flex-direction: column; gap: 3px;">
          <span style="display: inline-flex; align-items: center; gap: 4px; padding: 2px 7px; border-radius: 5px; background: rgba(245, 158, 11, 0.18); border: 1px solid rgba(245, 158, 11, 0.45); color: #f59e0b; font-weight: 800; font-size: 10.5px; width: fit-content;" title="Gabah diulang ${item.recycleCount}x pengeringan karena masih basah">
            ⚠️ Diulang ${item.recycleCount}x (Masih Basah)
          </span>
          ${item.catatanSelesai && item.catatanSelesai !== 'Selesai normal' && !item.catatanSelesai.toLowerCase().includes('diulang') ? `<span style="font-size: 11px; color: #cbd5e1;">${escapeHtml(item.catatanSelesai)}</span>` : ''}
        </div>
      `;
    } else {
      catatanHtml = `<span style="color: #cbd5e1;">${escapeHtml(item.catatanSelesai || 'Selesai normal')}</span>`;
    }

    return `
      <tr>
        <td style="text-align: center; color: var(--text-lavender); font-weight: 700;">${idx + 1}</td>
        <td style="white-space: nowrap;">
          <div style="font-weight: 700; color: #ffffff;">${item.completedAt ? formatDateTimeShort(item.completedAt) : '-'}</div>
          <div style="font-size: 10px; color: var(--text-lavender);">Masuk: ${item.masukAt ? formatDateTimeShort(item.masukAt) : '-'}</div>
        </td>
        <td>
          <div style="display: flex; align-items: center; gap: 5px; flex-wrap: wrap;">
            <span class="log-code-box" style="font-size: 11.5px; padding: 2px 7px;">${escapeHtml(item.code)}</span>
            ${item.recycleCount > 0 ? `<span class="standby-picker-tag tag-recycle" style="font-size: 9px; padding: 1.5px 5px;" title="Gabah diulang ${item.recycleCount}x karena masih basah">⚠️ Ulang ${item.recycleCount}x</span>` : ''}
          </div>
        </td>
        <td style="white-space: nowrap;">
          <div style="font-weight: 700;">${escapeHtml(item.supir || '-')}</div>
          <div style="font-size: 10.5px; color: #fb923c; font-family: monospace;">${escapeHtml(item.truk || '-')}</div>
        </td>
        <td style="white-space: nowrap;">
          <span class="spec-pill padi-pill" style="font-size: 11px;">${escapeHtml(item.jenisPadi || item.jenis || 'Gabah')}</span>
        </td>
        <td style="white-space: nowrap;">
          <span style="opacity: 0.8; font-size: 10.5px;">${tonaseAwal}T</span> ➔ <strong style="color: #38bdf8; font-size: 12px;">${tonaseAkhir}T</strong>
        </td>
        <td>${locBadge}</td>
        <td>
          <div class="mutasi-trail-pills">${trailHtml}</div>
        </td>
        <td style="white-space: nowrap; font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #a5b4fc;">
          ${durationStr}
        </td>
        <td style="max-width: 170px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
          ${catatanHtml}
        </td>
        <td style="text-align: center; white-space: nowrap;">
          <div class="mutasi-actions-group" style="justify-content: center;">
            <button type="button" class="btn-log-action" onclick="openDetailModal('${item.id}')" title="Lihat riwayat alur lengkap">Detail</button>
            <button type="button" class="btn-log-action" onclick="printMutasiSlip('${item.id}')" title="Cetak Surat Bukti Mutasi Barang Selesai">Cetak Slip</button>
            <button type="button" class="btn-log-action" onclick="revertCompletedItem('${item.id}')" title="Batalkan status selesai & kembalikan ke mesin aktif" style="color: #f59e0b;">Batal Selesai</button>
          </div>
        </td>
      </tr>
    `;
  }).join('');

  contentHtml += `
    <div class="mutasi-table-scroll">
      <table class="mutasi-table">
        <thead>
          <tr>
            <th style="width: 34px; text-align: center;">No</th>
            <th>Waktu Selesai</th>
            <th>Kode Barang</th>
            <th>Supir & Truk</th>
            <th>Jenis Padi</th>
            <th>Tonase (Awal ➔ Akhir)</th>
            <th>Tujuan Mutasi</th>
            <th>Jejak Alur Mesin</th>
            <th>Durasi Total</th>
            <th>Catatan</th>
            <th style="text-align: center; width: 140px;">Aksi</th>
          </tr>
        </thead>
        <tbody>
          ${tableRowsHtml}
        </tbody>
      </table>
    </div>
  `;

  container.innerHTML = contentHtml;
}
window.renderMutasiRiwayat = renderMutasiRiwayat;

/**
 * BATALKAN SELESAI: Mengembalikan barang ke proses mesin aktif jika ada kekeliruan
 */
function revertCompletedItem(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const konfirmasi = confirm(`Batalkan status selesai untuk ${item.code} (${item.name || ''}) dan kembalikan ke alur mesin aktif?`);
  if (!konfirmasi) return;

  item.status = 'active';
  item.completedAt = null;
  if (!item.currentStepId) {
    item.currentStepId = 'D-packing';
  }

  saveData();
  renderTable();
  switchLogbookView('active');
  showToast(`↩️ Status ${item.code} berhasil dikembalikan ke alur mesin aktif.`);
}
window.revertCompletedItem = revertCompletedItem;

/**
 * CETAK SLIP BUKTI MUTASI BARANG SELESAI (SURAT PENGELUARAN / PENYIMPANAN GUDANG)
 */
function printMutasiSlip(itemId) {
  const item = items.find(i => i.id === itemId);
  if (!item) return;

  const printArea = document.getElementById('printReportArea');
  if (!printArea) return;

  const slipNo = `SLIP-MUT/${item.code}/${new Date().getFullYear()}`;
  const selesaiTime = item.completedAt ? formatDateTime(item.completedAt) : formatDateTime(new Date());
  const masukTime = item.masukAt ? formatDateTime(item.masukAt) : '-';
  const locLabel = item.selesaiLokasi === 'Mobil' ? 'Langsung Muat Mobil / Truk' : 'Masuk Gudang Penyimpanan';

  // Alur mesin
  const trailSteps = [];
  if (item.stepHistory) {
    if (item.assignedMachines?.['A-silo']) trailSteps.push(`Silo Basah: ${item.assignedMachines['A-silo']}`);
    if (item.assignedMachines?.['B-dryer']) trailSteps.push(`Dryer: ${item.assignedMachines['B-dryer']}`);
    if (item.assignedMachines?.['C-silo']) trailSteps.push(`Silo Kering: ${item.assignedMachines['C-silo']}`);
    if (item.stepHistory['C-giling']?.passed) trailSteps.push(`Mesin Giling (${item.gilingType || 'PK'})`);
    if (item.stepHistory['D-mix']?.passed) trailSteps.push('Mixer');
    if (item.stepHistory['D-packing']?.passed) trailSteps.push('Packing');
  }

  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #000000; line-height: 1.4;">
      <!-- Header Surat -->
      <div style="border-bottom: 2.5px solid #000000; padding-bottom: 12px; margin-bottom: 18px; display: flex; justify-content: space-between; align-items: flex-start;">
        <div>
          <h2 style="margin: 0; font-size: 20px; font-weight: 800; letter-spacing: 0.5px;">BUKTI MUTASI BARANG SELESAI PRODUKSI</h2>
          <div style="font-size: 13px; font-weight: 600; color: #1e293b; margin-top: 3px;">PT PADI MAKMUR SEJAHTERA • SISTEM KONTROL SCADA PABRIK</div>
          <div style="font-size: 11px; color: #475569;">Alamat Pabrik Penggilingan Beras Terpadu • Dokumen Sah Mutasi Pengeluaran</div>
        </div>
        <div style="text-align: right;">
          <div style="font-size: 13px; font-weight: 800; font-family: monospace; border: 1.5px solid #000; padding: 4px 8px; border-radius: 4px;">${slipNo}</div>
          <div style="font-size: 11px; color: #475569; margin-top: 4px;">Waktu Cetak: ${formatDateTime(new Date())}</div>
        </div>
      </div>

      <!-- Info Utama Barang -->
      <table style="width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px;">
        <tr style="background: #f1f5f9;">
          <td style="padding: 8px 12px; width: 25%; font-weight: bold; border: 1px solid #cbd5e1;">Kode Barang (Batch)</td>
          <td style="padding: 8px 12px; width: 25%; font-weight: bold; font-family: monospace; font-size: 14px; color: #0369a1; border: 1px solid #cbd5e1;">${escapeHtml(item.code)}</td>
          <td style="padding: 8px 12px; width: 25%; font-weight: bold; border: 1px solid #cbd5e1;">Jenis Padi / Beras</td>
          <td style="padding: 8px 12px; width: 25%; font-weight: bold; border: 1px solid #cbd5e1;">${escapeHtml(item.jenisPadi || item.jenis || 'Gabah')}</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Nama Supir</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${escapeHtml(item.supir || '-')}</td>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">No. Truk / Polisi</td>
          <td style="padding: 8px 12px; font-family: monospace; font-weight: bold; border: 1px solid #cbd5e1;">${escapeHtml(item.truk || '-')}</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Tonase Awal (Masuk)</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${item.tonase || 10} Ton</td>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Tonase Akhir (Selesai)</td>
          <td style="padding: 8px 12px; font-weight: bold; color: #047857; border: 1px solid #cbd5e1;">${item.tonaseAkhir || item.tonase || 10} Ton</td>
        </tr>
        <tr>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Tujuan Mutasi Selesai</td>
          <td style="padding: 8px 12px; font-weight: bold; color: #0284c7; border: 1px solid #cbd5e1;">${locLabel}</td>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Waktu Selesai</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${selesaiTime}</td>
        </tr>
        <tr style="background: #f8fafc;">
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Waktu Masuk Pertama</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${masukTime}</td>
          <td style="padding: 8px 12px; font-weight: bold; border: 1px solid #cbd5e1;">Catatan Mutasi</td>
          <td style="padding: 8px 12px; border: 1px solid #cbd5e1;">${escapeHtml(item.catatanSelesai || 'Selesai normal')}</td>
        </tr>
      </table>

      <!-- Jejak Alur Mesin yang Dijalani -->
      <div style="border: 1px solid #cbd5e1; border-radius: 6px; padding: 12px; margin-bottom: 24px; background: #fafafa;">
        <div style="font-weight: bold; font-size: 11.5px; margin-bottom: 6px; text-transform: uppercase; color: #334155;">
          Riwayat Alur Mesin yang Dilewati:
        </div>
        <div style="font-size: 11px; line-height: 1.6; color: #1e293b;">
          ${trailSteps.length > 0 ? trailSteps.join(' ➔ ') : 'Silo Basah ➔ Dryer ➔ Silo Kering ➔ Mesin Giling ➔ Packing'}
        </div>
      </div>

      <!-- Tanda Tangan 3 Kolom -->
      <div style="display: flex; justify-content: space-between; margin-top: 45px; text-align: center; font-size: 11.5px;">
        <div style="width: 28%;">
          <div>Petugas SCADA / Operator</div>
          <div style="height: 60px;"></div>
          <div style="border-top: 1px solid #000; padding-top: 4px; font-weight: bold;">( Operator Mesin )</div>
        </div>
        <div style="width: 28%;">
          <div>Kepala Gudang / Penerima</div>
          <div style="height: 60px;"></div>
          <div style="border-top: 1px solid #000; padding-top: 4px; font-weight: bold;">( Kepala Gudang )</div>
        </div>
        <div style="width: 28%;">
          <div>Supir Kendaraan</div>
          <div style="height: 60px;"></div>
          <div style="border-top: 1px solid #000; padding-top: 4px; font-weight: bold;">( ${escapeHtml(item.supir || 'Supir Truk')} )</div>
        </div>
      </div>
    </div>
  `;

  window.print();
}
window.printMutasiSlip = printMutasiSlip;

/**
 * CETAK REKAP LAPORAN MUTASI BARANG SELESAI
 */
function printMutasiReport() {
  const printArea = document.getElementById('printReportArea');
  if (!printArea) return;

  const completedList = items.filter(i => i.status === 'completed');
  const totalTon = completedList.reduce((sum, i) => sum + (parseFloat(i.tonaseAkhir || i.tonase) || 0), 0);

  const rowsHtml = completedList.map((item, idx) => {
    return `
      <tr>
        <td style="text-align: center;">${idx + 1}</td>
        <td>${item.completedAt ? formatDateTimeShort(item.completedAt) : '-'}</td>
        <td style="font-family: monospace; font-weight: bold;">${escapeHtml(item.code)}</td>
        <td>${escapeHtml(item.supir || '-')}</td>
        <td style="font-family: monospace;">${escapeHtml(item.truk || '-')}</td>
        <td>${escapeHtml(item.jenisPadi || item.jenis || 'Gabah')}</td>
        <td style="text-align: right;">${item.tonase || 10}T</td>
        <td style="text-align: right; font-weight: bold;">${item.tonaseAkhir || item.tonase || 10}T</td>
        <td>${item.selesaiLokasi === 'Mobil' ? 'Muat Truk' : 'Masuk Gudang'}</td>
        <td>${escapeHtml(item.catatanSelesai || 'Normal')}</td>
      </tr>
    `;
  }).join('');

  printArea.innerHTML = `
    <div style="font-family: Arial, sans-serif; padding: 25px; color: #000;">
      <div style="border-bottom: 2px solid #000; padding-bottom: 10px; margin-bottom: 16px; display: flex; justify-content: space-between;">
        <div>
          <h2 style="margin: 0; font-size: 18px;">REKAPITULASI MUTASI BARANG SELESAI GILING</h2>
          <div style="font-size: 12px; color: #475569;">PT PADI MAKMUR SEJAHTERA • LOGISTIK &amp; GUDANG</div>
        </div>
        <div style="text-align: right; font-size: 11px;">
          <div>Tanggal Cetak: ${formatDateTime(new Date())}</div>
          <div>Total Selesai: <strong>${completedList.length} Batch (${totalTon.toFixed(1)} Ton)</strong></div>
        </div>
      </div>

      <table class="report-print-table">
        <thead>
          <tr>
            <th>No</th>
            <th>Waktu Selesai</th>
            <th>Kode</th>
            <th>Supir</th>
            <th>No. Truk</th>
            <th>Jenis Padi</th>
            <th>Tonase Awal</th>
            <th>Tonase Akhir</th>
            <th>Lokasi Mutasi</th>
            <th>Keterangan</th>
          </tr>
        </thead>
        <tbody>
          ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="10" style="text-align:center;">Belum ada riwayat mutasi</td></tr>'}
        </tbody>
      </table>

      <div class="report-sign-row">
        <div class="report-sign-col">
          <div>Dibuat Oleh,</div>
          <div class="sign-underline">Petugas SCADA</div>
        </div>
        <div class="report-sign-col">
          <div>Diperiksa Oleh,</div>
          <div class="sign-underline">Supervisor Produksi</div>
        </div>
        <div class="report-sign-col">
          <div>Diterima Oleh,</div>
          <div class="sign-underline">Kepala Gudang</div>
        </div>
      </div>
    </div>
  `;

  window.print();
}
window.printMutasiReport = printMutasiReport;

/**
 * EKSPOR MUTASI KE FILE CSV
 */
function exportMutasiCSV() {
  const completedList = items.filter(i => i.status === 'completed');
  if (completedList.length === 0) {
    showToast('⚠️ Belum ada data barang selesai untuk diekspor!');
    return;
  }

  const headers = ['No', 'Kode Barang', 'Supir', 'Nomor Truk', 'Jenis Padi', 'Tonase Awal (T)', 'Tonase Akhir (T)', 'Tujuan Mutasi', 'Waktu Masuk', 'Waktu Selesai', 'Catatan'];
  const rows = completedList.map((item, idx) => [
    idx + 1,
    `"${item.code || ''}"`,
    `"${item.supir || ''}"`,
    `"${item.truk || ''}"`,
    `"${item.jenisPadi || item.jenis || ''}"`,
    item.tonase || 10,
    item.tonaseAkhir || item.tonase || 10,
    `"${item.selesaiLokasi === 'Mobil' ? 'Muat Truk' : 'Masuk Gudang'}"`,
    `"${item.masukAt ? formatDateTime(item.masukAt) : ''}"`,
    `"${item.completedAt ? formatDateTime(item.completedAt) : ''}"`,
    `"${item.catatanSelesai || ''}"`
  ]);

  const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `mutasi_barang_selesai_${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`Berhasil mengunduh mutasi ${completedList.length} barang selesai!`);
}
window.exportMutasiCSV = exportMutasiCSV;

/**
 * RESET DENGAN PROTEKSI SANDI SUPERVISOR & EMERGENCY AUTO-BACKUP
 */
const RESET_PASSWORD = 'monitoring12321';
const EMERGENCY_BACKUP_KEY = 'monitoring_backup_emergency_v1';

function openResetSecurityModal() {
  const modal = document.getElementById('resetSecurityModal');
  if (!modal) {
    const promptPw = prompt('Masukkan sandi supervisor untuk reset data:');
    if (promptPw === RESET_PASSWORD) {
      executeResetData();
    } else if (promptPw !== null) {
      showToast('⚠️ Sandi salah! Reset dibatalkan.');
    }
    return;
  }

  const pwInput = document.getElementById('inputResetPassword');
  if (pwInput) {
    pwInput.value = '';
    pwInput.type = 'password';
    pwInput.style.borderColor = '';
    pwInput.classList.remove('input-shake-error');
  }
  const btnToggle = document.getElementById('btnToggleResetPassword');
  if (btnToggle) btnToggle.textContent = 'Lihat';

  const errEl = document.getElementById('resetPasswordError');
  if (errEl) {
    errEl.style.display = 'none';
    errEl.textContent = '';
  }

  // Cek apakah ada cadangan darurat sebelumnya
  const backupBox = document.getElementById('resetBackupDetectedBox');
  if (backupBox) {
    const hasBackup = !!localStorage.getItem(EMERGENCY_BACKUP_KEY);
    backupBox.style.display = hasBackup ? 'block' : 'none';
  }

  modal.classList.add('open');
  setTimeout(() => {
    if (pwInput) pwInput.focus();
  }, 120);
}
window.openResetSecurityModal = openResetSecurityModal;

function closeResetSecurityModal() {
  const modal = document.getElementById('resetSecurityModal');
  if (modal) modal.classList.remove('open');
}
window.closeResetSecurityModal = closeResetSecurityModal;

function toggleResetPasswordVisibility() {
  const pwInput = document.getElementById('inputResetPassword');
  const btn = document.getElementById('btnToggleResetPassword');
  if (!pwInput) return;
  if (pwInput.type === 'password') {
    pwInput.type = 'text';
    if (btn) btn.textContent = 'Sandi';
  } else {
    pwInput.type = 'password';
    if (btn) btn.textContent = 'Lihat';
  }
}
window.toggleResetPasswordVisibility = toggleResetPasswordVisibility;

function handleResetSecuritySubmit(e) {
  if (e && e.preventDefault) e.preventDefault();
  const pwInput = document.getElementById('inputResetPassword');
  const errEl = document.getElementById('resetPasswordError');
  const enteredPw = pwInput ? pwInput.value.trim() : '';

  if (enteredPw !== RESET_PASSWORD) {
    if (errEl) {
      errEl.style.display = 'block';
      errEl.textContent = '⚠️ Kata sandi salah! Otorisasi reset ditolak.';
    }
    if (pwInput) {
      pwInput.classList.remove('input-shake-error');
      // Trigger reflow to restart animation
      void pwInput.offsetWidth;
      pwInput.classList.add('input-shake-error');
      pwInput.focus();
      pwInput.select();
    }
    showToast('⚠️ Kata sandi reset salah! Akses ditolak.');
    return;
  }

  // 1. Simpan cadangan darurat (Emergency Backup) otomatis sebelum reset
  try {
    const emergencyBackup = {
      savedAt: new Date().toISOString(),
      items: items,
      machineMaintenance: machineMaintenance
    };
    localStorage.setItem(EMERGENCY_BACKUP_KEY, JSON.stringify(emergencyBackup));
  } catch (err) {
    console.warn('Gagal menyimpan emergency backup:', err);
  }

  closeResetSecurityModal();
  executeResetData();
}
window.handleResetSecuritySubmit = handleResetSecuritySubmit;

function executeResetData() {
  try {
    const keysToClear = [
      'monitoring_mesin_step_v9',
      'monitoring_mesin_step_v8',
      'monitoring_mesin_step_v7',
      'monitoring_mesin_step_v6',
      'monitoring_mesin_step_v5',
      'monitoring_mesin_clean_v3',
      'monitoring_mesin_items'
    ];
    keysToClear.forEach(k => localStorage.removeItem(k));
  } catch (e) {
    console.warn('LocalStorage clear error:', e);
  }

  items = JSON.parse(JSON.stringify(DEFAULT_ITEMS));
  saveData();
  renderTable();
  renderFloorPlan();
  showToast('Sandi terverifikasi! Data berhasil di-reset ke kondisi awal. (Cadangan darurat diamankan)');
}

function restoreEmergencyBackup() {
  try {
    const raw = localStorage.getItem(EMERGENCY_BACKUP_KEY);
    if (!raw) {
      showToast('⚠️ Belum ada cadangan data darurat yang tersimpan.');
      return;
    }
    const data = JSON.parse(raw);
    if (data && Array.isArray(data.items) && data.items.length > 0) {
      items = data.items;
      if (data.machineMaintenance) {
        machineMaintenance = data.machineMaintenance;
        saveMachineMaintenance();
      }
      saveData();
      renderTable();
      renderFloorPlan();
      closeResetSecurityModal();
      showToast('Sukses! Seluruh data produksi berhasil dipulihkan dari cadangan darurat.');
    } else {
      showToast('⚠️ Format data cadangan darurat tidak sesuai.');
    }
  } catch (e) {
    console.error('Error restore backup:', e);
    showToast('⚠️ Gagal memulihkan cadangan darurat.');
  }
}
window.restoreEmergencyBackup = restoreEmergencyBackup;

function resetData() {
  openResetSecurityModal();
}
window.resetData = resetData;

/**
 * Dual Theme Manager:
 * 1. 'dark': Dark Aurora Glassmorphism (Deep Space Midnight & Neon Violet)
 * 2. 'light': Light Soft Pastel Aurora (Peach, Lilac, Sky Blue & Warm Pearl)
 */
function setTheme(mode) {
  const btnLight = document.getElementById('themeBtnLight');
  const btnDark = document.getElementById('themeBtnDark');

  if (mode === 'light') {
    document.body.classList.add('light-theme');
    try { localStorage.setItem('monitoring_mesin_active_mode', 'light'); } catch(e) {}
    if (btnLight) btnLight.classList.add('active');
    if (btnDark) btnDark.classList.remove('active');
    showToast('Mode Terang (Soft Pastel Aurora) aktif');
  } else {
    document.body.classList.remove('light-theme');
    try { localStorage.setItem('monitoring_mesin_active_mode', 'dark'); } catch(e) {}
    if (btnDark) btnDark.classList.add('active');
    if (btnLight) btnLight.classList.remove('active');
    showToast('Mode Gelap (Dark Aurora Glass) aktif');
  }
}
window.setTheme = setTheme;

function toggleTheme() {
  const isLight = document.body.classList.contains('light-theme');
  setTheme(isLight ? 'dark' : 'light');
}
window.toggleTheme = toggleTheme;

// Event Listeners Initialization
document.addEventListener('DOMContentLoaded', () => {
  // Dual Theme
  try {
    const saved = localStorage.getItem('monitoring_mesin_active_mode');
    if (saved === 'light') {
      setTheme('light');
    } else {
      setTheme('dark');
    }
  } catch (e) {
    setTheme('dark');
  }

  loadData();
  runClock();
  renderTable();

  // Toolbar Buttons
  document.getElementById('btnAddNew').addEventListener('click', openAddModal);
  document.getElementById('btnResetData').addEventListener('click', resetData);
  // 4. Cetak Rekap -> Buka Modal Input Rekapitulasi
  document.getElementById('btnExport').addEventListener('click', openRekapModal);

  const btnScrollToKode = document.getElementById('btnScrollToKode') || document.getElementById('btnToggleKodeSidebar');
  if (btnScrollToKode) {
    btnScrollToKode.addEventListener('click', () => scrollToKodePenjelasan());
  }

  try {
    const savedLayout = localStorage.getItem('monitoring_mesin_kode_layout') || 'bottom';
    setKodeLayout(savedLayout);
  } catch(e) {}

  // Modal Riwayat
  document.getElementById('btnCloseModal').addEventListener('click', closeDetailModal);
  document.getElementById('btnAdvanceNext').addEventListener('click', () => {
    if (activeModalItemId) advanceOneStep(activeModalItemId);
  });
  // 3. Mark Complete -> Buka Modal Input Waktu Telah Selesai
  document.getElementById('btnMarkComplete').addEventListener('click', () => {
    if (activeModalItemId) openCompleteModal(activeModalItemId);
  });
  document.getElementById('btnDeleteBatch').addEventListener('click', deleteBatch);

  // 2. Stop Button in Modal -> Buka Stop Modal Input Penjelasan
  const btnModalStop = document.getElementById('btnModalStop');
  if (btnModalStop) {
    btnModalStop.addEventListener('click', () => {
      if (activeModalItemId) openStopModal(activeModalItemId);
    });
  }

  const btnModalResume = document.getElementById('btnModalResume');
  if (btnModalResume) {
    btnModalResume.addEventListener('click', () => {
      if (activeModalItemId) resumeMachine(activeModalItemId);
    });
  }
  
  const btnEditDetail = document.getElementById('btnEditBatchFromDetail');
  if (btnEditDetail) {
    btnEditDetail.addEventListener('click', () => {
      if (activeModalItemId) {
        const id = activeModalItemId;
        closeDetailModal();
        openEditModal(id);
      }
    });
  }

  // Modal Tambah
  document.getElementById('btnCloseAddModal').addEventListener('click', closeAddModal);
  document.getElementById('btnCancelAdd').addEventListener('click', closeAddModal);
  document.getElementById('addForm').addEventListener('submit', handleAddSubmit);
  const inputStartStepEl = document.getElementById('inputStartStep');
  if (inputStartStepEl) {
    inputStartStepEl.addEventListener('change', () => {
      updateAddFormUnitOptions(inputStartStepEl.value);
    });
  }

  // Modal Edit Nama & Hapus
  document.getElementById('btnCloseEditModal').addEventListener('click', closeEditModal);
  document.getElementById('btnCancelEdit').addEventListener('click', closeEditModal);
  document.getElementById('editForm').addEventListener('submit', handleEditSubmit);

  const btnDelFromEdit = document.getElementById('btnDeleteFromEdit');
  if (btnDelFromEdit) {
    btnDelFromEdit.addEventListener('click', () => {
      const itemId = document.getElementById('editItemId').value;
      if (itemId) deleteItem(itemId);
    });
  }

  // 2. Modal Stop (Terhenti)
  document.getElementById('btnCloseStopModal').addEventListener('click', closeStopModal);
  document.getElementById('btnCancelStop').addEventListener('click', closeStopModal);
  document.getElementById('stopForm').addEventListener('submit', handleStopSubmit);

  // 3. Modal Complete (Telah Selesai)
  document.getElementById('btnCloseCompleteModal').addEventListener('click', closeCompleteModal);
  document.getElementById('btnCancelComplete').addEventListener('click', closeCompleteModal);
  document.getElementById('completeForm').addEventListener('submit', handleCompleteSubmit);

  // 3B. Modal Edit Step Time
  document.getElementById('btnCloseEditStepTimeModal').addEventListener('click', closeEditStepTimeModal);
  document.getElementById('btnCancelEditStepTime').addEventListener('click', closeEditStepTimeModal);
  document.getElementById('editStepTimeForm').addEventListener('submit', handleEditStepTimeSubmit);

  // 4. Modal Rekap (Cetak Rekap)
  document.getElementById('btnCloseRekapModal').addEventListener('click', closeRekapModal);
  document.getElementById('btnCancelRekap').addEventListener('click', closeRekapModal);
  document.getElementById('rekapForm').addEventListener('submit', handleRekapSubmit);

  // Modal Konfirmasi Bertahap
  document.getElementById('btnCloseStepModal').addEventListener('click', closeStepConfirmModal);
  document.getElementById('btnCancelStep').addEventListener('click', closeStepConfirmModal);

  document.getElementById('btnConfirmStep').addEventListener('click', () => {
    if (pendingStepTransition) {
      executeStepAdvance(
        pendingStepTransition.itemId, 
        pendingStepTransition.targetStepId,
        pendingStepTransition.selectedMachine,
        pendingStepTransition.gilingType
      );
      closeStepConfirmModal();
    }
  });

  const btnFollow = document.getElementById('btnFollowSequence');
  if (btnFollow) {
    btnFollow.addEventListener('click', () => {
      if (pendingStepTransition) {
        const item = items.find(i => i.id === pendingStepTransition.itemId);
        if (item) {
          executeStepAdvance(
            item.id, 
            pendingStepTransition.targetStepId,
            pendingStepTransition.selectedMachine,
            pendingStepTransition.gilingType
          );
        }
        closeStepConfirmModal();
      }
    });
  }

  // Modal Interaksi Mesin dari Denah
  const btnCloseMachineModalEl = document.getElementById('btnCloseMachineModal');
  if (btnCloseMachineModalEl) {
    btnCloseMachineModalEl.addEventListener('click', closeMachineModal);
  }

  // Modal Input Perbaikan Mesin (Maintenance)
  const btnCloseMaint = document.getElementById('btnCloseMaintenanceModal');
  if (btnCloseMaint) btnCloseMaint.addEventListener('click', closeMaintenanceModal);
  const btnCancelMaint = document.getElementById('btnCancelMaintenance');
  if (btnCancelMaint) btnCancelMaint.addEventListener('click', closeMaintenanceModal);
  const maintForm = document.getElementById('maintenanceForm');
  if (maintForm) maintForm.addEventListener('submit', handleMaintenanceSubmit);

  // Mode tampilan tetap: 'both' (Keduanya: Denah Mesin + Tabel Alur aktif)
  setViewMode('both');

  // Restore saved floor fit mode (Default: 'fit' -> pas layar 100% tanpa geser)
  try {
    const savedFit = localStorage.getItem('monitoring_mesin_floor_fit_mode') || 'fit';
    setFloorFitMode(savedFit);
    const savedZoom = parseFloat(localStorage.getItem('monitoring_mesin_floor_zoom')) || 1.0;
    if (savedZoom !== 1.0) setFloorZoom(savedZoom);
  } catch (e) {
    setFloorFitMode('fit');
  }

  // Modal Keamanan Reset (Proteksi Sandi Supervisor)
  const btnCloseResetSec = document.getElementById('btnCloseResetSecurityModal');
  if (btnCloseResetSec) btnCloseResetSec.addEventListener('click', closeResetSecurityModal);
  const btnCancelResetSec = document.getElementById('btnCancelResetSecurity');
  if (btnCancelResetSec) btnCancelResetSec.addEventListener('click', closeResetSecurityModal);
  const resetSecForm = document.getElementById('resetSecurityForm');
  if (resetSecForm) resetSecForm.addEventListener('submit', handleResetSecuritySubmit);
  const btnTogglePw = document.getElementById('btnToggleResetPassword');
  if (btnTogglePw) btnTogglePw.addEventListener('click', toggleResetPasswordVisibility);
  const btnRestoreBackup = document.getElementById('btnRestoreEmergencyBackup');
  if (btnRestoreBackup) btnRestoreBackup.addEventListener('click', restoreEmergencyBackup);

  // Tutup backdrop modal saat area luar diklik
  [
    'detailModal', 
    'addModal', 
    'stepConfirmModal', 
    'editModal', 
    'stopModal', 
    'completeModal', 
    'editStepTimeModal', 
    'rekapModal',
    'machineDetailModal',
    'machineMaintenanceModal',
    'resetSecurityModal'
  ].forEach(id => {
    const el = document.getElementById(id);
    if (el) {
      el.addEventListener('click', (e) => {
        if (e.target === el) el.classList.remove('open');
      });
    }
  });

  // Auto-refresh timer durasi floor plan setiap 10 detik jika ada proses berjalan atau mesin dalam perbaikan
  setInterval(() => {
    if (items.some(i => i.status === 'active' || i.status === 'stopped') || Object.keys(machineMaintenance).length > 0) {
      renderFloorPlan();
    }
  }, 10000);
});
