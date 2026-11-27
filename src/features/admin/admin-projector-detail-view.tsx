"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
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
import {
  validateUpdateProjectorForm,
  type UpdateProjectorValidationErrors,
} from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { Projector } from "@/types/domain";

export function AdminProjectorDetailView({ projectorId }: { projectorId: string }) {
  const [draftName, setDraftName] = useState<string | null>(null);
  const [draftBrand, setDraftBrand] = useState<string | null>(null);
  const [draftModel, setDraftModel] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<UpdateProjectorValidationErrors>({});

  const [confirmSaveOpen, setConfirmSaveOpen] = useState(false);
  const [confirmDeactivateOpen, setConfirmDeactivateOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const {
    data: projector,
    loading,
    error,
    reload,
  } = useAsyncQuery<Projector>(async () => {
    const res = await services.projector.getProjector(projectorId);
    return res.data;
  }, [projectorId]);

  const name = draftName ?? projector?.name ?? "";
  const brand = draftBrand ?? projector?.brand ?? "";
  const model = draftModel ?? projector?.model ?? "";

  const handleRequestSave = () => {
    setActionError(null);
    setActionSuccess(null);
    const errors = validateUpdateProjectorForm({ name });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setConfirmSaveOpen(true);
  };

  const handleConfirmSave = async () => {
    if (!projector || submittingRef.current) return;

    submittingRef.current = true;
    setSaving(true);
    setActionError(null);

    try {
      await services.projector.updateProjector(projector.id, {
        name: name.trim(),
        brand: brand.trim() || null,
        model: model.trim() || null,
      });
      setDraftName(null);
      setDraftBrand(null);
      setDraftModel(null);
      setConfirmSaveOpen(false);
      setActionSuccess("Metadata proyektor berhasil diperbarui.");
      await reload();
    } catch (err) {
      setActionError(normalizeUnknownError(err).message);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  const handleConfirmDeactivate = async () => {
    if (!projector || submittingRef.current) return;

    submittingRef.current = true;
    setDeactivating(true);
    setActionError(null);

    try {
      await services.projector.deactivateProjector(projector.id);
      setConfirmDeactivateOpen(false);
      setActionSuccess(
        "Unit proyektor telah dinonaktifkan dari inventaris aktif. Data inventaris historis tetap dipertahankan."
      );
      await reload();
    } catch (err) {
      setActionError(normalizeUnknownError(err).message);
    } finally {
      submittingRef.current = false;
      setDeactivating(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Memuat Detail Proyektor..."
        description="Mengambil informasi inventaris dan status fisik unit dari server."
        rows={4}
      />
    );
  }

  if (error || !projector) {
    return (
      <ErrorState
        title="Gagal Memuat Detail Proyektor"
        message={error?.message ?? "Unit proyektor tidak ditemukan."}
        errorCode={error?.code}
        onRetry={reload}
        action={
          <Link href="/admin/projectors">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Inventaris
            </Button>
          </Link>
        }
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={`${projector.name} (${projector.asset_code})`}
        description="Detail unit inventaris, pembaruan metadata terbatas, dan penonaktifan unit."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/admin/projectors">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </>
        }
      />

      {actionSuccess && (
        <Alert tone="success" title="Perubahan Inventaris Tersimpan">
          {actionSuccess}
        </Alert>
      )}

      {actionError && !confirmSaveOpen && !confirmDeactivateOpen && (
        <Alert tone="danger" title="Operasi Gagal">
          {actionError}
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="neutral" className="font-mono">
                  {projector.asset_code}
                </Badge>
                <div className="flex flex-wrap items-center gap-1.5">
                  <StatusBadge status={projector.physical_status} prefix="Fisik" />
                  <Badge tone={projector.is_active ? "success" : "neutral"}>
                    {projector.is_active ? "Aktif" : "Nonaktif"}
                  </Badge>
                </div>
              </div>
              <CardTitle className="mt-3">{projector.name}</CardTitle>
              <CardDescription className="font-mono text-xs">ID: {projector.id}</CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <dl className="grid gap-2.5 p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Kode Aset</dt>
                  <dd className="font-mono font-bold text-right">{projector.asset_code}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Merek</dt>
                  <dd className="font-bold text-right">{projector.brand ?? "—"}</dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Model</dt>
                  <dd className="font-bold text-right">{projector.model ?? "—"}</dd>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Status Fisik</dt>
                  <dd>
                    <StatusBadge status={projector.physical_status} />
                  </dd>
                </div>
                <div className="flex justify-between items-center gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Status Inventaris</dt>
                  <dd>
                    <Badge tone={projector.is_active ? "success" : "neutral"}>
                      {projector.is_active ? "Aktif" : "Nonaktif"}
                    </Badge>
                  </dd>
                </div>
              </dl>

              {projector.physical_status === "BORROWED" && (
                <Alert tone="warning" title="Unit Sedang Dipinjam">
                  Unit ini berstatus fisik <code>BORROWED</code> karena sedang berada pada transaksi
                  peminjaman aktif. Status fisik dan penonaktifan tidak dapat melewati validasi
                  transaksi aktif di server.
                </Alert>
              )}

              {projector.physical_status === "MAINTENANCE" && (
                <Alert tone="danger" title="Unit Dalam Maintenance">
                  Unit sedang berstatus fisik <code>MAINTENANCE</code>. Status kelayakan unit hanya
                  dapat diperbarui melalui alur operasional maintenance STAFF/ADMIN, bukan form
                  metadata inventaris.
                </Alert>
              )}

              <p className="text-xs text-[var(--color-muted)]">
                Riwayat transaksi dan maintenance tidak disertakan pada endpoint detail proyektor;
                gunakan halaman operasional peminjaman atau maintenance untuk memeriksa riwayat
                terkait.
              </p>
            </CardContent>

            <CardFooter>
              <Button variant="outline" size="sm" onClick={reload}>
                Muat Ulang Detail
              </Button>
            </CardFooter>
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Edit Metadata Proyektor</CardTitle>
              <CardDescription>
                Hanya nama, merek, dan model yang dapat diubah. Kode aset dan status fisik tidak
                diubah melalui form metadata.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Input
                id="edit-projector-asset-code"
                label="Kode Aset (Tidak Dapat Diubah)"
                value={projector.asset_code}
                disabled
                hint="Kode aset bersifat tetap dan tidak dapat diedit melalui endpoint metadata."
              />
              <Input
                id="edit-projector-name"
                label="Nama Proyektor"
                required
                value={name}
                onChange={(e) => {
                  setDraftName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                error={fieldErrors.name}
                disabled={saving || deactivating}
              />
              <Input
                id="edit-projector-brand"
                label="Merek (Opsional)"
                value={brand}
                onChange={(e) => setDraftBrand(e.target.value)}
                disabled={saving || deactivating}
              />
              <Input
                id="edit-projector-model"
                label="Model (Opsional)"
                value={model}
                onChange={(e) => setDraftModel(e.target.value)}
                disabled={saving || deactivating}
              />
            </CardContent>
            <CardFooter className="justify-end">
              <Button
                type="button"
                variant="primary"
                disabled={saving || deactivating}
                onClick={handleRequestSave}
              >
                Simpan Perubahan Metadata
              </Button>
            </CardFooter>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Nonaktifkan Unit Proyektor</CardTitle>
              <CardDescription>
                Penonaktifan menghentikan peminjaman baru tanpa menghapus data historis inventaris
                dan berbeda dari status maintenance.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {projector.is_active ? (
                <Alert tone="warning" title="Dampak Penonaktifan">
                  Unit yang dinonaktifkan tidak tersedia untuk booking atau peminjaman baru. Server
                  akan menolak penonaktifan apabila unit masih memiliki transaksi pinjaman aktif.
                </Alert>
              ) : (
                <Alert tone="info" title="Unit Sudah Nonaktif">
                  Unit ini sudah berstatus nonaktif dalam inventaris dan data historisnya tetap
                  disimpan.
                </Alert>
              )}
            </CardContent>
            {projector.is_active && (
              <CardFooter className="justify-end">
                <Button
                  type="button"
                  variant="danger"
                  disabled={saving || deactivating}
                  onClick={() => {
                    setActionError(null);
                    setActionSuccess(null);
                    setConfirmDeactivateOpen(true);
                  }}
                >
                  Nonaktifkan Proyektor
                </Button>
              </CardFooter>
            )}
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={confirmSaveOpen}
        onClose={() => {
          if (!saving) setConfirmSaveOpen(false);
        }}
        onConfirm={handleConfirmSave}
        title="Simpan Perubahan Metadata?"
        description={`Metadata unit ${projector.asset_code} akan diperbarui di server. Status fisik dan kode aset tetap tidak berubah.`}
        confirmLabel="Ya, Simpan Metadata"
        cancelLabel="Batal"
        isConfirming={saving}
      >
        {actionError && confirmSaveOpen && (
          <Alert tone="danger" title="Gagal Memperbarui Metadata">
            {actionError}
          </Alert>
        )}
      </ConfirmDialog>

      <ConfirmDialog
        open={confirmDeactivateOpen}
        onClose={() => {
          if (!deactivating) setConfirmDeactivateOpen(false);
        }}
        onConfirm={handleConfirmDeactivate}
        title={`Nonaktifkan Unit ${projector.asset_code}?`}
        description="Unit akan dinonaktifkan dari inventaris aktif tanpa menghapus riwayat transaksi. Penonaktifan akan ditolak oleh server jika unit masih memiliki transaksi aktif."
        confirmLabel="Ya, Nonaktifkan Unit"
        cancelLabel="Batal"
        confirmVariant="danger"
        isConfirming={deactivating}
      >
        {actionError && confirmDeactivateOpen && (
          <Alert tone="danger" title="Penonaktifan Ditolak">
            {actionError}
          </Alert>
        )}
      </ConfirmDialog>
    </div>
  );
}
