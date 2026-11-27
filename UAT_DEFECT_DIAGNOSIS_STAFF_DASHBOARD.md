# LAPORAN DIAGNOSIS CACAT UAT: DEFECT STAFF DASHBOARD UNKNOWN_ERROR
# PINJAM — Sistem Peminjaman Proyektor

**Dokumen ID:** `UAT-DEF-STAFF-DASHBOARD-DIAGNOSIS`  
**Tanggal Diagnosis:** 27 November 2026  
**Status Masalah:** Terkonfirmasi (*Confirmed Defect*)  
**Tingkat Keparahan (Severity):** 🟠 High  
**Prioritas:** P1 — Blocker Alur Operasional Staff  
**Akun Pengujian:** `conc-staff@example.test` (Role: `STAFF`)  
**Target Environment:** Supabase Live `PINJAM_TESTING` & Next.js Production Build (`localhost:3000`)

---

## 1. Gejala & Ringkasan Cacat

Saat penguji login menggunakan akun Staff (`conc-staff@example.test`) dan membuka halaman `/staff`:
- Halaman `/staff` berhasil dibuka dan guard otentikasi meloloskan role `STAFF`.
- Shell navigasi Staff (*sidebar*, *header*, tombol *Scan QR*) tampil normal.
- Namun, area konten utama dashboard gagal merender ringkasan metrik dan menampilkan pesan error:
  ```
  Gagal Memuat Dashboard STAFF
  Error Code: UNKNOWN_ERROR
  ```

---

## 2. Pelacakan Alur Frontend (Frontend Trace)

### 2.1 Halaman & Komponen Pemicu
- Halaman: `src/app/staff/page.tsx`
  - Membungkus tampilan dalam `<RoleGuard allowedRoles={["STAFF", "ADMIN"]}>` dan `<StaffShell>`.
  - Merender komponen inti: `<StaffDashboardView />`.
- Komponen: `src/features/staff/staff-dashboard-view.tsx`
  - Pada baris 34–37:
    ```ts
    const { data, loading, error, reload } = useAsyncQuery<StaffDashboardSummary | null>(async () => {
      const res = await services.admin.getStaffDashboard();
      return res.data ?? null;
    }, []);
    ```

### 2.2 Pemanggilan API Service
- Pada `src/services/api/api-services.ts` baris 214:
  ```ts
  admin: {
    getKomtingDashboard: () => apiRequest("/komting/dashboard"),
    getStaffDashboard: () => apiRequest("/staff/dashboard"),
    ...
  }
  ```
- Klien HTTP `src/lib/api/client.ts` menambahkan prefix versi `/api/v1`:
  - **URL Panggilan:** `GET http://localhost:3000/api/v1/staff/dashboard`
  - **Header Dikirim:**
    - `Accept: application/json`
    - `Authorization: Bearer <STAFF_JWT_TOKEN>`

---

## 3. Investigasi Backend & Bukti HTTP (Backend Verification)

### 3.1 Ketersediaan Route Handler
Pemeriksaan struktur direktori backend pada `src/app/api/v1/staff/`:
```
src/app/api/v1/staff/
├── bookings/
│   ├── [bookingId]/
│   │   ├── pickup/route.ts
│   │   └── route.ts
│   └── route.ts
├── loans/
│   ├── [loanId]/
│   │   ├── inspection/route.ts
│   │   ├── return/route.ts
│   │   └── route.ts
│   └── route.ts
└── qr/
    └── validate/route.ts
```
**Temuan Krusial:**
Berkas `src/app/api/v1/staff/dashboard/route.ts` **TIDAK TERSEDIA** (*completely missing*).  
Pemeriksaan pada manifest rute server Next.js (`.next/server/app-paths-manifest.json`) juga mengonfirmasi tidak ada rute `/api/v1/staff/dashboard/route`.

### 3.2 Bukti Pengujian HTTP Langsung (Live Test)
Pengujian eksekusi HTTP dilakukan terhadap server Next.js production build (`http://localhost:3000`) menggunakan sesi terautentikasi `conc-staff@example.test` di lingkungan `PINJAM_TESTING`:

```http
GET /api/v1/staff/dashboard HTTP/1.1
Host: localhost:3000
Accept: application/json
Authorization: Bearer <VALID_STAFF_BEARER_TOKEN>
```

