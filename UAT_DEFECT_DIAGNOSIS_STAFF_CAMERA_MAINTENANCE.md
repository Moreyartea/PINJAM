# LAPORAN DIAGNOSIS CACAT UAT: DEF-005
# MASALAH QR SCANNER (KAMERA HITAM) & MAINTENANCE RECORDS (UNKNOWN_ERROR)
# PINJAM — Sistem Peminjaman Proyektor

**Dokumen ID:** `UAT-DEF-005-DIAGNOSIS`  
**Tanggal Diagnosis:** 27 November 2026  
**Status Masalah:** Terkonfirmasi (*Confirmed Defect*)  
**Tingkat Keparahan (Severity):** 🟠 High  
**Prioritas:** P1 — Blocker Alur Scanner Loket & Pemantauan Pemeliharaan  
**Akun Pengujian:** `conc-staff@example.test` (Role: `STAFF`)  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build (`localhost:3000`)  
**Active Branch:** `feat/fullstack-integration`

---

## 1. Ringkasan Eksekutif

Dalam pengujian penerimaan pengguna (*User Acceptance Testing*) modul operasional STAFF, ditemukan dua masalah independen:
1. **Masalah A — QR Scanner Kamera Hitam pada `/staff/scan`:**
   Komponen pemindai QR aktif dan tombol aksi `PICKUP` / `RETURN` dapat dipilih, namun area tinjauan (*preview*) kamera hanya menampilkan kotak hitam tanpa video stream dari kamera.
2. **Masalah B — Maintenance UNKNOWN_ERROR pada `/staff/maintenance`:**
   Katalog inventaris proyektor berhasil dimuat, tetapi bagian riwayat pemeliharaan gagal memuat dan memunculkan error *"Gagal Memuat Catatan Maintenance"* dengan kode `UNKNOWN_ERROR`.

Diagnosis *read-only* mendalam telah dilakukan untuk kedua temuan tersebut tanpa mengubah kode sumber, migrasi, maupun basis data.

---

## 2. Bagian A: Diagnosis QR Scanner Kamera Hitam

### 2.1 Lokasi & Komponen
- Halaman: `src/app/staff/scan/page.tsx`
- Komponen Antarmuka: `src/features/staff/staff-qr-scan-view.tsx`

### 2.2 Gejala & Perilaku
- Tombol *"Aktifkan Kamera QR"* diklik oleh staf.
- Browser meminta izin kamera dan pengguna memberikan izin (*granted*).
- State `cameraActive` berubah menjadi `true`, dan kotak video hitam muncul di layar.
- Namun, gambar dari webcam/kamera tidak pernah tampil pada elemen `<video>`.

### 2.3 Pelacakan Alur Kode & Akar Masalah (Root Cause)

#### Akar Masalah Utama: React Ref Timing & Conditional Rendering Race Condition
Pada berkas `src/features/staff/staff-qr-scan-view.tsx` baris 153–164:
```ts
const stream = await navigator.mediaDevices.getUserMedia({
  video: { facingMode: "environment" },
});
streamRef.current = stream;
setCameraActive(true);

if (videoRef.current) {
  videoRef.current.srcObject = stream;
  await videoRef.current.play().catch(() => undefined);
}
```
Dan pada blok JSX baris 280–284:
```tsx
{cameraActive && (
  <div className="nb-border rounded-[var(--radius-sm)] overflow-hidden bg-black">
    <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
  </div>
)}
```

**Mekanisme Terjadinya Bug:**
1. Sebelum tombol diklik, state `cameraActive` bernilai `false`. Karena elemen `<video>` berada di dalam blok kondisional `{cameraActive && ...}`, elemen `<video>` **belum pernah di-mount ke DOM**. Nilai `videoRef.current` adalah `null`.
2. Ketika `handleStartCamera` dieksekusi:
   - `stream` berhasil diperoleh dari `navigator.mediaDevices.getUserMedia()`.
   - `setCameraActive(true)` dipanggil untuk menjadwalkan re-render React pada siklus berikutnya.
   - Pengecekan `if (videoRef.current)` dievaluasi **seketika pada frame eksekusi yang sama**. Karena React belum melakukan re-render dan commit DOM, `videoRef.current` masih bernilai `null`!
