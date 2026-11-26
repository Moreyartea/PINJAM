"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Alert } from "@/components/feedback/alert";
import { LoadingState } from "@/components/feedback/loading-state";
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
import { normalizeUnknownError } from "@/lib/api/errors";
import { isMockMode, services } from "@/services";

type VerifyState = "idle" | "verifying" | "success" | "error";

export function VerifyEmailView() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? undefined;
  const tokenHash = searchParams.get("token_hash") ?? undefined;
  const type = searchParams.get("type") ?? undefined;
  const hasToken = Boolean(token || tokenHash);

  const [state, setState] = useState<VerifyState>(hasToken ? "verifying" : "idle");
  const [message, setMessage] = useState<string>(
    hasToken
      ? "Memverifikasi tautan email Anda..."
      : "Periksa kotak masuk email Anda dan klik tautan verifikasi yang dikirim oleh sistem."
  );

  useEffect(() => {
    if (!hasToken) return;
    let active = true;

    async function verify() {
      setState("verifying");
      try {
        const result = await services.auth.verifyEmail({
          token,
          token_hash: tokenHash,
          type,
        });
        if (!active) return;

        if (result.verified) {
          setState("success");
          setMessage(result.message);
        } else {
          setState("idle");
          setMessage(result.message);
        }
      } catch (err) {
        if (!active) return;
        const normalized = normalizeUnknownError(err);
        setState("error");
        setMessage(normalized.message);
      }
    }

    void verify();

    return () => {
      active = false;
    };
  }, [hasToken, token, tokenHash, type]);

  if (state === "verifying") {
    return (
      <div className="w-full max-w-md">
        <LoadingState
          title="Memverifikasi Email..."
          description="Mohon tunggu sementara sistem memproses token verifikasi Anda."
          rows={2}
        />
      </div>
    );
  }

  return (
    <div className="w-full max-w-md">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-2">
            <Badge tone="secondary">Verifikasi Email</Badge>
            {isMockMode && (
              <Badge tone="warning" symbol="!">
                SIMULASI DEV
              </Badge>
            )}
          </div>
          <CardTitle className="mt-3 text-xl">Status Verifikasi Email</CardTitle>
          <CardDescription>
            Email wajib diverifikasi sebelum pengajuan komting dapat diproses ADMIN.
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {state === "success" && (
            <Alert tone="success" title="Email Terverifikasi">
              {message}
            </Alert>
          )}

          {state === "error" && (
            <Alert tone="danger" title="Verifikasi Gagal">
              {message}
            </Alert>
          )}

          {state === "idle" && (
            <Alert tone="info" title="Menunggu Verifikasi">
              {message}
            </Alert>
          )}
        </CardContent>

        <CardFooter className="justify-between">
          <Link href="/login">
            <Button variant="primary" size="sm">
              Ke Halaman Login
            </Button>
          </Link>
          <Link href="/application/status">
            <Button variant="outline" size="sm">
              Cek Status Pengajuan
            </Button>
          </Link>
        </CardFooter>
      </Card>
    </div>
  );
}