**Respons yang Diterima:**
```http
HTTP/1.1 404 Not Found
Cache-Control: private, no-cache, no-store, max-age=0, must-revalidate
Content-Type: text/html; charset=utf-8
Content-Encoding: gzip
Date: Fri, 27 Nov 2026 09:38:30 GMT
Connection: keep-alive
Keep-Alive: timeout=5
X-Powered-By: Next.js

<!DOCTYPE html><html lang="id">...
<h3 class="text-base sm:text-lg font-bold">404 — Halaman Tidak Ditemukan</h3>
<p class="mt-1.5 text-sm">Halaman yang Anda cari tidak tersedia atau belum diimplementasikan pada tahap ini.</p>
...
```

### 3.3 Mengapa Muncul `UNKNOWN_ERROR` di Frontend?
Pada klien HTTP frontend `src/lib/api/client.ts`:
1. Respons berstatus HTTP `404` bukan format JSON dari `apiError` PINJAM.
2. Saat mencoba mengurai error body non-JSON (HTML 404), pemetaan kode fallback dieksekusi:
   ```ts
   function fallbackCodeFromStatus(status: number): ApiErrorCode {
     if (status === 401) return "AUTH_REQUIRED";
     if (status === 403) return "FORBIDDEN";
     return "UNKNOWN_ERROR"; // Status 404 dipetakan ke UNKNOWN_ERROR
   }
   ```
3. Komponen `StaffDashboardView` menangkap error ini dan merender:
   - Judul: `Gagal Memuat Dashboard STAFF`
   - Kode Error: `UNKNOWN_ERROR`

---

## 4. Analisis Kebutuhan Data Dashboard Staff

Berdasarkan `src/types/domain.ts`, struktur kontrak yang dibutuhkan oleh `StaffDashboardView` adalah:

```ts
export interface StaffActivityItem {
  id?: string;
  message: string;
  timestamp?: string;
}

export interface StaffDashboardSummary {
  bookings_today_count?: number;      // Total pemesanan untuk hari ini
  pending_pickup_count?: number;      // Total pemesanan CONFIRMED menunggu serah-terima
  active_loans_count?: number;        // Total peminjaman aktif yang sedang berjalan
  overdue_loans_count?: number;       // Total peminjaman aktif yang melewati estimasi kembali
  maintenance_units_count?: number;   // Total proyektor dalam pemeliharaan (MAINTENANCE)
  pending_pickups?: Booking[];        // Daftar booking menunggu pickup (ditampilkan di kartu)
  active_loans?: Loan[];              // Daftar peminjaman aktif (ditampilkan di kartu)
  maintenance_units?: Projector[];    // Daftar proyektor status MAINTENANCE
  recent_activities?: StaffActivityItem[]; // Riwayat aktivitas operasional terkini
}
```

### Kebutuhan Tampilan Antarmuka (`StaffDashboardView`):
1. **5 Kartu Ringkasan Metrik (KPI Cards):**
   - *Booking Hari Ini*: `data.bookings_today_count`
   - *Menunggu Pickup*: `data.pending_pickup_count` (atau panjang `data.pending_pickups`)
   - *Loan Aktif*: `data.active_loans_count` (atau panjang `data.active_loans`)
   - *Melewati Estimasi*: `data.overdue_loans_count`
   - *Unit Maintenance*: `data.maintenance_units_count` (atau panjang `data.maintenance_units`)
2. **Daftar Booking Menunggu Pickup:**
   - Menampilkan `booking.booking_code`, nama unit proyektor, `komting_id`, tanggal booking, jam mulai, status, dan tombol pintas *"Proses"* (`/staff/bookings/:id`).
3. **Daftar Loan Aktif & Pengembalian:**
   - Menampilkan `loan.id`, nama unit proyektor, waktu `picked_up_at`, status `ACTIVE`, dan tombol pintas *"Inspeksi Return"* (`/staff/loans/:id/return`).
4. **Feed Aktivitas Terkini:**
   - Alert info aktivitas operasional (`recent_activities`).

---

## 5. Pemetaan Backend Service yang Sudah Tersedia

Seluruh data yang diperlukan oleh dashboard Staff **telah memiliki service dan repository pendukung di backend**. Tidak diperlukan penambahan tabel database baru atau perubahan skema migrasi:

