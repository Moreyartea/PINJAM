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
import type {
  AuditLogEntry,
  KomtingApplication,
  Projector,
  StaffDashboardSummary,
} from "@/types/domain";

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
  projectorsRes: ApiListResponse<Projector> | null;
  projectorsError: ApiClientError | null;
  auditLogsRes: ApiListResponse<AuditLogEntry> | null;
  auditLogsError: ApiClientError | null;
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

function computeProjectorInventoryMetrics(
  projectorsRes: ApiListResponse<Projector> | null,
  projectorsError: ApiClientError | null,
  dashboard: StaffDashboardSummary | null,
  dashboardError: ApiClientError | null
) {
  const maintenanceFallback = dashboardError
    ? "—"
    : formatOptionalCount(
        dashboard?.maintenance_units_count,
        Array.isArray(dashboard?.maintenance_units) ? dashboard.maintenance_units.length : undefined
      );

  if (projectorsError || !projectorsRes) {
    return {
      total: "—",
      available: "—",
      borrowed: "—",
      maintenance: maintenanceFallback,
      isCompleteList: false,
      hasMultiplePages: false,
    };
  }

  const totalItems = projectorsRes.meta.pagination?.total_items ?? projectorsRes.data.length;
  const totalPages = projectorsRes.meta.pagination?.total_pages ?? 1;
  const isCompleteList = totalPages <= 1 && projectorsRes.data.length >= totalItems;

  if (!isCompleteList) {
    return {
      total: String(totalItems),
      available: "—",
      borrowed: "—",
      maintenance: maintenanceFallback,
      isCompleteList: false,
      hasMultiplePages: true,
    };
  }

  let availableCount = 0;
  let borrowedCount = 0;
  let maintenanceCount = 0;

  for (const unit of projectorsRes.data) {
    if (unit.physical_status === "AVAILABLE") availableCount += 1;
    else if (unit.physical_status === "BORROWED") borrowedCount += 1;
    else if (unit.physical_status === "MAINTENANCE") maintenanceCount += 1;
  }

  return {
    total: String(totalItems),
    available: String(availableCount),
    borrowed: String(borrowedCount),
    maintenance: String(maintenanceCount),
    isCompleteList: true,
    hasMultiplePages: false,
  };
}

