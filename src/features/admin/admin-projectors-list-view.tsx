"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import type { ApiListResponse } from "@/lib/api/types";
import {
  validateCreateProjectorForm,
  type CreateProjectorValidationErrors,
} from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { Projector, ProjectorPhysicalStatus } from "@/types/domain";

type PhysicalStatusFilter = "ALL" | ProjectorPhysicalStatus;

const PHYSICAL_STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Fisik" },
  { value: "AVAILABLE", label: "AVAILABLE — Tersedia" },
  { value: "BORROWED", label: "BORROWED — Sedang Dipinjam" },
  { value: "MAINTENANCE", label: "MAINTENANCE — Maintenance" },
  { value: "INACTIVE", label: "INACTIVE — Nonaktif" },
];

export function AdminProjectorsListView() {
  const [statusFilter, setStatusFilter] = useState<PhysicalStatusFilter>("ALL");
  const [searchQuery, setSearchQuery] = useState("");
  const [page, setPage] = useState(1);

  // Add projector form state
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [assetCode, setAssetCode] = useState("");
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [model, setModel] = useState("");
  const [fieldErrors, setFieldErrors] = useState<CreateProjectorValidationErrors>({});
  const [confirmCreateOpen, setConfirmCreateOpen] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createSuccess, setCreateSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Projector>>(
    () =>
      services.projector.listProjectors({
        page,
        page_size: 12,
        physical_status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const rawProjectors = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.meta.pagination ?? null;

  const filteredProjectors = useMemo(() => {
    const keyword = searchQuery.trim().toLowerCase();
    if (!keyword) return rawProjectors;
    return rawProjectors.filter((unit) => {
      const haystacks = [unit.asset_code, unit.name, unit.brand ?? "", unit.model ?? ""];
      return haystacks.some((val) => val.toLowerCase().includes(keyword));
    });
  }, [rawProjectors, searchQuery]);

  const handleRequestCreate = () => {
    setCreateError(null);
    setCreateSuccess(null);
    const errors = validateCreateProjectorForm({ assetCode, name });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setConfirmCreateOpen(true);
  };

  const handleConfirmCreate = async () => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setCreating(true);
    setCreateError(null);

    try {
      const res = await services.projector.createProjector({
        asset_code: assetCode.trim(),
        name: name.trim(),
        brand: brand.trim() || null,
        model: model.trim() || null,
      });
      setConfirmCreateOpen(false);
      setShowCreateForm(false);
      setAssetCode("");
      setName("");
      setBrand("");
      setModel("");
      setFieldErrors({});
      setCreateSuccess(
        `Unit ${res.data.name} (${res.data.asset_code}) berhasil ditambahkan ke inventaris.`
      );
      await reload();
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      const apiFieldErrors = normalized.getFieldErrors();
      if (apiFieldErrors.asset_code) {
        setConfirmCreateOpen(false);
        setFieldErrors((prev) => ({ ...prev, assetCode: apiFieldErrors.asset_code }));
        setCreateError(normalized.message);
      } else {
        setCreateError(normalized.message);
      }
    } finally {
      submittingRef.current = false;
      setCreating(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventaris Proyektor"
        description="Kelola data unit proyektor, status fisik terpisah dari status aktif/nonaktif inventaris."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Button
              variant={showCreateForm ? "outline" : "primary"}
              size="sm"
              onClick={() => {
                setCreateError(null);
                setFieldErrors({});
                setShowCreateForm((prev) => !prev);
              }}
            >
              {showCreateForm ? "Tutup Form Tambah" : "Tambah Proyektor"}
            </Button>
          </>
        }
      />

      {createSuccess && (
        <Alert tone="success" title="Inventaris Diperbarui">
          {createSuccess}
        </Alert>
      )}

      {showCreateForm && (
        <Card>
          <CardHeader>
            <CardTitle>Tambah Unit Proyektor Baru</CardTitle>
            <CardDescription>
              Kode aset harus unik dan tidak dapat diubah setelah unit terdaftar.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {createError && (
              <Alert tone="danger" title="Gagal Menambahkan Unit">
                {createError}
              </Alert>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <Input
                id="create-projector-asset-code"
                label="Kode Aset"
                placeholder="Contoh: PRJ-006"
                required
                value={assetCode}
                onChange={(e) => {
                  setAssetCode(e.target.value);
                  if (fieldErrors.assetCode) {
                    setFieldErrors((prev) => ({ ...prev, assetCode: undefined }));
                  }
                }}
                error={fieldErrors.assetCode}
                disabled={creating}
              />
              <Input
                id="create-projector-name"
                label="Nama Proyektor"
                placeholder="Contoh: Epson EB-X500"
                required
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (fieldErrors.name) {
                    setFieldErrors((prev) => ({ ...prev, name: undefined }));
                  }
                }}
                error={fieldErrors.name}
                disabled={creating}
              />
              <Input
                id="create-projector-brand"
                label="Merek (Opsional)"
                placeholder="Contoh: Epson"
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
                disabled={creating}
              />
              <Input
                id="create-projector-model"
                label="Model (Opsional)"
                placeholder="Contoh: EB-X500"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                disabled={creating}
              />
            </div>
          </CardContent>
          <CardFooter className="justify-end gap-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={creating}
              onClick={() => setShowCreateForm(false)}
            >
              Batal
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              disabled={creating}
              onClick={handleRequestCreate}
            >
              Simpan Unit Baru
            </Button>
          </CardFooter>
        </Card>
      )}

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 w-full sm:max-w-2xl">
          <Input
            id="admin-projector-search"
            label="Cari Proyektor"
            placeholder="Cari kode aset, nama, merek, atau model..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          <Select
            id="admin-projector-status-filter"
            label="Filter Status Fisik"
            value={statusFilter}
            options={PHYSICAL_STATUS_OPTIONS}
            onChange={(e) => {
              setStatusFilter(e.target.value as PhysicalStatusFilter);
              setPage(1);
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          Muat Ulang
        </Button>
      </div>

      {loading && (
        <LoadingState
          title="Memuat Inventaris Proyektor..."
          description="Mengambil daftar unit proyektor dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Inventaris Proyektor"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && filteredProjectors.length === 0 && (
        <EmptyState
          title="Tidak Ada Unit Proyektor"
          description={
            searchQuery.trim()
              ? "Tidak ditemukan unit yang cocok dengan kata kunci pencarian pada halaman ini."
              : "Belum ada unit proyektor yang sesuai dengan filter status fisik saat ini."
          }
        />
      )}

      {!loading && !error && filteredProjectors.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {filteredProjectors.map((unit) => (
              <Card key={unit.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <Badge tone="neutral" className="font-mono">
                      {unit.asset_code}
                    </Badge>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <StatusBadge status={unit.physical_status} prefix="Fisik" />
                      <Badge tone={unit.is_active ? "success" : "neutral"}>
                        {unit.is_active ? "Aktif" : "Nonaktif"}
                      </Badge>
                    </div>
                  </div>
                  <CardTitle className="mt-3">{unit.name}</CardTitle>
                  <CardDescription>
                    {[unit.brand, unit.model].filter(Boolean).join(" • ") || "Metadata tidak diisi"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-1.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">Merek</span>
                    <span>{unit.brand ?? "—"}</span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">Model</span>
                    <span>{unit.model ?? "—"}</span>
                  </div>
                </CardContent>

                <CardFooter className="justify-end">
                  <Link href={`/admin/projectors/${encodeURIComponent(unit.id)}`}>
                    <Button variant="secondary" size="sm">
                      Detail &amp; Kelola
                    </Button>
                  </Link>
                </CardFooter>
              </Card>
            ))}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} unit)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </>
      )}

      <ConfirmDialog
        open={confirmCreateOpen}
        onClose={() => {
          if (!creating) setConfirmCreateOpen(false);
        }}
        onConfirm={handleConfirmCreate}
        title="Simpan Proyektor Baru?"
        description={`Unit ${name.trim()} dengan kode aset ${assetCode.trim()} akan ditambahkan ke inventaris proyektor.`}
        confirmLabel="Ya, Simpan Unit"
        cancelLabel="Periksa Ulang"
        isConfirming={creating}
      >
        {createError && (
          <Alert tone="danger" title="Gagal Menyimpan Unit">
            {createError}
          </Alert>
        )}
      </ConfirmDialog>
    </div>
  );
}
