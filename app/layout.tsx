import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Compra Negocio | Negocios digitales en movimiento",
  description:
    "Marketplace para comprar participaciones o negocios digitales completos con ofertas privadas e intermediación profesional.",
  applicationName: "Compra Negocio",
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
