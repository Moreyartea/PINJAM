import Link from "next/link";
import { RoleGuard } from "@/components/auth/role-guard";
import { Alert } from "@/components/feedback/alert";
import { EmptyState } from "@/components/feedback/empty-state";
import { AdminShell } from "@/components/layout/admin-shell";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AdminCorrectionsPage() {
  return (
    <RoleGuard allowedRoles={["ADMIN"]}>
      <AdminShell>
        <div className="space-y-6">
          <PageHeader
            title="Koreksi Transaksi (Menunggu Finalisasi Kontrak)"
            description="Endpoint kerangka koreksi transaksi oleh ADMIN tersedia di §13.3 dan menunggu daftar field resmi yang diizinkan."
            actions={
              <>
                <Badge tone="warning" symbol="…">
                  SEGERA
                </Badge>
                <Link href="/admin">
                  <Button variant="outline" size="sm">
                    Kembali ke Dashboard
                  </Button>
                </Link>
              </>
            }
          />

          <Alert tone="info" title="Status Kontrak §13.3 & Open Decision §20">
            <code>POST /api/v1/admin/transactions/{"{transaction_id}"}/corrections</code> baru
            berstatus kerangka kontrak di <strong>API_CONTRACT_PINJAM.md</strong>. Sesuai kebijakan
            proyek, form koreksi belum diaktifkan sebelum daftar field yang boleh dikoreksi
            disepakati secara eksplisit oleh backend dan PRD.
          </Alert>

          <EmptyState
            title="Modul Koreksi Transaksi Belum Aktif"
            description="Setiap koreksi nantinya wajib menyertakan alasan, nilai sebelum/sesudah, dan tercatat pada audit log tanpa melewati aturan bisnis."
            action={
              <div className="flex flex-wrap gap-2">
                <Link href="/admin/audit-logs">
                  <Button variant="primary" size="sm">
                    Lihat Audit Log Sistem
                  </Button>
                </Link>
                <Link href="/admin">
                  <Button variant="outline" size="sm">
                    Kembali ke Dashboard ADMIN
                  </Button>
                </Link>
              </div>
            }
          />
        </div>
      </AdminShell>
    </RoleGuard>
  );
}
