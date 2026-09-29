# Monitoring Alur Proses Mesin PMD

Skenario cerita alur batch dan logika IF-ELSE.

**Silo Basah → Dryer → Silo Kering → Giling → Mix → Packing**

Disusun dari analisis kode `Monitoring_Mesin_PMD1`.

## Daftar Isi

1. [Pendahuluan](#1-pendahuluan)
2. [Skenario Cerita dan Logika IF-ELSE](#2-skenario-cerita-dan-logika-if-else)
3. [Pohon Keputusan executeStepAdvance](#3-pohon-keputusan-executestepadvance)
4. [Catatan dari Pembacaan Algoritma](#4-catatan-dari-pembacaan-algoritma)

---

## 1. Pendahuluan

Dokumen ini menjelaskan alur perjalanan satu batch padi (contoh kode `PMD0001`) di dalam aplikasi Monitoring Alur Proses Mesin. Setiap skenario ditulis dalam bentuk cerita, lalu dilengkapi logika IF-ELSE yang sesuai dengan kode aplikasi (`app.js`), terutama fungsi `executeStepAdvance`, `getMachineUnitOccupancy`, `getCoLocatedItems`, dan fungsi antrian.

> Nama supir, jam, dan tonase pada cerita hanya contoh. Aturan yang dipakai mengikuti kode aplikasi.

### 1.1 Tahapan dan Unit Mesin

| Tahap | Jumlah Unit | Aturan |
|---|---|---|
| Silo Basah | 4 | Kapasitas 30 ton per unit, bisa diisi beberapa batch |
| Dryer | 5 | Kapasitas 30 ton per unit, bisa diisi beberapa batch |
| Silo Kering | 9 | Kapasitas 30 ton per unit, bisa diisi beberapa batch |
| Mesin Giling | 1 | Mesin tunggal, tipe PK atau Glosor, wajib antri jika sibuk |
| Mix | 1 | Mesin tunggal, wajib antri jika sibuk |
| Packing | - | Tahap akhir sebelum Selesai |

### 1.2 Aturan Utama

- Alur harus berurutan dan tidak boleh melompati tahap.
- Pengecualian yang diizinkan: mulai dari standby, alur pengulangan (Silo Kering kembali ke Dryer atau Silo Basah), dan Giling langsung ke Packing.
- Muatan satu unit fisik (Silo Basah, Dryer, Silo Kering) wajib dialirkan bersamaan dan tidak bisa dipisah.
- Total muatan satu unit maksimal 30 ton.
- Mesin yang sedang perbaikan tidak bisa dipakai.
- Batch yang berstatus terhenti tetap dihitung sebagai isi unit.

---

## 2. Skenario Cerita dan Logika IF-ELSE

### Cerita 1: Alur Normal, Lancar Tanpa Hambatan

*PMD0001 (10 ton, truk B 9123 TG, supir Supri)*

**Alur cerita**

1. 07:00 – Truk Supri tiba. Operator klik **Tambah Barang Masuk**, kode PMD0001 terbentuk dengan status standby.
2. 07:10 – Dialirkan ke Silo Basah 1. Status menjadi aktif (hijau) dan jam mulai tercatat.
3. 09:30 – Pindah ke Dryer 2 (sistem otomatis memilih unit kosong pertama).
4. 14:00 – Pindah ke Silo Kering 3.
5. 17:00 – Pindah ke Mesin Giling. Giling sedang kosong, jadi langsung jalan dengan tipe PK.
6. 19:00 – Pindah ke Mix, lalu Packing, lalu Selesai. Batch masuk Mutasi Riwayat dengan total durasi.

Alur selalu berurutan. Kalau operator mencoba lompat dari Silo Basah langsung ke Giling, sistem menolak dengan pesan *"Alur tidak boleh terlewati"*.

**Logika IF-ELSE**

```text
cur = index tahap sekarang      # standby = -1
tgt = index tahap tujuan

IF cur == -1:                   # baru masuk / standby
    BOLEH mulai (Silo Basah dst.)
ELSE IF isRecycle OR isDirectGilingToPacking:
    BOLEH (pengecualian, lihat cerita 3 dan 8)
ELSE IF tgt > cur + 1:
    TOLAK "Alur tidak boleh terlewati"
ELSE:
    BOLEH -> tahap lama: passed = true, completedAt = now
             tahap baru: startedAt = now, status = active
```

---

### Cerita 2: Terhenti karena Bahan Macet, lalu Lanjut Lagi

*PMD0002 (12 ton) di Dryer 1*

**Alur cerita**

1. 10:15 – PMD0002 sedang dikeringkan di Dryer 1.
2. 11:00 – Operator melihat bahan tersendat, klik **Stop** dan memilih alasan "Bahan Macet". Status menjadi terhenti (merah) dan jam stop dicatat di `stopLog`.
3. 11:00–11:40 – Teknisi membersihkan sumbatan. Selama ini Dryer 1 tetap dianggap terisi 12 ton, sehingga batch lain tidak bisa masuk ke ruang yang sama.
4. 11:40 – Operator klik **Lanjutkan**. Status kembali aktif dan sistem menghitung durasi henti: 40 menit.
5. 15:00 – Pindah ke Silo Kering seperti biasa.

Kalau operator memindahkan batch saat masih terhenti, event stop yang belum ditutup otomatis ditutup pada saat pindah.

**Logika IF-ELSE**

```text
# Saat klik Stop
status = 'stopped'
stopLog.push({ stoppedAt: now, reason: "Bahan Macet" })

# Kapasitas unit saat batch terhenti
IF item.status IN ('active', 'stopped'):
    hitung sebagai isi unit          # Dryer 1 tetap terisi 12 ton
ELSE:
    tidak dihitung

# Saat klik Lanjutkan
status = 'active'
FOR EACH stop IN stopLog:
    IF stop.resumedAt kosong:
        stop.resumedAt = now
        stop.duration  = now - stop.stoppedAt    # contoh: 40 menit

# Kalau operator memindahkan batch saat masih terhenti
IF ada stop yang belum ditutup:
    tutup otomatis (resumedAt = now) lalu lanjut pindah
```

---

### Cerita 3: Ulang Proses karena Gabah Masih Basah

*PMD0003 (10 ton)*

**Alur cerita**

1. PMD0003 melewati Silo Basah 2, Dryer 3, lalu masuk Silo Kering 4.
2. Operator mengecek kadar air. Ternyata gabah masih basah dan belum layak digiling.
3. Operator memindahkan PMD0003 dari Silo Kering 4 kembali ke Dryer 1. Ini satu-satunya jalan mundur yang diizinkan.
4. Sistem mencatat `recycleCount` naik menjadi 1 dan batch diberi tanda pengulangan. Alasan tercatat "Gabah Masih Basah". Tahap Dryer dan semua tahap sesudahnya direset supaya alur berjalan lagi dari sana.
5. Setelah dikeringkan ulang, PMD0003 lanjut ke Silo Kering 2, lalu Giling, lalu Packing.

Jejak perjalanan di riwayat: `Silo Basah 2 > Dryer 3 > Silo Kering 4 > (ULANG) Dryer 1 > Silo Kering 2 > Giling (PK) > Packing`.

**Logika IF-ELSE**

```text
isRecycle = (currentStep == 'C-silo')
            AND (target == 'B-dryer' OR target == 'A-silo')

IF isRecycle:
    lewati aturan "tidak boleh terlewati"     # mundur diperbolehkan
    FOR EACH item IN grup:
        recycleCount += 1
        isRecycled = true
        recycleLog.push({ from: Silo Kering 4, to: Dryer 1,
                          reason: "Gabah Masih Basah", timestamp: now })

    FOR EACH tahap IN SUBSTEPS:
        IF index(tahap) >= index(target):
            passed = false                    # direset, jalan ulang dari sini
            completedAt = null
    startedAt[target] = now
ELSE:
    alur maju biasa
```

---

### Cerita 4: Basahnya Parah, Mundur sampai Silo Basah, Ulang Dua Kali

*PMD0004 (8 ton), padi panen habis hujan*

**Alur cerita**

1. PMD0004 masuk Silo Basah 1, lalu Dryer 2, lalu Silo Kering 1.
2. Ulang ke-1: dicek masih basah, dikembalikan ke Dryer 4. `recycleCount = 1`.
3. Kembali ke Silo Kering 3, dicek lagi, masih basah juga.
4. Ulang ke-2: kali ini dikembalikan sampai Silo Basah 2 karena kadar airnya sangat tinggi. `recycleCount = 2` dan `recycleLog` berisi dua entri lengkap dengan unit asal, unit tujuan, dan jam.
5. Setelah dua kali ulang, akhirnya lolos sampai Giling dan Packing.

Di rekap, PMD0004 terlihat jelas sebagai batch bermasalah: durasi total jauh lebih panjang dan ada dua kali pengulangan.

**Logika IF-ELSE**

```text
# Ulang ke-1: Silo Kering -> Dryer
isRecycle = true, recycleCount = 1

# ...dicek lagi masih basah -> Ulang ke-2: Silo Kering -> Silo Basah
IF target == 'A-silo':          # mundur paling jauh, tetap dianggap recycle
    isRecycle = true
    recycleCount = 2
    reset passed untuk SEMUA tahap dari Silo Basah dst.

# Setelah lolos / saat load data lama
IF recycleLog.length > 0 AND recycleCount == 0:
    recycleCount = recycleLog.length            # sinkronisasi
    isRecycled = true
```

---

### Cerita 5: Dua Batch Satu Unit, Harus Pindah Bareng

*PMD0005 (12 ton), PMD0006 (10 ton), PMD0007 (12 ton)*

**Alur cerita**

1. PMD0005 masuk Silo Basah 1. Terisi 12/30 ton.
2. PMD0006 (10 ton) menyusul ke unit yang sama. Muat karena 12 + 10 = 22 <= 30. Terisi 22/30 ton, sisa 8.
3. PMD0007 (12 ton) mau masuk Silo Basah 1. Ditolak karena 22 + 12 = 34 melebihi 30 ton. PMD0007 masuk Silo Basah 2.
4. Saat PMD0005 dialirkan ke Dryer, sistem otomatis menyertakan PMD0006 karena satu unit fisik. Total 22 ton pindah bersamaan ke unit Dryer yang sama.
5. Kalau di Dryer tidak ada unit dengan sisa kapasitas minimal 22 ton, pemindahan ditolak dan operator diminta memilih unit lain.

Aturan pabrik: muatan satu unit tidak bisa dipisah saat dialirkan.

**Logika IF-ELSE**

```text
# Masuk unit
occ = occupancy(step, unit, exclude=grup)
IF occ.total + totalGrup > 30:
    TOLAK "melebihi 30 ton" (saran pilih unit lain)
ELSE:
    BOLEH

# Auto-pilih unit (jika tidak dipilih)
PASS 1: FOR u = 1..jumlahUnit:
    IF unit u maintenance -> lewati
    IF unit u KOSONG AND totalGrup <= 30 -> PILIH u, berhenti
PASS 2: (jika PASS 1 tidak ketemu)
    FOR u = 1..jumlahUnit:
        IF unit u maintenance -> lewati
        IF sisa kapasitas u >= totalGrup -> PILIH u, berhenti
FALLBACK: PILIH unit 1     # PERHATIAN: tanpa cek kapasitas

# Aliran satu unit
grup = semua item di unit fisik yang sama
IF stepId IN (Silo Basah, Dryer, Silo Kering) AND grup.length > 1:
    SEMUA anggota grup pindah ke tujuan yang sama
ELSE:
    hanya item itu yang pindah
```

---

### Cerita 6: Antri di Mesin Giling

*PMD0008 dan PMD0009 datang hampir bersamaan*

**Alur cerita**

1. 13:00 – PMD0008 masuk Giling. Mesin kosong, langsung jalan (tipe Glosor).
2. 13:20 – PMD0009 selesai di Silo Kering dan mau masuk Giling. Giling hanya 1 unit dan sedang dipakai, jadi PMD0009 masuk antrian dengan jam antri tercatat.
3. 16:00 – PMD0008 selesai dan pindah ke Mix. Sistem langsung memanggil `promoteNextGilingQueue`.
4. PMD0009 otomatis berubah dari antri menjadi aktif, dan jam mulainya tercatat saat itu juga.

Kalau beberapa batch dari satu unit yang sama masuk Giling bersamaan, yang pertama jalan dan sisanya antri. Aturan yang sama berlaku untuk Mix.

**Logika IF-ELSE**

```text
IF target == 'C-giling':
    IF Giling sedang maintenance:
        TOLAK

    busy = ADA item lain di C-giling
           AND isQueuedForGiling == false
           AND status IN (active, stopped)

    FOR EACH (item, idx) IN grup:
        mustQueue = busy OR idx > 0 OR isQueue
        IF mustQueue:
            isQueuedForGiling = true
            startedAt = null
            queuedAt = now              # PMD0009 antri
        ELSE:
            isQueuedForGiling = false
            startedAt = now             # PMD0008 langsung jalan

# Saat PMD0008 keluar dari Giling
IF tahapLama == 'C-giling':
    q = item pertama di array WHERE isQueuedForGiling == true
    IF q ada:
        q.isQueuedForGiling = false
        q.startedAt = now               # PMD0009 otomatis aktif
    ELSE:
        Giling kosong

# Mix: aturan sama, tetapi
IF target == 'D-mix' AND mixBusy AND NOT isQueue:
    TOLAK "harus antri"                 # Giling tidak menolak, Mix menolak
```

---

### Cerita 7: Mesin Rusak, Batch Harus Pindah Unit

*PMD0010 (10 ton) mau ke Dryer 2*

**Alur cerita**

1. Teknisi menandai Dryer 2 sedang perbaikan dengan alasan "Kerusakan Motor". Di denah, Dryer 2 berubah merah dan hitungan Mesin Kendala bertambah.
2. Operator mencoba mengalirkan PMD0010 ke Dryer 2. Ditolak: *"Mesin Dryer 2 sedang dalam perbaikan (Kerusakan Motor)"*.
3. Kalau operator tidak memilih unit, sistem otomatis melewati Dryer 2 dan memilih unit kosong berikutnya, misalnya Dryer 3.
4. Setelah motor diganti, teknisi menghapus status perbaikan. Dryer 2 kembali bisa dipakai.

**Logika IF-ELSE**

```text
# Saat operator pilih unit manual
IF unit dipilih AND isUnderMaintenance(target, unit):
    TOLAK "Dryer 2 sedang perbaikan (Kerusakan Motor)"

# Saat auto-pilih
FOR u = 1..jumlahUnit:
    IF isUnderMaintenance(target, "Dryer u"):
        CONTINUE                        # lewati unit rusak
    ...cek kosong / sisa kapasitas...

# Giling / Mix tunggal
IF maintenance -> TOLAK (tidak ada unit alternatif)

# Kalau semua unit di tahap itu rusak dan tidak ada yang muat
chosen = null -> FALLBACK ke unit 1
# PERHATIAN: bisa memilih unit rusak; hanya tertahan kalau validasi
# maintenance pada blok validasi ikut berjalan
```

---

### Cerita 8: Lompat Mix, Langsung ke Packing

*PMD0011 (10 ton), pesanan tanpa campuran*

**Alur cerita**

1. PMD0011 selesai digiling.
2. Karena tidak perlu dicampur, operator mengalirkannya langsung dari Giling ke Packing. Ini pengecualian yang sengaja dibuat di kode dan diperbolehkan.
3. Tahap Mix ditandai `skipped`, tanpa jam mulai dan jam selesai. Di riwayat terlihat bahwa Mix memang sengaja dilewati, bukan lupa dicatat.

Lompatan lain, misalnya Silo Basah ke Giling atau Dryer ke Packing, tetap ditolak.

**Logika IF-ELSE**

```text
isDirect = (currentStep == 'C-giling' AND target == 'D-packing')

IF isDirect:
    lewati aturan "tidak boleh terlewati"
    FOR tahap sebelum target:
        IF tahap == 'D-mix':
            passed = true
            skipped = true              # ditandai dilewati
            startedAt = null
            completedAt = null
        ELSE IF belum passed:
            passed = true; isi jam bila kosong
ELSE:
    tahap sebelum target diisi passed = true seperti biasa
```

---

### Cerita 9: Semua Kejadian dalam Satu Batch

*PMD0012 (10 ton), hari yang penuh masalah*

**Alur cerita**

1. 06:30 – Masuk Silo Basah 3, lalu 08:00 ke Dryer 1.
2. 09:00 – Dryer terhenti karena Overheat. Setelah didinginkan, 09:50 dilanjutkan (henti 50 menit).
3. 12:00 – Masuk Silo Kering 5. Dicek, gabah masih basah.
4. 12:30 – Ulang ke-1: kembali ke Dryer 4, `recycleCount = 1`.
5. 16:00 – Kembali ke Silo Kering 2, kali ini kering.
6. 17:00 – Mau masuk Giling, tetapi sedang dipakai batch lain, jadi antri.
7. 18:30 – Giling kosong, PMD0012 otomatis aktif (tipe PK).
8. 20:00 – Terhenti sebentar karena Ganti Sparepart/Vanbelt, lalu lanjut.
9. 21:00 – Lompat Mix, langsung Packing, lalu Selesai.

Di Mutasi Riwayat, PMD0012 tampil dengan jejak perjalanan panjang, dua kali stop beserta alasan dan durasinya, satu kali pengulangan, dan satu kali antri.

**Logika IF-ELSE**

```text
06:30  Standby -> Silo Basah 3        IF standby: BOLEH mulai
08:00  -> Dryer 1                     ELSE IF tgt == cur+1: BOLEH
09:00  Stop "Overheat"                status = stopped
09:50  Lanjutkan                      duration = 50 menit, status = active
12:00  -> Silo Kering 5               tgt == cur+1: BOLEH
12:30  -> Dryer 4 (ulang)             isRecycle = true -> recycleCount = 1
                                      reset passed dari Dryer dst.
16:00  -> Silo Kering 2               tgt == cur+1: BOLEH
17:00  -> Giling                      IF gilingBusy: isQueued = true, queuedAt = now
                                      ELSE: langsung jalan
18:30  Giling kosong                  promoteNextGilingQueue():
                                      isQueued = false, startedAt = now
20:00  Stop "Ganti Vanbelt", lanjut   stopLog +1
21:00  -> Packing                     isDirect = true -> Mix skipped
       -> Selesai                     status = completed, masuk Mutasi Riwayat
```

---

## 3. Pohon Keputusan executeStepAdvance

```text
START
|- item tidak ada? -> STOP
|- hitung: cur, tgt, isRecycle, isDirect, isStandby
|- IF NOT (standby OR isRecycle OR isDirect) AND tgt > cur+1
|     -> TOLAK (alur terlewati)
|- ambil grup co-located, hitung totalGrup
|- IF unit tujuan maintenance -> TOLAK
|- IF multi-kapasitas AND isi + totalGrup > 30 -> TOLAK
|- IF unit belum dipilih -> auto-pilih (kosong -> sisa muat -> unit 1)
|- IF tujuan Giling AND maintenance -> TOLAK
|- IF tujuan Mix:
|   |- maintenance -> TOLAK
|   '- sibuk AND bukan antri -> TOLAK
|- FOR EACH item dalam grup:
|   |- tutup tahap lama
|   |- IF isRecycle -> catat log, reset tahap
|   |  ELSE -> tandai tahap sebelumnya passed (Mix skipped bila isDirect)
|   |- IF Giling/Mix -> tentukan antri atau langsung jalan
|   |- tutup stop yang masih terbuka
|   '- set currentStep, status = active, catat journeyLog
|- IF tahap lama Giling -> promoteNextGilingQueue()
|- IF tahap lama Mix -> promoteNextMixQueue()
'- simpan dan render
```

---

## 4. Catatan dari Pembacaan Algoritma

- Antrian Giling dan Mix belum benar-benar FIFO. Fungsi `promoteNext` memakai `items.find` sehingga yang dipilih adalah batch dengan posisi paling awal di array, bukan yang `queuedAt`-nya paling lama.
- Auto-pilih unit memiliki fallback ke unit 1 tanpa cek kapasitas dan tanpa cek maintenance. Jika semua unit penuh atau rusak, hasilnya bisa melebihi 30 ton atau memilih unit yang sedang perbaikan.
- Opsi antri (`isQueue`) dari pengguna bisa memaksa batch masuk antrian walau mesin kosong. Antrian baru dibangunkan saat ada batch yang keluar dari Giling atau Mix, sehingga batch tersebut bisa tertahan.
- Alur recycle tidak mengecek status maintenance unit tujuan kecuali unit dipilih manual.
- Lompatan Giling langsung ke Packing adalah pengecualian yang disengaja dan bukan bug.
