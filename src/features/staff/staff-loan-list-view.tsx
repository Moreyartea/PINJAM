"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { Loan, LoanStatus, Projector } from "@/types/domain";

type StaffLoanFilter = "ALL" | LoanStatus;

const LOAN_FILTER_OPTIONS = [
  { value: "ALL", label: "Semua Status Loan" },
  { value: "ACTIVE", label: "ACTIVE — Sedang Dipinjam" },
  { value: "RETURNED", label: "RETURNED — Sudah Dikembalikan" },
];

export function StaffLoanListView() {
  const [statusFilter, setStatusFilter] = useState<StaffLoanFilter>("ALL");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Loan>>(
    () =>
      services.loan.listStaffLoans({
        page,
        page_size: 10,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const { data: projectorsData } = useAsyncQuery<Projector[]>(async () => {
    try {
      const res = await services.projector.listProjectors({ page: 1, page_size: 100 });
      return res.data;
    } catch {
      return [];
    }
  }, []);

  const projectorMap = useMemo(() => {
    const map = new Map<string, Projector>();
    for (const unit of projectorsData ?? []) {
      map.set(unit.id, unit);
    }
    return map;
  }, [projectorsData]);

  const loans = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daftar Peminjaman (Loan)"
        description="Transaksi peminjaman aktif dan pengembalian yang telah diproses."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/scan">
              <Button variant="primary" size="sm">
                Scan QR Return
              </Button>
            </Link>
          </>
        }
      />

      <Alert tone="info" title="Aturan Pengembalian">
        Loan tetap berstatus <code>ACTIVE</code> sampai unit diterima kembali dan inspeksi
        dikonfirmasi oleh petugas STAFF/ADMIN.
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-72">
          <Select
            id="staff-loan-status"
            label="Filter Status Loan"
            value={statusFilter}
            options={LOAN_FILTER_OPTIONS}
            onChange={(e) => {
              setStatusFilter(e.target.value as StaffLoanFilter);
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
          title="Memuat Daftar Loan..."
          description="Mengambil transaksi peminjaman dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Daftar Loan"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && loans.length === 0 && (
        <EmptyState
          title="Tidak Ada Data Loan"
          description="Belum ada transaksi loan yang sesuai dengan filter saat ini."
        />
      )}

      {!loading && !error && loans.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {loans.map((loan) => {
              const unit = projectorMap.get(loan.projector_id);
              const projectorLabel = unit ? `${unit.name} (${unit.asset_code})` : loan.projector_id;

              return (
                <Card key={loan.id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {loan.id}
                      </Badge>
                      <StatusBadge status={loan.status} />
                    </div>
                    <CardTitle className="mt-3">{projectorLabel}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      Komting ID: {loan.komting_id} • Booking ID: {loan.booking_id}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Waktu Pickup</span>
                      <span>{formatJakartaDateTime(loan.picked_up_at)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Waktu Kembali</span>
                      <span>
                        {loan.returned_at
                          ? formatJakartaDateTime(loan.returned_at)
                          : "Belum dikembalikan"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 items-center">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Kondisi Return
                      </span>
                      {loan.return_condition ? (
                        <StatusBadge status={loan.return_condition} />
                      ) : (
                        <span className="text-[var(--color-muted)]">-</span>
                      )}
                    </div>
                  </CardContent>

                  <CardFooter className="flex flex-wrap items-center justify-between gap-2">
                    <Link href={`/staff/loans/${encodeURIComponent(loan.id)}`}>
                      <Button variant="outline" size="sm">
                        Detail Loan
                      </Button>
                    </Link>
                    {loan.status === "ACTIVE" ? (
                      <Link href={`/staff/loans/${encodeURIComponent(loan.id)}/return`}>
                        <Button variant="primary" size="sm">
                          Proses Inspeksi Return
                        </Button>
                      </Link>
                    ) : (
                      <span className="text-xs font-mono text-[var(--color-muted)]">
                        Transaksi selesai
                      </span>
                    )}
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} loan)
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
