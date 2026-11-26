# FRONTEND SPECIFICATION — PINJAM

**Versi:** 1.0.0  
**Status:** Draft implementasi frontend  
**Tanggal:** 26 November 2026  
**Acuan:** `PRD_PINJAM_FINAL.md` dan `API_CONTRACT_PINJAM.md`  
**Pemilik implementasi:** Frontend Lead

---

## 1. Tujuan dokumen

Dokumen ini menjadi panduan implementasi frontend PINJAM. Isinya menetapkan cakupan halaman, navigasi, design system, komponen, perilaku UI, state, integrasi API, akses berdasarkan role, serta kriteria penerimaan frontend.

Frontend dibangun terlebih dahulu menggunakan mock service. Ketika backend tersedia, mock service diganti dengan API client tanpa perlu membangun ulang seluruh halaman.

### Prinsip utama

1. PRD adalah sumber kebenaran business rules.
2. API Contract adalah sumber kebenaran bentuk request dan response.
3. Frontend bertanggung jawab atas presentasi, interaksi, validasi awal, dan pengalaman pengguna.
4. Backend tetap menjadi sumber kebenaran untuk otorisasi, ketersediaan unit, status transaksi, waktu, dan validasi bisnis.
5. Jangan menambahkan fitur atau aturan bisnis yang tidak tercantum pada PRD/API Contract tanpa persetujuan.
6. Gunakan Neubrutalism secara konsisten, tetapi tetap prioritaskan keterbacaan dan aksesibilitas.
7. Semua halaman harus responsif, terutama pada perangkat mobile.

---

## 2. Sasaran frontend

Frontend harus mendukung tiga kelompok pengguna:

### 2.1 KOMTING
- Mengajukan pendaftaran sebagai komting.
- Melihat status pengajuan.
- Melihat dashboard dan status penugasan kelas.
- Melihat daftar proyektor dan informasi ketersediaannya.
- Membuat booking untuk hari ini atau besok.
- Melihat detail dan QR booking.
- Melihat riwayat booking dan peminjaman.
- Melihat informasi keterlambatan atau pembatalan yang relevan.

### 2.2 STAFF
- Melihat dashboard operasional.
- Melihat daftar booking dan detail booking.
- Memindai QR untuk pickup atau return.
- Memvalidasi QR dan melihat ringkasan transaksi.
- Mengonfirmasi pickup setelah memeriksa data.
- Melakukan pemeriksaan pengembalian.
- Mengunggah foto bukti jika rusak atau aksesori tidak lengkap.
- Mengelola maintenance dan status kelayakan unit sesuai izin.

### 2.3 ADMIN
- Memiliki seluruh fungsi operasional STAFF.
- Melihat dan memproses pengajuan komting.
- Menyetujui atau menolak pengajuan.
- Memproses pergantian dan penonaktifan komting.
- Mengelola akun STAFF.
- Mengelola inventaris proyektor dan konfigurasi jam operasional.
- Melihat audit log.
- Melakukan koreksi transaksi dengan alasan dan melalui alur yang diautorisasi.

---

## 3. Batas tanggung jawab frontend

### Frontend boleh
- Memvalidasi field wajib, format input, dan kelengkapan form sebelum request.
- Menampilkan status yang diterima dari backend.
- Menghitung tampilan turunan yang tidak menentukan business truth, misalnya label tanggal atau format durasi.
- Menyembunyikan menu yang tidak relevan dengan role untuk UX.
- Menampilkan konfirmasi sebelum aksi penting.
- Mengelola loading, error, empty, dan success state.
- Menyediakan mock data yang bentuknya identik dengan API Contract.

### Frontend tidak boleh
- Menentukan sendiri apakah proyektor benar-benar tersedia.
- Mengubah status booking/loan/unit hanya melalui state lokal.
- Menentukan bahwa booking sah tanpa respons backend.
- Menentukan role atau izin dari nilai yang dapat dimodifikasi di browser.
- Menganggap QR yang berhasil dipindai berarti transaksi selesai.
- Menyimpan secret/service-role key di browser.
- Mengakses file identitas privat tanpa otorisasi dan mekanisme akses backend.
- Membuat denda atau sanksi akademik.
- Mengubah aturan waktu, toleransi pickup, atau jam operasional yang sudah ditentukan PRD.

---

## 4. Design direction — Neubrutalism

### 4.1 Karakter visual

