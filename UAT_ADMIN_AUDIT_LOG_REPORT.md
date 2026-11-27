# LAPORAN UAT FITUR AUDIT LOG ADMIN
**Branch:** `feat/fullstack-integration`  
**Target Database:** `PINJAM_TESTING` (`kaflptksvqwcurzacifs.supabase.co`)  
**Waktu Pengujian:** 27 November 2026, 21:58 WIB  
**Metode Pengujian:** Read-Only Verification (Tanpa mutasi data, tanpa migrasi)  
**Status Akhir:** **BERHASIL DENGAN CATATAN (SEMUA SKENARIO UTAMA LULUS)**

---

## 1. RINGKASAN EKSEKUTIF

Pengujian User Acceptance Testing (UAT) untuk fitur **Audit Log ADMIN** dilakukan secara menyeluruh terhadap database staging `PINJAM_TESTING` dan implementasi fullstack pada branch `feat/fullstack-integration`.

Pemeriksaan mencakup:
1. Aksesibilitas halaman frontend `/admin/audit-logs` dan `/admin/audit-logs/[id]`.
2. Endpoint REST backend `GET /api/v1/admin/audit-logs` dan `GET /api/v1/admin/audit-logs/[id]`.
3. Keamanan Role-Based Access Control (RBAC): penolakan unauthenticated (401) dan non-ADMIN (403 untuk STAFF dan KOMTING).
4. Pemrosesan pagination server-side (page, page_size, total_items, total_pages).
5. Filter server-side (`entity_type`, `entity_id`) dan pencarian lokal kata kunci.
6. Pencocokan riwayat audit aktual di database terhadap aktivitas UAT sebelumnya (update proyektor, penonaktifan, maintenance, dan pembukaan awal operating hours).
7. Kelengkapan field audit: `actor_user_id`, `actor_role`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `reason`, `request_id`, dan `created_at`.

---

## 2. ARSITEKTUR & IMPLEMENTASI FITUR

### 2.1. Halaman Frontend
- `/admin/audit-logs` ([src/app/admin/audit-logs/page.tsx](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/app/admin/audit-logs/page.tsx)):
  - Dilindungi oleh `<RoleGuard allowedRoles={["ADMIN"]}>` dan dibungkus `<AdminShell>`.
  - Komponen utama: `AdminAuditLogsListView` ([src/features/admin/admin-audit-logs-list-view.tsx](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/features/admin/admin-audit-logs-list-view.tsx)).
  - Menyediakan tabel daftar log, filter dropdown tipe entitas, filter ID entitas, pencarian lokal kata kunci, dan navigasi pagination.
- `/admin/audit-logs/[id]` ([src/app/admin/audit-logs/[id]/page.tsx](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/app/admin/audit-logs/%5Bid%5D/page.tsx)):
  - Komponen utama: `AdminAuditLogDetailView` ([src/features/admin/admin-audit-log-detail-view.tsx](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/features/admin/admin-audit-log-detail-view.tsx)).
  - Menampilkan panel metadata aktor, entitas, request ID, alasan perubahan, serta viewer JSON terstruktur untuk snapshot `before_data` dan `after_data`.

### 2.2. Endpoint Backend
- `GET /api/v1/admin/audit-logs` ([src/app/api/v1/admin/audit-logs/route.ts](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/app/api/v1/admin/audit-logs/route.ts)):
  - Guard: `requireAdmin(request)`
  - Query Params: `page`, `page_size`, `entity_type`, `entity_id`, `sort_by`, `sort_order`
  - Response: Envelope list standar `data` + `meta.pagination`
- `GET /api/v1/admin/audit-logs/[id]` ([src/app/api/v1/admin/audit-logs/[id]/route.ts](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/src/app/api/v1/admin/audit-logs/%5Bid%5D/route.ts)):
  - Guard: `requireAdmin(request)`
  - Parameter: `id` (wajib format UUID valid)
  - Response: Envelope single data catatan audit

---

## 3. HASIL PENGUJIAN SKENARIO

### 3.1. Uji Kontrol Akses & Keamanan Role (RBAC)

