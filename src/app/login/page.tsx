import { Suspense } from "react";
import { LoadingState } from "@/components/feedback/loading-state";
import { LoginForm } from "@/features/auth/login-form";

export default function LoginPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex items-center justify-center p-4 bg-[var(--color-bg)]"
    >
      <Suspense
        fallback={
          <div className="w-full max-w-md">
            <LoadingState title="Memuat halaman login..." rows={2} />
          </div>
        }
      >
        <LoginForm />
      </Suspense>
    </main>
  );
}