Gunakan gaya Neubrutalism yang tegas, sederhana, dan mudah dikenali:
- Latar halaman terang dan bersih.
- Permukaan komponen dengan warna solid.
- Border tebal dan jelas.
- Bayangan keras dengan offset konsisten.
- Sudut komponen relatif tegas atau sedikit membulat; hindari bentuk terlalu pill.
- Tipografi tebal untuk heading dan label penting.
- Warna aksen digunakan secara terkontrol untuk tindakan dan status.
- Ikon sederhana dan konsisten.
- Hindari glassmorphism, blur berlebihan, gradient dekoratif, dan shadow lembut yang tidak sesuai arah visual.

### 4.2 Token desain awal

Nilai berikut adalah baseline visual dan boleh disesuaikan setelah eksplorasi UI, selama konsistensi Neubrutalism dipertahankan.

```css
:root {
  --color-bg: #f7f7f2;
  --color-surface: #ffffff;
  --color-ink: #171717;
  --color-muted: #666666;
  --color-primary: #c8f169;
  --color-secondary: #b8d9ff;
  --color-accent: #ff8f70;
  --color-warning: #ffd166;
  --color-danger: #ff6b6b;
  --color-success: #8bd3a8;

  --border-width: 2px;
  --border-color: #171717;
  --shadow-x: 4px;
  --shadow-y: 4px;
  --shadow-color: #171717;

  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 14px;
}
```

### 4.3 Aturan komponen visual
- Card: border tebal, shadow keras, surface solid.
- Button utama: warna aksen solid, border tebal, shadow keras; saat ditekan shadow berkurang dan elemen bergeser.
- Input: border tegas, label terlihat, focus ring jelas.
- Badge: gunakan warna dan teks; jangan hanya mengandalkan warna.
- Modal: kontras tinggi, fokus keyboard terjaga, tombol aksi jelas.
- Table: header kuat, baris mudah dipindai, mobile menggunakan card/list jika tabel terlalu lebar.
- Status berbahaya seperti `DAMAGED`, `MAINTENANCE`, `EXPIRED` harus mudah dikenali dan tetap memiliki label teks.

### 4.4 Aksesibilitas
- Kontras teks dan latar memadai.
- Semua input memiliki label.
- Semua aksi dapat dijalankan dengan keyboard.
- Focus state terlihat jelas.
- QR tidak boleh menjadi satu-satunya cara mengakses informasi transaksi; tampilkan kode booking atau informasi alternatif yang aman.
- Jangan menyampaikan status hanya dengan warna.
- Berikan pesan error yang terhubung ke field terkait.

---

## 5. Struktur navigasi dan route

Nama route berikut adalah rekomendasi. Implementasi boleh menyesuaikan framework, tetapi fungsi dan batas akses harus tetap sama.

### 5.1 Route publik

| Route | Halaman | Akses |
|---|---|---|
| `/login` | Login | Publik |
| `/register` | Pengajuan pendaftaran komting | Publik sesuai kebijakan pendaftaran |
| `/application/status` | Status pengajuan | Pemohon terautentikasi atau mekanisme aman yang disepakati |
| `/verify-email` | Verifikasi email/callback | Publik dengan token valid |

### 5.2 Route KOMTING

| Route | Halaman |
|---|---|
| `/komting` | Dashboard |
| `/komting/projectors` | Daftar proyektor |
| `/komting/bookings/new` | Form booking |
| `/komting/bookings` | Riwayat/daftar booking |
| `/komting/bookings/[id]` | Detail booking dan QR |
| `/komting/loans` | Riwayat peminjaman |
| `/komting/profile` | Profil dan status assignment |

### 5.3 Route STAFF

| Route | Halaman |
|---|---|
| `/staff` | Dashboard operasional |
| `/staff/bookings` | Daftar booking |
| `/staff/bookings/[id]` | Detail booking |
| `/staff/scan` | Pemindaian QR |
| `/staff/loans` | Daftar loan |
| `/staff/loans/[id]/return` | Form pemeriksaan return |
| `/staff/maintenance` | Daftar maintenance |
| `/staff/maintenance/[id]` | Detail maintenance |

### 5.4 Route ADMIN

| Route | Halaman |
|---|---|
| `/admin` | Dashboard ADMIN |
| `/admin/applications` | Daftar pengajuan komting |
| `/admin/applications/[id]` | Detail dan verifikasi pengajuan |
| `/admin/komting` | Daftar assignment komting |
| `/admin/staff` | Pengelolaan akun STAFF |
| `/admin/projectors` | Inventaris proyektor |
| `/admin/operating-hours` | Konfigurasi jam operasional |
| `/admin/audit-logs` | Audit log |
| `/admin/corrections` | Alur koreksi transaksi |

### 5.5 Navigasi berdasarkan role

