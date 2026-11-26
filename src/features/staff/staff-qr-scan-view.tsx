"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import { Alert } from "@/components/feedback/alert";
import { PageHeader } from "@/components/layout/app-shell";
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
    setCameraActive(false);
  }, []);

  useEffect(() => {
    return () => {
      stopCamera();
    };
  }, [stopCamera]);

  const validateToken = useCallback(async (rawToken: string, targetAction: QRActionType) => {
    const token = rawToken.trim();
    setValidationError(null);
    setValidationResult(null);
    setMatchedLoan(null);

    if (!token) {
      setInputError("Token QR wajib diisi.");
      return;
    }
    setInputError(undefined);
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
        video: { facingMode: "environment" },
      });
      streamRef.current = stream;
      setCameraActive(true);

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => undefined);
      }

      const BarcodeDetectorCtor = (
        window as unknown as {
          BarcodeDetector?: new (opts: { formats: string[] }) => BarcodeDetectorLike;
        }
      ).BarcodeDetector;

      if (!BarcodeDetectorCtor) {
        setCameraError(
          "Kamera aktif, tetapi browser belum mendukung pemindaian QR otomatis. Masukkan token secara manual."
        );
        return;
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
    } catch {
      stopCamera();
      setCameraError("Izin kamera ditolak atau kamera tidak tersedia. Gunakan input token manual.");
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
                onClick={() => {
                  setAction("PICKUP");
                  setValidationResult(null);
                  setMatchedLoan(null);
                  setValidationError(null);
                }}
              >
                PICKUP (Pengambilan)
              </Button>
              <Button
                type="button"
                variant={action === "RETURN" ? "primary" : "outline"}
                size="sm"
                onClick={() => {
                  setAction("RETURN");
                  setValidationResult(null);
                  setMatchedLoan(null);
                  setValidationError(null);
                }}
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
                <video ref={videoRef} playsInline muted className="w-full max-h-64 object-cover" />
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

        <div>
          {!validationResult && (
            <Alert tone="info" title="Menunggu Validasi QR">
              Pilih aksi <code>PICKUP</code> atau <code>RETURN</code>, lalu pindai atau masukkan
              token QR untuk menampilkan ringkasan dan formulir konfirmasi.
            </Alert>
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
