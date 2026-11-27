# FRONTEND STAFF MANAGEMENT API GAP & SPECIFICATION PROPOSAL

> **STATUS DOKUMEN: PROPOSAL TEKNIS ARSITEKTUR (BUKAN KONTRAK RESMI API)**  
> Dokumen ini disusun oleh tim frontend PINJAM pada tahap **FE-13.0** sebagai usulan spesifikasi formal (*Request for Comments / RFC*) untuk tim backend. Usulan ini menjembatani kebutuhan administratif peran `ADMIN` dalam mengelola akun `STAFF` yang tercantum pada hak akses §3.4 `API_CONTRACT_PINJAM.md`, namun belum didefinisikan endpoint HTTP-nya pada kontrak API v1.0.0.

---

## 1. Latar Belakang & Analisis Kontrak

Pada `API_CONTRACT_PINJAM.md` (v1.0.0):
1. **Matriks Akses (§3.4)** secara eksplisit menetapkan bahwa area *"Mengelola akun STAFF"* hanya diizinkan untuk peran `ADMIN`.
2. **Definisi Peran (§3.2)** menyatakan:
   - `STAFF`: Bertanggung jawab atas operasional transaksi harian (pickup, return, inspeksi kondisi fisik, dan pemeliharaan proyektor).
   - `ADMIN`: Seluruh hak STAFF ditambah verifikasi komting, pengelolaan akun STAFF, konfigurasi operasional, koreksi transaksi, dan audit log.
3. **Ketiadaan Endpoint HTTP Resmi**:
   - Bagian §5 API Contract hanya mendefinisikan endpoint profil pengguna sendiri (`GET /api/v1/me` dan `PATCH /api/v1/me`), di mana field `role` dan `account_status` bersifat *read-only* dan tidak dapat diubah (§5.2).
   - Tidak ada endpoint resmi untuk menampilkan daftar staf, membuat akun staf baru, mengubah data staf lain, maupun mengaktifkan/menonaktifkan akun staf.
4. **Prinsip Keamanan Frontend**:
   - Sesuai aturan arsitektur, frontend **dilarang keras** mengarang endpoint fiktif di kode produksi atau membuat akun menggunakan Supabase Auth `anon_key` dari sisi klien (*client-side self-registration* bypass).
   - Oleh karena itu, modul `/admin/staff` menampilkan informasi profil terautentikasi (§5.1–5.2) serta pemberitahuan transparansi *Contract Gap*, sementara dokumen proposal ini mendefinisikan rancangan kontrak yang diperlukan oleh backend.

---

## 2. Fitur Fungsional yang Dibutuhkan

Untuk mendukung operasional laboratorium peminjaman proyektor, peran `ADMIN` membutuhkan kemampuan:
1. **Daftar Akun STAFF**: Melihat seluruh akun staf dengan dukungan paginasi, pencarian nama/email, dan filter status akun (`ACTIVE` / `INACTIVE`).
2. **Detail Akun STAFF**: Melihat informasi detail profil staf, waktu pembuatan akun, status terakhir, dan riwayat aktivitas operasional.
3. **Pembuatan Akun STAFF**: Mendaftarkan akun staf baru secara terpusat oleh ADMIN tanpa memperbolehkan pendaftaran mandiri publik.
4. **Pembaruan Informasi STAFF**: Memperbarui nama lengkap atau kontak staf tanpa mengubah role atau hak akses di luar wewenang.
5. **Aktivasi & Penonaktifan Akun STAFF**:
   - Menolak akses staf yang sudah tidak bertugas dengan menandai akun `INACTIVE`.
   - Mengaktifkan kembali akun staf yang sempat dinonaktifkan.
   - Tidak menghapus riwayat transaksi (pickup, return, maintenance) maupun riwayat audit log saat akun dinonaktifkan.

---

## 3. Usulan Endpoint API (PROPOSAL)

### 3.1 Daftar Akun STAFF

Mengambil daftar pengguna dengan role `STAFF`.

```http
GET /api/v1/admin/staff?status=ACTIVE&search=budi&page=1&page_size=20
Authorization: Bearer <admin_access_token>
```

#### Query Parameters:
- `status` (opsional): Enum string `ALL` | `ACTIVE` | `INACTIVE`. Default: `ALL`.
- `search` (opsional): String pencarian case-insensitive untuk `full_name` atau `email`.
- `page` (opsional): Integer $\ge 1$. Default: `1`.
- `page_size` (opsional): Integer $1 \dots 100$. Default: `20`.

