"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type PendingBusiness = {
  id: string;
  owner_id: string;
  name: string;
  website: string | null;
  category: string;
  description: string;
  revenue_monthly: number;
  asking_price: number;
  stake_percent: number;
  status: string;
};

type PendingOffer = {
  id: string;
  business_id: string;
  buyer_id: string;
  amount: number;
  message: string | null;
  status: string;
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(null);
  const [businesses, setBusinesses] = useState<PendingBusiness[]>([]);
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [notice, setNotice] = useState("");

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) { setAuthorized(false); return; }
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setAuthorized(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).single();
    if (profile?.role !== "admin") { setAuthorized(false); return; }
    setAuthorized(true);
    const [businessResult, offerResult] = await Promise.all([
      supabase.from("businesses").select("*").in("status", ["pending", "approved"]).order("created_at", { ascending: false }),
      supabase.from("offers").select("*").in("status", ["pending", "reviewing", "presented"]).order("created_at", { ascending: false }),
    ]);
    setBusinesses((businessResult.data as PendingBusiness[] | null) ?? []);
    setOffers((offerResult.data as PendingOffer[] | null) ?? []);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  async function reviewBusiness(id: string, status: "approved" | "rejected") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const reason = status === "rejected" ? window.prompt("Motivo del rechazo (visible para el vendedor):") : null;
    if (status === "rejected" && reason === null) return;
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("businesses").update({ status, rejection_reason: reason || null, reviewed_by: authData.user?.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    setNotice(error ? error.message : status === "approved" ? "Negocio aprobado y publicado." : "Negocio rechazado.");
    if (!error) loadData();
  }

  async function reviewOffer(id: string, status: "reviewing" | "presented" | "accepted" | "rejected") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("offers").update({ status, reviewed_by: authData.user?.id, reviewed_at: new Date().toISOString() }).eq("id", id);
    setNotice(error ? error.message : "Estado de la oferta actualizado.");
    if (!error) loadData();
  }

  return (
    <main className="dashboard-page admin-page">
      <header className="dashboard-header shell"><Link className="brand" href="/"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></Link><Link className="button button-outline" href="/">Ver sitio público</Link></header>
      <section className="dashboard-shell shell"><span className="eyebrow">Administración</span><h1>Revisión y ofertas.</h1>
        {authorized === null ? <div className="dashboard-notice">Verificando acceso…</div> : !authorized ? <div className="dashboard-notice"><h2>Acceso restringido.</h2><p>Esta sección es exclusiva para administradores de Compra Negocio.</p><Link className="button button-primary" href="/">Volver</Link></div> : <>
          {notice && <div className="admin-notice">{notice}</div>}
          <div className="dashboard-columns">
            <section><div className="dashboard-title"><h2>Negocios para revisar</h2><span>{businesses.filter((item) => item.status === "pending").length}</span></div>{businesses.length === 0 ? <div className="dashboard-empty">No hay publicaciones pendientes.</div> : businesses.map((business) => <article className="admin-card" key={business.id}><span className={`status status-${business.status}`}>{business.status}</span><h3>{business.name}</h3><p>{business.description}</p><dl><div><dt>Categoría</dt><dd>{business.category}</dd></div><div><dt>Ingreso mensual</dt><dd>{money.format(business.revenue_monthly)}</dd></div><div><dt>Precio</dt><dd>{money.format(business.asking_price)}</dd></div><div><dt>Participación</dt><dd>{business.stake_percent}%</dd></div></dl>{business.website && <a href={business.website} target="_blank" rel="noreferrer">Revisar sitio ↗</a>}<div className="admin-actions"><button className="button button-primary" onClick={() => reviewBusiness(business.id, "approved")}>Aprobar</button><button className="button button-danger" onClick={() => reviewBusiness(business.id, "rejected")}>Rechazar</button></div></article>)}</section>
            <section><div className="dashboard-title"><h2>Ofertas recibidas</h2><span>{offers.length}</span></div>{offers.length === 0 ? <div className="dashboard-empty">No hay ofertas pendientes.</div> : offers.map((offer) => <article className="admin-card" key={offer.id}><span className={`status status-${offer.status}`}>{offer.status}</span><h3>{money.format(offer.amount)}</h3><p>{offer.message || "Sin mensaje adicional."}</p><small>Negocio: {offer.business_id}</small><div className="admin-actions wrap"><button className="button button-outline" onClick={() => reviewOffer(offer.id, "reviewing")}>Revisando</button><button className="button button-primary" onClick={() => reviewOffer(offer.id, "presented")}>Presentar</button><button className="button button-danger" onClick={() => reviewOffer(offer.id, "rejected")}>Rechazar</button></div></article>)}</section>
          </div>
        </>}
      </section>
    </main>
  );
}
