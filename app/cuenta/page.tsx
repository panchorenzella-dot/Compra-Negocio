"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type BusinessRow = {
  id: string;
  name: string;
  stake_percent: number;
  asking_price: number;
  status: string;
  rejection_reason: string | null;
  created_at: string;
};

type OfferRow = {
  id: string;
  amount: number;
  status: string;
  created_at: string;
  businesses: { name: string } | { name: string }[] | null;
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  approved: "Aprobado",
  rejected: "Rechazado",
  sold: "Vendido",
  archived: "Archivado",
  reviewing: "En revisión",
  presented: "Presentada",
  accepted: "Aceptada",
  withdrawn: "Retirada",
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(() => getSupabaseBrowserClient() !== null);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    supabase.auth.getUser().then(async ({ data }) => {
      setUser(data.user);
      if (!data.user) { setLoading(false); return; }
      const [businessResult, offerResult] = await Promise.all([
        supabase.from("businesses").select("id,name,stake_percent,asking_price,status,rejection_reason,created_at").eq("owner_id", data.user.id).order("created_at", { ascending: false }),
        supabase.from("offers").select("id,amount,status,created_at,businesses(name)").eq("buyer_id", data.user.id).order("created_at", { ascending: false }),
      ]);
      setBusinesses((businessResult.data as BusinessRow[] | null) ?? []);
      setOffers((offerResult.data as unknown as OfferRow[] | null) ?? []);
      setLoading(false);
    });
  }, []);

  return (
    <main className="dashboard-page">
      <header className="dashboard-header shell"><Link className="brand" href="/"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></Link><Link className="button button-outline" href="/">Volver al mercado</Link></header>
      <section className="dashboard-shell shell">
        <span className="eyebrow">Mi cuenta</span>
        <h1>Tu actividad.</h1>
        {loading ? <div className="dashboard-notice">Cargando información…</div> : !user ? <div className="dashboard-notice"><h2>Necesitás ingresar.</h2><p>Volvé al inicio y usá el botón Ingresar.</p><Link className="button button-primary" href="/">Ir al inicio</Link></div> : (
          <>
            <p className="account-email">Sesión iniciada como {user.email}</p>
            <div className="dashboard-columns">
              <section><div className="dashboard-title"><h2>Negocios enviados</h2><span>{businesses.length}</span></div>{businesses.length === 0 ? <div className="dashboard-empty">Todavía no enviaste ningún negocio.</div> : businesses.map((business) => <article className="dashboard-card" key={business.id}><div><span className={`status status-${business.status}`}>{statusLabel[business.status] ?? business.status}</span><h3>{business.name}</h3><p>{business.stake_percent}% en venta · {money.format(business.asking_price)}</p>{business.rejection_reason && <small>Motivo: {business.rejection_reason}</small>}</div></article>)}</section>
              <section><div className="dashboard-title"><h2>Ofertas realizadas</h2><span>{offers.length}</span></div>{offers.length === 0 ? <div className="dashboard-empty">Todavía no realizaste ofertas.</div> : offers.map((offer) => { const relation = Array.isArray(offer.businesses) ? offer.businesses[0] : offer.businesses; return <article className="dashboard-card" key={offer.id}><div><span className={`status status-${offer.status}`}>{statusLabel[offer.status] ?? offer.status}</span><h3>{relation?.name ?? "Negocio"}</h3><p>Oferta: {money.format(offer.amount)}</p></div></article>; })}</section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