| Kebutuhan Data | Service Backend yang Tersedia | Fungsi & Metode Repository | Filter & Penjelasan |
|---|---|---|---|
| **Booking Menunggu Pickup** | `src/lib/bookings/booking-service.ts` | `createSupabaseBookingRepository().listStaffBookings()` | `status = 'CONFIRMED'`. Mengembalikan array `StaffBookingView[]` dan `totalItems`. |
| **Total Booking Hari Ini** | `src/lib/bookings/booking-service.ts` | `createSupabaseBookingRepository().listStaffBookings()` | `date = getJakartaNowParts().today`. Mengembalikan `totalItems`. |
| **Loan Aktif** | `src/lib/loans/loan-service.ts` | `createSupabaseLoanRepository().listStaffLoans()` | `status = 'ACTIVE'`. Mengembalikan array `StaffLoanView[]` dan `totalItems`. |
| **Loan Melewati Estimasi (Overdue)** | `src/lib/loans/loan-service.ts` | Dihitung dari `active_loans` | Membandingkan `booking.estimated_return_at < new Date().toISOString()`. |
| **Unit Maintenance** | `src/lib/projectors/projector-service.ts` | `createSupabaseProjectorRepository().listProjectors()` | `physicalStatus = 'MAINTENANCE'`. Mengembalikan unit dalam pemeliharaan dan `totalItems`. |
| **Aktivitas Terkini** | Tabel `audit_logs` atau recent transactions | Query 5 baris terakhir dari `audit_logs` (aksi `BOOKING_CREATED`, `PICKUP_CONFIRMED`, `RETURN_INSPECTED`, dsb.) | Menyajikan pesan aktivitas operasional ramah pengguna dengan timestamp. |

---

## 6. Perbandingan Kontrak Frontend vs Implementasi Backend

| Aspek | Ekspektasi Frontend | Kondisi Backend Saat Ini | Status Kesenjangan |
|---|---|---|:---:|
| **Route Handler** | `GET /api/v1/staff/dashboard` | Belum dibuat (`404 Not Found`) | ❌ **Blocker** |
| **Otorisasi** | Khusus role `STAFF` dan `ADMIN` aktif | Guard `requireStaffOrAdmin()` sudah ada di `src/lib/auth/guards.ts` | ✅ Siap pakai |
| **Bentuk Respons** | `ApiSingleResponse<StaffDashboardSummary>` | Belum ada controller pemformat | ❌ Perlu dibuat |
| **Kueri Data** | Gabungan data booking, loan, proyektor, dan audit | Service modular tersedia di `src/lib/bookings`, `src/lib/loans`, `src/lib/projectors` | ✅ Siap dirangkai |

---

## 7. Rekomendasi Solusi & Rencana Implementasi

Sama halnya dengan penanganan `DEF-001` (Dashboard Komting) yang telah sukses diimplementasikan dan ditutup, pendekatan terbaik adalah **Menerapkan Route Handler Backend & Service Agregator Khusus**.

### Langkah Rekomendasi:
1. **Buat Service Agregator Dashboard Staff:**
   - Berkas: `src/lib/staff/staff-dashboard-service.ts`
   - Mengagregasi pemanggilan data secara paralel (`Promise.all`):
     - `listStaffBookings` untuk pending pickups (`status: 'CONFIRMED'`) dan booking hari ini.
     - `listStaffLoans` untuk loan aktif (`status: 'ACTIVE'`).
     - Hitung pinjaman yang telah melewati batas `estimated_return_at` (*overdue*).
     - `listProjectors` untuk unit berstatus `MAINTENANCE`.
     - Ambil entri aktivitas terkini (dari `audit_logs` atau riwayat transaksi).
   - Menyusun respons sesuai tipe `StaffDashboardSummary`.
2. **Buat Route Handler:**
   - Berkas: `src/app/api/v1/staff/dashboard/route.ts`
   - Menggunakan `requireStaffOrAdmin(request)`.
   - Mengembalikan `jsonSuccess(summary, { status: 200, requestId })`.
   - Menangani error dengan `toSafeAuthErrorResponse(error, requestId)`.
3. **Pengujian Regresi:**
   - Buat unit test regresi di `tests/be4/` atau `tests/staff/` untuk menguji:
     - Hak akses role `STAFF` dan `ADMIN` (200 OK).
     - Penolakan akses role `KOMTING` (`403 Forbidden`).
     - Penolakan request tanpa autentikasi (`401 Unauthorized`).
     - Integritas data agregasi ringkasan.
4. **Verifikasi Lingkungan Staging & Browser:**
   - Jalankan live API call menggunakan token `conc-staff@example.test`.
   - Muat halaman `/staff` pada browser untuk memastikan dashboard operasional tampil sempurna.

---

## 8. Status Akhir Diagnosis

Diagnosis selesai tanpa melakukan modifikasi kode, migrasi, atau basis data. Akar masalah telah terbukti secara definitif adalah ketiadaan route handler `src/app/api/v1/staff/dashboard/route.ts`.

Menunggu persetujuan pemilik produk untuk memulai tahap perbaikan.
