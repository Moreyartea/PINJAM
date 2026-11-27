"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import QRCode from "qrcode";
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
import { Dialog } from "@/components/ui/dialog";
import { Select } from "@/components/ui/select";
import { Spinner } from "@/components/ui/spinner";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type {
  KomtingReturnInitiationResult,
  Loan,
  LoanStatus,
  Projector,
} from "@/types/domain";

type LoanStatusFilter = "ALL" | LoanStatus;

const LOAN_STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Peminjaman" },
  { value: "ACTIVE", label: "ACTIVE — Sedang Dipinjam" },
  { value: "RETURNED", label: "RETURNED — Sudah Dikembalikan" },
];

export function KomtingLoanHistoryView() {
  const [statusFilter, setStatusFilter] = useState<LoanStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  // Return QR state
  const [selectedLoanForReturn, setSelectedLoanForReturn] = useState<Loan | null>(null);
  const [isReturnModalOpen, setIsReturnModalOpen] = useState(false);
  const [initiatingReturn, setInitiatingReturn] = useState(false);
  const [returnResult, setReturnResult] = useState<KomtingReturnInitiationResult | null>(null);
  const [returnError, setReturnError] = useState<string | null>(null);
  const [returnQrSvg, setReturnQrSvg] = useState<string | null>(null);

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

  const handleOpenReturnModal = async (loan: Loan) => {
    setSelectedLoanForReturn(loan);
    setIsReturnModalOpen(true);
    setInitiatingReturn(true);
    setReturnError(null);
    setReturnResult(null);
    setReturnQrSvg(null);

    try {
      const res = await services.loan.initiateReturn(loan.id);
      setReturnResult(res.data);
      const svg = await QRCode.toString(res.data.qr_payload, {
        type: "svg",
        margin: 2,
        width: 220,
        color: {
          dark: "#171717",
          light: "#ffffff",
        },
      });
      setReturnQrSvg(svg);
    } catch (err) {
      const message =
        err instanceof Error
          ? err.message
          : "Gagal memproses permohonan pengembalian proyektor.";
      setReturnError(message);
    } finally {
      setInitiatingReturn(false);
    }
  };

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

                  {loan.status === "ACTIVE" && (
                    <CardFooter className="pt-3 border-t border-[var(--border-color)]">
                      <Button
                        variant="primary"
                        size="sm"
                        fullWidth
                        onClick={() => handleOpenReturnModal(loan)}
                      >
                        Ajukan Pengembalian (Tampilkan QR Return)
                      </Button>
                    </CardFooter>
                  )}
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

      <Dialog
        open={isReturnModalOpen}
        onClose={() => {
          if (!initiatingReturn) {
            setIsReturnModalOpen(false);
          }
        }}
        title="QR Pengembalian Proyektor (Return)"
        description="Tunjukkan tiket QR ini kepada petugas di meja layanan saat mengembalikan unit."
        footer={
          <Button
            variant="outline"
            onClick={() => setIsReturnModalOpen(false)}
            disabled={initiatingReturn}
          >
            Tutup
          </Button>
        }
      >
        <div className="space-y-4">
          {selectedLoanForReturn && (
            <div className="p-3 bg-[var(--color-bg)] rounded-[var(--radius-sm)] nb-border text-sm space-y-1">
              <div className="flex justify-between">
                <span className="font-semibold text-[var(--color-muted)]">Unit:</span>
                <span className="font-bold text-right">
                  {projectorLookup.get(selectedLoanForReturn.projector_id)?.name ??
                    selectedLoanForReturn.projector_id}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[var(--color-muted)]">ID Booking:</span>
                <span className="font-mono text-right">{selectedLoanForReturn.booking_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="font-semibold text-[var(--color-muted)]">ID Loan:</span>
                <span className="font-mono text-right">{selectedLoanForReturn.id}</span>
              </div>
            </div>
          )}

          {initiatingReturn && (
            <div className="flex flex-col items-center justify-center py-8 space-y-3">
              <Spinner size="lg" />
              <p className="text-sm font-semibold text-[var(--color-muted)]">
                Menerbitkan token QR pengembalian dari server...
              </p>
            </div>
          )}

          {!initiatingReturn && returnError && (
            <div className="space-y-3">
              <Alert tone="danger" title="Gagal Mengajukan Pengembalian">
                {returnError}
              </Alert>
              <Button
                variant="outline"
                size="sm"
                fullWidth
                onClick={() => selectedLoanForReturn && handleOpenReturnModal(selectedLoanForReturn)}
              >
                Coba Lagi
              </Button>
            </div>
          )}

          {!initiatingReturn && !returnError && returnResult && returnQrSvg && (
            <div className="space-y-4">
              <div className="flex flex-col items-center justify-center p-4 bg-white rounded-[var(--radius-md)] border-2 border-[var(--border-color)]">
                <div
                  className="w-[220px] h-[220px]"
                  dangerouslySetInnerHTML={{ __html: returnQrSvg }}
                  aria-label={`QR Code Return untuk loan ${returnResult.loan_id}`}
                />
                <p className="mt-2 text-xs font-mono text-zinc-600">
                  Berlaku hingga: {formatJakartaDateTime(returnResult.expires_at)}
                </p>
              </div>

              <Alert tone="info" title="Instruksi Pengembalian">
                Petugas operasional akan memindai QR ini untuk membuka formulir inspeksi kondisi
                dan mencatat pengembalian proyektor secara resmi.
              </Alert>

              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() =>
                    selectedLoanForReturn && handleOpenReturnModal(selectedLoanForReturn)
                  }
                >
                  Perbarui QR Return
                </Button>
              </div>
            </div>
          )}
        </div>
      </Dialog>
    </div>
  );
}
