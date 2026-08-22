"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import type { User } from "@supabase/supabase-js";
import Brand from "@/components/Brand";
import { ChevronDownIcon, ClipboardCheckIcon, MenuIcon, SearchIcon, ShieldIcon, StoreIcon, UserIcon } from "@/components/Icons";
import { getSupabaseBrowserClient } from "@/lib/supabase";
import {
  documentKindLabel,
  formatUsd,
  formatWholeNumber,
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
  expenses_monthly: number;
  profit_monthly: number;
  asking_price: number;
  estimated_valuation: number;
  stake_percent: number;
  age_months: number;
  active_users: number;
  created_at: string;
};

type Modal = "none" | "auth" | "sell" | "details" | "offer";
type SortOption = "newest" | "price-asc" | "price-desc";
export type MarketplaceView = "home" | "businesses" | "buy" | "sell" | "how";

const googleAuthEnabled = process.env.NEXT_PUBLIC_GOOGLE_AUTH_ENABLED === "true";

const authErrorMessage = (message: string) => {
  const normalized = message.toLowerCase();
  if (normalized.includes("invalid login credentials")) return "El correo o la contraseña no son correctos.";
  if (normalized.includes("user already registered")) return "Ya existe una cuenta con ese correo.";
  if (normalized.includes("password should be")) return "La contraseña debe tener al menos 8 caracteres.";
  if (normalized.includes("email rate limit")) return "Se enviaron demasiados correos. Esperá unos minutos e intentá nuevamente.";
  return message;
};

function ageLabel(months: number) {
  if (months < 12) return `${months} ${months === 1 ? "mes" : "meses"}`;
  const years = Math.floor(months / 12);
  const extraMonths = months % 12;
  return extraMonths === 0
    ? `${years} ${years === 1 ? "año" : "años"}`
    : `${years} ${years === 1 ? "año" : "años"} y ${extraMonths} meses`;
}

function BusinessCard({ business, onOpen }: { business: Business; onOpen: (business: Business) => void }) {
  return (
    <article className="business-card">
      <div className="business-card-top">
        <span className="category-pill">{business.category}</span>
        <span className="verified-label"><i aria-hidden="true">✓</i> Disponible</span>
      </div>
      <div className="business-card-heading">
        <div className="business-avatar" aria-hidden="true">{business.name.slice(0, 2).toUpperCase()}</div>
        <div><h3>{business.name}</h3><p>{business.stake_percent}% disponible</p></div>
      </div>
      <p className="business-description">{business.description}</p>
      <dl className="business-metrics">
        <div><dt>Precio solicitado</dt><dd>{formatUsd(business.asking_price)}</dd></div>
        <div><dt>Ingreso mensual</dt><dd>{formatUsd(business.revenue_monthly)}</dd></div>
        <div><dt>Ganancia mensual</dt><dd>{formatUsd(business.profit_monthly)}</dd></div>
        <div><dt>Antigüedad</dt><dd>{ageLabel(business.age_months)}</dd></div>
      </dl>
      <button className="button button-dark full card-action" onClick={() => onOpen(business)}>
        Ver oportunidad <span aria-hidden="true">↗</span>
      </button>
    </article>
  );
}

const decimal = new Intl.NumberFormat("es-AR", { maximumFractionDigits: 1 });

