# LAPORAN INVESTIGASI UAT — PEMBUKAAN LEBIH AWAL KHUSUS ADMIN
**Fitur:** Jam Operasional Admin (`/admin/operating-hours`)  
**Tanggal Layanan:** 30 November 2026 (`2026-11-30`, Asia/Jakarta)  
**Database Staging:** `PINJAM_TESTING` (`kaflptksvqwcurzacifs.supabase.co`)  
**Status Investigasi:** SELESAI (Root Cause Ditemukan & Bukti DB Lengkap) — Menunggu Persetujuan Pengguna

---

## 1. RINGKASAN EKSEKUTIF

Pada pengujian UAT tanggal 30 November 2026 di halaman `/admin/operating-hours`, ADMIN memasukkan konfigurasi:
- **Jam Buka Reguler:** `09.00 WIB` (`09:00:00`)
- **Jam Tutup Layanan:** `16.00 WIB` (`16:00:00`)
- **Pembukaan Lebih Awal Khusus ADMIN:** `07.00 WIB` (`07:00:00`)
- **Catatan Operasional:** `"UAT pengujian pembukaan awal ADMIN kedua"`

Setelah form disimpan, sistem menampilkan notifikasi:
> *"Konfigurasi jam operasional untuk 30/11/2026 berhasil disimpan (09.00 – 16.00, pickup paling awal 07.30)."*

Namun setelah reload/pemeriksaan, pengguna mencurigai bahwa nilai pembukaan awal `07.00 WIB` tidak tersimpan atau hilang dari form/snapshot.

### Temuan Utama:
1. **Nilai `07:00:00` 100% TERSIMPAN DI DATABASE:**
   Nilai pembukaan lebih awal khusus ADMIN **TIDAK HILANG**. Nilai tersimpan utuh di kolom `admin_early_open_at` tabel `public.operating_hours` dan tercatat lengkap di `public.audit_logs`.
2. **Nilai "Pickup Paling Awal: 07.30 WIB" BUKAN BUG (100% SESUAI PRD §7.9):**
   Spesifikasi PRD §7.9 point 3 & checklist baris 721/870 secara tegas mengatur:  
   *"Jika ADMIN membuka operasional lebih awal, misalnya pukul 07.00, sistem mengizinkan pengambilan mulai pukul 07.30."*  
   Formula menghitung $\min(08:45, 07:00 + 30\text{ menit}) = 07:30\text{ WIB}$. Nilai 07.30 WIB ini adalah waktu pickup paling awal yang diizinkan untuk mahasiswa/komting pada hari tersebut.
3. **Akar Masalah (Frontend & DTO Snapshot Bug):**
   - **Bug DTO Backend Snapshot (`jakarta-time.ts`):** Fungsi `buildOperatingHoursSnapshot()` menerima `adminEarlyOpenAt` untuk menghitung `early_pickup_allowed_at`, namun **tidak menyertakan field `admin_early_open_at` dalam payload JSON return**.
   - **Bug Form State Frontend (`admin-operating-hours-view.tsx`):** Komponen form menginisialisasi state dengan `const adminEarlyOpenAt = draftEarlyOpenAt ?? ""` dan `const note = draftNote ?? ""`. Saat reload atau setelah simpan berhasil, form tidak mengambil fallback dari data snapshot server.
   - **Ketiadaan Baris di Card Snapshot UI:** Kartu "Snapshot Berlaku" di sidebar kanan hanya menampilkan *Zona Waktu, Jam Buka, Jam Tutup, Pickup Paling Awal, dan Jam Buka Terkonfigurasi*, tanpa baris untuk *Pembukaan Lebih Awal ADMIN* dan *Catatan Operasional*.

---

## 2. BUKTI DATABASE ACTUAL (PINJAM_TESTING)

### 2.1. Baris Data Tabel `public.operating_hours` (Service Date: 2026-11-30)
Kueri langsung ke Supabase `PINJAM_TESTING` menghasilkan data berikut:

```json
{
  "id": "31f938e1-a9c5-410d-b1fa-27c706abca18",
  "service_date": "2026-11-30",
  "timezone": "Asia/Jakarta",
  "opens_at": "09:00:00",
  "closes_at": "16:00:00",
  "admin_early_open_at": "07:00:00",
  "note": "UAT pengujian pembukaan awal ADMIN kedua",
  "created_by": "e37c0744-6379-4524-a741-ca08517ad3b5",
  "updated_by": "e37c0744-6379-4524-a741-ca08517ad3b5",
  "created_at": "2026-11-27T14:16:59.625916+00:00",
  "updated_at": "2026-11-27T14:20:53.893654+00:00"
}
```

### 2.2. Rekam Jejak Audit Log (`public.audit_logs`)
Riwayat audit log entitas `OPERATING_HOURS` untuk id `31f938e1-a9c5-410d-b1fa-27c706abca18`:

1. **2026-11-27 14:16:59 UTC (Pembuatan Awal):**
   - `opens_at`: `09:00:00`, `closes_at`: `16:00:00`, `admin_early_open_at`: `null`
   - `reason`: `"UAT: Pengujian perubahan jam operasional tanggal 30 November 2026."`
