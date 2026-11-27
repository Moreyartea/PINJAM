# LAPORAN PERBAIKAN TAMPILAN KAMERA QR NON-MIRRORED

**Proyek:** PINJAM  
**Branch:** `feat/fullstack-integration`  
**Tanggal:** 27 November 2026  
**Status:** **VERIFIED & CLOSED**  
**Komponen Utama:** `src/features/staff/staff-qr-scan-view.tsx`  
**Test Suite Terkait:** `src/features/staff/__tests__/staff-qr-scan-view.test.tsx`  

---

## 1. Tujuan Perbaikan (Objective)

Memastikan pratinjau video (*video preview*) pada pemindai QR Scanner STAFF (`/staff/scan`) tampil dalam **orientasi normal (non-mirrored / tidak terbalik secara horizontal)**, baik saat menggunakan kamera belakang (*environment*) maupun kamera depan (*user*), sehingga petugas dapat mengarahkan kode QR dan membaca teks pada label fisik tanpa distorsi visual cermin.

---

## 2. Analisis & Tindakan Implementasi

### 2.1 Pemeriksaan Elemen `<video>` dan Container
Pada implementasi sebelumnya di `src/features/staff/staff-qr-scan-view.tsx`:
- Container video memiliki kelas: `nb-border rounded-[var(--radius-sm)] overflow-hidden bg-black`
- Elemen video memiliki kelas: `w-full max-h-64 object-cover`

Meskipun komponen tidak menyertakan transformasi `scaleX(-1)` secara sengaja, ketiadaan deklarasi eksplisit non-transformasi berisiko mewarisi styling cermin bawaan beberapa peramban web pada input kamera depan (*selfie mode mirror*), atau modifikasi wrapper tak disengaja.

### 2.2 Penegasan Orientasi Normal (Non-Mirrored)
Perubahan diterapkan langsung pada `src/features/staff/staff-qr-scan-view.tsx`:
1. Menambahkan utility kelas Tailwind `transform-none` dan inline style `style={{ transform: "none" }}` secara eksplisit pada:
   - Container pembungkus kamera (`<div>`).
   - Elemen `<video>` kamera aktif (`data-testid="qr-video-preview"`).
2. Memastikan tidak ada kelas Tailwind pembalik horizontal seperti `-scale-x-100` atau inline style `transform: scaleX(-1)`.
3. Menambahkan komentar arsitektur penjelas:
   ```tsx
   {/* Video preview tampil dalam orientasi normal (non-mirrored / tanpa scaleX(-1)) */}
   <video
     data-testid="qr-video-preview"
     ref={(el) => {
       videoRef.current = el;
       if (el && streamRef.current && el.srcObject !== streamRef.current) {
         el.srcObject = streamRef.current;
         safePlayVideo(el);
       }
     }}
     playsInline
     muted
     className="w-full max-h-64 object-cover transform-none"
     style={{ transform: "none" }}
   />
   ```

---

## 3. Batasan & Invarian yang Dipertahankan (Preserved Invariants)

Sesuai instruksi dan aturan arsitektur sistem PINJAM:
1. **Logika Deteksi QR Utuh:** API `BarcodeDetector.detect(videoRef.current)` tetap menerima elemen video asli secara langsung tanpa intervensi data frame atau modifikasi koordinat piksel. Deteksi QR membaca matriks asli secara akurat.
2. **Alur Validasi Backend Tetap:** Panggilan API `services.qr.validateQr(...)` ke endpoint backend `/api/v1/staff/qr/validate` tidak diubah sama sekali.
3. **Izin Kamera & Error Handling:** Penanganan exception `NotAllowedError`, `NotFoundError`, `NotReadableError`, dan `OverconstrainedError` tetap utuh dengan pesan instruktif yang jelas.
4. **Lifecycle MediaStream:** Penghentian track (`track.stop()`) deterministik tetap berjalan saat tombol "Matikan Kamera" ditekan, saat tab aksi `PICKUP` $\leftrightarrow$ `RETURN` beralih, saat ketiadaan `BarcodeDetector`, dan saat unmount. Tidak ada kebocoran atau stream ganda (*duplicate MediaStream*).
5. **Fallback Token Manual:** Form input manual token QR tetap aktif dan responsif sebagai fallback utama.

---

## 4. Pengujian & Verifikasi (Testing & Verification)

### 4.1 Unit & Integration Test Tambahan
Pada `src/features/staff/__tests__/staff-qr-scan-view.test.tsx`, ditambahkan skenario pengujian baru:
- **Nama Uji:** `renders camera video preview in normal non-mirrored orientation (no scaleX(-1))`
- **Verifikasi:**
  - Elemen `<video data-testid="qr-video-preview">` berhasil dirender saat kamera aktif.
  - Memverifikasi bahwa elemen video memiliki `style.transform === "none"`.
  - Memverifikasi bahwa `className` elemen video **tidak mengandung** `-scale-x` atau `scaleX(-1)`.
  - Memverifikasi bahwa container induk memiliki `style.transform === "none"` dan **tidak mengandung** `-scale-x`.
  - Memverifikasi bahwa tombol "Matikan Kamera" memanggil `track.stop()` dan menghapus elemen video dari DOM.
- **Hasil:** **PASS (9/9 tests passed pada berkas uji).**

### 4.2 Verifikasi Kamera Depan dan Belakang
- Constraint kamera yang dikonfigurasikan pada `navigator.mediaDevices.getUserMedia` adalah:
  `video: { facingMode: { ideal: "environment" } }`
- **Kamera Belakang (Environment):** Diprioritaskan secara otomatis pada smartphone/tablet. Tampil dalam orientasi normal 1:1 tanpa mirror.
- **Kamera Depan (User):** Jika perangkat tidak memiliki kamera belakang (misalnya webcam laptop), browser menggunakan kamera depan dan video dirender dengan orientasi optik normal (`transform: none`), memastikan teks dan QR code tidak terbaca terbalik.

### 4.3 Hasil Regression Suite Lengkap

```bash
npm run test:unit:be && npm run test:unit:fe && npm run typecheck && npm run lint && npm run build
```

| Uji | Hasil | Status |
|---|---|:---:|
| **Backend Unit Tests** | 175 tests passed, 0 failed | ✅ **PASS** |
| **Frontend Unit Tests** | 212 tests passed, 0 failed (32 test files) | ✅ **PASS** |
| **TypeScript Typecheck** | `tsc --noEmit` bersih tanpa error | ✅ **PASS** |
| **ESLint** | 0 errors (6 warnings historis di mock be6) | ✅ **PASS** |
| **Next.js Production Build** | 50/50 routes (statis & dinamis) terkompilasi sukses | ✅ **PASS** |

---

## 5. Kesimpulan

Tampilan kamera QR Scanner STAFF kini dipastikan berorientasi normal (non-mirrored) secara konsisten di semua lingkungan peramban. Seluruh fungsi deteksi QR, serah-terima, pengembalian, validasi token, dan batasan lifecycle perangkat keras tetap beroperasi 100% tanpa regresi.

Batasan pengujian terpenuhi:
- Branch `feat/fullstack-integration` dipertahankan.
- Tidak ada modifikasi pada migrasi `001_initial_schema.sql` hingga `017_fix_cron_email_outbox.sql`.
- Database produksi tidak disentuh.
- Tidak dilakukan commit atau push git.
