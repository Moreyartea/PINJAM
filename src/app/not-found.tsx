import Link from "next/link";
import { ErrorState } from "@/components/feedback/error-state";
import { Button } from "@/components/ui/button";

export default function NotFoundPage() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]">
      <div className="w-full max-w-lg">
        <ErrorState
          title="404 — Halaman Tidak Ditemukan"
          message="Halaman yang Anda cari tidak tersedia atau belum diimplementasikan pada tahap ini."
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
