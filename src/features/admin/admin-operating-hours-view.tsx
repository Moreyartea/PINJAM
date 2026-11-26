"use client";

import { useRef, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
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
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import type { ApiErrorDetail } from "@/lib/api/types";
import { formatCalendarDate, formatLocalTime, getJakartaDateString } from "@/lib/utils/date";
import {
  normalizeApiTime,
  validateOperatingHoursForm,
  type OperatingHoursValidationErrors,
} from "@/lib/validation/admin";
import { isMockMode, services } from "@/services";
import type { OperatingHoursSnapshot } from "@/types/domain";

function toTimeInputValue(timeStr: string | null | undefined): string {
  if (!timeStr) return "";
  return timeStr.slice(0, 5);
}

export function AdminOperatingHoursView() {
  const [selectedDate, setSelectedDate] = useState<string>(() => getJakartaDateString());

  const [draftOpensAt, setDraftOpensAt] = useState<string | null>(null);
  const [draftClosesAt, setDraftClosesAt] = useState<string | null>(null);
  const [draftEarlyOpenAt, setDraftEarlyOpenAt] = useState<string | null>(null);
  const [draftNote, setDraftNote] = useState<string | null>(null);

  const [fieldErrors, setFieldErrors] = useState<OperatingHoursValidationErrors>({});
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [saveErrorDetails, setSaveErrorDetails] = useState<ApiErrorDetail[]>([]);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  const submittingRef = useRef(false);

  const {
    data: snapshot,
    loading,
    error,
    reload,
  } = useAsyncQuery<OperatingHoursSnapshot | null>(async () => {
    const res = await services.operatingHours.getOperatingHours(selectedDate);
    return res.data ?? null;
  }, [selectedDate]);

  const opensAt = draftOpensAt ?? toTimeInputValue(snapshot?.opens_at);
  const closesAt = draftClosesAt ?? toTimeInputValue(snapshot?.closes_at);
  const adminEarlyOpenAt = draftEarlyOpenAt ?? "";
  const note = draftNote ?? "";

  const handleDateChange = (nextDate: string) => {
    setSelectedDate(nextDate);
    setDraftOpensAt(null);
    setDraftClosesAt(null);
    setDraftEarlyOpenAt(null);
    setDraftNote(null);
    setFieldErrors({});
    setSaveError(null);
    setSaveErrorDetails([]);
    setSaveSuccess(null);
  };

  const handleRequestSave = () => {
    setSaveError(null);
    setSaveErrorDetails([]);
    setSaveSuccess(null);

    const errors = validateOperatingHoursForm({
      date: selectedDate,
      opensAt,
      closesAt,
      adminEarlyOpenAt,
    });
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    setConfirmOpen(true);
  };

  const handleConfirmSave = async () => {
    if (submittingRef.current) return;

    submittingRef.current = true;
    setSaving(true);
    setSaveError(null);
    setSaveErrorDetails([]);

    try {
      const res = await services.operatingHours.updateOperatingHours(selectedDate, {
        opens_at: normalizeApiTime(opensAt),
        closes_at: normalizeApiTime(closesAt),
        admin_early_open_at: adminEarlyOpenAt.trim() ? normalizeApiTime(adminEarlyOpenAt) : null,
        note: note.trim() || null,
      });

      setConfirmOpen(false);
      setDraftOpensAt(null);
      setDraftClosesAt(null);
      setDraftEarlyOpenAt(null);
      setDraftNote(null);
      setSaveSuccess(
        `Konfigurasi jam operasional untuk ${formatCalendarDate(
          res.data.service_date ?? selectedDate
        )} berhasil disimpan (${formatLocalTime(res.data.opens_at)} – ${formatLocalTime(
          res.data.closes_at
        )}, pickup paling awal ${formatLocalTime(res.data.early_pickup_allowed_at)}).`
      );
      await reload();
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setSaveError(normalized.message);
      setSaveErrorDetails(normalized.details);
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Konfigurasi Jam Operasional"
        description="Atur jam buka, pembukaan lebih awal, dan jam tutup layanan peminjaman proyektor pada zona waktu Asia/Jakarta."
        actions={
          isMockMode ? (
            <Badge tone="warning" symbol="!">
              DATA SIMULASI DEV
            </Badge>
          ) : undefined
        }
      />

      <Alert tone="info" title="Aturan Jam Operasional & Snapshot Historis (Asia/Jakarta)">
        <ul className="list-disc pl-5 space-y-1">
          <li>
            Jam buka standar layanan adalah <strong>08:00 WIB</strong>, dengan izin pickup standar
            mulai <strong>07:45 WIB</strong> (15 menit sebelum jam buka tanpa persetujuan ADMIN).
          </li>
          <li>
            Jika ADMIN menetapkan pembukaan lebih awal (mis. 07:00 WIB), sistem mengatur batas
            pickup paling awal dengan toleransi 30 menit sesuai snapshot layanan server.
          </li>
          <li>
            Perubahan hanya berlaku untuk tanggal layanan yang dipilih dan tidak mengubah snapshot
            booking historis yang sudah tercatat maupun membatalkan booking secara diam-diam.
          </li>
        </ul>
      </Alert>

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-64">
          <Input
            id="operating-hours-date"
            type="date"
            label="Tanggal Layanan (Asia/Jakarta)"
            value={selectedDate}
            onChange={(e) => handleDateChange(e.target.value)}
            error={fieldErrors.date}
          />
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          Muat Ulang Snapshot
        </Button>
      </div>

      {saveSuccess && (
        <Alert tone="success" title="Jam Operasional Diperbarui">
          {saveSuccess}
        </Alert>
      )}

      {loading && (
        <LoadingState
          title="Memuat Konfigurasi Jam Operasional..."
          description={`Mengambil snapshot layanan tanggal ${selectedDate}.`}
          rows={3}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Jam Operasional"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && !snapshot && (
        <EmptyState
          title="Konfigurasi Jam Operasional Belum Tersedia"
          description="Server belum mengembalikan snapshot jam operasional untuk tanggal yang dipilih."
          action={
            <Button variant="outline" size="sm" onClick={reload}>
              Muat Ulang
            </Button>
          }
        />
      )}

      {!loading && !error && snapshot && (
        <div className="grid gap-6 lg:grid-cols-2 items-start">
          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="secondary" className="font-mono">
                  {snapshot.timezone ?? "Asia/Jakarta"}
                </Badge>
                <Badge tone="neutral" className="font-mono">
                  {snapshot.service_date ?? selectedDate}
                </Badge>
              </div>
              <CardTitle className="mt-3">
                Snapshot Berlaku — {formatCalendarDate(snapshot.service_date ?? selectedDate)}
              </CardTitle>
              <CardDescription>
                Nilai resmi dari backend yang menjadi acuan validasi booking dan jendela pickup pada
                tanggal ini.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-3 text-sm">
              <dl className="grid gap-2.5 p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Zona Waktu</dt>
                  <dd className="font-mono font-bold text-right">
                    {snapshot.timezone ?? "Asia/Jakarta"}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Jam Buka Layanan</dt>
                  <dd className="font-mono font-bold text-right">
                    {formatLocalTime(snapshot.opens_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Jam Tutup Layanan</dt>
                  <dd className="font-mono font-bold text-right">
                    {formatLocalTime(snapshot.closes_at)}
                  </dd>
                </div>
                <div className="flex justify-between gap-2">
                  <dt className="font-semibold text-[var(--color-muted)]">Pickup Paling Awal</dt>
                  <dd className="font-mono font-bold text-right">
                    {formatLocalTime(snapshot.early_pickup_allowed_at)}
                  </dd>
                </div>
                {snapshot.configured_open_at && (
                  <div className="flex justify-between gap-2">
                    <dt className="font-semibold text-[var(--color-muted)]">
                      Jam Buka Terkonfigurasi
                    </dt>
                    <dd className="font-mono font-bold text-right">
                      {formatLocalTime(snapshot.configured_open_at)}
                    </dd>
                  </div>
                )}
              </dl>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ubah Jam Operasional</CardTitle>
              <CardDescription>
                Konfigurasi akan divalidasi oleh server terhadap booking aktif pada tanggal{" "}
                <strong>{formatCalendarDate(selectedDate)}</strong>.
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-4">
              {saveError && !confirmOpen && (
                <Alert tone="danger" title="Perubahan Ditolak">
                  <p>{saveError}</p>
                  {saveErrorDetails.length > 0 && (
                    <ul className="list-disc pl-5 mt-2 space-y-1 text-xs font-mono">
                      {saveErrorDetails.map((detail, idx) => (
                        <li key={`${detail.field}-${idx}`}>
                          <strong>{detail.field}:</strong> {detail.reason}
                        </li>
                      ))}
                    </ul>
                  )}
                </Alert>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="operating-hours-opens-at"
                  type="time"
                  label="Jam Buka (WIB)"
                  required
                  value={opensAt}
                  onChange={(e) => {
                    setDraftOpensAt(e.target.value);
                    if (fieldErrors.opensAt || fieldErrors.closesAt) {
                      setFieldErrors((prev) => ({
                        ...prev,
                        opensAt: undefined,
                        closesAt: undefined,
                      }));
                    }
                  }}
                  error={fieldErrors.opensAt}
                  disabled={saving}
                />

                <Input
                  id="operating-hours-closes-at"
                  type="time"
                  label="Jam Tutup (WIB)"
                  required
                  value={closesAt}
                  onChange={(e) => {
                    setDraftClosesAt(e.target.value);
                    if (fieldErrors.closesAt) {
                      setFieldErrors((prev) => ({ ...prev, closesAt: undefined }));
                    }
                  }}
                  error={fieldErrors.closesAt}
                  disabled={saving}
                />
              </div>

              <Input
                id="operating-hours-early-open"
                type="time"
                label="Pembukaan Lebih Awal Khusus ADMIN (Opsional)"
                value={adminEarlyOpenAt}
                onChange={(e) => {
                  setDraftEarlyOpenAt(e.target.value);
                  if (fieldErrors.adminEarlyOpenAt) {
                    setFieldErrors((prev) => ({ ...prev, adminEarlyOpenAt: undefined }));
                  }
                }}
                hint="Kosongkan untuk pembukaan reguler. Jika diisi lebih awal (mis. 07:00), pickup paling awal mengikuti aturan toleransi 30 menit server."
                error={fieldErrors.adminEarlyOpenAt}
                disabled={saving}
              />

              <Textarea
                id="operating-hours-note"
                label="Catatan Perubahan (Opsional)"
                placeholder="Contoh: Penyesuaian jam layanan kegiatan akademik."
                value={note}
                onChange={(e) => setDraftNote(e.target.value)}
                disabled={saving}
              />
            </CardContent>

            <CardFooter className="justify-between">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={saving}
                onClick={() => {
                  setDraftOpensAt(null);
                  setDraftClosesAt(null);
                  setDraftEarlyOpenAt(null);
                  setDraftNote(null);
                  setFieldErrors({});
                  setSaveError(null);
                  setSaveErrorDetails([]);
                }}
              >
                Reset ke Snapshot Saat Ini
              </Button>
              <Button type="button" variant="primary" disabled={saving} onClick={handleRequestSave}>
                Simpan Konfigurasi
              </Button>
            </CardFooter>
          </Card>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!saving) setConfirmOpen(false);
        }}
        onConfirm={handleConfirmSave}
        title={`Simpan Jam Operasional ${selectedDate}?`}
        description="Perubahan akan divalidasi server terhadap booking aktif dan dicatat sebagai snapshot tanggal layanan ini tanpa mengubah booking historis."
        confirmLabel="Ya, Simpan Konfigurasi"
        cancelLabel="Periksa Ulang"
        isConfirming={saving}
      >
        <div className="space-y-3 text-sm">
          {saveError && (
            <Alert tone="danger" title="Gagal Menyimpan Konfigurasi">
              <p>{saveError}</p>
              {saveErrorDetails.length > 0 && (
                <ul className="list-disc pl-5 mt-2 space-y-1 text-xs font-mono">
                  {saveErrorDetails.map((detail, idx) => (
                    <li key={`${detail.field}-${idx}`}>
                      <strong>{detail.field}:</strong> {detail.reason}
                    </li>
                  ))}
                </ul>
              )}
            </Alert>
          )}

          <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1.5">
            <p className="font-bold">Ringkasan Perubahan</p>
            <p>
              Tanggal: <strong className="font-mono">{selectedDate}</strong> (Asia/Jakarta)
            </p>
            <p>
              Jam Buka:{" "}
              <span className="font-mono">
                {formatLocalTime(snapshot?.opens_at)} → {formatLocalTime(opensAt)}
              </span>
            </p>
            <p>
              Jam Tutup:{" "}
              <span className="font-mono">
                {formatLocalTime(snapshot?.closes_at)} → {formatLocalTime(closesAt)}
              </span>
            </p>
            <p>
              Pembukaan Awal Khusus:{" "}
              <span className="font-mono">
                {adminEarlyOpenAt.trim()
                  ? formatLocalTime(adminEarlyOpenAt)
                  : "Tidak diatur (null)"}
              </span>
            </p>
            {note.trim() && (
              <p>
                Catatan: <span>{note.trim()}</span>
              </p>
            )}
          </div>
        </div>
      </ConfirmDialog>
    </div>
  );
}
