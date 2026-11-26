# PRODUCT REQUIREMENTS DOCUMENT (PRD)
# PINJAM — Sistem Peminjaman Proyektor

**Versi:** 2.0.0  
**Status:** Final — Baseline Implementasi Greenfield  
**Tanggal:** 26 November 2026  
**Produk:** PINJAM  
**Bahasa:** Indonesia

---

## Riwayat Dokumen

| Versi | Tanggal | Keterangan |
|---|---|---|
| 1.0.0 | 26 November 2026 | Draft kebutuhan awal |
| 2.0.0 | 26 November 2026 | Finalisasi aturan bisnis, model domain, arsitektur, dan acceptance criteria |

## 1. Ringkasan Eksekutif

PINJAM adalah aplikasi pengelolaan pengajuan komting, booking, peminjaman, pengembalian, inventaris, dan maintenance proyektor. Hanya komting aktif dan terverifikasi yang dapat melakukan booking. Satu kelas hanya boleh memiliki satu komting aktif.

Sistem wajib memisahkan tiga konsep:
1. **Booking:** reservasi unit pada rentang waktu tertentu.
2. **Status fisik unit:** kondisi aktual proyektor, seperti tersedia, dipinjam, atau maintenance.
3. **Loan:** transaksi serah-terima unit yang telah dikonfirmasi petugas.

Lewatnya estimasi pengembalian tidak berarti unit telah kembali. Unit yang belum diterima dan dikonfirmasi oleh STAFF/ADMIN tetap berstatus `BORROWED`.

Dokumen ini menjadi baseline final untuk pembangunan greenfield. Aplikasi menggunakan database baru. Sistem lama hanya menjadi referensi konseptual dan bukan sumber skema yang wajib dipertahankan.

## 2. Latar Belakang dan Masalah

Pengelolaan peminjaman proyektor membutuhkan koordinasi komting, petugas, dan administrator. Sistem harus mencegah:
- Booking unit yang sama pada jadwal bertabrakan.
- Unit dianggap tersedia hanya karena estimasi pengembalian lewat.
- Mantan komting terhalang mendaftar ulang karena riwayat lamanya masih dianggap aktif.
- Dua komting aktif dalam satu kelas.
- Pengambilan/pengembalian tanpa konfirmasi petugas.
- Ketidakjelasan kondisi unit dan aksesori saat pengembalian.
- Booking yang tidak dapat dipenuhi tetap aktif setelah tanggal berganti.
- Perubahan data tanpa jejak audit.

PINJAM dibangun ulang sebagai aplikasi greenfield dengan domain dan database baru, bukan migrasi paksa dari aplikasi lama.

## 3. Tujuan Produk

1. Membatasi booking kepada komting aktif dan terverifikasi.
2. Mencegah konflik jadwal dan double booking.
3. Menampilkan ketersediaan berdasarkan kondisi fisik aktual.
4. Mencatat serah-terima dan pengembalian dengan konfirmasi petugas.
5. Mengelola pergantian komting beserta riwayatnya.
6. Mengelola inventaris dan maintenance.
7. Mengirim notifikasi email kepada komting.
8. Menyediakan audit trail untuk tindakan sensitif.

### 3.1 Di luar ruang lingkup rilis awal
- Denda atau pembayaran otomatis.
- Sanksi akademik otomatis.
- Face recognition.
- Penilaian otomatis tingkat kerusakan.
- Aplikasi mobile native.
- Integrasi sistem akademik eksternal.

## 4. Ruang Lingkup

### Termasuk
- Registrasi dan verifikasi email calon komting.
- Pengajuan dan verifikasi komting.
- Pengajuan pergantian komting.
- Pengelolaan kelas dan periode akademik.
- Manajemen akun STAFF oleh ADMIN.
- Manajemen inventaris proyektor.
- Pengaturan jam operasional.
- Booking hari ini atau besok.
- QR booking untuk pengambilan dan pengembalian.
- Konfirmasi serah-terima oleh STAFF/ADMIN.
- Pemeriksaan kondisi dan kelengkapan.
- Maintenance.
- Pembatalan booking otomatis.
- Email notifikasi dan pengingat keterlambatan.
- Dashboard berbasis peran dan audit log.

### Tidak termasuk
- Pembayaran denda.
- Sanksi otomatis.
- Pengembalian otomatis berdasarkan waktu.
- QR sebagai pengganti validasi server atau pemeriksaan petugas.

## 5. Aktor dan Hak Akses

### 5.1 Komting
Satu-satunya peran mahasiswa yang dapat mendaftar dan melakukan booking.

Hak:
- Registrasi sebagai calon komting.
- Verifikasi email dan mengajukan data.
- Melihat status pengajuan.
- Melihat inventaris dan ketersediaan.
- Membuat booking jika memenuhi syarat.
- Melihat booking dan riwayat peminjaman sendiri.
- Membatalkan booking sebelum diproses menjadi loan.
- Menerima notifikasi email.

Batas:
- Satu kelas hanya memiliki satu komting aktif.
- Satu komting hanya mewakili satu kelas aktif.
- Satu komting hanya boleh memiliki satu booking aktif.
- Satu komting tidak boleh booking ketika memiliki loan aktif.
- Satu komting hanya boleh meminjam satu proyektor dalam satu waktu.

### 5.2 STAFF
Akun STAFF dibuat manual oleh ADMIN. Tidak ada pendaftaran STAFF publik.

Hak:
- Melihat booking dan transaksi operasional.
- Memindai QR dan memvalidasi booking/loan.
- Mengonfirmasi pengambilan dan pengembalian.
- Mengisi pemeriksaan kondisi dan kelengkapan.
- Mengunggah foto bukti kerusakan/kehilangan.
- Mengelola status maintenance.

STAFF tidak dapat mengangkat/mengganti komting, mengelola akun ADMIN, atau menghapus audit log.

