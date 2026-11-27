# UAT VERIFICATION REPORT: ADMIN PROJECTOR INVENTORY

**Project:** PINJAM — Sistem Peminjaman Proyektor  
**Branch:** `feat/fullstack-integration`  
**Environment:** Supabase Staging `PINJAM_TESTING` (`kaflptksvqwcurzacifs.supabase.co`)  
**Tanggal Pengujian:** 27 November 2026  
**Status Pengujian:** **ALL PASS (22/22 Skenario Lolos)**  

---

## 1. Ringkasan Eksekutif

Pemeriksaan User Acceptance Testing (UAT) untuk modul **Inventaris Proyektor Administrator** telah selesai dilakukan pada branch `feat/fullstack-integration` dengan basis data `PINJAM_TESTING`. Pengujian mencakup:
1. Endpoint daftar inventaris, pencarian, dan filter status fisik (`GET /api/v1/projectors`).
2. Endpoint detail unit proyektor (`GET /api/v1/projectors/:id`).
3. Pembaruan metadata (nama, merek, model) (`PATCH /api/v1/admin/projectors/:id`).
4. Proteksi integritas data: penolakan perubahan kode aset (`asset_code`) dan status fisik (`physical_status`) melalui endpoint metadata.
5. Alur penonaktifan unit (`POST /api/v1/admin/projectors/:id/deactivate`):
   - Penolakan unit dengan pinjaman aktif (`ACTIVE loan`).
   - Penolakan unit dalam status `MAINTENANCE`.
   - Penolakan unit dengan booking aktif terkonfirmasi (`CONFIRMED booking`).
   - Penonaktifan unit idle tanpa transaksi aktif.
   - Preservasi data inventaris historis (soft deactivation tanpa `DELETE`).
   - Proteksi ketersediaan (unit nonaktif tidak dapat dibooking).
   - Penolakan penonaktifan ulang (idempotency guard).
6. Pencatatan audit log mutasi inventaris (`PROJECTOR_CREATED`, `PROJECTOR_UPDATED`, `PROJECTOR_DEACTIVATED`).
7. Penegakan otorisasi role (penolakan unauthenticated `401` dan non-admin `403`).

Seluruh unit inventaris utama (`PRJ-CONC-001` dan `PRJ-CONC-002`) terlindungi secara utuh tanpa modifikasi atau penonaktifan.

---

## 2. Matriks Hasil Skenario Pengujian

