"use client";

import Link from "next/link";
import { useMemo, useRef, useState } from "react";
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
import { ConfirmDialog } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import type { ApiListResponse } from "@/lib/api/types";
import { formatJakartaDateTime } from "@/lib/utils/date";
import {
  validateCompleteMaintenanceForm,
  validateStartMaintenanceForm,
} from "@/lib/validation/staff";
import { isMockMode, services } from "@/services";
import type { MaintenanceRecord, MaintenanceStatus, Projector } from "@/types/domain";

type MaintenanceStatusFilter = "ALL" | MaintenanceStatus;

export function StaffMaintenanceView() {
  const [statusFilter, setStatusFilter] = useState<MaintenanceStatusFilter>("IN_PROGRESS");
  const [page, setPage] = useState(1);

  // Start maintenance modal state
  const [startTarget, setStartTarget] = useState<Projector | null>(null);
  const [startReason, setStartReason] = useState("");
  const [startNote, setStartNote] = useState("");
  const [startReasonError, setStartReasonError] = useState<string | undefined>(undefined);
  const [startError, setStartError] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  // Complete maintenance modal state
  const [completeTarget, setCompleteTarget] = useState<MaintenanceRecord | null>(null);
  const [resolutionNote, setResolutionNote] = useState("");
  const [setAvailable, setSetAvailable] = useState(true);
  const [resolutionError, setResolutionError] = useState<string | undefined>(undefined);
  const [completeError, setCompleteError] = useState<string | null>(null);
  const [completing, setCompleting] = useState(false);

  const [actionSuccess, setActionSuccess] = useState<string | null>(null);

  const startSubmittingRef = useRef(false);
  const completeSubmittingRef = useRef(false);

  const {
    data: maintenanceRes,
    loading: maintLoading,
    error: maintError,
    reload: reloadMaint,
  } = useAsyncQuery<ApiListResponse<MaintenanceRecord>>(
    () =>
      services.maintenance.listMaintenance({
        page,
        page_size: 20,
        status: statusFilter === "ALL" ? undefined : statusFilter,
      }),
    [page, statusFilter]
  );

  const {
    data: projectorsRes,
    loading: projLoading,
    error: projError,
    reload: reloadProjectors,
  } = useAsyncQuery<ApiListResponse<Projector>>(
    () => services.projector.listProjectors({ page: 1, page_size: 50 }),
    []
  );

  const projectors = useMemo(() => projectorsRes?.data ?? [], [projectorsRes]);
  const projectorMap = useMemo(() => {
    const map = new Map<string, Projector>();
    for (const unit of projectors) {
      map.set(unit.id, unit);
    }
    return map;
  }, [projectors]);

  const records = maintenanceRes?.data ?? [];
  const pagination = maintenanceRes?.meta.pagination ?? null;

  const handleStartMaintenance = async () => {
    if (!startTarget || startSubmittingRef.current) return;
    setStartError(null);

    const validation = validateStartMaintenanceForm({ reason: startReason });
    setStartReasonError(validation.reason);
    if (validation.reason) return;

    startSubmittingRef.current = true;
    setStarting(true);
    try {
      await services.maintenance.createMaintenance(startTarget.id, {
        reason: startReason.trim(),
        note: startNote.trim() || null,
      });
      setActionSuccess(`Unit ${startTarget.asset_code} dipindahkan ke status MAINTENANCE.`);
      setStartTarget(null);
      setStartReason("");
      setStartNote("");
      reloadMaint();
      reloadProjectors();
    } catch (err) {
      setStartError(normalizeUnknownError(err).message);
    } finally {
      setStarting(false);
      startSubmittingRef.current = false;
    }
  };

  const handleCompleteMaintenance = async () => {
    if (!completeTarget || completeSubmittingRef.current) return;
    setCompleteError(null);

    const validation = validateCompleteMaintenanceForm({ resolutionNote });
    setResolutionError(validation.resolutionNote);
    if (validation.resolutionNote) return;

    completeSubmittingRef.current = true;
    setCompleting(true);
    try {
      await services.maintenance.completeMaintenance(completeTarget.id, {
        resolution_note: resolutionNote.trim(),
        set_projector_available: setAvailable,
      });
      setActionSuccess(
        setAvailable
          ? "Maintenance selesai dan unit dinyatakan AVAILABLE."
          : "Catatan maintenance diselesaikan."
      );
      setCompleteTarget(null);
      setResolutionNote("");
      reloadMaint();
      reloadProjectors();
    } catch (err) {
      setCompleteError(normalizeUnknownError(err).message);
    } finally {
      setCompleting(false);
      completeSubmittingRef.current = false;
    }
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengelolaan Maintenance &amp; Unit"
        description="Catat unit yang perlu perbaikan dan nyatakan layak digunakan setelah pemeriksaan."
        actions={
          isMockMode ? (
            <Badge tone="warning" symbol="!">
              DATA SIMULASI DEV
            </Badge>
          ) : undefined
        }
      />

      {actionSuccess && (
        <Alert tone="success" title="Status Maintenance Diperbarui">
          {actionSuccess}
        </Alert>
      )}

      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-3">
          <div className="w-full sm:w-72">
            <Select
              id="maintenance-status-filter"
              label="Filter Catatan Maintenance"
              value={statusFilter}
              options={[
                { value: "IN_PROGRESS", label: "IN_PROGRESS — Sedang Diperbaiki" },
                { value: "COMPLETED", label: "COMPLETED — Selesai" },
                { value: "ALL", label: "Semua Catatan" },
              ]}
              onChange={(e) => {
                setStatusFilter(e.target.value as MaintenanceStatusFilter);
                setPage(1);
              }}
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              reloadMaint();
              reloadProjectors();
            }}
          >
            Muat Ulang
          </Button>
        </div>

        {maintLoading && (
          <LoadingState
            title="Memuat Catatan Maintenance..."
            description="Mengambil daftar perbaikan proyektor dari server."
            rows={3}
          />
        )}

        {!maintLoading && maintError && (
          <ErrorState
            title="Gagal Memuat Maintenance"
            message={maintError.message}
            errorCode={maintError.code}
            onRetry={reloadMaint}
          />
        )}

        {!maintLoading && !maintError && records.length === 0 && (
          <EmptyState
            title="Belum Ada Catatan Maintenance"
            description="Tidak ada unit dengan status maintenance yang dipilih."
          />
        )}

        {!maintLoading && !maintError && records.length > 0 && (
          <>
            <div className="grid gap-4 md:grid-cols-2">
              {records.map((rec) => {
                const unit = projectorMap.get(rec.projector_id);
                return (
                  <Card key={rec.id}>
                    <CardHeader>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <Badge tone="neutral" className="font-mono">
                          {unit?.asset_code ?? rec.projector_id}
                        </Badge>
                        <StatusBadge status={rec.status} />
                      </div>
                      <CardTitle className="mt-3">{unit?.name ?? rec.projector_id}</CardTitle>
                      <CardDescription>
                        Mulai: {formatJakartaDateTime(rec.started_at)}
                      </CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-2 text-sm">
                      <p>
                        <strong>Alasan:</strong> {rec.reason}
                      </p>
                      {rec.note && (
                        <p className="text-[var(--color-muted)]">
                          <strong>Catatan:</strong> {rec.note}
                        </p>
                      )}
                      {rec.resolution_note && (
                        <Alert tone="success" title="Resolusi">
                          {rec.resolution_note}
                        </Alert>
                      )}
                    </CardContent>
                    <CardFooter className="justify-between">
                      <Link href={`/staff/maintenance/${encodeURIComponent(rec.id)}`}>
                        <Button variant="outline" size="sm">
                          Detail
                        </Button>
                      </Link>
                      {rec.status === "IN_PROGRESS" && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => {
                            setCompleteError(null);
                            setResolutionError(undefined);
                            setResolutionNote("");
                            setSetAvailable(true);
                            setCompleteTarget(rec);
                          }}
                        >
                          Selesaikan Maintenance
                        </Button>
                      )}
                    </CardFooter>
                  </Card>
                );
              })}
            </div>

            {pagination && pagination.total_pages > 1 && (
              <div className="flex items-center justify-between gap-3 pt-2">
                <p className="text-sm text-[var(--color-muted)]">
                  Halaman <strong>{pagination.page}</strong> dari{" "}
                  <strong>{pagination.total_pages}</strong> ({pagination.total_items} catatan)
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
      </section>

      <section className="space-y-4 pt-4 border-t-2 border-[var(--border-color)]">
        <div>
          <h2 className="text-xl font-bold">Status Fisik Seluruh Unit Proyektor</h2>
          <p className="text-sm text-[var(--color-muted)]">
            Hanya unit berstatus <code>AVAILABLE</code> yang dapat dimasukkan ke status{" "}
            <code>MAINTENANCE</code> oleh STAFF/ADMIN.
          </p>
        </div>

        {projLoading && <LoadingState title="Memuat Daftar Unit..." rows={3} />}

        {!projLoading && projError && (
          <ErrorState
            title="Gagal Memuat Inventaris"
            message={projError.message}
            errorCode={projError.code}
            onRetry={reloadProjectors}
          />
        )}

        {!projLoading && !projError && projectors.length > 0 && (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {projectors.map((unit) => (
              <Card key={unit.id}>
                <CardHeader>
                  <div className="flex items-center justify-between gap-2">
                    <Badge tone="neutral" className="font-mono">
                      {unit.asset_code}
                    </Badge>
                    <StatusBadge status={unit.physical_status} />
                  </div>
                  <CardTitle className="mt-3">{unit.name}</CardTitle>
                  <CardDescription>
                    {[unit.brand, unit.model].filter(Boolean).join(" • ") || "Proyektor"}
                  </CardDescription>
                </CardHeader>
                <CardFooter className="justify-end">
                  {unit.physical_status === "AVAILABLE" ? (
                    <Button
                      variant="warning"
                      size="sm"
                      onClick={() => {
                        setStartError(null);
                        setStartReasonError(undefined);
                        setStartReason("");
                        setStartNote("");
                        setStartTarget(unit);
                      }}
                    >
                      Tandai Maintenance
                    </Button>
                  ) : (
                    <span className="text-xs font-mono text-[var(--color-muted)]">
                      Status: {unit.physical_status}
                    </span>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        )}
      </section>

      <ConfirmDialog
        open={Boolean(startTarget)}
        onClose={() => {
          if (!starting) setStartTarget(null);
        }}
        onConfirm={handleStartMaintenance}
        title={`Tandai ${startTarget?.asset_code ?? "Unit"} Maintenance?`}
        description="Unit tidak akan dapat dibooking. Booking mendatang yang terdampak akan dibatalkan oleh server dan komting diberi email."
        confirmLabel="Ya, Ubah ke Maintenance"
        cancelLabel="Batal"
        confirmVariant="warning"
        isConfirming={starting}
      >
        <div className="space-y-3">
          {startError && (
            <Alert tone="danger" title="Gagal Mengubah Status">
              {startError}
            </Alert>
          )}
          <Input
            id="maint-start-reason"
            label="Alasan Maintenance"
            placeholder="Contoh: Lampu proyektor bermasalah."
            required
            value={startReason}
            onChange={(e) => {
              setStartReason(e.target.value);
              if (startReasonError) setStartReasonError(undefined);
            }}
            error={startReasonError}
            disabled={starting}
          />
          <Textarea
            id="maint-start-note"
            label="Catatan Tambahan (Opsional)"
            placeholder="Detail pemeriksaan teknisi..."
            value={startNote}
            onChange={(e) => setStartNote(e.target.value)}
            disabled={starting}
          />
        </div>
      </ConfirmDialog>

      <ConfirmDialog
        open={Boolean(completeTarget)}
        onClose={() => {
          if (!completing) setCompleteTarget(null);
        }}
        onConfirm={handleCompleteMaintenance}
        title="Selesaikan Maintenance Unit?"
        description="Server akan memvalidasi tidak adanya loan aktif sebelum mengembalikan unit ke status AVAILABLE."
        confirmLabel="Ya, Selesaikan"
        cancelLabel="Batal"
        confirmVariant="primary"
        isConfirming={completing}
      >
        <div className="space-y-3">
          {completeError && (
            <Alert tone="danger" title="Gagal Menyelesaikan Maintenance">
              {completeError}
            </Alert>
          )}
          <Textarea
            id="maint-resolution-note"
            label="Catatan Penyelesaian"
            placeholder="Contoh: Unit telah diperiksa dan layak digunakan kembali."
            required
            value={resolutionNote}
            onChange={(e) => {
              setResolutionNote(e.target.value);
              if (resolutionError) setResolutionError(undefined);
            }}
            error={resolutionError}
            disabled={completing}
          />
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={setAvailable}
              onChange={(e) => setSetAvailable(e.target.checked)}
              disabled={completing}
              className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
            />
            <span>
              Nyatakan unit layak digunakan dan kembalikan status fisik ke{" "}
              <strong>AVAILABLE</strong>.
            </span>
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}
