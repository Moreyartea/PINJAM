"use client";

import { useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { AppShell, PageHeader, type NavItem } from "@/components/layout/app-shell";
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
import { env } from "@/lib/config/env";
import { isMockMode } from "@/services";

const FOUNDATION_NAV: NavItem[] = [
  { label: "Fondasi FE-0", href: "/", badge: "AKTIF" },
  { label: "Login", href: "/login" },
  { label: "Daftar Komting", href: "/register" },
  { label: "Verifikasi Email", href: "/verify-email" },
  { label: "Status Pengajuan", href: "/application/status" },
  { label: "Dashboard Komting", href: "/komting" },
  { label: "Daftar Proyektor", href: "/komting/projectors" },
  { label: "Booking Baru", href: "/komting/bookings/new" },
  { label: "Daftar Booking", href: "/komting/bookings" },
  { label: "Riwayat Peminjaman", href: "/komting/loans" },
  { label: "Uji 403 Guard", href: "/forbidden" },
];

export default function FoundationHomePage() {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [sampleName, setSampleName] = useState("");
  const [sampleError, setSampleError] = useState<string | undefined>(undefined);

  const handleValidateSample = () => {
    if (!sampleName.trim()) {
      setSampleError("Contoh validasi field wajib: input tidak boleh kosong.");
      return;
    }
    setSampleError(undefined);
    setConfirmOpen(true);
  };

  return (
    <AppShell navItems={FOUNDATION_NAV} roleLabel="SPRINT FE-0" userLabel="Fondasi Frontend">
      <PageHeader
        title="Fondasi Aplikasi PINJAM"
        description="Baseline teknologi, design system Neubrutalism, komponen dasar, dan abstraksi komunikasi API."
        actions={
          <Badge tone={isMockMode ? "warning" : "success"} symbol="●">
            {isMockMode ? "Mode Mock Development" : "Mode API Terhubung"}
          </Badge>
        }
      />

      <Alert tone="info" title="Status Tahap Implementasi (Sprint FE-0)">
        Halaman ini hanya menampilkan fondasi desain dan komponen dasar. Fitur autentikasi,
        dashboard role, booking, QR pickup/return, dan administrasi akan dibangun bertahap pada
        sprint berikutnya sesuai{" "}
        <code className="font-mono font-semibold">FRONTEND_SPEC_PINJAM.md</code>.
      </Alert>

      <section aria-labelledby="section-tokens" className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle id="section-tokens">Konfigurasi Runtime &amp; API</CardTitle>
            <CardDescription>
              Terpisah dari komponen UI melalui service registry terpusat.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-2.5 text-sm">
            <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--color-surface-subtle)]">
              <span className="font-semibold text-[var(--color-muted)]">Aplikasi</span>
              <span className="font-mono font-bold">{env.appName}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--color-surface-subtle)]">
              <span className="font-semibold text-[var(--color-muted)]">Zona Waktu</span>
              <span className="font-mono font-bold">{env.timezone}</span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1 border-b border-[var(--color-surface-subtle)]">
              <span className="font-semibold text-[var(--color-muted)]">API Base URL</span>
              <span className="font-mono text-xs break-all">
                {env.apiBaseUrl || "(belum dikonfigurasi)"}
              </span>
            </div>
            <div className="flex items-center justify-between gap-2 py-1">
              <span className="font-semibold text-[var(--color-muted)]">Adapter Aktif</span>
              <Badge tone={isMockMode ? "warning" : "primary"}>
                {isMockMode ? "MOCK ADAPTER" : "HTTP API CLIENT"}
              </Badge>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Status Badge (Non-Warna + Teks)</CardTitle>
            <CardDescription>
              Pemisahan status fisik unit, booking, loan, dan fallback status tak dikenal.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            <StatusBadge status="AVAILABLE" />
            <StatusBadge status="BORROWED" />
            <StatusBadge status="MAINTENANCE" />
            <StatusBadge status="CONFIRMED" />
            <StatusBadge status="FULFILLED" />
            <StatusBadge status="EXPIRED" />
            <StatusBadge status="ACTIVE" />
            <StatusBadge status="RETURNED" />
            <StatusBadge status="UNRECOGNIZED_STATUS" />
          </CardContent>
        </Card>
      </section>

      <Card>
        <CardHeader>
          <CardTitle>Komponen Form &amp; Dialog Konfirmasi</CardTitle>
          <CardDescription>
            Kontrol dasar aksesibel dengan label eksplisit, focus ring, dan konfirmasi aksi.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 md:grid-cols-2">
          <Input
            id="foundation-sample-input"
            label="Contoh Input Teks"
            placeholder="Masukkan teks contoh..."
            required
            value={sampleName}
            onChange={(e) => {
              setSampleName(e.target.value);
              if (sampleError) setSampleError(undefined);
            }}
            hint="Kosongkan lalu tekan tombol uji untuk melihat error state field."
            error={sampleError}
          />
          <Select
            id="foundation-sample-select"
            label="Contoh Pilihan Status"
            defaultValue="AVAILABLE"
            options={[
              { value: "AVAILABLE", label: "AVAILABLE — Tersedia" },
              { value: "BORROWED", label: "BORROWED — Dipinjam" },
              { value: "MAINTENANCE", label: "MAINTENANCE — Perbaikan" },
            ]}
          />
          <div className="md:col-span-2">
            <Textarea
              id="foundation-sample-textarea"
              label="Contoh Catatan"
              placeholder="Catatan operasional..."
              rows={2}
            />
          </div>
        </CardContent>
        <CardFooter>
          <Button variant="primary" onClick={handleValidateSample}>
            Uji Validasi &amp; Dialog
          </Button>
          <Button variant="secondary" onClick={() => setConfirmOpen(true)}>
            Buka ConfirmDialog
          </Button>
          <Button variant="danger">Aksi Berbahaya</Button>
          <Button variant="outline" isLoading loadingText="Memproses...">
            Loading
          </Button>
        </CardFooter>
      </Card>

      <section aria-label="Contoh state UI" className="grid gap-4 lg:grid-cols-3">
        <LoadingState
          title="Contoh LoadingState"
          description="Menampilkan indikator muat."
          rows={2}
        />
        <EmptyState
          title="Contoh EmptyState"
          description="Ditampilkan saat daftar resource kosong."
        />
        <ErrorState
          title="Contoh ErrorState"
          message="Menampilkan pesan aman dari error code API."
          errorCode="BOOKING_CONFLICT"
        />
      </section>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={() => setConfirmOpen(false)}
        title="Konfirmasi Aksi"
        description="Contoh dialog konfirmasi Neubrutalism untuk mutasi transaksi penting."
        confirmLabel="Ya, Lanjutkan"
        cancelLabel="Batal"
      />
    </AppShell>
  );
}