- KOMTING melihat navigasi komting saja.
- STAFF melihat navigasi operasional STAFF.
- ADMIN melihat navigasi ADMIN dan akses operasional STAFF.
- Menu yang tidak diizinkan tidak ditampilkan, tetapi setiap route tetap harus dilindungi di server/backend.
- Jika pengguna membuka route yang tidak sesuai role, tampilkan halaman `403` atau arahkan ke dashboard role yang sesuai.
- Jika session tidak valid, arahkan ke login dan pertahankan tujuan awal bila aman.

---

## 6. Layout aplikasi

### 6.1 Desktop
- Sidebar navigasi di kiri.
- Header berisi judul halaman, identitas pengguna, dan aksi kontekstual.
- Konten utama menggunakan grid yang konsisten.
- Lebar konten dibatasi agar tabel/form mudah dibaca.
- Sidebar dapat diciutkan bila diperlukan.

### 6.2 Mobile
- Navigasi menggunakan drawer atau bottom navigation untuk bagian yang paling sering digunakan.
- Form satu kolom.
- Tombol aksi utama mudah dijangkau.
- Tabel berubah menjadi card/list atau memiliki scroll horizontal yang jelas.
- Dialog menggunakan ukuran layar yang sesuai.
- QR ditampilkan cukup besar untuk dipindai.
- Hindari informasi penting hanya tersedia melalui hover.

### 6.3 Komponen layout
- `AppShell`
- `Sidebar`
- `MobileNavigation`
- `Topbar`
- `PageHeader`
- `Breadcrumbs` bila struktur route memerlukannya
- `RoleGuard` untuk UX route
- `ConfirmDialog`
- `ToastProvider`
- `LoadingState`
- `EmptyState`
- `ErrorState`

---

## 7. Design system dan komponen bersama

Komponen reusable minimum:

### 7.1 Form
- `Button`
- `Input`
- `Textarea`
- `Select`
- `DatePicker`
- `TimePicker`
- `FileUpload`
- `Checkbox`
- `RadioGroup`
- `FormField`
- `FormError`
- `FormSection`

### 7.2 Data display
- `Card`
- `StatCard`
- `DataTable`
- `MobileDataList`
- `StatusBadge`
- `Avatar`
- `InfoRow`
- `Timeline`
- `Pagination`
- `SearchInput`
- `FilterBar`

### 7.3 Feedback dan overlay
- `Modal`
- `Drawer`
- `ConfirmDialog`
- `Toast`
- `Alert`
- `Skeleton`
- `Spinner`
- `EmptyState`
- `ErrorState`

### 7.4 Domain PINJAM
- `ProjectorCard`
- `ProjectorStatusBadge`
- `BookingStatusBadge`
- `LoanStatusBadge`
- `BookingSummary`
- `BookingTimeSummary`
- `BookingQRCode`
- `QRScanner`
- `ReturnInspectionForm`
- `OperatingHoursPanel`
- `ApplicationStatusBadge`
- `AuditLogTable`

Komponen domain tidak boleh menyimpan business logic kritis yang seharusnya berada di backend.

---

## 8. Spesifikasi halaman KOMTING

### 8.1 Login

Elemen:
- Email.
- Password.
- Tombol login.
- Link pengajuan pendaftaran jika relevan.
- Link lupa password bila mekanisme tersebut didukung provider autentikasi.

Perilaku:
- Tampilkan validasi field.
- Tampilkan loading saat autentikasi.
- Tampilkan pesan error aman jika kredensial salah.
- Setelah login, ambil `/me` untuk mengetahui role dan status akun.
- Jangan menentukan role hanya dari data form atau local storage.

### 8.2 Pengajuan pendaftaran komting

Elemen form:
- Nama lengkap.
- Email.
- Nomor identitas mahasiswa sesuai field final yang disepakati.
- Kelas.
- Foto identitas.
- Persetujuan/pemberitahuan privasi yang relevan.

Perilaku:
- Validasi field wajib dan file sebelum upload.
- Tampilkan pratinjau foto sebelum dikirim.
- Tampilkan progress upload.
- Setelah berhasil, tampilkan nomor/status pengajuan.
- Jangan menampilkan foto identitas ke pengguna lain.
- Jika kelas telah memiliki komting aktif, tampilkan status bahwa pengajuan diproses sebagai permintaan penggantian, sesuai respons backend.
- Jangan mengasumsikan pengajuan otomatis disetujui.

### 8.3 Status pengajuan

Tampilkan:
- Status pengajuan.
- Tanggal pengajuan.
- Informasi tindak lanjut jika tersedia.
- Alasan penolakan jika backend mengembalikannya.
- Status assignment aktif jika sudah disetujui.