function OpportunityDetails({ business, onConsult }: { business: Business; onConsult: () => void }) {
  const margin = business.revenue_monthly > 0 ? (business.profit_monthly / business.revenue_monthly) * 100 : null;
  const monthlyProfitForStake = business.profit_monthly * (business.stake_percent / 100);
  const estimatedPayback = monthlyProfitForStake > 0 ? business.asking_price / monthlyProfitForStake : null;
  const annualProfit = business.profit_monthly * 12;
  const profitMultiple = annualProfit > 0 ? business.estimated_valuation / annualProfit : null;

  return (
    <>
      <div className="detail-header">
        <div className="business-avatar large-avatar">{business.name.slice(0, 2).toUpperCase()}</div>
        <div><span className="category-pill">{business.category}</span><h2 id="modal-title">{business.name}</h2><p>Ficha completa de la oportunidad</p></div>
      </div>

      <div className="detail-highlight-grid">
        <div><span>Precio solicitado</span><b>{formatUsd(business.asking_price)}</b></div>
        <div><span>Participación disponible</span><b>{business.stake_percent}%</b></div>
        <div><span>Valoración declarada</span><b>{formatUsd(business.estimated_valuation)}</b></div>
      </div>

      <section className="detail-overview">
        <span className="detail-section-label">Sobre el negocio</span>
        <p className="detail-description">{business.description}</p>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><span className="detail-section-label">Datos principales</span><small>Información declarada por el vendedor</small></div>
        <dl className="detail-metrics">
          <div><dt>Ingreso mensual</dt><dd>{formatUsd(business.revenue_monthly)}</dd></div>
          <div><dt>Gastos mensuales</dt><dd>{formatUsd(business.expenses_monthly)}</dd></div>
          <div><dt>Ganancia mensual</dt><dd>{formatUsd(business.profit_monthly)}</dd></div>
          <div><dt>Ganancia anualizada</dt><dd>{formatUsd(annualProfit)}</dd></div>
          <div><dt>Antigüedad</dt><dd>{ageLabel(business.age_months)}</dd></div>
          <div><dt>Usuarios o clientes activos</dt><dd>{formatWholeNumber(business.active_users)}</dd></div>
        </dl>
      </section>

      <section className="detail-section">
        <div className="detail-section-heading"><span className="detail-section-label">Lectura financiera</span><small>Cálculos orientativos sobre los datos publicados</small></div>
        <div className="detail-analysis-grid">
          <article><span>Margen mensual</span><b>{margin === null ? "Sin cálculo" : `${decimal.format(margin)}%`}</b><p>Ganancia declarada en relación con los ingresos mensuales.</p></article>
          <article><span>Recuperación estimada</span><b>{estimatedPayback === null ? "Sin cálculo" : `${decimal.format(estimatedPayback)} meses`}</b><p>Precio comparado con la ganancia atribuible al porcentaje ofrecido.</p></article>
          <article><span>Múltiplo de ganancia</span><b>{profitMultiple === null ? "Sin cálculo" : `${decimal.format(profitMultiple)}×`}</b><p>Valoración total comparada con la ganancia anualizada.</p></article>
        </div>
        <p className="detail-analysis-note">Estos cálculos sirven como referencia inicial y no constituyen una recomendación de inversión.</p>
      </section>

      <div className="detail-actions">
        <div><b>¿Querés saber más?</b><p>Enviá tu consulta y la propuesta que quieras presentar desde tu cuenta.</p></div>
        <button className="button button-primary button-large" onClick={onConsult}>Consultar oportunidad <span>→</span></button>
      </div>
    </>
  );
}

