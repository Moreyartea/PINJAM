"use client";

import Link from "next/link";
import { ErrorState } from "@/components/feedback/error-state";
import { LoadingState } from "@/components/feedback/loading-state";
import { PageHeader } from "@/components/layout/app-shell";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ReturnInspectionForm } from "@/features/staff/return-inspection-form";
import { useAsyncQuery } from "@/hooks/use-async-query";
import { isMockMode, services } from "@/services";
import type { Loan, Projector } from "@/types/domain";

export function StaffReturnInspectionView({ loanId }: { loanId: string }) {
  const {
    data: loan,
    loading,
    error,
    reload,
  } = useAsyncQuery<Loan>(async () => {
    const res = await services.loan.getStaffLoan(loanId);
    return res.data;
  }, [loanId]);

  const { data: projector } = useAsyncQuery<Projector | null>(
    async () => {
      if (!loan?.projector_id) return null;
      try {
        const res = await services.projector.getProjector(loan.projector_id);
        return res.data;
      } catch {
        return null;
      }
    },
    [loan?.projector_id],
    { enabled: Boolean(loan?.projector_id) }
  );

  if (loading) {
    return (
      <LoadingState
        title="Memuat Transaksi Loan..."
        description="Mengambil detail peminjaman untuk inspeksi pengembalian."
        rows={3}
      />
    );
  }

  if (error || !loan) {
    return (
      <ErrorState
        title="Gagal Memuat Data Loan"
        message={error?.message ?? "Data loan tidak ditemukan."}
        errorCode={error?.code}
        onRetry={reload}
        action={
          <Link href="/staff/loans">
            <Button variant="outline" size="sm">
              Kembali ke Daftar Loan
            </Button>
          </Link>
        }
      />
    );
  }

  const projectorLabel = projector ? `${projector.name} (${projector.asset_code})` : undefined;

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inspeksi Pengembalian Unit"
        description="Periksa proyektor dan aksesori sebelum menyelesaikan transaksi peminjaman."
        actions={
          <>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
            <Link href="/staff/loans">
              <Button variant="outline" size="sm">
                Kembali ke Daftar Loan
              </Button>
            </Link>
          </>
        }
      />

      <ReturnInspectionForm
        loan={loan}
        projectorLabel={projectorLabel}
        onCompleted={() => reload()}
      />
    </div>
  );
}
