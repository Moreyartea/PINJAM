# LAPORAN PENYEDERHANAAN ORIENTASI KAMERA QR SCANNER — SATU MODE KONSISTEN

**Proyek:** PINJAM  
**Branch:** `feat/fullstack-integration`  
**Tanggal:** 27 November 2026  
**Status:** **VERIFIED & CLOSED (SIMPLIFIED TO SINGLE MODE)**  
**File Terdampak:**
- `src/features/staff/staff-qr-scan-view.tsx`
- `src/features/staff/__tests__/staff-qr-scan-view.test.tsx`

---

## 1. Latar Belakang & Alasan Penyederhanaan

Sebelumnya, diterapkan eksperimen dua mode orientasi kamera (*Cermin/Normal*) dengan tombol *toggle* dan logika adaptif berbasis `facingMode`. 

Setelah dilakukan pengujian manual langsung oleh pengguna pada perangkat pengujian lapangan:
- Kedua mode menghasilkan tampilan visual yang sama pada perangkat uji.
- Opsi *toggle* orientasi dan indikator mode terbukti menambah kompleksitas antarmuka tanpa memberikan perbedaan fungsional yang dapat diverifikasi secara fisik.
- Sesuai arahan pengguna, fitur dua mode orientasi dibatalkan (*reverted*) dan antarmuka pemindai QR disederhanakan kembali menjadi **satu mode kamera yang konsisten, bersih, dan andal**.

---

## 2. Rincian Perubahan Kode (Code Changes)

### 2.1 Perubahan pada `src/features/staff/staff-qr-scan-view.tsx`
1. **Penghapusan State & Handler Orientasi:**
   - Menghapus state `previewMode` (`"normal" | "mirrored"`) dan `detectedFacingMode`.
   - Menghapus logika adaptasi `settings.facingMode` pada fungsi `handleStartCamera()`.
   - Mengembalikan pemanggilan `getUserMedia` langsung mengalir ke inisialisasi `BarcodeDetector`.
2. **Penghapusan Tombol Toggle UI & Indikator:**
   - Menghapus tombol toggle `🔄 Orientasi: Cermin (Front) / Normal (Back)` (`toggle-preview-orientation-btn`).
   - Menghapus badge status orientasi (`camera-orientation-badge`).
3. **Penyederhanaan Tampilan Elemen `<video>`:**
   - Mengembalikan elemen `<video data-testid="qr-video-preview">` ke styling tunggal standar yang bersih:
     ```tsx
     <div className="nb-border rounded-[var(--radius-sm)] overflow-hidden bg-black">
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
         className="w-full max-h-64 object-cover"
       />
     </div>
     ```

### 2.2 Perubahan pada `src/features/staff/__tests__/staff-qr-scan-view.test.tsx`
1. Memperbarui suite pengujian agar memvalidasi perilaku satu mode:
   - Memastikan tidak ada tombol *toggle* orientasi (`toggle-preview-orientation-btn`) atau badge mode orientasi yang tersisa di DOM.
   - Memastikan kamera aktif merender elemen video secara bersih dan tombol "Matikan Kamera" menghentikan seluruh tracks serta melepas video dari DOM.
   - Memastikan pemindaian otomatis `BarcodeDetector` mendeteksi token QR dan memicu validasi endpoint backend `/api/v1/staff/qr/validate` secara akurat.

---

## 3. Invarian Fungsi Utama yang Dipertahankan (Preserved Core Features)

Seluruh kemampuan operasional scanner tetap berfungsi 100%:
1. **Lifecycle Kamera:** Aktivasi kamera, rendering pratinjau, dan penghentian kamera berjalan mulus.
2. **Cleanup Stream Deterministik:** Penghentian track (`track.stop()`) berjalan saat tombol "Matikan Kamera" diklik, saat tab aksi `PICKUP` $\leftrightarrow$ `RETURN` beralih, atau saat komponen unmount. Tidak ada kebocoran stream ganda (*duplicate stream*).
3. **Deteksi Otomatis BarcodeDetector:** QR code otomatis terdeteksi dari frame video kamera dan memicu validasi token.
4. **Validasi Backend API:** Integrasi dengan backend `/api/v1/staff/qr/validate` dan `/api/v1/staff/loans` tidak diubah sama sekali.
5. **Fallback Token Manual:** Form input manual token QR tetap aktif dan responsif.

---

## 4. Hasil Rangkaian Uji Regresi (Regression Suite)

```bash
npm run test:unit:be && npm run test:unit:fe && npm run typecheck && npm run lint && npm run build
```

| Suite Pengujian | Hasil | Status |
|---|---|:---:|
| **Frontend Unit Tests (`test:unit:fe`)** | **213 passed**, 0 failed (32 test files) | ✅ **PASS** |
| **Backend Unit Tests (`test:unit:be`)** | **175 passed**, 0 failed | ✅ **PASS** |
| **TypeScript Typecheck (`typecheck`)** | `tsc --noEmit` bersih tanpa error | ✅ **PASS** |
| **ESLint (`lint`)** | 0 errors | ✅ **PASS** |
| **Next.js Production Build (`build`)** | 50/50 routes terkompilasi sukses | ✅ **PASS** |

Server daemon Next.js di `http://localhost:3000` telah diperbarui dengan build terbaru.

---

## 5. Batasan & Kesimpulan

1. **Batasan Terpenuhi:**
   - Tidak ada perubahan database atau migrasi schema.
   - Tidak menyentuh fitur lain di luar QR scanner.
   - Tidak dilakukan git commit atau git push.
   - Tidak ada klaim bahwa orientasi kamera telah diperbaiki secara optik fisik; pemindai secara transparan dilaporkan telah disederhanakan menjadi satu mode konsisten.
2. **Kondisi Akhir Scanner:**
   Antarmuka scanner STAFF kini kembali sederhana, minimalis, cepat, dan bebas dari konfigurasi orientasi yang berlebihan, dengan seluruh fungsi pemindaian QR dan integrasi backend bekerja optimal.
