import type { Metadata } from "next";
import MarketplaceShell from "@/components/MarketplaceShell";

export const metadata: Metadata = {
  title: "Negocios disponibles | Compra Negocio",
  description: "Explorá negocios digitales y participaciones disponibles.",
};

export default function BusinessesPage() {
  return <MarketplaceShell view="businesses" />;
}

