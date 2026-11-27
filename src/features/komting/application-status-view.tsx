"use client";

import Link from "next/link";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
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
import { formatJakartaDateTime } from "@/lib/utils/date";
import { isMockMode, services } from "@/services";
import type { KomtingApplication } from "@/types/domain";

function getStatusGuidance(status: string): {
  tone: "info" | "success" | "warning" | "danger";
  title: string;
  body: string;
} {
  switch (status) {
    case "PENDING_EMAIL_VERIFICATION":
      return {
        tone: "warning",
        title: "Menunggu Verifikasi Email",
        body: "Silakan buka tautan verifikasi pada email Anda agar pengajuan dapat diperiksa ADMIN.",
      };
    case "PENDING_VERIFICATION":
    case "PENDING_REVIEW":
      return {
        tone: "info",
        title: "Sedang Menunggu Review ADMIN",
        body: "Data dan dokumen identitas Anda sedang antre diperiksa oleh ADMIN. Fitur booking belum aktif sebelum disetujui.",
      };
    case "PENDING_REPLACEMENT_NOTICE":
      return {
        tone: "warning",
        title: "Pengajuan Pergantian Komting",
        body: "Kelas yang dipilih sudah memiliki komting aktif. Pengajuan diproses sebagai permintaan pergantian; komting lama tetap aktif sampai ADMIN memutuskan pergantian.",
      };
    case "APPROVED":
      return {
        tone: "success",
        title: "Pengajuan Disetujui",
        body: "Selamat, penugasan komting Anda telah disetujui. Anda dapat masuk ke Dashboard Komting.",
      };
    case "REJECTED":
      return {
        tone: "danger",
        title: "Pengajuan Ditolak",
        body: "Pengajuan Anda belum dapat disetujui. Periksa alasan penolakan di bawah sebelum mengajukan kembali.",
      };
    case "WITHDRAWN":
      return {
        tone: "info",
        title: "Pengajuan Ditarik",
        body: "Pengajuan ini telah ditarik dan tidak aktif.",
      };
    default:
      return {
        tone: "info",
        title: "Status Pengajuan",
        body: "Status pengajuan diterima dari server.",
      };
  }
}

