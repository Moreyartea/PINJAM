import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ApplicationStatusView } from "@/features/komting/application-status-view";

export default function ApplicationStatusPage() {
  return (
    <main
      id="main-content"
      className="min-h-screen flex flex-col items-center justify-center gap-4 p-4 sm:py-10 bg-[var(--color-bg)]"
    >
      <div className="w-full max-w-xl flex justify-between items-center">
        <Link href="/">
          <Button variant="outline" size="sm">
            Beranda
          </Button>
        </Link>
        <Link href="/login">
          <Button variant="ghost" size="sm">
            Login
          </Button>
        </Link>
      </div>
      <ApplicationStatusView />
    </main>
  );
}
