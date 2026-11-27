"use client";

import Link from "next/link";
import { Alert } from "@/components/feedback/alert";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { AuditLogEntry } from "@/types/domain";

function SnapshotPanel({
  title,
  description,
  data,
}: {
  title: string;
  description: string;
  data: Record<string, unknown> | null;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent>
        {data === null ? (
          <p className="text-sm italic text-[var(--color-muted)]">
            Tidak ada snapshot data (null).
          </p>
        ) : (
          <pre className="overflow-x-auto rounded-[var(--radius-sm)] border-2 border-[var(--color-border)] bg-[var(--color-surface-subtle)] p-3 font-mono text-xs leading-relaxed">
            {JSON.stringify(data, null, 2)}
          </pre>
        )}
      </CardContent>
    </Card>
  );
}

export function AdminAuditLogDetailView({ auditLogId }: { auditLogId: string }) {
  const {
    data: entry,
    loading,
    error,
    reload,
  } = useAsyncQuery<AuditLogEntry>(async () => {
    const res = await services.auditLog.getAuditLog(auditLogId);
    return res.data;
  }, [auditLogId]);

  return (
    <div className="space-y-6">
      <PageHeader
        title="Detail Catatan Audit"
        description="Pemeriksaan metadata, alasan perubahan, serta snapshot before/after secara read-only."
        actions={
          <>
            <Badge tone="neutral" symbol="🔒">
              READ-ONLY
            </Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                DATA SIMULASI DEV
              </Badge>
            )}
            <Link href="/admin/audit-logs">
              <Button variant="outline" size="sm">
                Kembali ke Audit Log
              </Button>
            </Link>
          </>
        }
      />

      {loading && (
        <LoadingState
          title="Memuat Detail Audit Log..."
          description="Mengambil informasi lengkap catatan audit dari server."
          rows={4}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Detail Audit Log"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && entry && (
        <>
          <Alert tone="info" title="Rekaman Immutable">
            Catatan audit ini merupakan jejak historis sistem dan tidak menyediakan aksi ubah maupun
            hapus.
          </Alert>

          <Card>
            <CardHeader>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Badge tone="accent">{entry.actor_role}</Badge>
                <Badge tone="neutral">{entry.entity_type}</Badge>
              </div>
              <CardTitle className="mt-2 font-mono">{entry.action}</CardTitle>
              <CardDescription className="font-mono text-xs">
                Audit ID: {entry.id} • Request ID: {entry.request_id}
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2 text-sm">
              <div>
                <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                  Waktu Kejadian (Asia/Jakarta)
                </div>
                <div className="mt-1 font-semibold">
                  {formatJakartaDateTime(entry.created_at)} WIB
                </div>
                <div className="font-mono text-xs text-[var(--color-muted)]">
                  {entry.created_at}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                  Actor User ID &amp; Peran
                </div>
                <div className="mt-1 font-mono font-bold break-all">{entry.actor_user_id}</div>
                <div className="text-xs text-[var(--color-muted)]">Peran: {entry.actor_role}</div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                  Tipe &amp; ID Entitas
                </div>
                <div className="mt-1 font-mono font-bold break-all">
                  {entry.entity_type} / {entry.entity_id}
                </div>
              </div>

              <div>
                <div className="text-xs font-bold uppercase text-[var(--color-muted)]">
                  Alasan Perubahan
                </div>
                <div className="mt-1">{entry.reason ?? "—"}</div>
              </div>
            </CardContent>
          </Card>

          <div className="grid gap-4 md:grid-cols-2">
            <SnapshotPanel
              title="Before Data"
              description="Kondisi data sebelum aksi dijalankan."
              data={entry.before_data}
            />
            <SnapshotPanel
              title="After Data"
              description="Kondisi data setelah aksi dijalankan."
              data={entry.after_data}
            />
          </div>
        </>
      )}
    </div>
  );
}
