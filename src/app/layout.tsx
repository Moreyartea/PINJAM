import type { Metadata } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans, Space_Grotesk } from "next/font/google";
import type { ReactNode } from "react";
import { AppProviders } from "@/components/providers/app-providers";
import { env } from "@/lib/config/env";
import "./globals.css";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  variable: "--font-plus-jakarta",
  display: "swap",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  variable: "--font-space-grotesk",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  variable: "--font-jetbrains-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: `${env.appName} — Sistem Peminjaman Proyektor`,
    template: `%s | ${env.appName}`,
  },
  description:
    "Sistem informasi pengajuan komting, booking, peminjaman, pengembalian, inventaris, dan maintenance proyektor.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html
      lang="id"
      className={`${plusJakarta.variable} ${spaceGrotesk.variable} ${jetbrainsMono.variable}`}
    >
      <body>
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-[var(--z-toast)] px-4 py-2 bg-[var(--color-primary)] text-[var(--color-ink)] font-bold nb-border nb-shadow-sm rounded-[var(--radius-sm)]"
        >
          Lewati ke konten utama
        </a>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
