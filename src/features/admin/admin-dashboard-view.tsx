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
import { ApiClientError, normalizeUnknownError } from "@/lib/api/errors";
import type { ApiListResponse } from "@/lib/api/types";
import { useAuth } from "@/lib/auth/auth-context";
import { formatCalendarDate, formatJakartaDateTime, formatLocalTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { KomtingApplication, StaffDashboardSummary } from "@/types/domain";

const PENDING_APPLICATION_STATUSES = new Set([
  "PENDING_VERIFICATION",
  "PENDING_REVIEW",
  "PENDING_REPLACEMENT_NOTICE",
]);

interface AdminDashboardQueryResult {
  dashboard: StaffDashboardSummary | null;
  dashboardError: ApiClientError | null;
  applicationsRes: ApiListResponse<KomtingApplication> | null;
  applicationsError: ApiClientError | null;
}

function formatOptionalCount(count: number | undefined, fallbackLength?: number): string {
  if (typeof count === "number") return String(count);
  if (typeof fallbackLength === "number") return String(fallbackLength);
  return "—";
}

function formatPendingApplicationsCount(
  applicationsRes: ApiListResponse<KomtingApplication> | null,
  applicationsError: ApiClientError | null
): { value: string; isPartialPage: boolean } {
  if (applicationsError || !applicationsRes) {
    return { value: "—", isPartialPage: false };
  }

  const pendingOnPage = applicationsRes.data.filter((app) =>
    PENDING_APPLICATION_STATUSES.has(app.status)
  ).length;
  const totalPages = applicationsRes.meta.pagination?.total_pages ?? 1;
  const totalItems = applicationsRes.meta.pagination?.total_items ?? applicationsRes.data.length;

  if (totalPages > 1 && totalItems > applicationsRes.data.length) {
    return { value: `${pendingOnPage}+`, isPartialPage: true };
  }

  return { value: String(pendingOnPage), isPartialPage: false };
}

export function AdminDashboardView() {
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsyncQuery<AdminDashboardQueryResult>(async () => {
    const [dashboardSettled, applicationsSettled] = await Promise.allSettled([
      services.admin.getStaffDashboard(),
      services.application.listAdminApplications({ page: 1, page_size: 20 }),
    ]);

    const dashboardError =
      dashboardSettled.status === "rejected"
        ? normalizeUnknownError(dashboardSettled.reason)
        : null;
    const applicationsError =
      applicationsSettled.status === "rejected"
        ? normalizeUnknownError(applicationsSettled.reason)
        : null;

    if (dashboardError && applicationsError) {
      throw dashboardSettled.status === "rejected" ? dashboardSettled.reason : dashboardError;
    }

    return {
      dashboard:
        dashboardSettled.status === "fulfilled" ? (dashboardSettled.value.data ?? null) : null,
      dashboardError,
      applicationsRes:
        applicationsSettled.status === "fulfilled" ? applicationsSettled.value : null,
      applicationsError,
    };
  }, []);

  const dashboard = data?.dashboard ?? null;
  const dashboardError = data?.dashboardError ?? null;
  const applicationsRes = data?.applicationsRes ?? null;
  const applicationsError = data?.applicationsError ?? null;

  const activeLoans = Array.isArray(dashboard?.active_loans) ? dashboard.active_loans : [];
  const maintenanceUnits = Array.isArray(dashboard?.maintenance_units)
    ? dashboard.maintenance_units
    : [];
  const pendingPickups = Array.isArray(dashboard?.pending_pickups) ? dashboard.pending_pickups : [];
  const recentActivities = Array.isArray(dashboard?.recent_activities)
    ? dashboard.recent_activities
    : [];

  const pendingApps = formatPendingApplicationsCount(applicationsRes, applicationsError);
  const pendingAppItems = (applicationsRes?.data ?? []).filter((app) =>
    PENDING_APPLICATION_STATUSES.has(app.status)
  );

  const bookingsTodayDisplay = dashboardError
    ? "—"
    : formatOptionalCount(dashboard?.bookings_today_count);
  const activeLoansDisplay = dashboardError
    ? "—"
    : formatOptionalCount(
        dashboard?.active_loans_count,
        Array.isArray(dashboard?.active_loans) ? dashboard.active_loans.length : undefined
      );
  const overdueLoansDisplay = dashboardError
    ? "—"
    : formatOptionalCount(dashboard?.overdue_loans_count);
  const maintenanceUnitsDisplay = dashboardError
    ? "—"
    : formatOptionalCount(
        dashboard?.maintenance_units_count,
        Array.isArray(dashboard?.maintenance_units) ? dashboard.maintenance_units.length : undefined
      );

  const hasDashboardPayload =
    dashboard !== null &&
    (typeof dashboard.bookings_today_count === "number" ||
      typeof dashboard.pending_pickup_count === "number" ||
      typeof dashboard.active_loans_count === "number" ||
      typeof dashboard.overdue_loans_count === "number" ||
      typeof dashboard.maintenance_units_count === "number" ||
      pendingPickups.length > 0 ||
      activeLoans.length > 0 ||
      maintenanceUnits.length > 0 ||
      recentActivities.length > 0);

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dashboard Administrator (${user?.role ?? "ADMIN"})`}
        description="Ringkasan pengajuan komting, operasional peminjaman, kondisi unit proyektor, dan akses fungsi STAFF."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
              Muat Ulang
            </Button>
            <Link href="/staff">
              <Button variant="primary" size="sm">
                Buka Operasional STAFF
              </Button>
            </Link>
          </>
        }
      />

      {loading && (
        <LoadingState
          title="Memuat Dashboard ADMIN..."
          description="Mengambil ringkasan operasional dan daftar pengajuan komting dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Dashboard ADMIN"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && data && (
        <>
          {(dashboardError || applicationsError) && (
            <div className="space-y-3">
              {dashboardError && (
                <Alert tone="danger" title="Ringkasan Operasional Gagal Dimuat">
                  <p>{dashboardError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {dashboardError.code}</p>
                </Alert>
              )}
              {applicationsError && (
                <Alert tone="warning" title="Daftar Pengajuan Komting Gagal Dimuat">
                  <p>{applicationsError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {applicationsError.code}</p>
                </Alert>
              )}
            </div>
          )}

          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card tone="primary">
              <CardHeader className="pb-2">
                <CardDescription>Pengajuan Menunggu Verifikasi</CardDescription>
                <CardTitle className="text-2xl font-mono">{pendingApps.value}</CardTitle>
              </CardHeader>
              <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                {applicationsError
                  ? "Gagal memuat daftar pengajuan"
                  : pendingApps.isPartialPage
                    ? "Dihitung dari halaman pertama daftar pengajuan"
                    : "Dari daftar pengajuan komting"}
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Booking Hari Ini</CardDescription>
                <CardTitle className="text-2xl font-mono">{bookingsTodayDisplay}</CardTitle>
              </CardHeader>
            </Card>

            <Card tone="secondary">
              <CardHeader className="pb-2">
                <CardDescription>Loan Aktif</CardDescription>
                <CardTitle className="text-2xl font-mono">{activeLoansDisplay}</CardTitle>
              </CardHeader>
            </Card>

            <Card tone="warning">
              <CardHeader className="pb-2">
                <CardDescription>Loan Overdue</CardDescription>
                <CardTitle className="text-2xl font-mono">{overdueLoansDisplay}</CardTitle>
              </CardHeader>
            </Card>

            <Card tone="danger">
              <CardHeader className="pb-2">
                <CardDescription>Unit Maintenance</CardDescription>
                <CardTitle className="text-2xl font-mono">{maintenanceUnitsDisplay}</CardTitle>
              </CardHeader>
            </Card>
          </section>

          {!dashboardError && !hasDashboardPayload && applicationsRes?.data.length === 0 && (
            <EmptyState
              title="Belum Ada Data Ringkasan ADMIN"
              description="Ringkasan operasional dan daftar pengajuan komting saat ini kosong atau belum tersedia."
              action={
                <Button variant="outline" size="sm" onClick={reload}>
                  Muat Ulang
                </Button>
              }
            />
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Pengajuan Komting Menunggu Verifikasi</CardTitle>
                <CardDescription>
                  Ringkasan pengajuan berstatus pending dari daftar pengajuan komting. Modul
                  verifikasi lengkap disiapkan pada tahap FE-4 berikutnya.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {applicationsError ? (
                  <Alert tone="danger" title="Data Pengajuan Tidak Tersedia">
                    {applicationsError.message}
                  </Alert>
                ) : pendingAppItems.length > 0 ? (
                  pendingAppItems.map((app) => (
                    <div
                      key={app.application_id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                    >
                      <div className="space-y-0.5 text-sm">
                        <p className="font-bold">
                          {app.full_name ?? app.application_id}
                          {app.class_name ? ` • ${app.class_name}` : ""}
                        </p>
                        <p className="text-xs font-mono text-[var(--color-muted)]">
                          ID: {app.application_id}
                        </p>
                        <p className="text-xs text-[var(--color-muted)]">
                          Diajukan: {formatJakartaDateTime(app.submitted_at)}
                        </p>
                      </div>
                      <StatusBadge status={app.status} />
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="Tidak Ada Pengajuan Pending"
                    description="Belum ada pengajuan komting yang menunggu verifikasi saat ini."
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between">
                <span className="text-xs text-[var(--color-muted)]">
                  Modul verifikasi pengajuan: segera tersedia
                </span>
                <Badge tone="neutral">FE-4 Berikutnya</Badge>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Unit Proyektor &amp; Maintenance</CardTitle>
                <CardDescription>
                  Unit yang dilaporkan pada ringkasan dashboard operasional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {dashboardError ? (
                  <Alert tone="danger" title="Data Unit Tidak Tersedia">
                    {dashboardError.message}
                  </Alert>
                ) : maintenanceUnits.length > 0 ? (
                  maintenanceUnits.map((unit) => (
                    <div
                      key={unit.id}
                      className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                    >
                      <div className="space-y-0.5 text-sm">
                        <p className="font-bold">{unit.name}</p>
                        <p className="text-xs font-mono text-[var(--color-muted)]">
                          {unit.asset_code}
                        </p>
                      </div>
                      <StatusBadge status={unit.physical_status} />
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="Tidak Ada Daftar Unit Maintenance"
                    description={
                      typeof dashboard?.maintenance_units_count === "number" &&
                      dashboard.maintenance_units_count === 0
                        ? "Tidak ada unit proyektor berstatus maintenance saat ini."
                        : "Daftar unit tidak disertakan pada ringkasan dashboard. Gunakan halaman Maintenance STAFF untuk daftar lengkap."
                    }
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between">
                <Link href="/staff/maintenance">
                  <Button variant="outline" size="sm">
                    Kelola Maintenance STAFF
                  </Button>
                </Link>
                <Link href="/staff/scan">
                  <Button variant="secondary" size="sm">
                    Scan QR STAFF
                  </Button>
                </Link>
              </CardFooter>
            </Card>
          </section>

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Loan Aktif &amp; Booking Menunggu Pickup</CardTitle>
                <CardDescription>
                  Transaksi operasional yang dikembalikan ringkasan dashboard.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {dashboardError ? (
                  <Alert tone="danger" title="Data Transaksi Tidak Tersedia">
                    {dashboardError.message}
                  </Alert>
                ) : activeLoans.length > 0 || pendingPickups.length > 0 ? (
                  <>
                    {activeLoans.map((loan) => (
                      <div
                        key={loan.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                      >
                        <div className="space-y-0.5 text-sm">
                          <p className="font-mono font-bold">{loan.id}</p>
                          <p className="text-xs font-mono text-[var(--color-muted)]">
                            Unit: {loan.projector_id} • Komting: {loan.komting_id}
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">
                            Pickup: {formatJakartaDateTime(loan.picked_up_at)}
                          </p>
                        </div>
                        <StatusBadge status={loan.status} />
                      </div>
                    ))}
                    {pendingPickups.map((booking) => (
                      <div
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                      >
                        <div className="space-y-0.5 text-sm">
                          <p className="font-mono font-bold">{booking.booking_code}</p>
                          <p className="text-xs font-mono text-[var(--color-muted)]">
                            Unit: {booking.projector_id} • Komting: {booking.komting_id}
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">
                            {formatCalendarDate(booking.booking_date)} •{" "}
                            {formatLocalTime(booking.start_time)}
                          </p>
                        </div>
                        <StatusBadge status={booking.status} />
                      </div>
                    ))}
                  </>
                ) : (
                  <EmptyState
                    title="Belum Ada Daftar Transaksi"
                    description="Tidak ada transaksi aktif atau pickup menunggu yang dikembalikan ringkasan."
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between">
                <Link href="/staff/bookings">
                  <Button variant="outline" size="sm">
                    Booking Operasional
                  </Button>
                </Link>
                <Link href="/staff/loans">
                  <Button variant="outline" size="sm">
                    Daftar Loan
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Aktivitas Operasional Terbaru</CardTitle>
                <CardDescription>
                  Catatan aktivitas yang tersedia dari ringkasan backend.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {dashboardError ? (
                  <Alert tone="danger" title="Aktivitas Tidak Tersedia">
                    {dashboardError.message}
                  </Alert>
                ) : recentActivities.length > 0 ? (
                  recentActivities.map((item, idx) => (
                    <Alert key={item.id ?? idx} tone="info" title="Aktivitas">
                      <span>{item.message}</span>
                      {item.timestamp && (
                        <span className="block text-xs text-[var(--color-muted)] mt-0.5">
                          {formatJakartaDateTime(item.timestamp)}
                        </span>
                      )}
                    </Alert>
                  ))
                ) : (
                  <EmptyState
                    title="Belum Ada Aktivitas Terbaru"
                    description="Ringkasan dashboard tidak menyertakan aktivitas terbaru saat ini."
                  />
                )}
              </CardContent>
              <CardFooter>
                <Link href="/staff">
                  <Button variant="secondary" size="sm">
                    Masuk ke Dashboard STAFF
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
