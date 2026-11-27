# Laporan Perbaikan UAT Defect: Validasi & UX Waktu Booking (UAT-DEF-002)

**Tanggal:** 27 November 2026  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** `PINJAM_TESTING` (`https://kaflptksvqwcurzacifs.supabase.co`)  
**Status:** **RESOLVED & VERIFIED**

---

## 1. Ringkasan Masalah

Pada pelaksanaan pengujian **UAT-KMT-06 (Formulir Booking Baru)** di halaman `/komting/bookings/new`:
- Formulir booking sebelumnya menggunakan nilai default statis: `startTime = "09:00"` dan `estimatedReturnTime = "11:00"`.
- Ketika tester mengakses halaman pada siang/sore hari (contoh: pukul 15:12 WIB pada tanggal yang sama), nilai default tersebut sudah berada di masa lalu, sehingga membingungkan tester dan memicu kesalahan sebelum submit.
- Selain itu, bila waktu saat ini telah melewati batas operasional harian (17:00 WIB atau < 15 menit sebelum tutup), sistem sebelumnya tidak memberikan indikasi awal bahwa slot hari ini sudah tidak memungkinkan untuk dipesan.

---

## 2. Solusi & Perubahan Implementasi

Perbaikan dilakukan secara komprehensif pada lapisan **Frontend UX & Client Validation**, dengan tetap mempertahankan otoritas penuh **Backend Business Logic** sebagai penegak integritas data:

### A. Modul Validasi & Helper Waktu (`src/lib/validation/booking.ts`)
1. **Helper Konversi Waktu Jakarta:**
   - Ditambahkan fungsi murni `toMinutes`, `minutesToTime`, dan `formatHHmm`.
2. **Kalkulator Batas Adaptif (`getBookingTimeBounds`):**
   - Menghitung batasan waktu dinamis berdasarkan tanggal yang dipilih (`bookingDate`), snapshot jam operasional backend (`OperatingHoursSnapshot`), dan waktu acuan Jakarta saat ini (`Asia/Jakarta`).
   - **Jika Hari Ini (`isToday = true`):**
     - Memeriksa apakah sisa waktu operasional masih mencukupi (minimal 15 menit sebelum tutup). Jika tidak (`currentMin >= maxStartMin`), `isTodayBookable` bernilai `false` dengan pesan `unavailabilityReason`.
     - Menghitung `defaultStartTime` secara adaptif: membulatkan waktu sekarang ke slot 15 menit berikutnya ditambah jeda persiapan minimal 5 menit (contoh: 15:12 WIB $\rightarrow$ 15:30 WIB).
     - Menghitung `defaultReturnTime` secara adaptif ($\min(\text{start} + 120\text{ menit}, \text{closes\_at})$).
     - Menetapkan batas `minStartTime` agar pengguna tidak dapat memilih waktu di masa lalu pada input browser.
   - **Jika Besok (`isToday = false`):**
     - Menyediakan rentang penuh sesuai jam operasional besok (default mulai pukul 09:00 WIB atau jam buka, kembali pukul 11:00 WIB).
3. **Validasi State Komprehensif (`validateBookingForm`):**
   - Menolak booking hari ini jika operasional hari ini sudah berakhir.
   - Menolak waktu mulai di masa lalu (`Waktu mulai tidak boleh berada di masa lalu.`).
   - Menolak estimasi pengembalian yang melebihi jam operasional tutup (`closes_at`).
   - Menolak estimasi pengembalian yang lebih awal atau sama dengan waktu mulai.

### B. Komponen Formulir Booking (`src/features/bookings/new-booking-form.tsx`)
1. **Initial State Adaptif:**
   - Formulir menginisialisasi `bookingDate`, `startTime`, dan `estimatedReturnTime` menggunakan `getBookingTimeBounds`. Jika waktu saat membuka halaman sudah melewati jam operasional hari ini, formulir otomatis memilih tanggal besok (`tomorrowDate`).
2. **Penyesuaian Tanggal (`handleDateChange`):**
   - Saat tester beralih antara "Hari Ini" dan "Besok", batasan waktu dihitung ulang secara dinamis sesuai jam operasional masing-masing hari.
   - Jika nilai waktu yang sebelumnya terisi tidak valid untuk tanggal baru, formulir langsung menyesuaikannya ke default yang valid.
3. **Penyesuaian Waktu Mulai & Pengembalian (`handleStartTimeChange`):**
   - Jika tester menggeser `startTime` maju sehingga melampaui atau mendekati `estimatedReturnTime`, estimasi pengembalian otomatis dimajukan ($\min(\text{start} + 120\text{ menit}, \text{closes\_at})$).
4. **Indikator Visual & HTML Constraint:**
   - Menambahkan atribut HTML `min` dan `max` pada `<input type="time">` untuk waktu mulai dan waktu pengembalian.
   - Menambahkan petunjuk visual di bawah input waktu (`booking-start-time-hint` dan `booking-return-time-hint`).
   - Menampilkan banner peringatan (Alert) jika jam operasional hari ini telah berakhir beserta tombol kirim yang dinonaktifkan (`disabled`).