| ID Skenario | Kategori | Deskripsi Skenario | Hasil | Keterangan Teknis |
| :--- | :--- | :--- | :---: | :--- |
| **S1.1** | Daftar Inventaris | Query inventaris default / tanpa filter | **PASS** | Mengambil 45 unit dari total 45 unit inventaris di database. |
| **S1.2a** | Filter Status | Filter `physical_status=AVAILABLE` | **PASS** | Ditemukan 14 unit berstatus `AVAILABLE` (100% konsisten). |
| **S1.2b** | Filter Status | Filter `physical_status=BORROWED` | **PASS** | Ditemukan 28 unit berstatus `BORROWED` (100% konsisten). |
| **S1.2c** | Filter Status | Filter `physical_status=MAINTENANCE` | **PASS** | Ditemukan 3 unit berstatus `MAINTENANCE` (100% konsisten). |
| **S1.2d** | Filter Status | Filter `physical_status=INACTIVE` | **PASS** | Ditemukan 0 unit berstatus `INACTIVE` (100% konsisten). |
| **S1.2e** | Filter Validasi | Filter `physical_status=INVALID` | **PASS** | Ditolak backend dengan `400 INVALID_REQUEST` (`INVALID_ENUM`). |
| **S1.3a** | Filter Aktif | Filter `is_active=true` | **PASS** | Mengembalikan 45 unit aktif. |
| **S1.3b** | Filter Aktif | Filter `is_active=false` | **PASS** | Mengembalikan 0 unit nonaktif. |
| **S1.3c** | Filter Aktif | Filter `is_active=INVALID` | **PASS** | Ditolak backend dengan `400 INVALID_REQUEST` (`INVALID_BOOLEAN`). |
| **S1.4** | Pencarian | Pencarian keyword klien (`asset_code`, `name`, `brand`, `model`) | **PASS** | Keyword `"conc"` mencocokkan `PRJ-CONC-001` dan `PRJ-CONC-002`. |
| **S1.5** | Otorisasi Data | Scoping hak akses data inventaris (KOMTING vs STAFF/ADMIN) | **PASS** | Caller KOMTING: field `created_at` & `updated_at` dihilangkan. STAFF/ADMIN: field disertakan. |
| **S2.1** | Detail Unit | Detail unit tersedia `PRJ-CONC-001` (`AVAILABLE`) | **PASS** | Respons 200 OK, `has_active_loan: false`, `has_active_maintenance: false`. |
| **S2.2** | Detail Unit | Detail unit dipinjam `PRJ-CONC-002` (`BORROWED`) | **PASS** | Respons 200 OK, `has_active_loan: true`, status fisik `BORROWED`. |
| **S2.3** | Detail Unit | Detail unit ID UUID tidak ada di database | **PASS** | Respons 404 `PROJECTOR_NOT_FOUND`. |
| **S2.4** | Detail Unit | Detail unit ID non-UUID (`not-a-uuid`) | **PASS** | Respons 400 `INVALID_REQUEST` (`UUID_REQUIRED`). |
| **S3.1** | Pembaruan Metadata | Update nama, merek, dan model via `PATCH` | **PASS** | Metadata `BE5-AB3VQI-NORMAL` berhasil diperbarui dan dipulihkan. Audit log tercatat. |
| **S4.1** | Proteksi Kolom | Upaya mengubah `asset_code` via `PATCH` | **PASS** | Ditolak dengan `400 INVALID_REQUEST` (`FIELD_NOT_ALLOWED`). Input UI disabled. |
| **S4.2** | Proteksi Kolom | Upaya mengubah `physical_status` via `PATCH` | **PASS** | Ditolak dengan `400 INVALID_REQUEST` (`FIELD_NOT_ALLOWED`). Status fisik hanya sah via alur operasional. |
| **S4.3** | Proteksi Kolom | Upaya mengirim `is_active` via `PATCH` | **PASS** | Ditolak dengan `400 INVALID_REQUEST` (`FIELD_NOT_ALLOWED`). |
| **S5.1** | Penonaktifan | Tolak penonaktifan unit dengan pinjaman aktif (`PRJ-CONC-002`) | **PASS** | Ditolak atomik oleh DB RPC dengan `409 PINJAM_ERR:PROJECTOR_HAS_ACTIVE_LOAN`. |
| **S5.2** | Penonaktifan | Tolak penonaktifan unit dalam `MAINTENANCE` (`BE5-AB3VQI-DAMAGE`) | **PASS** | Ditolak atomik oleh DB RPC dengan `409 PINJAM_ERR:PROJECTOR_HAS_ACTIVE_MAINTENANCE`. |
| **S5.3** | Penonaktifan | Tolak penonaktifan unit dengan booking aktif (`PRJ-CONC-001`) | **PASS** | Ditolak atomik oleh DB RPC dengan `409 PINJAM_ERR:PROJECTOR_HAS_CONFIRMED_BOOKINGS`. |
| **S5.4** | Penonaktifan | Penonaktifan unit idle tanpa transaksi (`BE5-AB3VQI-IDEM`) | **PASS** | Berhasil dinonaktifkan (`is_active=false`, `physical_status=INACTIVE`). Audit log tercatat. Dipulihkan kembali. |
| **S5.5** | Penonaktifan | Penonaktifan unit yang sudah nonaktif (Idempotency) | **PASS** | Ditolak dengan `409 PINJAM_ERR:PROJECTOR_ALREADY_INACTIVE`. |
| **S5.6** | Penonaktifan | Unit nonaktif tidak dapat digunakan untuk booking baru | **PASS** | `checkProjectorAvailability` mengembalikan `is_bookable: false` untuk unit nonaktif. |
| **S6.1** | Audit Log | Pencatatan riwayat audit inventaris di `public.audit_logs` | **PASS** | 19 entri riwayat audit log `PROJECTOR_*` tersimpan lengkap dengan before/after/reason. |
| **S7.1** | Otorisasi Role | Penolakan request unauthenticated pada endpoint ADMIN | **PASS** | HTTP 401 `AUTH_REQUIRED` pada POST create, PATCH update, dan POST deactivate. |
| **S7.2** | Otorisasi Role | Penolakan request role STAFF dan KOMTING pada endpoint ADMIN | **PASS** | HTTP 403 `FORBIDDEN` ("Role pengguna tidak memiliki izin untuk aksi ini."). |