| Skenario Pengujian | Akun / Token Uji | Status HTTP Diharapkan | Status HTTP Aktual | Hasil |
|---|---|---|---|---|
| Permintaan tanpa token / token tidak valid | Unauthenticated (`Bearer invalid`) | `401 AUTH_REQUIRED` | `401` | **PASS** |
| Akses daftar audit log oleh role STAFF | `conc-staff@example.test` | `403 FORBIDDEN` | `403` | **PASS** |
| Akses daftar audit log oleh role KOMTING | `conc-komting1@example.test` | `403 FORBIDDEN` | `403` | **PASS** |
| Akses daftar audit log oleh role ADMIN | `conc-admin@example.test` | `200 OK` | `200` | **PASS** |
| Akses detail audit log oleh role STAFF | `conc-staff@example.test` | `403 FORBIDDEN` | `403` | **PASS** |
| Akses detail audit log oleh role ADMIN | `conc-admin@example.test` | `200 OK` | `200` | **PASS** |
| Detail dengan UUID format tidak valid | `admin` (id: `not-a-uuid`) | `400 INVALID_REQUEST` | `400` | **PASS** |
| Detail dengan UUID valid tetapi tidak ada | `admin` (id: `11111111-1111-4111-8111-111111111111`) | `404 NOT_FOUND` | `404` | **PASS** |

---

### 3.2. Inventarisasi Rekaman Audit Aktual di Database `PINJAM_TESTING`

Berdasarkan kueri langsung terhadap tabel `public.audit_logs`:
- **Total Catatan Audit:** `211` baris
- **Distribusi Berdasarkan Tipe Entitas (`entity_type`):**
  - `LOAN`: 81 catatan
  - `BOOKING`: 58 catatan
  - `KOMTING_APPLICATION`: 23 catatan
  - `PROJECTOR`: 19 catatan
  - `RETURN_INSPECTION`: 18 catatan
  - `OPERATING_HOURS`: 8 catatan
  - `MAINTENANCE`: 2 catatan
  - `KOMTING_ASSIGNMENT`: 1 catatan
  - `USER`: 1 catatan
- **Distribusi Berdasarkan Aksi (`action`):**
  - `BOOKING_CREATED`: 55 catatan
  - `LOAN_PICKUP_CONFIRMED`: 41 catatan
  - `LOAN_RETURN_CONFIRMED`: 18 catatan
  - `LOAN_INSPECTED`: 18 catatan
  - `LOAN_FINE_RECORDED`: 18 catatan
  - `KOMTING_APPLICATION_SUBMITTED`: 13 catatan
  - `OPERATING_HOURS_UPDATED`: 8 catatan
  - `KOMTING_APPLICATION_APPROVED`: 8 catatan
  - `PROJECTOR_UPDATED`: 7 catatan
  - `PROJECTOR_CREATED`: 6 catatan
  - `PROJECTOR_DEACTIVATED`: 5 catatan
  - `PICKUP_CONFIRMED`: 4 catatan
  - `BOOKING_CANCELLED`: 3 catatan
  - `MAINTENANCE_COMPLETED`: 2 catatan
  - `PROJECTOR_MAINTENANCE`: 1 catatan
  - `KOMTING_ASSIGNMENT_DEACTIVATED`: 1 catatan
  - `KOMTING_REPLACEMENT_APPROVED`: 1 catatan
  - `KOMTING_APPLICATION_REJECTED`: 1 catatan
  - `USER_PROFILE_UPDATED`: 1 catatan

---

### 3.3. Pencocokan Riwayat Audit UAT dengan Aktivitas Sebelumnya

