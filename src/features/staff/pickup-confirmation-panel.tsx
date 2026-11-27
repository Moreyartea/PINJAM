"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { normalizeUnknownError } from "@/lib/api/errors";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { createIdempotencyKey } from "@/lib/utils/idempotency";
import { validatePickupForm, type PickupValidationErrors } from "@/lib/validation/staff";
import { services } from "@/services";
import type { QrValidationResponse } from "@/services/contracts";
import type { HandoverActorType } from "@/types/domain";

export interface PickupConfirmationResult {
  booking: { id: string; status: string };
  loan: { id: string; status: string; picked_up_at: string };
  projector: { id: string; physical_status: string };
}

export interface PickupConfirmationPanelProps {
  validation: QrValidationResponse;
  qrPayload: string;
  onConfirmed?: (result: PickupConfirmationResult) => void;
}

/**
 * Shared explicit pickup confirmation panel.
 * Scan alone never updates state; requires explicit STAFF/ADMIN confirmation + Idempotency-Key.
 */
export function PickupConfirmationPanel({
  validation,
  qrPayload,
  onConfirmed,
}: PickupConfirmationPanelProps) {
  const [receivedBy, setReceivedBy] = useState<HandoverActorType>("KOMTING");
  const [representativeName, setRepresentativeName] = useState("");
  const [note, setNote] = useState("");
  const [fieldErrors, setFieldErrors] = useState<PickupValidationErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [result, setResult] = useState<PickupConfirmationResult | null>(null);

  const submittingRef = useRef(false);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const getIdempotencyKey = (signature: string) => {
    if (idempotencyRef.current && idempotencyRef.current.signature === signature) {
      return idempotencyRef.current.key;
    }
    const key = createIdempotencyKey();
    idempotencyRef.current = { signature, key };
    return key;
  };

  const handleRequestConfirm = () => {
    setSubmitError(null);
    const errors = validatePickupForm({
      qrPayload,
      receivedBy,
      representativeName,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }
    setConfirmOpen(true);
  };

  const handleConfirmPickup = async () => {
    if (submittingRef.current) return;

    const payload = {
      qr_payload: qrPayload.trim(),
      confirmed: true as const,
      received_by: receivedBy,
      representative_name: receivedBy === "REPRESENTATIVE" ? representativeName.trim() : null,
      note: note.trim() || null,
    };

    const signature = JSON.stringify({
      bookingId: validation.transaction.booking_id,
      ...payload,
    });
    const idempotencyKey = getIdempotencyKey(signature);

    submittingRef.current = true;
    setIsSubmitting(true);
    setSubmitError(null);

    try {
      const res = await services.qr.confirmPickup(
        validation.transaction.booking_id,
        payload,
        idempotencyKey
      );
      idempotencyRef.current = null;
      setConfirmOpen(false);
      setResult(res.data);
      onConfirmed?.(res.data);
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setSubmitError(normalized.message);
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (result) {
    return (
      <Card tone="success">
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="primary">Pickup Dikonfirmasi</Badge>
            <StatusBadge status={result.booking.status} />
          </div>
          <CardTitle className="mt-3">Serah-Terima Unit Berhasil</CardTitle>
          <CardDescription>Transaksi dicatat secara atomik oleh server.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2 text-sm">
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Booking</span>
            <StatusBadge status={result.booking.status} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Loan</span>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs">{result.loan.id}</span>
              <StatusBadge status={result.loan.status} />
            </div>
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Status Fisik Unit</span>
            <StatusBadge status={result.projector.physical_status} />
          </div>
          <div className="flex justify-between gap-2">
            <span className="font-semibold text-[var(--color-muted)]">Waktu Pickup</span>
            <span>{formatJakartaDateTime(result.loan.picked_up_at)}</span>
          </div>
        </CardContent>
        <CardFooter className="flex flex-wrap items-center justify-between gap-2 pt-3 border-t-2 border-[var(--color-surface-subtle)]">
          <Link href={`/staff/bookings/${encodeURIComponent(result.booking.id)}`}>
            <Button variant="outline" size="sm">
              Lihat Detail Booking
            </Button>
          </Link>
          <Link href={`/staff/loans/${encodeURIComponent(result.loan.id)}`}>
            <Button variant="primary" size="sm">
              Buka Detail Loan Baru
            </Button>
          </Link>
        </CardFooter>
      </Card>
    );
  }

  return (
    <>
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="primary">QR Valid — Siap Konfirmasi</Badge>
            <StatusBadge status={validation.transaction.status} />
          </div>
          <CardTitle className="mt-3">
            {validation.transaction.booking_code} — {validation.transaction.projector_name}
          </CardTitle>
          <CardDescription>
            Periksa kecocokan identitas peminjam dan unit fisik sebelum melakukan konfirmasi pickup.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <dl className="grid gap-2 text-sm p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-[var(--color-muted)]">Komting</dt>
              <dd className="font-bold text-right">{validation.transaction.komting_name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-[var(--color-muted)]">Kelas</dt>
              <dd className="font-bold text-right">{validation.transaction.class_name}</dd>
            </div>
            <div className="flex justify-between gap-2">
              <dt className="font-semibold text-[var(--color-muted)]">Unit Proyektor</dt>
              <dd className="font-bold text-right">{validation.transaction.projector_name}</dd>
            </div>
          </dl>

          {submitError && (
            <Alert tone="danger" title="Konfirmasi Pickup Gagal">
              {submitError}
            </Alert>
          )}

          <Select
            id="pickup-received-by"
            label="Penerima Unit"
            value={receivedBy}
            options={[
              { value: "KOMTING", label: "KOMTING — Diambil langsung oleh Komting" },
              { value: "REPRESENTATIVE", label: "REPRESENTATIVE — Diambil oleh Perwakilan" },
            ]}
            onChange={(e) => {
              setReceivedBy(e.target.value as HandoverActorType);
              setFieldErrors((prev) => ({ ...prev, representativeName: undefined }));
            }}
            disabled={isSubmitting}
          />

          {receivedBy === "REPRESENTATIVE" && (
            <Input
              id="pickup-representative-name"
              label="Nama Perwakilan Penerima"
              placeholder="Masukkan nama lengkap penerima..."
              required
              value={representativeName}
              onChange={(e) => {
                setRepresentativeName(e.target.value);
                if (fieldErrors.representativeName) {
                  setFieldErrors((prev) => ({ ...prev, representativeName: undefined }));
                }
              }}
              error={fieldErrors.representativeName}
              disabled={isSubmitting}
            />
          )}

          <Textarea
            id="pickup-note"
            label="Catatan Operasional (Opsional)"
            placeholder="Catatan tambahan serah-terima..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={isSubmitting}
          />
        </CardContent>

        <CardFooter className="justify-between">
          <span className="text-xs text-[var(--color-muted)]">
            Scan saja tidak mengubah status transaksi.
          </span>
          <Button variant="primary" onClick={handleRequestConfirm} disabled={isSubmitting}>
            Konfirmasi Pickup
          </Button>
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!isSubmitting) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmPickup}
        title="Konfirmasi Penyerahan Proyektor?"
        description={`Booking ${validation.transaction.booking_code} akan diubah menjadi FULFILLED, loan ACTIVE dibuat, dan unit menjadi BORROWED.`}
        confirmLabel="Ya, Konfirmasi Pickup"
        cancelLabel="Periksa Ulang"
        isConfirming={isSubmitting}
      >
        {submitError && (
          <Alert tone="danger" title="Gagal Mengirim Konfirmasi">
            {submitError}
          </Alert>
        )}
      </ConfirmDialog>
    </>
  );
}