### 5.3 ADMIN
ADMIN memiliki seluruh hak operasional STAFF, serta:
- Memverifikasi/menolak pengajuan komting.
- Mengangkat, mengganti, dan menonaktifkan komting.
- Membuat dan mengelola akun STAFF.
- Mengelola kelas, periode akademik, dan inventaris.
- Mengatur jam operasional.
- Mengoreksi transaksi dengan alasan dan audit trail.
- Melihat audit log dan mengelola konfigurasi aplikasi.

ADMIN boleh melakukan transaksi pickup dan return.

### 5.4 Matriks hak akses

| Fitur | Komting | STAFF | ADMIN |
|---|---:|---:|---:|
| Registrasi komting | Ya | Tidak | Tidak |
| Booking | Ya, jika aktif | Tidak | Tidak |
| Batalkan booking sendiri sebelum pickup | Ya | Tidak | Sesuai kewenangan |
| Konfirmasi pickup/return | Tidak | Ya | Ya |
| Inspeksi unit | Tidak | Ya | Ya |
| Kelola maintenance | Tidak | Ya | Ya |
| Verifikasi/pergantian komting | Tidak | Tidak | Ya |
| Buat akun STAFF | Tidak | Tidak | Ya |
| Atur jam operasional | Tidak | Tidak | Ya |
| Koreksi transaksi | Tidak | Tidak | Ya |

Otorisasi wajib ditegakkan di server dan database, bukan hanya dengan menyembunyikan tombol pada UI.

## 6. Istilah Domain

| Istilah | Definisi |
|---|---|
| Komting | Mahasiswa yang ditetapkan sebagai ketua kelas aktif |
| Pengajuan komting | Permintaan menjadi komting kelas |
| Pengajuan pergantian | Permintaan menggantikan komting aktif |
| Booking | Reservasi unit untuk tanggal dan waktu tertentu |
| Unit | Satu aset proyektor |
| Loan | Transaksi peminjaman setelah serah-terima dikonfirmasi |
| Estimasi pengembalian | Perkiraan waktu kembali, bukan bukti pengembalian |
| Maintenance | Kondisi unit tidak dapat dibooking |
| QR booking | Token opaque untuk mengidentifikasi booking/loan |

## 7. Aturan Bisnis

### 7.1 Registrasi dan penugasan komting
1. Hanya mahasiswa yang mengajukan diri sebagai komting yang dapat mendaftar.
2. Email harus diverifikasi sebelum pengajuan diproses.
3. ADMIN memeriksa identitas, kelas, dan dokumen.
4. Satu kelas hanya boleh memiliki satu penugasan komting aktif.
5. Satu mahasiswa hanya boleh memiliki satu penugasan komting aktif.
6. Jika kelas sudah memiliki komting aktif, pendaftar dari kelas tersebut otomatis dikategorikan sebagai pengajuan pergantian.
7. Penugasan berlangsung sampai ADMIN mengganti atau menonaktifkan komting.
8. Mantan komting boleh mengajukan kembali setelah penugasan lamanya nonaktif.
9. Riwayat penugasan lama tetap disimpan, tetapi tidak boleh menghalangi pengajuan baru.
10. Jika pengajuan pergantian ditolak, komting lama tetap aktif.
11. Jika disetujui, sistem mengirim email singkat kepada komting lama.
12. ADMIN boleh menyelesaikan pergantian meskipun komting lama tidak merespons, dengan peringatan dan audit bahwa konfirmasi belum diterima.
13. Pergantian harus atomik: penugasan lama dinonaktifkan dan penugasan baru diaktifkan dalam satu transaksi. Tidak boleh ada dua komting aktif pada kelas yang sama.

### 7.2 Identitas dan dokumen
1. Foto identitas tetap disimpan setelah verifikasi.
2. Dokumen disimpan di private storage, bukan bucket publik.
3. Akses dibatasi pada ADMIN/petugas verifikasi yang berwenang.
4. Gunakan signed URL berumur pendek atau akses server-side.
5. Akses dan perubahan dokumen dicatat jika relevan.
6. Tidak ada face recognition.

### 7.3 Syarat booking
Komting hanya dapat booking jika:
- Akun aktif dan email terverifikasi.
- Penugasan komting berstatus aktif.
- Tidak memiliki booking aktif lain.
- Tidak memiliki loan aktif.
- Tanggal booking hari ini atau besok.
- Waktu booking belum lewat.
- Unit dapat dialokasikan dan tidak maintenance/nonaktif.
- Tidak ada konflik jadwal unit.

Booking dibuat otomatis terkonfirmasi jika seluruh validasi lolos; tidak memerlukan persetujuan ADMIN.

### 7.4 Durasi dan waktu
1. Komting memilih waktu mulai dan estimasi pengembalian.
2. Durasi bebas dipilih per menit, bukan kelipatan 15/30 menit.
3. Booking harus berada dalam jam operasional.
4. Estimasi pengembalian harus pada tanggal kalender yang sama.
5. Pengembalian paling lambat pada batas akhir jam operasional hari tersebut.
6. Estimasi tidak boleh melewati tengah malam.
7. Booking hanya dapat dibuat untuk hari ini atau besok.
8. Booking untuk waktu lampau ditolak.
9. Zona waktu operasional adalah `Asia/Jakarta`; timestamp disimpan secara konsisten dalam UTC dan ditampilkan sesuai zona lokal.

### 7.5 Batas booking
1. Satu komting hanya boleh memiliki satu booking aktif pada satu waktu.
2. Satu komting hanya boleh memiliki satu loan aktif.
3. Loan aktif menghalangi booking baru meskipun estimasi pengembalian telah lewat.
4. Booking komting dianggap tidak aktif setelah dibatalkan, expired, atau diproses menjadi loan sesuai status booking.

