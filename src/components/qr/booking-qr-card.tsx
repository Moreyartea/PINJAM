"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Spinner } from "@/components/ui/spinner";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode } from "@/services";

export interface BookingQrCardProps {
  bookingCode: string;
  bookingStatus: string;
  qrPayload: string | null;
  expiresAt: string | null;
  loading?: boolean;
  errorMessage?: string | null;
  onRefreshQr?: () => void;
}

/**
 * Renders an opaque QR payload received from GET /api/v1/komting/bookings/{id}/qr.
 * Never generates tokens client-side, never encodes PII, and never treats QR display as completion.
 */
export function BookingQrCard({
  bookingCode,
  bookingStatus,
  qrPayload,
  expiresAt,
  loading = false,
  errorMessage,
  onRefreshQr,
}: BookingQrCardProps) {
  const [svgMarkup, setSvgMarkup] = useState<string | null>(null);
  const [renderError, setRenderError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function renderQr() {
      if (!qrPayload) {
        setSvgMarkup(null);
        setRenderError(null);
        return;
      }

      try {
        const svg = await QRCode.toString(qrPayload, {
          type: "svg",
          margin: 2,
          width: 220,
          color: {
            dark: "#171717",
            light: "#ffffff",
          },
        });
        if (!active) return;
        setSvgMarkup(svg);
        setRenderError(null);
      } catch {
        if (!active) return;
        setSvgMarkup(null);
        setRenderError("Gagal merender gambar QR.");
      }
    }

    void renderQr();

    return () => {
      active = false;
    };
  }, [qrPayload]);

  const qrEligible = bookingStatus === "CONFIRMED" || bookingStatus === "FULFILLED";

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <Badge tone="primary">QR Booking</Badge>
          {isMockMode && (
            <Badge tone="warning" symbol="!">
              SIMULASI DEV
            </Badge>
          )}
        </div>
        <CardTitle className="mt-3">Kode QR Pickup &amp; Return</CardTitle>
        <CardDescription>
          Tunjukkan QR ini kepada petugas STAFF/ADMIN saat mengambil atau mengembalikan proyektor.
        </CardDescription>
      </CardHeader>

      <CardContent className="space-y-4">
        {!qrEligible && (
          <Alert tone="info" title="QR Tidak Aktif">
            QR hanya tersedia untuk booking berstatus Terkonfirmasi atau Diambil. Status saat ini:{" "}
            <strong>{bookingStatus}</strong>.
          </Alert>
        )}

        {qrEligible && loading && (
          <div className="py-8 flex flex-col items-center justify-center gap-2">
            <Spinner size="lg" label="Memuat QR booking..." />
            <p className="text-sm text-[var(--color-muted)]">Mengambil token QR dari server...</p>
          </div>
        )}

        {qrEligible && !loading && (errorMessage || renderError) && (
          <Alert tone="danger" title="QR Belum Dapat Ditampilkan">
            {errorMessage ?? renderError}
          </Alert>
        )}

        {qrEligible && !loading && !errorMessage && !renderError && !qrPayload && (
          <Alert tone="warning" title="QR Belum Tersedia">
            Token QR belum diterbitkan oleh server. Silakan muat ulang beberapa saat lagi.
          </Alert>
        )}

        {qrEligible && !loading && !errorMessage && qrPayload && (
          <div className="flex flex-col items-center gap-3">
            {svgMarkup && (
              <div
                aria-label={`QR code untuk booking ${bookingCode}`}
                className="p-3 bg-white nb-border nb-shadow rounded-[var(--radius-md)] inline-block"
                dangerouslySetInnerHTML={{ __html: svgMarkup }}
              />
            )}

            <div className="w-full p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] text-xs sm:text-sm space-y-1.5">
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[var(--color-muted)]">Kode Booking</span>
                <span className="font-mono font-bold">{bookingCode}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="font-semibold text-[var(--color-muted)]">Token Opaque</span>
                <span className="font-mono text-xs break-all text-right">{qrPayload}</span>
              </div>
              {expiresAt && (
                <div className="flex justify-between gap-2">
                  <span className="font-semibold text-[var(--color-muted)]">Berlaku Hingga</span>
                  <span className="text-right">{formatJakartaDateTime(expiresAt)}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <Alert tone="warning" title="Ketentuan Serah-Terima">
          QR hanya mengidentifikasi transaksi secara aman (tanpa data pribadi). Pengambilan dan
          pengembalian baru sah setelah dipindai dan dikonfirmasi langsung oleh STAFF/ADMIN.
        </Alert>
      </CardContent>

      {qrEligible && onRefreshQr && (
        <CardFooter>
          <Button
            variant="outline"
            size="sm"
            onClick={onRefreshQr}
            isLoading={loading}
            loadingText="Memuat..."
          >
            Muat Ulang QR
          </Button>
        </CardFooter>
      )}
    </Card>
  );
}