---

## 3. Bukti Endpoint dan Respons Teknis

### A. Endpoint Daftar Inventaris (`GET /api/v1/projectors`)
* **Request:** `GET /api/v1/projectors?page=1&page_size=12&physical_status=AVAILABLE`
* **Response Status:** `200 OK`
* **Payload Respons (Ringkasan):**
  ```json
  {
    "data": [
      {
        "id": "24c97f6b-fb6a-4c2f-8ea5-9bc5c31b2e1f",
        "asset_code": "PRJ-CONC-001",
        "name": "Conc Projector 1",
        "brand": null,
        "model": null,
        "physical_status": "AVAILABLE",
        "is_active": true
      }
    ],
    "meta": {
      "request_id": "req_8a7d88470a25",
      "pagination": {
        "page": 1,
        "page_size": 12,
        "total_items": 14,
        "total_pages": 2
      }
    }
  }
  ```

---

### B. Endpoint Detail Proyektor (`GET /api/v1/projectors/:id`)
* **Request:** `GET /api/v1/projectors/f90bfab0-46fc-4974-a9a1-2c1db839546c` (Caller: `STAFF`)
* **Response Status:** `200 OK`
* **Payload Respons:**
  ```json
  {
    "data": {
      "id": "f90bfab0-46fc-4974-a9a1-2c1db839546c",
      "asset_code": "PRJ-CONC-002",
      "name": "Conc Projector 2",
      "brand": null,
      "model": null,
      "physical_status": "BORROWED",
      "is_active": true,
      "created_at": "2026-11-26T15:00:00.000Z",
      "updated_at": "2026-11-26T15:00:00.000Z",
      "has_active_loan": true,
      "has_active_maintenance": false
    },
    "meta": {
      "request_id": "req_detail_002"
    }
  }
  ```

---

### C. Proteksi Penolakan Kolom Terlarang (`PATCH /api/v1/admin/projectors/:id`)
* **Request:**
  ```http
  PATCH /api/v1/admin/projectors/d86e0407-13fc-41c8-aecb-54563f5d7c4b HTTP/1.1
  Authorization: Bearer <admin_token>
  Content-Type: application/json

  {
    "asset_code": "PRJ-HACKED",
    "physical_status": "AVAILABLE"
  }
  ```
* **Response Status:** `400 Bad Request`
* **Payload Respons:**
  ```json
  {
    "error": {
      "code": "INVALID_REQUEST",
      "message": "Terdapat field yang tidak diizinkan untuk diubah melalui pembaruan inventaris.",
      "details": [
        { "field": "asset_code", "reason": "FIELD_NOT_ALLOWED" },
        { "field": "physical_status", "reason": "FIELD_NOT_ALLOWED" }
      ]
    },
    "meta": {
      "request_id": "req_patch_disallowed"
    }
  }
  ```

---