3. Blok kode di dalam `if (videoRef.current)` terlewati secara total:
   - `videoRef.current.srcObject = stream` **tidak pernah dijalankan**.
   - `videoRef.current.play()` **tidak pernah dipanggil**.
4. Setelah render selesai, elemen `<video>` akhirnya di-mount ke DOM dengan latar belakang hitam (`bg-black`), namun properti `srcObject`-nya kosong (`null`). Hasilnya adalah **area preview video hitam legam**.
5. Tidak ada hook `useEffect` sekunder yang memantau ketersediaan elemen `<video>` untuk menautkan `streamRef.current` yang sudah aktif.

#### Akar Masalah Sekunder:
1. **Constraint `facingMode: "environment"` yang Terlalu Kaku:**
   - Meminta `{ facingMode: "environment" }` (kamera belakang) secara statis dapat memicu `OverconstrainedError` pada laptop/PC desktop yang hanya memiliki satu kamera depan (webcam).
   - Seharusnya menggunakan constraint fleksibel: `{ facingMode: { ideal: "environment" } }`.
2. **Penanganan Ketiadaan `window.BarcodeDetector`:**
   - Pada baris 171–176, jika `BarcodeDetector` tidak didukung oleh browser, kode memanggil `return;` tanpa memanggil `stopCamera()`. Akibatnya, stream kamera tetap aktif di background namun tidak ada proses pemindaian maupun pembersihan.
3. **Peralihan Tab Aksi `PICKUP` / `RETURN`:**
   - Penggantian aksi tidak me-reset stream kamera secara graceful sehingga jika stream macet, pengguna harus memuat ulang seluruh halaman.

### 2.4 Kategori Cacat Masalah A
**Frontend UI/React Bug** (Lifecycle timing pada conditional ref binding & constraint media device).

---

## 3. Bagian B: Diagnosis Maintenance UNKNOWN_ERROR

### 3.1 Lokasi & Komponen
- Halaman: `src/app/staff/maintenance/page.tsx`
- Komponen Antarmuka: `src/features/staff/staff-maintenance-view.tsx`
- Service Frontend: `src/services/api/api-services.ts` (`services.maintenance`)

### 3.2 Gejala & Perilaku
- Halaman `/staff/maintenance` berhasil dibuka.
- Tab/tabel katalog proyektor berhasil memuat unit proyektor.
- Namun, area riwayat catatan pemeliharaan memunculkan kartu error:
  ```
  Gagal Memuat Catatan Maintenance
  Error Code: UNKNOWN_ERROR
  ```

### 3.3 Pelacakan Alur API & Bukti HTTP (Root Cause)

#### Panggilan API dari Frontend:
Pada `src/features/staff/staff-maintenance-view.tsx` baris 68–74:
```ts
services.maintenance.listMaintenance({
  page,
  page_size: 20,
  status: statusFilter === "ALL" ? undefined : statusFilter,
})
```
Dan pada `src/services/api/api-services.ts` baris 183–198:
```ts
maintenance: {
  listMaintenance: (params) =>
    apiRequest("/staff/maintenance", { query: params }),
  createMaintenance: (projectorId, payload) =>
    apiRequest(`/staff/projectors/${encodeURIComponent(projectorId)}/maintenance`, { method: "POST", body: payload }),
  completeMaintenance: (maintenanceId, payload) =>
    apiRequest(`/staff/maintenance/${encodeURIComponent(maintenanceId)}/complete`, { method: "POST", body: payload }),
}
```

#### Bukti Pengujian HTTP Langsung (Live Staging `PINJAM_TESTING`):
Pengujian eksekusi HTTP dilakukan terhadap server Next.js production build (`http://localhost:3000`) menggunakan sesi Bearer token staf:

```http
GET /api/v1/staff/maintenance?page=1&page_size=20&status=IN_PROGRESS HTTP/1.1
Host: localhost:3000
Accept: application/json
Authorization: Bearer <VALID_STAFF_TOKEN>
```