### 8.4 Dashboard komting

Ringkasan yang disarankan:
- Kelas dan status assignment aktif.
- Booking aktif.
- Loan aktif.
- Booking terdekat.
- Status proyektor terkait.
- Riwayat transaksi terbaru.

Jangan membuat angka statistik dari mock atau perhitungan lokal setelah integrasi; gunakan data backend.

### 8.5 Daftar proyektor

Tampilkan per unit:
- Nama dan kode aset.
- Merek/model bila tersedia.
- Status fisik.
- Informasi bookable yang dikembalikan backend.
- Tombol lihat detail atau mulai booking jika memenuhi kondisi.

Status:
- `AVAILABLE`
- `BORROWED`
- `MAINTENANCE`
- `INACTIVE`

Status fisik dan ketersediaan booking harus dibedakan. Jangan menyimpulkan unit tidak dapat dibooking besok hanya karena sedang `BORROWED` hari ini. Gunakan endpoint availability untuk tanggal yang dipilih.

### 8.6 Form booking

Field:
- Unit proyektor.
- Tanggal booking (hari ini atau besok).
- Jam mulai.
- Estimasi kembali.

Perilaku:
- Tanggal hanya memungkinkan hari ini dan besok berdasarkan waktu `Asia/Jakarta`.
- Waktu dipilih per menit; jangan membatasi ke interval 15/30 menit.
- Estimasi kembali harus pada tanggal kalender yang sama dan setelah waktu mulai.
- Jam operasional dan aturan waktu ditampilkan dari data backend.
- Panggil availability untuk membantu pengguna, tetapi backend tetap memvalidasi ulang saat submit.
- Saat submit, tampilkan loading dan cegah double-submit.
- Kirim `Idempotency-Key`.
- Jika sukses, tampilkan konfirmasi booking dan arahkan ke detail booking.
- Jika konflik, tampilkan alasan yang berasal dari error code dan minta pengguna memuat ulang ketersediaan.

### 8.7 Daftar dan detail booking

Daftar menampilkan:
- Kode booking.
- Nama unit.
- Tanggal dan jam.
- Status.
- Aksi lihat detail.

Detail menampilkan:
- Kode booking.
- Unit.
- Jadwal.
- Estimasi kembali.
- Status.
- Jendela pickup dari backend.
- QR jika booking memenuhi syarat.
- Instruksi pickup.
- Aksi pembatalan hanya jika backend mengizinkan.

Status booking:
- `CONFIRMED`
- `FULFILLED`
- `CANCELLED`
- `EXPIRED`

QR:
- Tampilkan hanya token/payload yang diperoleh dari endpoint QR.
- Jangan memasukkan nama, NIM, email, atau data pribadi ke dalam QR.
- QR tidak berarti transaksi selesai.
- Tampilkan masa berlaku bila disediakan backend.
- Jika token kedaluwarsa, minta token baru sesuai kebijakan backend.

### 8.8 Riwayat peminjaman

Tampilkan:
- Tanggal pickup dan return.
- Unit.
- Status loan.
- Ringkasan kondisi return jika memang diizinkan untuk ditampilkan.
- Pagination/filter bila diperlukan.

---

## 9. Spesifikasi halaman STAFF

### 9.1 Dashboard STAFF

Ringkasan:
- Booking hari ini.
- Booking menunggu pickup.
- Loan aktif.
- Loan overdue.
- Unit maintenance.
- Aksi cepat scan QR.

Angka dan daftar harus berasal dari endpoint dashboard atau endpoint daftar terkait.

### 9.2 Daftar booking operasional

Fitur:
- Filter tanggal.
- Filter status.
- Pencarian kode booking/nama komting bila backend mendukung.
- Pagination.
- Akses detail.

Tampilkan informasi minimum yang diperlukan untuk operasional. Hindari menampilkan data identitas sensitif yang tidak dibutuhkan.

### 9.3 Pemindaian QR

Alur:
1. STAFF memilih aksi `PICKUP` atau `RETURN`.
2. Browser meminta izin kamera.
3. QR dipindai.
4. Frontend mengirim payload ke endpoint validasi.
5. Frontend menampilkan ringkasan transaksi dan hasil validasi.
6. STAFF memeriksa data.
7. STAFF menekan tombol konfirmasi.
8. Frontend mengirim request mutasi dengan `Idempotency-Key`.
9. Tampilkan hasil dari backend.

Ketentuan:
- Scan tidak boleh langsung mengubah transaksi.
- Sediakan input token manual sebagai fallback bila kamera tidak tersedia, bila aman dan didukung.
- Jangan menyimpan QR payload lebih lama dari kebutuhan proses.
- Tangani QR invalid, expired, action mismatch, booking tidak eligible, dan konflik status.

