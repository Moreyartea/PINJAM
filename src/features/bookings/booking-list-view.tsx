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
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { formatCalendarDate, formatJakartaTimeOnly, formatLocalTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { Booking, BookingStatus, Projector } from "@/types/domain";

type BookingStatusFilter = "ALL" | BookingStatus;

const BOOKING_STATUS_OPTIONS = [
  { value: "ALL", label: "Semua Status Booking" },
  { value: "CONFIRMED", label: "CONFIRMED — Terkonfirmasi" },
  { value: "FULFILLED", label: "FULFILLED — Sudah Diambil" },
  { value: "CANCELLED", label: "CANCELLED — Dibatalkan" },
  { value: "EXPIRED", label: "EXPIRED — Kedaluwarsa" },
];

export function BookingListView() {
  const [statusFilter, setStatusFilter] = useState<BookingStatusFilter>("ALL");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<Booking>>(
    () =>
      services.booking.listKomtingBookings({
        page,
        page_size: 10,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const { data: projectorsRes } = useAsyncQuery<Projector[]>(async () => {
    const res = await services.projector.listProjectors({ page: 1, page_size: 100 });
    return res.data;
  }, []);

  const projectorLookup = useMemo(() => {
    const map = new Map<string, Projector>();
    for (const unit of projectorsRes ?? []) {
      map.set(unit.id, unit);
    }
    return map;
  }, [projectorsRes]);

  const bookings = data?.data ?? [];
  const pagination = data?.meta.pagination ?? null;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Daftar Booking Saya"
        description="Riwayat dan status reservasi proyektor milik akun komting Anda."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/komting/bookings/new">
              <Button variant="primary" size="sm">
                Buat Booking Baru
              </Button>
            </Link>
          </>
        }
      />

      <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
        <div className="w-full sm:w-80">
          <Select
            id="booking-status-filter"
            label="Filter Status Booking"
            value={statusFilter}
            options={BOOKING_STATUS_OPTIONS}
            onChange={(e) => {
              setStatusFilter(e.target.value as BookingStatusFilter);
              setPage(1);
            }}
          />
        </div>
        <Button variant="outline" size="sm" onClick={reload} disabled={loading}>
          Muat Ulang
        </Button>
      </div>

      {loading && (
        <LoadingState
          title="Memuat Daftar Booking..."
          description="Mengambil daftar booking komting dari server."
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
          title="Belum Ada Booking"
          description="Belum ada booking proyektor yang sesuai dengan filter saat ini."
          action={
            <Link href="/komting/bookings/new">
              <Button variant="primary" size="sm">
                Buat Booking Baru
              </Button>
            </Link>
          }
        />
      )}

      {!loading && !error && bookings.length > 0 && (
        <>
          <div className="grid gap-4 md:grid-cols-2">
            {bookings.map((item) => {
              const unit = projectorLookup.get(item.projector_id);
              return (
                <Card key={item.id} className="flex flex-col justify-between">
                  <CardHeader>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <Badge tone="neutral" className="font-mono">
                        {item.booking_code}
                      </Badge>
                      <StatusBadge status={item.status} />
                    </div>
                    <CardTitle className="mt-3">
                      {unit ? `${unit.name} (${unit.asset_code})` : item.projector_id}
                    </CardTitle>
                    <CardDescription>{formatCalendarDate(item.booking_date)}</CardDescription>
                  </CardHeader>

                  <CardContent className="space-y-2 text-sm">
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">Waktu Mulai</span>
                      <span className="font-mono font-bold">
                        {formatLocalTime(item.start_time)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Estimasi Kembali
                      </span>
                      <span className="font-mono font-bold">
                        {formatJakartaTimeOnly(item.estimated_return_at)}
                      </span>
                    </div>
                    <div className="flex justify-between gap-2">
                      <span className="font-semibold text-[var(--color-muted)]">
                        Jendela Pickup
                      </span>
                      <span className="font-mono text-xs sm:text-sm">
                        {formatJakartaTimeOnly(item.pickup_window.opens_at)} –{" "}
                        {formatJakartaTimeOnly(item.pickup_window.closes_at)}
                      </span>
                    </div>
                  </CardContent>

                  <CardFooter className="justify-end">
                    <Link href={`/komting/bookings/${encodeURIComponent(item.id)}`}>
                      <Button variant="secondary" size="sm">
                        Lihat Detail &amp; QR
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
