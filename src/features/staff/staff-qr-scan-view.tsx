"use client";

import Link from "next/link";
import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/feedback/alert";
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
import { ReturnInspectionForm } from "@/features/staff/return-inspection-form";
import { normalizeUnknownError } from "@/lib/api/errors";
import { isMockMode, services } from "@/services";
import type { QrValidationResponse } from "@/services/contracts";
import type { Loan, QRActionType } from "@/types/domain";

interface BarcodeDetectorLike {
  detect(source: HTMLVideoElement): Promise<Array<{ rawValue?: string }>>;
}

function safePlayVideo(video: HTMLVideoElement): Promise<void> | void {
  try {
    const playPromise = video.play();
    if (playPromise !== undefined && typeof playPromise.catch === "function") {
      return playPromise.catch((err: unknown) => {
        console.warn("Video playback interrupted or rejected:", err);
      });
    }
  } catch (err) {
    console.warn("Synchronous video playback error:", err);
  }
}

const MAX_ACTIVE_LOAN_LOOKUP_PAGES = 10;

async function findActiveLoanByBookingId(bookingId: string): Promise<Loan | null> {
  let currentPage = 1;
  while (currentPage <= MAX_ACTIVE_LOAN_LOOKUP_PAGES) {
    const activeLoansRes = await services.loan.listStaffLoans({
      status: "ACTIVE",
      page: currentPage,
      page_size: 20,
    });
    const matched = activeLoansRes.data.find((item) => item.booking_id === bookingId);
    if (matched) {
      return matched;
    }
    const totalPages = activeLoansRes.meta.pagination?.total_pages ?? 1;
    if (currentPage >= totalPages || activeLoansRes.data.length === 0) {
      break;
    }
    currentPage += 1;
  }
  return null;
}

