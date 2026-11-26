# API CONTRACT — PINJAM

**Versi:** 1.0.0  
**Status:** Draft untuk disepakati Frontend dan Backend  
**Tanggal:** 26 November 2026  
**Acuan utama:** `PRD_PINJAM_FINAL.md`  
**Tujuan:** Menjadi kesepakatan teknis tunggal antara pengembangan frontend dan backend PINJAM.

---

## 1. Tujuan dan aturan penggunaan dokumen

Dokumen ini menetapkan bentuk komunikasi antara frontend dan backend: endpoint, metode HTTP, autentikasi, role, request, response, status, format error, upload, QR, dan aturan integrasi.

Kedua pengembang wajib menggunakan kontrak ini sebagai acuan bersama. Jika implementasi membutuhkan perubahan kontrak:

1. Diskusikan perubahan sebelum mengubah endpoint atau bentuk data.
2. Perbarui dokumen ini terlebih dahulu.
3. Pastikan perubahan tidak bertentangan dengan PRD.
4. Beri tahu pihak frontend/backend dan catat perubahan pada bagian riwayat versi.

**Prinsip penting:** frontend mengatur tampilan dan interaksi; backend menjadi sumber kebenaran untuk autentikasi, otorisasi, validasi, status transaksi, ketersediaan unit, dan seluruh business rule.

> Catatan: endpoint dan nama field di dokumen ini merupakan rancangan kontrak teknis yang diturunkan dari PRD. Detail implementasi internal boleh berbeda selama request dan response eksternal tetap sesuai kontrak.

---

## 2. Konvensi API

### 2.1 Base URL dan versi

Semua endpoint menggunakan prefix versi:

```text
/api/v1
```

Base URL per environment ditentukan saat setup deployment, bukan ditanam langsung di source code frontend.

Contoh:

```text
Development: <API_BASE_URL>/api/v1
Production:  <API_BASE_URL>/api/v1
```

Frontend wajib membaca base URL dari environment variable.

### 2.2 Format umum

- Request dan response menggunakan JSON, kecuali endpoint upload file.
- Encoding: UTF-8.
- Nama field menggunakan `snake_case`.
- Identifier menggunakan string UUID atau identifier opaque yang ditetapkan backend. Frontend tidak boleh mengasumsikan format internal ID.
- Tanggal kalender menggunakan `YYYY-MM-DD`.
- Waktu lokal untuk pilihan jam menggunakan `HH:mm:ss`.
- Timestamp kejadian menggunakan ISO 8601 UTC, misalnya `2026-11-27T02:00:00Z`.
- Zona waktu operasional aplikasi: `Asia/Jakarta`.
- Nilai uang tidak digunakan dalam kontrak versi ini karena PRD tidak menetapkan denda atau pembayaran.
- Field yang tidak tersedia dikirim sebagai `null`, bukan string kosong, kecuali dinyatakan lain.

### 2.3 Format response sukses

Response tunggal:

```json
{
  "data": {
    "id": "opaque-id",
    "name": "Example"
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Response daftar:

```json
{
  "data": [
    {
      "id": "opaque-id",
      "name": "Example"
    }
  ],
  "meta": {
    "request_id": "req_opaque",
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total_items": 42,
      "total_pages": 3
    }
  }
}
```

Response aksi tanpa payload khusus:

```json
{
  "data": {
    "success": true
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

### 2.4 Format response error

Semua error API menggunakan bentuk konsisten:

```json
{
  "error": {
    "code": "BOOKING_TIME_INVALID",
    "message": "Waktu booking tidak valid.",
    "details": [
      {
        "field": "estimated_return_at",
        "reason": "MUST_BE_AFTER_START"
      }
    ]
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Frontend sebaiknya menggunakan `error.code` untuk menentukan perilaku UI. Jangan bergantung pada teks `message` karena pesan dapat diperbarui atau diterjemahkan.

### 2.5 HTTP status yang digunakan

| HTTP | Penggunaan |
|---|---|
| `200` | Request berhasil |
| `201` | Resource berhasil dibuat |
| `202` | Permintaan diterima untuk diproses secara asynchronous |
| `204` | Berhasil tanpa response body |
| `400` | Request tidak valid secara struktur |
| `401` | Belum login atau token tidak valid |
| `403` | Login valid tetapi role tidak memiliki izin |
| `404` | Resource tidak ditemukan atau tidak dapat diakses |
| `409` | Konflik status, jadwal, atau aturan bisnis |
| `422` | Field valid secara struktur tetapi gagal validasi bisnis |
| `429` | Terlalu banyak request |
| `500` | Kesalahan internal server |

### 2.6 Pagination, filter, dan sorting

Endpoint daftar menggunakan query berikut jika relevan:

```text
?page=1&page_size=20&sort_by=created_at&sort_order=desc
```

Ketentuan:
- Default `page=1`.
- Default `page_size=20`.
- Backend menetapkan batas maksimum `page_size`.
- Filter spesifik endpoint dijelaskan pada endpoint terkait.
- Backend harus memvalidasi `sort_by` agar tidak menerima kolom arbitrer.

---

## 3. Autentikasi dan otorisasi

### 3.1 Mekanisme autentikasi

Kontrak ini tidak mengunci implementasi provider autentikasi. Jika menggunakan Supabase Auth, token access dari provider dikirim melalui header:

```http
Authorization: Bearer <access_token>
```

Frontend tidak boleh menentukan role hanya berdasarkan data lokal atau nilai yang dapat diubah pengguna. Role dan status akun harus diverifikasi backend pada setiap request terlindungi.

### 3.2 Role

| Role | Hak akses ringkas |
|---|---|
| `KOMTING` | Mengelola profil terbatas, mengajukan/menjalankan booking miliknya, melihat riwayat miliknya |
| `STAFF` | Operasional pickup, return, inspeksi, dan maintenance |
| `ADMIN` | Seluruh hak STAFF ditambah verifikasi komting, pengelolaan akun STAFF, konfigurasi, koreksi transaksi, dan administrasi |

### 3.3 Status akun

Nilai status akun yang disarankan:

- `PENDING_VERIFICATION`
- `ACTIVE`
- `REJECTED`
- `INACTIVE`

Backend wajib menolak akses fitur komting bagi akun yang belum `ACTIVE` atau sudah `INACTIVE`.

### 3.4 Matriks akses

| Area | KOMTING | STAFF | ADMIN |
|---|:---:|:---:|:---:|
| Melihat profil sendiri | ✓ | ✓ | ✓ |
| Mengajukan pendaftaran komting | ✓ | — | — |
| Melihat booking sendiri | ✓ | — | — |
| Membuat booking | ✓ | — | — |
| Membatalkan booking sendiri | Sesuai aturan/status | — | — |
| Melihat daftar booking operasional | — | ✓ | ✓ |
| Memproses pickup | — | ✓ | ✓ |
| Memproses return dan inspeksi | — | ✓ | ✓ |
| Mengelola status maintenance | — | ✓ | ✓ |
| Memverifikasi pendaftaran komting | — | — | ✓ |
| Mengelola akun STAFF | — | — | ✓ |
| Mengelola unit proyektor | — | Operasional terbatas | ✓ |
| Mengubah konfigurasi operasional | — | — | ✓ |
| Koreksi transaksi dengan alasan dan audit | — | — | ✓ |
| Melihat audit log | — | Sesuai kebutuhan operasional | ✓ |

Backend boleh mempersempit akses data sesuai kebutuhan operasional, tetapi tidak boleh memperluas izin di luar PRD tanpa persetujuan.

---

## 4. Model data publik yang digunakan API

Bentuk berikut adalah representasi API, bukan keharusan struktur tabel database.

### 4.1 User

```json
{
  "id": "user_opaque",
  "email": "user@example.com",
  "full_name": "Nama Pengguna",
  "role": "KOMTING",
  "account_status": "ACTIVE",
  "created_at": "2026-11-26T10:00:00Z"
}
```

Data sensitif seperti password hash, token internal, dan lokasi penyimpanan privat tidak boleh dikirim dalam response umum.

### 4.2 Komting assignment

```json
{
  "id": "assignment_opaque",
  "user_id": "user_opaque",
  "class_name": "IF-01",
  "status": "ACTIVE",
  "started_at": "2026-11-26T10:00:00Z",
  "ended_at": null
}
```

Riwayat assignment lama dipertahankan. Hanya satu assignment aktif untuk satu kelas dan satu assignment aktif untuk satu mahasiswa.

### 4.3 Projector

```json
{
  "id": "projector_opaque",
  "asset_code": "PRJ-001",
  "name": "Epson EB-X500",
  "brand": "Epson",
  "model": "EB-X500",
  "physical_status": "AVAILABLE",
  "is_active": true
}
```

`physical_status` adalah kondisi fisik unit, bukan status booking.

Nilai `physical_status`:
- `AVAILABLE`
- `BORROWED`
- `MAINTENANCE`
- `INACTIVE`

### 4.4 Booking

```json
{
  "id": "booking_opaque",
  "booking_code": "BKG-20261127-001",
  "komting_id": "user_opaque",
  "projector_id": "projector_opaque",
  "booking_date": "2026-11-27",
  "start_time": "09:00:00",
  "estimated_return_at": "2026-11-27T04:00:00Z",
  "status": "CONFIRMED",
  "pickup_window": {
    "opens_at": "2026-11-27T01:30:00Z",
    "closes_at": "2026-11-27T02:15:00Z"
  },
  "created_at": "2026-11-26T10:00:00Z"
}
```

Status booking:
- `CONFIRMED`
- `FULFILLED`
- `CANCELLED`
- `EXPIRED`

`FULFILLED` berarti booking telah diambil dan transaksi loan dibuat. Status peminjaman aktif selanjutnya direpresentasikan oleh resource loan.

### 4.5 Loan

```json
{
  "id": "loan_opaque",
  "booking_id": "booking_opaque",
  "projector_id": "projector_opaque",
  "komting_id": "user_opaque",
  "status": "ACTIVE",
  "picked_up_at": "2026-11-27T02:00:00Z",
  "returned_at": null,
  "return_condition": null
}
```

Status loan:
- `ACTIVE`
- `RETURNED`

### 4.6 Return inspection

```json
{
  "projector_condition": "NORMAL",
  "accessories_condition": "COMPLETE",
  "note": null,
  "photo_url": null,
  "unit_disposition": "AVAILABLE"
}
```

Nilai:
- `projector_condition`: `NORMAL` atau `DAMAGED`
- `accessories_condition`: `COMPLETE` atau `INCOMPLETE`
- `unit_disposition`: `AVAILABLE` atau `MAINTENANCE`

Foto wajib jika proyektor rusak atau aksesori tidak lengkap. URL foto harus berupa URL akses terbatas/bertanda tangan jika file disimpan privat.

### 4.7 Operating hours snapshot

```json
{
  "service_date": "2026-11-27",
  "timezone": "Asia/Jakarta",
  "opens_at": "08:00:00",
  "closes_at": "17:00:00",
  "configured_open_at": "08:00:00",
  "early_pickup_allowed_at": "07:45:00"
}
```

Snapshot jam operasional melekat pada tanggal booking agar perubahan konfigurasi berikutnya tidak mengubah interpretasi booking lama.

---

## 5. Endpoint — Authentication dan current user

### 5.1 Mendapatkan pengguna saat ini

```http
GET /api/v1/me
Authorization: Bearer <access_token>
```

Response `200`:

```json
{
  "data": {
    "id": "user_opaque",
    "email": "user@example.com",
    "full_name": "Nama Pengguna",
    "role": "KOMTING",
    "account_status": "ACTIVE",
    "komting_assignment": {
      "id": "assignment_opaque",
      "class_name": "IF-01",
      "status": "ACTIVE"
    }
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

### 5.2 Memperbarui profil terbatas

```http
PATCH /api/v1/me
```

Request:

```json
{
  "full_name": "Nama Baru"
}
```

Hanya field profil yang memang boleh diubah pengguna yang diterima. Role, account status, dan assignment tidak boleh diubah melalui endpoint ini.

### 5.3 Logout

Jika provider autentikasi menangani logout secara langsung di client, endpoint ini tidak diperlukan. Jika backend mengelola sesi, implementasi logout mengikuti mekanisme provider. Kedua pihak harus menyepakati mekanismenya saat setup autentikasi.

---

## 6. Endpoint — Pendaftaran dan verifikasi komting

### 6.1 Mengajukan pendaftaran

```http
POST /api/v1/komting/applications
Content-Type: multipart/form-data
```

Field:
- `full_name`
- `email`
- `student_id`
- `class_name`
- `identity_photo` — file gambar

Response `201`:

```json
{
  "data": {
    "application_id": "application_opaque",
    "status": "PENDING_VERIFICATION",
    "submitted_at": "2026-11-26T10:00:00Z"
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Aturan:
- Pendaftaran diproses sebagai pengajuan, bukan langsung mengaktifkan role komting.
- Hanya ADMIN yang dapat menyetujui atau menolak.
- Jika kelas sudah memiliki komting aktif, pengajuan diklasifikasikan sebagai permintaan penggantian.
- Satu mahasiswa tidak boleh memiliki lebih dari satu penugasan komting aktif.
- Mahasiswa yang pernah nonaktif boleh mengajukan kembali.
- Foto identitas disimpan privat dan tetap tersedia setelah verifikasi; akses dibatasi untuk petugas ADMIN yang berwenang.
- Tidak ada face recognition.

### 6.2 Melihat status pengajuan sendiri

```http
GET /api/v1/komting/applications/me
```

### 6.3 Daftar pengajuan untuk ADMIN

```http
GET /api/v1/admin/komting/applications?status=PENDING_VERIFICATION&page=1&page_size=20
```

Response item dapat mencakup informasi pengajuan dan metadata foto, tetapi file foto hanya boleh diakses melalui mekanisme privat yang diotorisasi.

### 6.4 Detail pengajuan

```http
GET /api/v1/admin/komting/applications/{application_id}
```

### 6.5 Menyetujui pengajuan

```http
POST /api/v1/admin/komting/applications/{application_id}/approve
```

Request:

```json
{
  "admin_note": "Dokumen telah diverifikasi."
}
```

Response `200`:

```json
{
  "data": {
    "application_id": "application_opaque",
    "status": "APPROVED",
    "assignment": {
      "id": "assignment_opaque",
      "status": "ACTIVE",
      "class_name": "IF-01"
    }
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

### 6.6 Menolak pengajuan

```http
POST /api/v1/admin/komting/applications/{application_id}/reject
```

Request:

```json
{
  "reason": "Dokumen tidak sesuai."
}
```

Penolakan harus menyimpan alasan dan mengirim pemberitahuan kepada pemohon.

### 6.7 Mengelola pergantian komting

```http
POST /api/v1/admin/komting/applications/{application_id}/approve-replacement
```

Request:

```json
{
  "admin_note": "Pergantian disetujui."
}
```

Aturan:
- Pengajuan pengganti tidak langsung menonaktifkan komting lama sebelum pergantian dapat diselesaikan.
- Jika pengajuan ditolak, komting lama tetap aktif.
- Jika disetujui, pergantian assignment dilakukan secara atomik: assignment lama nonaktif dan assignment baru aktif.
- Sistem mengirim email singkat kepada komting lama.
- ADMIN dapat melanjutkan pergantian jika komting lama tidak merespons, dengan peringatan dan audit.
- Backend harus mencegah dua assignment aktif untuk kelas yang sama.

**Catatan kontrak:** mekanisme respons komting lama (misalnya konfirmasi atau batas waktu) belum ditetapkan secara rinci di PRD. Backend dan frontend tidak boleh mengarang alur persetujuan mandiri; keputusan final berada pada ADMIN. Detail UI dan tenggat perlu dipastikan sebelum fitur ini diimplementasikan.

### 6.8 Menonaktifkan komting

```http
POST /api/v1/admin/komting/assignments/{assignment_id}/deactivate
```

Request:

```json
{
  "reason": "Pergantian pengurus kelas."
}
```

Aturan:
- Booking yang belum diambil dibatalkan.
- Loan aktif tetap berjalan sampai pengembalian normal.
- Komting yang nonaktif tidak dapat membuat booking.
- Semua pembatalan dan perubahan dicatat di audit log.

---

## 7. Endpoint — Dashboard dan data referensi

### 7.1 Dashboard komting

```http
GET /api/v1/komting/dashboard
```

Dapat mengembalikan ringkasan:
- assignment aktif dan kelas,
- booking aktif,
- loan aktif,
- riwayat terbaru,
- status atau pengingat yang relevan.

### 7.2 Daftar proyektor

```http
GET /api/v1/projectors?physical_status=AVAILABLE&page=1&page_size=20
```

KOMTING hanya menerima data yang aman untuk ditampilkan. STAFF dan ADMIN dapat menerima detail operasional sesuai hak akses.

### 7.3 Detail proyektor

```http
GET /api/v1/projectors/{projector_id}
```

### 7.4 Dashboard operasional STAFF/ADMIN

```http
GET /api/v1/staff/dashboard
```

Ringkasan dapat mencakup booking hari ini, pickup yang menunggu, loan aktif, keterlambatan, dan unit maintenance.

---

## 8. Endpoint — Booking

### 8.1 Memeriksa ketersediaan

```http
GET /api/v1/availability?projector_id=projector_opaque&date=2026-11-27
```

Response `200`:

```json
{
  "data": {
    "projector_id": "projector_opaque",
    "date": "2026-11-27",
    "is_bookable": true,
    "physical_status": "AVAILABLE",
    "operating_hours": {
      "opens_at": "08:00:00",
      "closes_at": "17:00:00",
      "early_pickup_allowed_at": "07:45:00"
    },
    "message": null
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Pemeriksaan ketersediaan hanya informasi awal. Backend wajib memvalidasi ulang seluruh kondisi saat booking dibuat karena kondisi dapat berubah setelah pengecekan.

### 8.2 Membuat booking

```http
POST /api/v1/bookings
Idempotency-Key: <unique-client-generated-key>
```

Request:

```json
{
  "projector_id": "projector_opaque",
  "booking_date": "2026-11-27",
  "start_time": "09:00:00",
  "estimated_return_at": "2026-11-27T04:00:00Z"
}
```

Response `201`:

```json
{
  "data": {
    "id": "booking_opaque",
    "booking_code": "BKG-20261127-001",
    "status": "CONFIRMED",
    "projector_id": "projector_opaque",
    "booking_date": "2026-11-27",
    "start_time": "09:00:00",
    "estimated_return_at": "2026-11-27T04:00:00Z",
    "pickup_window": {
      "opens_at": "2026-11-27T01:30:00Z",
      "closes_at": "2026-11-27T02:15:00Z"
    }
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Aturan wajib backend:
1. Hanya komting berstatus aktif yang dapat booking.
2. Booking hanya untuk hari ini atau besok berdasarkan `Asia/Jakarta`.
3. Waktu lampau ditolak.
4. Waktu mulai dan estimasi kembali dapat dipilih per menit, tidak dibatasi interval tetap.
5. Estimasi kembali harus setelah waktu mulai, pada tanggal kalender yang sama, dan dalam jam operasional.
6. Satu komting hanya boleh memiliki satu booking aktif dan satu loan aktif pada satu waktu.
7. Booking otomatis berstatus `CONFIRMED` jika seluruh validasi berhasil.
8. Ketersediaan unit diperiksa dan dikunci secara transaksional saat pembuatan booking.
9. Booking besok boleh dibuat meskipun unit masih dipinjam hari ini, karena merupakan tanggal kalender berbeda.
10. Pada pukul 00:00 `Asia/Jakarta` saat tanggal booking dimulai, jika unit secara fisik belum `AVAILABLE`, booking terkait dibatalkan otomatis dan komting diberi email.
11. Status fisik unit `BORROWED` tidak berubah menjadi `AVAILABLE` hanya karena estimasi kembali terlewati.

### 8.3 Daftar booking milik komting

```http
GET /api/v1/komting/bookings?status=CONFIRMED&page=1&page_size=20
```

### 8.4 Detail booking milik komting

```http
GET /api/v1/komting/bookings/{booking_id}
```

### 8.5 Membatalkan booking

```http
POST /api/v1/komting/bookings/{booking_id}/cancel
```

Request:

```json
{
  "reason": "Rencana peminjaman dibatalkan."
}
```

Backend memvalidasi apakah status booking masih dapat dibatalkan. Aturan pembatalan oleh komting harus mengikuti PRD dan tidak boleh mengubah booking yang sudah `FULFILLED` menjadi pembatalan; transaksi yang sudah diambil harus diselesaikan melalui return.

### 8.6 Daftar booking operasional

```http
GET /api/v1/staff/bookings?date=2026-11-27&status=CONFIRMED&page=1&page_size=20
```

### 8.7 Detail booking operasional

```http
GET /api/v1/staff/bookings/{booking_id}
```

---

## 9. Endpoint — Pickup dan QR

### 9.1 Membuat atau mengambil QR token booking

```http
GET /api/v1/komting/bookings/{booking_id}/qr
```

Response `200`:

```json
{
  "data": {
    "qr_payload": "opaque-random-token",
    "expires_at": "2026-11-27T02:15:00Z"
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Ketentuan:
- QR berisi token opaque, bukan PII atau data sensitif.
- Token harus sulit ditebak, divalidasi server, dan memiliki masa berlaku sesuai kebutuhan booking.
- QR yang ditampilkan frontend tidak boleh menjadi bukti final bahwa pickup/return berhasil.

### 9.2 Memvalidasi hasil scan QR

```http
POST /api/v1/staff/qr/validate
```

Request:

```json
{
  "qr_payload": "opaque-random-token",
  "action": "PICKUP"
}
```

`action`: `PICKUP` atau `RETURN`.

Response `200`:

```json
{
  "data": {
    "valid": true,
    "action": "PICKUP",
    "transaction": {
      "booking_id": "booking_opaque",
      "booking_code": "BKG-20261127-001",
      "komting_name": "Nama Komting",
      "class_name": "IF-01",
      "projector_name": "Epson EB-X500",
      "status": "CONFIRMED"
    },
    "requires_confirmation": true
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Validasi QR tidak mengubah status transaksi.

### 9.3 Konfirmasi pickup

```http
POST /api/v1/staff/bookings/{booking_id}/pickup
Idempotency-Key: <unique-client-generated-key>
```

Request:

```json
{
  "qr_payload": "opaque-random-token",
  "confirmed": true,
  "received_by": "KOMTING",
  "representative_name": null,
  "note": null
}
```

Jika diambil oleh perwakilan:

```json
{
  "qr_payload": "opaque-random-token",
  "confirmed": true,
  "received_by": "REPRESENTATIVE",
  "representative_name": "Nama Perwakilan",
  "note": null
}
```

Response `200`:

```json
{
  "data": {
    "booking": {
      "id": "booking_opaque",
      "status": "FULFILLED"
    },
    "loan": {
      "id": "loan_opaque",
      "status": "ACTIVE",
      "picked_up_at": "2026-11-27T02:00:00Z"
    },
    "projector": {
      "id": "projector_opaque",
      "physical_status": "BORROWED"
    }
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Aturan:
- Pickup hanya dapat dilakukan pada rentang waktu yang diizinkan: 30 menit sebelum waktu mulai sampai 15 menit setelah waktu mulai.
- Batas paling awal adalah waktu yang lebih akhir antara jam layanan yang berlaku dan waktu mulai booking dikurangi 30 menit.
- Jam operasional standar dimulai pukul 08:00; sistem mengizinkan pickup mulai 07:45 tanpa konfirmasi ADMIN.
- Jika ADMIN membuka lebih awal, misalnya 07:00, pickup paling awal adalah 07:30.
- Jika belum diambil sampai 15 menit setelah waktu mulai, booking menjadi `EXPIRED`.
- Scan QR saja tidak mengonfirmasi pickup.
- Konfirmasi pickup harus atomik: booking menjadi `FULFILLED`, loan dibuat `ACTIVE`, dan unit menjadi `BORROWED`.
- Backend wajib mencegah pickup ganda.

---

## 10. Endpoint — Loan dan pengembalian

### 10.1 Daftar loan aktif untuk operasional

```http
GET /api/v1/staff/loans?status=ACTIVE&page=1&page_size=20
```

### 10.2 Detail loan

```http
GET /api/v1/staff/loans/{loan_id}
```

### 10.3 Konfirmasi pengembalian

```http
POST /api/v1/staff/loans/{loan_id}/return
Idempotency-Key: <unique-client-generated-key>
Content-Type: multipart/form-data
```

Field:
- `qr_payload`
- `confirmed=true`
- `returned_by` — `KOMTING` atau `REPRESENTATIVE`
- `representative_name` — wajib jika `returned_by=REPRESENTATIVE`
- `projector_condition` — `NORMAL` atau `DAMAGED`
- `accessories_condition` — `COMPLETE` atau `INCOMPLETE`
- `note` — opsional
- `evidence_photo` — wajib jika kondisi rusak atau aksesori tidak lengkap

Response `200`:

```json
{
  "data": {
    "loan": {
      "id": "loan_opaque",
      "status": "RETURNED",
      "returned_at": "2026-11-27T04:00:00Z"
    },
    "inspection": {
      "projector_condition": "NORMAL",
      "accessories_condition": "COMPLETE",
      "unit_disposition": "AVAILABLE"
    },
    "projector": {
      "id": "projector_opaque",
      "physical_status": "AVAILABLE"
    }
  },
  "meta": {
    "request_id": "req_opaque"
  }
}
```

Aturan:
- Pengembalian dapat dilakukan komting atau perwakilan.
- STAFF/ADMIN memeriksa kondisi proyektor dan kelengkapan aksesori.
- Foto wajib jika proyektor rusak atau aksesori tidak lengkap.
- STAFF/ADMIN menentukan apakah unit masih layak digunakan.
- Loan ditutup setelah return dikonfirmasi.
- Unit menjadi `AVAILABLE` jika layak; selain itu `MAINTENANCE`.
- Pengembalian lebih awal diperbolehkan. Jika unit baik, unit tersedia kembali segera tanpa buffer.
- Kerusakan atau aksesori hilang tidak otomatis memblokir komting.
- Tidak ada denda atau sanksi akademik otomatis.

### 10.4 Riwayat loan milik komting

```http
GET /api/v1/komting/loans?status=RETURNED&page=1&page_size=20
```

---

## 11. Endpoint — Maintenance dan pengelolaan unit

### 11.1 Daftar maintenance

```http
GET /api/v1/staff/maintenance?status=IN_PROGRESS&page=1&page_size=20
```

### 11.2 Membuat catatan maintenance

```http
POST /api/v1/staff/projectors/{projector_id}/maintenance
```

Request:

```json
{
  "reason": "Lampu proyektor bermasalah.",
  "note": "Perlu pemeriksaan teknisi."
}
```

Aksi ini mengubah status fisik unit menjadi `MAINTENANCE`. Booking yang terdampak dibatalkan dan komting diberi email sesuai aturan PRD.

### 11.3 Menyelesaikan maintenance dan menyatakan unit layak

```http
POST /api/v1/staff/maintenance/{maintenance_id}/complete
```

Request:

```json
{
  "resolution_note": "Unit telah diperiksa dan dapat digunakan kembali.",
  "set_projector_available": true
}
```

Hanya STAFF/ADMIN yang berwenang dapat menyatakan unit layak digunakan. Backend harus memastikan unit tidak sedang memiliki loan aktif sebelum mengubahnya menjadi `AVAILABLE`.

### 11.4 Pengelolaan unit oleh ADMIN

```http
POST /api/v1/admin/projectors
PATCH /api/v1/admin/projectors/{projector_id}
POST /api/v1/admin/projectors/{projector_id}/deactivate
```

Field dan aturan perubahan harus dibatasi pada data inventaris yang diizinkan. Perubahan status fisik tidak boleh melewati validasi transaksi aktif.

---

## 12. Endpoint — Jam operasional

### 12.1 Melihat konfigurasi jam operasional

```http
GET /api/v1/operating-hours?date=2026-11-27
```

### 12.2 Mengubah jam operasional

```http
PUT /api/v1/admin/operating-hours/{date}
```

Request:

```json
{
  "opens_at": "08:00:00",
  "closes_at": "17:00:00",
  "admin_early_open_at": null,
  "note": "Jam operasional reguler."
}
```

Aturan:
- ADMIN menentukan jam tutup.
- Sistem menggunakan timezone `Asia/Jakarta`.
- Perubahan jam operasional harus memvalidasi booking aktif yang terdampak.
- Backend harus menyimpan snapshot jam operasional pada booking/tanggal layanan.
- Mengubah konfigurasi hari lain atau konfigurasi mendatang tidak boleh mengubah interpretasi booking historis.
- Jika perubahan menyebabkan booking tidak valid, backend harus mengembalikan konflik dan detail booking terdampak; jangan membatalkan diam-diam.

---

## 13. Endpoint — Audit log dan koreksi transaksi

### 13.1 Daftar audit log

```http
GET /api/v1/admin/audit-logs?entity_type=BOOKING&entity_id=booking_opaque&page=1&page_size=20
```

### 13.2 Detail audit log

```http
GET /api/v1/admin/audit-logs/{audit_log_id}
```

Audit log minimal mencatat:
- aktor dan role,
- aksi,
- jenis dan ID entitas,
- nilai sebelum dan sesudah jika relevan,
- alasan untuk koreksi manual,
- timestamp UTC,
- request ID.

Audit log tidak boleh dapat dihapus melalui API operasional.

### 13.3 Koreksi transaksi oleh ADMIN

```http
POST /api/v1/admin/transactions/{transaction_id}/corrections
```

Request:

```json
{
  "reason": "Koreksi akibat kesalahan input operasional.",
  "correction": {
    "field": "example_field",
    "new_value": "example_value"
  }
}
```

Endpoint ini adalah kerangka kontrak. Daftar field yang boleh dikoreksi harus ditentukan secara eksplisit oleh backend dan disetujui berdasarkan PRD. Koreksi harus menyimpan nilai sebelum/sesudah dan alasan; tidak boleh menjadi jalur untuk melewati aturan bisnis.

---

## 14. Endpoint — Notifikasi

### 14.1 Daftar notifikasi pengguna

Jika UI membutuhkan inbox notifikasi, gunakan:

```http
GET /api/v1/me/notifications?page=1&page_size=20
```

### 14.2 Menandai notifikasi dibaca

```http
POST /api/v1/me/notifications/{notification_id}/read
```

PRD menetapkan email sebagai kanal notifikasi. Inbox notifikasi dalam aplikasi ini merupakan opsi implementasi dan perlu dikonfirmasi sebelum dibangun; jangan menganggapnya wajib hanya dari kontrak ini.

### 14.3 Email

Pengiriman email dilakukan backend melalui mekanisme asynchronous/outbox. Frontend tidak memanggil provider email secara langsung.

Peristiwa email yang harus didukung:
- verifikasi email,
- pengajuan diterima,
- pengajuan disetujui/ditolak,
- pemberitahuan pergantian komting,
- pergantian selesai,
- booking berhasil/dibatalkan/kedaluwarsa,
- pengingat pickup,
- estimasi kembali terlewati/overdue,
- pengembalian selesai,
- pembatalan karena unit tidak tersedia pada tengah malam,
- pembatalan akibat maintenance.

Penerima email bisnis adalah komting terkait. Email lama komting pada proses pergantian bersifat singkat.

Kegagalan email tidak boleh membatalkan transaksi bisnis. Backend harus melakukan retry dengan deduplikasi.

---

## 15. Error code bisnis

Daftar awal yang disarankan:

| Error code | HTTP | Arti |
|---|---:|---|
| `AUTH_REQUIRED` | 401 | Token tidak tersedia/tidak valid |
| `FORBIDDEN` | 403 | Role tidak diizinkan |
| `ACCOUNT_NOT_ACTIVE` | 403 | Akun komting tidak aktif |
| `KOMTING_ASSIGNMENT_REQUIRED` | 403 | Tidak memiliki assignment komting aktif |
| `APPLICATION_ALREADY_EXISTS` | 409 | Pengajuan aktif sudah ada |
| `CLASS_ALREADY_HAS_ACTIVE_KOMTING` | 409 | Kelas sudah memiliki komting aktif |
| `STUDENT_ALREADY_HAS_ACTIVE_ASSIGNMENT` | 409 | Mahasiswa sudah memiliki assignment aktif |
| `PROJECTOR_NOT_FOUND` | 404 | Unit tidak ditemukan |
| `PROJECTOR_NOT_BOOKABLE` | 409 | Unit tidak dapat dibooking |
| `BOOKING_DATE_INVALID` | 422 | Tanggal bukan hari ini/besok |
| `BOOKING_TIME_IN_PAST` | 422 | Waktu booking sudah lewat |
| `BOOKING_TIME_INVALID` | 422 | Rentang waktu tidak valid |
| `BOOKING_OUTSIDE_OPERATING_HOURS` | 422 | Di luar jam operasional |
| `ACTIVE_BOOKING_EXISTS` | 409 | Komting sudah punya booking aktif |
| `ACTIVE_LOAN_EXISTS` | 409 | Komting masih memiliki loan aktif |
| `BOOKING_CONFLICT` | 409 | Unit tidak tersedia untuk tanggal tersebut |
| `BOOKING_NOT_PICKUP_ELIGIBLE` | 409 | Di luar jendela pickup |
| `BOOKING_EXPIRED` | 409 | Booking sudah kedaluwarsa |
| `QR_INVALID` | 422 | Token QR tidak valid |
| `QR_EXPIRED` | 422 | Token QR kedaluwarsa |
| `QR_ACTION_MISMATCH` | 409 | QR tidak sesuai aksi |
| `LOAN_NOT_ACTIVE` | 409 | Loan tidak aktif |
| `RETURN_INSPECTION_REQUIRED` | 422 | Data inspeksi belum lengkap |
| `RETURN_EVIDENCE_REQUIRED` | 422 | Foto bukti wajib |
| `PROJECTOR_HAS_ACTIVE_LOAN` | 409 | Unit masih dipinjam |
| `OPERATING_HOURS_CONFLICT` | 409 | Perubahan jam bertabrakan dengan booking |
| `IDEMPOTENCY_KEY_REUSED` | 409 | Idempotency key dipakai dengan payload berbeda |

Backend dapat menambahkan error code baru. Jangan mengubah makna code yang sudah dipakai tanpa menaikkan versi kontrak atau mengomunikasikan perubahan.

---

## 16. Idempotency dan konsistensi transaksi

Endpoint mutasi berisiko tinggi wajib mendukung `Idempotency-Key`, minimal:
- membuat booking,
- konfirmasi pickup,
- konfirmasi return,
- pergantian komting,
- pembatalan otomatis yang dijalankan job,
- koreksi transaksi.

Ketentuan:
1. Retry request dengan key dan payload sama tidak boleh membuat transaksi ganda.
2. Key sama dengan payload berbeda menghasilkan `409 IDEMPOTENCY_KEY_REUSED`.
3. Operasi yang mengubah beberapa entitas harus dilakukan dalam satu transaksi database.
4. Backend harus mengunci resource yang relevan untuk mencegah race condition.
5. Frontend tetap harus menangani respons konflik karena pengecekan awal tidak menjamin kondisi belum berubah.

---

## 17. Upload file dan akses storage

Jenis file:
- foto identitas pendaftar,
- foto bukti kondisi pengembalian.

Aturan:
- Upload dilakukan melalui endpoint terotorisasi atau mekanisme signed upload yang dibuat backend.
- Bucket identitas wajib privat.
- Foto identitas hanya dapat diakses petugas ADMIN yang berwenang.
- Foto bukti return hanya dapat diakses role operasional yang berwenang.
- Backend memvalidasi MIME type, ukuran, dan ekstensi; jangan mempercayai nama file dari client.
- Jangan mengembalikan path internal bucket sebagai akses publik.
- URL signed memiliki masa berlaku dan tidak boleh disimpan sebagai URL permanen pada data frontend.

Jika memakai multipart endpoint, frontend mengirim `FormData` dan tidak mengatur header `Content-Type` secara manual agar boundary dibuat browser.

---

## 18. Scheduled jobs dan aturan waktu

Semua job menggunakan `Asia/Jakarta` untuk menentukan batas tanggal operasional dan menyimpan timestamp kejadian dalam UTC.

| Job | Waktu/pemicu | Dampak |
|---|---|---|
| Validasi booking saat pergantian tanggal | 00:00 waktu Jakarta pada tanggal booking | Batalkan booking jika unit belum fisik `AVAILABLE`; kirim email |
| Expire booking tidak diambil | Setelah batas pickup +15 menit | Status booking `EXPIRED` |
| Reminder pickup | Menjelang waktu pickup sesuai konfigurasi | Email ke komting |
| Overdue reminder | Setelah estimasi kembali terlewati dan loan masih aktif | Email ke komting; status fisik tetap `BORROWED` |
| Retry email | Sesuai kebijakan retry | Kirim ulang email yang gagal tanpa duplikasi |

Job harus idempotent, dapat dijalankan ulang dengan aman, dan mencatat hasil eksekusi. Estimasi kembali terlewati tidak otomatis menutup loan atau mengubah status fisik unit.

---

## 19. Kontrak state transition

### 19.1 Booking

```text
CONFIRMED ──pickup berhasil──> FULFILLED
CONFIRMED ──dibatalkan────────> CANCELLED
CONFIRMED ──melewati batas────> EXPIRED
```

Booking `FULFILLED` tidak dibatalkan; proses selanjutnya berada pada lifecycle loan.

### 19.2 Loan

```text
ACTIVE ──return dikonfirmasi──> RETURNED
```

### 19.3 Status fisik proyektor

```text
AVAILABLE ──pickup──> BORROWED
BORROWED ──return layak──> AVAILABLE
BORROWED ──return tidak layak──> MAINTENANCE
AVAILABLE ──maintenance──> MAINTENANCE
MAINTENANCE ──dinyatakan layak──> AVAILABLE
```

Backend harus mencegah transisi yang tidak sah, misalnya mengubah unit menjadi `AVAILABLE` ketika masih ada loan aktif.

### 19.4 Komting assignment

```text
PENDING_VERIFICATION ──ADMIN approve──> ACTIVE
PENDING_VERIFICATION ──ADMIN reject───> REJECTED
ACTIVE ──ADMIN deactivate/replacement─> INACTIVE
```

Pada replacement, perubahan assignment lama dan baru dilakukan atomik.

---

## 20. Aturan frontend saat integrasi

Frontend wajib:
1. Menggunakan satu API client terpusat.
2. Mengambil token autentikasi dari mekanisme session resmi.
3. Tidak menyimpan service-role key, secret, atau kredensial backend di browser.
4. Tidak menganggap tombol yang disembunyikan sebagai pengamanan; backend tetap memvalidasi role.
5. Menampilkan error berdasarkan `error.code`.
6. Menampilkan loading, empty, success, dan error state.
7. Mencegah double-submit pada aksi transaksi.
8. Mengirim `Idempotency-Key` untuk operasi yang diwajibkan.
9. Menggunakan timestamp dari backend sebagai sumber waktu transaksi.
10. Tidak menghitung sendiri ketersediaan final unit atau memutuskan status transaksi.
11. Menggunakan mock service hanya selama backend belum tersedia; bentuk mock response harus sama dengan kontrak ini.
12. Tidak mengakses bucket privat secara langsung tanpa signed URL atau izin backend.

### Rekomendasi struktur API client frontend

```text
src/
  lib/
    api/
      client.ts
      errors.ts
      types.ts
  services/
    auth.service.ts
    projector.service.ts
    booking.service.ts
    loan.service.ts
    komting.service.ts
    staff.service.ts
    admin.service.ts
```

Nama dan struktur file dapat disesuaikan, tetapi pemisahan service per domain dianjurkan agar mock service mudah diganti dengan API sungguhan.

---

## 21. Checklist kesepakatan sebelum coding

Kedua pengembang perlu menyepakati poin berikut sebelum implementasi endpoint dimulai:

- [ ] Provider autentikasi final dan cara memperoleh/memperbarui access token.
- [ ] Base URL untuk development, staging, dan production.
- [ ] Format ID final (UUID atau opaque string).
- [ ] Detail field profil dan identitas mahasiswa yang benar-benar diperlukan.
- [ ] Batas ukuran dan format file foto.
- [ ] Mekanisme signed upload dan signed URL.
- [ ] Batas maksimum pagination.
- [ ] Daftar field yang boleh diubah pada profil.
- [ ] Detail mekanisme respons komting lama saat replacement, jika ada.
- [ ] Kebijakan pembatalan booking oleh komting.
- [ ] Definisi jam tutup dan cara ADMIN membuka layanan lebih awal.
- [ ] Kebijakan waktu reminder pickup dan overdue.
- [ ] Apakah inbox notifikasi dalam aplikasi dibutuhkan atau email saja cukup.
- [ ] Daftar field koreksi transaksi yang boleh dilakukan ADMIN.
- [ ] Kebijakan retensi file identitas dan bukti return.

**Aturan keputusan:** jika suatu detail belum disepakati, tandai sebagai `OPEN DECISION`; jangan membuat asumsi berbeda di frontend dan backend.

---

## 22. Pembagian implementasi berdasarkan kontrak

### Frontend

Urutan implementasi:
1. API client, tipe response, dan error handler.
2. Session dan `/me`.
3. Halaman pendaftaran dan status pengajuan.
4. Dashboard dan daftar proyektor.
5. Form booking, availability, dan riwayat.
6. Tampilan QR booking.
7. Antarmuka operasional scan QR dan konfirmasi pickup.
8. Form return dan inspeksi.
9. Maintenance.
10. Dashboard dan fitur ADMIN.
11. Loading/error/empty state dan integrasi end-to-end.

### Backend

Urutan implementasi:
1. Setup API versioning, response wrapper, error handler, dan request ID.
2. Authentication, role middleware, dan `/me`.
3. Model database dan constraints.
4. Pendaftaran/verifikasi/pergantian komting.
5. Proyektor dan availability.
6. Booking dan idempotency.
7. QR validation dan pickup atomik.
8. Return dan inspection atomik.
9. Maintenance dan operating hours.
10. Email outbox dan scheduled jobs.
11. Audit log dan koreksi transaksi.
12. API tests dan dokumentasi OpenAPI.

### Integrasi bertahap

Integrasikan per domain, bukan menunggu seluruh backend selesai:
1. Auth dan profil.
2. Proyektor dan dashboard.
3. Pendaftaran komting.
4. Booking.
5. Pickup/QR.
6. Return.
7. Maintenance dan ADMIN.
8. Email/jobs dan pengujian menyeluruh.

---

## 23. Open decisions yang perlu ditutup

Poin-poin berikut belum dijabarkan cukup rinci oleh PRD untuk menjadi aturan teknis final:

1. **Provider autentikasi:** Supabase Auth atau provider lain.
2. **Identitas mahasiswa:** field wajib yang disimpan dan apakah email harus diverifikasi sebelum pengajuan.
3. **Replacement:** apakah komting lama diberi tenggat untuk merespons atau ADMIN langsung memutuskan setelah pemberitahuan.
4. **Pembatalan mandiri:** sampai status/waktu apa komting boleh membatalkan booking.
5. **Jam layanan:** detail cara ADMIN membuka lebih awal dan bagaimana perubahan jam tutup menangani booking yang sudah ada.
6. **Reminder:** berapa menit sebelum pickup dan kapan tepatnya email overdue dikirim.
7. **File policy:** batas ukuran, MIME type, retensi, dan siapa yang dapat melihat bukti return.
8. **Koreksi ADMIN:** field transaksi yang boleh dikoreksi tanpa merusak konsistensi lifecycle.
9. **Notifikasi aplikasi:** apakah perlu inbox internal selain email.
10. **Kebijakan rate limit:** khususnya login, upload, QR validation, dan endpoint publik.

Sebelum poin-poin tersebut diputuskan, implementasi harus mengikuti aturan eksplisit PRD dan tidak mengarang perilaku baru.

---

## 24. Definition of Done untuk API Contract

Kontrak dianggap siap dipakai untuk implementasi ketika:
- [ ] Frontend dan backend menyetujui format request/response.
- [ ] Seluruh endpoint prioritas memiliki method, path, role, request, response, dan error.
- [ ] Status booking, loan, assignment, dan unit konsisten.
- [ ] Zona waktu dan format timestamp dipahami kedua pihak.
- [ ] Aturan transaksi atomik dan idempotency dipahami.
- [ ] Upload privat dan QR token memiliki batas keamanan yang jelas.
- [ ] Open decisions diberi pemilik dan target keputusan.
- [ ] Mock service frontend menggunakan tipe data yang sama dengan kontrak.
- [ ] Backend menyiapkan spesifikasi OpenAPI yang mencerminkan kontrak ini.

---

## 25. Riwayat versi

| Versi | Tanggal | Perubahan |
|---|---|---|
| 1.0.0 | 26 November 2026 | Draft awal API contract berdasarkan PRD PINJAM Final |