**Respons yang Diterima Server:**
```http
HTTP/1.1 404 Not Found
Content-Type: text/html; charset=utf-8
Content-Encoding: gzip
Date: Fri, 27 Nov 2026 10:00:00 GMT

<!DOCTYPE html><html>... 404 — Halaman Tidak Ditemukan ...</html>
```

#### Mengapa Muncul `UNKNOWN_ERROR`?
1. Route handler `src/app/api/v1/staff/maintenance/route.ts` **belum pernah dibuat di backend Next.js**.
2. Respons 404 HTML standar Next.js tidak memiliki body JSON error.
3. Klien HTTP `src/lib/api/client.ts` mengeksekusi fallback:
   ```ts
   function fallbackCodeFromStatus(status: number): ApiErrorCode {
     if (status === 401) return "AUTH_REQUIRED";
     if (status === 403) return "FORBIDDEN";
     return "UNKNOWN_ERROR";
   }
   ```
4. Mengapa daftar proyektor di halaman yang sama berhasil?  
   Karena komponen mengambil daftar proyektor melalui `services.projector.listProjectors`, yang memanggil endpoint `GET /api/v1/projectors` (endpoint ini sudah tersedia di backend sejak sprint BE-3).

### 3.4 Kesiapan Basis Data & Backend Service Maintenance
Pemeriksaan pada skema Supabase `PINJAM_TESTING` menunjukkan bahwa infrastruktur database untuk maintenance **sudah lengkap dan aktif 100%**:
1. **Tabel `public.maintenance_records`:**
   - Dibuat pada migrasi `004` dengan kolom: `id`, `projector_id`, `reason`, `note`, `status`, `created_by`, `started_at`, `resolution_note`, `completed_by`, `completed_at`, `created_at`, `updated_at`.
   - Integritas data dikawal trigger `verify_maintenance_against_projector()` dan `guard_maintenance_history()`.
2. **Row Level Security (RLS):**
   - Policy `maintenance_records_select_staff_admin` telah terpasang dan aktif untuk role `STAFF` dan `ADMIN`.
3. **Data Riwayat Aktual di `PINJAM_TESTING`:**
   - Database telah memuat 3 baris record pemeliharaan nyata dari transaksi inspeksi pengembalian rusak (status `IN_PROGRESS`).
4. **Kecocokan Kontrak Domain:**
   - Struktur data tabel cocok 100% dengan tipe frontend `MaintenanceRecord` pada `src/types/domain.ts`.
5. **Kekurangan Backend Saat Ini:**
   - Belum ada modul service `src/lib/maintenance/maintenance-service.ts`.
   - Belum ada 3 route handler backend:
     - `GET /api/v1/staff/maintenance/route.ts` (List riwayat maintenance berhalaman)
     - `POST /api/v1/staff/projectors/[projectorId]/maintenance/route.ts` (Mulai maintenance unit)
     - `POST /api/v1/staff/maintenance/[maintenanceId]/complete/route.ts` (Selesaikan maintenance unit)

### 3.5 Kategori Cacat Masalah B
**Backend Missing Route Handlers & Missing Domain Service**.

---

## 4. Matriks Perbandingan & Klasifikasi Masalah

| Parameter | Masalah A: QR Scanner Kamera | Masalah B: Catatan Maintenance |
|---|---|---|
| **Halaman Terkait** | `/staff/scan` | `/staff/maintenance` |
| **Sumber Masalah** | **Frontend (React)** | **Backend (API Routes & Service)** |
| **Penyebab Utama** | Elemen `<video>` belum dimount saat `srcObject` ditautkan (`videoRef.current == null`) | Endpoint `GET /api/v1/staff/maintenance` mengembalikan HTTP 404 HTML |
| **Dampak** | Area tinjauan kamera hitam; staf terpaksa input manual | Riwayat maintenance gagal dimuat (`UNKNOWN_ERROR`); aksi modal mulai/selesai terhambat |
| **Kesiapan Database** | N/A (Client media stream) | ✅ Tabel & RLS `maintenance_records` sudah 100% siap di `PINJAM_TESTING` |
| **Solusi Diperlukan** | Perbaikan ref binding hook & constraint kamera | Implementasi service & route handler maintenance di backend |

