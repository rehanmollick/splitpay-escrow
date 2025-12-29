import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Split Pay Escrow",
  description: "Decentralized escrow dApp for freelance payments with multi-party splits.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-gray-900 text-white antialiased">
        <div className="mx-auto max-w-4xl px-4 py-8">{children}</div>
      </body>
    </html>
  );
}


