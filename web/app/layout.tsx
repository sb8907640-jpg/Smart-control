import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Smart Control",
  description: "Consent-based family safety and remote support."
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
