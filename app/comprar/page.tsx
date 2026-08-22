import type { Metadata } from "next";
import MarketplaceShell from "@/components/MarketplaceShell";

export const metadata: Metadata = {
  title: "Comprar un negocio | Compra Negocio",
  description: "Conocé cómo explorar, analizar y ofertar por un negocio digital.",
};

export default function BuyPage() {
  return <MarketplaceShell view="buy" />;
}