2. **2026-11-27 14:18:30 UTC (Update Pertama):**
   - `before_data.admin_early_open_at`: `null` &rarr; `after_data.admin_early_open_at`: `"07:00:00"`
   - `reason`: `"UAT: Pengujian pembukaan lebih awal khusus ADMIN."`
3. **2026-11-27 14:20:53 UTC (Update Kedua - Sesi UAT Ini):**
   - `before_data.note`: `"UAT: Pengujian pembukaan lebih awal khusus ADMIN."` &rarr; `after_data.note`: `"UAT pengujian pembukaan awal ADMIN kedua"`
   - `after_data.admin_early_open_at`: `"07:00:00"` (tetap aktif)
   - `reason`: `"UAT pengujian pembukaan awal ADMIN kedua"`

**Kesimpulan Database:** Database dan RPC PostgreSQL `rpc_admin_upsert_operating_hours` berjalan 100% sempurna tanpa kehilangan data.

---

## 3. ATURAN BISNIS PERHITUNGAN "PICKUP PALING AWAL: 07.30 WIB"

### 3.1. Rujukan Spesifikasi PRD
Pada dokumen `PRD_PINJAM_FINAL.md`:
- **§7.9 Jam Operasional (Butir 1–3):**
  > 1. *Jam operasional standar dimulai pukul 08.00.*  
  > 2. *Dalam kondisi standar, sistem otomatis mengizinkan pengambilan mulai pukul 07.45 tanpa menunggu ADMIN hadir atau mengonfirmasi.*  
  > 3. ***Jika ADMIN membuka operasional lebih awal, misalnya pukul 07.00, sistem mengizinkan pengambilan mulai pukul 07.30.***
- **§7.9 Interpretasi Waktu:**
  > *"Batas pembukaan standar adalah 07.45. Jika ADMIN membuka lebih awal, misalnya pukul 07.00, batas pembukaan khusus menjadi 07.30. Untuk setiap booking, waktu pickup paling awal adalah waktu yang lebih akhir antara batas pembukaan layanan hari itu dan 30 menit sebelum waktu booking."*
- **Checklist Verifikasi PRD (Baris 721 & 870):**
  > `- [ ] Pembukaan ADMIN pukul 07.00 memungkinkan pickup pukul 07.30.`

### 3.2. Implementasi Formula pada Kode (`src/lib/utils/jakarta-time.ts`)
```ts
export function computeEarlyPickupAllowedAt(
  opensAt: string,
  adminEarlyOpenAt: string | null
): string {
  const opensSec = timeToSeconds(opensAt);
  const defaultPreOpenSec = Math.max(0, opensSec - 15 * 60);

  if (!adminEarlyOpenAt) {
    return secondsToTimeString(defaultPreOpenSec);
  }

  const earlyOpenSec = timeToSeconds(adminEarlyOpenAt);
  const effectiveEarlySec = Math.min(defaultPreOpenSec, earlyOpenSec + 30 * 60);
  return secondsToTimeString(effectiveEarlySec);
}
```

### 3.3. Simulasi Perhitungan Kasus UAT Ini
- `opensAt` = `09:00:00` (9 × 3600 = 32.400 detik)
- `defaultPreOpenSec` = 32.400 − 900 = 31.500 detik (`08:45:00`)
- `adminEarlyOpenAt` = `07:00:00` (7 × 3600 = 25.200 detik)
- `earlyOpenSec + 30 * 60` = 25.200 + 1.800 = 27.000 detik (`07:30:00`)
- `effectiveEarlySec` = $\min(31.500, 27.000) = 27.000\text{ detik} \implies \mathbf{07:30:00}$.

**Kesimpulan:** Pesan notifikasi `"pickup paling awal 07.30"` adalah kalkulasi yang **benar dan valid sesuai PRD §7.9**, karena ketika ADMIN membuka layanan pukul 07.00 WIB, staf/sistem memberikan jendela persiapan 30 menit sehingga pengambilan fisik proyektor oleh peminjam dibuka mulai pukul 07.30 WIB.

---

## 4. ALUR DATA FORM & PENYEBAB MASALAH TAMPILAN

```mermaid
sequenceDiagram
    autonumber
    actor Admin as ADMIN User
    participant Form as AdminOperatingHoursView (Frontend)
    participant PUT as PUT /api/v1/admin/operating-hours/[date]
    participant DB as PostgreSQL (rpc_admin_upsert_operating_hours)
    participant GET as GET /api/v1/operating-hours?date=...

    Admin->>Form: Input 09:00, 16:00, Early: 07:00, Note: "UAT..."
    Admin->>Form: Klik Simpan & Konfirmasi Modal
    Form->>PUT: { opens_at: "09:00:00", closes_at: "16:00:00", admin_early_open_at: "07:00:00", note: "..." }
    PUT->>DB: rpc_admin_upsert_operating_hours(...)
    Note over DB: Data tersimpan di public.operating_hours & audit_logs
    DB-->>PUT: Row { opens_at: "09:00:00", admin_early_open_at: "07:00:00", ... }
    PUT-->>Form: res.data = buildOperatingHoursSnapshot(saved) [BUG: admin_early_open_at tidak disertakan]
    Form->>Form: setSaveSuccess("...pickup paling awal 07.30")
    Form->>Form: setDraftEarlyOpenAt(null); setDraftNote(null);
    Form->>GET: reload() -> fetch snapshot date 2026-11-30
    GET-->>Form: Snapshot tanpa field admin_early_open_at & note
    Note over Form: adminEarlyOpenAt diinisialisasi draftEarlyOpenAt ?? "" -> KOSONG!
    Note over Form: UI Card Snapshot tidak punya row Early Open -> Pengguna mengira data hilang
```