### 7.6 Ketersediaan dan booking lintas hari
1. Status fisik unit dan alokasi booking adalah konsep berbeda.
2. Unit `BORROWED` tidak tersedia untuk pengambilan.
3. Sistem boleh menerima booking besok meskipun unit masih dipinjam hari ini, karena jadwalnya berbeda tanggal.
4. Booking besok bersifat bersyarat pada unit benar-benar kembali dan tersedia sebelum pergantian tanggal.
5. Pada pukul 00.00, sistem memeriksa booking untuk tanggal baru yang unitnya masih belum `AVAILABLE`.
6. Booking yang bergantung pada unit tersebut otomatis dibatalkan jika unit belum tersedia.
7. Lewatnya estimasi pengembalian tidak pernah mengubah `BORROWED` menjadi `AVAILABLE`.
8. Unit baru tersedia setelah STAFF/ADMIN mengonfirmasi pengembalian dan inspeksi.
9. Unit yang lolos pemeriksaan dapat langsung tersedia tanpa buffer.
10. Unit yang masuk maintenance tidak dapat dibooking.

### 7.7 Pembatalan dan expiry
1. Komting dapat membatalkan booking sebelum petugas memproses pickup.
2. Setelah pickup dikonfirmasi, transaksi harus diselesaikan melalui return.
3. Booking yang tidak diambil sampai batas toleransi berubah menjadi `EXPIRED`.
4. Pembatalan sistem menyimpan alasan, waktu, dan sumber tindakan.
5. Job expiry dan pembatalan otomatis harus idempoten.

### 7.8 Jendela pengambilan
1. Waktu booking adalah waktu mulai yang dipilih komting.
2. Toleransi standar: 30 menit sebelum waktu booking sampai 15 menit setelah waktu booking.
3. Jika tidak diambil sampai batas akhir (waktu booking + 15 menit), booking menjadi `EXPIRED`.
4. Pengambilan tidak boleh dilakukan sebelum batas pembukaan layanan hari tersebut atau sebelum waktu booking dikurangi 30 menit, mana yang lebih akhir.
5. Pengambilan setelah batas toleransi hanya dapat dilakukan melalui koreksi/otorisasi ADMIN yang tercatat.

### 7.9 Jam operasional
1. Jam operasional standar dimulai pukul 08.00.
2. Dalam kondisi standar, sistem otomatis mengizinkan pengambilan mulai pukul 07.45 tanpa menunggu ADMIN hadir atau mengonfirmasi.
3. Jika ADMIN membuka operasional lebih awal, misalnya pukul 07.00, sistem mengizinkan pengambilan mulai pukul 07.30.
4. Jam tutup dapat diatur ADMIN.
5. Pembukaan awal dan perubahan jam operasional dicatat.
6. Sistem menyimpan snapshot jam operasional per tanggal agar perubahan konfigurasi tidak mengubah transaksi historis.
7. Perubahan jam tutup yang memengaruhi booking aktif harus divalidasi dan menampilkan peringatan sebelum disimpan.
8. Operasional otomatis tidak berarti serah-terima otomatis; pickup dan return tetap memerlukan STAFF/ADMIN.

**Interpretasi waktu yang wajib dipakai:** batas pembukaan standar adalah 07.45. Jika ADMIN membuka lebih awal, misalnya pukul 07.00, batas pembukaan khusus menjadi 07.30. Untuk setiap booking, waktu pickup paling awal adalah waktu yang lebih akhir antara batas pembukaan layanan hari itu dan 30 menit sebelum waktu booking.

### 7.10 Pickup
1. Setiap booking memiliki QR token unik.
2. QR yang sama digunakan untuk pickup dan return.
3. QR tidak boleh memuat NIM, email, nama, atau PII.
4. STAFF/ADMIN memindai QR dan server memvalidasi token serta status transaksi.
5. Scan saja tidak mengubah status.
6. Petugas memeriksa booking dan unit, lalu melakukan konfirmasi eksplisit.
7. Pickup boleh diwakilkan kepada orang lain yang membawa QR.
8. Petugas dapat mencatat identitas/nama penerima aktual untuk audit operasional.
9. Setelah konfirmasi, booking menjadi `FULFILLED`, loan menjadi `ACTIVE`, dan unit menjadi `BORROWED`.
10. Pembuatan loan dan perubahan status unit harus atomik.

### 7.11 Return dan inspeksi
1. Pengembalian boleh dilakukan oleh komting atau wakil.
2. QR booking yang sama digunakan untuk return.
3. Scan tidak otomatis menyelesaikan pengembalian.
4. STAFF/ADMIN memeriksa kondisi dan kelengkapan.
5. Form minimal:
   - Kondisi proyektor: `NORMAL` / `RUSAK`.
   - Kelengkapan: `LENGKAP` / `TIDAK_LENGKAP`.
   - Catatan petugas.
   - Foto bukti wajib jika rusak atau ada komponen hilang.
6. STAFF/ADMIN menentukan apakah unit masih layak digunakan.
7. Jika layak, loan `COMPLETED` dan unit `AVAILABLE`.
8. Jika perlu perbaikan, loan `COMPLETED` dan unit `MAINTENANCE`.
9. Pengembalian lebih awal diperbolehkan.
10. Unit yang dinyatakan layak dapat langsung tersedia tanpa buffer.
11. Kerusakan/kehilangan tidak otomatis memblokir akun komting.
12. Tidak ada denda atau sanksi akademik otomatis pada rilis awal.
13. Konfirmasi return dan perubahan status unit harus atomik.

### 7.12 Keterlambatan
1. Keterlambatan dihitung dari estimasi pengembalian.
2. Keterlambatan hanya indikator, bukan status fisik.
3. Sistem mengirim email pengingat kepada komting saat melewati estimasi.
4. Loan tetap `ACTIVE` sampai petugas mengonfirmasi return.
5. Tidak ada denda otomatis.
6. Pengingat harus dideduplikasi. Default: satu email saat pertama kali terlambat; pengingat lanjutan hanya jika diaktifkan lewat konfigurasi.

