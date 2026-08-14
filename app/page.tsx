"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";

type Business = {
  id: string;
  name: string;
  category: string;
  description: string;
  revenue_monthly: number;
  asking_price: number;
  stake_percent: number;
};

type Modal = "none" | "auth" | "sell" | "offer";

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [modal, setModal] = useState<Modal>("none");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [user, setUser] = useState<User | null>(null);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(true);
  const [formState, setFormState] = useState<"idle" | "loading" | "success">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setLoadingMarket(false);
      return;
    }

    supabase.auth.getUser().then(({ data }) => setUser(data.user));
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    supabase
      .from("businesses")
      .select("id,name,category,description,revenue_monthly,asking_price,stake_percent")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBusinesses((data as Business[] | null) ?? []);
        setLoadingMarket(false);
      });

    return () => authListener.subscription.unsubscribe();
  }, []);

  function openAuth(mode: "register" | "login") {
    setAuthMode(mode);
    setMessage("");
    setFormState("idle");
    setModal("auth");
  }

  function openSell() {
    if (!user) {
      openAuth("register");
      setMessage("Creá una cuenta para enviar tu negocio a revisión.");
      return;
    }
    setMessage("");
    setFormState("idle");
    setModal("sell");
  }

  function openOffer(business: Business) {
    if (!user) {
      openAuth("register");
      setMessage("Registrate para realizar una oferta privada.");
      return;
    }
    setSelectedBusiness(business);
    setMessage("");
    setFormState("idle");
    setModal("offer");
  }

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("El registro se habilitará cuando terminemos de conectar la base de datos.");
      return;
    }

    const data = new FormData(event.currentTarget);
    const email = String(data.get("email"));
    const password = String(data.get("password"));
    const fullName = String(data.get("fullName") ?? "");
    setFormState("loading");
    setMessage("");

    const result = authMode === "register"
      ? await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName } } })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(result.error.message);
      setFormState("idle");
      return;
    }

    setFormState("success");
    setMessage(authMode === "register" && !result.data.session
      ? "Revisá tu correo para confirmar la cuenta."
      : "Ingresaste correctamente.");
  }

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const data = new FormData(event.currentTarget);
    setFormState("loading");
    setMessage("");

    const { error } = await supabase.from("businesses").insert({
      owner_id: user.id,
      name: String(data.get("name")),
      website: String(data.get("website") || "") || null,
      category: String(data.get("category")),
      description: String(data.get("description")),
      revenue_monthly: Number(data.get("revenue")),
      asking_price: Number(data.get("price")),
      stake_percent: Number(data.get("stake")),
      status: "pending",
    });

    if (error) {
      setMessage(error.message);
      setFormState("idle");
      return;
    }
    setFormState("success");
    setMessage("Recibimos el negocio. Quedó pendiente de revisión y todavía no es público.");
  }

  async function submitOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user || !selectedBusiness) return;
    const data = new FormData(event.currentTarget);
    setFormState("loading");
    setMessage("");

    const { error } = await supabase.from("offers").insert({
      business_id: selectedBusiness.id,
      buyer_id: user.id,
      amount: Number(data.get("amount")),
      message: String(data.get("offerMessage") || "") || null,
      status: "pending",
    });

    if (error) {
      setMessage(error.message);
      setFormState("idle");
      return;
    }
    setFormState("success");
    setMessage("La oferta llegó a Compra Negocio. El vendedor no recibió tus datos de contacto.");
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
  }

  return (
    <main>
      <header className="site-header shell" id="inicio">
        <a className="brand" href="#inicio" aria-label="Compra Negocio, inicio">
          <span className="brand-mark"><span>C</span><span>N</span></span>
          <span className="brand-name">Compra Negocio</span>
        </a>
        <nav aria-label="Navegación principal">
          <a href="#oportunidades">Oportunidades</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#seguridad">Seguridad</a>
        </nav>
        <div className="header-actions">
          {user ? (
            <><Link className="text-link" href="/cuenta">Mi cuenta</Link><button className="plain-button" onClick={signOut}>Salir</button></>
          ) : (
            <><button className="plain-button" onClick={() => openAuth("login")}>Ingresar</button><button className="button button-outline" onClick={() => openAuth("register")}>Registrarme</button></>
          )}
          <button className="button button-primary" onClick={openSell}>Vender mi negocio</button>
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">Marketplace de negocios digitales</span>
          <h1>Tu próximo negocio<br />ya está <em>funcionando.</em></h1>
          <p>Comprá una participación o adquirí un negocio digital completo. Cada publicación y cada oferta es revisada por el equipo de Compra Negocio.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#oportunidades">Ver oportunidades <span>→</span></a>
            <button className="button button-outline" onClick={openSell}>Publicar un negocio</button>
          </div>
          <div className="hero-note"><span>Sin contacto directo</span><span>Sin publicaciones automáticas</span><span>Sin comisión hasta cerrar</span></div>
        </div>
        <div className="review-card">
          <span className="review-label">Proceso de publicación</span>
          <h2>Nada se publica<br />sin revisión.</h2>
          <ol>
            <li><span>1</span><div><b>El vendedor envía la información</b><p>Los datos quedan privados.</p></div></li>
            <li><span>2</span><div><b>Compra Negocio analiza</b><p>El equipo aprueba, pide cambios o rechaza.</p></div></li>
            <li><span>3</span><div><b>La oportunidad se publica</b><p>Solo con la información autorizada.</p></div></li>
          </ol>
          <div className="review-stamp"><span>CN</span><p><b>Intermediación obligatoria</b>Todas las ofertas pasan primero por el equipo.</p></div>
        </div>
      </section>

      <section className="principles">
        <div className="shell principle-grid">
          <article><span>01</span><h3>Información real</h3><p>El mercado muestra únicamente negocios enviados y aprobados.</p></article>
          <article><span>02</span><h3>Identidad protegida</h3><p>No publicamos teléfonos, correos ni redes de las partes.</p></article>
          <article><span>03</span><h3>Negociación registrada</h3><p>Consultas y ofertas quedan dentro de Compra Negocio.</p></article>
        </div>
      </section>

      <section className="market-section shell" id="oportunidades">
        <div className="section-title">
          <div><span className="eyebrow">Oportunidades aprobadas</span><h2>Negocios disponibles.</h2></div>
          <p>No usamos publicaciones de muestra. Esta sección se completa solamente con negocios revisados por nuestro equipo.</p>
        </div>

        {loadingMarket ? (
          <div className="market-empty"><span className="empty-symbol">···</span><h3>Consultando oportunidades</h3></div>
        ) : businesses.length === 0 ? (
          <div className="market-empty">
            <span className="empty-symbol">0</span>
            <h3>Todavía no hay negocios publicados.</h3>
            <p>Preferimos mostrar un mercado vacío antes que inventar información. Las primeras oportunidades aparecerán después de ser verificadas.</p>
            <button className="button button-primary" onClick={openSell}>Enviar el primer negocio</button>
          </div>
        ) : (
          <div className="real-listings">
            {businesses.map((business) => (
              <article className="real-listing" key={business.id}>
                <div className="listing-top"><span>{business.category}</span><b>{business.stake_percent}% en venta</b></div>
                <h3>{business.name}</h3>
                <p>{business.description}</p>
                <dl><div><dt>Precio solicitado</dt><dd>{money.format(business.asking_price)}</dd></div><div><dt>Ingreso mensual</dt><dd>{money.format(business.revenue_monthly)}</dd></div></dl>
                <button className="button button-primary full" onClick={() => openOffer(business)}>Realizar oferta privada</button>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="process-section" id="como-funciona">
        <div className="shell">
          <div className="section-title light-title"><div><span className="eyebrow">Cómo funciona</span><h2>Una sola mesa<br />de negociación.</h2></div><p>El comprador y el vendedor toman las decisiones. Compra Negocio organiza la información y media la comunicación.</p></div>
          <div className="steps">
            <article><span>01</span><h3>Publicación</h3><p>El vendedor propone el negocio, porcentaje y precio. El equipo revisa todo antes de publicarlo.</p></article>
            <article><span>02</span><h3>Análisis</h3><p>El comprador consulta información pública y pide datos adicionales a Compra Negocio.</p></article>
            <article><span>03</span><h3>Oferta</h3><p>La propuesta llega al panel interno. Recién después se presenta al vendedor.</p></article>
            <article><span>04</span><h3>Cierre</h3><p>La comisión se cobra cuando la operación está acordada y documentada.</p></article>
          </div>
        </div>
      </section>

      <section className="control-section shell" id="seguridad">
        <div className="control-diagram">
          <div className="side-party"><span>C</span><b>Comprador</b></div>
          <div className="connector" />
          <div className="center-party"><span className="brand-mark"><span>C</span><span>N</span></span><b>Compra Negocio</b><small>Recibe y administra</small></div>
          <div className="connector" />
          <div className="side-party"><span>V</span><b>Vendedor</b></div>
        </div>
        <div className="control-copy"><span className="eyebrow">Control de la operación</span><h2>Sin WhatsApp.<br />Sin acuerdos por afuera.</h2><p>Las partes no reciben información de contacto entre sí. Nuestro equipo responde consultas, registra ofertas y acompaña la negociación hasta el cierre.</p><ul><li>Publicaciones pendientes de aprobación</li><li>Ofertas visibles para el equipo interno</li><li>Aceptación o rechazo con historial</li><li>Datos personales protegidos</li></ul></div>
      </section>

      <section className="final-cta">
        <div className="shell final-grid"><div><span className="eyebrow">Compra Negocio</span><h2>Comprá lo que ya existe.<br />Vendé lo que construiste.</h2></div><div><p>El registro permite publicar, seguir revisiones y realizar ofertas sin compartir tus datos con la otra parte.</p><button className="button button-white" onClick={() => openAuth("register")}>Crear mi cuenta</button></div></div>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#inicio"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></a>
        <p>Marketplace intermediado de negocios digitales.</p>
        <span>© 2026 Compra Negocio</span>
      </footer>

      {modal !== "none" && (
        <div className="modal-backdrop" onMouseDown={(event) => event.target === event.currentTarget && setModal("none")}>
          <div className="modal" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setModal("none")} aria-label="Cerrar">×</button>

            {modal === "auth" && (
              <><span className="modal-label">{authMode === "register" ? "Nueva cuenta" : "Bienvenido"}</span><h2>{authMode === "register" ? "Registrate en Compra Negocio." : "Ingresá a tu cuenta."}</h2>
                {formState !== "success" ? <form className="form" onSubmit={submitAuth}>
                  {authMode === "register" && <label>Nombre completo<input name="fullName" required minLength={2} autoComplete="name" /></label>}
                  <label>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
                  <label>Contraseña<input name="password" type="password" required minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
                  {message && <p className="form-message">{message}</p>}
                  <button className="button button-primary full" disabled={formState === "loading"}>{formState === "loading" ? "Procesando…" : authMode === "register" ? "Crear cuenta" : "Ingresar"}</button>
                </form> : <div className="form-success"><span>✓</span><p>{message}</p><button className="button button-primary" onClick={() => setModal("none")}>Continuar</button></div>}
                <button className="switch-auth" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setMessage(""); setFormState("idle"); }}>{authMode === "register" ? "Ya tengo cuenta" : "Quiero registrarme"}</button>
              </>
            )}

            {modal === "sell" && (
              <><span className="modal-label">Revisión privada</span><h2>Enviá tu negocio al equipo.</h2><p className="modal-intro">Nada se publica automáticamente. Primero evaluamos la información.</p>
                {formState !== "success" ? <form className="form form-grid" onSubmit={submitBusiness}>
                  <label>Nombre del negocio<input name="name" required minLength={2} /></label>
                  <label>Sitio web, si existe<input name="website" type="url" placeholder="https://" /></label>
                  <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Seleccionar</option><option>SaaS</option><option>Herramienta</option><option>Producto digital</option><option>Marketplace</option><option>Contenido</option><option>Otro</option></select></label>
                  <label>Ingreso mensual en USD<input name="revenue" type="number" min="0" step="0.01" required /></label>
                  <label>Porcentaje a vender<input name="stake" type="number" min="0.01" max="100" step="0.01" required /></label>
                  <label>Precio esperado en USD<input name="price" type="number" min="1" step="0.01" required /></label>
                  <label className="wide">Descripción del negocio<textarea name="description" required minLength={20} rows={4} /></label>
                  {message && <p className="form-message wide">{message}</p>}
                  <button className="button button-primary full wide" disabled={formState === "loading"}>{formState === "loading" ? "Enviando…" : "Enviar para revisión"}</button>
                </form> : <div className="form-success"><span>✓</span><p>{message}</p><Link className="button button-primary" href="/cuenta">Ver mi cuenta</Link></div>}
              </>
            )}

            {modal === "offer" && selectedBusiness && (
              <><span className="modal-label">Oferta confidencial</span><h2>Oferta por {selectedBusiness.name}.</h2><p className="modal-intro">La propuesta llega primero a Compra Negocio. No compartimos tu correo con el vendedor.</p>
                {formState !== "success" ? <form className="form" onSubmit={submitOffer}>
                  <label>Monto en USD<input name="amount" type="number" min="1" step="0.01" required /></label>
                  <label>Mensaje para el equipo<textarea name="offerMessage" rows={4} placeholder="Condiciones, preguntas o información que necesitás." /></label>
                  {message && <p className="form-message">{message}</p>}
                  <button className="button button-primary full" disabled={formState === "loading"}>{formState === "loading" ? "Enviando…" : "Enviar oferta a Compra Negocio"}</button>
                </form> : <div className="form-success"><span>✓</span><p>{message}</p><Link className="button button-primary" href="/cuenta">Ver mis ofertas</Link></div>}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}
