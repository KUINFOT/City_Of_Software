import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "City of Software — BMA TOR Portal",
  description: "Bangkok software procurement and TOR discovery portal",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
