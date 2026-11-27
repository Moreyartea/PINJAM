# LAPORAN PERBAIKAN DEFECT UAT: KOMTING DASHBOARD API

**ID Defect:** `DEF-001`  
**Test Case Terkait:** `UAT-KMT-04` (Login Komting Aktif & Dashboard Mahasiswa)  
**Branch:** `feat/fullstack-integration`  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build  
**Tanggal Penyelesaian:** 27 November 2026  
**Status:** **RESOLVED / CLOSED (PASS)**  

---

## 1. Ringkasan Masalah & Root Cause

### Gejala Masalah
Saat tester melakukan pengujian login menggunakan akun Komting `conc-komting2@example.test` pada rute `/komting`:
- Halaman berhasil dibuka dan header navigasi menampilkan nama pengguna.
- Konten utama dashboard menampilkan kartu error: `"Gagal Memuat Dashboard"` dengan error code `"UNKNOWN_ERROR"`.

### Akar Masalah (Root Cause)
1. **Endpoint Belum Ada di Backend:**  
   Komponen `KomtingDashboardView` memanggil `services.admin.getKomtingDashboard()` yang menembak `GET /api/v1/komting/dashboard`. Backend BE-1 s/d BE-6 belum menyediakan rute handler tersebut, sehingga Next.js mengembalikan respons HTTP `404 Not Found` berformat HTML.
2. **Pemetaan Kode Error di Client:**  
   Fungsi `fallbackCodeFromStatus(404)` pada client HTTP memetakan kode status 404 menjadi `"UNKNOWN_ERROR"`.

---

## 2. Implementasi Solusi (Opsi A: Backend Route Handler)

Sesuai persetujuan, perbaikan dilakukan melalui implementasi rute handler backend terpusat tanpa mengubah kontrak frontend maupun skema database:

### A. Komponen Layanan: `src/lib/komting/komting-dashboard-service.ts`
- Mengekspor fungsi `getKomtingDashboardData(context, deps)`.
- Mengagregasi data secara paralel (`Promise.all`):
  - **`active_assignment`**: Diambil dari session pengguna terautentikasi (`context.komtingAssignment`).
  - **`active_booking`**: Mengambil booking aktif Komting (`status = 'CONFIRMED'`) melalui `listKomtingBookings`.
  - **`active_loan`**: Mengambil pinjaman aktif Komting (`status = 'ACTIVE'`) melalui `listKomtingLoans`.
  - **`recent_bookings`**: Mengambil riwayat 5 booking terakhir Komting.
  - **`relevant_projectors`**: Menampilkan inventaris unit proyektor aktif melalui `listProjectors`.
  - **`reminders`**: Menghasilkan pengingat kontekstual (peringatan penugasan nonaktif, pengingat pengambilan booking aktif, atau pengingat batas waktu pengembalian loan aktif).

### B. Route Handler: `src/app/api/v1/komting/dashboard/route.ts`
- Menerapkan proteksi `requireRole(["KOMTING"], request)`.
- Mengembalikan envelope JSON standar:
  ```json
  {
    "data": { ...KomtingDashboardSummary },
    "meta": { "request_id": "req_..." }
  }
  ```
- Menangani pengecualian melalui `toSafeAuthErrorResponse(error, requestId)`.

### C. Keamanan & Isolasi Data
- **Identitas Terproteksi:** Identitas Komting diambil dari `context.user.id` hasil verifikasi token JWT Supabase Auth pada `public.users`, bukan dari query parameter yang rentan manipulasi.
- **Isolasi Multi-Tenant:** Query ke database selalu difilter berdasarkan `komting_id = context.user.id`. Komting tidak dapat membaca data Komting lain.
- **Role Guard:** Pengguna dengan role `STAFF` dan `ADMIN` langsung ditolak dengan status HTTP 403 `FORBIDDEN`.
- **Status Guard:** Pengguna dengan `account_status: "INACTIVE"` langsung ditolak dengan status HTTP 403 `ACCOUNT_NOT_ACTIVE`.
- **Autentikasi Guard:** Permintaan tanpa token ditolak dengan status HTTP 401 `AUTH_REQUIRED`.

---

## 3. Pengujian Regresi (Regression Tests)

