"use client";

import Link from "next/link";
import { useState } from "react";
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
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isReplacementApplication } from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { ApplicationStatus, KomtingApplication } from "@/types/domain";

type ApplicationStatusFilter = "ALL" | ApplicationStatus;

const APPLICATION_STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Pengajuan" },
  { value: "PENDING_VERIFICATION", label: "PENDING_VERIFICATION — Menunggu Verifikasi" },
  { value: "PENDING_REVIEW", label: "PENDING_REVIEW — Menunggu Review" },
  {
    value: "PENDING_REPLACEMENT_NOTICE",
    label: "PENDING_REPLACEMENT_NOTICE — Pengajuan Pergantian",
  },
  {
    value: "PENDING_EMAIL_VERIFICATION",
    label: "PENDING_EMAIL_VERIFICATION — Belum Verifikasi Email",
  },
  { value: "APPROVED", label: "APPROVED — Disetujui" },
  { value: "REJECTED", label: "REJECTED — Ditolak" },
  { value: "WITHDRAWN", label: "WITHDRAWN — Ditarik" },
];

export function AdminApplicationsListView() {
  const [statusFilter, setStatusFilter] = useState<ApplicationStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<KomtingApplication>>(
    () =>
      services.application.listAdminApplications({
        page,
        page_size: 10,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const applications = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daftar Pengajuan Komting"
        description="Pemeriksaan, persetujuan, penolakan, dan pergantian penugasan komting kelas oleh ADMIN."
        actions={
          <>
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

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-80">
          <Select
            id="admin-application-status-filter"
            label="Filter Status Pengajuan"
            value={statusFilter}
            options={APPLICATION_STATUS_OPTIONS}
            onChange={(e) => {
              setStatusFilter(e.target.value as ApplicationStatusFilter);
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
          title="Memuat Daftar Pengajuan Komting..."
          description="Mengambil data pengajuan pendaftar komting dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Daftar Pengajuan"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && applications.length === 0 && (
        <EmptyState
          title="Tidak Ada Pengajuan Komting"
          description="Belum ada pengajuan yang sesuai dengan filter status yang dipilih."
        />
      )}

      {!loading && !error && applications.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {applications.map((app) => {
              const replacement = isReplacementApplication(app);

              return (
                <Card key={app.application_id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone={replacement ? "warning" : "neutral"}>
                        {replacement ? "Pengajuan Pergantian" : "Pengajuan Baru"}
                      </Badge>
                      <StatusBadge status={app.status} />
                    </div>
                    <CardTitle className="mt-3">{app.full_name ?? app.application_id}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      ID: {app.application_id}
                      {app.class_name ? ` • Kelas ${app.class_name}` : ""}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Kelas</span>
                      <span className="font-bold">{app.class_name ?? "—"}</span>
                    </div>
                    {app.student_id && (
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[var(--color-muted)]">
                          Nomor Identitas
                        </span>
                        <span className="font-mono font-bold">{app.student_id}</span>
                      </div>
                    )}
                    {app.email && (
                      <div className="flex justify-between gap-2">
                        <span className="font-semibold text-[var(--color-muted)]">Email</span>
                        <span className="truncate max-w-[220px]">{app.email}</span>
                      </div>
                    )}
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Waktu Pengajuan
                      </span>
                      <span>{formatJakartaDateTime(app.submitted_at)}</span>
                    </div>
                  </CardContent>

                  <CardFooter className="justify-end">
                    <Link href={`/admin/applications/${encodeURIComponent(app.application_id)}`}>
                      <Button variant="primary" size="sm">
                        Detail &amp; Verifikasi
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} pengajuan)
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
