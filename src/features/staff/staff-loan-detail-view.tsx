"use client";

import Link from "next/link";
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
import { useAsyncQuery } from "@/hooks/use-async-query";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { Booking, Loan, Projector } from "@/types/domain";

export function StaffLoanDetailView({ loanId }: { loanId: string }) {
  const {
    data: loan,
    loading,
    error,
    reload,
  } = useAsyncQuery<Loan>(async () => {
    const res = await services.loan.getStaffLoan(loanId);
    return res.data;
  }, [loanId]);

  const { data: projector } = useAsyncQuery<Projector | null>(
    async () => {
      if (!loan?.projector_id) return null;
      try {
        const res = await services.projector.getProjector(loan.projector_id);
        return res.data;
      } catch {
        return null;
      }
    },
    [loan?.projector_id],
    { enabled: Boolean(loan?.projector_id) }
  );

  const { data: booking } = useAsyncQuery<Booking | null>(
    async () => {
      if (!loan?.booking_id) return null;
      try {
        const res = await services.booking.getStaffBooking(loan.booking_id);
        return res.data;
      } catch {
        return null;
      }
    },
    [loan?.booking_id],
    { enabled: Boolean(loan?.booking_id) }
  );

  if (loading) {
    return (
      <LoadingState
        title="Memuat Detail Peminjaman..."
        description="Mengambil data transaksi loan, booking terkait, dan unit proyektor."
        rows={4}
      />
    );
  }

  if (error || !loan) {
    const errorTitle =
      error?.status === 404
        ? "Data Loan Tidak Ditemukan"
        : error?.status === 403
          ? "Akses Ditolak"
          : "Gagal Memuat Detail Loan";

    return (
      <ErrorState
        title={errorTitle}
        message={error?.message ?? "Data loan tidak ditemukan di sistem."}
        errorCode={error?.code}
        onRetry={reload}
        action={
          <Link href="/staff/loans">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Loan
            </Button>
          </Link>
        }
      />
    );
  }

  const projectorLabel = projector
    ? `${projector.name} (${projector.asset_code})`
    : loan.projector_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Detail Loan: ${loan.id}`}
        description="Informasi lengkap peminjaman unit, peminjam, waktu penyerahan, dan status pengembalian."
        actions={
          <div className="flex flex-wrap items-center gap-2">
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/loans">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </div>
        }
      />

      <div className="grid gap-6 md:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="neutral" className="font-mono">
                {loan.id}
              </Badge>
              <StatusBadge status={loan.status} />
            </div>
            <CardTitle className="mt-3">{projectorLabel}</CardTitle>
            <CardDescription>
              Transaksi tercatat di backend dengan status <strong>{loan.status}</strong>.
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3">
            <dl className="grid gap-2.5 text-sm p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Peminjam (Komting ID)</dt>
                <dd className="font-mono font-bold text-right">{loan.komting_id}</dd>
              </div>

              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Unit Proyektor</dt>
                <dd className="font-bold text-right">{projectorLabel}</dd>
              </div>

              {projector && (
                <>
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold text-[var(--color-muted)]">Status Fisik Unit</dt>
                    <dd>
                      <StatusBadge status={projector.physical_status} />
                    </dd>
                  </div>
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold text-[var(--color-muted)]">Merek &amp; Model</dt>
                    <dd className="text-right">
                      {projector.brand} {projector.model}
                    </dd>
                  </div>
                </>
              )}

              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Booking Terkait</dt>
                <dd className="text-right">
                  <Link
                    href={`/staff/bookings/${encodeURIComponent(loan.booking_id)}`}
                    className="font-mono font-bold text-[var(--color-primary)] hover:underline inline-flex items-center gap-1"
                  >
                    {booking?.booking_code ?? loan.booking_id}
                  </Link>
                </dd>
              </div>

              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Waktu Pickup</dt>
                <dd className="text-right">{formatJakartaDateTime(loan.picked_up_at)}</dd>
              </div>

              {booking?.estimated_return_at && (
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Estimasi Kembali</dt>
                  <dd className="text-right font-medium">
                    {formatJakartaDateTime(booking.estimated_return_at)}
                  </dd>
                </div>
              )}

              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Waktu Kembali Aktual</dt>
                <dd className="text-right">
                  {loan.returned_at ? (
                    formatJakartaDateTime(loan.returned_at)
                  ) : (
                    <span className="font-semibold text-[var(--color-warning)]">
                      Belum Dikembalikan
                    </span>
                  )}
                </dd>
              </div>

              <div className="flex justify-between gap-2 items-center">
                <dt className="font-semibold text-[var(--color-muted)]">Kondisi Pengembalian</dt>
                <dd>
                  {loan.return_condition ? (
                    <StatusBadge status={loan.return_condition} />
                  ) : (
                    <span className="text-[var(--color-muted)]">-</span>
                  )}
                </dd>
              </div>
            </dl>
          </CardContent>

          <CardFooter className="justify-between">
            <Button variant="outline" size="sm" onClick={reload}>
              Muat Ulang
            </Button>
            {loan.status === "ACTIVE" && (
              <Link href={`/staff/loans/${encodeURIComponent(loan.id)}/return`}>
                <Button variant="primary" size="sm">
                  Proses Inspeksi Return
                </Button>
              </Link>
            )}
          </CardFooter>
        </Card>

        <div className="space-y-4">
          {loan.status === "ACTIVE" ? (
            <Card tone="warning">
              <CardHeader>
                <CardTitle className="text-base">Status Peminjaman: ACTIVE</CardTitle>
                <CardDescription>
                  Unit proyektor saat ini sedang dibawa oleh peminjam.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 text-sm">
                <p>
                  Untuk memproses pengembalian unit, staf dapat memindai QR pengembalian dari
                  komting atau langsung membuka formulir inspeksi pengembalian fisik.
                </p>
                <Alert tone="info" title="Syarat Pengembalian">
                  Inspeksi pengembalian wajib mencatat kondisi fisik proyektor (NORMAL/DAMAGED),
                  kelengkapan aksesori (COMPLETE/INCOMPLETE), dan wajib mengunggah foto bukti jika
                  terdapat kerusakan atau kekurangan aksesori.
                </Alert>
              </CardContent>
              <CardFooter className="justify-end">
                <Link href={`/staff/loans/${encodeURIComponent(loan.id)}/return`}>
                  <Button variant="primary" size="sm">
                    Mulai Inspeksi Pengembalian
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ) : (
            <Card tone="success">
              <CardHeader>
                <CardTitle className="text-base">Peminjaman Selesai</CardTitle>
                <CardDescription>
                  Unit telah dikembalikan dan transaksi loan telah ditutup.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <p>
                  Unit telah tercatat dikembalikan pada{" "}
                  <strong>{formatJakartaDateTime(loan.returned_at)}</strong>.
                </p>
                {loan.return_condition && (
                  <p>
                    Kondisi saat dikembalikan: <strong>{loan.return_condition}</strong>.
                  </p>
                )}
              </CardContent>
              <CardFooter className="justify-end">
                <Link href="/staff/loans">
                  <Button variant="outline" size="sm">
                    Kembali ke Daftar Loan
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}