### C. Backend Rejection Authority (`src/lib/bookings/booking-service.ts`)
- Backend tetap menjadi *single source of truth*. Kode `isDateTimeInPastJakarta(bookingDate, startTime)` pada baris 690 secara tegas melempar `422 BOOKING_TIME_IN_PAST` jika ada permintaan dengan waktu lampau.

---

## 3. Hasil Verifikasi & Uji Regresi

### A. Backend Unit Tests
- **Status:** **155/155 PASS**
- Ditambahkan regression test di `tests/be4/booking-and-loan.test.ts`:
  - `rejects booking when start time is in the past for today (Asia/Jakarta)` $\rightarrow$ Memastikan penolakan langsung dengan status 422, error code `BOOKING_TIME_IN_PAST`, dan pesan `"Waktu booking sudah terlewat."`.

### B. Frontend Unit Tests
- **Status:** **208/208 PASS** (32 file pengujian)
- Ditambahkan pengujian unit di `src/lib/validation/__tests__/booking.test.ts`:
  - Konversi waktu jam-menit.
  - Perhitungan batas waktu adaptif hari ini sebelum jam buka (07:15 WIB).
  - Perhitungan batas waktu adaptif hari ini tengah hari (15:12 WIB).
  - Penolakan hari ini saat melewati jam operasional tutup (17:05 WIB).
  - Penolakan waktu mulai di masa lalu dan pengembalian melampaui jam operasional.
- Ditambahkan pengujian integrasi komponen di `src/features/bookings/__tests__/new-booking-form.test.tsx`:
  - Default adaptif pada waktu mulai dan waktu pengembalian.
  - Penyesuaian otomatis waktu pengembalian saat waktu mulai diubah.
  - Pengujian ketersediaan proyektor bersyarat dan batas jam operasional.

### C. Static Analysis & Build
- **Typecheck (`npm run typecheck`):** **PASS** (0 errors).
- **Linter (`npm run lint`):** **PASS** (0 errors).
- **Production Build (`npm run build`):** **PASS** (Optimized standalone build 48/48 routes).

### D. Verifikasi Live API (`PINJAM_TESTING`)
- Pengujian live API dilakukan terhadap server lokal yang terhubung ke `PINJAM_TESTING`:
  - Request login menggunakan akun KOMTING pengujian: `e2e-komting-mwym0uut@example.test`.
  - Mengirim `POST /api/v1/bookings` dengan tanggal hari ini dan `start_time: "00:01:00"` (waktu lampau).
  - **Hasil HTTP:** `422 Unprocessable Entity`
  - **Response Body:**
    ```json
    {
      "error": {
        "code": "BOOKING_TIME_IN_PAST",
        "message": "Waktu booking sudah terlewat.",
        "details": [
          { "field": "start_time", "reason": "IN_PAST" }
        ]
      },
      "meta": {
        "request_id": "req_87f470f2-e8de-4ae8-8c80-b040ca8d3af8"
      }
    }
    ```
  - **Verifikasi Integritas:** Tidak ada record booking baru yang tersimpan di database `PINJAM_TESTING` akibat penolakan ini.

---

## 4. Panduan Eksekusi UAT-KMT-06 Berikutnya

Untuk melanjutkan pengujian skenario **UAT-KMT-06 (Formulir Booking Baru)**:
1. **Akun Pengujian Direkomendasikan:**
   - Gunakan akun `e2e-komting-mwym0uut@example.test` (password: `TestPassword123!`), karena akun ini berstatus `ACTIVE`, memiliki penugasan aktif (`IF-E2E-0VDB`), serta saat ini memiliki **0 booking aktif** dan **0 peminjaman aktif**.
   - *(Catatan: Akun `conc-komting2@example.test` sebelumnya masih memiliki booking aktif `BKG-CONC-2` sehingga akan ditolak dengan `ACTIVE_BOOKING_EXISTS` jika membuat booking baru).*
2. **Jadwal Booking yang Direkomendasikan:**
   - **Pilihan 1 (Hari ini jika jam operasional masih buka):**
     - Tanggal: Tanggal hari ini.
     - Waktu Mulai: Waktu sekarang + minimal 15–30 menit (contoh: jika pukul 15:45 WIB, pilih 16:00 WIB).
     - Estimasi Pengembalian: Sebelum pukul 17:00 WIB (contoh: 16:45 WIB).
   - **Pilihan 2 (Besok - Sangat Direkomendasikan):**
     - Tanggal: Tanggal besok.
     - Waktu Mulai: `09:00 WIB`.
     - Estimasi Pengembalian: `11:00 WIB`.
     - Jadwal ini berada dalam jam operasional standar (08:00–17:00 WIB) dan bebas dari konflik waktu lampau.
