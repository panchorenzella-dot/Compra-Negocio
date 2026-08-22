import type { Metadata } from "next";
import MarketplaceShell from "@/components/MarketplaceShell";

export const metadata: Metadata = {
  title: "Vender mi negocio | Compra Negocio",
  description: "Presentá tu negocio digital o una participación para encontrar compradores.",
};

export default function SellPage() {
  return <MarketplaceShell view="sell" />;
}

