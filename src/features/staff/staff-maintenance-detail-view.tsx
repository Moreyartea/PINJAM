"use client";

import Link from "next/link";
import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { normalizeUnknownError } from "@/lib/api/errors";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { validateCompleteMaintenanceForm } from "@/lib/validation/staff";
import { isMockMode, services } from "@/services";
import type { MaintenanceRecord, Projector } from "@/types/domain";

const MAX_MAINTENANCE_LOOKUP_PAGES = 10;

async function findMaintenanceRecordById(maintenanceId: string): Promise<MaintenanceRecord | null> {
  let currentPage = 1;
  while (currentPage <= MAX_MAINTENANCE_LOOKUP_PAGES) {
    const res = await services.maintenance.listMaintenance({ page: currentPage, page_size: 20 });
    const found = res.data.find((m) => m.id === maintenanceId);
    if (found) {
      return found;
    }
    const totalPages = res.meta.pagination?.total_pages ?? 1;
    if (currentPage >= totalPages || res.data.length === 0) {
      break;
    }
    currentPage += 1;
  }
  return null;
}

export function StaffMaintenanceDetailView({ maintenanceId }: { maintenanceId: string }) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [resolutionNote, setResolutionNote] = useState("");
  const [setAvailable, setSetAvailable] = useState(true);
  const [resolutionError, setResolutionError] = useState<string | undefined>(undefined);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const {
    data: record,
    loading,
    error,
    reload,
  } = useAsyncQuery<MaintenanceRecord | null>(
    () => findMaintenanceRecordById(maintenanceId),
    [maintenanceId]
  );

  const { data: projector } = useAsyncQuery<Projector | null>(
    async () => {
      if (!record?.projector_id) return null;
      try {
        const res = await services.projector.getProjector(record.projector_id);
        return res.data;
      } catch {
        return null;
      }
    },
    [record?.projector_id],
    { enabled: Boolean(record?.projector_id) }
  );

  const handleComplete = async () => {
    setSubmitError(null);
    const validation = validateCompleteMaintenanceForm({ resolutionNote });
    setResolutionError(validation.resolutionNote);
    if (validation.resolutionNote) return;

    setSubmitting(true);
    try {
      await services.maintenance.completeMaintenance(maintenanceId, {
        resolution_note: resolutionNote.trim(),
        set_projector_available: setAvailable,
      });
      setConfirmOpen(false);
      reload();
    } catch (err) {
      setSubmitError(normalizeUnknownError(err).message);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return <LoadingState title="Memuat Detail Maintenance..." rows={3} />;
  }

  if (error) {
    return (
      <ErrorState
        title="Gagal Memuat Detail Maintenance"
        message={error.message}
        errorCode={error.code}
        onRetry={reload}
        action={
          <Link href="/staff/maintenance">
            <Button variant="outline" size="sm">
              Kembali ke Maintenance
            </Button>
          </Link>
        }
      />
    );
  }

  if (!record) {
    return (
      <div className="space-y-4">
        <PageHeader
          title="Detail Maintenance Tidak Ditemukan"
          description={`Catatan maintenance ${maintenanceId} tidak ditemukan pada daftar aktif maupun riwayat yang tersedia.`}
          actions={
            <Link href="/staff/maintenance">
              <Button variant="outline" size="sm">
                Kembali ke Daftar Maintenance
              </Button>
            </Link>
          }
        />
        <EmptyState
          title="Catatan Maintenance Tidak Ditemukan"
          description="Periksa kembali ID catatan maintenance atau muat ulang dari daftar maintenance."
          action={
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={reload}>
                Muat Ulang
              </Button>
              <Link href="/staff/maintenance">
                <Button variant="primary" size="sm">
                  Kembali ke Maintenance
                </Button>
              </Link>
            </div>
          }
        />
      </div>
    );
  }

  const projectorLabel = projector
    ? `${projector.name} (${projector.asset_code})`
    : record.projector_id;

  return (
    <div className="space-y-6">
      <PageHeader
        title={`Maintenance ${record.id}`}
        description="Detail pencatatan dan penyelesaian maintenance proyektor."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/maintenance">
              <Button variant="outline" size="sm">
                Kembali ke Daftar
              </Button>
            </Link>
          </>
        }
      />

      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="neutral" className="font-mono">
              Unit: {projectorLabel}
            </Badge>
            <StatusBadge status={record.status} />
          </div>
          <CardTitle className="mt-3">{record.reason}</CardTitle>
          <CardDescription>Mulai: {formatJakartaDateTime(record.started_at)}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          {record.note && (
            <p>
              <strong>Catatan Awal:</strong> {record.note}
            </p>
          )}
          {record.resolution_note && (
            <Alert tone="success" title="Catatan Penyelesaian">
              {record.resolution_note}
            </Alert>
          )}
          {record.completed_at && (
            <p className="text-[var(--color-muted)]">
              Selesai pada: {formatJakartaDateTime(record.completed_at)}
            </p>
          )}
        </CardContent>
        <CardFooter className="justify-between">
          <Button variant="outline" size="sm" onClick={reload}>
            Muat Ulang
          </Button>
          {record.status === "IN_PROGRESS" && (
            <Button variant="primary" size="sm" onClick={() => setConfirmOpen(true)}>
              Selesaikan Maintenance
            </Button>
          )}
        </CardFooter>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => {
          if (!submitting) setConfirmOpen(false);
        }}
        onConfirm={handleComplete}
        title="Selesaikan Maintenance?"
        description="Pastikan pemeriksaan kelayakan fisik telah dilakukan sebelum mengembalikan unit menjadi AVAILABLE."
        confirmLabel="Ya, Selesaikan"
        cancelLabel="Batal"
        isConfirming={submitting}
      >
        <div className="space-y-3">
          {submitError && (
            <Alert tone="danger" title="Gagal Menyelesaikan">
              {submitError}
            </Alert>
          )}
          <Textarea
            id="detail-resolution-note"
            label="Catatan Penyelesaian"
            required
            value={resolutionNote}
            onChange={(e) => {
              setResolutionNote(e.target.value);
              if (resolutionError) setResolutionError(undefined);
            }}
            error={resolutionError}
            disabled={submitting}
          />
          <label className="flex items-start gap-2.5 text-sm cursor-pointer">
            <input
              type="checkbox"
              checked={setAvailable}
              onChange={(e) => setSetAvailable(e.target.checked)}
              disabled={submitting}
              className="mt-1 h-4 w-4 accent-[var(--color-ink)]"
            />
            <span>Kembalikan status unit menjadi AVAILABLE</span>
          </label>
        </div>
      </ConfirmDialog>
    </div>
  );
}
