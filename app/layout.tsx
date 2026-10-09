import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "Praćenje studenata", template: "%s · Praćenje studenata" },
  description: "Dolaznost, bodovi i zadaci na kolegiju",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="hr">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