### 7.13 Maintenance
1. STAFF dan ADMIN dapat mengubah status unit menjadi `MAINTENANCE`.
2. Unit maintenance tidak dapat dibooking.
3. Catatan maintenance menyimpan alasan, pembuat, waktu, status, dan penyelesaian.
4. Unit kembali `AVAILABLE` hanya setelah STAFF/ADMIN berwenang menyatakan layak.
5. Booking mendatang yang tidak dapat dipenuhi akibat maintenance dibatalkan dan komting diberi email.
6. Semua perubahan dicatat di audit log.

### 7.14 Penonaktifan komting
1. ADMIN dapat menonaktifkan penugasan komting.
2. Booking belum diambil otomatis dibatalkan.
3. Loan aktif tidak dibatalkan atau dihapus; wajib diselesaikan melalui return normal.
4. Komting nonaktif tidak dapat booking baru.
5. Riwayat tetap disimpan.
6. Penonaktifan tidak mengubah unit borrowed menjadi available.

### 7.15 Koreksi
1. STAFF tidak boleh menghapus atau mengubah transaksi selesai secara diam-diam.
2. ADMIN dapat mengoreksi kesalahan dengan alasan wajib.
3. Audit menyimpan nilai sebelum/sesudah, pelaku, waktu, dan alasan.
4. Koreksi tidak menghapus audit asli.
5. Koreksi harus memvalidasi ulang konsistensi booking, loan, dan status unit.

## 8. Status dan Siklus Hidup

### 8.1 Status pengajuan
- `PENDING_EMAIL_VERIFICATION`
- `PENDING_REVIEW`
- `PENDING_REPLACEMENT_NOTICE`
- `APPROVED`
- `REJECTED`
- `WITHDRAWN`

Status penugasan komting terpisah:
- `ACTIVE`
- `INACTIVE`
- `REPLACED`

### 8.2 Status booking
- `CONFIRMED`
- `CANCELLED`
- `EXPIRED`
- `FULFILLED`

Simpan `cancelled_at`, `cancelled_by`, dan `cancellation_reason` jika relevan.

### 8.3 Status loan
- `ACTIVE`
- `COMPLETED`

Overdue merupakan kondisi turunan dari waktu saat ini dibandingkan estimasi, bukan status yang menggantikan `ACTIVE`.

### 8.4 Status fisik unit
- `AVAILABLE`
- `BORROWED`
- `MAINTENANCE`
- `INACTIVE`

`RESERVED` bukan status fisik. Booking disimpan terpisah. UI boleh menampilkan label “Dipesan” berdasarkan booking mendatang tanpa mengubah status fisik database.

### 8.5 Transisi utama

| Peristiwa | Hasil |
|---|---|
| Booking berhasil | Booking `CONFIRMED` |
| Komting membatalkan | Booking `CANCELLED` |
| Pickup melewati batas toleransi | Booking `EXPIRED` |
| Pickup dikonfirmasi | Booking `FULFILLED`, loan `ACTIVE`, unit `BORROWED` |
| Return normal dikonfirmasi | Loan `COMPLETED`, unit `AVAILABLE` |
| Return perlu perbaikan | Loan `COMPLETED`, unit `MAINTENANCE` |
| Maintenance selesai dan unit layak | Unit `AVAILABLE` |

## 9. Alur Pengguna

### 9.1 Registrasi komting
1. Mahasiswa mengisi identitas, email, kelas, dan dokumen.
2. Sistem mengirim verifikasi email.
3. Setelah email terverifikasi, sistem memeriksa komting aktif pada kelas.
4. Jika belum ada, pengajuan dikategorikan sebagai pengajuan baru.
5. Jika sudah ada, pengajuan dikategorikan sebagai pergantian.
6. ADMIN memeriksa dan menyetujui/menolak.
7. Hasil dikirim melalui email.

### 9.2 Pergantian komting
1. Mahasiswa mengajukan diri dari kelas yang sudah memiliki komting.
2. ADMIN memverifikasi pengajuan.
3. Jika ditolak, komting lama tetap aktif.
4. Jika disetujui, sistem mengirim pemberitahuan/verifikasi singkat ke komting lama.
5. Jika komting lama tidak merespons, ADMIN dapat melanjutkan dengan peringatan.
6. Sistem menonaktifkan penugasan lama dan mengaktifkan penugasan baru secara atomik.
7. Sistem mengirim hasil kepada pihak terkait.

### 9.3 Booking
1. Komting login.
2. Sistem memvalidasi akun, email, penugasan, booking, dan loan.
3. Komting memilih unit, tanggal, waktu mulai, dan estimasi kembali.
4. Sistem memvalidasi jam operasional, konflik jadwal, status fisik, dan batas booking.
5. Booking dibuat terkonfirmasi otomatis.
6. QR booking dibuat dan email konfirmasi dikirim.
7. Komting dapat membatalkan sebelum pickup diproses.

### 9.4 Pickup
1. Komting atau wakil membawa QR.
2. STAFF/ADMIN scan QR.
3. Server memvalidasi token, status booking, waktu, komting, dan unit.
4. Petugas memeriksa ringkasan.
5. Petugas menyerahkan unit dan menekan konfirmasi.
6. Sistem membuat loan aktif dan mengubah unit menjadi borrowed.
7. Email konfirmasi dikirim kepada komting.

### 9.5 Return
1. Komting atau wakil membawa QR yang sama.
2. STAFF/ADMIN scan QR.
3. Sistem menampilkan loan aktif.
4. Petugas memeriksa unit dan aksesori.
5. Petugas mengisi kondisi, kelengkapan, catatan, dan foto jika wajib.
6. Petugas menentukan unit layak atau maintenance.
7. Petugas mengonfirmasi return.
8. Sistem menyelesaikan loan dan memperbarui status unit.
9. Email konfirmasi dikirim kepada komting.

