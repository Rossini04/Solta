import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "./site-header";
import { Toaster } from "@/components/ui/sonner";
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Solta — envie, compartilhe, baixe",
  description: "Compartilhe arquivos de até 10 GB, organize pastas e trabalhe em documentos com seu grupo.",
  other: {
    "codex-preview": "development",
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body className="antialiased"><SiteHeader />{children}<Toaster theme="light" position="bottom-right" richColors /></body>
    </html>
  );
}