export default function MarketplaceShell({ view }: { view: MarketplaceView }) {
  const [modal, setModal] = useState<Modal>("none");
  const [authMode, setAuthMode] = useState<"register" | "login">("register");
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [businesses, setBusinesses] = useState<Business[]>([]);
  const [selectedBusiness, setSelectedBusiness] = useState<Business | null>(null);
  const [loadingMarket, setLoadingMarket] = useState(() => getSupabaseBrowserClient() !== null);
  const [formState, setFormState] = useState<"idle" | "loading" | "success">("idle");
  const [message, setMessage] = useState("");
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("Todas");
  const [sort, setSort] = useState<SortOption>("newest");

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
      .select("id,name,category,description,revenue_monthly,expenses_monthly,profit_monthly,asking_price,estimated_valuation,stake_percent,age_months,active_users,created_at")
      .eq("status", "approved")
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        setBusinesses((data as Business[] | null) ?? []);
        setLoadingMarket(false);
      });

    return () => authListener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (modal === "none") return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setModal("none");
    };
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [modal]);

  const categories = useMemo(
    () => ["Todas", ...Array.from(new Set(businesses.map((business) => business.category))).sort()],
    [businesses],
  );

  const visibleBusinesses = useMemo(() => {
    const normalizedSearch = search.trim().toLocaleLowerCase("es");
    const filtered = businesses.filter((business) => {
      const matchesCategory = category === "Todas" || business.category === category;
      const matchesSearch = !normalizedSearch
        || `${business.name} ${business.category} ${business.description}`.toLocaleLowerCase("es").includes(normalizedSearch);
      return matchesCategory && matchesSearch;
    });

    return filtered.toSorted((left, right) => {
      if (sort === "price-asc") return left.asking_price - right.asking_price;
      if (sort === "price-desc") return right.asking_price - left.asking_price;
      return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
    });
  }, [businesses, category, search, sort]);

  function resetFlow(nextModal: Modal) {
    setMessage("");
    setFormState("idle");
    setModal(nextModal);
  }

  function openAuth(mode: "register" | "login") {
    setAuthMode(mode);
    resetFlow("auth");
  }

  function openSell() {
    if (!user) {
      setAuthMode("register");
      setMessage("Creá una cuenta para publicar tu negocio.");
      setFormState("idle");
      setModal("auth");
      return;
    }
    resetFlow("sell");
  }

  function openDetails(business: Business) {
    setSelectedBusiness(business);
    resetFlow("details");
  }

  function openOffer(business: Business) {
    if (!user) {
      setAuthMode("register");
      setMessage("Registrate para consultar o realizar una oferta.");
      setFormState("idle");
      setModal("auth");
      return;
    }
    setSelectedBusiness(business);
    resetFlow("offer");
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
      ? "Te enviamos un correo para confirmar la cuenta."
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
    const fileError = files.length === 0
      ? "Subí al menos un comprobante privado para respaldar la información del negocio."
      : validateDocumentFiles(files);

    if (contactError || fileError) {
      setMessage(contactError ?? fileError ?? "Comprobá los datos ingresados.");
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
    setMessage("Recibimos el negocio y sus comprobantes privados. La publicación quedó recibida y todavía no es pública.");
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
    setMessage("Tu consulta y propuesta quedaron enviadas. Podés seguir el estado desde Mi cuenta.");
  }

  async function signOut() {
    await getSupabaseBrowserClient()?.auth.signOut();
  }

  return (
    <main id="inicio">
      <header className="site-header">
        <div className="shell header-inner">
          <Brand />
          <nav aria-label="Navegación principal">
            <Link className={view === "home" ? "active" : undefined} href="/">Inicio</Link>
            <Link className={view === "businesses" ? "active" : undefined} href="/negocios">Negocios</Link>
            <Link className={view === "buy" ? "active" : undefined} href="/comprar">Comprar</Link>
            <Link className={view === "sell" ? "active" : undefined} href="/vender">Vender</Link>
            <Link className={view === "how" ? "active" : undefined} href="/como-funciona">Cómo funciona</Link>
          </nav>
          <div className="header-actions">
            <details className="mobile-nav">
              <summary aria-label="Abrir navegación"><MenuIcon /></summary>
              <div>
                <Link className={view === "home" ? "active" : undefined} href="/">Inicio</Link>
                <Link className={view === "businesses" ? "active" : undefined} href="/negocios">Negocios</Link>
                <Link className={view === "buy" ? "active" : undefined} href="/comprar">Comprar</Link>
                <Link className={view === "sell" ? "active" : undefined} href="/vender">Vender</Link>
                <Link className={view === "how" ? "active" : undefined} href="/como-funciona">Cómo funciona</Link>
              </div>
            </details>
            {user ? (
              <details className="account-menu">
                <summary aria-label="Abrir menú de cuenta">
                  <span className="account-avatar"><UserIcon /></span>
                  <span className="header-account-copy"><b>{(user.user_metadata?.full_name || "Mi cuenta").split(" ")[0]}</b><small>Mi cuenta</small></span>
                  <ChevronDownIcon className="account-chevron" />
                </summary>
                <div className="account-dropdown">
                  <div><small>Sesión iniciada</small><b>{user.user_metadata?.full_name || user.email}</b></div>
                  <Link href="/cuenta">Mi actividad <span>→</span></Link>
                  {isAdmin && <Link className="admin-menu-link" href="/admin">Área de administración <span>→</span></Link>}
                  <button onClick={signOut}>Cerrar sesión</button>
                </div>
              </details>
            ) : (
              <>
                <button className="text-button header-login" onClick={() => openAuth("login")}>Ingresar</button>
                <button className="button button-outline header-register" onClick={() => openAuth("register")}>Crear cuenta</button>
              </>
            )}
            <button className="button button-primary header-sell" onClick={openSell}><span className="desktop-copy">Publicar negocio</span><span className="mobile-copy">Publicar</span></button>
          </div>
        </div>
      </header>

      {view === "home" && <>
      <section className="hero shell">
        <div className="hero-copy">
          <span className="eyebrow"><i aria-hidden="true" /> Compra, inversión y salida</span>
          <h1>Tu próximo negocio<br />ya está <em>funcionando.</em></h1>
          <p className="hero-lead">Descubrí negocios digitales reales, comprá una participación o presentá una oferta por el proyecto completo. Compra Negocio centraliza la información y coordina cada conversación.</p>
          <div className="hero-actions">
            <Link className="button button-primary button-large" href="/negocios">Explorar negocios <span aria-hidden="true">→</span></Link>
            <button className="button button-quiet button-large" onClick={openSell}>Quiero vender <span aria-hidden="true">↗</span></button>
          </div>
          <div className="hero-assurances" aria-label="Características principales">
            <span><i>✓</i> Cuenta necesaria para operar</span>
            <span><i>✓</i> Ofertas confidenciales</span>
            <span><i>✓</i> Proceso dentro de la plataforma</span>
          </div>
        </div>

        <div className="deal-console" aria-label="Esquema de una operación digital">
          <div className="console-header"><span>Operación protegida</span><b>Compra Negocio</b><i>En proceso</i></div>
          <div className="deal-flow">
            <div className="flow-party"><span>V</span><small>Vendedor</small><b>Envía información</b></div>
            <div className="flow-line"><i /><span><ShieldIcon /></span><i /></div>
            <div className="flow-party"><span>C</span><small>Comprador</small><b>Presenta una oferta</b></div>
          </div>
          <div className="deal-brief">
            <div className="brief-heading"><span className="mini-logo"><ClipboardCheckIcon /></span><div><small>Mesa de negociación</small><b>Todo pasa por un mismo lugar</b></div><i>✓</i></div>
            <div className="brief-grid">
              <span><small>01</small> Información</span>
              <span><small>02</small> Información</span>
              <span><small>03</small> Oferta</span>
              <span><small>04</small> Cierre</span>
            </div>
          </div>
          <p className="console-note"><span aria-hidden="true">●</span> Las partes no intercambian datos de contacto.</p>
        </div>
      </section>

      <section className="trust-strip">
        <div className="shell trust-grid">
          <article><span>01</span><div><b>Publicaciones claras</b><p>Cada oportunidad presenta la información esencial en un formato comparable.</p></div></article>
          <article><span>02</span><div><b>Todo dentro de tu cuenta</b><p>Las consultas y ofertas quedan asociadas a cada operación.</p></div></article>
          <article><span>03</span><div><b>Sin información inventada</b><p>El mercado muestra únicamente oportunidades reales.</p></div></article>
        </div>
      </section>
      </>}

      {(view === "buy" || view === "sell") && <>
      <section className={`subpage-hero ${view === "sell" ? "subpage-hero-sell" : "subpage-hero-buy"}`}>
        <div className="shell subpage-hero-inner">
          <div>
            <span className="eyebrow">{view === "buy" ? "Para compradores" : "Para vendedores"}</span>
            <h1>{view === "buy" ? <>Encontrá un negocio que ya está <em>en marcha.</em></> : <>Convertí lo que construiste en una <em>oportunidad real.</em></>}</h1>
            <p>{view === "buy" ? "Explorá negocios digitales, compará sus métricas y presentá una propuesta desde un único lugar." : "Publicá una participación o el negocio completo con la información que un comprador necesita para decidir."}</p>
            <div className="subpage-actions">
              {view === "buy" ? <Link className="button button-primary button-large" href="/negocios">Ver negocios <span>→</span></Link> : <button className="button button-primary button-large" onClick={openSell}>Publicar mi negocio <span>→</span></button>}
              <Link className="button button-quiet button-large" href="/como-funciona">Conocer el proceso</Link>
            </div>
          </div>
          <div className="subpage-number" aria-hidden="true">{view === "buy" ? "01" : "02"}<span>Compra Negocio</span></div>
        </div>
      </section>

      <section className="journeys shell journey-single">
        <div className="section-heading centered-heading">
          <span className="eyebrow">{view === "buy" ? "Comprar con claridad" : "Vender con información"}</span>
          <h2>{view === "buy" ? <>Todo lo necesario para <em>evaluar mejor.</em></> : <>Prepará tu negocio para una <em>buena negociación.</em></>}</h2>
          <p>{view === "buy" ? "Cada oportunidad reúne sus datos principales y mantiene tus consultas y propuestas ordenadas." : "Presentá las métricas, la valoración y los documentos que respaldan lo que construiste."}</p>
        </div>
        <div className="journey-grid">
          {view === "buy" &&
          <article className="journey-card journey-buy">
            <div className="journey-index">01</div>
            <span className="journey-label">Para compradores</span>
            <h3>Encontrá un negocio que ya superó la etapa inicial.</h3>
            <p>Analizá oportunidades disponibles, solicitá información adicional y enviá una propuesta confidencial.</p>
            <ul><li>Negocios y participaciones</li><li>Métricas públicas organizadas</li><li>Oferta sin compartir tu contacto</li></ul>
            <Link className="journey-link" href="/negocios">Explorar oportunidades <span>→</span></Link>
          </article>
          }
          {view === "sell" &&
          <article className="journey-card journey-sell">
            <div className="journey-index">02</div>
            <span className="journey-label">Para vendedores</span>
            <h3>Convertí lo que construiste en una oportunidad concreta.</h3>
            <p>Podés vender una parte o el negocio completo. La publicación sólo se activa cuando la información está lista.</p>
            <ul><li>Información organizada</li><li>Documentación privada</li><li>Ofertas registradas en la plataforma</li></ul>
            <button className="journey-link" onClick={openSell}>Iniciar publicación <span>→</span></button>
          </article>
          }
        </div>
      </section>
      </>}

      {view === "home" && <section className="featured-section shell">
        <div className="section-heading featured-heading">
          <div><span className="eyebrow">Oportunidades destacadas</span><h2>Negocios para conocer hoy.</h2></div>
          <Link className="section-link" href="/negocios">Ver todos los negocios <span>→</span></Link>
        </div>
        {loadingMarket ? (
          <div className="featured-loading"><span className="loader-ring" /><p>Consultando oportunidades…</p></div>
        ) : businesses.length > 0 ? (
          <div className="business-grid featured-grid">
            {businesses.slice(0, 3).map((business) => <BusinessCard key={business.id} business={business} onOpen={openDetails} />)}
          </div>
        ) : (
          <div className="market-empty compact-empty"><span className="empty-mark"><StoreIcon /></span><h3>Las primeras oportunidades aparecerán acá.</h3><p>Mostramos únicamente negocios publicados por sus dueños.</p><button className="button button-primary" onClick={openSell}>Publicar un negocio</button></div>
        )}
      </section>}

      {view === "businesses" && <>
      <section className="subpage-hero subpage-hero-market">
        <div className="shell subpage-hero-inner">
          <div>
            <span className="eyebrow">Mercado digital</span>
            <h1>Negocios listos para su <em>próxima etapa.</em></h1>
            <p>Explorá oportunidades reales, compará información clave y consultá cada proyecto desde tu cuenta.</p>
          </div>
          <div className="subpage-number" aria-hidden="true">03<span>Mercado</span></div>
        </div>
      </section>

      <section className="market-section">
        <div className="shell">
          <div className="section-heading market-heading">
            <div><span className="eyebrow">Oportunidades disponibles</span><h2>Negocios disponibles.</h2></div>
            <p>No publicamos ejemplos ni números ficticios. Acá aparecen únicamente negocios publicados por sus dueños en Compra Negocio.</p>
          </div>

          <div className="market-toolbar">
            <label className="search-control">
              <span aria-hidden="true"><SearchIcon /></span>
              <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Buscar por nombre, categoría o descripción" aria-label="Buscar negocios" />
            </label>
            <label className="select-control"><span>Categoría</span><select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
            <label className="select-control"><span>Ordenar</span><select value={sort} onChange={(event) => setSort(event.target.value as SortOption)}><option value="newest">Más recientes</option><option value="price-asc">Menor precio</option><option value="price-desc">Mayor precio</option></select></label>
          </div>

          <div className="market-result-line">
            <p>{loadingMarket ? "Consultando el mercado…" : `${visibleBusinesses.length} ${visibleBusinesses.length === 1 ? "oportunidad" : "oportunidades"}`}</p>
            {(search || category !== "Todas") && <button onClick={() => { setSearch(""); setCategory("Todas"); }}>Limpiar filtros</button>}
          </div>
          <p className="market-account-note"><span>Cuenta requerida</span> Registrate para publicar un negocio o enviar una oferta.</p>

          {loadingMarket ? (
            <div className="market-empty market-loading"><span className="loader-ring" /><h3>Cargando oportunidades</h3><p>Estamos consultando la información más reciente del mercado.</p></div>
          ) : businesses.length === 0 ? (
            <div className="market-empty">
              <span className="empty-mark"><StoreIcon /></span>
              <span className="eyebrow">Mercado en preparación</span>
              <h3>Todavía no hay negocios publicados.</h3>
              <p>Preferimos mostrar un mercado vacío antes que inventar información. Las primeras oportunidades aparecerán cuando estén disponibles.</p>
              <button className="button button-primary" onClick={openSell}>Enviar el primer negocio</button>
            </div>
          ) : visibleBusinesses.length === 0 ? (
            <div className="market-empty compact-empty"><h3>No encontramos coincidencias.</h3><p>Probá con otra palabra o eliminá los filtros aplicados.</p><button className="button button-outline" onClick={() => { setSearch(""); setCategory("Todas"); }}>Ver todos</button></div>
          ) : (
            <div className="business-grid">
              {visibleBusinesses.map((business) => <BusinessCard key={business.id} business={business} onOpen={openDetails} />)}
            </div>
          )}
        </div>
      </section>
      </>}

      {view === "home" && <section className="home-process shell">
        <div className="section-heading home-process-heading">
          <div><span className="eyebrow">Cómo funciona</span><h2>Simple para empezar.<br /><em>Claro para avanzar.</em></h2></div>
          <p>La información, las consultas y las propuestas viven en un mismo lugar.</p>
        </div>
        <div className="home-process-grid">
          <article><span>01</span><h3>Explorá</h3><p>Conocé negocios y participaciones disponibles.</p></article>
          <article><span>02</span><h3>Consultá</h3><p>Pedí información y presentá tu propuesta.</p></article>
          <article><span>03</span><h3>Avanzá</h3><p>Seguí cada paso desde tu cuenta.</p></article>
        </div>
        <Link className="section-link process-link" href="/como-funciona">Ver el proceso completo <span>→</span></Link>
      </section>}

      {view === "how" && <>
      <section className="subpage-hero subpage-hero-how">
        <div className="shell subpage-hero-inner">
          <div>
            <span className="eyebrow">El proceso</span>
            <h1>De la publicación al acuerdo, <em>paso a paso.</em></h1>
            <p>Compra Negocio reúne la información, las consultas y las propuestas para que cada operación avance con orden.</p>
          </div>
          <div className="subpage-number" aria-hidden="true">05<span>Etapas</span></div>
        </div>
      </section>

      <section className="method-section">
        <div className="shell">
          <div className="section-heading method-heading">
            <div><span className="eyebrow">Cómo funciona</span><h2>Una operación clara,<br />de principio a fin.</h2></div>
            <p>El comprador y el vendedor toman las decisiones. Compra Negocio centraliza la información, cuida la comunicación y registra cada avance.</p>
          </div>
          <div className="method-steps">
            <article><span>01</span><i>Enviar</i><h3>El negocio se presenta</h3><p>El dueño carga sus métricas, valoración, motivo de venta y documentos.</p></article>
            <article><span>02</span><i>Completar</i><h3>La información se organiza</h3><p>Las métricas, la valoración y los documentos quedan asociados a la publicación.</p></article>
            <article><span>03</span><i>Publicar</i><h3>La oportunidad se activa</h3><p>Se muestran sólo los datos necesarios, sin información personal.</p></article>
            <article><span>04</span><i>Negociar</i><h3>Las ofertas quedan registradas</h3><p>Consultas, propuestas y contraofertas avanzan dentro de un mismo proceso.</p></article>
            <article><span>05</span><i>Cerrar</i><h3>El acuerdo se documenta</h3><p>Acompañamos la operación hasta que las condiciones queden definidas.</p></article>
          </div>
        </div>
      </section>
      </>}

      {view === "sell" && <section className="valuation-section shell">
        <div className="valuation-copy">
          <span className="eyebrow">Antes de fijar el precio</span>
          <h2>Un negocio vale más que su facturación.</h2>
          <p>La evaluación se construye con información financiera, operativa y comercial. Por eso pedimos fundamentos y documentación antes de publicar.</p>
          <button className="button button-dark" onClick={openSell}>Presentar mi negocio <span>→</span></button>
        </div>
        <div className="valuation-board">
          <div className="valuation-board-head"><span>Marco de evaluación</span><i>Criterios principales</i></div>
          <div className="valuation-list">
            <article><span>01</span><div><b>Ganancia real</b><p>Ingresos menos gastos y costos necesarios.</p></div><i>Finanzas</i></article>
            <article><span>02</span><div><b>Crecimiento</b><p>Evolución y estabilidad en el tiempo.</p></div><i>Tracción</i></article>
            <article><span>03</span><div><b>Usuarios y clientes</b><p>Actividad, recurrencia y concentración.</p></div><i>Mercado</i></article>
            <article><span>04</span><div><b>Dependencia del dueño</b><p>Procesos, automatización y carga operativa.</p></div><i>Operación</i></article>
            <article><span>05</span><div><b>Activos incluidos</b><p>Marca, tecnología, contenido y acuerdos.</p></div><i>Transferencia</i></article>
          </div>
        </div>
      </section>}

      {(view === "buy" || view === "how") && <section className="security-section">
        <div className="shell security-grid">
          <div className="security-visual">
            <div className="security-orbit orbit-one" /><div className="security-orbit orbit-two" />
            <div className="security-core"><span className="brand-mark"><span>C</span><span>N</span></span><b>Operación central</b><small>Información y ofertas organizadas</small></div>
            <div className="security-node buyer-node"><span>C</span><b>Comprador</b></div>
            <div className="security-node seller-node"><span>V</span><b>Vendedor</b></div>
          </div>
          <div className="security-copy">
            <span className="eyebrow">Privacidad por diseño</span>
            <h2>La negociación no sale de la plataforma.</h2>
            <p>Las partes no reciben datos de contacto entre sí. Las consultas, las ofertas y los próximos pasos quedan organizados dentro de cada operación.</p>
            <ul>
              <li><span>01</span><div><b>Datos personales protegidos</b><p>No publicamos teléfonos, correos ni redes sociales.</p></div></li>
              <li><span>02</span><div><b>Documentos privados</b><p>Los comprobantes permanecen privados y asociados a la operación.</p></div></li>
              <li><span>03</span><div><b>Historial de la operación</b><p>Estados, notas y decisiones quedan organizados dentro del proceso.</p></div></li>
            </ul>
          </div>
        </div>
      </section>}

      {(view === "buy" || view === "sell" || view === "how") && <section className="faq-section shell">
        <div className="faq-heading"><span className="eyebrow">Preguntas frecuentes</span><h2>Lo importante,<br />antes de empezar.</h2><p>Si necesitás analizar un caso particular, registrate y consultá la oportunidad.</p></div>
        <div className="faq-list">
          <details><summary>¿Puedo vender solamente una parte del negocio?<span>+</span></summary><p>Sí. Podés definir el porcentaje disponible y el precio esperado. También podés presentar el negocio completo.</p></details>
          <details><summary>¿Qué necesito para publicar?<span>+</span></summary><p>Una cuenta activa y la información principal del negocio: métricas, valoración, motivo de venta y documentación de respaldo.</p></details>
          <details><summary>¿El comprador puede hablar directamente con el vendedor?<span>+</span></summary><p>No. Las consultas, ofertas y negociaciones se gestionan desde la cuenta, sin exponer datos personales.</p></details>
          <details><summary>¿Puedo negociar el precio publicado?<span>+</span></summary><p>Sí. El comprador presenta una oferta confidencial y Compra Negocio coordina la respuesta, las condiciones y las posibles contraofertas.</p></details>
          <details><summary>¿Qué documentación se solicita?<span>+</span></summary><p>Comprobantes de ingresos, gastos, titularidad, analíticas u otros archivos que permitan respaldar la información declarada.</p></details>
        </div>
      </section>}

      <section className="final-cta">
        <div className="shell final-cta-inner">
          <div><span className="eyebrow">El próximo paso</span><h2>Comprá lo que ya existe.<br /><em>Vendé lo que construiste.</em></h2></div>
          <div><p>Creá tu cuenta para publicar un negocio, seguir tus publicaciones y presentar ofertas sin compartir tus datos con la otra parte.</p><div><button className="button button-white" onClick={() => openAuth("register")}>Crear mi cuenta <span>→</span></button><button className="button button-ghost-white" onClick={openSell}>Publicar negocio</button></div></div>
        </div>
      </section>

      <footer className="footer">
        <div className="shell footer-grid">
          <div className="footer-brand"><Brand /><p>Un espacio para comprar, invertir o vender negocios digitales con más claridad.</p></div>
          <div><b>Marketplace</b><Link href="/negocios">Negocios</Link><Link href="/comprar">Comprar</Link><Link href="/vender">Vender</Link></div>
          <div><b>Conocé más</b><Link href="/como-funciona">Cómo funciona</Link><Link href="/como-funciona">Privacidad</Link><Link href="/como-funciona">Información para operar</Link></div>
          <div><b>Tu cuenta</b>{user ? <><Link href="/cuenta">Mi actividad</Link>{isAdmin && <Link href="/admin">Administración</Link>}</> : <><button onClick={() => openAuth("login")}>Ingresar</button><button onClick={() => openAuth("register")}>Registrarme</button></>}</div>
        </div>
        <div className="shell footer-bottom"><span>© 2026 Compra Negocio</span><span>Negocios digitales, decisiones informadas.</span></div>
      </footer>

      {modal !== "none" && (
        <div className="modal-backdrop">
          <div className={`modal ${modal === "details" ? "details-modal" : ""}`} role="dialog" aria-modal="true" aria-labelledby="modal-title">
            <button className="modal-close" onClick={() => setModal("none")} aria-label="Cerrar">×</button>

            {modal === "auth" && (
              <>
                <span className="modal-label">{authMode === "register" ? "Nueva cuenta" : "Bienvenido nuevamente"}</span>
                <h2 id="modal-title">{authMode === "register" ? "Creá tu cuenta." : "Ingresá a tu cuenta."}</h2>
                {formState !== "success" ? <>
                  {googleAuthEnabled && <><button className="google-button" type="button" onClick={signInWithGoogle} disabled={formState === "loading"}>
                    <span className="google-g" aria-hidden="true">G</span>Continuar con Google
                  </button>
                  <p className="social-terms">Al continuar, aceptás los términos de uso y la política de privacidad.</p>
                  <div className="auth-divider"><span>o con correo electrónico</span></div></>}
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
                <button className="switch-auth" onClick={() => { setAuthMode(authMode === "register" ? "login" : "register"); setMessage(""); setFormState("idle"); }}>{authMode === "register" ? "Ya tengo una cuenta" : "Quiero registrarme"}</button>
              </>
            )}

            {modal === "sell" && (
              <>
                <span className="modal-label">Publicación confidencial</span>
                <h2 id="modal-title">Presentá tu negocio.</h2>
                <p className="modal-intro">Completá los datos del negocio y adjuntá sus documentos privados. Para publicar necesitás una cuenta activa.</p>
                {formState !== "success" ? <form className="form form-grid" onSubmit={submitBusiness}>
                  <div className="form-section-heading wide"><span>01</span><div><b>Información general</b><small>Contanos qué construiste y hace cuánto está activo.</small></div></div>
                  <label>Nombre del negocio<input name="name" required minLength={2} /></label>
                  <label>Sitio web, si existe<input name="website" type="url" placeholder="https://" /></label>
                  <label>Categoría<select name="category" required defaultValue=""><option value="" disabled>Seleccionar</option><option>SaaS</option><option>Herramienta</option><option>Producto digital</option><option>Marketplace</option><option>Contenido</option><option>Otro</option></select></label>
                  <label>Antigüedad en meses<input name="ageMonths" type="number" min="0" max="1200" step="1" required /></label>
                  <div className="form-section-heading wide"><span>02</span><div><b>Métricas y valoración</b><small>Ingresá cifras actuales para que la oportunidad sea fácil de comparar.</small></div></div>
                  <label>Ingreso mensual en USD<input name="revenue" type="number" min="0" step="0.01" required /></label>
                  <label>Gastos mensuales en USD<input name="expenses" type="number" min="0" step="0.01" required /></label>
                  <label>Ganancia mensual en USD<input name="profit" type="number" step="0.01" required /></label>
                  <label>Usuarios o clientes activos<input name="activeUsers" type="number" min="0" step="1" required /></label>
                  <label>Porcentaje a vender<input name="stake" type="number" min="0.01" max="100" step="0.01" required /></label>
                  <label>Precio esperado en USD<input name="price" type="number" min="1" step="0.01" required /></label>
                  <label className="wide">Valoración total estimada en USD<input name="valuation" type="number" min="1" step="0.01" required /></label>
                  <div className="form-section-heading wide"><span>03</span><div><b>Historia del negocio</b><small>Explicá con claridad qué recibe el comprador y por qué vendés.</small></div></div>
                  <label className="wide">Descripción pública del negocio<textarea name="description" required minLength={20} rows={4} /><small>Sin correos, teléfonos, enlaces ni usuarios de redes.</small></label>
                  <label className="wide">Motivo de venta<textarea name="reasonForSale" required minLength={10} maxLength={1500} rows={3} /><small>Esta información forma parte de la publicación.</small></label>
                  <label className="wide">Cómo calculaste la valoración<textarea name="valuationBasis" required minLength={20} maxLength={2000} rows={4} placeholder="Ingresos, ganancia, crecimiento, activos incluidos y criterio utilizado." /></label>
                  <div className="form-section-heading wide"><span>04</span><div><b>Documentación</b><small>Adjuntá archivos que respalden los datos declarados.</small></div></div>
                  <label>Tipo de comprobante<select name="documentKind" required defaultValue="revenue">{Object.entries(documentKindLabel).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
                  <label>Comprobantes privados<input name="documents" type="file" required multiple accept=".pdf,.png,.jpg,.jpeg,.webp,.csv,.xls,.xlsx" /></label>
                  <p className="private-upload-note wide">Hasta 6 archivos de 10 MB. Permanecen privados y nunca se muestran en la publicación.</p>
                  {message && <p className="form-message wide">{message}</p>}
                  <button className="button button-primary full wide" disabled={formState === "loading"}>{formState === "loading" ? "Enviando…" : "Enviar publicación"}</button>
                </form> : <div className="form-success"><span>✓</span><p>{message}</p><Link className="button button-primary" href="/cuenta">Ver mi cuenta</Link></div>}
              </>
            )}

            {modal === "details" && selectedBusiness && (
              <OpportunityDetails business={selectedBusiness} onConsult={() => openOffer(selectedBusiness)} />
            )}

            {modal === "offer" && selectedBusiness && (
              <>
                <span className="modal-label">Consulta privada</span>
                <h2 id="modal-title">Consultá por {selectedBusiness.name}.</h2>
                <p className="modal-intro">Contanos qué necesitás saber y qué propuesta querés presentar.</p>
                {formState !== "success" ? <form className="form" onSubmit={submitOffer}>
                  <label>Monto propuesto en USD<input name="amount" type="number" min="1" step="0.01" required /></label>
                  <label>Consulta o condiciones<textarea name="offerMessage" rows={4} minLength={10} required placeholder="Preguntas, condiciones o información que necesitás." /></label>
                  {message && <p className="form-message">{message}</p>}
                  <button className="button button-primary full" disabled={formState === "loading"}>{formState === "loading" ? "Enviando…" : "Enviar consulta y propuesta"}</button>
                </form> : <div className="form-success"><span>✓</span><p>{message}</p><Link className="button button-primary" href="/cuenta">Ver mis ofertas</Link></div>}
              </>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

