"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { documentKindLabel, formatFileSize, type DocumentKind } from "@/lib/marketplace";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type ProfileSummary = {
  id: string;
  full_name: string | null;
  email: string;
  country: string | null;
  organization_name: string | null;
};

type DocumentRow = {
  id: string;
  business_id: string;
  storage_path: string;
  original_name: string;
  document_kind: DocumentKind;
  size_bytes: number;
  created_at: string;
};

type PendingBusiness = {
  id: string;
  owner_id: string;
  name: string;
  website: string | null;
  category: string;
  description: string;
  revenue_monthly: number;
  expenses_monthly: number;
  profit_monthly: number;
  asking_price: number;
  estimated_valuation: number;
  stake_percent: number;
  age_months: number;
  active_users: number;
  reason_for_sale: string;
  valuation_basis: string;
  review_feedback: string | null;
  internal_notes: string | null;
  status: string;
  owner: ProfileSummary | ProfileSummary[] | null;
  business_documents: DocumentRow[] | null;
};

type OfferBusiness = {
  id: string;
  name: string;
  owner_id: string;
  seller: ProfileSummary | ProfileSummary[] | null;
};

type PendingOffer = {
  id: string;
  business_id: string;
  buyer_id: string;
  amount: number;
  final_amount: number | null;
  message: string | null;
  internal_notes: string | null;
  status: string;
  closed_at: string | null;
  business: OfferBusiness | OfferBusiness[] | null;
  buyer: ProfileSummary | ProfileSummary[] | null;
};

type BusinessRecord = Omit<PendingBusiness, "owner" | "business_documents">;
type OfferRecord = Omit<PendingOffer, "business" | "buyer">;

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

const statusLabel: Record<string, string> = {
  pending: "Pendiente",
  changes_requested: "Cambios solicitados",
  approved: "Publicado",
  rejected: "Rechazado",
  sold: "Vendido",
  reviewing: "En revisión",
  negotiating: "Negociando",
  presented: "Presentada",
  accepted: "Aceptada",
  closed: "Cerrada",
};

function firstRelation<T>(relation: T | T[] | null) {
  return Array.isArray(relation) ? relation[0] ?? null : relation;
}

function ProfileCard({ label, profile }: { label: string; profile: ProfileSummary | null }) {
  return (
    <div className="party-card">
      <span>{label}</span>
      <b>{profile?.full_name || "Nombre no informado"}</b>
      <a href={profile?.email ? `mailto:${profile.email}` : undefined}>{profile?.email || "Sin correo"}</a>
      <small>{[profile?.country, profile?.organization_name].filter(Boolean).join(" · ") || "Sin datos adicionales"}</small>
    </div>
  );
}

