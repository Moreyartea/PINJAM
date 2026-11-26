"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
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
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { formatCalendarDate, formatJakartaTimeOnly, formatLocalTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { Booking, BookingStatus, Projector } from "@/types/domain";

type StaffBookingStatusFilter = "ALL" | BookingStatus;

const STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Booking" },
  { value: "CONFIRMED", label: "CONFIRMED — Menunggu Pickup" },
  { value: "FULFILLED", label: "FULFILLED — Sudah Diambil" },
  { value: "CANCELLED", label: "CANCELLED — Dibatalkan" },
  { value: "EXPIRED", label: "EXPIRED — Kedaluwarsa" },
];

export function StaffBookingListView() {
  const [statusFilter, setStatusFilter] = useState<StaffBookingStatusFilter>("ALL");
  const [dateFilter, setDateFilter] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Booking>>(
    () =>
      services.booking.listStaffBookings({
        page,
        page_size: 10,
        status: statusFilter === "ALL" ? undefined : statusFilter,
        date: dateFilter || undefined,
      }),
    [page, statusFilter, dateFilter]
  );

  const { data: projectorsData } = useAsyncQuery<Projector[]>(async () => {
    try {
      const res = await services.projector.listProjectors({ page: 1, page_size: 100 });
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
    return map;
  }, [projectorsData]);

  const bookings = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Booking Operasional"
        description="Daftar reservasi proyektor untuk verifikasi pengambilan oleh STAFF/ADMIN."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/scan">
              <Button variant="primary" size="sm">
                Scan QR
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="grid gap-3 sm:grid-cols-2 w-full sm:w-auto">
          <div className="w-full sm:w-64">
            <Select
              id="staff-booking-status"
              label="Filter Status"
              value={statusFilter}
              options={STATUS_OPTIONS}
              onChange={(e) => {
                setStatusFilter(e.target.value as StaffBookingStatusFilter);
                setPage(1);
              }}
            />
          </div>
          <div className="w-full sm:w-56">
            <Input
              id="staff-booking-date"
              type="date"
              label="Filter Tanggal"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setPage(1);
              }}
            />
          </div>
        </div>

        <div className="flex gap-2">
          {(statusFilter !== "ALL" || dateFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setStatusFilter("ALL");
                setDateFilter("");
                setPage(1);
              }}
            >
              Reset Filter
            </Button>
          )}
          <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
            Muat Ulang
          </Button>
        </div>
      </div>

      {loading && (
        <LoadingState
          title="Memuat Daftar Booking Operasional..."
          description="Mengambil data booking dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Daftar Booking"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && bookings.length === 0 && (
        <EmptyState
          title="Tidak Ada Booking Operasional"
          description="Belum ada booking yang sesuai dengan filter tanggal dan status saat ini."
        />
      )}

      {!loading && !error && bookings.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {bookings.map((booking) => {
              const unit = projectorMap.get(booking.projector_id);
              const projectorLabel = unit
                ? `${unit.name} (${unit.asset_code})`
                : booking.projector_id;

              return (
                <Card key={booking.id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {booking.booking_code}
                      </Badge>
                      <StatusBadge status={booking.status} />
                    </div>
                    <CardTitle className="mt-3">{projectorLabel}</CardTitle>
                    <CardDescription className="font-mono text-xs">
                      Komting ID: {booking.komting_id}
                    </CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Tanggal</span>
                      <span className="font-bold">{formatCalendarDate(booking.booking_date)}</span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Jadwal</span>
                      <span className="font-mono font-bold">
                        {formatLocalTime(booking.start_time)} –{" "}
                        {formatJakartaTimeOnly(booking.estimated_return_at)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Pickup Window</span>
                      <span className="font-mono text-xs sm:text-sm">
                        {formatJakartaTimeOnly(booking.pickup_window.opens_at)} –{" "}
                        {formatJakartaTimeOnly(booking.pickup_window.closes_at)}
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="justify-end">
                    <Link href={`/staff/bookings/${encodeURIComponent(booking.id)}`}>
                      <Button variant="secondary" size="sm">
                        Detail &amp; Proses
                      </Button>
                    </Link>
                  </CardFooter>
                </Card>
              );
            })}
          </div>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex items-center justify-between gap-3 pt-2">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} booking)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.total_pages}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Berikutnya
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
