"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/feedback/alert";
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
import { Input } from "@/components/ui/input";
import { normalizeUnknownError } from "@/lib/api/errors";
import { useAuth } from "@/lib/auth/auth-context";
import { resolvePostLoginRedirect } from "@/lib/auth/navigation";
import { validateLoginForm, type LoginValidationErrors } from "@/lib/validation/auth";
import { isMockMode } from "@/services";

const DEV_SIMULATION_ACCOUNTS = [
  { label: "Komting Aktif (IF-01)", email: "komting.aktif@simulasi.local" },
  { label: "Calon Komting (Pending)", email: "calon.komting@simulasi.local" },
  { label: "Mantan Komting (Nonaktif)", email: "komting.nonaktif@simulasi.local" },
  { label: "Staff Operasional", email: "staff@simulasi.local" },
  { label: "Admin", email: "admin@simulasi.local" },
];

export function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { status, error: sessionError, signIn, clearError } = useAuth();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<LoginValidationErrors>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    clearError();
    setSubmitError(null);

    const validation = validateLoginForm({ email, password });
    setFieldErrors(validation);
    if (Object.keys(validation).length > 0) {
      return;
    }

    setIsSubmitting(true);
    try {
      const profile = await signIn({
        email: email.trim(),
        password,
      });

      const target = resolvePostLoginRedirect(
        profile.role,
        searchParams.get("next"),
        profile.account_status
      );

      router.replace(target);
    } catch (err) {
      const normalized = normalizeUnknownError(err);
      setSubmitError(normalized.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="w-full max-w-md space-y-4">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge tone="primary">PINJAM</Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
          </div>
          <CardTitle className="mt-3 text-xl sm:text-2xl">Masuk ke PINJAM</CardTitle>
          <CardDescription>
            Gunakan akun terdaftar untuk mengakses portal peminjaman proyektor.
          </CardDescription>
        </CardHeader>

        <form onSubmit={handleSubmit} noValidate>
          <CardContent className="space-y-4">
            {status === "expired" && (
              <Alert tone="warning" title="Sesi Berakhir">
                Sesi login Anda telah berakhir atau tidak valid. Silakan login kembali.
              </Alert>
            )}

            {(submitError || (sessionError && status !== "expired")) && (
              <Alert tone="danger" title="Login Gagal">
                {submitError ?? sessionError?.message}
              </Alert>
            )}

            <Input
              id="login-email"
              name="email"
              type="email"
              autoComplete="email"
              label="Email"
              placeholder="nama@kampus.ac.id"
              required
              value={email}
              onChange={(e) => {
                setEmail(e.target.value);
                if (fieldErrors.email) setFieldErrors((prev) => ({ ...prev, email: undefined }));
              }}
              error={fieldErrors.email}
              disabled={isSubmitting}
            />

            <Input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              label="Password"
              placeholder="Masukkan password"
              required
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                if (fieldErrors.password)
                  setFieldErrors((prev) => ({ ...prev, password: undefined }));
              }}
              error={fieldErrors.password}
              disabled={isSubmitting}
            />

            <Button
              type="submit"
              variant="primary"
              fullWidth
              isLoading={isSubmitting}
              loadingText="Memproses login..."
            >
              Masuk
            </Button>
          </CardContent>
        </form>

        <CardFooter className="flex-col items-stretch gap-2 text-sm">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--color-muted)]">Belum menjadi komting?</span>
            <Link
              href="/register"
              className="font-bold underline underline-offset-4 hover:text-[var(--color-ink)]"
            >
              Ajukan Pendaftaran Komting
            </Link>
          </div>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <span className="text-[var(--color-muted)]">Sudah mendaftar?</span>
            <Link
              href="/application/status"
              className="font-semibold underline underline-offset-4 hover:text-[var(--color-ink)]"
            >
              Cek Status Pengajuan
            </Link>
          </div>
        </CardFooter>
      </Card>

      {isMockMode && (
        <Card tone="warning">
          <CardHeader>
            <CardTitle className="text-sm">Panel Simulasi Akun (Dev Only)</CardTitle>
            <CardDescription>
              Hanya aktif saat mode mock development. Klik untuk mengisi email simulasi.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {DEV_SIMULATION_ACCOUNTS.map((acc) => (
              <Button
                key={acc.email}
                type="button"
                size="sm"
                variant="outline"
                onClick={() => {
                  setEmail(acc.email);
                  setPassword("simulasi");
                  setFieldErrors({});
                  setSubmitError(null);
                }}
              >
                {acc.label}
              </Button>
            ))}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
