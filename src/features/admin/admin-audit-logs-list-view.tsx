"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { useAsyncQuery } from "@/hooks/use-async-query";
import type { ApiListResponse } from "@/lib/api/types";
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { AuditLogEntry } from "@/types/domain";

const AUDIT_ENTITY_TYPE_OPTIONS = [
  { value: "ALL", label: "Semua Tipe Entitas" },
  { value: "BOOKING", label: "BOOKING" },
  { value: "LOAN", label: "LOAN" },
  { value: "PROJECTOR", label: "PROJECTOR" },
  { value: "KOMTING_APPLICATION", label: "KOMTING_APPLICATION" },
  { value: "MAINTENANCE", label: "MAINTENANCE" },
  { value: "OPERATING_HOURS", label: "OPERATING_HOURS" },
  { value: "USER", label: "USER" },
];

const ROLE_TONE: Record<string, "primary" | "secondary" | "accent" | "neutral"> = {
  ADMIN: "accent",
  STAFF: "secondary",
  KOMTING: "primary",
};

function summarizeAuditSnapshot(entry: AuditLogEntry): string {
  const hasBefore = entry.before_data !== null && Object.keys(entry.before_data).length > 0;
  const hasAfter = entry.after_data !== null && Object.keys(entry.after_data).length > 0;

  if (hasBefore && hasAfter) {
    const keys = Array.from(
      new Set([...Object.keys(entry.before_data ?? {}), ...Object.keys(entry.after_data ?? {})])
    );
    return `Sebelum & sesudah (${keys.slice(0, 3).join(", ")}${keys.length > 3 ? ", …" : ""})`;
  }
  if (hasAfter) {
    return "Snapshot sesudah tersedia";
  }
  if (hasBefore) {
    return "Snapshot sebelum tersedia";
  }
  return "Tanpa snapshot before/after";
}

