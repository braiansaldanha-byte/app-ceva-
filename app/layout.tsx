import type { Metadata, Viewport } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "Cevaí — Teu próximo brinde tá aqui",
  description:
    "Descobre pubs, encontra benefícios e combina teu próximo rolê em Porto Alegre com o Cevaí.",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cevaí",
  },
  icons: {
    icon: "/assets/app-icon-192.png",
    apple: "/assets/app-icon-192.png",
  },
};
export const viewport: Viewport = {
  themeColor: "#103b30",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