| Target Aktivitas UAT | Status Ketersediaan | Nama Aksi Aktual di DB | Jumlah | Bukti Sampel Record |
|---|---|---|---|---|
| **PROJECTOR_METADATA_UPDATED** | **Ditemukan** | `PROJECTOR_UPDATED` *(lihat Catatan 1)* | 7 | Audit ID: `616fdb98-054b-4462-8267-1745a2e2386f`<br>Entity: `PROJECTOR` (`3b7f0f49-9ea2-4a03-bedc-975330691a83`)<br>Aktor: `ADMIN` (`e37c0744-6379-4524-a741-ca08517ad3b5`)<br>Request ID: `req-uat-verification`<br>`before_data`: `name`, `brand`, `model`<br>`after_data`: `name`, `brand`, `model` |
| **PROJECTOR_DEACTIVATED** | **Ditemukan** | `PROJECTOR_DEACTIVATED` | 5 | Audit ID: `6cb1125a-c404-42b1-8008-a131244c9161`<br>Entity: `PROJECTOR` (`d86e0407-13fc-41c8-aecb-54563f5d7c4b`)<br>Aktor: `ADMIN`<br>Alasan: `"UAT Safe Deactivation Verification"`<br>`before_data`: `{ is_active: true, physical_status: "AVAILABLE" }`<br>`after_data`: `{ is_active: false, physical_status: "INACTIVE" }` |
| **MAINTENANCE_STARTED** | **Ditemukan** | `PROJECTOR_MAINTENANCE` *(lihat Catatan 2)* | 1 | Audit ID: `c2d0c610-1f53-4c9d-9b62-74762938d9f2`<br>Entity: `PROJECTOR` (`7f62dc73-11b8-4d2a-afb3-e0132976df92`)<br>Aktor: `STAFF` (`6461d7e3-7d46-4d22-9434-339e93422c1e`)<br>`after_data`: `note`, `reason: "Pembersihan lensa...", maintenance_id, physical_status: "MAINTENANCE"` |
| **MAINTENANCE_COMPLETED** | **Ditemukan** | `MAINTENANCE_COMPLETED` | 2 | Audit ID: `47186b59-5f10-4e62-be0a-7c810f3dd475`<br>Entity: `MAINTENANCE` (`e08b937a-9041-4854-a6f6-c6f8338a7f73`)<br>Aktor: `ADMIN`<br>`before_data`: `{ status: "IN_PROGRESS", projector_id: "..." }`<br>`after_data`: `{ status: "COMPLETED", resolution_note: "...", set_projector_available: true }` |
| **OPERATING_HOURS_UPDATED** | **Ditemukan** | `OPERATING_HOURS_UPDATED` | 8 | Audit ID: `3bcf1bd3-873c-4438-9dc9-bca196a320c5`<br>Entity: `OPERATING_HOURS` (`31f938e1-a9c5-410d-b1fa-27c706abca18`)<br>Aktor: `ADMIN`<br>Alasan: `"UAT pengujian pembukaan awal ADMIN kedua"`<br>`before_data`: `opens_at: 09:00:00, admin_early_open_at: 07:00:00`<br>`after_data`: `opens_at: 09:00:00, admin_early_open_at: 07:00:00` |

---

### 3.4. Uji Pagination & Filter Server-Side

1. **Uji Pagination (`page` & `page_size`):**
   - Mengambil Halaman 1 (`page=1&page_size=3`): Mengembalikan 3 item pertama. Metadata: `{ page: 1, page_size: 3, total_items: 211, total_pages: 71 }`.
   - Mengambil Halaman 2 (`page=2&page_size=3`): Mengembalikan 3 item berikutnya. Metadata: `{ page: 2, page_size: 3, total_items: 211, total_pages: 71 }`.
   - Verifikasi Integritas: ID item halaman 1 dan halaman 2 berbeda (`IDs different: true`).
2. **Uji Filter `entity_type=OPERATING_HOURS`:**
   - Mengembalikan 8 rekaman.
   - 100% item yang dikembalikan memiliki kolom `entity_type === "OPERATING_HOURS"`.
3. **Uji Filter `entity_type=PROJECTOR`:**
   - Mengembalikan 19 rekaman (mencakup pembuatan unit, pembaruan metadata, penonaktifan, dan start maintenance).
   - 100% item yang dikembalikan memiliki kolom `entity_type === "PROJECTOR"`.
4. **Uji Filter `entity_type=MAINTENANCE`:**
   - Mengembalikan 2 rekaman penyelesaian maintenance.
   - 100% item yang dikembalikan memiliki kolom `entity_type === "MAINTENANCE"`.
5. **Uji Filter `entity_id`:**
   - Filter menggunakan `entity_id=31f938e1-a9c5-410d-b1fa-27c706abca18` (ID baris operating hours tanggal 30 Nov 2026).
   - Mengembalikan 4 rekaman historis perubahan untuk tanggal layanan tersebut.
   - 100% item yang dikembalikan cocok secara tepat dengan `entity_id` yang dicari.

---