### 9.4 Konfirmasi pickup

Sebelum konfirmasi tampilkan:
- Kode booking.
- Nama komting dan kelas.
- Nama/kode proyektor.
- Jadwal dan hasil validasi jendela pickup.
- Pilihan penerima: komting atau perwakilan.
- Nama perwakilan jika dipilih.

Setelah berhasil:
- Tampilkan status booking `FULFILLED`.
- Tampilkan loan `ACTIVE`.
- Tampilkan status unit `BORROWED`.
- Jangan memperbarui status secara optimistis sebelum server mengonfirmasi.

### 9.5 Pengembalian dan inspeksi

Form:
- QR token/identifikasi loan.
- Dikembalikan oleh komting atau perwakilan.
- Nama perwakilan jika relevan.
- Kondisi proyektor: `NORMAL` / `DAMAGED`.
- Kondisi aksesori: `COMPLETE` / `INCOMPLETE`.
- Catatan.
- Foto bukti.

Perilaku:
- Foto wajib jika `DAMAGED` atau `INCOMPLETE`.
- Tampilkan validasi dinamis saat pilihan kondisi berubah.
- Tampilkan konfirmasi sebelum submit.
- Setelah sukses, tampilkan hasil inspeksi dan disposition unit.
- Jika `MAINTENANCE`, tampilkan informasi bahwa unit belum dapat dibooking.
- Jangan menganggap return selesai sebelum backend mengonfirmasi.

### 9.6 Maintenance

Tampilkan:
- Daftar unit maintenance.
- Alasan dan tanggal.
- Status proses.
- Catatan resolusi.

Aksi:
- Membuat catatan maintenance.
- Melihat detail.
- Menyelesaikan maintenance.
- Menyatakan unit layak digunakan jika hasil pemeriksaan mendukung.

Sebelum menyatakan unit `AVAILABLE`, tampilkan konfirmasi dan kirim aksi ke backend. Backend memeriksa loan aktif dan validitas transisi.

---

## 10. Spesifikasi halaman ADMIN

### 10.1 Dashboard ADMIN

Ringkasan yang disarankan:
- Pengajuan komting menunggu verifikasi.
- Booking hari ini.
- Loan aktif/overdue.
- Unit tersedia/dipinjam/maintenance.
- Aktivitas operasional terbaru.

### 10.2 Verifikasi komting

Daftar:
- Nama pemohon.
- Kelas.
- Waktu pengajuan.
- Status.
- Indikator pengajuan replacement jika disediakan backend.

Detail:
- Informasi pemohon yang diperlukan.
- Foto identitas melalui akses privat yang diotorisasi.
- Riwayat/status assignment kelas bila diizinkan.
- Catatan ADMIN.

Aksi:
- Setujui.
- Tolak dengan alasan wajib.
- Proses replacement sesuai keputusan ADMIN.

Konfirmasi:
- Aksi approval/rejection harus memakai dialog konfirmasi.
- Untuk replacement, jelaskan bahwa assignment lama akan dinonaktifkan dan assignment baru diaktifkan secara atomik.
- Jika komting lama tidak merespons, ADMIN dapat melanjutkan sesuai PRD dengan warning dan audit.
- Jangan membuat tombol persetujuan otomatis untuk komting lama sebelum aturan tersebut disepakati.

### 10.3 Pengelolaan assignment komting

Tampilkan:
- Nama komting.
- Kelas.
- Status assignment.
- Tanggal mulai dan berakhir.
- Riwayat assignment.

Aksi nonaktif:
- Wajib meminta alasan.
- Tampilkan peringatan bahwa booking yang belum diambil akan dibatalkan.
- Jelaskan bahwa loan aktif tetap berjalan sampai dikembalikan.
- Setelah berhasil, muat ulang data.

### 10.4 Pengelolaan STAFF

Fitur:
- Daftar akun STAFF.
- Buat akun STAFF.
- Ubah data yang diizinkan.
- Nonaktifkan akun bila endpoint mendukung.

ADMIN adalah pihak yang membuat akun STAFF secara manual. Jangan menyediakan self-registration STAFF.

### 10.5 Inventaris proyektor

Fitur:
- Daftar unit.
- Detail unit.
- Tambah/edit data inventaris.
- Nonaktifkan unit.
- Status fisik.
- Riwayat maintenance bila tersedia.

Jangan mengizinkan perubahan status yang menyalahi transaksi aktif. Backend menjadi penentu akhir.

### 10.6 Jam operasional