## 10. Kebutuhan Fungsional

| ID | Kebutuhan |
|---|---|
| FR-001 | Registrasi calon komting |
| FR-002 | Verifikasi email |
| FR-003 | Pengajuan komting beserta dokumen |
| FR-004 | Deteksi otomatis pengajuan pergantian |
| FR-005 | ADMIN menyetujui/menolak pengajuan |
| FR-006 | Menyimpan riwayat penugasan komting |
| FR-007 | ADMIN membuat/mengelola akun STAFF |
| FR-008 | ADMIN mengelola inventaris |
| FR-009 | Sistem menerapkan jam operasional |
| FR-010 | Komting booking hari ini/besok |
| FR-011 | Mencegah konflik jadwal |
| FR-012 | Membatasi satu booking aktif per komting |
| FR-013 | Menghasilkan QR opaque unik |
| FR-014 | Validasi QR di server |
| FR-015 | STAFF/ADMIN mengonfirmasi pickup |
| FR-016 | STAFF/ADMIN mengonfirmasi return |
| FR-017 | Menyimpan inspeksi kondisi dan kelengkapan |
| FR-018 | Mewajibkan foto bila rusak/tidak lengkap |
| FR-019 | STAFF/ADMIN mengelola maintenance |
| FR-020 | Expire booking setelah toleransi |
| FR-021 | Membatalkan booking lintas hari pukul 00.00 jika unit belum tersedia |
| FR-022 | Mengirim email peristiwa penting |
| FR-023 | Mengirim email pengingat keterlambatan |
| FR-024 | Menyimpan audit log |
| FR-025 | Dashboard berbasis peran |
| FR-026 | Riwayat booking dan loan komting |
| FR-027 | Membatalkan booking saat komting dinonaktifkan |
| FR-028 | Koreksi ADMIN dengan alasan dan audit |

## 11. Kebutuhan Non-Fungsional

### Keamanan
- Autentikasi dan otorisasi diperiksa di server.
- Terapkan least privilege.
- Dokumen identitas dan bukti disimpan privat.
- QR memakai token acak opaque dan tidak memuat PII.
- Validasi QR dan transaksi dilakukan di server.
- Terapkan rate limiting untuk autentikasi, registrasi, email, dan endpoint sensitif.
- Lindungi dari CSRF, XSS, SQL injection, IDOR, dan replay.
- Secret/service-role key tidak boleh terekspos ke browser.
- Audit tindakan sensitif.
- Akses file memakai signed URL singkat atau mekanisme server-side.

### Konsistensi
- Tidak boleh ada double booking atau double loan.
- Pickup dan return atomik.
- Endpoint mutasi penting idempoten.
- Scheduled job aman dijalankan berulang.
- Kegagalan email tidak membatalkan transaksi bisnis.
- Kegagalan email dicatat dan dapat dicoba ulang.

### Usability
- Responsif untuk desktop, tablet, dan ponsel.
- UI STAFF dioptimalkan untuk scan QR.
- Status booking, loan, dan unit dibedakan.
- Jangan hanya mengandalkan warna untuk status.
- Pesan validasi dan kesalahan harus jelas.
- Formulir dan aksi penting aksesibel dengan keyboard.

### Performa
- Gunakan indeks untuk query booking, loan, inventaris, dan riwayat.
- Pagination untuk daftar panjang.
- Foto tidak diunduh penuh sebelum dibuka.
- Target angka performa ditetapkan setelah pengukuran lingkungan nyata.

## 12. Keputusan Arsitektur dan Teknis

### 12.1 Baseline teknologi
Rekomendasi baseline:
- Next.js App Router.
- React dan TypeScript.
- PostgreSQL.
- Supabase Auth jika Supabase dipilih untuk autentikasi.
- Supabase Storage private bucket untuk dokumen dan foto.
- Server-side actions/API untuk seluruh mutasi.
- Email provider melalui adapter/service terpisah.
- Cron/scheduled jobs untuk expiry, midnight cancellation, dan overdue reminder.

Ini merupakan keputusan teknis baseline yang selaras dengan ekosistem sebelumnya. Implementasi harus memakai project, database, credentials, dan storage baru. Jangan menggunakan database aplikasi lama.

### 12.2 Batas domain
Pisahkan modul:
1. Authentication & Identity
2. Komting Applications
3. Class & Academic Period
4. Komting Appointment
5. Inventory
6. Operating Hours
7. Booking
8. Loan & Handover
9. Return Inspection
10. Maintenance
11. Notifications
12. Audit

### 12.3 Model data konseptual

| Entitas | Tanggung jawab |
|---|---|
| `profiles` | Profil pengguna dan status akun |
| `user_roles` | Peran ADMIN, STAFF, KOMTING |
| `classes` | Data kelas |
| `academic_periods` | Periode akademik bila diperlukan |
| `komting_applications` | Pengajuan komting/pergantian |
| `komting_appointments` | Riwayat penugasan komting |
| `projectors` | Unit dan status fisik |
| `operating_hours` | Konfigurasi jam operasional |
| `operating_sessions` | Snapshot operasional harian dan pembukaan awal |
| `bookings` | Reservasi unit |
| `loans` | Transaksi peminjaman |
| `return_inspections` | Hasil inspeksi pengembalian |
| `maintenance_records` | Riwayat maintenance |
| `notification_outbox` | Antrian dan status email |
| `audit_logs` | Jejak perubahan sensitif |

### 12.4 Constraint dan integritas
- Maksimal satu appointment aktif per kelas.
- Maksimal satu appointment aktif per mahasiswa.
- Maksimal satu booking aktif per komting.
- Maksimal satu loan aktif per komting.
- Maksimal satu loan aktif per unit.
- Booking unit yang sama tidak boleh overlap.
- Gunakan foreign key, check constraint, partial unique index, dan exclusion constraint PostgreSQL untuk rentang waktu bila sesuai.
- Jika exclusion constraint tidak digunakan, gunakan transaksi dan row locking/serializable validation.
- Validasi di UI saja tidak cukup.

