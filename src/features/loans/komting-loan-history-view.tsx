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
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { Loan, LoanStatus, Projector } from "@/types/domain";

type LoanStatusFilter = "ALL" | LoanStatus;

const LOAN_STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Peminjaman" },
  { value: "ACTIVE", label: "ACTIVE — Sedang Dipinjam" },
  { value: "RETURNED", label: "RETURNED — Sudah Dikembalikan" },
];

export function KomtingLoanHistoryView() {
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Loan>>(
    () =>
      services.loan.listKomtingLoans({
        page,
        page_size: 10,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const { data: projectorsRes } = useAsyncQuery<Projector[]>(async () => {
    const res = await services.projector.listProjectors({ page: 1, page_size: 100 });
    return res.data;
  }, []);

  const projectorLookup = useMemo(() => {
    const map = new Map<string, Projector>();
    for (const unit of projectorsRes ?? []) {
      map.set(unit.id, unit);
    }
    return map;
  }, [projectorsRes]);

  const loans = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Riwayat Peminjaman"
        description="Daftar transaksi peminjaman proyektor yang telah dikonfirmasi pickup oleh petugas."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/komting/bookings">
              <Button variant="outline" size="sm">
                Lihat Daftar Booking
              </Button>
            </Link>
          </>
        }
      />

      <Alert tone="info" title="Status Transaksi Peminjaman">
        Status peminjaman berasal dari konfirmasi serah-terima oleh STAFF/ADMIN. Loan tetap
        berstatus <code>ACTIVE</code> sampai unit diterima kembali dan dikonfirmasi petugas.
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-80">
          <Select
            id="loan-status-filter"
            label="Filter Status Peminjaman"
            value={statusFilter}
            options={LOAN_STATUS_OPTIONS}
            onChange={(e) => {
              setStatusFilter(e.target.value as LoanStatusFilter);
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
          title="Memuat Riwayat Peminjaman..."
          description="Mengambil catatan transaksi loan Anda dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Riwayat Peminjaman"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && loans.length === 0 && (
        <EmptyState
          title="Belum Ada Riwayat Peminjaman"
          description="Belum ada transaksi peminjaman proyektor yang sesuai dengan filter saat ini."
          action={
            <Link href="/komting/bookings/new">
              <Button variant="primary" size="sm">
                Buat Booking Baru
              </Button>
            </Link>
          }
        />
      )}

      {!loading && !error && loans.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {loans.map((loan) => {
              const unit = projectorLookup.get(loan.projector_id);
              return (
                <Card key={loan.id}>
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {loan.id}
                      </Badge>
                      <StatusBadge status={loan.status} />
                    </div>
                    <CardTitle className="mt-3">
                      {unit ? `${unit.name} (${unit.asset_code})` : loan.projector_id}
                    </CardTitle>
                    <CardDescription>
                      ID Booking:{" "}
                      <Link
                        href={`/komting/bookings/${encodeURIComponent(loan.booking_id)}`}
                        className="font-mono underline underline-offset-2"
                      >
                        {loan.booking_id}
                      </Link>
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2.5 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Waktu Pickup</span>
                      <span className="text-right">{formatJakartaDateTime(loan.picked_up_at)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Waktu Kembali Aktual
                      </span>
                      <span className="text-right">
                        {loan.returned_at
                          ? formatJakartaDateTime(loan.returned_at)
                          : "Belum dikembalikan"}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2 items-center">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Kondisi Pengembalian
                      </span>
                      {loan.return_condition ? (
                        <StatusBadge status={loan.return_condition} />
                      ) : (
                        <span className="text-[var(--color-muted)]">-</span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} transaksi)
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