export function AdminAuditLogsListView() {
  const [entityTypeInput, setEntityTypeInput] = useState("ALL");
  const [entityIdInput, setEntityIdInput] = useState("");
  const [appliedEntityType, setAppliedEntityType] = useState("ALL");
  const [appliedEntityId, setAppliedEntityId] = useState("");
  const [localKeyword, setLocalKeyword] = useState("");
  const [page, setPage] = useState(1);

  const { data, loading, error, reload } = useAsyncQuery<ApiListResponse<AuditLogEntry>>(
    () =>
      services.auditLog.listAuditLogs({
        page,
        page_size: 20,
        entity_type: appliedEntityType === "ALL" ? undefined : appliedEntityType,
        entity_id: appliedEntityId.trim() || undefined,
      }),
    [page, appliedEntityType, appliedEntityId]
  );

  const rawLogs = useMemo(() => data?.data ?? [], [data]);
  const pagination = data?.meta.pagination ?? null;

  const filteredLogs = useMemo(() => {
    const keyword = localKeyword.trim().toLowerCase();
    if (!keyword) return rawLogs;
    return rawLogs.filter((entry) =>
      [
        entry.id,
        entry.actor_user_id,
        entry.actor_role,
        entry.action,
        entry.entity_type,
        entry.entity_id,
        entry.reason ?? "",
        entry.request_id,
      ]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [rawLogs, localKeyword]);

  const handleApplyFilter = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedEntityType(entityTypeInput);
    setAppliedEntityId(entityIdInput.trim());
    setPage(1);
  };

  const handleResetFilter = () => {
    setEntityTypeInput("ALL");
    setEntityIdInput("");
    setAppliedEntityType("ALL");
    setAppliedEntityId("");
    setLocalKeyword("");
    setPage(1);
  };

  const hasActiveServerFilter = appliedEntityType !== "ALL" || appliedEntityId.trim() !== "";

  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log Sistem"
        description="Penelusuran catatan aktivitas immutable untuk seluruh perubahan data dan transaksi pada PINJAM."
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
            <Link href="/admin">
              <Button variant="outline" size="sm">
                Kembali ke Dashboard
              </Button>
            </Link>
          </>
        }
      />

      <Alert tone="info" title="Catatan Kontrak Audit Log (Read-Only)">
        Catatan audit bersifat hanya-baca dan tidak dapat diubah atau dihapus. Filter server
        mendukung <code>entity_type</code> dan <code>entity_id</code>; pencarian kata kunci bekerja
        pada entri halaman yang sedang dimuat.
      </Alert>

      <Card>
        <CardHeader>
          <CardTitle>Filter Penelusuran Audit</CardTitle>
          <CardDescription>
            Saring log aktivitas berdasarkan tipe entitas dan ID entitas sesuai API Contract.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleApplyFilter} className="grid gap-4 md:grid-cols-3">
            <Select
              id="audit-entity-type-filter"
              label="Tipe Entitas (Server)"
              value={entityTypeInput}
              options={AUDIT_ENTITY_TYPE_OPTIONS}
              onChange={(e) => {
                const nextType = e.target.value;
                setEntityTypeInput(nextType);
                setAppliedEntityType(nextType);
                setPage(1);
              }}
            />

            <Input
              id="audit-entity-id-filter"
              label="ID Entitas (Server)"
              placeholder="Contoh: sim_booking_pickup_01"
              value={entityIdInput}
              onChange={(e) => setEntityIdInput(e.target.value)}
            />

            <Input
              id="audit-local-keyword-filter"
              label="Cari Kata Kunci (Halaman Ini)"
              placeholder="Aksi, actor_user_id, alasan, request_id…"
              value={localKeyword}
              onChange={(e) => setLocalKeyword(e.target.value)}
            />

            <div className="flex flex-wrap items-center gap-2 md:col-span-3">
              <Button type="submit" variant="primary" size="sm" disabled={loading}>
                Terapkan Filter
              </Button>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleResetFilter}
                disabled={loading}
              >
                Reset Filter
              </Button>
              <Button type="button" variant="outline" size="sm" onClick={reload} disabled={loading}>
                Muat Ulang
              </Button>
            </div>
          </form>
        </CardContent>
      </Card>

      {loading && (
        <LoadingState
          title="Memuat Audit Log..."
          description="Mengambil riwayat aktivitas sistem dari server."
          rows={5}
        />
      )}

      {!loading && error && (
        <ErrorState
          title="Gagal Memuat Audit Log"
          message={error.message}
          errorCode={error.code}
          onRetry={reload}
        />
      )}

      {!loading && !error && rawLogs.length === 0 && (
        <EmptyState
          title="Belum Ada Catatan Audit"
          description={
            hasActiveServerFilter
              ? "Tidak ditemukan catatan audit untuk kombinasi Tipe Entitas dan ID Entitas tersebut."
              : "Belum ada aktivitas sistem yang tercatat."
          }
          action={
            hasActiveServerFilter ? (
              <Button variant="outline" size="sm" onClick={handleResetFilter}>
                Tampilkan Semua Log
              </Button>
            ) : undefined
          }
        />
      )}

      {!loading && !error && rawLogs.length > 0 && filteredLogs.length === 0 && (
        <EmptyState
          title="Tidak Ada Hasil Pencarian Lokal"
          description="Tidak ada entri pada halaman ini yang cocok dengan kata kunci yang dimasukkan."
          action={
            <Button variant="outline" size="sm" onClick={() => setLocalKeyword("")}>
              Bersihkan Kata Kunci
            </Button>
          }
        />
      )}

      {!loading && !error && filteredLogs.length > 0 && (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full border-collapse text-left text-sm">
                  <thead>
                    <tr className="border-b-2 border-[var(--color-border)] bg-[var(--color-surface-subtle)]">
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs">
                        Waktu (WIB)
                      </th>
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs">
                        Aktor
                      </th>
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs">
                        Aksi
                      </th>
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs">
                        Entitas
                      </th>
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs">
                        Ringkasan &amp; Alasan
                      </th>
                      <th className="px-4 py-3 font-extrabold uppercase tracking-wide text-xs text-right">
                        Detail
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLogs.map((entry) => (
                      <tr
                        key={entry.id}
                        className="border-b border-[var(--color-border)] last:border-b-0 hover:bg-[var(--color-surface-subtle)]/50"
                      >
                        <td className="px-4 py-3 align-top whitespace-nowrap">
                          <div className="font-semibold">
                            {formatJakartaDateTime(entry.created_at)}
                          </div>
                          <div className="font-mono text-xs text-[var(--color-muted)]">
                            {entry.id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <div className="mb-1">
                            <Badge tone={ROLE_TONE[entry.actor_role] ?? "neutral"}>
                              {entry.actor_role}
                            </Badge>
                          </div>
                          <div className="font-mono text-xs break-all">{entry.actor_user_id}</div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <span className="font-mono font-bold text-xs">{entry.action}</span>
                          <div className="mt-1 font-mono text-[11px] text-[var(--color-muted)]">
                            Req: {entry.request_id}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top">
                          <Badge tone="neutral">{entry.entity_type}</Badge>
                          <div className="mt-1 font-mono text-xs break-all">{entry.entity_id}</div>
                        </td>
                        <td className="px-4 py-3 align-top max-w-xs">
                          <div className="font-medium">{summarizeAuditSnapshot(entry)}</div>
                          <div className="mt-1 text-xs text-[var(--color-muted)]">
                            Alasan: {entry.reason ?? "—"}
                          </div>
                        </td>
                        <td className="px-4 py-3 align-top text-right whitespace-nowrap">
                          <Link href={`/admin/audit-logs/${encodeURIComponent(entry.id)}`}>
                            <Button variant="outline" size="sm">
                              Lihat Detail
                            </Button>
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>

          {pagination && pagination.total_pages > 1 && (
            <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
              <p className="text-sm text-[var(--color-muted)]">
                Halaman <strong>{pagination.page}</strong> dari{" "}
                <strong>{pagination.total_pages}</strong> ({pagination.total_items} catatan)
              </p>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page <= 1 || loading}
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                >
                  Sebelumnya
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={page >= pagination.total_pages || loading}
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
