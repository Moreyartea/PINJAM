"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge, StatusBadge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import { validateUpdateMeForm, type UpdateMeValidationErrors } from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { UserProfile } from "@/types/domain";

export function AdminStaffManagementView() {
  const [draftFullName, setDraftFullName] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UpdateMeValidationErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const {
    data: currentUser,
    loading,
    error,
    reload,
  } = useAsyncQuery<UserProfile>(async () => {
    const res = await services.me.getMe();
    return res.data;
  }, []);

  const fullName = draftFullName ?? currentUser?.full_name ?? "";

  const handleRequestUpdateProfile = (event: React.FormEvent) => {
    event.preventDefault();
    setSaveError(null);
    setSaveSuccess(null);

    const errors = validateUpdateMeForm({ fullName });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmUpdateProfile = async () => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveSuccess(null);

    try {
      const res = await services.me.updateMe({ full_name: fullName.trim() });
      setConfirmOpen(false);
      setDraftFullName(null);
      setFieldErrors({});
      setSaveSuccess(`Nama profil akun Anda berhasil diperbarui menjadi "${res.data.full_name}".`);
      await reload();
    } catch (err) {
      setConfirmOpen(false);
      setSaveError(normalizeUnknownError(err).message);
    } finally {
      setSaving(false);
      submittingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengelolaan Akun Pengguna &amp; STAFF"
        description="Manajemen akun petugas operasional STAFF oleh ADMIN serta informasi profil pengguna terautentikasi sesuai API Contract."
        actions={
          <>
            <Badge tone="warning" symbol="!">
              DUKUNGAN PARSIAL KONTRAK
            </Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/admin">
              <Button variant="outline" size="sm">
                Kembali ke Dashboard
              </Button>
            </Link>
          </>
        }
      />

      <Alert tone="warning" title="Menunggu Finalisasi API Contract Manajemen STAFF">
        <p>
          <strong>API_CONTRACT_PINJAM.md (v1.0.0)</strong> belum mendefinisikan endpoint maupun
          struktur request/response untuk daftar akun STAFF, pencarian &amp; pagination, pembuatan
          akun STAFF manual, pembaruan data akun STAFF lain, aktivasi/penonaktifan akun STAFF,
          maupun pengelolaan role pengguna.
        </p>
        <p className="mt-1">
          Sesuai kebijakan kontrak, frontend tidak membuat endpoint atau payload fiktif, tidak
          menggunakan endpoint auth sebagai manajemen STAFF, tidak menyediakan pendaftaran mandiri (
          <em>self-registration</em>) untuk role <code>STAFF</code>, dan tidak menyediakan fungsi
          untuk mengubah role pengguna menjadi <code>ADMIN</code> atau menghapus histori
          transaksi/audit.
        </p>
      </Alert>

      <EmptyState
        title="Endpoint Manajemen Akun STAFF Belum Tersedia di API Contract"
        description="Daftar akun STAFF, pencarian & pagination, form pembuatan akun STAFF manual oleh ADMIN, ubah informasi STAFF, serta aktivasi/penonaktifan akun akan diaktifkan setelah endpoint resmi disepakati pada API Contract dan disiapkan oleh backend."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin">
              <Button variant="primary" size="sm">
                Kembali ke Dashboard ADMIN
              </Button>
            </Link>
            <Link href="/staff">
              <Button variant="outline" size="sm">
                Buka Operasional STAFF
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <CardTitle>Profil Akun Terautentikasi (§5.1–5.2)</CardTitle>
              <Badge tone="secondary">TERSEDIA DI KONTRAK</Badge>
            </div>
            <CardDescription>
              Informasi akun Anda saat ini dari <code>GET /api/v1/me</code> dan pembaruan nama
              terbatas via <code>PATCH /api/v1/me</code>.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {loading && (
              <LoadingState
                title="Memuat Profil Pengguna..."
                description="Mengambil data akun terautentikasi dari /api/v1/me."
                rows={2}
              />
            )}

            {!loading && error && (
              <ErrorState
                title="Gagal Memuat Profil Pengguna"
                message={error.message}
                errorCode={error.code}
                onRetry={reload}
              />
            )}

            {!loading && !error && currentUser && (
              <>
                <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] grid gap-3 sm:grid-cols-2 text-sm">
                  <div>
                    <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                      User ID
                    </div>
                    <div className="mt-1 font-mono font-bold break-all">{currentUser.id}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                      Email
                    </div>
                    <div className="mt-1 break-all">{currentUser.email}</div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                      Role
                    </div>
                    <div className="mt-1">
                      <Badge tone="accent">{currentUser.role}</Badge>
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                      Status Akun
                    </div>
                    <div className="mt-1">
                      <StatusBadge status={currentUser.account_status} />
                    </div>
                  </div>
                </div>

                {saveSuccess && (
                  <Alert tone="success" title="Profil Diperbarui">
                    {saveSuccess}
                  </Alert>
                )}

                {saveError && (
                  <Alert tone="danger" title="Gagal Memperbarui Profil">
                    {saveError}
                  </Alert>
                )}

                <form
                  id="update-me-form"
                  noValidate
                  onSubmit={handleRequestUpdateProfile}
                  className="space-y-4"
                >
                  <Input
                    id="me-full-name"
                    label="Nama Lengkap Profil Sendiri"
                    required
                    value={fullName}
                    error={fieldErrors.fullName}
                    onChange={(e) => {
                      setDraftFullName(e.target.value);
                      if (fieldErrors.fullName) {
                        setFieldErrors({});
                      }
                    }}
                  />
                  <Button type="submit" variant="primary" size="sm" disabled={saving}>
                    Simpan Nama Profil
                  </Button>
                </form>
              </>
            )}
          </CardContent>
          <CardFooter className="text-xs text-[var(--color-muted)]">
            Sesuai §5.2 API Contract, role, account_status, dan assignment tidak dapat diubah
            melalui endpoint profil.
          </CardFooter>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Gap Kontrak &amp; Batasan Keamanan Modul STAFF</CardTitle>
            <CardDescription>
              Kebutuhan fungsional manajemen pengguna &amp; STAFF yang menunggu kesepakatan endpoint
              backend:
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-3 text-sm">
            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">1. Daftar Akun STAFF, Pencarian &amp; Pagination</p>
                <Badge tone="warning">Belum Ada di Kontrak</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Belum tersedia endpoint daftar akun <code>STAFF</code>/pengguna beserta query
                pencarian, filter status akun, dan pagination.
              </p>
            </div>

            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">2. Pembuatan &amp; Edit Akun STAFF oleh ADMIN</p>
                <Badge tone="warning">Belum Ada di Kontrak</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Akun STAFF hanya boleh dibuat dan diperbarui oleh ADMIN melalui endpoint server
                terotorisasi (tanpa self-registration publik, tanpa opsi membuat/mengubah akun{" "}
                <code>ADMIN</code>, dan tanpa menyimpan kredensial di browser).
              </p>
            </div>

            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">3. Aktivasi, Penonaktifan &amp; Batasan Role</p>
                <Badge tone="warning">Belum Ada di Kontrak</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Belum tersedia endpoint aktivasi/penonaktifan akun STAFF maupun manajemen role.
                Penonaktifan tidak menghapus histori transaksi maupun audit log, dan{" "}
                <code>RoleGuard</code> frontend tidak menggantikan otorisasi backend.
              </p>
            </div>

            <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="font-bold">4. Dokumen Proposal Spesifikasi RFC</p>
                <Badge tone="primary">Dokumen Tersedia</Badge>
              </div>
              <p className="text-[var(--color-muted)]">
                Proposal arsitektur lengkap telah disusun di{" "}
                <code className="font-bold">FRONTEND_STAFF_MANAGEMENT_API_GAP.md</code>, memuat
                rancangan endpoint GET/POST/PATCH, relasi Supabase Auth Admin API dengan{" "}
                <code>public.users</code>, skema audit log, dan penanganan error.
              </p>
            </div>
          </CardContent>
          <CardFooter className="text-xs text-[var(--color-muted)]">
            Akses modul STAFF di UI tidak pernah menyediakan fitur pengelolaan akun ADMIN atau
            elevasi role menjadi ADMIN.
          </CardFooter>
        </Card>
      </div>

      <ConfirmDialog
        open={confirmOpen}
        title="Konfirmasi Pembaruan Nama Profil"
        description={`Perbarui nama profil akun Anda menjadi "${fullName.trim()}" melalui PATCH /api/v1/me? Role dan status akun tidak berubah.`}
        confirmLabel="Ya, Perbarui Nama"
        cancelLabel="Batal"
        confirmVariant="primary"
        isConfirming={saving}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmUpdateProfile}
      />
    </div>
  );
}
