"use client";

import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
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
import { Input } from "@/components/ui/input";
import { PickupConfirmationPanel } from "@/features/staff/pickup-confirmation-panel";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import {
  formatCalendarDate,
  formatJakartaDateTime,
  formatJakartaTimeOnly,
  formatLocalTime,
} from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { QrValidationResponse } from "@/services/contracts";
import type { Booking, Projector } from "@/types/domain";

export function StaffBookingDetailView({ bookingId }: { bookingId: string }) {
  const validatingQrRef = useRef(false);
  const [qrInput, setQrInput] = useState("");
  const [qrInputError, setQrInputError] = useState<string | undefined>(undefined);
  const [validatingQr, setValidatingQr] = useState(false);
  const [qrValidation, setQrValidation] = useState<QrValidationResponse | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);

  const {
    data: booking,
    loading,
    error,
    reload: reloadBooking,
  } = useAsyncQuery<Booking>(async () => {
    const res = await services.booking.getStaffBooking(bookingId);
    return res.data;
  }, [bookingId]);

  const { data: projector } = useAsyncQuery<Projector | null>(
    async () => {
      if (!booking?.projector_id) return null;
      try {
        const res = await services.projector.getProjector(booking.projector_id);
        return res.data;
      } catch {
        return null;
      }
    },
    [booking?.projector_id],
    { enabled: Boolean(booking?.projector_id) }
  );

  const handleValidateQr = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (validatingQrRef.current) return;

    setQrError(null);
    setQrValidation(null);

    if (!qrInput.trim()) {
      setQrInputError("Token QR dari peminjam wajib diisi untuk verifikasi pickup.");
      return;
    }
    setQrInputError(undefined);
    validatingQrRef.current = true;
    setValidatingQr(true);

    try {
      const res = await services.qr.validateQr({
        qr_payload: qrInput.trim(),
        action: "PICKUP",
      });
      if (!res.data.valid) {
        setQrError("Token QR tidak valid untuk transaksi pickup.");
        return;
      }
      if (booking && res.data.transaction.booking_id !== booking.id) {
        setQrError(
          `Token QR cocok dengan booking ${res.data.transaction.booking_code}, bukan booking yang sedang dibuka.`
        );
        return;
      }
      setQrValidation(res.data);
    } catch (err) {
      setQrError(normalizeUnknownError(err).message);
    } finally {
      validatingQrRef.current = false;
      setValidatingQr(false);
    }
  };

  if (loading) {
    return (
      <LoadingState
        title="Memuat Detail Booking Operasional..."
        description="Mengambil informasi booking, peminjam, dan jendela pickup."
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
        message={error?.message ?? "Booking tidak ditemukan."}
        errorCode={error?.code}
        onRetry={reloadBooking}
        action={
          <Link href="/staff/bookings">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Booking
            </Button>
          </Link>
        }
      />
    );
  }

  const projectorLabel = projector
    ? `${projector.name} (${projector.asset_code})`
    : booking.projector_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Booking ${booking.booking_code}`}
        description="Pemeriksaan identitas booking dan konfirmasi serah-terima proyektor."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/bookings">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone="neutral" className="font-mono">
                {booking.booking_code}
              </Badge>
              <StatusBadge status={booking.status} />
            </div>
            <CardTitle className="mt-3">{projectorLabel}</CardTitle>
            <CardDescription>
              Dibuat pada {formatJakartaDateTime(booking.created_at)}
            </CardDescription>
          </CardHeader>

          <CardContent className="space-y-3 text-sm">
            <dl className="grid gap-2.5 p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Komting ID</dt>
                <dd className="font-mono font-bold text-right">{booking.komting_id}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Tanggal</dt>
                <dd className="font-bold text-right">{formatCalendarDate(booking.booking_date)}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="font-semibold text-[var(--color-muted)]">Jadwal</dt>
                <dd className="font-mono font-bold text-right">
                  {formatLocalTime(booking.start_time)} –{" "}
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
            </dl>
          </CardContent>

          <CardFooter>
            <Button variant="outline" size="sm" onClick={reloadBooking}>
              Muat Ulang Detail
            </Button>
          </CardFooter>
        </Card>

        <div className="space-y-4">
          {booking.status === "CONFIRMED" ? (
            <>
              <Card>
                <CardHeader>
                  <CardTitle>Validasi Token QR Pickup</CardTitle>
                  <CardDescription>
                    Pindai atau masukkan token QR opaque dari komting/perwakilan untuk memvalidasi
                    kelayakan pickup di server.
                  </CardDescription>
                </CardHeader>
                <form onSubmit={handleValidateQr} noValidate>
                  <CardContent className="space-y-3">
                    {qrError && (
                      <Alert tone="danger" title="Validasi QR Gagal">
                        {qrError}
                      </Alert>
                    )}
                    <Input
                      id="staff-booking-qr-token"
                      label="Token QR Booking"
                      placeholder="Masukkan token QR opaque..."
                      required
                      value={qrInput}
                      onChange={(e) => {
                        setQrInput(e.target.value);
                        if (qrInputError) setQrInputError(undefined);
                      }}
                      error={qrInputError}
                      disabled={validatingQr}
                    />
                  </CardContent>
                  <CardFooter className="justify-between">
                    <Link href="/staff/scan">
                      <Button variant="ghost" size="sm">
                        Buka Scanner Kamera
                      </Button>
                    </Link>
                    <Button
                      type="submit"
                      variant="secondary"
                      isLoading={validatingQr}
                      loadingText="Memvalidasi..."
                    >
                      Validasi QR
                    </Button>
                  </CardFooter>
                </form>
              </Card>

              {qrValidation && (
                <PickupConfirmationPanel
                  validation={qrValidation}
                  qrPayload={qrInput.trim()}
                  onConfirmed={() => reloadBooking()}
                />
              )}
            </>
          ) : booking.status === "FULFILLED" ? (
            <Card tone="success">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <Badge tone="success">SUDAH DIAMBIL</Badge>
                  <StatusBadge status={booking.status} />
                </div>
                <CardTitle className="mt-2 text-base">Serah-Terima Telah Selesai</CardTitle>
                <CardDescription>
                  Unit proyektor telah diserahkan kepada peminjam dan saat ini berada dalam status
                  peminjaman aktif (Loan ACTIVE).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2 text-sm">
                <Alert tone="info" title="Status Transaksi">
                  Peminjaman sedang berlangsung. Ketika peminjam mengembalikan unit, proses inspeksi
                  dapat dilakukan melalui menu Loan atau scan QR Return.
                </Alert>
              </CardContent>
              <CardFooter className="justify-end">
                <Link href="/staff/loans">
                  <Button variant="primary" size="sm">
                    Buka Daftar Peminjaman (Loan)
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          ) : (
            <Alert tone="info" title="Pickup Tidak Tersedia">
              Booking berstatus <strong>{booking.status}</strong>. Konfirmasi pickup hanya tersedia
              untuk booking berstatus <code>CONFIRMED</code>.
            </Alert>
          )}
        </div>
      </div>
    </div>
  );
}
