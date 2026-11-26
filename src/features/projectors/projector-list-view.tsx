"use client";

import { useState } from "react";
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
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { isMockMode, services } from "@/services";
import type { Projector, ProjectorPhysicalStatus } from "@/types/domain";

type PhysicalStatusFilter = "ALL" | ProjectorPhysicalStatus;

const STATUS_FILTER_OPTIONS = [
  { value: "ALL", label: "Semua Status Fisik" },
  { value: "AVAILABLE", label: "AVAILABLE — Unit Fisik Tersedia" },
  { value: "BORROWED", label: "BORROWED — Sedang Dipinjam" },
  { value: "MAINTENANCE", label: "MAINTENANCE — Dalam Perbaikan" },
  { value: "INACTIVE", label: "INACTIVE — Nonaktif" },
];

function getPhysicalStatusExplanation(status: string): string {
  switch (status) {
    case "AVAILABLE":
      return "Kondisi fisik berada di ruang penyimpanan dan dapat diajukan bila jadwal tidak berkonflik.";
    case "BORROWED":
      return "Unit sedang dipinjam secara fisik. Status ini tidak berubah otomatis meskipun estimasi kembali lewat; ketersediaan jadwal besok tetap diperiksa terpisah melalui endpoint availability.";
    case "MAINTENANCE":
      return "Unit sedang dalam maintenance sehingga tidak dapat dibooking sampai dinyatakan layak oleh STAFF/ADMIN.";
    case "INACTIVE":
      return "Unit dinonaktifkan dari operasional peminjaman.";
    default:
      return "Status fisik unit dari backend.";
  }
}

export function ProjectorListView() {
  const [statusFilter, setStatusFilter] = useState<PhysicalStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Projector>>(
    () =>
      services.projector.listProjectors({
        page,
        page_size: 12,
        physical_status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const projectors = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daftar Proyektor"
        description="Informasi unit proyektor beserta status fisik aktual dari inventaris."
        actions={
          isMockMode ? (
            <Badge tone="warning" symbol="!">
              DATA SIMULASI DEV
            </Badge>
          ) : undefined
        }
      />

      <Alert tone="info" title="Pemisahan Status Fisik &amp; Ketersediaan Booking">
        <strong>Status fisik unit</strong> (<code>AVAILABLE</code>, <code>BORROWED</code>,{" "}
        <code>MAINTENANCE</code>) menunjukkan kondisi fisik proyektor saat ini, bukan status jadwal
        booking. Unit yang sedang <code>BORROWED</code> hari ini tetap tidak dianggap kembali
        sebelum dikonfirmasi STAFF/ADMIN, dan pengecekan jadwal booking lintas tanggal akan tersedia
        pada tahap FE-2.
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-80">
          <Select
            id="projector-status-filter"
            label="Filter Status Fisik"
            value={statusFilter}
            options={STATUS_FILTER_OPTIONS}
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
          title="Memuat Daftar Proyektor..."
          description="Mengambil data inventaris proyektor."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Daftar Proyektor"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && projectors.length === 0 && (
        <EmptyState
          title="Tidak Ada Proyektor Ditemukan"
          description="Belum ada unit proyektor yang sesuai dengan filter status fisik yang dipilih."
          action={
            statusFilter !== "ALL" ? (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  setStatusFilter("ALL");
                  setPage(1);
                }}
              >
                Reset Filter
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && projectors.length > 0 && (
        <>
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projectors.map((unit) => (
              <Card key={unit.id} className="flex flex-col justify-between">
                <CardHeader>
                  <div className="flex items-start justify-between gap-2">
                    <Badge tone="neutral" className="font-mono">
                      {unit.asset_code}
                    </Badge>
                    <StatusBadge status={unit.physical_status} />
                  </div>
                  <CardTitle className="mt-3">{unit.name}</CardTitle>
                  <CardDescription>
                    {[unit.brand, unit.model].filter(Boolean).join(" • ") || "Spesifikasi standar"}
                  </CardDescription>
                </CardHeader>

                <CardContent className="space-y-2.5 text-sm">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">
                      Kondisi Operasional
                    </span>
                    <span className="font-bold">
                      {unit.is_active ? "Unit Aktif" : "Unit Nonaktif"}
                    </span>
                  </div>
                  <p className="text-xs text-[var(--color-muted)] leading-relaxed">
                    {getPhysicalStatusExplanation(unit.physical_status)}
                  </p>
                </CardContent>

                <CardFooter className="justify-between text-xs text-[var(--color-muted)]">
                  <span>Status fisik server</span>
                  <span className="font-mono font-semibold">
                    {unit.physical_status === "MAINTENANCE" || unit.physical_status === "INACTIVE"
                      ? "Tidak dapat dibooking"
                      : "Cek availability di FE-2"}
                  </span>
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
    </div>
  );
}
