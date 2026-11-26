"use client";

import Link from "next/link";
import { useMemo } from "react";
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
import type { Projector, StaffDashboardSummary } from "@/types/domain";

function formatOptionalCount(count: number | undefined, fallbackLength?: number): string {
  if (typeof count === "number") return String(count);
  if (typeof fallbackLength === "number") return String(fallbackLength);
  return "—";
}

export function StaffDashboardView() {
  const { user } = useAuth();
  const { data, loading, error, reload } = useAsyncQuery<StaffDashboardSummary | null>(async () => {
    const res = await services.admin.getStaffDashboard();
    return res.data ?? null;
  }, []);

  const { data: projectorsData } = useAsyncQuery<Projector[]>(async () => {
    try {
      const listFn = services.projector?.listProjectors;
      if (!listFn) return [];
      const res = await listFn({ page: 1, page_size: 100 });
      return res.data;
    } catch {
      return [];
    }
  }, []);

  const projectorMap = useMemo(() => {
    const map = new Map<string, Projector>();
    for (const unit of projectorsData ?? []) {
      map.set(unit.id, unit);
    }
    for (const unit of data?.maintenance_units ?? []) {
      if (!map.has(unit.id)) {
        map.set(unit.id, unit);
      }
    }
    return map;
  }, [projectorsData, data?.maintenance_units]);

  const pendingPickups = Array.isArray(data?.pending_pickups) ? data.pending_pickups : [];
  const activeLoans = Array.isArray(data?.active_loans) ? data.active_loans : [];
  const maintenanceUnits = Array.isArray(data?.maintenance_units)
    ? data.maintenance_units
    : undefined;
  const recentActivities = Array.isArray(data?.recent_activities) ? data.recent_activities : [];

  const maintenanceCountText = formatOptionalCount(
    data?.maintenance_units_count,
    maintenanceUnits?.length
  );

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Dashboard Operasional (${user?.role ?? "STAFF"})`}
        description="Ringkasan booking yang menunggu pickup, loan aktif, pengembalian, dan unit maintenance."
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
            <Link href="/staff/scan">
              <Button variant="primary" size="sm">
                Scan QR Pickup / Return
              </Button>
            </Link>
          </>
        }
      />

      {loading && (
        <LoadingState
          title="Memuat Dashboard Operasional..."
          description="Mengambil ringkasan transaksi dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Dashboard STAFF"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && !data && (
        <EmptyState
          title="Ringkasan Dashboard Belum Tersedia"
          description="Server belum mengembalikan data ringkasan operasional. Gunakan menu operasional untuk melihat daftar booking, loan, dan maintenance."
          action={
            <Button variant="outline" size="sm" onClick={reload}>
              Muat Ulang
            </Button>
          }
        />
      )}

      {!loading && !error && data && (
        <>
          <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
            <Card>
              <CardHeader className="pb-2">
                <CardDescription>Booking Hari Ini</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {formatOptionalCount(data.bookings_today_count)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card tone="primary">
              <CardHeader className="pb-2">
                <CardDescription>Menunggu Pickup</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {formatOptionalCount(
                    data.pending_pickup_count,
                    Array.isArray(data.pending_pickups) ? data.pending_pickups.length : undefined
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card tone="secondary">
              <CardHeader className="pb-2">
                <CardDescription>Loan Aktif</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {formatOptionalCount(
                    data.active_loans_count,
                    Array.isArray(data.active_loans) ? data.active_loans.length : undefined
                  )}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card tone="warning">
              <CardHeader className="pb-2">
                <CardDescription>Melewati Estimasi</CardDescription>
                <CardTitle className="text-2xl font-mono">
                  {formatOptionalCount(data.overdue_loans_count)}
                </CardTitle>
              </CardHeader>
            </Card>
            <Card tone="danger">
              <CardHeader className="pb-2">
                <CardDescription>Unit Maintenance</CardDescription>
                <CardTitle className="text-2xl font-mono">{maintenanceCountText}</CardTitle>
              </CardHeader>
            </Card>
          </section>

          {recentActivities.length > 0 && (
            <section className="space-y-2">
              {recentActivities.map((item, idx) => (
                <Alert key={item.id ?? idx} tone="info" title="Aktivitas Operasional">
                  <span>{item.message}</span>
                  {item.timestamp && (
                    <span className="block text-xs text-[var(--color-muted)] mt-0.5">
                      {formatJakartaDateTime(item.timestamp)}
                    </span>
                  )}
                </Alert>
              ))}
            </section>
          )}

          <section className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Booking Menunggu Pickup</CardTitle>
                <CardDescription>
                  Konfirmasi pickup memerlukan validasi QR dan pemeriksaan petugas.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {pendingPickups.length > 0 ? (
                  pendingPickups.map((booking) => {
                    const unit = projectorMap.get(booking.projector_id);
                    const projectorLabel = unit
                      ? `${unit.name} (${unit.asset_code})`
                      : booking.projector_id;

                    return (
                      <div
                        key={booking.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                      >
                        <div className="space-y-0.5 text-sm">
                          <p className="font-mono font-bold">{booking.booking_code}</p>
                          <p className="font-semibold">{projectorLabel}</p>
                          <p className="text-xs font-mono text-[var(--color-muted)]">
                            Komting ID: {booking.komting_id}
                          </p>
                          <p className="text-xs text-[var(--color-muted)]">
                            {formatCalendarDate(booking.booking_date)} •{" "}
                            {formatLocalTime(booking.start_time)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={booking.status} />
                          <Link href={`/staff/bookings/${encodeURIComponent(booking.id)}`}>
                            <Button variant="secondary" size="sm">
                              Proses
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    title="Tidak Ada Pickup Menunggu"
                    description="Belum ada booking berstatus CONFIRMED yang menunggu serah-terima."
                  />
                )}
              </CardContent>
              <CardFooter>
                <Link href="/staff/bookings">
                  <Button variant="outline" size="sm">
                    Semua Booking Operasional
                  </Button>
                </Link>
              </CardFooter>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Loan Aktif &amp; Pengembalian</CardTitle>
                <CardDescription>
                  Unit tetap berstatus BORROWED hingga pengembalian dan inspeksi dikonfirmasi.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2.5">
                {activeLoans.length > 0 ? (
                  activeLoans.map((loan) => {
                    const unit = projectorMap.get(loan.projector_id);
                    const projectorLabel = unit
                      ? `${unit.name} (${unit.asset_code})`
                      : loan.projector_id;

                    return (
                      <div
                        key={loan.id}
                        className="flex flex-wrap items-center justify-between gap-2 p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]"
                      >
                        <div className="space-y-0.5 text-sm">
                          <p className="font-mono font-bold">{loan.id}</p>
                          <p className="font-semibold">{projectorLabel}</p>
                          <p className="text-xs text-[var(--color-muted)]">
                            Pickup: {formatJakartaDateTime(loan.picked_up_at)}
                          </p>
                        </div>
                        <div className="flex items-center gap-2">
                          <StatusBadge status={loan.status} />
                          <Link href={`/staff/loans/${encodeURIComponent(loan.id)}/return`}>
                            <Button variant="primary" size="sm">
                              Inspeksi Return
                            </Button>
                          </Link>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <EmptyState
                    title="Tidak Ada Loan Aktif"
                    description="Saat ini tidak ada unit yang sedang dipinjam."
                  />
                )}
              </CardContent>
              <CardFooter className="justify-between">
                <Link href="/staff/loans">
                  <Button variant="outline" size="sm">
                    Daftar Loan
                  </Button>
                </Link>
                <Link href="/staff/maintenance">
                  <Button variant="outline" size="sm">
                    Maintenance ({maintenanceCountText})
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
