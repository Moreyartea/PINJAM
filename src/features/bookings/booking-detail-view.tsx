"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
import { BookingQrCard } from "@/components/qr/booking-qr-card";
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
import { Textarea } from "@/components/ui/textarea";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import {
  formatCalendarDate,
  formatJakartaDateTime,
  formatJakartaTimeOnly,
  formatLocalTime,
} from "@/lib/utils/date";
import { createIdempotencyKey } from "@/lib/utils/idempotency";
import { validateCancelReason } from "@/lib/validation/booking";
import { isMockMode, services } from "@/services";
import type { Booking, Projector } from "@/types/domain";

export function BookingDetailView({ bookingId }: { bookingId: string }) {
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  const [cancelReasonError, setCancelReasonError] = useState<string | undefined>(undefined);
  const [cancelSubmitError, setCancelSubmitError] = useState<string | null>(null);
  const [cancelSuccessMessage, setCancelSuccessMessage] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState(false);

  const cancellingRef = useRef(false);
  const cancelIdempotencyRef = useRef<string | null>(null);

  const {
    data: booking,
    loading,
    error,
    reload: reloadBooking,
  } = useAsyncQuery<Booking>(async () => {
    const res = await services.booking.getKomtingBooking(bookingId);
    return res.data;
  }, [bookingId]);

  const { data: projector } = useAsyncQuery<Projector>(
    async () => {
      if (!booking?.projector_id) {
        throw new Error("Projector ID unavailable");
      }
      const res = await services.projector.getProjector(booking.projector_id);
      return res.data;
    },
    [booking?.projector_id],
    { enabled: Boolean(booking?.projector_id) }
  );

  const shouldFetchQr = booking?.status === "CONFIRMED" || booking?.status === "FULFILLED";

  const {
    data: qrData,
    loading: qrLoading,
    error: qrError,
    reload: reloadQr,
  } = useAsyncQuery<{ qr_payload: string; expires_at: string }>(
    async () => {
      const res = await services.qr.getBookingQr(bookingId);
      return res.data;
    },
    [bookingId, booking?.status],
    { enabled: Boolean(shouldFetchQr) }
  );

  const handleConfirmCancel = async () => {
    if (cancellingRef.current) return;

    setCancelSubmitError(null);
    const validationError = validateCancelReason(cancelReason);
    setCancelReasonError(validationError);
    if (validationError) {
      return;
    }

    if (!cancelIdempotencyRef.current) {
      cancelIdempotencyRef.current = createIdempotencyKey();
    }

    cancellingRef.current = true;
    setIsCancelling(true);
    try {
      await services.booking.cancelKomtingBooking(
        bookingId,
        {
          reason: cancelReason.trim(),
        },
        cancelIdempotencyRef.current
      );
      setCancelOpen(false);
      setCancelReason("");
      cancelIdempotencyRef.current = null;
      setCancelSuccessMessage("Booking berhasil dibatalkan.");
      reloadBooking();
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setCancelSubmitError(normalized.message);
    } finally {
      cancellingRef.current = false;
      setIsCancelling(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Memuat Detail Booking..."
        description="Mengambil informasi jadwal, pickup window, dan QR booking."
        rows={4}
      />
    );
  }

  if (error || !booking) {
    const errorTitle =
      error?.status === 404
        ? "Booking Tidak Ditemukan"
        : error?.status === 403
          ? "Akses Ditolak"
          : "Gagal Memuat Detail Booking";

    return (
      <ErrorState
        title={errorTitle}
        message={error?.message ?? "Data booking tidak ditemukan."}
        errorCode={error?.code}
        onRetry={reloadBooking}
        action={
          <Link href="/komting/bookings">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Booking
            </Button>
          </Link>
        }
      />
    );
  }

  const canCancel = booking.status === "CONFIRMED";

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Booking ${booking.booking_code}`}
        description="Detail reservasi proyektor, jendela pengambilan, dan QR transaksi."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/komting/bookings">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </>
        }
      />

      {cancelSuccessMessage && (
        <Alert tone="success" title="Pembatalan Berhasil">
          {cancelSuccessMessage}
        </Alert>
      )}

      {booking.status === "FULFILLED" && (
        <Alert tone="info" title="Booking Sudah Diambil (Loan Aktif)">
          Unit telah diambil dan transaksi peminjaman berjalan. Pengembalian menggunakan QR yang
          sama dan harus dikonfirmasi oleh petugas STAFF/ADMIN.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="neutral" className="font-mono">
                {booking.booking_code}
              </Badge>
              <StatusBadge status={booking.status} />
            </div>
            <CardTitle className="mt-3">
              {projector ? `${projector.name} (${projector.asset_code})` : booking.projector_id}
            </CardTitle>
            <CardDescription>
              Dibuat pada {formatJakartaDateTime(booking.created_at)}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-2.5 p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Tanggal Booking</dt>
                <dd className="font-bold text-right">{formatCalendarDate(booking.booking_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Waktu Mulai</dt>
                <dd className="font-mono font-bold text-right">
                  {formatLocalTime(booking.start_time)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Estimasi Kembali</dt>
                <dd className="font-mono font-bold text-right">
                  {formatJakartaTimeOnly(booking.estimated_return_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Jendela Pickup</dt>
                <dd className="font-mono font-bold text-right">
                  {formatJakartaTimeOnly(booking.pickup_window.opens_at)} –{" "}
                  {formatJakartaTimeOnly(booking.pickup_window.closes_at)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Batas Akhir Pickup</dt>
                <dd className="text-right">
                  {formatJakartaDateTime(booking.pickup_window.closes_at)}
                </dd>
              </div>
            </dl>

            <Alert tone="info" title="Aturan Pengambilan">
              Jika tidak diambil hingga batas akhir jendela pickup (15 menit setelah waktu mulai),
              booking otomatis menjadi kedaluwarsa (<code>EXPIRED</code>).
            </Alert>
          </CardContent>

          <CardFooter className="justify-between">
            <Button variant="outline" size="sm" onClick={reloadBooking}>
              Muat Ulang Detail
            </Button>
            {canCancel && (
              <Button
                variant="danger"
                size="sm"
                onClick={() => {
                  setCancelSubmitError(null);
                  setCancelReasonError(undefined);
                  cancelIdempotencyRef.current = createIdempotencyKey();
                  setCancelOpen(true);
                }}
              >
                Batalkan Booking
              </Button>
            )}
          </CardFooter>
        </Card>

        <BookingQrCard
          bookingCode={booking.booking_code}
          bookingStatus={booking.status}
          qrPayload={qrData?.qr_payload ?? null}
          expiresAt={qrData?.expires_at ?? null}
          loading={qrLoading}
          errorMessage={qrError?.message}
          onRefreshQr={reloadQr}
        />
      </div>

      <ConfirmDialog
        open={cancelOpen}
        onClose={() => {
          if (!isCancelling) {
            cancelIdempotencyRef.current = null;
            setCancelOpen(false);
          }
        }}
        onConfirm={handleConfirmCancel}
        title="Batalkan Booking?"
        description="Booking yang dibatalkan tidak dapat diaktifkan kembali. Masukkan alasan pembatalan."
        confirmLabel="Ya, Batalkan Booking"
        cancelLabel="Kembali"
        confirmVariant="danger"
        isConfirming={isCancelling}
      >
        <div className="space-y-3">
          {cancelSubmitError && (
            <Alert tone="danger" title="Pembatalan Ditolak">
              {cancelSubmitError}
            </Alert>
          )}
          <Textarea
            id="cancel-booking-reason"
            label="Alasan Pembatalan"
            placeholder="Contoh: Jadwal kuliah dibatalkan atau dipindah."
            required
            value={cancelReason}
            onChange={(e) => {
              setCancelReason(e.target.value);
              if (cancelReasonError) setCancelReasonError(undefined);
            }}
            error={cancelReasonError}
            disabled={isCancelling}
          />
        </div>
      </ConfirmDialog>
    </div>
  );
}
