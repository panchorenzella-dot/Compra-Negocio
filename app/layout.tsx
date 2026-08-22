import type { Metadata, Viewport } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  metadataBase: new URL("https://www.compranegocio.com"),
  title: {
    default: "Compra Negocio | Marketplace de negocios digitales",
    template: "%s | Compra Negocio",
  },
  description:
    "Comprá participaciones o negocios digitales completos y publicá tu proyecto con privacidad y claridad.",
  applicationName: "Compra Negocio",
  keywords: ["negocios digitales", "comprar negocio", "vender negocio", "marketplace", "inversión"],
  alternates: { canonical: "/" },
  openGraph: {
    type: "website",
    locale: "es_AR",
    siteName: "Compra Negocio",
    title: "Compra Negocio | Negocios digitales en movimiento",
    description: "Un espacio para comprar, invertir o vender negocios digitales.",
    url: "/",
  },
  twitter: {
    card: "summary",
    title: "Compra Negocio",
    description: "Comprá lo que ya existe. Vendé lo que construiste.",
  },
  robots: { index: true, follow: true },
  icons: {
    icon: "/icon.svg",
    shortcut: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#0a1733",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es">
      <body>{children}</body>
      <Script src="https://www.googletagmanager.com/gtag/js?id=G-6TMNQV09RB" strategy="afterInteractive" />
      <Script id="google-analytics" strategy="afterInteractive">
        {`window.dataLayer = window.dataLayer || [];
function gtag(){dataLayer.push(arguments);}
gtag('js', new Date());
gtag('config', 'G-6TMNQV09RB');`}
      </Script>
    </html>
  );
}

