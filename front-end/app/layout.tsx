import type { Metadata } from "next";
import { AdminAuditProvider } from "@/components/admin-audit-provider";
import { AuthProvider } from "@/components/auth-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "City of Software — BMA TOR Portal",
  description: "Bangkok software procurement and TOR discovery portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
<html lang="th">
      <body><AuthProvider><AdminAuditProvider>{children}</AdminAuditProvider></AuthProvider></body>
    </html>
  );
}
