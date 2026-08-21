"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  documentKindLabel,
  type DocumentKind,
  uploadBusinessDocuments,
  validateDocumentFiles,
  validatePublicBusinessText,
} from "@/lib/marketplace";

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

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

const authErrorMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "El correo o la contraseña no son correctos.";
  if (normalized.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  if (normalized.includes("password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  if (normalized.includes("email rate limit")) return "Se enviaron demasiados correos. Esperá unos minutos e intentá nuevamente.";
  return message;
};

const money = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export default function Home() {
  const [modal, setModal] = useState<Modal>("none");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(() => getSupabaseBrowserClient() !== null);
  const [formState, setFormState] = useState<"idle" | "loading" | "success">("idle");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) return;
    const client = supabase;

    async function syncUser(nextUser: User | null) {
      setUser(nextUser);
      if (!nextUser) {
        setIsAdmin(false);
        return;
      }

      const { data: profile } = await client
        .from("profiles")
        .select("role")
        .eq("id", nextUser.id)
        .single();
      setIsAdmin(profile?.role === "admin");
    }

    void client.auth.getUser().then(({ data }) => syncUser(data.user));
    const { data: authListener } = client.auth.onAuthStateChange((_event, session) => {
      void syncUser(session?.user ?? null);
    });

    client
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
    const confirmPassword = String(data.get("confirmPassword") ?? "");
    const country = String(data.get("country") ?? "");
    const accountIntent = String(data.get("accountIntent") ?? "both");
    const organizationName = String(data.get("organizationName") ?? "");

    if (authMode === "register" && password !== confirmPassword) {
      setMessage("Las contraseñas no coinciden.");
      return;
    }

    setFormState("loading");
    setMessage("");

    const result = authMode === "register"
      ? await supabase.auth.signUp({
          email,
          password,
          options: {
            emailRedirectTo: `${window.location.origin}/cuenta`,
            data: {
              full_name: fullName,
              country,
              account_intent: accountIntent,
              organization_name: organizationName || null,
              terms_accepted_at: new Date().toISOString(),
            },
          },
        })
      : await supabase.auth.signInWithPassword({ email, password });

    if (result.error) {
      setMessage(authErrorMessage(result.error.message));
      setFormState("idle");
      return;
    }

    setFormState("success");
    setMessage(authMode === "register" && !result.data.session
      ? "Revisá tu correo para confirmar la cuenta."
      : "Ingresaste correctamente.");
  }

  async function signInWithGoogle() {
    const supabase = getSupabaseBrowserClient();
    if (!supabase) {
      setMessage("El acceso con Google se habilitará cuando terminemos de conectar la base de datos.");
      return;
    }

    setFormState("loading");
    setMessage("");
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/cuenta` },
    });

    if (error) {
      setMessage(authErrorMessage(error.message));
      setFormState("idle");
    }
  }

  async function submitBusiness(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const supabase = getSupabaseBrowserClient();
    if (!supabase || !user) return;
    const data = new FormData(event.currentTarget);
    const description = String(data.get("description"));
    const reasonForSale = String(data.get("reasonForSale"));
    const valuationBasis = String(data.get("valuationBasis"));
    const files = data.getAll("documents").filter((item): item is File => item instanceof File && item.size > 0);
    const contactError = validatePublicBusinessText([description, reasonForSale, valuationBasis]);
    const fileError = files.length === 0 ? "Subí al menos un comprobante privado para que el equipo pueda revisar el negocio." : validateDocumentFiles(files);

    if (contactError || fileError) {
      setMessage(contactError ?? fileError ?? "Revisá los datos ingresados.");
      return;
    }

    setFormState("loading");
    setMessage("");
    const businessId = crypto.randomUUID();

    const { error } = await supabase.from("businesses").insert({
      id: businessId,
      owner_id: user.id,
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
    });

    if (error) {
      setMessage(error.message);
      setFormState("idle");
      return;
    }

    try {
      await uploadBusinessDocuments({
        supabase,
        userId: user.id,
        businessId,
        files,
        kind: String(data.get("documentKind")) as DocumentKind,
      });
    } catch (uploadError) {
      setFormState("success");
      setMessage(`Recibimos el negocio, pero un comprobante no pudo subirse. Podrás agregarlo desde Mi cuenta. ${uploadError instanceof Error ? uploadError.message : ""}`);
      return;
    }

    setFormState("success");
    setMessage("Recibimos el negocio y sus comprobantes privados. Quedó pendiente de revisión y todavía no es público.");
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
          <a href="#comprar">Comprar</a>
          <a href="#vender">Vender</a>
          <a href="#como-funciona">Cómo funciona</a>
          <a href="#negocios">Negocios</a>
        </nav>
        <div className={`header-actions${isAdmin ? " has-admin" : ""}`}>
          {user ? (
            <>{isAdmin && <Link className="account-link admin-entry" href="/admin"><span>AD</span>Panel admin</Link>}<Link className="account-link account-entry" href="/cuenta"><span>CN</span>Mi cuenta</Link><button className="plain-button" onClick={signOut}>Salir</button></>
          ) : (
            <><button className="plain-button" onClick={() => openAuth("login")}>Ingresar</button><button className="button button-outline" onClick={() => openAuth("register")}>Registrarme</button></>
          )}
          <button className="button button-primary" onClick={openSell}>Vender mi negocio</button>
        </div>
      </header>

      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow">Comprar y vender negocios digitales</span>
          <h1>El próximo capítulo<br />de un negocio <em>empieza acá.</em></h1>
          <p>Una plataforma privada para descubrir, analizar y negociar negocios digitales en funcionamiento. Cada publicación y cada oferta pasa por el equipo de Compra Negocio.</p>
          <div className="hero-actions">
            <a className="button button-primary" href="#comprar">Quiero comprar <span>→</span></a>
            <button className="button button-outline" onClick={openSell}>Quiero vender</button>
          </div>
          <div className="hero-note"><span>Sin contacto directo</span><span>Sin publicaciones automáticas</span><span>Sin comisión hasta cerrar</span></div>
        </div>
        <div className="review-card">
          <span className="review-label">Un mercado con criterio</span>
          <h2>Menos ruido.<br />Más información.</h2>
          <ol>
            <li><span>1</span><div><b>Oportunidades revisadas</b><p>Publicamos solamente negocios que pasan por una evaluación inicial.</p></div></li>
            <li><span>2</span><div><b>Datos sensibles protegidos</b><p>La identidad y la documentación permanecen bajo control.</p></div></li>
            <li><span>3</span><div><b>Negociación acompañada</b><p>Ordenamos consultas, ofertas y próximos pasos hasta el cierre.</p></div></li>
          </ol>
          <div className="review-stamp"><span>CN</span><p><b>Intermediación obligatoria</b>Todas las ofertas pasan primero por el equipo.</p></div>
        </div>
      </section>

      <section className="market-ribbon" aria-label="Tipos de negocios">
        <div className="shell market-ribbon-inner">
          <span>SaaS</span><span>Marketplaces</span><span>E-commerce</span><span>Contenido</span><span>Agencias</span><span>Productos digitales</span>
        </div>
      </section>

      <section className="principles">
        <div className="shell principle-grid">
          <article><span>01</span><h3>Información real</h3><p>El mercado muestra únicamente negocios enviados y aprobados.</p></article>
          <article><span>02</span><h3>Identidad protegida</h3><p>No publicamos teléfonos, correos ni redes de las partes.</p></article>
          <article><span>03</span><h3>Negociación registrada</h3><p>Consultas y ofertas quedan dentro de Compra Negocio.</p></article>
        </div>
      </section>

      <section className="audience-section shell" id="comprar">
        <div className="audience-intro">
          <span className="eyebrow">Para compradores</span>
          <h2>No empieces de cero.<br />Entrá a algo que ya funciona.</h2>
          <p>Explorá negocios digitales con operación, clientes o activos existentes. Nosotros centralizamos la información para que puedas comparar, preguntar y avanzar con mayor claridad.</p>
          <a className="button button-primary" href="#negocios">Explorar oportunidades <span>→</span></a>
        </div>
        <div className="audience-grid">
          <article><span>01</span><div><h3>Descubrimiento curado</h3><p>Accedé a publicaciones revisadas, organizadas con los datos que importan para una primera decisión.</p></div></article>
          <article><span>02</span><div><h3>Análisis ordenado</h3><p>Revisá modelo, ingresos, costos, antigüedad, usuarios y motivo de venta en un mismo lugar.</p></div></article>
          <article><span>03</span><div><h3>Oferta confidencial</h3><p>Presentá una propuesta sin exponer tus datos personales ni abrir conversaciones desordenadas.</p></div></article>
          <article><span>04</span><div><h3>Acompañamiento</h3><p>El equipo registra cada avance y coordina la comunicación hasta definir los siguientes pasos.</p></div></article>
        </div>
      </section>

      <section className="market-section shell" id="negocios">
        <div className="section-title">
          <div><span className="eyebrow">Negocios aprobados</span><h2>Negocios disponibles.</h2></div>
          <p>No usamos publicaciones de muestra. Esta sección se completa solamente con negocios revisados por nuestro equipo.</p>
        </div>

        {loadingMarket ? (
          <div className="market-empty"><span className="empty-symbol">···</span><h3>Consultando negocios</h3></div>
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

      <section className="seller-section" id="vender">
        <div className="shell seller-grid">
          <div className="seller-copy">
            <span className="eyebrow">Para vendedores</span>
            <h2>Construiste valor.<br />Ahora presentalo bien.</h2>
            <p>Prepará una publicación seria, respaldá los números con documentación privada y recibí propuestas dentro de un proceso cuidado.</p>
            <button className="button button-white" onClick={openSell}>Empezar mi publicación</button>
          </div>
          <div className="seller-checklist">
            <div className="seller-checklist-head"><span>Preparación de la venta</span><b>Lo que vamos a revisar</b></div>
            <ul>
              <li><span>01</span><div><b>Modelo y operación</b><p>Qué vende, cómo funciona y cuánto depende del fundador.</p></div></li>
              <li><span>02</span><div><b>Métricas financieras</b><p>Ingresos, gastos, ganancia y criterio de valoración.</p></div></li>
              <li><span>03</span><div><b>Activos incluidos</b><p>Marca, tecnología, comunidad, procesos y canales.</p></div></li>
              <li><span>04</span><div><b>Motivo y condiciones</b><p>Por qué vendés, qué porcentaje ofrecés y qué esperás de la operación.</p></div></li>
            </ul>
          </div>
        </div>
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

      <section className="included-section">
        <div className="shell">
          <div className="section-title">
            <div><span className="eyebrow">Qué incluye la plataforma</span><h2>Todo el proceso,<br />en un solo lugar.</h2></div>
            <p>Tu cuenta reúne publicaciones, documentación, observaciones del equipo y ofertas para que nunca pierdas el estado de una operación.</p>
          </div>
          <div className="included-grid">
            <article><span className="feature-icon">01</span><h3>Perfil comprador y vendedor</h3><p>Un mismo acceso para explorar oportunidades, publicar activos y seguir cada movimiento.</p></article>
            <article><span className="feature-icon">02</span><h3>Documentación privada</h3><p>Comprobantes disponibles únicamente para el propietario y el equipo de revisión.</p></article>
            <article><span className="feature-icon">03</span><h3>Estado en tiempo real</h3><p>Seguimiento claro de revisiones, correcciones, publicaciones y negociaciones.</p></article>
            <article><span className="feature-icon">04</span><h3>Historial centralizado</h3><p>Ofertas y decisiones registradas dentro de la plataforma, sin depender de chats externos.</p></article>
            <article><span className="feature-icon">05</span><h3>Privacidad por diseño</h3><p>Los datos de contacto no se comparten automáticamente entre comprador y vendedor.</p></article>
            <article><span className="feature-icon">06</span><h3>Intermediación humana</h3><p>Un equipo que revisa la información y organiza la comunicación cuando hace falta.</p></article>
          </div>
        </div>
      </section>

      <section className="faq-section shell" id="preguntas">
        <div className="faq-intro"><span className="eyebrow">Preguntas frecuentes</span><h2>Antes de empezar.</h2><p>Lo esencial para entender cómo cuidamos las publicaciones y las negociaciones.</p></div>
        <div className="faq-list">
          <details><summary>¿Cualquier negocio puede publicarse?<span>+</span></summary><p>No. Toda propuesta queda pendiente hasta que el equipo revisa la información, los números y la documentación presentada.</p></details>
          <details><summary>¿Se comparten mis datos de contacto?<span>+</span></summary><p>No de forma automática. Compra Negocio intermedia la comunicación y protege los datos personales durante las primeras etapas.</p></details>
          <details><summary>¿Puedo vender solo una participación?<span>+</span></summary><p>Sí. Podés ofrecer desde una participación hasta el 100% del negocio e indicar el precio esperado.</p></details>
          <details><summary>¿Cómo realizo una oferta?<span>+</span></summary><p>Creás una cuenta, elegís un negocio aprobado y enviás una oferta privada. El equipo la revisa antes de presentarla al vendedor.</p></details>
          <details><summary>¿Qué veo dentro de Mi cuenta?<span>+</span></summary><p>Tu perfil, tus publicaciones, sus estados y documentos, las observaciones del equipo y todas las ofertas realizadas.</p></details>
        </div>
      </section>

      <section className="final-cta">
        <div className="shell final-grid"><div><span className="eyebrow">Tu próximo movimiento</span><h2>Comprá lo que ya existe.<br />Vendé lo que construiste.</h2></div><div><p>Creá tu perfil para publicar, seguir revisiones y realizar ofertas sin compartir tus datos con la otra parte.</p><div className="final-actions"><button className="button button-white" onClick={() => openAuth("register")}>Crear mi cuenta</button><a className="button button-ghost-light" href="#como-funciona">Ver cómo funciona</a></div></div></div>
      </section>

      <footer className="footer shell">
        <a className="brand" href="#inicio"><span className="brand-mark"><span>C</span><span>N</span></span><span className="brand-name">Compra Negocio</span></a>
        <div className="footer-links"><a href="#comprar">Comprar</a><a href="#vender">Vender</a><a href="#como-funciona">Cómo funciona</a><a href="#preguntas">Preguntas</a></div>
        <span>© 2026 Compra Negocio</span>
      </footer>

      {modal !== "none" && (
        <div className="modal-backdrop">
          <div className="modal" role="dialog" aria-modal="true">
            <button className="modal-close" onClick={() => setModal("none")} aria-label="Cerrar">×</button>

            {modal === "auth" && (
              <><span className="modal-label">{authMode === "register" ? "Nueva cuenta" : "Bienvenido"}</span><h2>{authMode === "register" ? "Creá tu cuenta." : "Ingresá a tu cuenta."}</h2>
                {formState !== "success" ? <>
                  <button className="google-button" type="button" onClick={signInWithGoogle} disabled={formState === "loading" || !googleAuthEnabled} title={googleAuthEnabled ? undefined : "Estamos terminando la configuración con Google"}>
                    <svg aria-hidden="true" viewBox="0 0 24 24"><path fill="#4285F4" d="M21.6 12.23c0-.71-.06-1.4-.18-2.07H12v3.92h5.38a4.6 4.6 0 0 1-2 3.02v2.54h3.24c1.9-1.75 2.98-4.33 2.98-7.41Z"/><path fill="#34A853" d="M12 22c2.7 0 4.98-.9 6.63-2.36l-3.24-2.54c-.9.6-2.05.96-3.39.96-2.61 0-4.82-1.76-5.61-4.13H3.04v2.62A10 10 0 0 0 12 22Z"/><path fill="#FBBC05" d="M6.39 13.93A6.02 6.02 0 0 1 6.07 12c0-.67.12-1.32.32-1.93V7.45H3.04A10 10 0 0 0 2 12c0 1.61.39 3.14 1.04 4.55l3.35-2.62Z"/><path fill="#EA4335" d="M12 5.94c1.47 0 2.79.5 3.82 1.49l2.88-2.88A9.65 9.65 0 0 0 12 2a10 10 0 0 0-8.96 5.45l3.35 2.62C7.18 7.7 9.39 5.94 12 5.94Z"/></svg>
                    {googleAuthEnabled ? "Continuar con Google" : "Google · en configuración"}
                  </button>
                  <p className="social-terms">Al continuar, aceptás los términos de uso y la política de privacidad.</p>
                  <div className="auth-divider"><span>o con correo electrónico</span></div>
                  <form className={authMode === "register" ? "form form-grid auth-form" : "form auth-form"} onSubmit={submitAuth}>
                    {authMode === "register" && <>
                      <label>Nombre y apellido<input name="fullName" required minLength={2} autoComplete="name" /></label>
                      <label>País de residencia<select name="country" required defaultValue="Argentina"><option>Argentina</option><option>Uruguay</option><option>Chile</option><option>Paraguay</option><option>Brasil</option><option>México</option><option>Colombia</option><option>Perú</option><option>España</option><option>Estados Unidos</option><option>Otro</option></select></label>
                      <label>¿Qué querés hacer?<select name="accountIntent" required defaultValue="both"><option value="buy">Comprar negocios</option><option value="sell">Vender un negocio</option><option value="both">Comprar y vender</option></select></label>
                      <label><span className="field-title">Empresa o proyecto <small>Opcional</small></span><input name="organizationName" autoComplete="organization" /></label>
                    </>}
                    <label className={authMode === "register" ? "wide" : undefined}>Correo electrónico<input name="email" type="email" required autoComplete="email" /></label>
                    <label>Contraseña<input name="password" type="password" required minLength={8} autoComplete={authMode === "register" ? "new-password" : "current-password"} /></label>
                    {authMode === "register" && <label>Repetir contraseña<input name="confirmPassword" type="password" required minLength={8} autoComplete="new-password" /></label>}
                    {authMode === "register" && <label className="terms-check wide"><input name="terms" type="checkbox" required /><span>Acepto los términos de uso y la política de privacidad de Compra Negocio.</span></label>}
                    {message && <p className="form-message wide">{message}</p>}
                    <button className="button button-primary full wide" disabled={formState === "loading"}>{formState === "loading" ? "Procesando…" : authMode === "register" ? "Crear cuenta" : "Ingresar"}</button>
                  </form>
                </> : <div className="form-success"><span>✓</span><p>{message}</p><button className="button button-primary" onClick={() => setModal("none")}>Continuar</button></div>}
                <button className="switch-auth" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setMessage(""); setFormState("idle"); }}>{authMode === "register" ? "Ya tengo cuenta" : "Quiero registrarme"}</button>
              </>
            )}

            {modal === "sell" && (
              <><span className="modal-label">Revisión privada</span><h2>Enviá tu negocio al equipo.</h2><p className="modal-intro">Nada se publica automáticamente. Primero evaluamos la información.</p>
                {formState !== "success" ? <form className="form form-grid" onSubmit={submitBusiness}>
                  <label>Nombre del negocio<input name="name" required minLength={2} /></label>
                  <label>Sitio web, si existe<input name="website" type="url" placeholder="https://" /></label>
                  <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Seleccionar</option><option>SaaS</option><option>Herramienta</option><option>Producto digital</option><option>Marketplace</option><option>Contenido</option><option>Otro</option></select></label>
                  <label>Antigüedad en meses<input name="ageMonths" type="number" min="0" max="1200" step="1" required /></label>
                  <label>Ingreso mensual en USD<input name="revenue" type="number" min="0" step="0.01" required /></label>
                  <label>Gastos mensuales en USD<input name="expenses" type="number" min="0" step="0.01" required /></label>
                  <label>Ganancia mensual en USD<input name="profit" type="number" step="0.01" required /></label>
                  <label>Usuarios o clientes activos<input name="activeUsers" type="number" min="0" step="1" required /></label>
                  <label>Porcentaje a vender<input name="stake" type="number" min="0.01" max="100" step="0.01" required /></label>
                  <label>Precio esperado en USD<input name="price" type="number" min="1" step="0.01" required /></label>
                  <label className="wide">Valoración total estimada en USD<input name="valuation" type="number" min="1" step="0.01" required /></label>
                  <label className="wide">Descripción pública del negocio<textarea name="description" required minLength={20} rows={4} /><small>Sin correos, teléfonos, enlaces ni usuarios de redes.</small></label>
                  <label className="wide">Motivo de venta<textarea name="reasonForSale" required minLength={10} maxLength={1500} rows={3} /><small>Esta información se revisa antes de publicarse.</small></label>
                  <label className="wide">Cómo calculaste la valoración<textarea name="valuationBasis" required minLength={20} maxLength={2000} rows={4} placeholder="Ingresos, ganancia, crecimiento, activos incluidos y criterio utilizado." /></label>
                  <label>Tipo de comprobante<select name="documentKind" required defaultValue="revenue">{Object.entries(documentKindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Comprobantes privados<input name="documents" type="file" required multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx" /></label>
                  <p className="private-upload-note wide">Hasta 6 archivos de 10 MB. Sólo el dueño y el equipo de Compra Negocio podrán descargarlos.</p>
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
