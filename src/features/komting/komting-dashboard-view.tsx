"use client";

import Link from "next/link";
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
import { useAsyncQuery } from "@/hooks/use-async-query";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCalendarDate, formatJakartaDateTime, formatLocalTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { KomtingDashboardSummary } from "@/types/domain";

export function KomtingDashboardView() {
  const { user } = useAuth();

  const {
    data: dashboard,
    loading,
    error,
    reload,
  } = useAsyncQuery<KomtingDashboardSummary>(async () => {
    const response = await services.admin.getKomtingDashboard();
    return response.data;
  }, []);

  const assignment = dashboard?.active_assignment ?? user?.komting_assignment ?? null;
  const isAccountActive = user?.account_status === "ACTIVE";
  const isAssignmentActive = assignment?.status === "ACTIVE";
  const canBorrow = isAccountActive && isAssignmentActive;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Halo, ${user?.full_name ?? "Komting"}`}
        description="Ringkasan identitas kelas, status penugasan, dan peminjaman proyektor Anda."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/komting/projectors">
              <Button variant="primary" size="sm">
                Lihat Daftar Proyektor
              </Button>
            </Link>
          </>
        }
      />

      {!canBorrow && (
        <Alert tone="warning" title="Akun atau Penugasan Komting Belum Aktif">
          {user?.account_status === "PENDING_VERIFICATION"
            ? "Pengajuan komting Anda masih menunggu verifikasi. Fitur booking belum tersedia."
            : "Penugasan komting Anda berstatus nonaktif/diganti. Anda tidak dapat membuat booking baru."}
        </Alert>
      )}

      {loading && (
        <LoadingState
          title="Memuat Dashboard Komting..."
          description="Mengambil ringkasan penugasan, booking, dan loan dari server."
          rows={3}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Dashboard"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && dashboard && (
        <>
          {dashboard.reminders?.map((reminder, idx) => (
            <Alert
              key={reminder.id ?? idx}
              tone={reminder.level === "warning" ? "warning" : "info"}
            >
              {reminder.message}
            </Alert>
          ))}

          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Identitas &amp; Penugasan Kelas</CardTitle>
                <CardDescription>
                  Status penugasan menentukan hak akses booking komting.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5 text-sm">
                <div className="flex justify-between gap-2 items-center">
                  <span className="font-semibold text-[var(--color-muted)]">Nama</span>
                  <span className="font-bold">{user?.full_name ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="font-semibold text-[var(--color-muted)]">Email</span>
                  <span className="font-mono text-xs sm:text-sm">{user?.email ?? "-"}</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="font-semibold text-[var(--color-muted)]">Status Akun</span>
                  <StatusBadge status={user?.account_status} />
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="font-semibold text-[var(--color-muted)]">Kelas Aktif</span>
                  <span className="font-bold">{assignment?.class_name ?? "Belum ada"}</span>
                </div>
                <div className="flex justify-between gap-2 items-center">
                  <span className="font-semibold text-[var(--color-muted)]">Status Penugasan</span>
                  <StatusBadge status={assignment?.status ?? "INACTIVE"} />
                </div>
              </CardContent>
              <CardFooter>
                <Link href="/application/status">
                  <Button variant="outline" size="sm">
                    Lihat Status Pengajuan
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Peminjaman (Loan Aktif)</CardTitle>
                <CardDescription>
                  Satu komting hanya boleh memiliki satu loan aktif dalam satu waktu.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dashboard.active_loan ? (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[var(--color-muted)]">Status Loan</span>
                      <StatusBadge status={dashboard.active_loan.status} />
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[var(--color-muted)]">ID Loan</span>
                      <span className="font-mono font-bold">{dashboard.active_loan.id}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Waktu Pengambilan
                      </span>
                      <span>{formatJakartaDateTime(dashboard.active_loan.picked_up_at)}</span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Belum Ada Peminjaman Aktif"
                    description="Saat ini Anda tidak sedang meminjam unit proyektor."
                  />
                )}
              </CardContent>
            </Card>
          </section>

          <section className="grid gap-4 md:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booking Aktif</CardTitle>
                <CardDescription>
                  Reservasi unit proyektor yang menunggu pengambilan oleh komting atau wakil.
                </CardDescription>
              </CardHeader>
              <CardContent>
                {dashboard.active_booking ? (
                  <div className="space-y-2.5 text-sm">
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[var(--color-muted)]">Kode Booking</span>
                      <span className="font-mono font-bold">
                        {dashboard.active_booking.booking_code}
                      </span>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="font-semibold text-[var(--color-muted)]">Status</span>
                      <StatusBadge status={dashboard.active_booking.status} />
                    </div>
                    <div className="flex justify-between">
                      <span className="font-semibold text-[var(--color-muted)]">Jadwal</span>
                      <span>
                        {formatCalendarDate(dashboard.active_booking.booking_date)} •{" "}
                        {formatLocalTime(dashboard.active_booking.start_time)}
                      </span>
                    </div>
                  </div>
                ) : (
                  <EmptyState
                    title="Belum Ada Booking Aktif"
                    description="Daftar dan pembuatan booking proyektor akan tersedia pada tahap FE-2."
                  />
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Ringkasan Proyektor Terkait</CardTitle>
                <CardDescription>
                  Status fisik unit (AVAILABLE / BORROWED / MAINTENANCE) terpisah dari jadwal
                  booking.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {dashboard.relevant_projectors && dashboard.relevant_projectors.length > 0 ? (
                  dashboard.relevant_projectors.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-2.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                    >
                      <div>
                        <p className="font-bold text-sm">{unit.name}</p>
                        <p className="font-mono text-xs text-[var(--color-muted)]">
                          {unit.asset_code}
                        </p>
                      </div>
                      <StatusBadge status={unit.physical_status} />
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="Belum Ada Data Proyektor"
                    description="Buka halaman daftar proyektor untuk memeriksa inventaris unit."
                  />
                )}
              </CardContent>
              <CardFooter>
                <Link href="/komting/projectors">
                  <Button variant="secondary" size="sm">
                    Buka Daftar Proyektor
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </section>
        </>
      )}
    </div>
  );
}
