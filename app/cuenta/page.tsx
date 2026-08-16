"use client";

import Link from "next/link";
import { FormEvent, useCallback, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import {
  documentKindLabel,
  formatFileSize,
  type DocumentKind,
  uploadBusinessDocuments,
  validateDocumentFiles,
  validatePublicBusinessText,
} from "@/lib/marketplace";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type DocumentRow = {
  id: string;
  business_id: string;
  storage_path: string;
  original_name: string;
  document_kind: DocumentKind;
  size_bytes: number;
};

type BusinessRow = {
  id: string;
  name: string;
  website: string | null;
  category: string;
  description: string;
  revenue_monthly: number;
  expenses_monthly: number;
  profit_monthly: number;
  age_months: number;
  active_users: number;
  estimated_valuation: number;
  reason_for_sale: string;
  valuation_basis: string;
  stake_percent: number;
  asking_price: number;
  status: string;
  review_feedback: string | null;
  rejection_reason: string | null;
  created_at: string;
  business_documents: DocumentRow[] | null;
};

type OfferRow = {
  id: string;
  amount: number;
  final_amount: number | null;
  status: string;
  created_at: string;
  businesses: { name: string } | { name: string }[] | null;
};

const statusLabel: Record<string, string> = {
  pending: "Pendiente de revisión",
  changes_requested: "Necesita correcciones",
  approved: "Publicado",
  rejected: "Rechazado",
  sold: "Vendido",
  archived: "Archivado",
  reviewing: "En revisión",
  negotiating: "En negociación",
  presented: "Presentada al vendedor",
  accepted: "Aceptada",
  closed: "Operación cerrada",
  withdrawn: "Retirada",
};

const money = new Intl.NumberFormat("es-AR", { style: "currency", currency: "USD", maximumFractionDigits: 0 });

export default function AccountPage() {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [businesses, setBusinesses] = useState<BusinessRow[]>([]);
  const [offers, setOffers] = useState<OfferRow[]>([]);
  const [loading, setLoading] = useState(() => getSupabaseBrowserClient() !== null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const loadAccount = useCallback(async () => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const { data } = await supabase.auth.getUser();
    setUser(data.user);
    if (!data.user) { setLoading(false); return; }
    const [profileResult, businessResult, offerResult, documentResult] = await Promise.all([
      supabase.from("profiles").select("role").eq("id", data.user.id).single(),
      supabase.rpc("get_my_businesses"),
      supabase
        .from("offers")
        .select("id,amount,final_amount,status,created_at,businesses(name)")
        .eq("buyer_id", data.user.id)
        .order("created_at", { ascending: false }),
      supabase
        .from("business_documents")
        .select("id,business_id,storage_path,original_name,document_kind,size_bytes")
        .eq("owner_id", data.user.id),
    ]);
    if (profileResult.error || businessResult.error || offerResult.error || documentResult.error) {
      setNotice(profileResult.error?.message || businessResult.error?.message || offerResult.error?.message || documentResult.error?.message || "No se pudo cargar tu cuenta.");
      setLoading(false);
      return;
    }

    setIsAdmin(profileResult.data?.role === "admin");
    const documents = (documentResult.data as unknown as DocumentRow[] | null) ?? [];
    const documentsByBusiness = new Map<string, DocumentRow[]>();
    for (const document of documents) {
      const current = documentsByBusiness.get(document.business_id) ?? [];
      current.push(document);
      documentsByBusiness.set(document.business_id, current);
    }
    const loadedBusinesses = ((businessResult.data as unknown as Omit<BusinessRow, "business_documents">[] | null) ?? []).map((business) => ({
      ...business,
      business_documents: documentsByBusiness.get(business.id) ?? [],
    }));
    setBusinesses(loadedBusinesses);
    setOffers((offerResult.data as unknown as OfferRow[] | null) ?? []);
    setLoading(false);
  }, []);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => { void loadAccount(); }, 0);
    return () => window.clearTimeout(timeoutId);
  }, [loadAccount]);

  async function resubmitBusiness(event: FormEvent<HTMLFormElement>, business: BusinessRow) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get("description"));
    const reasonForSale = String(data.get("reasonForSale"));
    const valuationBasis = String(data.get("valuationBasis"));
    const files = data.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0);
    const contactError = validatePublicBusinessText([description, reasonForSale, valuationBasis]);
    const fileError = validateDocumentFiles(files);

    if (contactError || fileError) {
      setNotice(contactError ?? fileError ?? "Revisá los datos ingresados.");
      return;
    }

    setBusyId(business.id);
    setNotice("");
    const { error } = await supabase.from("businesses").update({
      name: String(data.get("name")),
      website: String(data.get("website") || "") || null,
      category: String(data.get("category")),
      description,
      revenue_monthly: Number(data.get("revenue")),
      expenses_monthly: Number(data.get("expenses")),
      profit_monthly: Number(data.get("profit")),
      age_months: Number(data.get("ageMonths")),
      active_users: Number(data.get("activeUsers")),
      estimated_valuation: Number(data.get("valuation")),
      reason_for_sale: reasonForSale,
      valuation_basis: valuationBasis,
      asking_price: Number(data.get("price")),
      stake_percent: Number(data.get("stake")),
      status: "pending",
    }).eq("id", business.id);

    if (error) {
      setBusyId(null);
      setNotice(error.message);
      return;
    }

    try {
      if (files.length > 0) {
        await uploadBusinessDocuments({
          supabase,
          userId: user.id,
          businessId: business.id,
          files,
          kind: String(data.get("documentKind")) as DocumentKind,
        });
      }
      setNotice("Cambios enviados. El negocio volvió a la fila de revisión.");
      setEditingId(null);
      await loadAccount();
    } catch (uploadError) {
      setNotice(`Los cambios se guardaron, pero un archivo no pudo subirse. ${uploadError instanceof Error ? uploadError.message : ""}`);
    } finally {
      setBusyId(null);
    }
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

  return (
    <main className="dashboard-page">
      <header className="dashboard-header shell"><Link className="brand" href="/"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></Link><div className="dashboard-header-actions">{isAdmin && <Link className="button button-primary" href="/admin">Panel admin</Link>}<Link className="button button-outline" href="/">Volver al mercado</Link></div></header>
      <section className="dashboard-shell shell">
        <span className="eyebrow">Mi cuenta</span>
        <h1>Tu actividad.</h1>
        {notice && <div className="admin-notice">{notice}</div>}
        {loading ? <div className="dashboard-notice">Cargando información…</div> : !user ? <div className="dashboard-notice"><h2>Necesitás ingresar.</h2><p>Volvé al inicio y usá el botón Ingresar.</p><Link className="button button-primary" href="/">Ir al inicio</Link></div> : (
          <>
            <p className="account-email">Sesión iniciada como {user.email}</p>
            <div className="account-sections">
              <section>
                <div className="dashboard-title"><h2>Negocios enviados</h2><span>{businesses.length}</span></div>
                {businesses.length === 0 ? <div className="dashboard-empty">Todavía no enviaste ningún negocio.</div> : businesses.map((business) => {
                  const documents = business.business_documents ?? [];
                  const editable = business.status === "changes_requested" || business.status === "pending";
                  return <article className="dashboard-card account-business-card" key={business.id}>
                    <div className="account-business-heading"><div><span className={`status status-${business.status}`}>{statusLabel[business.status] ?? business.status}</span><h3>{business.name}</h3><p>{business.stake_percent}% en venta · {money.format(business.asking_price)}</p></div><button className="button button-outline" disabled={!editable} onClick={() => setEditingId(editingId === business.id ? null : business.id)}>{editingId === business.id ? "Cerrar edición" : business.status === "changes_requested" ? "Corregir y reenviar" : "Editar publicación"}</button></div>
                    {business.review_feedback && <div className="review-feedback"><b>El equipo necesita estos cambios</b><p>{business.review_feedback}</p></div>}
                    {business.rejection_reason && <div className="review-feedback danger-feedback"><b>Motivo del rechazo</b><p>{business.rejection_reason}</p></div>}
                    <div className="account-documents"><span>Comprobantes privados: {documents.length}</span>{documents.length > 0 && <ul>{documents.map((document) => <li key={document.id}><button disabled={busyId === document.id} onClick={() => downloadDocument(document)}>{document.original_name} · {documentKindLabel[document.document_kind]} · {formatFileSize(document.size_bytes)}</button></li>)}</ul>}</div>
                    {editingId === business.id && <form className="form form-grid correction-form" onSubmit={(event) => resubmitBusiness(event, business)}>
                      <label>Nombre del negocio<input name="name" required minLength={2} defaultValue={business.name} /></label>
                      <label>Sitio web, si existe<input name="website" type="url" defaultValue={business.website ?? ""} /></label>
                      <label>Categoría<select name="category" required defaultValue={business.category}><option>SaaS</option><option>Herramienta</option><option>Producto digital</option><option>Marketplace</option><option>Contenido</option><option>Otro</option></select></label>
                      <label>Antigüedad en meses<input name="ageMonths" type="number" min="0" max="1200" step="1" required defaultValue={business.age_months} /></label>
                      <label>Ingreso mensual en USD<input name="revenue" type="number" min="0" step="0.01" required defaultValue={business.revenue_monthly} /></label>
                      <label>Gastos mensuales en USD<input name="expenses" type="number" min="0" step="0.01" required defaultValue={business.expenses_monthly} /></label>
                      <label>Ganancia mensual en USD<input name="profit" type="number" step="0.01" required defaultValue={business.profit_monthly} /></label>
                      <label>Usuarios o clientes activos<input name="activeUsers" type="number" min="0" step="1" required defaultValue={business.active_users} /></label>
                      <label>Porcentaje a vender<input name="stake" type="number" min="0.01" max="100" step="0.01" required defaultValue={business.stake_percent} /></label>
                      <label>Precio esperado en USD<input name="price" type="number" min="1" step="0.01" required defaultValue={business.asking_price} /></label>
                      <label className="wide">Valoración total estimada en USD<input name="valuation" type="number" min="1" step="0.01" required defaultValue={business.estimated_valuation} /></label>
                      <label className="wide">Descripción pública<textarea name="description" required minLength={20} rows={4} defaultValue={business.description} /><small>Sin correos, teléfonos, enlaces ni usuarios de redes.</small></label>
                      <label className="wide">Motivo de venta<textarea name="reasonForSale" required minLength={10} maxLength={1500} rows={3} defaultValue={business.reason_for_sale} /></label>
                      <label className="wide">Cómo calculaste la valoración<textarea name="valuationBasis" required minLength={20} maxLength={2000} rows={4} defaultValue={business.valuation_basis} /></label>
                      <label>Tipo de nuevo comprobante<select name="documentKind" defaultValue="revenue">{Object.entries(documentKindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                      <label>Agregar comprobantes<input name="documents" type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx" /></label>
                      <p className="private-upload-note wide">Los archivos anteriores se conservan. Podés agregar hasta 6 nuevos comprobantes.</p>
                      <button className="button button-primary full wide" disabled={busyId === business.id}>{busyId === business.id ? "Enviando…" : "Guardar y reenviar a revisión"}</button>
                    </form>}
                  </article>;
                })}
              </section>
              <section>
                <div className="dashboard-title"><h2>Ofertas realizadas</h2><span>{offers.length}</span></div>
                {offers.length === 0 ? <div className="dashboard-empty">Todavía no realizaste ofertas.</div> : offers.map((offer) => { const relation = Array.isArray(offer.businesses) ? offer.businesses[0] : offer.businesses; return <article className="dashboard-card" key={offer.id}><div><span className={`status status-${offer.status}`}>{statusLabel[offer.status] ?? offer.status}</span><h3>{relation?.name ?? "Negocio"}</h3><p>Oferta: {money.format(offer.amount)}{offer.final_amount ? ` · Cierre: ${money.format(offer.final_amount)}` : ""}</p></div></article>; })}
              </section>
            </div>
          </>
        )}
      </section>
    </main>
  );
}
