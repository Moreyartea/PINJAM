"use client";

import Link from "next/link";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { isMockMode } from "@/services";

export function AdminStaffManagementView() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Pengelolaan Akun STAFF"
        description="Manajemen akun petugas operasional STAFF oleh ADMIN sesuai aturan least privilege dan otorisasi server."
        actions={
          <>
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

      <Alert tone="warning" title="Menunggu Finalisasi API Contract Manajemen STAFF">
        <p>
          <strong>API_CONTRACT_PINJAM.md (v1.0.0)</strong> belum mendefinisikan endpoint maupun
          struktur request/response untuk daftar akun STAFF, pembuatan akun STAFF manual, pembaruan
          data, serta aktivasi/penonaktifan akun STAFF.
        </p>
        <p className="mt-1">
          Sesuai kebijakan kontrak, frontend tidak membuat endpoint atau payload fiktif dan tidak
          menyediakan pendaftaran mandiri (<em>self-registration</em>) untuk role <code>STAFF</code>
          .
        </p>
      </Alert>

      <EmptyState
        title="Endpoint Manajemen Akun STAFF Belum Tersedia di API Contract"
        description="Daftar akun, form pembuatan akun STAFF manual oleh ADMIN, edit data, dan penonaktifan akun akan diaktifkan setelah endpoint resmi disepakati pada API Contract dan disiapkan oleh backend."
        action={
          <div className="flex flex-wrap gap-2">
            <Link href="/admin">
              <Button variant="primary" size="sm">
                Kembali ke Dashboard ADMIN
              </Button>
            </Link>
            <Link href="/staff">
              <Button variant="outline" size="sm">
                Buka Operasional STAFF
              </Button>
            </Link>
          </div>
        }
      />

      <Card>
        <CardHeader>
          <CardTitle>Gap Kontrak &amp; Batasan Keamanan Modul STAFF</CardTitle>
          <CardDescription>
            Kebutuhan fungsional PRD FR-007 dan FRONTEND_SPEC §10.4 yang menunggu kesepakatan
            endpoint backend:
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">1. Daftar Akun STAFF &amp; Filter/Pagination</p>
              <Badge tone="warning">Belum Ada di Kontrak</Badge>
            </div>
            <p className="text-[var(--color-muted)]">
              Belum tersedia endpoint daftar user role <code>STAFF</code> beserta query filter
              status akun dan pagination.
            </p>
          </div>

          <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">2. Pembuatan Akun STAFF Manual oleh ADMIN</p>
              <Badge tone="warning">Belum Ada di Kontrak</Badge>
            </div>
            <p className="text-[var(--color-muted)]">
              Akun STAFF hanya boleh dibuat manual oleh ADMIN melalui endpoint server terotorisasi
              (tanpa self-registration publik, tanpa opsi membuat akun ADMIN, dan tanpa menyimpan
              kredensial di browser).
            </p>
          </div>

          <div className="p-3 nb-border rounded-[var(--radius-sm)] bg-[var(--color-bg)] space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="font-bold">3. Edit Metadata &amp; Nonaktifkan Akun STAFF</p>
              <Badge tone="warning">Belum Ada di Kontrak</Badge>
            </div>
            <p className="text-[var(--color-muted)]">
              Belum tersedia daftar field yang diizinkan untuk diedit maupun endpoint
              aktivasi/penonaktifan akun STAFF; penonaktifan tidak menghapus data historis audit.
            </p>
          </div>
        </CardContent>
        <CardFooter className="text-xs text-[var(--color-muted)]">
          Catatan: Perubahan role akun tidak dapat dilakukan dari UI pengguna dan otorisasi final
          wajib ditegakkan oleh backend.
        </CardFooter>
      </Card>
    </div>
  );
}