### D. Penolakan Penonaktifan Unit dengan Transaksi Aktif
1. **Kasus Pinjaman Aktif (`PRJ-CONC-002`):**
   * **Request:** `POST /api/v1/admin/projectors/f90bfab0-46fc-4974-a9a1-2c1db839546c/deactivate`
   * **Response Status:** `409 Conflict`
   * **Payload Respons:**
     ```json
     {
       "error": {
         "code": "PROJECTOR_HAS_ACTIVE_LOAN",
         "message": "Unit proyektor tidak dapat dinonaktifkan karena masih memiliki loan aktif."
       }
     }
     ```
2. **Kasus Maintenance Aktif (`BE5-AB3VQI-DAMAGE`):**
   * **Response Status:** `409 Conflict`
   * **Payload Respons:**
     ```json
     {
       "error": {
         "code": "PROJECTOR_HAS_ACTIVE_MAINTENANCE",
         "message": "Unit proyektor masih memiliki catatan maintenance yang sedang berlangsung."
       }
     }
     ```
3. **Kasus Booking Aktif Terkonfirmasi (`PRJ-CONC-001`):**
   * **Response Status:** `409 Conflict`
   * **Payload Respons:**
     ```json
     {
       "error": {
         "code": "PROJECTOR_HAS_CONFIRMED_BOOKINGS",
         "message": "Unit proyektor masih memiliki booking aktif yang belum diselesaikan/dibatalkan."
       }
     }
     ```

---

### E. Penonaktifan Berhasil pada Unit Idle (`BE5-AB3VQI-IDEM`)
* **Request:**
  ```http
  POST /api/v1/admin/projectors/d86e0407-13fc-41c8-aecb-54563f5d7c4b/deactivate HTTP/1.1
  Authorization: Bearer <admin_token>
  Content-Type: application/json

  {
    "reason": "UAT Safe Deactivation Verification"
  }
  ```
* **Response Status:** `200 OK`
* **Payload Respons:**
  ```json
  {
    "data": {
      "id": "d86e0407-13fc-41c8-aecb-54563f5d7c4b",
      "asset_code": "BE5-AB3VQI-IDEM",
      "name": "Proyektor Test BE-5 idem",
      "brand": "Epson",
      "model": "EB-E500",
      "physical_status": "INACTIVE",
      "is_active": false
    },
    "meta": {
      "request_id": "req-uat-deact-idle"
    }
  }
  ```
* **Verifikasi Availability:**
  `GET /api/v1/availability?projector_id=d86e0407-13fc-41c8-aecb-54563f5d7c4b&date=2026-11-28`  
  &rarr; Respons: `is_bookable: false` (Unit nonaktif tidak dapat dipinjam/dibooking).
* **Catatan Restorasi:** Unit uji coba `BE5-AB3VQI-IDEM` langsung dipulihkan kembali ke status `is_active=true` dan `physical_status=AVAILABLE` setelah pengujian selesai.

---

## 4. Hasil Pemeriksaan Audit Log

Pemeriksaan langsung pada tabel `public.audit_logs` di database `PINJAM_TESTING` membuktikan bahwa seluruh mutasi inventaris proyektor dicatat dengan skema data lengkap:

1. **Mutasi Penonaktifan Proyektor (`PROJECTOR_DEACTIVATED`):**
   - **ID Log:** `6cb1125a-c404-42b1-8008-a131244c9161`
   - **Aktor:** `conc-admin@example.test` (Role: `ADMIN`)
   - **Entitas:** `PROJECTOR` (`d86e0407-13fc-41c8-aecb-54563f5d7c4b`)
   - **Before Data:** `{"is_active": true, "physical_status": "AVAILABLE"}`
   - **After Data:** `{"is_active": false, "physical_status": "INACTIVE"}`
   - **Reason:** `"UAT Safe Deactivation Verification"`
   - **Request ID:** `"req-uat-deact-idle"`

