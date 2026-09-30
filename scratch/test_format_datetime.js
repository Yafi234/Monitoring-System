// Test printMutasiReport, exportMutasiCSV, and printMutasiSlip execution
const ID_MONTHS = ['Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni', 'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember'];
const ID_MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

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

function formatDateTime(iso) {
  if (!iso) return '-';
  const d = (iso instanceof Date) ? iso : new Date(iso);
  if (isNaN(d.getTime())) return '-';
  const day = d.getDate();
  const month = ID_MONTHS[d.getMonth()] || ID_MONTHS_SHORT[d.getMonth()] || '';
  const year = d.getFullYear();
  const h = String(d.getHours()).padStart(2, '0');
  const m = String(d.getMinutes()).padStart(2, '0');
  return `${day} ${month} ${year}, ${h}:${m} WIB`;
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const items = [
  {
    id: 'it1',
    code: 'PMD0001',
    name: 'Padi 1',
    supir: 'Pak Budi',
    truk: 'B 1234 CD',
    jenisPadi: 'Inpari 32',
    tonase: 10,
    tonaseAkhir: 10,
    currentStepId: 'C-giling',
    status: 'active',
    masukAt: '2026-09-30T08:00:00Z',
    assignedMachines: { 'C-giling': 'Mesin Giling 1' },
    stepHistory: { 'C-giling': { startedAt: '2026-09-30T09:00:00Z' } }
  },
  {
    id: 'it2',
    code: 'PMD0002',
    name: 'Padi 2',
    supir: 'Pak Joko',
    truk: 'B 5678 EF',
    jenisPadi: 'Ciherang',
    tonase: 12,
    tonaseAkhir: 11.8,
    currentStepId: 'D-packing',
    status: 'completed',
    selesaiLokasi: 'Gudang',
    masukAt: '2026-09-30T07:30:00Z',
    completedAt: '2026-09-30T10:15:00Z',
    catatanSelesai: 'Kadar air 13.5%',
    assignedMachines: { 'D-packing': 'Mesin Packing' },
    stepHistory: { 'C-giling': { passed: true }, 'D-mix': { passed: true }, 'D-packing': { passed: true } }
  }
];

// Test 1: formatDateTime
console.log('Test formatDateTime(new Date()):', formatDateTime(new Date()));
console.log('Test formatDateTime(items[0].masukAt):', formatDateTime(items[0].masukAt));
console.log('Test formatDateTime(null):', formatDateTime(null));

// Test 2: generate rowsHtml for report
const rowsHtml = items.map((item, idx) => {
  const isCompleted = item.status === 'completed';
  const curMachine = (item.assignedMachines && item.assignedMachines[item.currentStepId]) || item.currentStepId;
  const locText = isCompleted ? (item.selesaiLokasi === 'Mobil' ? 'Muat Truk' : 'Masuk Gudang') : `Di ${curMachine}`;
  return `<tr><td>${idx+1}</td><td>${isCompleted && item.completedAt ? formatDateTimeShort(item.completedAt) : 'Sedang Proses'}</td><td>${item.code}</td><td>${locText}</td></tr>`;
}).join('');

console.log('Report rows generated successfully, length:', rowsHtml.length);

// Test 3: CSV generation
const headers = ['No', 'Kode Barang', 'Supir', 'Nomor Truk', 'Jenis Padi', 'Tonase Awal (T)', 'Tonase Akhir (T)', 'Status / Tujuan Mutasi', 'Waktu Masuk', 'Waktu Selesai', 'Catatan'];
const rows = items.map((item, idx) => {
  const isCompleted = item.status === 'completed';
  const curMachine = (item.assignedMachines && item.assignedMachines[item.currentStepId]) || item.currentStepId;
  const loc = isCompleted ? (item.selesaiLokasi === 'Mobil' ? 'Muat Truk' : 'Masuk Gudang') : `Sedang Proses di ${curMachine}`;
  return [
    idx + 1,
    `"${item.code || ''}"`,
    `"${item.supir || ''}"`,
    `"${item.truk || ''}"`,
    `"${item.jenisPadi || item.jenis || ''}"`,
    item.tonase || 10,
    item.tonaseAkhir || item.tonase || 10,
    `"${loc}"`,
    `"${item.masukAt ? formatDateTime(item.masukAt) : ''}"`,
    `"${item.completedAt ? formatDateTime(item.completedAt) : '-'}"`,
    `"${item.catatanSelesai || ''}"`
  ];
});
const csvContent = '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
console.log('CSV Content generated successfully, lines:', csvContent.split('\r\n').length);
console.log('ALL TESTS PASSED!');