Tampilkan:
- Tanggal layanan.
- Jam buka.
- Jam tutup.
- Informasi pembukaan lebih awal.
- Snapshot yang berlaku untuk booking tanggal tersebut.

Saat menyimpan perubahan:
- Tampilkan ringkasan perubahan.
- Jika backend mengembalikan konflik booking, tampilkan daftar konflik.
- Jangan menganggap perubahan tersimpan bila backend menolak.
- Jangan mengubah tampilan booking historis berdasarkan konfigurasi terbaru.

### 10.7 Audit log dan koreksi

Audit log:
- Waktu.
- Aktor.
- Role.
- Aksi.
- Entitas.
- Ringkasan perubahan.
- Alasan bila ada.

Koreksi:
- Hanya tampilkan field yang memang diizinkan backend.
- Wajib meminta alasan.
- Tampilkan nilai sebelum dan sesudah.
- Konfirmasi sebelum submit.
- Jangan menyediakan penghapusan audit log.

---

## 11. State dan pola interaksi wajib

Setiap halaman data harus memiliki state berikut:
- `loading`
- `success`
- `empty`
- `error`

Setiap form harus memiliki:
- idle,
- validating,
- submitting,
- success,
- error.

Untuk aksi transaksi:
- Disable tombol saat request berjalan.
- Cegah double-click/double-submit.
- Gunakan idempotency key sesuai API Contract.
- Jangan optimistically mengubah status transaksi sebelum respons sukses.
- Jika timeout tidak diketahui apakah transaksi berhasil, fetch ulang resource sebelum pengguna mengulangi tindakan.
- Berikan pesan error yang spesifik dan tindakan pemulihan yang masuk akal.

### Konfirmasi aksi kritis
Gunakan confirmation dialog untuk:
- Membatalkan booking.
- Konfirmasi pickup.
- Konfirmasi return.
- Menyatakan unit maintenance/available.
- Menyetujui/menolak pengajuan.
- Menonaktifkan komting.
- Mengubah jam operasional.
- Koreksi transaksi.

---

## 12. Integrasi API

### 12.1 Prinsip

- Buat satu API client terpusat.
- Semua request memakai base URL dari environment.
- Token diambil dari session/provider resmi.
- Normalisasi error di satu tempat.
- Definisikan tipe TypeScript sesuai API Contract.
- Pisahkan service berdasarkan domain.
- Jangan memanggil fetch langsung tersebar di komponen halaman.
- Mock service harus memiliki signature dan response yang sama dengan service API.

### 12.2 Struktur folder yang direkomendasikan

```text
src/
  app/
    (public)/
    (komting)/
    (staff)/
    (admin)/
  components/
    ui/
    layout/
    feedback/
  features/
    auth/
    komting/
    projectors/
    bookings/
    loans/
    qr/
    maintenance/
    admin/
  lib/
    api/
      client.ts
      errors.ts
      types.ts
    auth/
    utils/
    validation/
  services/
    api/
    mock/
  hooks/
  styles/
  types/
```

Struktur dapat disesuaikan, tetapi pisahkan:
- UI components,
- domain features,
- API client,
- API services,
- mock services,
- shared types.

### 12.3 Environment variable

Contoh nama variabel (sesuaikan dengan provider yang disepakati):

```text
NEXT_PUBLIC_API_BASE_URL=
NEXT_PUBLIC_APP_NAME=PINJAM
```

Jangan pernah menaruh secret server-side atau service-role key dalam variabel `NEXT_PUBLIC_*`.

Jika frontend memakai Supabase Auth secara langsung, hanya konfigurasi publik yang memang aman untuk browser yang boleh diekspos. Operasi administratif tetap harus melalui backend/server yang terotorisasi.

### 12.4 Service domain minimum

```text
auth.service
me.service
application.service
projector.service
availability.service
booking.service
loan.service
qr.service
maintenance.service
operating-hours.service
admin.service
audit-log.service
```

### 12.5 Mock service

- Gunakan fixture data terpisah dari komponen.
- Mock harus meniru latency dan error yang realistis.
- Sediakan skenario success, empty, validation error, unauthorized, dan conflict.
- Gunakan tipe response yang sama dengan API Contract.
- Tandai mock mode secara jelas pada environment development.
- Jangan pernah mengaktifkan mock mode diam-diam di production.

---

## 13. Tipe dan enum frontend

Enum harus mengikuti API Contract. Contoh tipe inti:

```ts
type UserRole = "KOMTING" | "STAFF" | "ADMIN";

type AccountStatus =
  | "PENDING_VERIFICATION"
  | "ACTIVE"
  | "REJECTED"
  | "INACTIVE";

type ProjectorPhysicalStatus =
  | "AVAILABLE"
  | "BORROWED"
  | "MAINTENANCE"
  | "INACTIVE";

type BookingStatus =
  | "CONFIRMED"
  | "FULFILLED"
  | "CANCELLED"
  | "EXPIRED";

type LoanStatus = "ACTIVE" | "RETURNED";

type ProjectorCondition = "NORMAL" | "DAMAGED";

type AccessoriesCondition = "COMPLETE" | "INCOMPLETE";

type UnitDisposition = "AVAILABLE" | "MAINTENANCE";
```

Jangan membuat enum frontend yang bertentangan dengan backend. Jika backend mengirim nilai status baru, UI harus memiliki fallback aman seperti badge `UNKNOWN` dan logging untuk pengembang.

---

## 14. Waktu dan zona waktu

- Zona waktu bisnis: `Asia/Jakarta`.
- Timestamp API diperlakukan sebagai ISO 8601 dengan zona waktu eksplisit.
- Simpan/teruskan timestamp API apa adanya bila tidak perlu dimodifikasi.
- Render timestamp ke zona `Asia/Jakarta`.
- Tanggal booking merupakan tanggal kalender lokal `YYYY-MM-DD`.
- Jam pilihan pengguna adalah jam lokal `HH:mm:ss`.
- Jangan menggunakan timezone browser sebagai sumber aturan bisnis.
- Batas hari ini/besok harus ditentukan backend; frontend hanya membatasi pilihan untuk UX.
- Jangan menghitung ulang snapshot jam operasional historis dari konfigurasi terbaru.

---

## 15. Keamanan dan privasi UI

- Jangan menampilkan data identitas mahasiswa di halaman yang tidak memerlukannya.
- Foto identitas hanya terlihat bagi ADMIN berwenang.
- Foto bukti return hanya terlihat bagi role operasional berwenang.
- Jangan menyimpan QR token dalam analytics, log client, atau URL.
- Jangan menaruh access token di query string.
- Jangan menampilkan detail error internal server kepada pengguna.
- Jangan menaruh secret dalam source code atau bundle browser.
- Lindungi route untuk UX, tetapi otorisasi final tetap di backend.
- Logout harus membersihkan state session sesuai mekanisme provider.
- Saat akun nonaktif, tampilkan penjelasan status dan jangan menampilkan fungsi booking.

---

## 16. Testing frontend

### 16.1 Unit/component tests
- Komponen form dan validasi.
- Badge status untuk semua enum.
- Format tanggal dan waktu Jakarta.
- Error mapping.
- Role-based navigation.
- Dialog konfirmasi.
- Komponen QR dan inspeksi.

### 16.2 Integration tests
- Login dan pemuatan `/me`.
- Pendaftaran komting.
- Menampilkan status pengajuan.
- Memuat daftar proyektor.
- Availability dan submit booking.
- Detail booking dan QR.
- Validasi QR dan konfirmasi pickup.
- Form return dan upload foto.
- Maintenance.
- Approval/rejection ADMIN.

### 16.3 E2E skenario minimum
1. Pemohon mengajukan pendaftaran dan melihat status pending.
2. ADMIN menyetujui pengajuan.
3. Komting aktif login dan membuat booking.
4. Komting melihat QR booking.
5. STAFF memindai QR dan mengonfirmasi pickup.
6. Sistem menampilkan loan aktif.
7. STAFF memproses return dengan kondisi normal.
8. Sistem menampilkan loan returned dan unit available.
9. STAFF memproses return dengan kondisi rusak dan bukti foto.
10. Sistem menampilkan unit maintenance.
11. Komting mencoba booking ketika masih memiliki loan aktif dan menerima konflik.
12. Pengguna tanpa role yang sesuai tidak dapat membuka fungsi terlarang.
13. Booking besok yang unitnya tidak available saat pergantian tanggal menampilkan status pembatalan setelah backend memprosesnya.

### 16.4 Responsif dan aksesibilitas
- Uji viewport mobile, tablet, desktop.
- Uji keyboard navigation.
- Uji focus state.
- Uji label dan pesan error form.
- Uji kontras warna dan status non-warna.

---

## 17. Definition of Done frontend