export function AdminDashboardView() {
  const { user } = useAuth();

  const { data, loading, error, reload } = useAsyncQuery<AdminDashboardQueryResult>(async () => {
    const [dashboardSettled, applicationsSettled, projectorsSettled, auditLogsSettled] =
      await Promise.allSettled([
        services.admin.getStaffDashboard(),
        services.application.listAdminApplications({ page: 1, page_size: 20 }),
        services.projector.listProjectors({ page: 1, page_size: 100 }),
        services.auditLog.listAuditLogs({ page: 1, page_size: 5 }),
      ]);

    const dashboardError =
      dashboardSettled.status === "rejected"
        ? normalizeUnknownError(dashboardSettled.reason)
        : null;
    const applicationsError =
      applicationsSettled.status === "rejected"
        ? normalizeUnknownError(applicationsSettled.reason)
        : null;
    const projectorsError =
      projectorsSettled.status === "rejected"
        ? normalizeUnknownError(projectorsSettled.reason)
        : null;
    const auditLogsError =
      auditLogsSettled.status === "rejected"
        ? normalizeUnknownError(auditLogsSettled.reason)
        : null;

    if (dashboardError && applicationsError && projectorsError && auditLogsError) {
      throw dashboardSettled.status === "rejected" ? dashboardSettled.reason : dashboardError;
    }

    return {
      dashboard:
        dashboardSettled.status === "fulfilled" ? (dashboardSettled.value.data ?? null) : null,
      dashboardError,
      applicationsRes:
        applicationsSettled.status === "fulfilled" ? applicationsSettled.value : null,
      applicationsError,
      projectorsRes: projectorsSettled.status === "fulfilled" ? projectorsSettled.value : null,
      projectorsError,
      auditLogsRes: auditLogsSettled.status === "fulfilled" ? auditLogsSettled.value : null,
      auditLogsError,
    };
  }, []);

  const dashboard = data?.dashboard ?? null;
  const dashboardError = data?.dashboardError ?? null;
  const applicationsRes = data?.applicationsRes ?? null;
  const applicationsError = data?.applicationsError ?? null;
  const projectorsRes = data?.projectorsRes ?? null;
  const projectorsError = data?.projectorsError ?? null;
  const auditLogsRes = data?.auditLogsRes ?? null;
  const auditLogsError = data?.auditLogsError ?? null;

  const activeLoans = Array.isArray(dashboard?.active_loans) ? dashboard.active_loans : [];
  const dashboardMaintenanceUnits = Array.isArray(dashboard?.maintenance_units)
    ? dashboard.maintenance_units
    : [];
  const pendingPickups = Array.isArray(dashboard?.pending_pickups) ? dashboard.pending_pickups : [];
  const recentActivities = Array.isArray(dashboard?.recent_activities)
    ? dashboard.recent_activities
    : [];
  const auditLogs = auditLogsRes?.data ?? [];

  const projectorMetrics = computeProjectorInventoryMetrics(
    projectorsRes,
    projectorsError,
    dashboard,
    dashboardError
  );

  const maintenanceUnits =
    dashboardMaintenanceUnits.length > 0
      ? dashboardMaintenanceUnits
      : projectorMetrics.isCompleteList
        ? (projectorsRes?.data ?? []).filter((unit) => unit.physical_status === "MAINTENANCE")
        : [];

  const pendingApps = formatPendingApplicationsCount(applicationsRes, applicationsError);
  const pendingAppItems = (applicationsRes?.data ?? []).filter((app) =>
    PENDING_APPLICATION_STATUSES.has(app.status)
  );

  const bookingsTodayDisplay = dashboardError
    ? "—"
    : formatOptionalCount(dashboard?.bookings_today_count);
  const pendingPickupDisplay = dashboardError
    ? "—"
    : formatOptionalCount(
        dashboard?.pending_pickup_count,
        Array.isArray(dashboard?.pending_pickups) ? dashboard.pending_pickups.length : undefined
      );
  const activeLoansDisplay = dashboardError
    ? "—"
    : formatOptionalCount(
        dashboard?.active_loans_count,
        Array.isArray(dashboard?.active_loans) ? dashboard.active_loans.length : undefined
      );
  const overdueLoansDisplay = dashboardError
    ? "—"
    : formatOptionalCount(dashboard?.overdue_loans_count);

  const hasDashboardPayload =
    dashboard !== null &&
    (typeof dashboard.bookings_today_count === "number" ||
      typeof dashboard.pending_pickup_count === "number" ||
      typeof dashboard.active_loans_count === "number" ||
      typeof dashboard.overdue_loans_count === "number" ||
      typeof dashboard.maintenance_units_count === "number" ||
      pendingPickups.length > 0 ||
      activeLoans.length > 0 ||
      dashboardMaintenanceUnits.length > 0 ||
      recentActivities.length > 0);

  const isAllEmpty =
    !dashboardError &&
    !applicationsError &&
    !projectorsError &&
    !auditLogsError &&
    !hasDashboardPayload &&
    (applicationsRes?.data.length ?? 0) === 0 &&
    (projectorsRes?.data.length ?? 0) === 0 &&
    auditLogs.length === 0;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dashboard Administrator (${user?.role ?? "ADMIN"})`}
        description="Pusat informasi operasional PINJAM: inventaris proyektor, booking & peminjaman, verifikasi komting, dan aktivitas audit."
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
          description="Mengambil ringkasan inventaris, operasional, pengajuan komting, dan aktivitas audit dari server."
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
          {(dashboardError || applicationsError || projectorsError || auditLogsError) && (
            <div className="space-y-3">
              {dashboardError && (
                <Alert tone="danger" title="Ringkasan Operasional Gagal Dimuat">
                  <p>{dashboardError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {dashboardError.code}</p>
                </Alert>
              )}
              {projectorsError && (
                <Alert tone="warning" title="Ringkasan Inventaris Proyektor Gagal Dimuat">
                  <p>{projectorsError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {projectorsError.code}</p>
                </Alert>
              )}
              {applicationsError && (
                <Alert tone="warning" title="Daftar Pengajuan Komting Gagal Dimuat">
                  <p>{applicationsError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {applicationsError.code}</p>
                </Alert>
              )}
              {auditLogsError && (
                <Alert tone="warning" title="Aktivitas Audit Log Terbaru Gagal Dimuat">
                  <p>{auditLogsError.message}</p>
                  <p className="text-xs font-mono mt-1">Kode: {auditLogsError.code}</p>
                </Alert>
              )}
            </div>
          )}

          <section className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Total Proyektor</CardDescription>
                  <CardTitle className="text-2xl font-mono">{projectorMetrics.total}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                  {projectorsError
                    ? "Gagal memuat inventaris"
                    : "Total unit terdaftar di inventaris"}
                </CardContent>
              </Card>

              <Card tone="secondary">
                <CardHeader className="pb-2">
                  <CardDescription>Proyektor Tersedia</CardDescription>
                  <CardTitle className="text-2xl font-mono">{projectorMetrics.available}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                  {projectorMetrics.hasMultiplePages
                    ? "Data multi-halaman (>100 unit)"
                    : "Status fisik AVAILABLE"}
                </CardContent>
              </Card>

              <Card tone="warning">
                <CardHeader className="pb-2">
                  <CardDescription>Proyektor Dipinjam</CardDescription>
                  <CardTitle className="text-2xl font-mono">{projectorMetrics.borrowed}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                  {projectorMetrics.hasMultiplePages
                    ? "Data multi-halaman (>100 unit)"
                    : "Status fisik BORROWED"}
                </CardContent>
              </Card>

              <Card tone="danger">
                <CardHeader className="pb-2">
                  <CardDescription>Proyektor Maintenance</CardDescription>
                  <CardTitle className="text-2xl font-mono">
                    {projectorMetrics.maintenance}
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                  Status fisik MAINTENANCE
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card tone="primary">
                <CardHeader className="pb-2">
                  <CardDescription>Aplikasi Komting Pending</CardDescription>
                  <CardTitle className="text-2xl font-mono">{pendingApps.value}</CardTitle>
                </CardHeader>
                <CardContent className="pt-0 text-xs text-[var(--color-muted)]">
                  {applicationsError
                    ? "Gagal memuat pengajuan"
                    : pendingApps.isPartialPage
                      ? "Halaman pertama daftar pengajuan"
                      : "Menunggu verifikasi ADMIN"}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Booking Hari Ini</CardDescription>
                  <CardTitle className="text-2xl font-mono">{bookingsTodayDisplay}</CardTitle>
                </CardHeader>
              </Card>

              <Card>
                <CardHeader className="pb-2">
                  <CardDescription>Booking Menunggu Pickup</CardDescription>
                  <CardTitle className="text-2xl font-mono">{pendingPickupDisplay}</CardTitle>
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
            </div>
          </section>

          {isAllEmpty && (
            <EmptyState
              title="Belum Ada Data Ringkasan ADMIN"
              description="Ringkasan operasional, inventaris proyektor, pengajuan komting, dan log aktivitas saat ini kosong."
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
                  Pengajuan baru maupun pergantian komting kelas yang memerlukan verifikasi ADMIN.
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
                          Diajukan: {formatJakartaDateTime(app.submitted_at)} WIB
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusBadge status={app.status} />
                        <Link
                          href={`/admin/applications/${encodeURIComponent(app.application_id)}`}
                        >
                          <Button variant="outline" size="sm">
                            Periksa
                          </Button>
                        </Link>
                      </div>
                    </div>
                  ))
                ) : (
                  <EmptyState
                    title="Tidak Ada Pengajuan Pending"
                    description="Belum ada pengajuan komting yang menunggu verifikasi saat ini."
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between gap-2">
                <Link href="/admin/applications">
                  <Button variant="primary" size="sm">
                    Buka Daftar Pengajuan
                  </Button>
                </Link>
                <Link href="/admin/assignments">
                  <Button variant="outline" size="sm">
                    Assignment Komting
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Status Unit Proyektor &amp; Maintenance</CardTitle>
                <CardDescription>
                  Unit yang berstatus maintenance atau dilaporkan pada ringkasan operasional.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {dashboardError && projectorsError ? (
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
                      projectorMetrics.maintenance === "0"
                        ? "Tidak ada unit proyektor berstatus maintenance saat ini."
                        : "Daftar unit tidak disertakan pada ringkasan dashboard. Buka halaman Maintenance untuk pengelolaan."
                    }
                  />
                )}
              </CardContent>
              <CardFooter className="flex-wrap justify-between gap-2">
                <Link href="/admin/maintenance">
                  <Button variant="primary" size="sm">
                    Kelola Maintenance
                  </Button>
                </Link>
                <Link href="/admin/projectors">
                  <Button variant="outline" size="sm">
                    Inventaris Proyektor
                  </Button>
                </Link>
                <Link href="/admin/operating-hours">
                  <Button variant="outline" size="sm">
                    Jam Operasional
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
                            Pickup: {formatJakartaDateTime(loan.picked_up_at)} WIB
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
              <CardFooter className="justify-between gap-2">
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
                <CardTitle>Aktivitas Terbaru &amp; Audit Log</CardTitle>
                <CardDescription>
                  Catatan aktivitas audit terbaru dari server (§13.1) dan ringkasan operasional
                  terbaru.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {auditLogsError && dashboardError ? (
                  <Alert tone="danger" title="Aktivitas Tidak Tersedia">
                    {auditLogsError.message}
                  </Alert>
                ) : auditLogs.length > 0 || recentActivities.length > 0 ? (
                  <>
                    {auditLogs.map((entry) => (
                      <div
                        key={entry.id}
                        className="flex flex-wrap items-start justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                      >
                        <div className="space-y-1 text-sm">
                          <div className="flex flex-wrap items-center gap-2">
                            <Badge tone="accent">{entry.actor_role}</Badge>
                            <span className="font-mono font-bold text-xs">{entry.action}</span>
                          </div>
                          <p className="text-xs font-mono text-[var(--color-muted)]">
                            Aktor: {entry.actor_user_id} • {entry.entity_type} ({entry.entity_id})
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">
                            {formatJakartaDateTime(entry.created_at)} WIB
                          </p>
                        </div>
                        <Link href={`/admin/audit-logs/${encodeURIComponent(entry.id)}`}>
                          <Button variant="outline" size="sm">
                            Detail Log
                          </Button>
                        </Link>
                      </div>
                    ))}
                    {recentActivities.map((item, idx) => (
                      <Alert key={item.id ?? idx} tone="info" title="Aktivitas Operasional">
                        <span>{item.message}</span>
                        {item.timestamp && (
                          <span className="block text-xs text-[var(--color-muted)] mt-0.5">
                            {formatJakartaDateTime(item.timestamp)} WIB
                          </span>
                        )}
                      </Alert>
                    ))}
                  </>
                ) : (
                  <EmptyState
                    title="Belum Ada Aktivitas Terbaru"
                    description="Belum ada entri audit log maupun aktivitas operasional terbaru yang dikembalikan server."
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between gap-2">
                <Link href="/admin/audit-logs">
                  <Button variant="primary" size="sm">
                    Lihat Semua Audit Log
                  </Button>
                </Link>
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