### A. Backend Unit Tests (`tests/be4/komting-dashboard.test.ts`)
Telah diimplementasikan 8 skenario pengujian komprehensif:
1. `KOMTING ACTIVE berhasil memperoleh dashboard` -> **PASS (HTTP 200)**
2. `KOMTING tanpa booking atau loan tetap memperoleh dashboard valid` -> **PASS (HTTP 200, null/empty state)**
3. `KOMTING tidak dapat membaca data KOMTING lain` -> **PASS (Isolasi data terverifikasi)**
4. `STAFF ditolak` -> **PASS (HTTP 403, FORBIDDEN)**
5. `ADMIN ditolak` -> **PASS (HTTP 403, FORBIDDEN)**
6. `Pengguna INACTIVE ditolak` -> **PASS (HTTP 403, ACCOUNT_NOT_ACTIVE)**
7. `Request tanpa token ditolak` -> **PASS (HTTP 401, AUTH_REQUIRED)**
8. `Error database ditangani dengan benar` -> **PASS (HTTP 500, DATABASE_ERROR envelope)**

### B. Frontend Component Tests (`src/features/komting/__tests__/komting-dashboard-view.test.tsx`)
4 skenario unit test vitest untuk `KomtingDashboardView`:
1. `renders loading state initially` -> **PASS**
2. `renders full dashboard data when API succeeds` -> **PASS**
3. `renders empty states when no active booking or loan exists` -> **PASS**
4. `renders error state and retries on failure` -> **PASS**

---

## 4. Hasil Verifikasi Sistem

| Kategori Pengujian | Perintah / Alat | Hasil | Status |
|---|---|---|:---:|
| **Backend Unit Tests** | `npm run test:unit:be` | 162/162 tests passed | ✅ **PASS** |
| **Frontend Unit Tests** | `npm run test:unit:fe` | 201/201 tests passed (32 test files) | ✅ **PASS** |
| **TypeScript Typecheck** | `npm run typecheck` | 0 errors | ✅ **PASS** |
| **ESLint** | `npm run lint` | 0 errors | ✅ **PASS** |
| **Production Build** | `npm run build` | Route `/api/v1/komting/dashboard` berhasil terkompilasi | ✅ **PASS** |
| **Live API Test** | `node test-script` | HTTP 200 dengan Bearer JWT & Cookie pada `PINJAM_TESTING` | ✅ **PASS** |
| **Browser Visual UAT** | Chrome Headless + CDP | Visual dashboard lengkap, error UNKNOWN_ERROR hilang | ✅ **PASS** |

### Bukti Respons Live API Supabase `PINJAM_TESTING`
```json
{
  "data": {
    "active_assignment": {
      "id": "866be164-228b-4d5c-a386-10bfe6868324",
      "user_id": "4d0a994d-b9b0-4c86-8021-6dbe059b9903",
      "class_name": "IF-TEST-02",
      "status": "ACTIVE",
      "started_at": "2026-11-26T13:45:40.425499+00:00",
      "ended_at": null
    },
    "active_booking": {
      "id": "60e98588-9459-46d2-bcc0-d8684694c010",
      "booking_code": "BKG-CONC-2",
      "komting_id": "4d0a994d-b9b0-4c86-8021-6dbe059b9903",
      "projector_id": "24c97f6b-fb6a-4c2f-8ea5-9bc5c31b2e1f",
      "booking_date": "2026-11-27",
      "start_time": "10:00:00",
      "estimated_return_at": "2026-11-27T05:00:00+00:00",
      "status": "CONFIRMED",
      "pickup_window": {
        "opens_at": "2026-11-27T02:30:00+00:00",
        "closes_at": "2026-11-27T03:15:00+00:00"
      },
      "created_at": "2026-11-26T11:24:13.850862+00:00"
    },
    "active_loan": null,
    "recent_bookings": [ ... ],
    "relevant_projectors": [ ... ],
    "reminders": [
      {
        "id": "rem_active_booking",
        "level": "info",
        "message": "Anda memiliki booking aktif (BKG-CONC-2). Pengambilan proyektor dapat dilakukan pada jendela pickup."
      }
    ]
  },
  "meta": {
    "request_id": "req_da0d03c2-828f-4469-aeb8-51337c443c29"
  }
}
```

### Bukti Screenshot UAT Browser
Tangkapan layar browser verifikasi telah disimpan di:
- `uat-kmt-04-dashboard.png`

---

## 5. Kesimpulan UAT

Dengan diterapkannya endpoint `GET /api/v1/komting/dashboard`:
1. Defect `DEF-001` resmi dinyatakan **RESOLVED / CLOSED**.
2. Skenario test case **`UAT-KMT-04`** pada dokumen [UAT_TEST_CASES_PINJAM.md](file:///Users/user/Desktop/TUGAS_KEEGAN%20/SEM%203/BLOK%202/Metode%20Numerik/PINJAM/UAT_TEST_CASES_PINJAM.md#L685-L701) telah berstatus **`PASS`**.
3. Tidak ada modifikasi pada migration 001–017, skema database, aturan RLS, maupun commit/push ke Git remote.
