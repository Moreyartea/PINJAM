"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useRef, useState, type FormEvent } from "react";
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
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import {
  formatCalendarDate,
  formatLocalTime,
  getJakartaDateString,
  getJakartaTomorrowDateString,
  jakartaDateTimeToUtcIso,
} from "@/lib/utils/date";
import { createIdempotencyKey } from "@/lib/utils/idempotency";
import { validateBookingForm, type BookingValidationErrors } from "@/lib/validation/booking";
import { isMockMode, services } from "@/services";
import type { AvailabilityResult, OperatingHoursSnapshot, Projector } from "@/types/domain";

export function NewBookingForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialProjectorId = searchParams.get("projector_id") ?? "";
  const { user } = useAuth();

  const todayDate = useMemo(() => getJakartaDateString(), []);
  const tomorrowDate = useMemo(() => getJakartaTomorrowDateString(), []);

  const [selectedProjectorId, setSelectedProjectorId] = useState(initialProjectorId);
  const [bookingDate, setBookingDate] = useState(todayDate);
  const [startTime, setStartTime] = useState("09:00");
  const [estimatedReturnTime, setEstimatedReturnTime] = useState("11:00");
  const [fieldErrors, setFieldErrors] = useState<BookingValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Guard against rapid double-click / double-submit and keep one Idempotency-Key per payload.
  const submittingRef = useRef(false);
  const idempotencyRef = useRef<{ signature: string; key: string } | null>(null);

  const {
    data: projectorsData,
    loading: projectorsLoading,
    error: projectorsError,
    reload: reloadProjectors,
  } = useAsyncQuery<Projector[]>(async () => {
    const response = await services.projector.listProjectors({ page: 1, page_size: 100 });
    return response.data;
  }, []);

  const projectors = useMemo(() => projectorsData ?? [], [projectorsData]);
  const activeProjectorId = selectedProjectorId || projectors[0]?.id || "";

  const {
    data: operatingHours,
    loading: hoursLoading,
    error: hoursError,
    reload: reloadHours,
  } = useAsyncQuery<OperatingHoursSnapshot>(async () => {
    const response = await services.operatingHours.getOperatingHours(bookingDate);
    return response.data;
  }, [bookingDate]);

  const {
    data: availability,
    loading: availabilityLoading,
    error: availabilityError,
    reload: reloadAvailability,
  } = useAsyncQuery<AvailabilityResult>(
    async () => {
      const response = await services.availability.checkAvailability({
        projector_id: activeProjectorId,
        date: bookingDate,
      });
      return response.data;
    },
    [activeProjectorId, bookingDate],
    { enabled: Boolean(activeProjectorId && bookingDate) }
  );

  const selectedProjector = projectors.find((p) => p.id === activeProjectorId) ?? null;
  const effectiveOperatingHours = availability?.operating_hours ?? operatingHours ?? null;

  const isKomtingEligible =
    user?.account_status === "ACTIVE" && user?.komting_assignment?.status === "ACTIVE";

  const getOrCreateIdempotencyKey = (signature: string): string => {
    if (idempotencyRef.current && idempotencyRef.current.signature === signature) {
      return idempotencyRef.current.key;
    }
    const nextKey = createIdempotencyKey();
    idempotencyRef.current = { signature, key: nextKey };
    return nextKey;
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (submittingRef.current) return;

    setSubmitError(null);
    const errors = validateBookingForm(
      {
        projectorId: activeProjectorId,
        bookingDate,
        startTime,
        estimatedReturnTime,
      },
      effectiveOperatingHours
    );
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      return;
    }

    const payloadSignature = [activeProjectorId, bookingDate, startTime, estimatedReturnTime].join(
      "|"
    );
    const idempotencyKey = getOrCreateIdempotencyKey(payloadSignature);

    submittingRef.current = true;
    setIsSubmitting(true);

    try {
      const response = await services.booking.createBooking(
        {
          projector_id: activeProjectorId,
          booking_date: bookingDate,
          start_time: `${startTime}:00`,
          estimated_return_at: jakartaDateTimeToUtcIso(bookingDate, estimatedReturnTime),
        },
        idempotencyKey
      );

      // Clear idempotency key after successful creation so future bookings use fresh keys.
      idempotencyRef.current = null;
      router.push(`/komting/bookings/${encodeURIComponent(response.data.id)}`);
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setSubmitError(normalized.message);
      const apiFields = normalized.getFieldErrors();
      if (Object.keys(apiFields).length > 0) {
        setFieldErrors((prev) => ({
          ...prev,
          projectorId: apiFields.projector_id ?? prev.projectorId,
          bookingDate: apiFields.booking_date ?? prev.bookingDate,
          startTime: apiFields.start_time ?? prev.startTime,
          estimatedReturnTime: apiFields.estimated_return_at ?? prev.estimatedReturnTime,
        }));
      }
      // Refresh availability after conflict or validation rejection.
      if (normalized.status === 409) {
        reloadAvailability();
      }
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  if (projectorsLoading) {
    return (
      <LoadingState
        title="Memuat Form Booking..."
        description="Mengambil daftar proyektor dan konfigurasi jam operasional."
        rows={4}
      />
    );
  }

  if (projectorsError) {
    return (
      <ErrorState
        title="Gagal Memuat Daftar Proyektor"
        message={projectorsError.message}
        errorCode={projectorsError.code}
        onRetry={reloadProjectors}
      />
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Buat Booking Proyektor"
        description="Pilih unit, tanggal (hari ini atau besok), serta waktu mulai dan estimasi pengembalian."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/komting/bookings">
              <Button variant="outline" size="sm">
                Daftar Booking
              </Button>
            </Link>
          </>
        }
      />

      {!isKomtingEligible && (
        <Alert tone="warning" title="Penugasan Komting Belum Aktif">
          Booking hanya tersedia untuk komting dengan akun dan penugasan aktif. Status Anda saat ini
          belum memenuhi syarat booking.
        </Alert>
      )}

      <div className="grid gap-6 lg:grid-cols-3 items-start">
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Formulir Booking</CardTitle>
            <CardDescription>
              Waktu dipilih fleksibel per menit dalam zona waktu Asia/Jakarta. Backend akan
              memvalidasi ulang konflik jadwal dan jam operasional saat submit.
            </CardDescription>
          </CardHeader>

          <form onSubmit={handleSubmit} noValidate>
            <CardContent className="space-y-4">
              {submitError && (
                <Alert tone="danger" title="Booking Ditolak">
                  {submitError}
                </Alert>
              )}

              {fieldErrors.operatingHours && (
                <Alert tone="warning" title="Jam Operasional Belum Tersedia">
                  {fieldErrors.operatingHours}
                </Alert>
              )}

              <Select
                id="booking-projector"
                label="Unit Proyektor"
                required
                value={activeProjectorId}
                options={projectors.map((unit) => ({
                  value: unit.id,
                  label: `${unit.asset_code} — ${unit.name} (${unit.physical_status})`,
                }))}
                onChange={(e) => {
                  setSelectedProjectorId(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, projectorId: undefined }));
                }}
                error={fieldErrors.projectorId}
                disabled={isSubmitting || projectors.length === 0}
              />

              <Select
                id="booking-date"
                label="Tanggal Booking (Asia/Jakarta)"
                required
                value={bookingDate}
                options={[
                  { value: todayDate, label: `Hari Ini — ${formatCalendarDate(todayDate)}` },
                  { value: tomorrowDate, label: `Besok — ${formatCalendarDate(tomorrowDate)}` },
                ]}
                onChange={(e) => {
                  setBookingDate(e.target.value);
                  setFieldErrors((prev) => ({ ...prev, bookingDate: undefined }));
                }}
                hint="Booking hanya dapat dibuat untuk hari ini atau besok."
                error={fieldErrors.bookingDate}
                disabled={isSubmitting}
              />

              <div className="grid gap-4 sm:grid-cols-2">
                <Input
                  id="booking-start-time"
                  type="time"
                  step={60}
                  label="Waktu Mulai (WIB)"
                  required
                  value={startTime}
                  onChange={(e) => {
                    setStartTime(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, startTime: undefined }));
                  }}
                  hint="Bebas per menit dalam jam operasional."
                  error={fieldErrors.startTime}
                  disabled={isSubmitting}
                />

                <Input
                  id="booking-return-time"
                  type="time"
                  step={60}
                  label="Estimasi Kembali (WIB)"
                  required
                  value={estimatedReturnTime}
                  onChange={(e) => {
                    setEstimatedReturnTime(e.target.value);
                    setFieldErrors((prev) => ({ ...prev, estimatedReturnTime: undefined }));
                  }}
                  hint="Harus pada tanggal yang sama & sebelum jam tutup."
                  error={fieldErrors.estimatedReturnTime}
                  disabled={isSubmitting}
                />
              </div>
            </CardContent>

            <CardFooter className="justify-between">
              <p className="text-xs text-[var(--color-muted)]">
                Booking valid langsung terkonfirmasi otomatis tanpa persetujuan ADMIN.
              </p>
              <Button
                type="submit"
                variant="primary"
                isLoading={isSubmitting}
                loadingText="Mengirim Booking..."
                disabled={!isKomtingEligible || hoursLoading || !effectiveOperatingHours}
              >
                Kirim Booking
              </Button>
            </CardFooter>
          </form>
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Ketersediaan &amp; Jam Operasional</CardTitle>
              <CardDescription>
                Informasi awal dari server untuk tanggal yang dipilih.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3 text-sm">
              {(hoursLoading || availabilityLoading) && (
                <p className="text-[var(--color-muted)]">Memeriksa ketersediaan dari server...</p>
              )}

              {(hoursError || availabilityError) && (
                <Alert
                  tone="danger"
                  title="Gagal Memuat Ketersediaan"
                  action={
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        reloadHours();
                        reloadAvailability();
                      }}
                    >
                      Coba Lagi
                    </Button>
                  }
                >
                  {availabilityError?.message ?? hoursError?.message}
                </Alert>
              )}

              {effectiveOperatingHours && (
                <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1.5">
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">Jam Layanan</span>
                    <span className="font-mono font-bold">
                      {formatLocalTime(effectiveOperatingHours.opens_at)} –{" "}
                      {formatLocalTime(effectiveOperatingHours.closes_at)}
                    </span>
                  </div>
                  <div className="flex justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">
                      Pickup Paling Awal
                    </span>
                    <span className="font-mono font-bold">
                      {formatLocalTime(effectiveOperatingHours.early_pickup_allowed_at)}
                    </span>
                  </div>
                </div>
              )}

              {availability && (
                <div className="space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">
                      Status Fisik Unit
                    </span>
                    <StatusBadge status={availability.physical_status} />
                  </div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[var(--color-muted)]">
                      Dapat Dibooking ({formatCalendarDate(availability.date)})
                    </span>
                    <Badge tone={availability.is_bookable ? "success" : "danger"}>
                      {availability.is_bookable ? "Ya (Tentatif)" : "Tidak"}
                    </Badge>
                  </div>
                  {availability.message && (
                    <Alert tone={availability.is_bookable ? "info" : "warning"}>
                      {availability.message}
                    </Alert>
                  )}
                </div>
              )}
            </CardContent>
          </Card>

          <Card tone="subtle">
            <CardHeader>
              <CardTitle>Ringkasan Pilihan Anda</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">Proyektor</span>
                <span className="font-bold text-right">
                  {selectedProjector
                    ? `${selectedProjector.asset_code} • ${selectedProjector.name}`
                    : "-"}
                </span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">Tanggal</span>
                <span className="font-bold text-right">{formatCalendarDate(bookingDate)}</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">Mulai</span>
                <span className="font-mono font-bold">{startTime || "-"} WIB</span>
              </div>
              <div className="flex justify-between gap-2">
                <span className="text-[var(--color-muted)] font-semibold">Estimasi Kembali</span>
                <span className="font-mono font-bold">{estimatedReturnTime || "-"} WIB</span>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