export default function AdminPage() {
  const [authorized, setAuthorized] = useState<boolean | null>(() => getSupabaseBrowserClient() ? null : false);
  const [businesses, setBusinesses] = useState<PendingBusiness[]>([]);
  const [offers, setOffers] = useState<PendingOffer[]>([]);
  const [businessNotes, setBusinessNotes] = useState<Record<string, string>>({});
  const [offerNotes, setOfferNotes] = useState<Record<string, string>>({});
  const [notice, setNotice] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data: authData } = await supabase.auth.getUser();
    if (!authData.user) { setAuthorized(false); return; }
    const { data: profile } = await supabase.from("profiles").select("role").eq("id", authData.user.id).single();
    if (profile?.role !== "admin") { setAuthorized(false); return; }
    setAuthorized(true);

    const [businessResult, offerResult, profileResult, documentResult] = await Promise.all([
      supabase.rpc("get_admin_businesses"),
      supabase.rpc("get_admin_offers"),
      supabase.from("profiles").select("id,full_name,email,country,organization_name"),
      supabase
        .from("business_documents")
        .select("id,business_id,storage_path,original_name,document_kind,size_bytes,created_at")
        .order("created_at", { ascending: false }),
    ]);

    if (businessResult.error || offerResult.error || profileResult.error || documentResult.error) {
      setNotice(
        businessResult.error?.message
        || offerResult.error?.message
        || profileResult.error?.message
        || documentResult.error?.message
        || "No se pudo cargar el panel.",
      );
      return;
    }

    const profiles = (profileResult.data as ProfileSummary[] | null) ?? [];
    const documents = (documentResult.data as unknown as DocumentRow[] | null) ?? [];
    const rawBusinesses = (businessResult.data as unknown as BusinessRecord[] | null) ?? [];
    const rawOffers = (offerResult.data as unknown as OfferRecord[] | null) ?? [];
    const profileById = new Map(profiles.map((profileItem) => [profileItem.id, profileItem]));
    const documentsByBusiness = new Map<string, DocumentRow[]>();

    for (const document of documents) {
      const current = documentsByBusiness.get(document.business_id) ?? [];
      current.push(document);
      documentsByBusiness.set(document.business_id, current);
    }

    const loadedBusinesses: PendingBusiness[] = rawBusinesses.map((business) => ({
      ...business,
      owner: profileById.get(business.owner_id) ?? null,
      business_documents: documentsByBusiness.get(business.id) ?? [],
    }));
    const businessById = new Map(loadedBusinesses.map((business) => [business.id, business]));
    const loadedOffers: PendingOffer[] = rawOffers.map((offer) => {
      const relatedBusiness = businessById.get(offer.business_id);
      return {
        ...offer,
        buyer: profileById.get(offer.buyer_id) ?? null,
        business: relatedBusiness ? {
          id: relatedBusiness.id,
          name: relatedBusiness.name,
          owner_id: relatedBusiness.owner_id,
          seller: profileById.get(relatedBusiness.owner_id) ?? null,
        } : null,
      };
    });
    setBusinesses(loadedBusinesses);
    setOffers(loadedOffers);
    setBusinessNotes(Object.fromEntries(loadedBusinesses.map((item) => [item.id, item.internal_notes ?? ""])));
    setOfferNotes(Object.fromEntries(loadedOffers.map((item) => [item.id, item.internal_notes ?? ""])));
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadData(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadData]);

  async function reviewBusiness(id: string, status: "approved" | "changes_requested" | "rejected") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;

    const feedback = status === "changes_requested"
      ? window.prompt("Indicá exactamente qué debe corregir el vendedor:")
      : status === "rejected"
        ? window.prompt("Motivo del rechazo (visible para el vendedor):")
        : null;

    if (status !== "approved" && !feedback?.trim()) return;
    setBusyId(id);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("businesses").update({
      status,
      review_feedback: status === "approved" ? null : feedback?.trim(),
      rejection_reason: status === "rejected" ? feedback?.trim() : null,
      correction_requested_at: status === "changes_requested" ? new Date().toISOString() : null,
      reviewed_by: authData.user?.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);

    setBusyId(null);
    setNotice(error ? error.message : status === "approved" ? "Negocio aprobado y publicado." : status === "changes_requested" ? "Correcciones solicitadas al vendedor." : "Negocio rechazado.");
    if (!error) await loadData();
  }

  async function saveBusinessNotes(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.from("businesses").update({ internal_notes: businessNotes[id]?.trim() || null }).eq("id", id);
    setBusyId(null);
    setNotice(error ? error.message : "Notas internas del negocio guardadas.");
  }

  async function reviewOffer(id: string, status: "reviewing" | "negotiating" | "presented" | "accepted" | "rejected" | "closed") {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const offer = offers.find((item) => item.id === id);
    let finalAmount: number | null = null;

    if (status === "closed") {
      const answer = window.prompt("Monto final acordado en USD:", String(offer?.final_amount ?? offer?.amount ?? ""));
      if (answer === null) return;
      finalAmount = Number(answer);
      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        setNotice("Ingresá un monto final válido para cerrar la operación.");
        return;
      }
    }

    setBusyId(id);
    const { data: authData } = await supabase.auth.getUser();
    const { error } = await supabase.from("offers").update({
      status,
      internal_notes: offerNotes[id]?.trim() || null,
      final_amount: status === "closed" ? finalAmount : offer?.final_amount ?? null,
      reviewed_by: authData.user?.id,
      reviewed_at: new Date().toISOString(),
    }).eq("id", id);

    setBusyId(null);
    setNotice(error ? error.message : status === "closed" ? "Operación cerrada y negocio marcado como vendido." : "Estado de la oferta actualizado.");
    if (!error) await loadData();
  }

  async function saveOfferNotes(id: string) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyId(id);
    const { error } = await supabase.from("offers").update({ internal_notes: offerNotes[id]?.trim() || null }).eq("id", id);
    setBusyId(null);
    setNotice(error ? error.message : "Notas de negociación guardadas.");
  }

  async function downloadDocument(document: DocumentRow) {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    setBusyId(document.id);
    const { data, error } = await supabase.storage.from("business-documents").download(document.storage_path);
    setBusyId(null);
    if (error || !data) {
      setNotice(error?.message || "No se pudo descargar el comprobante.");
      return;
    }

    const url = URL.createObjectURL(data);
    const anchor = window.document.createElement("a");
    anchor.href = url;
    anchor.download = document.original_name;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  const pendingBusinesses = businesses.filter((item) => item.status === "pending" || item.status === "changes_requested").length;
  const activeOffers = offers.filter((item) => ["pending", "reviewing", "negotiating", "presented", "accepted"].includes(item.status)).length;
  const closedOffers = offers.filter((item) => item.status === "closed").length;

  return (
    <main className="dashboard-page admin-page">
      <header className="dashboard-header shell">
        <Link className="brand" href="/"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></Link>
        <Link className="button button-outline" href="/">Ver sitio público</Link>
      </header>
      <section className="dashboard-shell shell">
        <span className="eyebrow">Administración</span>
        <h1>Operaciones y revisión.</h1>
        {authorized === null ? <div className="dashboard-notice">Verificando acceso…</div> : !authorized ? <div className="dashboard-notice"><h2>Acceso restringido.</h2><p>Esta sección es exclusiva para administradores de Compra Negocio.</p><Link className="button button-primary" href="/">Volver</Link></div> : <>
          {notice && <div className="admin-notice">{notice}</div>}
          <div className="admin-summary">
            <article><span>Por revisar</span><b>{pendingBusinesses}</b></article>
            <article><span>Ofertas activas</span><b>{activeOffers}</b></article>
            <article><span>Operaciones cerradas</span><b>{closedOffers}</b></article>
          </div>

          <section className="admin-section">
            <div className="dashboard-title"><div><span className="modal-label">Publicaciones</span><h2>Negocios y vendedores</h2></div><span>{businesses.length}</span></div>
            {businesses.length === 0 ? <div className="dashboard-empty">No hay publicaciones para revisar.</div> : businesses.map((business) => {
              const owner = firstRelation(business.owner);
              const documents = business.business_documents ?? [];
              return <article className="admin-card admin-card-wide" key={business.id}>
                <div className="admin-card-heading"><div><span className={`status status-${business.status}`}>{statusLabel[business.status] ?? business.status}</span><h3>{business.name}</h3><p>{business.category} · {business.age_months} meses de actividad</p></div><ProfileCard label="Vendedor" profile={owner} /></div>
                <p className="admin-description">{business.description}</p>
                <dl className="admin-metrics">
                  <div><dt>Ingreso mensual</dt><dd>{money.format(business.revenue_monthly)}</dd></div>
                  <div><dt>Gastos mensuales</dt><dd>{money.format(business.expenses_monthly)}</dd></div>
                  <div><dt>Ganancia mensual</dt><dd>{money.format(business.profit_monthly)}</dd></div>
                  <div><dt>Usuarios activos</dt><dd>{business.active_users}</dd></div>
                  <div><dt>Valoración total</dt><dd>{money.format(business.estimated_valuation)}</dd></div>
                  <div><dt>Oferta publicada</dt><dd>{business.stake_percent}% · {money.format(business.asking_price)}</dd></div>
                </dl>
                <div className="admin-detail-grid"><div><span>Motivo de venta</span><p>{business.reason_for_sale}</p></div><div><span>Criterio de valoración</span><p>{business.valuation_basis}</p></div></div>
                {business.website && <a className="admin-external-link" href={business.website} target="_blank" rel="noreferrer">Revisar sitio privado ↗</a>}
                <div className="document-panel"><div><span>Comprobantes privados</span><b>{documents.length}</b></div>{documents.length === 0 ? <p>El vendedor todavía no adjuntó documentación.</p> : <ul>{documents.map((document) => <li key={document.id}><div><b>{document.original_name}</b><small>{documentKindLabel[document.document_kind] ?? document.document_kind} · {formatFileSize(document.size_bytes)}</small></div><button className="button button-outline" disabled={busyId === document.id} onClick={() => downloadDocument(document)}>Descargar</button></li>)}</ul>}</div>
                <label className="admin-notes">Notas internas del negocio<textarea rows={3} value={businessNotes[business.id] ?? ""} onChange={(event) => setBusinessNotes((current) => ({ ...current, [business.id]: event.target.value }))} placeholder="Observaciones que sólo verá el equipo." /><button className="text-action" disabled={busyId === business.id} onClick={() => saveBusinessNotes(business.id)}>Guardar notas</button></label>
                {business.review_feedback && <div className="review-feedback"><b>Último pedido al vendedor</b><p>{business.review_feedback}</p></div>}
                <div className="admin-actions wrap">
                  <button className="button button-primary" disabled={busyId === business.id} onClick={() => reviewBusiness(business.id, "approved")}>Aprobar y publicar</button>
                  <button className="button button-outline" disabled={busyId === business.id} onClick={() => reviewBusiness(business.id, "changes_requested")}>Solicitar correcciones</button>
                  <button className="button button-danger" disabled={busyId === business.id} onClick={() => reviewBusiness(business.id, "rejected")}>Rechazar</button>
                </div>
              </article>;
            })}
          </section>

          <section className="admin-section">
            <div className="dashboard-title"><div><span className="modal-label">Negociación</span><h2>Ofertas y cierres</h2></div><span>{offers.length}</span></div>
            {offers.length === 0 ? <div className="dashboard-empty">No hay ofertas recibidas.</div> : offers.map((offer) => {
              const business = firstRelation(offer.business);
              const buyer = firstRelation(offer.buyer);
              const seller = business ? firstRelation(business.seller) : null;
              return <article className="admin-card admin-card-wide" key={offer.id}>
                <div className="offer-heading"><div><span className={`status status-${offer.status}`}>{statusLabel[offer.status] ?? offer.status}</span><h3>{business?.name ?? "Negocio"}</h3><p>Oferta inicial: <b>{money.format(offer.amount)}</b>{offer.final_amount ? ` · Cierre: ${money.format(offer.final_amount)}` : ""}</p></div></div>
                <div className="party-grid"><ProfileCard label="Comprador" profile={buyer} /><ProfileCard label="Vendedor" profile={seller} /></div>
                <div className="offer-message"><span>Mensaje del comprador</span><p>{offer.message || "Sin mensaje adicional."}</p></div>
                <label className="admin-notes">Notas internas y negociación<textarea rows={4} value={offerNotes[offer.id] ?? ""} onChange={(event) => setOfferNotes((current) => ({ ...current, [offer.id]: event.target.value }))} placeholder="Condiciones, contraofertas, llamadas y próximos pasos." /><button className="text-action" disabled={busyId === offer.id} onClick={() => saveOfferNotes(offer.id)}>Guardar notas</button></label>
                <div className="admin-actions wrap">
                  <button className="button button-outline" disabled={busyId === offer.id} onClick={() => reviewOffer(offer.id, "reviewing")}>En revisión</button>
                  <button className="button button-outline" disabled={busyId === offer.id} onClick={() => reviewOffer(offer.id, "negotiating")}>Negociar</button>
                  <button className="button button-outline" disabled={busyId === offer.id} onClick={() => reviewOffer(offer.id, "presented")}>Presentar al vendedor</button>
                  <button className="button button-primary" disabled={busyId === offer.id} onClick={() => reviewOffer(offer.id, "accepted")}>Aceptar</button>
                  <button className="button button-danger" disabled={busyId === offer.id} onClick={() => reviewOffer(offer.id, "rejected")}>Rechazar</button>
                  <button className="button button-dark" disabled={busyId === offer.id || offer.status === "closed"} onClick={() => reviewOffer(offer.id, "closed")}>{offer.status === "closed" ? "Operación cerrada" : "Cerrar operación"}</button>
                </div>
              </article>;
            })}
          </section>
        </>}
      </section>
    </main>
  );
}