#### Response `200 OK`:
```json
{
  "data": [
    {
      "id": "usr_staff_01",
      "email": "staff1@kampus.ac.id",
      "full_name": "Budi Santoso",
      "role": "STAFF",
      "account_status": "ACTIVE",
      "created_at": "2026-11-20T08:00:00Z",
      "last_sign_in_at": "2026-11-27T07:15:00Z"
    }
  ],
  "meta": {
    "request_id": "req_staff_list_01",
    "pagination": {
      "page": 1,
      "page_size": 20,
      "total_items": 1,
      "total_pages": 1
    }
  }
}
```

---

### 3.2 Detail Akun STAFF

Mengambil rincian akun staf berdasarkan ID pengguna.

```http
GET /api/v1/admin/staff/{user_id}
Authorization: Bearer <admin_access_token>
```

#### Response `200 OK`:
```json
{
  "data": {
    "id": "usr_staff_01",
    "email": "staff1@kampus.ac.id",
    "full_name": "Budi Santoso",
    "role": "STAFF",
    "account_status": "ACTIVE",
    "created_at": "2026-11-20T08:00:00Z",
    "last_sign_in_at": "2026-11-27T07:15:00Z"
  },
  "meta": {
    "request_id": "req_staff_detail_01"
  }
}
```

---

### 3.3 Pembuatan Akun STAFF Baru

ADMIN mendaftarkan akun staf baru. Backend secara aman memicu Supabase Auth Admin API untuk mengirim email undangan (*invitation email*) atau link aktivasi password awal.

```http
POST /api/v1/admin/staff
Authorization: Bearer <admin_access_token>
Idempotency-Key: <uuid-v4>
Content-Type: application/json
```

#### Request Body:
```json
{
  "email": "staff_baru@kampus.ac.id",
  "full_name": "Rian Hidayat"
}
```

#### Response `201 Created`:
```json
{
  "data": {
    "id": "usr_staff_02",
    "email": "staff_baru@kampus.ac.id",
    "full_name": "Rian Hidayat",
    "role": "STAFF",
    "account_status": "ACTIVE",
    "created_at": "2026-11-27T09:00:00Z"
  },
  "meta": {
    "request_id": "req_staff_create_01"
  }
}
```

---

### 3.4 Pembaruan Informasi Akun STAFF

ADMIN memperbarui informasi profil akun staf (misal koreksi penulisan nama lengkap).

```http
PATCH /api/v1/admin/staff/{user_id}
Authorization: Bearer <admin_access_token>
Content-Type: application/json
```

#### Request Body:
```json
{
  "full_name": "Rian Hidayat, S.Kom."
}
```

#### Response `200 OK`:
```json
{
  "data": {
    "id": "usr_staff_02",
    "email": "staff_baru@kampus.ac.id",
    "full_name": "Rian Hidayat, S.Kom.",
    "role": "STAFF",
    "account_status": "ACTIVE",
    "created_at": "2026-11-27T09:00:00Z"
  },
  "meta": {
    "request_id": "req_staff_patch_01"
  }
}
```

---

### 3.5 Penonaktifan Akun STAFF

Menonaktifkan hak operasional staf dengan mengubah status akun menjadi `INACTIVE` dan mencabut sesi aktif.

```http
POST /api/v1/admin/staff/{user_id}/deactivate
Authorization: Bearer <admin_access_token>
Content-Type: application/json
```

#### Request Body:
```json
{
  "reason": "Masa penugasan di laboratorium telah berakhir."
}
```

#### Response `200 OK`:
```json
{
  "data": {
    "id": "usr_staff_02",
    "email": "staff_baru@kampus.ac.id",
    "full_name": "Rian Hidayat, S.Kom.",
    "role": "STAFF",
    "account_status": "INACTIVE",
    "updated_at": "2026-11-27T10:00:00Z"
  },
  "meta": {
    "request_id": "req_staff_deact_01"
  }
}
```

---

### 3.6 Pengaktifan Kembali Akun STAFF

Mengaktifkan kembali staf yang berstatus `INACTIVE`.

```http
POST /api/v1/admin/staff/{user_id}/activate
Authorization: Bearer <admin_access_token>
Content-Type: application/json
```

#### Response `200 OK`:
```json
{
  "data": {
    "id": "usr_staff_02",
    "email": "staff_baru@kampus.ac.id",
    "full_name": "Rian Hidayat, S.Kom.",
    "role": "STAFF",
    "account_status": "ACTIVE",
    "updated_at": "2026-11-27T10:30:00Z"
  },
  "meta": {
    "request_id": "req_staff_act_01"
  }
}
```

---

## 4. Validasi & Error Codes

