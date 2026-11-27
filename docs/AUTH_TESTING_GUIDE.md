# Panduan Provisioning & Live Auth Testing (`PINJAM_TESTING`)

Dokumen ini menjelaskan cara menyiapkan akun pengujian, memverifikasi identity linking ke `public.users`, menjalankan live integration tests terhadap Supabase project **`PINJAM_TESTING`**, dan membersihkan data uji secara aman.

> **Keamanan:** Jangan pernah menyimpan password pengujian, access token, refresh token, atau `SUPABASE_SERVICE_ROLE_KEY` ke dalam repository atau log. Jangan pernah mengarahkan skrip ini ke project production atau project PINJAM lama.

---

## 1. Environment Variables yang Diperlukan

Siapkan pada `.env.local` (atau shell session) untuk project **`PINJAM_TESTING`**:

- `NEXT_PUBLIC_SUPABASE_URL` — URL project `PINJAM_TESTING`.
- `NEXT_PUBLIC_SUPABASE_ANON_KEY` (atau `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`) — public key project `PINJAM_TESTING`.
- `SUPABASE_SERVICE_ROLE_KEY` — secret/service-role key **server-only** untuk project `PINJAM_TESTING`.
- `NEXT_PUBLIC_USE_MOCK_API=false`

Tambahan environment variable **eksplisit saat menjalankan provisioning / live test** (di-export di shell sesi terminal saja, tidak ditulis ke file yang di-commit):

- `PINJAM_ALLOW_TEST_PROVISIONING=true` — guard wajib agar provisioning hanya berjalan atas tindakan eksplisit developer.
- `PINJAM_TEST_USER_PASSWORD` — password akun uji (minimal 12 karakter, tidak di-hardcode).
- `PINJAM_TEST_ADMIN_EMAIL` (opsional, default `conc-admin@example.test`).
- `PINJAM_RUN_LIVE_AUTH_TESTS=true` — mengaktifkan suite live integration test.

---

## 2. Prasyarat Database (`Migration 011`)

Pastikan seluruh migration `001`–`011` sudah diterapkan pada `PINJAM_TESTING`, termasuk:
- `supabase/migrations/20261126000011_grant_service_role_privileges.sql` yang memberikan `GRANT` eksplisit pada tabel, sequence, dan fungsi di schema `public` kepada `service_role` (dibutuhkan apabila `001`–`010` diterapkan lewat `psql` tanpa default privileges Supabase untuk `service_role`).

---

## 3. Cara Menjalankan Provisioning Akun Pengujian

Script: `scripts/provision-test-accounts.mjs`

```bash
PINJAM_ALLOW_TEST_PROVISIONING=true \
PINJAM_TEST_USER_PASSWORD="<masukkan-password-uji-min-12-karakter>" \
npm run provision:test-accounts
```

Yang dilakukan skrip secara idempotent:
1. Mempertahankan 3 profil `public.users` yang sudah ada (`conc-staff@example.test`, `conc-komting1@example.test`, `conc-komting2@example.test`) tanpa membuat duplikat atau mengubah role/status secara sembarangan.
2. Membuat 1 profil `ADMIN` pengujian (`conc-admin@example.test`) di `public.users` jika belum ada.
3. Membuat / memperbarui akun di Supabase Auth (`auth.users`) dengan `email_confirm: true` dan tanpa mencetak password/token.
4. Menautkan `public.users.auth_provider_user_id` ke UID `auth.users` yang cocok (hanya jika masih `NULL` atau sudah identik).
5. Membuat `komting_assignments` berstatus `ACTIVE` yang valid untuk kedua akun KOMTING (`IF-TEST-01` untuk `conc-komting1@example.test` dan `IF-TEST-02` untuk `conc-komting2@example.test`) bila belum memiliki assignment aktif.

---

## 4. Cara Menjalankan Live Integration Tests

```bash
PINJAM_RUN_LIVE_AUTH_TESTS=true \
PINJAM_TEST_USER_PASSWORD="<password-uji-yang-sama>" \
npm run test:auth:live
```

Skenario yang diuji terhadap `PINJAM_TESTING`:
- Login valid `STAFF`, `KOMTING`, dan `ADMIN`.
- Penolakan login dengan password salah.
- Pengambilan session melalui `GET /api/v1/auth/session` dan `getServerSessionContext`.
- Logout melalui `POST /api/v1/auth/logout` dan validasi bahwa JWT lama menjadi `401` setelah logout.
- Auto-linking `auth_provider_user_id` untuk profil `public.users` yang belum tertaut saat login email terverifikasi.
- Guard otorisasi role (`ADMIN`, `STAFF`, `KOMTING`), `requireActiveKomting` dengan assignment aktif, serta penolakan `403 KOMTING_ASSIGNMENT_REQUIRED` bila assignment tidak ada atau `INACTIVE`.

---

## 5. Cara Memeriksa Hasil di Supabase Dashboard

### Memeriksa Akun Auth
1. Buka Supabase Dashboard project **`PINJAM_TESTING`**.
2. Masuk ke menu **Authentication → Users**.
3. Pastikan keempat email (`conc-staff@example.test`, `conc-komting1@example.test`, `conc-komting2@example.test`, `conc-admin@example.test`) muncul dengan status email **Confirmed** dan salin/catat kolom **User UID**.

### Memeriksa Identity Linking & Assignment di SQL Editor
Jalankan query read-only berikut di **SQL Editor** `PINJAM_TESTING`:

```sql
SELECT
  u.id,
  u.email,
  u.role,
  u.account_status,
  u.auth_provider_user_id,
  au.email_confirmed_at,
  ka.class_name AS active_class_name,
  ka.status AS assignment_status
FROM public.users u
LEFT JOIN auth.users au
  ON au.id::text = u.auth_provider_user_id
LEFT JOIN public.komting_assignments ka
  ON ka.user_id = u.id AND ka.status = 'ACTIVE'
WHERE u.email IN (
  'conc-staff@example.test',
  'conc-komting1@example.test',
  'conc-komting2@example.test',
  'conc-admin@example.test'
)
ORDER BY u.email;
```

Pastikan `auth_provider_user_id` terisi dan cocok dengan `auth.users.id`, serta kedua akun `KOMTING` memiliki `assignment_status = 'ACTIVE'` dengan `active_class_name` yang berbeda.

---

## 6. Cara Membersihkan Akun dan Data Pengujian Secara Aman

Gunakan langkah berikut **hanya pada project `PINJAM_TESTING`** setelah pengujian selesai:

1. Hapus assignment dan profil uji di **SQL Editor** (pastikan belum ada booking/loan uji yang mereferensikannya, atau hapus data uji terkait lebih dulu karena FK memakai `ON DELETE RESTRICT`):

```sql
BEGIN;

DELETE FROM public.komting_assignments
WHERE user_id IN (
  SELECT id FROM public.users
  WHERE email IN (
    'conc-staff@example.test',
    'conc-komting1@example.test',
    'conc-komting2@example.test',
    'conc-admin@example.test'
  )
);

DELETE FROM public.users
WHERE email IN (
  'conc-staff@example.test',
  'conc-komting1@example.test',
  'conc-komting2@example.test',
  'conc-admin@example.test'
);

COMMIT;
```

2. Hapus akun Auth di **Authentication → Users** (pilih keempat email uji di atas lalu **Delete user**), sehingga tidak ada UID yatim di `auth.users`.