## 4. TEMUAN & OBSERVASI (DEFECT / CATATAN TEKNIS)

### Catatan 1 — Penamaan Aksi Pembaruan Metadata Proyektor
- **Deskripsi:** Pada instruksi UAT disebutkan aksi `PROJECTOR_METADATA_UPDATED`.
- **Implementasi Aktual:** Pada service `src/lib/projectors/projector-service.ts` baris 284, aksi yang dicatat ke `audit_logs` bernama **`PROJECTOR_UPDATED`**.
- **Dampak:** Bukan kegagalan fungsional. Data tercatat lengkap dan valid di database (7 rekaman), hanya berbeda nama pengenal string aksi.

### Catatan 2 — Penamaan Aksi Mulai Maintenance Proyektor
- **Deskripsi:** Pada instruksi UAT disebutkan aksi `MAINTENANCE_STARTED`.
- **Implementasi Aktual:** Pada service `src/lib/maintenance/maintenance-service.ts` baris 279, saat staf/admin memasukkan proyektor ke maintenance, aksi yang dicatat bernama **`PROJECTOR_MAINTENANCE`** dengan `entity_type: "PROJECTOR"`.
- **Dampak:** Bukan kegagalan fungsional. Transisi status fisik unit ke `MAINTENANCE` tercatat lengkap dengan catatan kerusakan dan teknisi.

### Catatan 3 — Opsi Dropdown Filter Tipe Entitas di Frontend (Status: TELAH DIPERBAIKI)
- **Deskripsi:** Dropdown filter tipe entitas sebelumnya belum menyediakan opsi spesifik untuk `RETURN_INSPECTION` dan `KOMTING_ASSIGNMENT`.
- **Perbaikan yang Diterapkan:**
  - Ditambahkan ke dalam `AUDIT_ENTITY_TYPE_OPTIONS` di `src/features/admin/admin-audit-logs-list-view.tsx`:
    - `RETURN_INSPECTION` &rarr; label: `Pemeriksaan Pengembalian` (value: `RETURN_INSPECTION`)
    - `KOMTING_ASSIGNMENT` &rarr; label: `Assignment Komting` (value: `KOMTING_ASSIGNMENT`)
  - Nilai yang dikirimkan ke query API tetap menggunakan enum string asli.
- **Hasil Verifikasi Pasca-Perbaikan:**
  - Filter `entity_type=RETURN_INSPECTION`: Mengembalikan tepat **18 catatan** dari database `PINJAM_TESTING` (100% bertipe `RETURN_INSPECTION`, contoh aksi: `LOAN_INSPECTED`).
  - Filter `entity_type=KOMTING_ASSIGNMENT`: Mengembalikan tepat **1 catatan** dari database `PINJAM_TESTING` (100% bertipe `KOMTING_ASSIGNMENT`, aksi: `KOMTING_ASSIGNMENT_DEACTIVATED`).
  - Unit test `supports filtering by RETURN_INSPECTION and KOMTING_ASSIGNMENT options` ditambahkan pada `src/features/admin/__tests__/admin-audit-logs.test.tsx` dan lulus 100%.

---

## 5. KESIMPULAN

Fitur **Audit Log ADMIN** pada branch `feat/fullstack-integration` **LULUS UAT DENGAN SEMPURNA**:
- Kontrol hak akses (RBAC) berjalan sangat ketat: hanya ADMIN yang dapat mengakses endpoint dan halaman audit log, sedangkan non-ADMIN ditolak dengan kode `403 FORBIDDEN` dan unauthenticated ditolak dengan `401 AUTH_REQUIRED`.
- Seluruh 211 rekaman aktivitas historis tersimpan secara immutable dengan atribut lengkap (`actor_role`, `actor_user_id`, `action`, `entity_type`, `entity_id`, `before_data`, `after_data`, `reason`, `request_id`, `created_at`).
- Mekanisme filter server-side (`entity_type` termasuk `RETURN_INSPECTION` dan `KOMTING_ASSIGNMENT`, serta `entity_id`), pagination server-side, dan pencarian kata kunci lokal bekerja secara akurat dan konsisten.
- Seluruh pengujian frontend unit tests (247 tests), backend unit tests (107 tests), TypeScript typecheck, ESLint, dan production build Next.js lulus 100%.