### 12.5 Pemisahan status
Jangan gabungkan status fisik dan booking dalam satu kolom.
- `projectors.physical_status`: keadaan fisik.
- `bookings.status`: keadaan reservasi.
- `loans.status`: keadaan transaksi.
- Ketersediaan tampilan dihitung dari gabungan ketiganya dan jadwal.

Unit dapat berstatus fisik `AVAILABLE` tetapi memiliki booking untuk slot mendatang. Booking tidak mengubah status fisik menjadi `RESERVED`.

### 12.6 Transaksi atomik
Operasi berikut harus atomik:
- Membuat booking dan memeriksa konflik.
- Membatalkan/expire booking.
- Pembatalan booking lintas hari.
- Konfirmasi pickup dan pembuatan loan.
- Konfirmasi return dan pembaruan unit.
- Pergantian komting.
- Penonaktifan komting dan pembatalan booking belum diambil.
- Perubahan status maintenance.

Kegagalan salah satu langkah harus membatalkan seluruh transaksi terkait.

### 12.7 QR
- QR berisi token acak kriptografis, bukan ID berurutan atau PII.
- Simpan hash token bila sesuai.
- Token tidak dapat ditebak dan dapat dicabut.
- Server memvalidasi status booking/loan.
- Scan tidak otomatis mengubah status.
- QR yang sama digunakan untuk pickup dan return; server menentukan konteks dari status transaksi.

### 12.8 Email transactional outbox
1. Mutasi bisnis dan pencatatan event email dilakukan dalam transaksi yang sama.
2. Worker mengirim email dari outbox.
3. Status email menjadi sent/failed.
4. Kegagalan provider tidak membatalkan transaksi.
5. Retry memakai backoff dan batas percobaan.
6. Event key digunakan untuk deduplikasi.

### 12.9 Scheduled jobs
- Expire booking setelah batas pickup.
- Midnight cancellation pada pukul 00.00 zona `Asia/Jakarta`.
- Overdue reminder.
- Retry outbox.
- Rekonsiliasi untuk mendeteksi anomali, bukan mengubah status fisik tanpa konfirmasi petugas.

Semua job idempoten dan memiliki logging. Validasi ulang tetap dilakukan saat pickup untuk mengatasi job yang terlambat.

## 13. Notifikasi Email

Penerima notifikasi bisnis adalah komting terkait. Peristiwa:
- Verifikasi email.
- Pengajuan diterima sistem.
- Pengajuan disetujui/ditolak.
- Pemberitahuan pergantian kepada komting lama.
- Pergantian selesai.
- Booking berhasil.
- Booking dibatalkan.
- Booking expired.
- Pengingat pengambilan.
- Keterlambatan pengembalian.
- Pengembalian selesai.
- Pembatalan booking karena unit belum kembali.
- Pembatalan booking karena maintenance.

Email memuat informasi yang diperlukan saja. Jangan mengirim dokumen identitas atau PII yang tidak diperlukan. Email komting lama terkait pergantian merupakan pemberitahuan/verifikasi singkat; ADMIN tetap dapat menyelesaikan pergantian tanpa respons dengan peringatan.

## 14. UI/UX

### 14.1 Arah visual
Gunakan **Neubrutalism**:
- Kontras tinggi.
- Border tegas.
- Shadow offset.
- Tipografi kuat.
- Warna aksen konsisten.
- Komponen sederhana dengan hierarki jelas.

Gaya visual tidak boleh mengurangi keterbacaan, aksesibilitas, atau kesan profesional.

### 14.2 Area antarmuka
- Halaman publik dan registrasi.
- Dashboard komting.
- Booking dan detail booking.
- Riwayat komting.
- Dashboard STAFF.
- Scan QR.
- Pickup/return.
- Inventaris.
- Maintenance.
- Dashboard ADMIN.
- Review pengajuan/pergantian komting.
- Manajemen STAFF.
- Pengaturan jam operasional.
- Audit log.

### 14.3 Prinsip UX
- Status booking, loan, dan unit harus berbeda secara visual.
- Tampilkan zona waktu lokal.
- Berikan alasan jelas saat booking ditolak.
- Minta konfirmasi eksplisit sebelum transaksi selesai.
- Foto wajib ketika kondisi rusak/tidak lengkap.
- Tindakan berisiko membutuhkan dialog konfirmasi.
- Semua aksi menampilkan hasil berhasil/gagal.

## 15. Audit, Privasi, dan Retensi

Audit sekurang-kurangnya mencatat:
- Perubahan peran dan akun.
- Persetujuan/penolakan pengajuan.
- Pengangkatan/pergantian/penonaktifan komting.
- Pembatalan booking oleh ADMIN/sistem.
- Pickup dan return.
- Koreksi transaksi.
- Perubahan status unit dan maintenance.
- Perubahan jam operasional.
- Akses/perubahan dokumen jika dapat dicatat dengan aman.

Audit memuat actor, action, entity type/ID, timestamp, reason jika diwajibkan, dan metadata before/after tanpa rahasia.

Dokumen identitas tetap disimpan sesuai keputusan produk. Akses harus terbatas dan private. Durasi retensi spesifik mengikuti kebijakan institusi; implementasi tidak boleh mengarang durasi. Sediakan kemampuan penghapusan administratif yang tidak merusak audit yang diwajibkan.

## 16. Penanganan Kasus Khusus

