import type { Metadata } from "next";
import MarketplaceShell from "@/components/MarketplaceShell";

export const metadata: Metadata = {
  title: "Cómo funciona | Compra Negocio",
  description: "Conocé cada etapa para comprar o vender un negocio digital.",
};

export default function HowItWorksPage() {
  return <MarketplaceShell view="how" />;
}