export function ApplicationStatusView() {
  const { status: authStatus, user, refreshMe } = useAuth();
  const isAuthenticated = authStatus === "authenticated";

  const {
    data: application,
    loading,
    error,
    reload,
  } = useAsyncQuery<KomtingApplication>(
    async () => {
      const response = await services.application.getMyApplication();
      return response.data;
    },
    [isAuthenticated],
    { enabled: isAuthenticated }
  );

  const handleReload = async () => {
    await reload();
    await refreshMe?.();
  };

  if (authStatus === "loading") {
    return (
      <div className="w-full max-w-xl">
        <LoadingState
          title="Memeriksa Sesi..."
          description="Menyiapkan pengecekan status pengajuan komting Anda."
          rows={2}
        />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="w-full max-w-xl">
        <Card>
          <CardHeader>
            <Badge tone="secondary">Status Pengajuan Komting</Badge>
            <CardTitle className="mt-3 text-xl">Login Diperlukan</CardTitle>
            <CardDescription>
              Masuk terlebih dahulu untuk melihat status pengajuan komting Anda secara aman.
            </CardDescription>
          </CardHeader>
          <CardFooter className="justify-between">
            <Link href="/login?next=/application/status">
              <Button variant="primary" size="sm">
                Masuk ke PINJAM
              </Button>
            </Link>
            <Link href="/register">
              <Button variant="outline" size="sm">
                Ajukan Pendaftaran Baru
              </Button>
            </Link>
          </CardFooter>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full max-w-xl">
        <LoadingState
          title="Memuat Status Pengajuan..."
          description="Mengambil status pengajuan komting Anda dari server."
          rows={3}
        />
      </div>
    );
  }

  if (error?.status === 404 || (!error && !application)) {
    return (
      <div className="w-full max-w-xl">
        <EmptyState
          title="Belum Ada Pengajuan Komting"
          description="Anda belum memiliki catatan pengajuan komting. Ajukan pendaftaran komting terlebih dahulu."
          action={
            <Link href="/register">
              <Button variant="primary" size="sm">
                Ajukan Pendaftaran Komting
              </Button>
            </Link>
          }
        />
      </div>
    );
  }

  if (error || !application) {
    return (
      <div className="w-full max-w-xl">
        <ErrorState
          title="Gagal Memuat Status Pengajuan"
          message={error?.message ?? "Data pengajuan tidak tersedia."}
          errorCode={error?.code}
          onRetry={reload}
        />
      </div>
    );
  }

  const guidance = getStatusGuidance(application.status);

  return (
    <div className="w-full max-w-xl space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <Badge tone="secondary">Status Pengajuan Komting</Badge>
            <div className="flex items-center gap-2">
              {isMockMode && (
                <Badge tone="warning" symbol="!">
                  SIMULASI DEV
                </Badge>
              )}
              <StatusBadge status={application.status} />
            </div>
          </div>
          <CardTitle className="mt-3 text-xl">Ringkasan Pengajuan Anda</CardTitle>
          <CardDescription>
            Status pengajuan berasal dari server dan hanya dapat diubah oleh proses verifikasi
            ADMIN.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <Alert tone={guidance.tone} title={guidance.title}>
            {guidance.body}
          </Alert>

          <dl className="grid gap-2.5 text-sm p-3.5 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)]">
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-[var(--color-muted)]">ID Pengajuan</dt>
              <dd className="font-mono font-bold text-right">{application.application_id}</dd>
            </div>
            {application.class_name && (
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-[var(--color-muted)]">Kelas Diajukan</dt>
                <dd className="font-bold text-right">{application.class_name}</dd>
              </div>
            )}
            {application.application_type && (
              <div className="flex justify-between gap-3">
                <dt className="font-semibold text-[var(--color-muted)]">Jenis Pengajuan</dt>
                <dd className="font-semibold text-right">
                  {application.application_type === "REPLACEMENT" ||
                  application.status === "PENDING_REPLACEMENT_NOTICE"
                    ? "Pengajuan Pergantian Komting"
                    : "Pengajuan Komting Baru"}
                </dd>
              </div>
            )}
            <div className="flex justify-between gap-3">
              <dt className="font-semibold text-[var(--color-muted)]">Tanggal Pengajuan</dt>
              <dd className="text-right">{formatJakartaDateTime(application.submitted_at)}</dd>
            </div>
            {user?.komting_assignment && (
              <div className="flex justify-between gap-3 items-center">
                <dt className="font-semibold text-[var(--color-muted)]">Penugasan Kelas</dt>
                <dd className="flex items-center gap-2">
                  <span className="font-bold">{user.komting_assignment.class_name}</span>
                  <StatusBadge status={user.komting_assignment.status} />
                </dd>
              </div>
            )}
          </dl>

          {application.status === "REJECTED" && application.rejection_reason && (
            <Alert tone="danger" title="Alasan Penolakan">
              {application.rejection_reason}
            </Alert>
          )}

          {application.admin_note && (
            <Alert tone="info" title="Catatan Tindak Lanjut">
              {application.admin_note}
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-between">
          <Button variant="outline" size="sm" onClick={handleReload}>
            Muat Ulang Status
          </Button>
          <div className="flex flex-wrap gap-2">
            {application.status === "REJECTED" && (
              <Link href="/register">
                <Button variant="secondary" size="sm">
                  Ajukan Ulang
                </Button>
              </Link>
            )}
            {application.status === "APPROVED" && user?.role === "KOMTING" && (
              <Link href="/komting">
                <Button variant="primary" size="sm">
                  Buka Dashboard Komting
                </Button>
              </Link>
            )}
            {application.status === "APPROVED" && user?.role !== "KOMTING" && (
              <Button
                variant="primary"
                size="sm"
                onClick={async () => {
                  await refreshMe?.();
                }}
              >
                Sinkronkan Sesi Akun
              </Button>
            )}
          </div>
        </CardFooter>
      </Card>
    </div>
  );
}
