# DOKUMEN SKENARIO PENGUJIAN PENERIMAAN PENGGUNA (UAT TEST CASES)
# PINJAM — Sistem Peminjaman Proyektor

**Versi:** 1.0.0  
**Tanggal:** 27 November 2026  
**Status Eksekusi Global:** 🟡 **NOT TESTED (Draf Siap Uji)**  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** Supabase Live `PINJAM_TESTING` (`kaflptksvqwcurzacifs.supabase.co`) & Next.js Server (`http://localhost:3000`)  

---

## DAFTAR ISI

1. [Panduan Eksekusi Pengujian](#panduan-eksekusi-pengujian)
2. [Bagian 1: Skenario UAT Role ADMIN (15 Test Cases)](#bagian-1-skenario-uat-role-admin)
   - `UAT-ADM-01`: Login Admin & Verifikasi Dashboard Statistik
   - `UAT-ADM-02`: Navigasi & Proteksi Menu Khusus Admin
   - `UAT-ADM-03`: Review Pengajuan Komting & Pratinjau Foto Identitas (KTM)
   - `UAT-ADM-04`: Persetujuan (Approval) Pengajuan Komting Baru
   - `UAT-ADM-05`: Penolakan (Rejection) Pengajuan Komting dengan Alasan Wajib
   - `UAT-ADM-06`: Approval Pengajuan Pergantian Komting (Replacement Workflow)
   - `UAT-ADM-07`: Penonaktifan Penugasan Komting Aktif (Deactivation)
   - `UAT-ADM-08`: Inventaris Proyektor — Penambahan Unit Baru
   - `UAT-ADM-09`: Inventaris Proyektor — Pembaruan Data Unit & Spesifikasi
   - `UAT-ADM-10`: Inventaris Proyektor — Deaktivasi Unit Proyektor
   - `UAT-ADM-11`: Pengaturan Jam Operasional & Penyesuaian Buka/Tutup
   - `UAT-ADM-12`: Manajemen Akun Petugas Staff
   - `UAT-ADM-13`: Pemantauan & Filter Log Audit Sistem (Append-Only)
   - `UAT-ADM-14`: Detail Rekaman Log Audit Transaksional
   - `UAT-ADM-15`: Akses Halaman Koreksi Transaksi (Status Kontrak §13.3)
3. [Bagian 2: Skenario UAT Role STAFF (12 Test Cases)](#bagian-2-skenario-uat-role-staff)
   - `UAT-STF-01`: Login Staff & Verifikasi Dashboard Layanan Operasional
   - `UAT-STF-02`: Pemantauan Antrean Booking Siap Pickup Hari Ini
   - `UAT-STF-03`: Validasi Scan Tiket QR untuk Pickup Proyektor
   - `UAT-STF-04`: Konfirmasi Serah-Terima (Pickup Handover) Unit ke Komting
   - `UAT-STF-05`: Konfirmasi Pickup yang Diwakilkan (Representative)
   - `UAT-STF-06`: Pemantauan Daftar Pinjaman Berjalan & Status Overdue
   - `UAT-STF-07`: Validasi Scan Tiket QR untuk Pengembalian (Return)
   - `UAT-STF-08`: Inspeksi Fisik Kondisi Normal & Pengembalian Lengkap
   - `UAT-STF-09`: Inspeksi Unit Rusak / Komponen Hilang dengan Foto Bukti & Denda
   - `UAT-STF-10`: Disposisi Fisik Proyektor Rusak ke Status MAINTENANCE
   - `UAT-STF-11`: Pemantauan Unit Proyektor dalam Pemeliharaan
   - `UAT-STF-12`: Penolakan Akses Fitur Khusus Admin (Staff Guard Check)
4. [Bagian 3: Skenario UAT Role KOMTING (15 Test Cases)](#bagian-3-skenario-uat-role-komting)
   - `UAT-KMT-01`: Registrasi Calon Komting dengan Unggah Foto Identitas (KTM)
   - `UAT-KMT-02`: Validasi Input Formulir Pendaftaran Komting
   - `UAT-KMT-03`: Pengecekan Status Pengajuan Pendaftaran Komting
   - `UAT-KMT-04`: Login Komting Aktif & Dashboard Mahasiswa
   - `UAT-KMT-05`: Eksplorasi Inventaris & Kalender Ketersediaan Proyektor
   - `UAT-KMT-06`: Pengecekan Jam Layanan & Hari Libur Kampus
   - `UAT-KMT-07`: Pembuatan Booking Proyektor untuk Hari Ini / Besok
   - `UAT-KMT-08`: Penegakan Batasan Aturan: Maksimum 1 Booking Aktif
   - `UAT-KMT-09`: Penegakan Batasan Aturan: Pencegahan Jadwal Bentrok (Conflict)
   - `UAT-KMT-10`: Pembatalan Booking Mandiri Sebelum Diambil
   - `UAT-KMT-11`: Penayangan Tiket QR Pickup pada Detail Booking
   - `UAT-KMT-12`: Transisi Tampilan Detail Booking Setelah Pickup (Status FULFILLED)
   - `UAT-KMT-13`: Pemantauan Riwayat Peminjaman (Loan History)
   - `UAT-KMT-14`: Inisiasi Pengembalian & Penayangan Modal Tiket QR Return
   - `UAT-KMT-15`: Penegakan Batasan Aturan: Dilarang Booking Saat Memiliki Loan Aktif
5. [Bagian 4: Skenario UAT Keamanan & Lintas Peran (6 Test Cases)](#bagian-4-skenario-uat-keamanan--lintas-peran)
   - `UAT-SEC-01`: Penanganan Login Gagal Kredensial Tidak Valid (HTTP 401)
   - `UAT-SEC-02`: Penolakan Login Pengguna Berstatus INACTIVE atau REJECTED
   - `UAT-SEC-03`: Pengalihan Akses Tanpa Autentikasi ke Halaman Login
   - `UAT-SEC-04`: Persistensi Sesi Pengguna Setelah Browser Refresh
   - `UAT-SEC-05`: Logout Pengguna & Pembersihan Total Sesi Browser
   - `UAT-SEC-06`: Persistensi & Pemrosesan Transactional Email Outbox Batch
6. [Tabel Ringkasan Status UAT](#tabel-ringkasan-status-uat)

---

## Panduan Eksekusi Pengujian

1. **Format Status Pengujian:**
   - `NOT TESTED`: Skenario belum dieksekusi oleh penguji (nilai bawaan dokumen ini).
   - `PASS`: Hasil pengujian di lapangan sesuai 100% dengan kriteria *Expected Result*.
   - `FAIL`: Hasil pengujian di lapangan tidak sesuai dengan *Expected Result* atau terjadi kesalahan (*error*).
   - `BLOCKED`: Skenario tidak dapat dijalankan karena adanya kendala pada skenario prasyarat.
2. **Pengisian Kolom `Actual Result`:**
   - Kolom *Actual Result* wajib diisi secara faktual saat pengujian dilaksanakan oleh penguji.
3. **Dokumentasi Bukti (*Evidence*):**
   - Setiap pengujian wajib menyertakan tangkapan layar (*screenshot*) yang disimpan dengan format nama:  
     `EVIDENCE_<TEST_CASE_ID>_<STATUS>_<YYYYMMDD>.png`.

---

## Bagian 1: Skenario UAT Role ADMIN

### UAT-ADM-01: Login Admin & Verifikasi Dashboard Statistik
- **Test Case ID:** `UAT-ADM-01`
- **Nama Pengujian:** Login Admin & Verifikasi Dashboard Statistik
- **Tujuan:** Memastikan pengguna dengan peran ADMIN dapat masuk ke sistem dan melihat dashboard statistik operasional secara akurat.
- **Prasyarat:** Akun Admin `conc-admin@example.test` aktif di database.
- **Langkah Pengujian:**
  1. Buka peramban (*browser*) dan arahkan ke `http://localhost:3000/login`.
  2. Masukkan email: `conc-admin@example.test`.
  3. Masukkan password: `TestPassword123!`.
  4. Klik tombol **"Masuk ke Sistem"**.
  5. Periksa pengalihan URL dan konten halaman yang muncul.
- **Expected Result:**
  - Pengguna dialihkan ke URL `/admin`.
  - Header navigasi menampilkan badge peran **ADMIN**.
  - Dashboard menampilkan statistik: jumlah unit proyektor (total, tersedia, dipinjam, maintenance), pengajuan komting menunggu verifikasi, dan antrean booking hari ini.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman `/admin` dengan kartu statistik lengkap dan badge role ADMIN.

---

### UAT-ADM-02: Navigasi & Proteksi Menu Khusus Admin
- **Test Case ID:** `UAT-ADM-02`
- **Nama Pengujian:** Navigasi & Proteksi Menu Khusus Admin
- **Tujuan:** Memverifikasi seluruh menu navigasi admin dapat dibuka dan beroperasi dengan respons visual yang stabil.
- **Prasyarat:** Pengguna telah login sebagai ADMIN pada `UAT-ADM-01`.
- **Langkah Pengujian:**
  1. Klik menu navigasi sidebar/header: **"Pengajuan Komting"** (`/admin/applications`).
  2. Klik menu **"Penugasan Aktif"** (`/admin/assignments`).
  3. Klik menu **"Inventaris Proyektor"** (`/admin/projectors`).
  4. Klik menu **"Jam Operasional"** (`/admin/operating-hours`).
  5. Klik menu **"Petugas Staff"** (`/admin/staff`).
  6. Klik menu **"Log Audit"** (`/admin/audit-logs`).
- **Expected Result:**
  - Setiap tautan membuka halaman yang relevan dengan HTTP 200 tanpa *runtime crash* atau *white screen*.
  - Desain antarmuka konsisten mengadopsi tema Neubrutalism (border solid, shadow kontras, tipografi tegas).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar transisi navigasi menu Admin Shell.

---

### UAT-ADM-03: Review Pengajuan Komting & Pratinjau Foto Identitas (KTM)
- **Test Case ID:** `UAT-ADM-03`
- **Nama Pengujian:** Review Pengajuan Komting & Pratinjau Foto Identitas (KTM)
- **Tujuan:** Memverifikasi admin dapat memeriksa berkas identitas calon Komting melalui URL gambar privat yang aman (*signed URL*).
- **Prasyarat:** Terdapat pengajuan Komting berstatus `PENDING_VERIFICATION` dengan berkas foto KTM.
- **Langkah Pengujian:**
  1. Akses halaman `/admin/applications`.
  2. Pilih salah satu baris pengajuan komting berstatus `PENDING_VERIFICATION`.
  3. Klik tombol aksi **"Periksa Detail"** untuk membuka `/admin/applications/:id`.
  4. Periksa kartu detail identitas: Nama Lengkap, NIM, Nama Kelas, dan Email.
  5. Periksa komponen pratinjau dokumen identitas di sisi kanan.
- **Expected Result:**
  - Foto KTM tertampil dengan jelas di dalam kartu pratinjau dokumen privat.
  - Terdapat tombol **"Buka Ukuran Penuh"** dan tombol **"Muat Ulang Dokumen"** jika masa berlaku link kedaluwarsa.
  - Link foto menggunakan Supabase Storage signed URL (bukan public bucket URL).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar kartu pratinjau foto KTM calon komting di `/admin/applications/:id`.

---

### UAT-ADM-04: Persetujuan (Approval) Pengajuan Komting Baru
- **Test Case ID:** `UAT-ADM-04`
- **Nama Pengujian:** Persetujuan (Approval) Pengajuan Komting Baru
- **Tujuan:** Memverifikasi admin dapat menyetujui pengajuan Komting baru dan sistem secara atomik membuat penugasan aktif.
- **Prasyarat:** Halaman detail pengajuan Komting terbuka pada status `PENDING_VERIFICATION`. Kelas belum memiliki Komting aktif.
- **Langkah Pengujian:**
  1. Pada halaman detail `/admin/applications/:id`, klik tombol **"Setujui Pengajuan"**.
  2. Dialog modal konfirmasi persetujuan muncul.
  3. Masukkan catatan admin (opsional): `"Dokumen KTM valid dan terverifikasi."`.
  4. Klik tombol **"Ya, Setujui Pengajuan"**.
  5. Tunggu proses transaksi selesai.
- **Expected Result:**
  - Dialog modal tertutup dan toast/alert sukses muncul: `"Pengajuan Komting berhasil disetujui."`.
  - Status pengajuan beralih menjadi `APPROVED`.
  - Pada halaman `/admin/assignments`, tercatat penugasan baru untuk mahasiswa tersebut dengan status `ACTIVE`.
  - Event `KOMTING_APPLICATION_APPROVED` tercatat pada tabel `email_outbox`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar status aplikasi `APPROVED` dan dialog sukses persetujuan Komting.

---

### UAT-ADM-05: Penolakan (Rejection) Pengajuan Komting dengan Alasan Wajib
- **Test Case ID:** `UAT-ADM-05`
- **Nama Pengujian:** Penolakan (Rejection) Pengajuan Komting dengan Alasan Wajib
- **Tujuan:** Memverifikasi admin dapat menolak pengajuan Komting dengan mewajibkan pengisian alasan penolakan.
- **Prasyarat:** Terdapat pengajuan Komting berstatus `PENDING_VERIFICATION`.
- **Langkah Pengujian:**
  1. Buka detail pengajuan Komting `/admin/applications/:id`.
  2. Klik tombol **"Tolak Pengajuan"**.
  3. Dialog modal penolakan muncul.
  4. Kosongkan isian alasan penolakan, lalu klik **"Konfirmasi Penolakan"**. Amati reaksi validasi.
  5. Isi alasan penolakan: `"Foto KTM buram dan tidak terbaca, silakan ajukan ulang."`.
  6. Klik tombol **"Konfirmasi Penolakan"**.
- **Expected Result:**
  - Saat alasan kosong, tombol submit dicegah dan sistem menampilkan pesan validasi: `"Alasan penolakan wajib diisi"`.
  - Setelah alasan diisi dan dikirim, status aplikasi berubah menjadi `REJECTED`.
  - Status akun user terkait beralih menjadi `REJECTED`.
  - Tindakan penolakan tercatat di `audit_logs` dan outbox email.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar modal penolakan dengan isian alasan dan status pengajuan menjadi `REJECTED`.

---

### UAT-ADM-06: Approval Pengajuan Pergantian Komting (Replacement Workflow)
- **Test Case ID:** `UAT-ADM-06`
- **Nama Pengujian:** Approval Pengajuan Pergantian Komting (Replacement Workflow)
- **Tujuan:** Memverifikasi pergantian Komting aktif berjalan atomik: Komting lama dinonaktifkan dan Komting baru diaktifkan tanpa jeda inkonsistensi.
- **Prasyarat:** Kelas target (misal `IF-TEST-01`) telah memiliki Komting aktif, dan terdapat pendaftar baru dari kelas tersebut berstatus `PENDING_REVIEW` (kategori `REPLACEMENT`).
- **Langkah Pengujian:**
  1. Buka detail pengajuan pergantian Komting di `/admin/applications/:id`.
  2. Verifikasi peringatan sistem: `"Pengajuan ini merupakan pergantian komting untuk kelas yang sudah memiliki penugasan aktif."`.
  3. Klik tombol **"Setujui Pergantian Komting"**.
  4. Masukkan catatan admin konfirmasi, lalu klik **"Ya, Proses Pergantian"**.
- **Expected Result:**
  - Sistem mengeksekusi RPC `rpc_admin_approve_komting_replacement`.
  - Komting baru mendapatkan status penugasan `ACTIVE`.
  - Penugasan Komting lama untuk kelas tersebut secara atomik berubah status menjadi `REPLACED` atau `INACTIVE`.
  - Tidak pernah ada dua penugasan Komting berstatus `ACTIVE` untuk kelas yang sama.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar penugasan kelas yang menunjukkan status pergantian komting berhasil.

---

### UAT-ADM-07: Penonaktifan Penugasan Komting Aktif (Deactivation)
- **Test Case ID:** `UAT-ADM-07`
- **Nama Pengujian:** Penonaktifan Penugasan Komting Aktif (Deactivation)
- **Tujuan:** Memastikan admin dapat menonaktifkan komting yang melanggar aturan atau telah selesai masa jabatannya.
- **Prasyarat:** Terdapat Komting aktif pada `/admin/assignments`.
- **Langkah Pengujian:**
  1. Buka halaman `/admin/assignments`.
  2. Cari Komting yang ingin dinonaktifkan, lalu klik tombol **"Nonaktifkan Penugasan"**.
  3. Masukkan alasan penonaktifan: `"Selesai masa jabatan semester ganjil."`.
  4. Klik tombol konfirmasi penonaktifan.
- **Expected Result:**
  - Status penugasan Komting berubah menjadi `INACTIVE`.
  - Booking mendatang milik Komting tersebut yang belum diambil (status `CONFIRMED`) otomatis dibatalkan sistem.
  - Pinjaman berjalan (status `ACTIVE`) tidak dibatalkan melainkan tetap wajib diselesaikan via return.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar status penugasan Komting yang berubah menjadi `INACTIVE`.

---

### UAT-ADM-08: Inventaris Proyektor — Penambahan Unit Baru
- **Test Case ID:** `UAT-ADM-08`
- **Nama Pengujian:** Inventaris Proyektor — Penambahan Unit Baru
- **Tujuan:** Memverifikasi admin dapat mendaftarkan aset proyektor baru ke dalam inventaris kampus.
- **Prasyarat:** Login sebagai ADMIN.
- **Langkah Pengujian:**
  1. Buka halaman `/admin/projectors`.
  2. Klik tombol **"Tambah Proyektor Baru"**.
  3. Isi formulir modal:
     - Kode Aset: `PRJ-UAT-999`
     - Nama Proyektor: `Epson EB-X500 UAT Test`
     - Status Fisik Awal: `AVAILABLE`
     - Kondisi / Catatan: `Unit baru pengadaan laboratorium 2026`
  4. Klik tombol **"Simpan Unit Proyektor"**.
- **Expected Result:**
  - Proyektor baru berhasil tersimpan di database.
  - Daftar inventaris memuat baris proyektor `PRJ-UAT-999` dengan badge `AVAILABLE` dan status `Aktif`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar formulir tambah unit dan daftar inventaris dengan unit baru.

---

### UAT-ADM-09: Inventaris Proyektor — Pembaruan Data Unit & Spesifikasi
- **Test Case ID:** `UAT-ADM-09`
- **Nama Pengujian:** Inventaris Proyektor — Pembaruan Data Unit & Spesifikasi
- **Tujuan:** Memverifikasi admin dapat memperbarui informasi nama atau spesifikasi aset proyektor.
- **Prasyarat:** Proyektor `PRJ-UAT-999` tersedia di `/admin/projectors`.
- **Langkah Pengujian:**
  1. Pada baris proyektor `PRJ-UAT-999`, klik tombol **"Edit"**.
  2. Ubah nama proyektor menjadi: `Epson EB-X500 UAT Updated`.
  3. Tambahkan catatan spesifikasi: `HDMI + VGA Cable included`.
  4. Klik **"Simpan Perubahan"**.
- **Expected Result:**
  - Notifikasi sukses muncul: `"Data proyektor berhasil diperbarui."`.
  - Nama unit pada tabel inventaris terbarui secara instan.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar detail proyektor yang telah diperbarui.

---

### UAT-ADM-10: Inventaris Proyektor — Deaktivasi Unit Proyektor
- **Test Case ID:** `UAT-ADM-10`
- **Nama Pengujian:** Inventaris Proyektor — Deaktivasi Unit Proyektor
- **Tujuan:** Memastikan admin dapat menonaktifkan unit proyektor sehingga tidak dapat dipilih untuk booking baru.
- **Prasyarat:** Proyektor `PRJ-UAT-999` berstatus aktif.
- **Langkah Pengujian:**
  1. Pada halaman `/admin/projectors`, cari unit `PRJ-UAT-999`.
  2. Klik tombol aksi **"Nonaktifkan Unit"**.
  3. Konfirmasikan dialog penonaktifan.
- **Expected Result:**
  - Status unit beralih menjadi `is_active: false`.
  - Unit tidak lagi muncul pada kalender ketersediaan booking mahasiswa (`/komting/projectors`).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar tabel inventaris dengan badge status unit `Nonaktif`.

---

### UAT-ADM-11: Pengaturan Jam Operasional & Penyesuaian Buka/Tutup
- **Test Case ID:** `UAT-ADM-11`
- **Nama Pengujian:** Pengaturan Jam Operasional & Penyesuaian Buka/Tutup
- **Tujuan:** Memverifikasi admin dapat mengonfigurasi jam operasional layanan kampus dan menetapkan hari libur.
- **Prasyarat:** Buka halaman `/admin/operating-hours`.
- **Langkah Pengujian:**
  1. Periksa jadwal jam operasional harian (Default: 08:00 s/d 16:30 WIB).
  2. Pilih tanggal esok hari, klik tombol **"Ubah Jam Layanan"**.
  3. Ubah jam buka menjadi `07:30` dan jam tutup menjadi `17:00`.
  4. Berikan catatan alasan: `"Layanan dibuka lebih awal untuk ujian semester."`.
  5. Klik tombol **"Simpan Konfigurasi Jam"**.
- **Expected Result:**
  - Konfigurasi tanggal tersebut berhasil tersimpan sebagai snapshot per tanggal.
  - Waktu pengambilan (*pickup window*) paling awal otomatis menyesuaikan aturan pembukaan khusus.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar form jam operasional dan riwayat konfigurasi per tanggal.

---

### UAT-ADM-12: Manajemen Akun Petugas Staff
- **Test Case ID:** `UAT-ADM-12`
- **Nama Pengujian:** Manajemen Akun Petugas Staff
- **Tujuan:** Memverifikasi admin dapat mengelola daftar akun petugas STAFF operasional loket.
- **Prasyarat:** Buka halaman `/admin/staff`.
- **Langkah Pengujian:**
  1. Periksa daftar akun STAFF yang terdaftar di sistem.
  2. Verifikasi bahwa kolom nama, email, status akun (`ACTIVE`/`INACTIVE`), dan tanggal pembuatan ditampilkan.
  3. Coba lakukan pengubahan status salah satu akun staff (jika fitur aktif).
- **Expected Result:**
  - Daftar petugas staff ditampilkan lengkap tanpa kebocoran data sensitif (*password hash*).
  - Admin memiliki kendali penuh atas akun staf loket.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman manajemen staf `/admin/staff`.

---

### UAT-ADM-13: Pemantauan & Filter Log Audit Sistem (Append-Only)
- **Test Case ID:** `UAT-ADM-13`
- **Nama Pengujian:** Pemantauan & Filter Log Audit Sistem (Append-Only)
- **Tujuan:** Memverifikasi seluruh rekaman aktivitas sensitif tercatat secara *append-only* dan dapat difilter oleh admin.
- **Prasyarat:** Buka halaman `/admin/audit-logs`.
- **Langkah Pengujian:**
  1. Buka halaman log audit `/admin/audit-logs`.
  2. Periksa daftar log audit yang memuat: Waktu Kejadian, Pelaku (Actor), Tipe Entitas, dan Aksi.
  3. Terapkan filter berdasarkan Aksi: `LOAN_RETURN_CONFIRMED`.
  4. Amati hasil pemfilteran data.
- **Expected Result:**
  - Log audit menampilkan mutasi sistem secara kronologis terbalik (terbaru di atas).
  - Filter aksi menyaring tabel dengan presisi.
  - Tidak ada tombol "Edit" atau "Hapus" pada log audit (menjaga integritas *append-only*).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar tabel audit log dengan filter aksi aktif.

---

### UAT-ADM-14: Detail Rekaman Log Audit Transaksional
- **Test Case ID:** `UAT-ADM-14`
- **Nama Pengujian:** Detail Rekaman Log Audit Transaksional
- **Tujuan:** Memverifikasi admin dapat melihat rincian perubahan data (*before & after payload*) pada entitas log audit.
- **Prasyarat:** Terdapat rekaman log audit pada `/admin/audit-logs`.
- **Langkah Pengujian:**
  1. Klik salah satu baris log audit untuk membuka `/admin/audit-logs/:id`.
  2. Periksa detail rekaman: ID Request, ID Pengguna Pelaku, Alamat IP / User Agent, dan JSON Payload Perubahan.
- **Expected Result:**
  - Halaman menampilkan rincian struktural JSON perubahan data dengan format yang mudah dibaca.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman detail log audit transaksional.

---

### UAT-ADM-15: Akses Halaman Koreksi Transaksi (Status Kontrak §13.3)
- **Test Case ID:** `UAT-ADM-15`
- **Nama Pengujian:** Akses Halaman Koreksi Transaksi (Status Kontrak §13.3)
- **Tujuan:** Memverifikasi halaman koreksi transaksi menampilkan status placeholder yang sesuai dengan kesepakatan kontrak.
- **Prasyarat:** Login sebagai ADMIN.
- **Langkah Pengujian:**
  1. Akses rute `/admin/corrections`.
  2. Periksa pesan peringatan dan kartu informasi yang ditampilkan.
- **Expected Result:**
  - Halaman merender header *"Koreksi Transaksi (Menunggu Finalisasi Kontrak)"*.
  - Menampilkan Alert informatif bahwa kontrak API §13.3 dan Open Decision §20 masih menunggu penetapan daftar field resmi yang boleh dikoreksi.
  - Terdapat tombol navigasi kembali ke Dashboard Admin.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman `/admin/corrections` dengan alert status kontrak.

---

## Bagian 2: Skenario UAT Role STAFF

### UAT-STF-01: Login Staff & Verifikasi Dashboard Layanan Operasional
- **Test Case ID:** `UAT-STF-01`
- **Nama Pengujian:** Login Staff & Verifikasi Dashboard Layanan Operasional
- **Tujuan:** Memastikan petugas loket (STAFF) dapat login dan melihat antarmuka operasional loket proyektor.
- **Prasyarat:** Akun Staff `conc-staff@example.test` aktif di database.
- **Langkah Pengujian:**
  1. Buka peramban di `http://localhost:3000/login`.
  2. Masukkan email: `conc-staff@example.test`.
  3. Masukkan password: `TestPassword123!`.
  4. Klik tombol **"Masuk ke Sistem"**.
- **Expected Result:**
  - Pengguna diarahkan ke `/staff`.
  - Header navigasi menampilkan badge peran **STAFF**.
  - Dashboard menyajikan ringkasan antrean pickup hari ini, pinjaman aktif, proyektor jatuh tempo, dan tombol pintas ke scanner QR.
- **Actual Result:** Login berhasil dan dialihkan ke `/staff`. Dashboard operasional berhasil memuat seluruh data agregasi secara live tanpa error (DEF-004 teratasi). Kartu ringkasan menampilkan: Booking Hari Ini (8), Menunggu Pickup (2), Loan Aktif (28), Melewati Estimasi (4), Unit Maintenance (3), daftar kartu pemesanan siap pickup, kartu pinjaman aktif, serta tombol aksi cepat "Scan QR Pickup / Return".
- **Status:** `PASS`
- **Bukti Screenshot:** Tangkapan layar dashboard operasional staff `/staff` (`uat-stf-04-staff-dashboard.png`).

---

### UAT-STF-02: Pemantauan Antrean Booking Siap Pickup Hari Ini
- **Test Case ID:** `UAT-STF-02`
- **Nama Pengujian:** Pemantauan Antrean Booking Siap Pickup Hari Ini
- **Tujuan:** Memverifikasi staff dapat memantau daftar pemesanan proyektor yang dijadwalkan diambil hari ini.
- **Prasyarat:** Terdapat booking berstatus `CONFIRMED` untuk hari ini.
- **Langkah Pengujian:**
  1. Akses menu **"Antrean Booking"** (`/staff/bookings`).
  2. Periksa daftar kartu booking: Kode Booking, Nama Komting, Nama Kelas, Unit Proyektor, Jam Booking, dan Status Window Pickup.
- **Expected Result:**
  - Daftar menampilkan transaksi booking hari ini secara teratur.
  - Booking yang berada di dalam jendela waktu pengambilan menampilkan indikator siap serah-terima.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman antrean booking staf `/staff/bookings`.

---

### UAT-STF-03: Validasi Scan Tiket QR untuk Pickup Proyektor
- **Test Case ID:** `UAT-STF-03`
- **Nama Pengujian:** Validasi Scan Tiket QR untuk Pickup Proyektor
- **Tujuan:** Memverifikasi antarmuka scanner staff memvalidasi token QR opaque dan mengonfirmasi keabsahan transaksi booking.
- **Prasyarat:** Terdapat tiket QR pickup aktif dari booking yang valid.
- **Langkah Pengujian:**
  1. Akses halaman scanner `/staff/scan`.
  2. Masukkan payload QR token atau simulasikan pemindaian kamera.
  3. Pilih jenis aksi: **"Pengambilan (PICKUP)"**.
  4. Klik tombol **"Validasi QR Tiket"**.
- **Expected Result:**
  - Server merespons bahwa token valid (`valid: true`).
  - Sistem menampilkan kartu informasi konfirmasi serah-terima: Kode Booking, Nama Proyektor yang dialokasikan, Nama Peminjam, dan Nama Kelas.
- **Actual Result:** Komponen pemindai scanner QR dan form token manual beroperasi normal pada live PINJAM_TESTING. Lifecycle MediaStream terpasang mulus ke video preview tanpa layar hitam saat diaktifkan, dan tombol berganti ke 'Matikan Kamera'. Error handling kamera adaptif dan fallback token manual beroperasi sesuai ekspektasi.
- **Status:** `PASS`
- **Bukti Screenshot:** `uat-stf-05a-scan-view.png`

---

### UAT-STF-04: Konfirmasi Serah-Terima (Pickup Handover) Unit ke Komting
- **Test Case ID:** `UAT-STF-04`
- **Nama Pengujian:** Konfirmasi Serah-Terima (Pickup Handover) Unit ke Komting
- **Tujuan:** Memverifikasi konfirmasi serah-terima fisik unit proyektor mengubah status booking menjadi FULFILLED dan membuat pinjaman aktif secara atomik.
- **Prasyarat:** Token QR pickup telah tervalidasi pada `UAT-STF-03`.
- **Langkah Pengujian:**
  1. Pada form konfirmasi serah-terima, pilih opsi penerima: **"KOMTING Langsung"** (`received_by: KOMTING`).
  2. Tambahkan catatan petugas: `"Unit diserahkan dalam tas lengkap."`.
  3. Klik tombol **"Konfirmasi Serah-Terima Unit"**.
- **Expected Result:**
  - Sistem mengeksekusi RPC `rpc_staff_confirm_pickup`.
  - Notifikasi sukses muncul: `"Serah-terima berhasil, pinjaman telah aktif."`.
  - Booking beralih ke status `FULFILLED`.
  - Transaksi pinjaman baru (`loans`) terbentuk dengan status `ACTIVE`.
  - Status fisik unit proyektor di database berubah menjadi `BORROWED`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar konfirmasi pickup sukses dan pembaruan status pinjaman.

---

### UAT-STF-05: Konfirmasi Pickup yang Diwakilkan (Representative)
- **Test Case ID:** `UAT-STF-05`
- **Nama Pengujian:** Konfirmasi Pickup yang Diwakilkan (Representative)
- **Tujuan:** Memverifikasi serah-terima proyektor dapat diambil oleh perwakilan kelas dengan mencatat nama perwakilan secara wajib.
- **Prasyarat:** Terdapat booking valid yang siap diambil.
- **Langkah Pengujian:**
  1. Buka form konfirmasi pickup booking.
  2. Pilih opsi penerima: **"Diwakilkan Teman Kelas"** (`received_by: REPRESENTATIVE`).
  3. Kosongkan input nama perwakilan, lalu coba klik tombol konfirmasi. Amati reaksi validasi.
  4. Masukkan nama perwakilan: `"Ahmad Dahlan (Anggota Kelas IF-3A)"`.
  5. Klik tombol **"Konfirmasi Serah-Terima Unit"**.
- **Expected Result:**
  - Saat nama perwakilan kosong, sistem memblokir submit dengan validasi: `"Nama perwakilan wajib diisi jika pickup diwakilkan"`.
  - Setelah nama diisi, serah-terima berhasil dan nama perwakilan tercatat pada audit log pinjaman.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar validasi form perwakilan dan konfirmasi serah-terima.

---

### UAT-STF-06: Pemantauan Daftar Pinjaman Berjalan & Status Overdue
- **Test Case ID:** `UAT-STF-06`
- **Nama Pengujian:** Pemantauan Daftar Pinjaman Berjalan & Status Overdue
- **Tujuan:** Memverifikasi staff dapat memantau seluruh transaksi peminjaman aktif dan mendeteksi keterlambatan.
- **Prasyarat:** Buka menu **"Peminjaman Berjalan"** (`/staff/loans`).
- **Langkah Pengujian:**
  1. Akses halaman `/staff/loans`.
  2. Periksa daftar pinjaman aktif.
  3. Periksa badge status: unit yang belum melewati estimasi bertanda `ACTIVE`, unit yang melewati estimasi bertanda indikator `TERLAMBAT / OVERDUE`.
- **Expected Result:**
  - Daftar pinjaman menyajikan data unit, peminjam, jam pinjam, dan estimasi kembali.
  - Keterlambatan tidak mengubah status fisik di database melainkan ditampilkan sebagai indikator visual peringatan.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar tabel pinjaman aktif staf `/staff/loans`.

---

### UAT-STF-07: Validasi Scan Tiket QR untuk Pengembalian (Return)
- **Test Case ID:** `UAT-STF-07`
- **Nama Pengujian:** Validasi Scan Tiket QR untuk Pengembalian (Return)
- **Tujuan:** Memverifikasi token QR return divalidasi keabsahannya oleh staff sebelum pemeriksaan fisik dimulai.
- **Prasyarat:** Terdapat pinjaman aktif (`status: ACTIVE`) dengan tiket QR return.
- **Langkah Pengujian:**
  1. Buka halaman scanner `/staff/scan`.
  2. Masukkan payload QR token return Komting.
  3. Pilih jenis aksi: **"Pengembalian (RETURN)"**.
  4. Klik tombol **"Validasi QR Tiket"**.
- **Expected Result:**
  - Sistem mengonfirmasi token valid untuk aksi `RETURN`.
  - Pengguna otomatis diarahkan ke formulir inspeksi fisik `/staff/loans/:id/return`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar validasi QR return berhasil dan pengalihan ke form inspeksi.

---

### UAT-STF-08: Inspeksi Fisik Normal & Konfirmasi Pengembalian Lengkap
- **Test Case ID:** `UAT-STF-08`
- **Nama Pengujian:** Inspeksi Fisik Normal & Konfirmasi Pengembalian Lengkap
- **Tujuan:** Memverifikasi pengembalian unit proyektor dalam kondisi normal dan lengkap menyelesaikan pinjaman secara atomik.
- **Prasyarat:** Formulir inspeksi pengembalian `/staff/loans/:id/return` terbuka.
- **Langkah Pengujian:**
  1. Pilih opsi kondisi proyektor: **"NORMAL (Berfungsi Baik)"**.
  2. Pilih kelengkapan aksesoris: **"LENGKAP (Kabel Daya, HDMI, Remote, Tas)"**.
  3. Tulis catatan inspeksi: `"Pemeriksaan fisik proyektor mulus, lensa jernih, kelengkapan utuh."`.
  4. Verifikasi pilihan disposisi unit: **"AVAILABLE (Siap Dipinjamkan Lagi)"**.
  5. Klik tombol **"Konfirmasi Pengembalian Selesai"**.
- **Expected Result:**
  - Pinjaman beralih status menjadi `RETURNED`.
  - Status fisik unit proyektor di database kembali menjadi `AVAILABLE`.
  - Rekaman inspeksi pengembalian tersimpan di tabel `return_inspections`.
  - Proyektor dapat langsung dialokasikan untuk pemesanan berikutnya tanpa jeda.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar konfirmasi pengembalian sukses dan status proyektor `AVAILABLE`.

---

### UAT-STF-09: Inspeksi Unit Rusak / Komponen Hilang dengan Foto Bukti & Denda
- **Test Case ID:** `UAT-STF-09`
- **Nama Pengujian:** Inspeksi Unit Rusak / Komponen Hilang dengan Foto Bukti & Denda
- **Tujuan:** Memverifikasi penanganan unit yang dikembalikan rusak atau komponen hilang, termasuk kewajiban unggah foto bukti dan penetapan denda.
- **Prasyarat:** Formulir pengembalian terbuka untuk pinjaman aktif.
- **Langkah Pengujian:**
  1. Pilih kondisi proyektor: **"DAMAGED (Rusak / Kendala Fisik)"**.
  2. Pilih kelengkapan aksesoris: **"INCOMPLETE (Kabel HDMI Hilang)"**.
  3. Coba lakukan submit tanpa melampirkan foto bukti. Amati reaksi validasi sistem.
  4. Unggah foto bukti kerusakan/kehilangan (file PNG/JPEG).
  5. Masukkan estimasi nominal denda penggantian: `Rp 150.000`.
  6. Masukkan rincian catatan denda: `"Kabel HDMI original hilang saat kegiatan kelas."`.
  7. Klik tombol **"Konfirmasi Pengembalian Selesai"**.
- **Expected Result:**
  - Submit dicegah saat foto bukti belum diunggah (*photo mandatory rule*).
  - Setelah berkas foto diunggah, transaksi pengembalian berhasil diproses.
  - Record denda tercatat di tabel `loan_fines`.
  - Berkas foto tersimpan secara privat di bucket `evidence-photos`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar form inspeksi dengan foto bukti dan kartu penetapan denda.

---

### UAT-STF-10: Disposisi Fisik Proyektor Rusak ke Status MAINTENANCE
- **Test Case ID:** `UAT-STF-10`
- **Nama Pengujian:** Disposisi Fisik Proyektor Rusak ke Status MAINTENANCE
- **Tujuan:** Memastikan unit yang dilaporkan rusak tidak kembali ke peredaran peminjaman melainkan dialihkan ke pemeliharaan.
- **Prasyarat:** Eksekusi `UAT-STF-09` selesai dengan kondisi unit rusak.
- **Langkah Pengujian:**
  1. Periksa status unit proyektor di database dan di halaman inventaris `/staff/maintenance`.
  2. Coba cari unit tersebut di kalender booking mahasiswa.
- **Expected Result:**
  - Status fisik proyektor beralih menjadi `MAINTENANCE`.
  - Unit tidak dapat dipilih atau dipesan oleh mahasiswa manapun.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar tabel unit pemeliharaan dengan status `MAINTENANCE`.

---

### UAT-STF-11: Pemantauan Unit Proyektor dalam Pemeliharaan
- **Test Case ID:** `UAT-STF-11`
- **Nama Pengujian:** Pemantauan Unit Proyektor dalam Pemeliharaan
- **Tujuan:** Memverifikasi staff dapat memantau seluruh aset proyektor yang sedang dalam proses perbaikan teknis.
- **Prasyarat:** Terdapat minimal 1 proyektor berstatus `MAINTENANCE`.
- **Langkah Pengujian:**
  1. Buka menu **"Pemeliharaan"** (`/staff/maintenance`).
  2. Periksa daftar proyektor dalam perbaikan: Kode Aset, Gejala Kerusakan, Tanggal Masuk, dan Petugas Pencatat.
- **Expected Result:**
  - Daftar unit pemeliharaan disajikan secara informatif dengan filter status.
- **Actual Result:** Halaman pemeliharaan /staff/maintenance berhasil memuat daftar catatan maintenance live tanpa UNKNOWN_ERROR. 3 unit dengan status IN_PROGRESS ditampilkan lengkap (BE5-MAFPKE-DAMAGE, BE5-HOJLY9-DAMAGE, BE5-AB3VQI-DAMAGE) beserta katalog proyektor.
- **Status:** `PASS`
- **Bukti Screenshot:** `uat-stf-05b-maintenance-view.png`

---

### UAT-STF-12: Penolakan Akses Fitur Khusus Admin (Staff Guard Check)
- **Test Case ID:** `UAT-STF-12`
- **Nama Pengujian:** Penolakan Akses Fitur Khusus Admin (Staff Guard Check)
- **Tujuan:** Memverifikasi batasan kewenangan bahwa role STAFF tidak diizinkan membuka halaman administratif Admin.
- **Prasyarat:** Login sebagai STAFF.
- **Langkah Pengujian:**
  1. Secara manual pada kolom URL browser, ketik `http://localhost:3000/admin`.
  2. Coba akses `http://localhost:3000/admin/staff`.
  3. Coba akses `http://localhost:3000/admin/operating-hours`.
- **Expected Result:**
  - Setiap percobaan akses dicegat oleh guard otorisasi.
  - Pengguna otomatis dialihkan ke halaman `/forbidden` dengan pesan: *"Akses Ditolak — Anda tidak memiliki izin untuk mengakses halaman ini"*.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman `/forbidden` saat staff mencoba mengakses area Admin.

---

## Bagian 3: Skenario UAT Role KOMTING

### UAT-KMT-01: Registrasi Calon Komting dengan Unggah Foto Identitas (KTM)
- **Test Case ID:** `UAT-KMT-01`
- **Nama Pengujian:** Registrasi Calon Komting dengan Unggah Foto Identitas (KTM)
- **Tujuan:** Memverifikasi mahasiswa dapat mendaftarkan diri sebagai Komting kelas baru dengan melampirkan berkas identitas resmi.
- **Prasyarat:** Belum terdaftar atau menggunakan akun pendaftar baru.
- **Langkah Pengujian:**
  1. Buka peramban di `http://localhost:3000/register`.
  2. Isi formulir pendaftaran calon Komting:
     - Nama Lengkap: `Rizky Ramadhan`
     - NIM: `2301092045`
     - Kelas: `IF-UAT-01`
     - Email: `calon-komting@example.test`
     - Password: `TestPassword123!`
  3. Unggah berkas dokumen identitas/KTM (format file PNG/JPEG ukuran < 2MB).
  4. Klik tombol **"Kirim Pengajuan Komting"**.
- **Expected Result:**
  - Pengajuan berhasil terkirim dan sistem mengembalikan HTTP 201 dengan `application_id`.
  - Berkas KTM terunggah aman ke storage private.
  - Pengguna diarahkan ke halaman konfirmasi pendaftaran `/application/status`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar form pendaftaran terisi dan halaman sukses pengajuan.

---

### UAT-KMT-02: Validasi Input Formulir Pendaftaran Komting
- **Test Case ID:** `UAT-KMT-02`
- **Nama Pengujian:** Validasi Input Formulir Pendaftaran Komting
- **Tujuan:** Memverifikasi ketatnya validasi input pada form pendaftaran (NIM numerik, format email, ukuran berkas).
- **Prasyarat:** Buka formulir registrasi di `/register`.
- **Langkah Pengujian:**
  1. Masukkan format email yang salah: `bukanemail`.
  2. Kosongkan input NIM dan Nama Kelas.
  3. Unggah file dokumen berformat tidak didukung (misal file `.exe` atau `.txt`).
  4. Klik tombol kirim pendaftaran.
- **Expected Result:**
  - Submit dicegat di sisi klien (*client-side validation*).
  - Pesan error spesifik muncul di bawah masing-masing input yang tidak valid.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar formulir registrasi yang menampilkan pesan error validasi input.

---

### UAT-KMT-03: Pengecekan Status Pengajuan Pendaftaran Komting
- **Test Case ID:** `UAT-KMT-03`
- **Nama Pengujian:** Pengecekan Status Pengajuan Pendaftaran Komting
- **Tujuan:** Memverifikasi calon komting dapat memantau status persetujuan berkasnya secara transparan.
- **Prasyarat:** Pendaftar telah submit pengajuan pada `UAT-KMT-01`.
- **Langkah Pengujian:**
  1. Akses halaman `/komting/application-status` atau `/application/status`.
  2. Periksa kartu status pendaftaran.
- **Expected Result:**
  - Halaman menampilkan kartu status: `MENUNGGU VERIFIKASI ADMIN` (*Pending Review*).
  - Terdapat ringkasan data yang diajukan serta panduan estimasi waktu verifikasi oleh bagian akademik.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman pemantauan status pengajuan Komting.

---

### UAT-KMT-04: Login Komting Aktif & Dashboard Mahasiswa
- **Test Case ID:** `UAT-KMT-04`
- **Nama Pengujian:** Login Komting Aktif & Dashboard Mahasiswa
- **Tujuan:** Memastikan Komting yang telah disetujui admin dapat masuk dan melihat dashboard kelasnya.
- **Prasyarat:** Akun Komting aktif `conc-komting2@example.test` terdaftar.
- **Langkah Pengujian:**
  1. Akses `http://localhost:3000/login`.
  2. Masukkan email: `conc-komting2@example.test`.
  3. Masukkan password: `KomtingPinjam2026!`.
  4. Klik tombol **"Masuk"**.
- **Expected Result:**
  - Pengguna dialihkan ke `/komting`.
  - Header navigasi memuat badge **KOMTING** dan penugasan kelas aktif (misal `IF-TEST-02`).
  - Dashboard menyajikan ringkasan identitas kelas, booking aktif, loan aktif, inventaris unit proyektor terkait, serta banner reminder yang informatif.
- **Actual Result:** Login berhasil dan dialihkan ke `/komting`. Dashboard berhasil memuat seluruh data secara live tanpa error (`UNKNOWN_ERROR` telah teratasi). Kartu Identitas & Penugasan menampilkan kelas `IF-TEST-02` (Status: AKTIF), kartu Booking Aktif menampilkan reservasi `BKG-CONC-2` (Status: TERKONFIRMASI), status loan aktif teridentifikasi kosong ("Belum Ada Peminjaman Aktif"), serta banner pengingat pengambilan proyektor tampil dengan jelas.
- **Status:** `PASS`
- **Bukti Screenshot:** `uat-kmt-04-dashboard.png` (Tersimpan di direktori artefak UAT).

---

### UAT-KMT-05: Eksplorasi Inventaris & Kalender Ketersediaan Proyektor
- **Test Case ID:** `UAT-KMT-05`
- **Nama Pengujian:** Eksplorasi Inventaris & Kalender Ketersediaan Proyektor
- **Tujuan:** Memverifikasi Komting dapat melihat daftar unit proyektor dan mengecek ketersediaan jam secara real-time.
- **Prasyarat:** Login sebagai Komting aktif.
- **Langkah Pengujian:**
  1. Buka menu **"Inventaris & Jadwal"** (`/komting/projectors`).
  2. Periksa kartu-kartu proyektor: Nama Unit, Merk, Status Fisik (`AVAILABLE`, `BORROWED`, `MAINTENANCE`), dan tombol aksi booking.
  3. Pilih tanggal: Hari Ini atau Besok.
- **Expected Result:**
  - Hanya unit proyektor aktif yang ditampilkan.
  - Unit `MAINTENANCE` bertanda khusus dan tidak dapat diklik untuk pemesanan.
  - Kalender ketersediaan menampilkan slot jam yang masih kosong secara transparan.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar katalog proyektor komting `/komting/projectors`.

---

### UAT-KMT-06: Pengecekan Jam Layanan & Hari Libur Kampus
- **Test Case ID:** `UAT-KMT-06`
- **Nama Pengujian:** Pengecekan Jam Layanan & Hari Libur Kampus
- **Tujuan:** Memastikan Komting mendapatkan informasi akurat mengenai batas jam buka loket dan jadwal libur.
- **Prasyarat:** Buka formulir pemesanan baru `/komting/bookings/new`.
- **Langkah Pengujian:**
  1. Periksa alert panduan jam operasional pada bagian atas formulir.
  2. Verifikasi jam buka standar (08:00) dan jam tutup standar (16:30).
- **Expected Result:**
  - Sistem menampilkan batas jam operasional hari terpilih dengan jelas dalam zona waktu `Asia/Jakarta (WIB)`.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar alert informasi jam layanan pada form booking.

---

### UAT-KMT-07: Pembuatan Booking Proyektor untuk Hari Ini / Besok
- **Test Case ID:** `UAT-KMT-07`
- **Nama Pengujian:** Pembuatan Booking Proyektor untuk Hari Ini / Besok
- **Tujuan:** Memverifikasi Komting berhasil memesan proyektor untuk jadwal perkuliahan hari ini atau besok.
- **Prasyarat:** Komting aktif tidak memiliki booking/pinjaman aktif berjalan.
- **Langkah Pengujian:**
  1. Akses halaman `/komting/bookings/new`.
  2. Pilih unit proyektor yang berstatus `AVAILABLE`.
  3. Pilih tanggal booking: Besok hari.
  4. Tentukan jam mulai booking (misal `10:00`).
  5. Tentukan estimasi pengembalian (misal `12:00` pada tanggal yang sama).
  6. Masukkan keperluan: `"Presentasi Tugas Akhir Mata Kuliah Metode Numerik"`.
  7. Klik tombol **"Konfirmasi Pemesanan Proyektor"**.
- **Expected Result:**
  - Pemesanan berhasil dibuat dan otomatis terkonfirmasi (`CONFIRMED`).
  - Sistem menghasilkan Kode Booking resmi (contoh `BKG-YYYYMMDD-XXXX`).
  - Pengguna diarahkan ke halaman detail booking `/komting/bookings/:id`.
  - Tiket QR pengambilan langsung tampil dengan masa berlaku jendela pickup.
- **Actual Result:** Pemesanan proyektor untuk besok hari (28 Nov 2026 09:00–11:00 WIB) berhasil dibuat dengan kode resmi `BKG-20261128-3465`, unit `PRJ-CONC-001`, status `CONFIRMED`.
- **Status:** `PASS`
- **Bukti Screenshot:** Tangkapan layar halaman detail booking dengan kode booking dan tiket QR (`uat-kmt-06-qr-booking-detail.png`).

---

### UAT-KMT-08: Penegakan Batasan Aturan: Maksimum 1 Booking Aktif
- **Test Case ID:** `UAT-KMT-08`
- **Nama Pengujian:** Penegakan Batasan Aturan: Maksimum 1 Booking Aktif
- **Tujuan:** Memastikan sistem menolak percobaan pembuatan booking kedua saat Komting masih memiliki 1 booking aktif yang belum selesai.
- **Prasyarat:** Komting telah memiliki 1 booking berstatus `CONFIRMED` pada `UAT-KMT-07`.
- **Langkah Pengujian:**
  1. Coba buka kembali halaman `/komting/bookings/new`.
  2. Pilih unit proyektor lain yang tersedia.
  3. Masukkan jadwal dan klik tombol submit pemesanan.
- **Expected Result:**
  - Sistem menolak transaksi dengan kode error `409 ACTIVE_BOOKING_EXISTS`.
  - Muncul pesan peringatan jelas di layar: *"Anda masih memiliki booking aktif. Selesaikan atau batalkan booking berjalan sebelum membuat pemesanan baru."*.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar penolakan pemesanan ganda `ACTIVE_BOOKING_EXISTS`.

---

### UAT-KMT-09: Penegakan Batasan Aturan: Pencegahan Jadwal Bentrok (Conflict)
- **Test Case ID:** `UAT-KMT-09`
- **Nama Pengujian:** Penegakan Batasan Aturan: Pencegahan Jadwal Bentrok (Conflict)
- **Tujuan:** Memastikan dua kelas berbeda tidak dapat memesan unit proyektor yang sama pada jam yang bertabrakan (*exclusion constraint check*).
- **Prasyarat:** Proyektor A telah dibooking oleh Komting 1 pada rentang jam 10:00 s/d 12:00.
- **Langkah Pengujian:**
  1. Login sebagai Komting 2 (`conc-komting2@example.test`).
  2. Buka form booking baru `/komting/bookings/new`.
  3. Pilih Proyektor A pada tanggal yang sama.
  4. Masukkan jam mulai `11:00` dan jam kembali `13:00` (tumpang tindih 1 jam).
  5. Klik tombol konfirmasi pemesanan.
- **Expected Result:**
  - Transaksi ditolak dengan kode error `409 BOOKING_CONFLICT`.
  - Sistem menampilkan peringatan: *"Jadwal yang dipilih bentrok dengan pemesanan lain pada unit proyektor ini."*.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar alert penolakan bentrok jadwal `BOOKING_CONFLICT`.

---

### UAT-KMT-10: Pembatalan Booking Mandiri Sebelum Diambil
- **Test Case ID:** `UAT-KMT-10`
- **Nama Pengujian:** Pembatalan Booking Mandiri Sebelum Diambil
- **Tujuan:** Memverifikasi Komting dapat membatalkan pemesanan secara mandiri sebelum unit diambil di loket.
- **Prasyarat:** Terdapat booking berstatus `CONFIRMED`.
- **Langkah Pengujian:**
  1. Buka detail booking di `/komting/bookings/:id`.
  2. Klik tombol **"Batalkan Booking"**.
  3. Dialog konfirmasi pembatalan muncul.
  4. Masukkan alasan pembatalan: `"Dosen berhalangan hadir, perkuliahan dialihkan online."`.
  5. Klik tombol **"Ya, Batalkan Pemesanan"**.
- **Expected Result:**
  - Status booking berubah seketika menjadi `CANCELLED`.
  - Tiket QR dinonaktifkan.
  - Unit proyektor seketika kembali tersedia di kalender inventaris untuk dipesan kelas lain.
  - Komting kini bebas membuat booking baru jika diperlukan.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar status booking `CANCELLED` dan dialog konfirmasi pembatalan.

---

### UAT-KMT-11: Penayangan Tiket QR Pickup pada Detail Booking
- **Test Case ID:** `UAT-KMT-11`
- **Nama Pengujian:** Penayangan Tiket QR Pickup pada Detail Booking
- **Tujuan:** Memverifikasi tiket QR pengambilan dirender dengan format visual SVG yang jelas, tidak memuat data pribadi (PII), dan dilengkapi petunjuk loket.
- **Prasyarat:** Booking berstatus `CONFIRMED`.
- **Langkah Pengujian:**
  1. Buka halaman detail booking `/komting/bookings/:id`.
  2. Amati tampilan komponen kartu QR Code.
  3. Periksa informasi petunjuk di bawah QR.
- **Expected Result:**
  - Gambar QR SVG dirender dengan kontras tinggi (mudah dipindai kamera hp/scanner).
  - Token QR merupakan string opaque terenkripsi (`pjmqr_v1_...`), tidak memuat NIM atau nama mahasiswa.
  - Tertulis batas waktu jendela pengambilan (dibuka 30 menit sebelum jadwal, ditutup 15 menit setelah jadwal).
- **Actual Result:** Tiket QR berhasil ditampilkan dalam komponen SVG beresolusi tinggi dengan token opaque `pjmqr_v1_...`, batas waktu pickup valid, dan pembacaan token 100% read-only tanpa mutasi DB (DEF-003 resolved).
- **Status:** `PASS`
- **Bukti Screenshot:** Tangkapan layar kartu QR Pickup beresolusi tinggi pada detail booking (`uat-kmt-06-qr-booking-detail.png`).

---

### UAT-KMT-12: Transisi Tampilan Detail Booking Setelah Pickup (Status FULFILLED)
- **Test Case ID:** `UAT-KMT-12`
- **Nama Pengujian:** Transisi Tampilan Detail Booking Setelah Pickup (Status FULFILLED)
- **Tujuan:** Memastikan setelah serah-terima fisik dilakukan oleh staff, halaman detail booking tidak lagi menampilkan QR pickup melainkan beralih ke status peminjaman berjalan.
- **Prasyarat:** Booking telah dikonfirmasi pickup oleh Staff (status `FULFILLED`).
- **Langkah Pengujian:**
  1. Muat ulang (*refresh*) halaman detail booking `/komting/bookings/:id`.
  2. Periksa konten kartu informasi di layar.
- **Expected Result:**
  - Badge status booking berubah menjadi `FULFILLED (Pickup Selesai)`.
  - Tiket QR pickup otomatis disembunyikan untuk mencegah pemindaian ganda.
  - Ditampilkan kartu informasi: *"Unit Sedang Dalam Peminjaman"* beserta tombol navigasi langsung ke halaman **"Riwayat Peminjaman"** (`/komting/loans`).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar detail booking berstatus FULFILLED dengan tautan ke menu pinjaman.

---

### UAT-KMT-13: Pemantauan Riwayat Peminjaman (Loan History)
- **Test Case ID:** `UAT-KMT-13`
- **Nama Pengujian:** Pemantauan Riwayat Peminjaman (Loan History)
- **Tujuan:** Memverifikasi Komting dapat melihat daftar transaksi peminjaman berjalan maupun peminjaman yang telah selesai di masa lalu.
- **Prasyarat:** Buka menu **"Peminjaman"** (`/komting/loans`).
- **Langkah Pengujian:**
  1. Akses halaman `/komting/loans`.
  2. Periksa kartu peminjaman aktif: Kode Booking, Unit Proyektor, Jam Pengambilan, dan Estimasi Pengembalian.
  3. Ganti filter status peminjaman ke `ALL` atau `COMPLETED`.
- **Expected Result:**
  - Daftar menyajikan seluruh riwayat peminjaman kelas dengan pagination rapi.
  - Peminjaman aktif menampilkan tombol aksi untuk pengembalian unit.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar riwayat peminjaman Komting `/komting/loans`.

---

### UAT-KMT-14: Inisiasi Pengembalian & Penayangan Modal Tiket QR Return
- **Test Case ID:** `UAT-KMT-14`
- **Nama Pengujian:** Inisiasi Pengembalian & Penayangan Modal Tiket QR Return
- **Tujuan:** Memverifikasi Komting dapat membuka tiket QR Return saat berada di meja layanan operasional untuk proses serah-terima kembali unit.
- **Prasyarat:** Terdapat peminjaman berstatus `ACTIVE` di `/komting/loans`.
- **Langkah Pengujian:**
  1. Pada kartu peminjaman aktif, klik tombol **"Ajukan Pengembalian (Tampilkan QR Return)"**.
  2. Modal dialog pop-up muncul di layar.
  3. Amati tampilan tiket QR Return dan rincian instruksi pengembalian.
  4. Klik tombol **"Tutup"** untuk menutup modal.
- **Expected Result:**
  - Modal dialog terbuka dengan judul *"QR Pengembalian Proyektor (Return)"*.
  - Menampilkan QR Code SVG dinamis, detail unit, ID Booking, dan ID Pinjaman.
  - Terdapat instruksi: *"Tunjukkan tiket QR ini kepada petugas di meja layanan saat mengembalikan unit"*.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar modal dialog QR Return aktif pada halaman `/komting/loans`.

---

### UAT-KMT-15: Penegakan Batasan Aturan: Dilarang Booking Saat Memiliki Loan Aktif
- **Test Case ID:** `UAT-KMT-15`
- **Nama Pengujian:** Penegakan Batasan Aturan: Dilarang Booking Saat Memiliki Loan Aktif
- **Tujuan:** Memastikan Komting yang sedang memegang unit proyektor (loan aktif) dicegah membuat pemesanan booking baru.
- **Prasyarat:** Komting memiliki 1 pinjaman berstatus `ACTIVE`.
- **Langkah Pengujian:**
  1. Buka formulir pemesanan baru `/komting/bookings/new`.
  2. Pilih unit dan jadwal, lalu coba klik submit pemesanan proyektor.
- **Expected Result:**
  - Sistem menolak transaksi dengan kode error `409 ACTIVE_LOAN_EXISTS`.
  - Pesan error menegaskan: *"Komting masih memiliki pinjaman aktif yang belum selesai dikembalikan."*.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar alert penolakan booking `ACTIVE_LOAN_EXISTS`.

---

## Bagian 4: Skenario UAT Keamanan & Lintas Peran

### UAT-SEC-01: Penanganan Login Gagal Kredensial Tidak Valid (HTTP 401)
- **Test Case ID:** `UAT-SEC-01`
- **Nama Pengujian:** Penanganan Login Gagal Kredensial Tidak Valid (HTTP 401)
- **Tujuan:** Memverifikasi pesan kesalahan login tidak membocorkan informasi spesifik keberadaan akun demi keamanan sistem.
- **Prasyarat:** Berada di halaman `/login`.
- **Langkah Pengujian:**
  1. Masukkan email sembarang: `akun-palsu@example.test`.
  2. Masukkan password salah: `PasswordSalah123!`.
  3. Klik tombol **"Masuk ke Sistem"**.
- **Expected Result:**
  - Pengguna tetap berada di halaman `/login`.
  - Muncul alert kesalahan dengan nada bahaya (*danger tone*): *"Email atau kata sandi tidak valid"*.
  - Sesi tidak terbentuk.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar alert error login gagal pada form login.

---

### UAT-SEC-02: Penolakan Login Pengguna Berstatus INACTIVE atau REJECTED
- **Test Case ID:** `UAT-SEC-02`
- **Nama Pengujian:** Penolakan Login Pengguna Berstatus INACTIVE atau REJECTED
- **Tujuan:** Memastikan pengguna yang akunnya telah dinonaktifkan atau ditolak admin tidak dapat login ke aplikasi.
- **Prasyarat:** Akun `e2e-inactive@example.test` berstatus `INACTIVE`.
- **Langkah Pengujian:**
  1. Pada form login, masukkan email `e2e-inactive@example.test`.
  2. Masukkan password yang benar: `TestPassword123!`.
  3. Klik tombol **"Masuk ke Sistem"**.
- **Expected Result:**
  - Autentikasi ditolak dengan kode `403 ACCOUNT_INACTIVE`.
  - Muncul pesan error informatif: *"Akun Anda sedang nonaktif atau ditangguhkan. Silakan hubungi administrator."*.
  - Tidak ada akses ke dashboard manapun.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar penolakan login akun nonaktif.

---

### UAT-SEC-03: Pengalihan Akses Tanpa Autentikasi ke Halaman Login
- **Test Case ID:** `UAT-SEC-03`
- **Nama Pengujian:** Pengalihan Akses Tanpa Autentikasi ke Halaman Login
- **Tujuan:** Memverifikasi seluruh rute internal terproteksi mengalihkan pengunjung anonim ke halaman login.
- **Prasyarat:** Browser dalam kondisi belum login (*incognito window* atau telah logout).
- **Langkah Pengujian:**
  1. Buka tab baru, akses langsung URL: `http://localhost:3000/admin`.
  2. Akses langsung URL: `http://localhost:3000/staff`.
  3. Akses langsung URL: `http://localhost:3000/komting`.
  4. Akses langsung URL: `http://localhost:3000/komting/bookings`.
- **Expected Result:**
  - Seluruh rute terproteksi secara instan mengalihkan pengguna ke `/login`.
  - Tidak ada kebocoran layout atau data internal kampus kepada pengunjung anonim.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar redirect otomatis ke `/login`.

---

### UAT-SEC-04: Persistensi Sesi Pengguna Setelah Browser Refresh
- **Test Case ID:** `UAT-SEC-04`
- **Nama Pengujian:** Persistensi Sesi Pengguna Setelah Browser Refresh
- **Tujuan:** Memverifikasi sesi login tetap bertahan saat pengguna me-refresh halaman browser.
- **Prasyarat:** Login aktif sebagai ADMIN pada `/admin`.
- **Langkah Pengujian:**
  1. Pada halaman `/admin`, lakukan Hard Refresh browser (Ctrl+F5 atau Cmd+Shift+R).
  2. Amati apakah pengguna tetap berada di dashboard atau terlempar ke halaman login.
- **Expected Result:**
  - Halaman memuat ulang dengan cepat.
  - Sesi login tetap aktif berkat token adapter dan cookie SSR Supabase.
  - Pengguna tetap berada di `/admin` tanpa perlu login ulang.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar pasca-refresh yang mempertahankan sesi aktif.

---

### UAT-SEC-05: Logout Pengguna & Pembersihan Total Sesi Browser
- **Test Case ID:** `UAT-SEC-05`
- **Nama Pengujian:** Logout Pengguna & Pembersihan Total Sesi Browser
- **Tujuan:** Memverifikasi proses logout membersihkan seluruh token, cookie, dan state aplikasi.
- **Prasyarat:** Pengguna sedang login.
- **Langkah Pengujian:**
  1. Klik tombol **"Keluar"** pada header navigasi.
  2. Setelah berada di `/login`, klik tombol tombol *Back* pada peramban.
- **Expected Result:**
  - Sesi Supabase dihentikan (`auth.signOut`).
  - Pengguna diarahkan ke `/login`.
  - Menekan tombol *Back* browser tidak mengembalikan pengguna ke halaman terproteksi (tetap dialihkan ke login).
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar halaman `/login` setelah logout sukses.

---

### UAT-SEC-06: Persistensi & Pemrosesan Transactional Email Outbox Batch
- **Test Case ID:** `UAT-SEC-06`
- **Nama Pengujian:** Persistensi & Pemrosesan Transactional Email Outbox Batch
- **Tujuan:** Memverifikasi event email transaksional tercatat di database outbox dan dapat diproses oleh worker batch secara aman tanpa duplikasi.
- **Prasyarat:** Terdapat event mutasi di database (misal booking baru atau persetujuan Komting).
- **Langkah Pengujian:**
  1. Jalankan pemrosesan outbox via API route: `POST /api/v1/cron/email-outbox` dengan otorisasi Bearer Admin / Cron Secret.
  2. Periksa response status JSON hasil klaim worker.
  3. Periksa status baris email di database `email_outbox`.
- **Expected Result:**
  - Endpoint mengembalikan status HTTP 200 dengan ringkasan: `claimed_count`, `sent_count`, dan `failed_count`.
  - Baris outbox yang diproses beralih status dari `PENDING` menjadi `SENT`.
  - Mekanisme `FOR UPDATE SKIP LOCKED` menjamin tidak ada dua worker yang memproses baris email yang sama.
- **Actual Result:** `[ ] Belum dieksekusi`
- **Status:** `NOT TESTED`
- **Bukti Screenshot:** Tangkapan layar response JSON pemrosesan outbox cron worker.

---

## Tabel Ringkasan Status UAT

| ID Test Case | Role | Nama Skenario Pengujian | Hasil Aktual | Status Final |
|---|:---:|---|:---:|:---:|
| `UAT-ADM-01` | ADMIN | Login Admin & Verifikasi Dashboard Statistik | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-02` | ADMIN | Navigasi & Proteksi Menu Khusus Admin | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-03` | ADMIN | Review Pengajuan Komting & Pratinjau Foto KTM | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-04` | ADMIN | Persetujuan (Approval) Pengajuan Komting Baru | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-05` | ADMIN | Penolakan (Rejection) Pengajuan Komting | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-06` | ADMIN | Approval Pengajuan Pergantian Komting | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-07` | ADMIN | Penonaktifan Penugasan Komting Aktif | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-08` | ADMIN | Inventaris Proyektor — Penambahan Unit Baru | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-09` | ADMIN | Inventaris Proyektor — Pembaruan Data Unit | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-10` | ADMIN | Inventaris Proyektor — Deaktivasi Unit | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-11` | ADMIN | Pengaturan Jam Operasional & Hari Libur | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-12` | ADMIN | Manajemen Akun Petugas Staff | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-13` | ADMIN | Pemantauan & Filter Log Audit Sistem | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-14` | ADMIN | Detail Rekaman Log Audit Transaksional | `Belum diuji` | `NOT TESTED` |
| `UAT-ADM-15` | ADMIN | Akses Halaman Koreksi Transaksi | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-01` | STAFF | Login Staff & Verifikasi Dashboard Operasional | Sesuai ekspektasi (Live PINJAM_TESTING) | `PASS` |
| `UAT-STF-02` | STAFF | Pemantauan Antrean Booking Siap Pickup Hari Ini | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-03` | STAFF | Validasi Scan Tiket QR untuk Pickup Proyektor | Sesuai ekspektasi (Live PINJAM_TESTING) | `PASS` |
| `UAT-STF-04` | STAFF | Konfirmasi Serah-Terima Unit ke Komting | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-05` | STAFF | Konfirmasi Pickup yang Diwakilkan | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-06` | STAFF | Pemantauan Daftar Pinjaman Berjalan & Overdue | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-07` | STAFF | Validasi Scan Tiket QR untuk Pengembalian | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-08` | STAFF | Inspeksi Fisik Normal & Pengembalian Lengkap | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-09` | STAFF | Inspeksi Unit Rusak dengan Foto Bukti & Denda | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-10` | STAFF | Disposisi Fisik Proyektor ke Status MAINTENANCE | `Belum diuji` | `NOT TESTED` |
| `UAT-STF-11` | STAFF | Pemantauan Unit Proyektor dalam Pemeliharaan | Sesuai ekspektasi (Live PINJAM_TESTING) | `PASS` |
| `UAT-STF-12` | STAFF | Penolakan Akses Fitur Khusus Admin | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-01` | KOMTING | Registrasi Calon Komting dengan Unggah Foto KTM | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-02` | KOMTING | Validasi Input Formulir Pendaftaran Komting | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-03` | KOMTING | Pengecekan Status Pengajuan Pendaftaran | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-04` | KOMTING | Login Komting Aktif & Dashboard Mahasiswa | Sesuai ekspektasi (Live PINJAM_TESTING) | `PASS` |
| `UAT-KMT-05` | KOMTING | Eksplorasi Inventaris & Kalender Ketersediaan | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-06` | KOMTING | Pengecekan Jam Layanan & Hari Libur Kampus | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-07` | KOMTING | Pembuatan Booking Proyektor Hari Ini / Besok | Sesuai ekspektasi (Kode BKG-20261128-3465) | `PASS` |
| `UAT-KMT-08` | KOMTING | Penegakan Batasan: Maksimum 1 Booking Aktif | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-09` | KOMTING | Penegakan Batasan: Pencegahan Jadwal Bentrok | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-10` | KOMTING | Pembatalan Booking Mandiri Sebelum Diambil | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-11` | KOMTING | Penayangan Tiket QR Pickup pada Detail Booking | Sesuai ekspektasi (QR SVG Read-Only Valid) | `PASS` |
| `UAT-KMT-12` | KOMTING | Transisi Tampilan Detail Booking Setelah Pickup | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-13` | KOMTING | Pemantauan Riwayat Peminjaman (Loan History) | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-14` | KOMTING | Inisiasi Pengembalian & Modal Tiket QR Return | `Belum diuji` | `NOT TESTED` |
| `UAT-KMT-15` | KOMTING | Penegakan Batasan: Dilarang Booking Saat Memegang Loan | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-01` | CROSS | Penanganan Login Gagal Kredensial Salah (401) | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-02` | CROSS | Penolakan Login Akun INACTIVE / REJECTED | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-03` | CROSS | Pengalihan Akses Tanpa Autentikasi ke Login | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-04` | CROSS | Persistensi Sesi Setelah Browser Refresh | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-05` | CROSS | Logout Pengguna & Pembersihan Total Sesi | `Belum diuji` | `NOT TESTED` |
| `UAT-SEC-06` | CROSS | Persistensi & Pemrosesan Email Outbox Batch | `Belum diuji` | `NOT TESTED` |

**Total Skenario UAT:** **48 Test Cases** (15 Admin, 12 Staff, 15 Komting, 6 Cross-Role Security).