| Kasus | Perilaku |
|---|---|
| Komting booking saat sudah memiliki booking aktif | Ditolak |
| Komting booking saat loan aktif | Ditolak |
| Komting nonaktif | Tidak dapat booking |
| Kelas sudah memiliki komting | Pengajuan menjadi pergantian |
| Komting lama tidak merespons | ADMIN dapat lanjut dengan peringatan dan audit |
| Unit masih borrowed pukul 00.00 | Booking besok yang bergantung pada unit dibatalkan |
| Estimasi pengembalian lewat | Tetap borrowed; kirim email |
| QR tidak valid | Tolak tanpa membocorkan data |
| QR valid, booking expired/cancelled | Pickup ditolak |
| QR valid dan loan aktif | Tampilkan proses return |
| Email gagal | Transaksi tetap berhasil; outbox retry |
| Unit rusak/aksesori hilang | Foto wajib; petugas menentukan kelayakan |
| Komting nonaktif dengan booking belum diambil | Booking dibatalkan |
| Komting nonaktif dengan loan aktif | Loan tetap sampai return normal |
| ADMIN mengoreksi transaksi | Wajib alasan dan audit before/after |
| Dua request booking bersamaan | Hanya satu boleh berhasil |

## 17. Acceptance Criteria

### Registrasi dan komting
- [ ] Booking tidak tersedia sebelum email terverifikasi dan pengajuan disetujui.
- [ ] Satu kelas tidak dapat memiliki dua komting aktif.
- [ ] Satu mahasiswa tidak dapat memiliki dua appointment aktif.
- [ ] Pengajuan dari kelas yang sudah memiliki komting terklasifikasi sebagai pergantian.
- [ ] Penolakan pergantian tidak mengubah komting lama.
- [ ] ADMIN dapat menyelesaikan pergantian tanpa respons komting lama dengan peringatan dan audit.
- [ ] Mantan komting dapat mengajukan ulang setelah penugasan nonaktif.
- [ ] Riwayat lama tetap tersimpan.

### Booking dan ketersediaan
- [ ] Booking hanya hari ini atau besok.
- [ ] Waktu lampau ditolak.
- [ ] Durasi dapat dipilih per menit.
- [ ] Estimasi kembali pada hari yang sama dan dalam jam operasional.
- [ ] Satu booking aktif per komting.
- [ ] Loan aktif menghalangi booking baru.
- [ ] Tidak ada booking unit yang overlap.
- [ ] Estimasi lewat tidak mengubah borrowed menjadi available.
- [ ] Booking besok dapat dibuat saat unit masih dipinjam hari ini.
- [ ] Jika unit belum available pukul 00.00, booking yang bergantung padanya dibatalkan.
- [ ] Booking valid langsung confirmed tanpa approval ADMIN.

### Operasional dan pickup
- [ ] Pickup standar dapat dimulai pukul 07.45.
- [ ] Sistem tidak menunggu konfirmasi ADMIN untuk pembukaan standar.
- [ ] Pembukaan ADMIN pukul 07.00 memungkinkan pickup pukul 07.30.
- [ ] Pickup hanya pada jendela yang diizinkan.
- [ ] QR dapat digunakan wakil.
- [ ] QR tidak memuat PII.
- [ ] Scan saja tidak mengubah status.
- [ ] Konfirmasi petugas membuat loan aktif dan unit borrowed secara atomik.

### Return dan maintenance
- [ ] QR yang sama dapat digunakan untuk return.
- [ ] Scan tidak menyelesaikan return.
- [ ] Form memuat kondisi, kelengkapan, dan catatan.
- [ ] Foto wajib jika rusak/tidak lengkap.
- [ ] Petugas menentukan available atau maintenance.
- [ ] Unit layak langsung available setelah konfirmasi.
- [ ] Loan dan status unit berubah secara atomik.
- [ ] Kerusakan/kehilangan tidak otomatis memblokir komting.
- [ ] STAFF dan ADMIN dapat mengelola maintenance.

### Email, audit, dan keandalan
- [ ] Setiap peristiwa email menghasilkan outbox event.
- [ ] Email gagal tidak membatalkan transaksi.
- [ ] Retry tidak mengirim event duplikat.
- [ ] Email overdue dikirim ke komting.
- [ ] Koreksi ADMIN menyimpan alasan dan before/after.
- [ ] Scheduled job aman dijalankan berulang.
- [ ] Booking simultan tidak menghasilkan double booking.
- [ ] Otorisasi ditegakkan server-side.

## 18. Strategi Pengujian

### Unit test
- Validasi tanggal dan waktu booking.
- Jendela pickup.
- Estimasi pengembalian.
- Konflik jadwal.
- Status komting.
- Batas booking komting.
- Status fisik unit.
- Pembatalan tengah malam.

### Integration test
- Registrasi dan verifikasi email.
- Pengajuan/pergantian komting.
- Booking/cancel/expiry.
- QR pickup dan loan.
- QR return dan inspeksi.
- Maintenance.
- Outbox/retry.
- Audit.

### Concurrency test
- Dua komting booking unit dan slot sama secara bersamaan.
- Satu komting mengirim dua request booking bersamaan.
- Dua petugas memproses QR yang sama.
- Job expiry bersamaan dengan pembatalan pengguna.
- Job tengah malam bersamaan dengan konfirmasi return.

Hasil yang diharapkan: tidak ada double booking, double loan, atau status yang saling bertentangan.

### UAT
Pengujian akhir harus melibatkan kamera untuk scan QR, perangkat petugas, email yang benar-benar diterima, dan proyektor fisik. Simulasi API tidak boleh dilaporkan sebagai pengujian perangkat keras.

## 19. Deployment dan Operasional

- Gunakan project, database, dan storage baru.
- Pisahkan development, staging, dan production.
- Environment variable dan secret dikelola per environment.
- Migrasi database harus versioned.
- Backup berkala dan uji pemulihan.
- Pantau scheduled jobs dan email outbox.
- Konfigurasikan provider email dan uji di production.
- Storage dokumen harus private.
- Sediakan rollback aplikasi dan prosedur pemulihan migrasi.
- Build sukses bukan bukti production-ready; lakukan UAT dan pilot.

## 20. Prioritas Implementasi