Frontend dinyatakan siap untuk integrasi ketika:
- [ ] Struktur aplikasi dan routing role tersedia.
- [ ] Design system Neubrutalism diterapkan konsisten.
- [ ] Seluruh halaman prioritas KOMTING tersedia.
- [ ] Seluruh halaman prioritas STAFF tersedia.
- [ ] Seluruh halaman prioritas ADMIN tersedia.
- [ ] Seluruh halaman memiliki loading, empty, error, dan success state yang relevan.
- [ ] Form memiliki validasi dan pesan error.
- [ ] Mock service mengikuti API Contract.
- [ ] Tidak ada business rule kritis yang hanya diterapkan di frontend.
- [ ] Tidak ada secret yang terekspos.
- [ ] Tampilan responsif.
- [ ] Alur utama lulus pengujian dengan mock service.
- [ ] Integrasi dapat dilakukan dengan mengganti implementasi service, bukan menulis ulang halaman.
- [ ] Laporan implementasi dan `PROJECT_CONTEXT.md` diperbarui.

---

## 18. Urutan implementasi frontend

Kerjakan secara bertahap. Jangan membangun semua halaman sekaligus dalam satu prompt besar.

### Sprint FE-0 — Fondasi
- Setup project.
- Konfigurasi lint, format, TypeScript.
- Struktur folder.
- Design tokens.
- Komponen UI dasar.
- App shell dan responsive navigation.
- API client interface dan mock adapter.
- `PROJECT_CONTEXT.md`.

### Sprint FE-1 — Auth dan KOMTING
- Login/session.
- `/me` dan role routing.
- Form pendaftaran.
- Status pengajuan.
- Dashboard komting.
- Daftar proyektor.

### Sprint FE-2 — Booking
- Availability.
- Form booking.
- Daftar/detail booking.
- QR booking.
- Riwayat loan.

### Sprint FE-3 — STAFF operasional
- Dashboard STAFF.
- Daftar/detail booking.
- QR scanner.
- Validasi dan konfirmasi pickup.
- Return inspection dan upload bukti.
- Daftar loan.

### Sprint FE-4 — ADMIN
- Dashboard ADMIN.
- Verifikasi komting.
- Replacement/deactivation UI.
- Pengelolaan STAFF.
- Inventaris proyektor.
- Jam operasional.
- Audit log dan koreksi sesuai endpoint final.

### Sprint FE-5 — Hardening
- Responsive refinement.
- Accessibility.
- Error/empty/loading states.
- Unit/integration/E2E tests.
- Integrasi API nyata per domain.
- Regression test.

---

## 19. Format laporan wajib dari Antigravity

Setelah menyelesaikan setiap prompt/sprint, Antigravity wajib memberikan laporan:

1. **Ringkasan:** apa yang selesai dan belum.
2. **File dibuat:** daftar path dan tujuan.
3. **File diubah:** daftar path dan perubahan.
4. **Halaman/fitur:** status implementasi per fitur.
5. **Arsitektur saat ini:** routing, state management, API layer, mock layer, komponen utama.
6. **Kontrak API:** endpoint/field yang digunakan dan ketidaksesuaian jika ada.
7. **Testing:** perintah yang dijalankan, hasil, dan test yang belum dilakukan.
8. **Known issues:** bug, risiko, placeholder, dan keputusan terbuka.
9. **Langkah berikutnya:** pekerjaan terkecil yang masuk akal.
10. **PROJECT_CONTEXT.md:** pastikan file konteks diperbarui dengan kondisi aktual.

Jangan melakukan audit ulang seluruh repository pada setiap sprint. Baca `PROJECT_CONTEXT.md` dan laporan terakhir, lalu periksa hanya file yang relevan dengan tugas berikutnya dan perubahan sejak laporan terakhir. Jangan mengklaim test lulus jika tidak benar-benar dijalankan.

---

## 20. Batasan dan hal yang harus dikonfirmasi

Dokumen ini tidak menetapkan hal-hal yang belum diputuskan di PRD/API Contract, antara lain:
- Provider autentikasi final.
- Detail field identitas mahasiswa final.
- Mekanisme respons komting lama dan tenggat replacement.
- Batas pembatalan booking oleh komting.
- Kebijakan ukuran/retensi file.
- Detail waktu reminder email.
- Daftar field koreksi ADMIN.
- Apakah inbox notifikasi internal diperlukan.

Antigravity harus menandai kebutuhan tersebut sebagai `OPEN DECISION`, bukan mengarang implementasi.

---

## 21. Definition of Done dokumen

Dokumen ini siap menjadi panduan prompt frontend ketika:
- [ ] Frontend Lead menyetujui cakupan route dan halaman.
- [ ] Design direction Neubrutalism disepakati.
- [ ] API Contract menjadi acuan tipe data dan endpoint.
- [ ] Open decisions yang memengaruhi UI sudah ditandai.
- [ ] Sprint FE-0 dapat dimulai tanpa menunggu backend.