| Kode HTTP | Error Code | Skenario Pemicu |
| :--- | :--- | :--- |
| `400` | `VALIDATION_ERROR` | Format email tidak valid, nama kosong, atau alasan penonaktifan kosong. |
| `401` | `UNAUTHORIZED` | Token autentikasi kedaluwarsa atau tidak valid. |
| `403` | `FORBIDDEN` | Pengguna bukan peran `ADMIN`. Peran `STAFF` dan `KOMTING` dilarang keras. |
| `404` | `USER_NOT_FOUND` | ID akun STAFF yang ditargetkan tidak ditemukan di database. |
| `409` | `EMAIL_ALREADY_EXISTS` | Email yang diajukan sudah terdaftar di sistem. |
| `409` | `CANNOT_DEACTIVATE_SELF` | ADMIN tidak boleh menonaktifkan akun sendiri melalui endpoint ini. |
| `409` | `INVALID_ROLE_TARGET` | Target pengguna bukan bertipe `STAFF` (misal mencoba mengubah sesama ADMIN atau Komting). |
| `422` | `UNPROCESSABLE_ENTITY` | Payload tidak dapat diproses oleh database/server. |

---

## 5. Arsitektur Keamanan & Relasi Supabase Auth

Karena sistem autentikasi PINJAM menggunakan **Supabase Auth** yang terintegrasi dengan tabel aplikasi `public.users`:

```text
[ ADMIN Browser Client ]
         │
         │ (1) POST /api/v1/admin/staff { email, full_name }
         │     Authorization: Bearer <admin_token>
         ▼
[ Next.js Backend Route Handler ] (Server-Side Aman)
         │
         │ (2) Verifikasi Role ADMIN di public.users
         │ (3) Panggil Supabase Auth Admin API (Service Role Key)
         ▼
[ Supabase Auth (auth.users) ] ────(4) Kirim Email Invitas/Password Reset ───► [ Email Petugas STAFF ]
         │
         │ (5) Insert record sinkronisasi
         ▼
[ Database public.users ] { id, email, full_name, role: 'STAFF', account_status: 'ACTIVE' }
         │
         │ (6) Catat Audit Log
         ▼
[ Database public.audit_logs ] { action: 'STAFF_CREATED', ... }
```

### Prinsip Keamanan Wajib:
1. **Tidak Ada Password Plain Text**: ADMIN maupun frontend tidak pernah melihat, menerima, atau mengatur password staf secara langsung. Staf mengatur password pribadi melalui email aktivasi aman dari Supabase.
2. **Kerahasiaan Service Role Key**: `SUPABASE_SERVICE_ROLE_KEY` hanya tersimpan di variabel lingkungan backend (`process.env.SUPABASE_SERVICE_ROLE_KEY`) dan **tidak pernah bocor** ke browser klien (`NEXT_PUBLIC_*`).
3. **Pencabutan Sesi Penonaktifan**: Saat status staf diubah menjadi `INACTIVE`, backend memanggil API Supabase Auth admin untuk membatalkan semua *refresh token* aktif staf tersebut sehingga staf langsung ter-logout dari aplikasi.

---

## 6. Audit Logging Wajib (§13 API Contract)

Sesuai aturan ketertelusuran transaksi di `API_CONTRACT_PINJAM.md` §13, setiap operasi manajemen staf oleh ADMIN wajib mencatat log ke tabel `public.audit_logs`:

| Aksi | Action Enum | Entity Type | Metadata Audit |
| :--- | :--- | :--- | :--- |
| Pembuatan akun staf | `STAFF_CREATED` | `USER` | `actor_id` (admin), `entity_id` (staff), data awal `{ email, full_name, role }`. |
| Perubahan nama staf | `STAFF_UPDATED` | `USER` | Snapshot `before_data` dan `after_data`. |
| Penonaktifan staf | `STAFF_DEACTIVATED` | `USER` | `reason`, snapshot status `ACTIVE` $\rightarrow$ `INACTIVE`. |
| Pengaktifan staf | `STAFF_ACTIVATED` | `USER` | Snapshot status `INACTIVE` $\rightarrow$ `ACTIVE`. |

---

## 7. Kesimpulan & Status Implementasi Frontend

1. **Frontend Saat Ini**:
   - Menjaga integritas kontrak dengan tidak mengeksekusi endpoint spekulatif.
   - Halaman `/admin/staff` menampilkan profil terautentikasi (§5.1–5.2) dengan validasi nama dan pencegahan *double submission*.
   - Menyajikan pemberitahuan transparansi *Contract Gap* kepada pengguna dan mengarahkan pengembang ke proposal dokumen ini.
2. **Langkah Berikutnya**:
   - Tim backend mengadopsi usulan endpoint di atas ke dalam `API_CONTRACT_PINJAM.md`.
   - Mengimplementasikan route handler backend dan database migration.
   - Tim frontend akan segera mengaktifkan form interaktif CRUD penuh di `/admin/staff` begitu endpoint dinyatakan resmi.
