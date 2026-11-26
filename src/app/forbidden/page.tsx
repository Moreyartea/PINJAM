import Link from "next/link";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";

export default function ForbiddenPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]">
      <div className="w-full max-w-lg">
        <ErrorState
          title="403 — Akses Ditolak"
          message="Role akun Anda tidak memiliki izin untuk membuka halaman ini."
          errorCode="FORBIDDEN"
          action={
            <Link href="/">
              <Button variant="primary" size="sm">
                Kembali ke Beranda
              </Button>
            </Link>
          }
        />
      </div>
    </div>
  );
}
