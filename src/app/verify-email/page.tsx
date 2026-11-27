import { Suspense } from "react";
import { LoadingState } from "@/components/feedback/loading-state";
import { VerifyEmailView } from "@/features/auth/verify-email-view";

export default function VerifyEmailPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]"
    >
      <Suspense
        fallback={
          <div className="w-full max-w-md">
            <LoadingState title="Memuat halaman verifikasi..." rows={2} />
          </div>
        }
      >
        <VerifyEmailView />
      </Suspense>
    </main>
  );
}