---

## 5. Rekomendasi Solusi & Rencana Implementasi

### 5.1 Rencana Solusi Masalah A (QR Scanner)
1. **Perbaikan Ref Binding pada `src/features/staff/staff-qr-scan-view.tsx`:**
   - Gunakan `useEffect` yang bereaksi terhadap perubahan `cameraActive` dan `streamRef.current`:
     ```ts
     useEffect(() => {
       if (cameraActive && videoRef.current && streamRef.current) {
         videoRef.current.srcObject = streamRef.current;
         videoRef.current.play().catch((err) => {
           console.warn("Auto-play video ditolak:", err);
         });
       }
     }, [cameraActive]);
     ```
2. **Kamera Constraint Adaptif:**
   - Ubah constraint `getUserMedia`:
     ```ts
     video: { facingMode: { ideal: "environment" }, width: { ideal: 1280 }, height: { ideal: 720 } }
     ```
   - Berikan fallback jika kamera belakang tidak tersedia, otomatis gunakan default webcam tanpa melempar error.
3. **Pembersihan Bersih (Clean Teardown):**
   - Pastikan seluruh tracks dihentikan saat unmount, saat tombol *"Matikan Kamera"* ditekan, atau saat berganti aksi (`PICKUP` <-> `RETURN`).
4. **Fallback Input Manual:**
   - Pertahankan kolom input token manual yang saat ini sudah berjalan baik sebagai opsi cadangan.

### 5.2 Rencana Solusi Masalah B (Maintenance)
1. **Buat Service Backend: `src/lib/maintenance/maintenance-service.ts`:**
   - `listStaffMaintenance(context, requestUrl, deps)`:
     - Kueri ke tabel `maintenance_records` dengan filter `status` (`IN_PROGRESS`, `COMPLETED`), pagination (`page`, `pageSize`), dan pengurutan `started_at DESC`.
     - Mengembalikan `{ items: MaintenanceRecord[], pagination: PaginationMeta }`.
   - `createStaffMaintenance(context, projectorId, payload, deps)`:
     - Memastikan proyektor ada dan tidak sedang dalam pinjaman aktif (`status = 'ACTIVE'`).
     - Mengubah status fisik proyektor menjadi `MAINTENANCE`.
     - Menyimpan record baru ke `maintenance_records` dengan status `IN_PROGRESS` dan mencatat audit log.
   - `completeStaffMaintenance(context, maintenanceId, payload, deps)`:
     - Mengubah status record menjadi `COMPLETED` (`resolution_note`, `completed_at = now()`, `completed_by = staffUserId`).
     - Jika `set_projector_available = true`, mengembalikan status fisik proyektor ke `AVAILABLE` dan mencatat audit log.
2. **Buat Route Handlers Backend:**
   - `src/app/api/v1/staff/maintenance/route.ts` (`GET`)
   - `src/app/api/v1/staff/projectors/[projectorId]/maintenance/route.ts` (`POST`)
   - `src/app/api/v1/staff/maintenance/[maintenanceId]/complete/route.ts` (`POST`)
3. **Proteksi Otorisasi:**
   - Seluruh route handler diproteksi dengan `requireStaffOrAdmin(request)` dari `src/lib/auth/guards.ts`.
4. **Pengujian Regresi Unit:**
   - Tambahkan unit regression test untuk maintenance service dan route handler (akses STAFF/ADMIN 200, penolakan KOMTING 403, unauthenticated 401, serta alur start dan complete maintenance).

---

## 6. Status Diagnosis

Diagnosis selesai dan didokumentasikan secara lengkap. Tidak ada perubahan kode atau mutasi database yang dilakukan selama fase ini.

Menunggu persetujuan pengguna untuk melanjutkan ke tahap implementasi perbaikan.