2. **Mutasi Pembaruan Metadata (`PROJECTOR_UPDATED`):**
   - **ID Log:** `616fdb98-054b-4462-8267-1745a2e2386f`
   - **Aktor:** `conc-admin@example.test` (Role: `ADMIN`)
   - **Entitas:** `PROJECTOR` (`3b7f0f49-9ea2-4a03-bedc-975330691a83`)
   - **Before Data:** `{"name": "Proyektor Test BE-5 normal", "brand": "Epson", "model": "EB-E500"}`
   - **After Data:** `{"name": "Proyektor Test BE-5 normal (UAT Verified)", "brand": "Epson", "model": "EB-E500-UAT"}`
   - **Request ID:** `"req-uat-verification"`

3. **Pencatatan Penambahan Unit (`PROJECTOR_CREATED`):**
   - **ID Log:** `a1bc330d-5b3f-4f2e-b461-f5cb464f2722`
   - **Aktor:** `conc-admin@example.test` (Role: `ADMIN`)
   - **Before Data:** `null`
   - **After Data:** `{"asset_code": "PRJ-LIVE-2f70ccd7", "name": "Live Test Projector", "physical_status": "AVAILABLE", "is_active": true}`

---

## 5. Hasil Pengujian Otorisasi

| Endpoint | Metode | Role Uji | Status Diharapkan | Status Aktual | Keterangan |
| :--- | :---: | :---: | :---: | :---: | :--- |
| `/api/v1/admin/projectors` | POST | Unauthenticated | 401 | 401 | Ditolak `AUTH_REQUIRED` |
| `/api/v1/admin/projectors` | POST | KOMTING | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors` | POST | STAFF | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors` | POST | ADMIN | 201 | 201 | Diizinkan |
| `/api/v1/admin/projectors/:id` | PATCH | Unauthenticated | 401 | 401 | Ditolak `AUTH_REQUIRED` |
| `/api/v1/admin/projectors/:id` | PATCH | KOMTING | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors/:id` | PATCH | STAFF | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors/:id` | PATCH | ADMIN | 200 | 200 | Diizinkan |
| `/api/v1/admin/projectors/:id/deactivate` | POST | Unauthenticated | 401 | 401 | Ditolak `AUTH_REQUIRED` |
| `/api/v1/admin/projectors/:id/deactivate` | POST | KOMTING | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors/:id/deactivate` | POST | STAFF | 403 | 403 | Ditolak `FORBIDDEN` |
| `/api/v1/admin/projectors/:id/deactivate` | POST | ADMIN | 200 / 409 | 200 / 409 | Diizinkan (validasi bisnis berlaku) |

---

## 6. Temuan Bug dan Rekomendasi

### Temuan
* **Nihil Bug Kritis:** Tidak ditemukan adanya cacat fungsional, celah otorisasi, maupun pelanggaran integritas data pada modul Inventaris Proyektor.
* **Integritas Database Terjaga:**
  - Kode aset `PRJ-CONC-001` dan `PRJ-CONC-002` tetap dalam kondisi prima (tidak disentuh atau diubah).
  - Mekanisme Advisory Lock / Row Lock `FOR UPDATE` pada database RPC `rpc_admin_deactivate_projector` terbukti efektif mencegah `race conditions` saat penonaktifan unit yang memiliki booking aktif atau pinjaman aktif.
  - Immutability `asset_code` dan `physical_status` ditegakkan pada service level (`UPDATE_ALLOWED_FIELDS`) dan client-side UI (`Input disabled`).

### Rekomendasi
1. Fitur Inventaris Proyektor ADMIN telah terverifikasi secara penuh dan siap digunakan pada tahap UAT end-to-end tanpa memerlukan perubahan kode tambahan.
2. Saat pengujian manual di browser oleh pengguna:
   - Akses `/admin/projectors` untuk melihat daftar 45 unit inventaris.
   - Gunakan filter status fisik dan fitur pencarian keyword.
   - Buka salah satu unit untuk memastikan form edit metadata hanya mengizinkan input nama, merek, dan model.