### P0 — Fondasi
- Repository dan environment greenfield.
- Auth dan role-based access.
- Skema database.
- Kelas dan appointment komting.
- Audit log.
- Private storage.

### P1 — Pengajuan dan inventaris
- Registrasi/verifikasi email.
- Review ADMIN.
- Pergantian komting.
- Manajemen STAFF.
- Inventaris.
- Jam operasional.

### P2 — Booking
- Ketersediaan.
- Konflik jadwal.
- Booking hari ini/besok.
- QR.
- Cancel/expiry.
- Midnight cancellation.

### P3 — Operasional
- Scan QR.
- Pickup dan loan.
- Return inspection.
- Return confirmation.
- Maintenance.

### P4 — Notifikasi dan hardening
- Email outbox.
- Overdue reminder.
- Retry/deduplikasi.
- Security hardening.
- Concurrency test.
- UAT/pilot.

## 21. Risiko dan Mitigasi

| Risiko | Mitigasi |
|---|---|
| Double booking | Constraint DB, transaksi, locking |
| Unit dianggap tersedia sebelum kembali | Status fisik terpisah; hanya petugas yang mengonfirmasi |
| Job tengah malam terlambat | Job idempoten, retry, validasi ulang saat pickup |
| Komting lama tidak merespons | ADMIN dapat melanjutkan dengan peringatan dan audit |
| Email gagal | Transactional outbox dan retry |
| QR dibagikan | Token opaque, validasi server, catat penerima aktual |
| Dokumen identitas bocor | Private storage, akses terbatas, signed URL |
| Salah konfirmasi | Koreksi ADMIN dengan alasan dan audit |
| Jam operasional berubah | Snapshot per tanggal dan validasi perubahan |

## 22. Keputusan Final dan Interpretasi Implementasi

### 22.1 Keputusan bisnis final
- Hanya komting dapat mendaftar dan booking.
- Satu kelas satu komting aktif.
- Pengajuan kelas yang sudah memiliki komting menjadi pengajuan pergantian.
- ADMIN memverifikasi pengajuan.
- Komting aktif sampai diganti/dinonaktifkan.
- Mantan komting boleh mengajukan ulang setelah nonaktif.
- Foto identitas tetap disimpan setelah verifikasi.
- Satu komting satu booking aktif dan satu loan aktif.
- Booking hanya hari ini/besok; waktu lampau dilarang.
- Durasi bebas per menit.
- Estimasi kembali harus pada hari yang sama dan dalam jam operasional.
- Unit borrowed tidak tersedia hanya karena estimasi lewat.
- Booking besok boleh dibuat saat unit masih dipinjam hari ini.
- Booking bersyarat tersebut dibatalkan pukul 00.00 jika unit belum available.
- Pickup memiliki toleransi 30 menit sebelum sampai 15 menit sesudah waktu booking.
- Operasional standar mulai 08.00; pickup mulai 07.45.
- Pembukaan ADMIN pukul 07.00 memungkinkan pickup pukul 07.30.
- Jam tutup diatur ADMIN.
- Pickup dan return boleh diwakilkan.
- QR sama untuk pickup dan return.
- Scan tidak mengonfirmasi transaksi.
- STAFF/ADMIN menentukan kelayakan unit.
- Foto wajib jika rusak/tidak lengkap.
- STAFF dan ADMIN mengelola maintenance.
- ADMIN dapat koreksi transaksi dengan alasan dan audit.
- Penonaktifan komting membatalkan booking belum diambil, tetapi loan aktif harus dikembalikan normal.
- Email adalah kanal notifikasi, penerima bisnis adalah komting.
- Tidak ada denda/sanksi otomatis.
- Design system Neubrutalism.

### 22.2 Keputusan teknis baseline
- PostgreSQL relational database.
- Database greenfield terpisah dari sistem lama.
- Status fisik, booking, dan loan dipisahkan.
- Partial unique index untuk entitas aktif.
- Pencegahan overlap di level database.
- Transaksi atomik untuk operasi kritis.
- QR token opaque dan validasi server.
- Private storage untuk dokumen/foto.
- Transactional outbox untuk email.
- Scheduled jobs idempoten.
- Audit log.
- Zona waktu operasional `Asia/Jakarta`, timestamp disimpan konsisten UTC.
- Snapshot jam operasional per tanggal.
- Otorisasi ditegakkan di server/database.

### 22.3 Interpretasi wajib
1. `AVAILABLE` adalah status fisik, bukan status jadwal.
2. Booking mendatang tidak mengubah status fisik menjadi `RESERVED`.
3. Booking besok saat unit borrowed adalah reservasi bersyarat sampai unit kembali.
4. Job pukul 00.00 hanya membatalkan booking yang bergantung pada unit yang belum tersedia; job tidak mengubah borrowed menjadi available.
5. Status komting aktif ditentukan oleh appointment aktif, bukan keberadaan akun/riwayat.
6. Riwayat appointment tidak dihapus.
7. Penonaktifan komting tidak menghilangkan kewajiban return loan aktif.
8. Return menutup loan; hasil inspeksi menentukan available atau maintenance.
9. Kegagalan email tidak membatalkan transaksi yang telah commit.
10. Operasi kritis tahan terhadap request ganda dan job berulang.

## 23. Catatan Implementasi

Desain visual final, provider email, template email, interval retry, masa berlaku signed URL, dan target performa numerik dapat ditetapkan pada tahap desain teknis tanpa mengubah aturan bisnis.

Jika ada konflik antara kemudahan implementasi dan aturan bisnis, integritas transaksi serta aturan bisnis harus diutamakan. Agent implementasi tidak boleh mengubah perilaku produk secara sepihak. Jika ditemukan konflik yang benar-benar membutuhkan keputusan produk baru, dokumentasikan dan hentikan bagian terkait daripada membuat asumsi yang mengubah aturan.

---

**Akhir Dokumen — PRD PINJAM v2.0.0**