export function StaffQrScanView() {
  const [action, setAction] = useState<QRActionType>("PICKUP");
  const [qrPayload, setQrPayload] = useState("");
  const [inputError, setInputError] = useState<string | undefined>(undefined);
  const [validating, setValidating] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [validationResult, setValidationResult] = useState<QrValidationResponse | null>(null);
  const [matchedLoan, setMatchedLoan] = useState<Loan | null>(null);

  const [cameraActive, setCameraActive] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const scanTimerRef = useRef<number | null>(null);
  const validatingRef = useRef(false);

  const stopCamera = useCallback(() => {
    if (scanTimerRef.current !== null) {
      window.clearInterval(scanTimerRef.current);
      scanTimerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    if (videoRef.current) {
      videoRef.current.srcObject = null;
    }
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  useEffect(() => {
    if (cameraActive && videoRef.current && streamRef.current) {
      const video = videoRef.current;
      if (video.srcObject !== streamRef.current) {
        video.srcObject = streamRef.current;
      }
      safePlayVideo(video);
    }
  }, [cameraActive]);

  const handleActionChange = useCallback(
    (newAction: QRActionType) => {
      if (action !== newAction) {
        stopCamera();
        setAction(newAction);
        setValidationResult(null);
        setMatchedLoan(null);
        setValidationError(null);
      }
    },
    [action, stopCamera]
  );

  const validateToken = useCallback(async (rawToken: string, targetAction: QRActionType) => {
    if (validatingRef.current) return;
    const token = rawToken.trim();
    setValidationError(null);
    setValidationResult(null);
    setMatchedLoan(null);

    if (!token) {
      setInputError("Token QR wajib diisi.");
      return;
    }
    setInputError(undefined);
    validatingRef.current = true;
    setValidating(true);

    try {
      const res = await services.qr.validateQr({
        qr_payload: token,
        action: targetAction,
      });

      if (!res.data.valid || res.data.action !== targetAction) {
        setValidationError("Token QR tidak valid untuk aksi yang dipilih.");
        return;
      }

      if (targetAction === "RETURN") {
        const loanToInspect = await findActiveLoanByBookingId(res.data.transaction.booking_id);

        if (!loanToInspect) {
          setValidationError(
            "Token valid, namun data loan ACTIVE tidak ditemukan untuk diproses return."
          );
          return;
        }
        setMatchedLoan(loanToInspect);
      }

      setValidationResult(res.data);
    } catch (err) {
      setValidationError(normalizeUnknownError(err).message);
    } finally {
      setValidating(false);
      validatingRef.current = false;
    }
  }, []);

  const handleManualSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    await validateToken(qrPayload, action);
  };

  const handleStartCamera = async () => {
    setCameraError(null);
    if (
      typeof navigator === "undefined" ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== "function"
    ) {
      setCameraError(
        "Perangkat atau browser tidak mendukung akses kamera. Gunakan input token manual."
      );
      return;
    }

    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: "environment" } },
      });
      streamRef.current = stream;

      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;

      if (!BarcodeDetectorCtor) {
        stopCamera();
        setCameraError(
          "Kamera aktif, tetapi browser belum mendukung pemindaian QR otomatis (BarcodeDetector API). Masukkan token secara manual."
        );
        return;
      }

      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        safePlayVideo(videoRef.current);
      }

      const detector = new BarcodeDetectorCtor({ formats: ["qr_code"] });
      scanTimerRef.current = window.setInterval(async () => {
        if (!videoRef.current || videoRef.current.readyState < 2) return;
        try {
          const detected = await detector.detect(videoRef.current);
          const raw = detected[0]?.rawValue?.trim();
          if (raw) {
            stopCamera();
            setQrPayload(raw);
            await validateToken(raw, action);
          }
        } catch {
          // Ignore single frame decode error
        }
      }, 450);
    } catch (err: unknown) {
      stopCamera();
      const errorName = (err as { name?: string })?.name ?? "";
      const errorMessage = (err as { message?: string })?.message ?? "kesalahan tidak diketahui";
      if (errorName === "NotAllowedError" || errorName === "PermissionDeniedError") {
        setCameraError(
          "Izin kamera ditolak oleh pengguna atau browser. Berikan izin akses kamera di pengaturan browser atau gunakan input token manual."
        );
      } else if (errorName === "NotFoundError" || errorName === "DevicesNotFoundError") {
        setCameraError(
          "Perangkat kamera tidak ditemukan pada perangkat ini. Gunakan input token manual."
        );
      } else if (errorName === "NotReadableError") {
        setCameraError(
          "Kamera sedang digunakan oleh aplikasi lain atau tidak dapat diakses (NotReadableError). Gunakan input token manual."
        );
      } else if (errorName === "OverconstrainedError") {
        setCameraError(
          "Kamera tidak memenuhi persyaratan yang diminta (OverconstrainedError). Gunakan input token manual."
        );
      } else {
        setCameraError(`Gagal mengakses kamera (${errorMessage}). Gunakan input token manual.`);
      }
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Scan QR Operasional"
        description="Validasi QR untuk serah-terima (PICKUP) atau pengembalian (RETURN). Scan tidak otomatis menyelesaikan transaksi."
        actions={
          isMockMode ? (
            <Badge tone="warning" symbol="!">
              SIMULASI DEV
            </Badge>
          ) : undefined
        }
      />

      <div className="grid gap-6 lg:grid-cols-2 items-start">
        <Card>
          <CardHeader>
            <CardTitle>1. Pilih Aksi &amp; Pindai QR</CardTitle>
            <CardDescription>Token QR tidak disimpan di localStorage atau URL.</CardDescription>
          </CardHeader>

          <CardContent className="space-y-4">
            <div className="flex flex-wrap gap-2" role="group" aria-label="Pilih aksi scan QR">
              <Button
                type="button"
                variant={action === "PICKUP" ? "primary" : "outline"}
                size="sm"
                onClick={() => handleActionChange("PICKUP")}
              >
                PICKUP (Pengambilan)
              </Button>
              <Button
                type="button"
                variant={action === "RETURN" ? "primary" : "outline"}
                size="sm"
                onClick={() => handleActionChange("RETURN")}
              >
                RETURN (Pengembalian)
              </Button>
            </div>

            {cameraError && (
              <Alert tone="warning" title="Kamera Tidak Tersedia">
                {cameraError}
              </Alert>
            )}

            <div className="flex flex-wrap gap-2">
              {!cameraActive ? (
                <Button type="button" variant="secondary" size="sm" onClick={handleStartCamera}>
                  Aktifkan Kamera QR
                </Button>
              ) : (
                <Button type="button" variant="danger" size="sm" onClick={stopCamera}>
                  Matikan Kamera
                </Button>
              )}
            </div>

            {cameraActive && (
              <div className="nb-border rounded-[var(--radius-sm)] overflow-hidden bg-black">
                <video
                  data-testid="qr-video-preview"
                  ref={(el) => {
                    videoRef.current = el;
                    if (el && streamRef.current && el.srcObject !== streamRef.current) {
                      el.srcObject = streamRef.current;
                      safePlayVideo(el);
                    }
                  }}
                  playsInline
                  muted
                  className="w-full max-h-64 object-cover"
                />
              </div>
            )}

            <form
              onSubmit={handleManualSubmit}
              noValidate
              className="space-y-3 pt-2 border-t-2 border-[var(--color-surface-subtle)]"
            >
              {validationError && (
                <Alert tone="danger" title="Validasi QR Ditolak">
                  {validationError}
                </Alert>
              )}

              <Input
                id="scan-qr-token-input"
                label="Token QR (Input Manual / Hasil Scan)"
                placeholder="Tempel token QR opaque..."
                required
                value={qrPayload}
                onChange={(e) => {
                  setQrPayload(e.target.value);
                  if (inputError) setInputError(undefined);
                }}
                hint={
                  isMockMode
                    ? "Simulasi: sim_qr_pickup_ready_01 (PICKUP) atau sim_qr_return_active_01 (RETURN)."
                    : "Gunakan token opaque yang ditampilkan di halaman booking komting."
                }
                error={inputError}
                disabled={validating}
              />

              <Button
                type="submit"
                variant="primary"
                fullWidth
                isLoading={validating}
                loadingText="Memvalidasi Token..."
              >
                Validasi Token QR
              </Button>
            </form>
          </CardContent>
          <CardFooter className="text-xs text-[var(--color-muted)]">
            Validasi QR hanya membaca konteks transaksi dan tidak mengubah status database.
          </CardFooter>
        </Card>

        <div className="space-y-6">
          {!validationResult && (
            <Alert tone="info" title="Menunggu Validasi QR">
              Pilih aksi <code>PICKUP</code> atau <code>RETURN</code>, lalu pindai atau masukkan
              token QR untuk menampilkan ringkasan dan formulir konfirmasi.
            </Alert>
          )}

          {validationResult && (
            <Card className="border-2 border-[var(--color-primary)]">
              <CardHeader>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <CardTitle>Hasil Verifikasi QR dari Server</CardTitle>
                  <div className="flex items-center gap-2">
                    <Badge tone="success">VALID</Badge>
                    <Badge tone="accent">{validationResult.action}</Badge>
                  </div>
                </div>
                <CardDescription>
                  Token diverifikasi oleh backend (<code>POST /api/v1/staff/qr/validate</code>).
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div>
                    <span className="font-semibold text-xs uppercase tracking-wider block text-[var(--color-muted)]">
                      Kode Booking
                    </span>
                    <span className="font-mono font-bold">
                      {validationResult.transaction.booking_code}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-xs uppercase tracking-wider block text-[var(--color-muted)]">
                      Peminjam
                    </span>
                    <span>
                      {validationResult.transaction.komting_name} (
                      {validationResult.transaction.class_name})
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-xs uppercase tracking-wider block text-[var(--color-muted)]">
                      Proyektor
                    </span>
                    <span className="font-semibold">
                      {validationResult.transaction.projector_name}
                    </span>
                  </div>
                  <div>
                    <span className="font-semibold text-xs uppercase tracking-wider block text-[var(--color-muted)]">
                      Status Transaksi
                    </span>
                    <div className="pt-0.5">
                      <StatusBadge status={validationResult.transaction.status} />
                    </div>
                  </div>
                </div>

                <Alert tone="info" title="Verifikasi Selesai">
                  Scan QR ini hanya melakukan verifikasi di server dan{" "}
                  <strong>tidak mengubah status transaksi</strong>.
                </Alert>
              </CardContent>
              <CardFooter className="flex justify-end pt-0">
                <Link
                  href={`/staff/bookings/${encodeURIComponent(validationResult.transaction.booking_id)}`}
                  className="inline-flex items-center justify-center font-bold uppercase tracking-wider text-xs px-3 py-2 rounded-[var(--radius-sm)] bg-[var(--color-surface)] text-[var(--color-ink)] hover:bg-[var(--color-surface-subtle)] nb-border nb-shadow nb-interactive"
                >
                  Buka Detail Booking
                </Link>
              </CardFooter>
            </Card>
          )}

          {validationResult && validationResult.action === "PICKUP" && (
            <PickupConfirmationPanel validation={validationResult} qrPayload={qrPayload.trim()} />
          )}

          {validationResult && validationResult.action === "RETURN" && matchedLoan && (
            <ReturnInspectionForm
              loan={matchedLoan}
              projectorLabel={validationResult.transaction.projector_name}
              initialQrPayload={qrPayload.trim()}
            />
          )}
        </div>
      </div>
    </div>
  );
}