### Rincian 3 Titik Kerusakan (Break Points):

1. **DTO Snapshot (`src/lib/utils/jakarta-time.ts` baris 158–166):**
   ```ts
   return {
     service_date: params.serviceDate,
     timezone: JAKARTA_TIMEZONE,
     opens_at: opensAt,
     closes_at: closesAt,
     configured_open_at: opensAt,
     early_pickup_allowed_at: computeEarlyPickupAllowedAt(opensAt, adminEarlyOpenAt),
     note: params.note ?? null,
     // [KURANG]: admin_early_open_at: adminEarlyOpenAt ?? null,
   };
   ```
2. **State Fallback Form Frontend (`src/features/admin/admin-operating-hours-view.tsx` baris 68–69):**
   ```ts
   const opensAt = draftOpensAt ?? toTimeInputValue(snapshot?.opens_at);
   const closesAt = draftClosesAt ?? toTimeInputValue(snapshot?.closes_at);
   const adminEarlyOpenAt = draftEarlyOpenAt ?? ""; // [BUG]: Tidak fallback ke snapshot!
   const note = draftNote ?? "";                   // [BUG]: Tidak fallback ke snapshot!
   ```
   Seharusnya:
   ```ts
   const adminEarlyOpenAt = draftEarlyOpenAt ?? toTimeInputValue(snapshot?.admin_early_open_at);
   const note = draftNote ?? snapshot?.note ?? "";
   ```
3. **Card Tampilan Snapshot UI (`src/features/admin/admin-operating-hours-view.tsx` baris 245–280):**
   Komponen `<dl>` hanya merender `timezone`, `opens_at`, `closes_at`, `early_pickup_allowed_at`, dan `configured_open_at`. Tidak ada baris untuk menampilkan `admin_early_open_at` dan `note`.

---

## 5. KLASIFIKASI: BUG VS SPESIFIKASI

| Aspek / Perilaku | Status | Keterangan |
|---|---|---|
| Nilai 07.00 tersimpan di database | **SESUAI (VALID)** | Tersimpan di kolom `admin_early_open_at` dan dicatat di audit log. |
| Nilai pickup paling awal 07.30 | **SESUAI (VALID)** | Formula PRD §7.9: Early open 07.00 memberikan toleransi persiapan 30 menit &rarr; pickup mulai 07.30 WIB. |
| Respon snapshot tidak memuat `admin_early_open_at` | **BUG BACKEND DTO** | Field dipangkas di fungsi `buildOperatingHoursSnapshot()`. |
| Form input kembali kosong setelah simpan/reload | **BUG FRONTEND STATE** | State form tidak mengaitkan snapshot server ke field pembukaan awal dan catatan. |
| Tampilan ringkasan snapshot tidak memuat jam early open | **BUG FRONTEND UI** | Card UI belum menampilkan informasi pembukaan awal yang sedang aktif. |

---

## 6. REKOMENDASI PERBAIKAN MINIMAL

1. **Update Domain Interface (`src/types/domain.ts`):**
   Tambahkan field opsional pada `OperatingHoursSnapshot`:
   ```ts
   export interface OperatingHoursSnapshot {
     service_date?: string;
     timezone?: string;
     opens_at: string;
     closes_at: string;
     configured_open_at?: string;
     early_pickup_allowed_at: string;
     admin_early_open_at?: string | null;
     note?: string | null;
   }
   ```
2. **Update Helper Snapshot (`src/lib/utils/jakarta-time.ts`):**
   Sertakan `admin_early_open_at: adminEarlyOpenAt ?? null` pada objek yang di-return oleh `buildOperatingHoursSnapshot()`.
3. **Update Form & UI View (`src/features/admin/admin-operating-hours-view.tsx`):**
   - Kaitkan fallback state `adminEarlyOpenAt` ke `snapshot?.admin_early_open_at`.
   - Kaitkan fallback state `note` ke `snapshot?.note`.
   - Tambahkan baris "Pembukaan Awal ADMIN" dan "Catatan Operasional" pada Card "Snapshot Berlaku" jika nilainya ada.
4. **Verifikasi Otomatis:**
   Jalankan test suite terkait operating hours (`npm test`) dan typecheck (`npm run typecheck`).

---
*Laporan investigasi dibuat secara obyektif berdasarkan verifikasi database riil dan rujukan spesifikasi PRD. Tidak ada modifikasi kode yang dilakukan sebelum persetujuan pengguna.*
