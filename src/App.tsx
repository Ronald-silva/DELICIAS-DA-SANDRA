import { FormEvent, Fragment, type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Link, Outlet, useLocation, useNavigate, useOutletContext, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Clipboard, GiftBox, MessageCircle, Minus, Plus, RotateCcw, Send } from "lucide-react";
import { calculateLinePrice, type PricingProduct } from "./lib/pricing";
import { hasRealProductImage, productImageSrc } from "./lib/media";
import { isStructuredWeeklyHours, summarizeWeeklyHoursBR, type StructuredWeeklyHours } from "./lib/business-hours";
import { formatCurrency } from "./lib/format";
import { AdminOperations } from "./AdminOperations";
import { buildOrderWhatsappLink, buildOrderWhatsappMessage, buildWhatsappLink, isValidWhatsappNumber } from "./lib/whatsapp";
import { paymentLabel } from "./lib/payment";
import { maskCurrencyBRL, maskPhoneBR } from "./lib/mask";

type Product = PricingProduct & { id: string; slug: string; name: string; menuName?: string; menuGroup?: string; sizeLabel?: string; description: string; category: string; imageUrl: string; isActive: boolean; isAvailable: boolean; isFeatured: boolean; isDay?: boolean; displayOrder: number; ingredients?: string; allergens?: string; updatedAt: string };
type Business = { name: string; tagline: string; description: string; phone: string; whatsapp: string; responsibleName?: string; address: string; addressReference?: string; hours: string; operatingHours?: StructuredWeeklyHours; instagram: string; pickupEnabled: boolean; deliveryEnabled: boolean; pickupSlots: string[]; paymentMethods: string[]; deliveryFee: number; receivedMessage: string; availabilityNotice: string; isDemo: boolean };
type CartLine = { product: Product; quantity: number };
type OrderHandoff = { link: string; message: string };
// "landing" = vitrine (domínio principal, indexável, só mostra o cardápio).
// "app" = sistema de pedidos (subdomínio). "single" = os dois juntos.
type SiteConfig = { role: "landing" | "app" | "single"; appUrl: string };
// Na vitrine, montar pedido acontece no outro endereço: o navegador guarda o
// carrinho por origem, então o que fosse montado aqui não chegaria lá.
// Devolve null quando o pedido é montado na própria página.
type OrderHref = ((slug?: string) => string) | null;
async function api<T>(url: string, options?: RequestInit): Promise<T> { const response = await fetch(url, { headers: { "Content-Type": "application/json", ...(options?.headers || {}) }, ...options }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "Não foi possível concluir a ação."); return data; }
function BrandLogo({ compact = false }: { compact?: boolean }) { return <img className={compact ? "brand-logo compact" : "brand-logo"} src="/brand/delicias-da-sandra-logo.webp?v=3" alt="Delícias da Sandra" width={512} height={512} decoding="async" />; }

// O atendimento pode enviar um link oficial wa.me. Mensagens de chat são
// texto puro; este renderer promove somente URLs do WhatsApp a links seguros
// e clicáveis, preservando o restante literalmente (sem HTML injetado).
function renderChatText(text: string): ReactNode[] {
  const parts = text.split(/(https:\/\/wa\.me\/[^\s]+)/g);
  return parts.map((part, index) => part.startsWith("https://wa.me/")
    ? <a key={`link-${index}`} className="agent-chat-link" href={part} target="_blank" rel="noopener noreferrer">Abrir WhatsApp</a>
    : <Fragment key={`text-${index}`}>{part}</Fragment>);
}

export type AppContext = { business: Business; products: Product[]; cart: CartLine[]; add: (p: Product, q?: number) => void; change: (id: string, q: number) => void; clearCart: () => void; summary: { subtotal: number; discount: number }; orderHref: OrderHref };

export default function App() {
  const [business, setBusiness] = useState<Business | null>(null); const [products, setProducts] = useState<Product[]>([]); const [cart, setCart] = useState<CartLine[]>(() => { try { const raw = sessionStorage.getItem("bf-cart"); return raw ? JSON.parse(raw) : []; } catch { return []; } }); const [notice, setNotice] = useState(""); const [addedNotice, setAddedNotice] = useState<{ id: number; text: string } | null>(null); const [site, setSite] = useState<SiteConfig>({ role: "single", appUrl: "" });
  const addedNoticeId = useRef(0);
  const navigate = useNavigate();
  const refresh = async () => {
    const [b, p] = await Promise.all([api<Business>("/api/public/business"), api<Product[]>("/api/public/menu")]);
    setBusiness(b); setProducts(p);
    setCart(lines => lines.flatMap(line => {
      const current = p.find(product => product.id === line.product.id && product.isAvailable);
      return current ? [{ product: current, quantity: line.quantity }] : [];
    }));
    // Falha aqui não pode derrubar o cardápio: sem a configuração, o site se
    // comporta como endereço único, que é o modo completo.
    api<SiteConfig>("/api/public/site").then(setSite).catch(() => undefined);
  };
  useEffect(() => { refresh().catch(error => setNotice(error.message)); }, []);
  useEffect(() => { try { sessionStorage.setItem("bf-cart", JSON.stringify(cart)); } catch { /* ignore storage failures (quota exceeded, private browsing) — cart still works in-memory for this session */ } }, [cart]);
  useEffect(() => { if (!addedNotice) return; const timer = setTimeout(() => setAddedNotice(null), 2600); return () => clearTimeout(timer); }, [addedNotice]);
  const add = (product: Product, quantity = 1) => { if (!product.isAvailable) return; setCart(lines => { const found = lines.find(line => line.product.id === product.id); return found ? lines.map(line => line.product.id === product.id ? { ...line, quantity: line.quantity + quantity } : line) : [...lines, { product, quantity }]; }); addedNoticeId.current += 1; setAddedNotice({ id: addedNoticeId.current, text: `${product.name} adicionado ao pedido` }); };
  const change = (id: string, quantity: number) => setCart(lines => quantity < 1 ? lines.filter(line => line.product.id !== id) : lines.map(line => line.product.id === id ? { ...line, quantity } : line));
  const clearCart = () => setCart([]);
  const summary = useMemo(() => { const totalQuantity = cart.reduce((sum, line) => sum + line.quantity, 0); return cart.reduce((acc, line) => { const price = calculateLinePrice(line.product, line.quantity, totalQuantity); return { subtotal: acc.subtotal + price.total, discount: acc.discount + price.discount }; }, { subtotal: 0, discount: 0 }); }, [cart]);
  if (!business) return <main className="loading">Carregando cardápio…</main>;
  const isVitrine = site.role === "landing" && Boolean(site.appUrl);
  const orderHref: OrderHref = isVitrine ? (slug?: string) => `${site.appUrl}${slug ? `/cardapio/${slug}` : "/cardapio"}` : null;
  const context: AppContext = { business, products, cart, add, change, clearCart, summary, orderHref };
  return <main className="app-shell"><header className="public-header"><button className="brand" onClick={() => navigate("/")} aria-label="Ir para o início"><BrandLogo compact /></button>{orderHref ? <a className="cart-button" href={orderHref()} aria-label="Fazer pedido"><GiftBox size={19} aria-hidden="true" /></a> : <button className="cart-button" onClick={() => navigate("/carrinho")} aria-label="Abrir pedido"><GiftBox size={19} aria-hidden="true" />{cart.length > 0 && <b key={cart.reduce((n, l) => n + l.quantity, 0)}>{cart.reduce((n, l) => n + l.quantity, 0)}</b>}</button>}</header>{notice && <div className="toast" role="status">{notice}<button onClick={() => setNotice("")}>×</button></div>}{addedNotice && <div key={addedNotice.id} className="added-toast" role="status">{addedNotice.text}</div>}<Outlet context={context} /></main>;
}

function HomeRoute() {
  const { business, products, cart, add, orderHref } = useOutletContext<AppContext>();
  const navigate = useNavigate();
  return <Home business={business} products={products} cart={cart} onMenu={() => navigate("/cardapio")} onProduct={p => navigate(`/cardapio/${p.slug}`)} onAdd={add} onAgent={() => navigate("/assistente")} orderHref={orderHref} />;
}
function MenuRoute() {
  const { products, cart, add, orderHref } = useOutletContext<AppContext>();
  const navigate = useNavigate();
  return <Menu products={products} cart={cart} onBack={() => navigate("/")} onProduct={p => navigate(`/cardapio/${p.slug}`)} onAdd={add} orderHref={orderHref} />;
}
function ProductRoute() {
  const { products, add, cart, orderHref } = useOutletContext<AppContext>();
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const product = products.find(p => p.slug === slug);
  if (!product) return <main className="loading">Produto não encontrado.</main>;
  const variants = products.filter(p => (p.menuGroup || p.id) === (product.menuGroup || product.id));
  const recommendations = products.filter(p => p.isFeatured && (p.menuGroup || p.id) !== (product.menuGroup || product.id) && p.isAvailable).filter((p, i, list) => list.findIndex(other => (other.menuGroup || other.id) === (p.menuGroup || p.id)) === i).slice(0, 2);
  return <ProductDetail product={product} variants={variants} recommendations={recommendations} cart={cart} onBack={() => navigate("/cardapio")} onAdd={add} orderHref={orderHref} />;
}
function CartRoute() {
  const { cart, summary, change, orderHref } = useOutletContext<AppContext>();
  const navigate = useNavigate();
  // Na vitrine estas etapas vivem no outro endereço.
  useEffect(() => { if (orderHref) window.location.replace(orderHref()); }, [orderHref]);
  if (orderHref) return <main className="loading">Abrindo o sistema de pedidos…</main>;
  return <Cart lines={cart} subtotal={summary.subtotal} discount={summary.discount} onBack={() => navigate("/cardapio")} onChange={change} onCheckout={() => navigate("/finalizar")} />;
}
function CheckoutRoute() {
  const { business, cart, summary, orderHref } = useOutletContext<AppContext>();
  const navigate = useNavigate();
  useEffect(() => { if (orderHref) window.location.replace(orderHref()); }, [orderHref]);
  if (orderHref) return <main className="loading">Abrindo o sistema de pedidos…</main>;
  // O carrinho é preservado de propósito: se o WhatsApp não abrir, a pessoa
  // volta e tenta de novo sem remontar o pedido.
  return <Checkout business={business} lines={cart} summary={summary} onBack={() => navigate("/carrinho")} onSent={handoff => navigate("/pedido/enviado", { state: handoff })} />;
}
function OrderHandoffRoute() {
  const { clearCart } = useOutletContext<AppContext>();
  const location = useLocation();
  const navigate = useNavigate();
  const handoff = (location.state as OrderHandoff | null) ?? null;
  // Sem o estado da navegação não existe mensagem para reenviar (recarregou a
  // página ou abriu o link direto): volta ao carrinho, que continua montado.
  useEffect(() => { if (!handoff?.link) navigate("/carrinho", { replace: true }); }, [handoff, navigate]);
  if (!handoff?.link) return <main className="loading">Carregando pedido…</main>;
  return <OrderHandoffView link={handoff.link} message={handoff.message} onMenu={() => navigate("/cardapio")} onClear={() => { clearCart(); navigate("/cardapio"); }} />;
}
function AdminRoute() {
  const navigate = useNavigate();
  return <AdminOperations onExit={() => navigate("/")} />;
}
function AgentDemoRoute() {
  const navigate = useNavigate();
  return <AgentDemo onBack={() => navigate("/")} />;
}
export { HomeRoute, MenuRoute, ProductRoute, CartRoute, CheckoutRoute, OrderHandoffRoute, AdminRoute, AgentDemoRoute };

function groupMenuProducts(products: Product[]): Product[][] {
  const groups = new Map<string, Product[]>();
  for (const product of products) {
    const key = product.menuGroup || product.id;
    groups.set(key, [...(groups.get(key) || []), product]);
  }
  return [...groups.values()];
}

function menuDisplayName(product: Product): string {
  return product.menuName && product.name.startsWith(product.menuName) ? product.menuName : product.name;
}

// ---------------------------------------------------------------------------
// Vitrine pública.
//
// Regra que governa este componente: nada é afirmado que não esteja no Store.
// Enquanto `business.isDemo` for true, o cardápio cadastrado aparece como
// demonstração. A semente atual já contém os produtos informados pela Sandra.
// Endereço, WhatsApp, horário e formas de pagamento vêm do Store e já são
// reais; por isso aparecem, e só quando preenchidos.
//
// O que NÃO existe mais aqui, de propósito: "mais pedidos hoje", "quem
// experimenta volta" e "quantidade limitada". Eram prova social e escassez
// inventadas — o princípio 10 da bíblia de experiência proíbe exatamente isso.
// ---------------------------------------------------------------------------

function instagramUrl(handle: string | undefined): string | null {
  const user = (handle ?? "").trim().replace(/^@/, "");
  return /^[A-Za-z0-9._]{1,30}$/.test(user) ? `https://instagram.com/${user}` : null;
}

// O horário estruturado é a fonte boa; `business.hours` é o campo livre
// antigo e só entra se o estruturado não render nada.
function openingHoursText(business: Business): string {
  const structured = isStructuredWeeklyHours(business.operatingHours) ? summarizeWeeklyHoursBR(business.operatingHours) : "";
  return structured || (business.hours ?? "").trim();
}

function HeroVideo() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [reduceMotion, setReduceMotion] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const [playing, setPlaying] = useState(false);
  const [videoError, setVideoError] = useState(false);

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => setReduceMotion(preference.matches);
    preference.addEventListener("change", onChange);
    return () => preference.removeEventListener("change", onChange);
  }, []);
  useEffect(() => { if (reduceMotion) videoRef.current?.pause(); }, [reduceMotion]);

  const togglePlayback = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play().catch(() => setPlaying(false));
    else video.pause();
  };

  return <figure className="v-hero-photo">
    <video ref={videoRef} autoPlay={!reduceMotion} muted loop playsInline preload={reduceMotion ? "none" : "metadata"} poster="/video-banner-poster.webp" aria-hidden="true" onPlay={() => setPlaying(true)} onPause={() => setPlaying(false)} onError={() => setVideoError(true)}>
      <source src="/video-banner-loop.mp4" type="video/mp4" />
    </video>
    <figcaption className="sr-only">Bolo de chocolate com cobertura de brigadeiro.</figcaption>
    {!videoError && <button type="button" className="v-video-control" onClick={togglePlayback}>{playing ? "Pausar vídeo" : "Reproduzir vídeo"}</button>}
  </figure>;
}

function Home({ business, products, cart, onMenu, onProduct, onAdd, onAgent, orderHref }: { business: Business; products: Product[]; cart: CartLine[]; onMenu: () => void; onProduct: (p: Product) => void; onAdd: (p: Product) => void; onAgent: () => void; orderHref: OrderHref }) {
  const quantityOf = (id: string) => cart.find(l => l.product.id === id)?.quantity ?? 0;
  const whatsappLink = buildWhatsappLink(business.whatsapp);
  const instagram = instagramUrl(business.instagram);
  const isDemo = business.isDemo === true;
  const available = products.filter(p => p.isActive !== false);
  const featured = available.filter(p => p.isFeatured);
  const showcase = groupMenuProducts(featured.length > 0 ? featured : available).slice(0, 3);
  const hours = openingHoursText(business);
  const payments = (business.paymentMethods ?? []).map(paymentLabel).filter(Boolean);
  const menuHeading = isDemo ? "Exemplos de como o cardápio aparece" : "Nosso cardápio";

  return <div className="vitrine">
    <section className="v-hero" aria-labelledby="hero-title">
      <div className="v-hero-copy">
        <p className="v-hero-eyebrow">Confeitaria artesanal · Fortaleza</p>
        <h1 id="hero-title">Bolos, doces e salgados feitos com carinho.</h1>
        {business.description && <p className="v-hero-lead">{business.description}</p>}
        <div className="v-hero-actions">
          {orderHref
            ? <a className="primary" href={orderHref()}>Fazer meu pedido <ChevronRight size={18} aria-hidden="true" /></a>
            : <Link className="primary" to="/cardapio">Montar meu pedido <ChevronRight size={18} aria-hidden="true" /></Link>}
          <Link className="secondary" to="/cardapio">Ver o cardápio</Link>
        </div>
        <ul className="v-facts">
          {business.address && <li className="v-fact"><b>Retirada</b><span>{business.address}{business.addressReference ? ` · ${business.addressReference}` : ""}</span></li>}
          {hours && <li className="v-fact"><b>Atendimento</b><span>{hours}</span></li>}
          {payments.length > 0 && <li className="v-fact"><b>Pagamento</b><span>{payments.join(" · ")}</span></li>}
        </ul>
      </div>
      <HeroVideo />
    </section>

    <section className="v-section" aria-labelledby="menu-title">
      <div className="v-head-row">
        <div className="v-head">
          <p className="v-eyebrow">{isDemo ? "Cardápio de demonstração" : "Cardápio"}</p>
          <h2 id="menu-title">{menuHeading}</h2>
          {isDemo && <p>Assim que a Sandra cadastrar os sabores, os preços e as fotos dela, é exatamente aqui que eles aparecem.</p>}
        </div>
      </div>
      <div className="v-menu-grid">
        {showcase.map(group => { const p = group.find(item => item.isAvailable) || group[0]!; return <ProductCard key={p.id} product={p} variants={group} to={`/cardapio/${p.slug}`} isDay={p.isDay === true} quantity={group.reduce((sum, item) => sum + quantityOf(item.id), 0)} onClick={() => onProduct(p)} onAdd={() => onAdd(p)} orderHref={orderHref} />; })}
      </div>
      <div className="v-menu-all"><Link className="secondary" to="/cardapio">Ver o cardápio completo</Link></div>
    </section>

    <section className="v-steps" aria-labelledby="steps-title">
      <div className="v-head">
        <p className="v-eyebrow">Como pedir</p>
        <h2 id="steps-title">Seu pedido está a poucos passos.</h2>
      </div>
      <ol className="v-steps-list">
        <li><b>01</b><strong>Escolha no cardápio</strong><span>Monte o pedido com o que estiver disponível no dia.</span></li>
        <li><b>02</b><strong>Envie pelo WhatsApp</strong><span>O pedido chega pronto na conversa, com itens e total.</span></li>
        <li><b>03</b><strong>Combine a retirada</strong><span>A Sandra confirma e acerta com você o melhor horário.</span></li>
      </ol>
    </section>

    {(business.address || hours || payments.length > 0 || whatsappLink) && <section className="v-section" aria-labelledby="info-title">
      <div className="v-head">
        <p className="v-eyebrow">Informações</p>
        <h2 id="info-title">O que você precisa saber.</h2>
      </div>
      <div className="v-info-grid">
        {business.address && <div className="v-info-card">
          <b>Onde retirar</b>
          <address>{business.address}</address>
          {business.addressReference && <p>{business.addressReference}</p>}
        </div>}
        {hours && <div className="v-info-card">
          <b>Horário de atendimento</b>
          <p>{hours}</p>
        </div>}
        {payments.length > 0 && <div className="v-info-card">
          <b>Formas de pagamento</b>
          <p>{payments.join(" · ")}</p>
          <p>{business.deliveryEnabled ? "Retirada e entrega." : "Somente retirada no local."}</p>
        </div>}
        {whatsappLink && <div className="v-info-card">
          <b>Falar com a gente</b>
          <p><a href={whatsappLink} target="_blank" rel="noopener noreferrer">Chamar no WhatsApp</a></p>
          {business.responsibleName && <p>Atendimento com {business.responsibleName}.</p>}
        </div>}
      </div>
      {business.availabilityNotice && <p className="subtle v-menu-all">{business.availabilityNotice}</p>}
    </section>}

    <section className="v-section">
      <div className="v-assistant" aria-labelledby="assistant-title">
        <div>
          <p className="v-eyebrow">Atendimento automático</p>
          <h2 id="assistant-title">Assistente de pedidos</h2>
          <p>Responde com base no cardápio cadastrado no sistema e ajuda a montar o pedido. {isDemo ? "Em demonstração, junto com o cardápio de exemplo." : "Disponível para testar."}</p>
        </div>
        {orderHref
          ? <a className="secondary" href={`${orderHref().replace(/\/cardapio$/, "")}/assistente`}>Conversar com a assistente <MessageCircle size={18} aria-hidden="true" /></a>
          : <button className="secondary" onClick={onAgent}>Conversar com a assistente <MessageCircle size={18} aria-hidden="true" /></button>}
      </div>
    </section>

    <footer className="v-footer">
      <img className="v-footer-mark" src="/brand/delicias-da-sandra-logo.webp?v=3" alt="" width={512} height={512} loading="lazy" decoding="async" />
      <div className="v-footer-body">
        <p className="v-footer-name">{business.name}</p>
        <div className="v-footer-cols">
          {business.address && <div className="v-footer-col"><b>Retirada</b><address>{business.address}{business.addressReference ? ` · ${business.addressReference}` : ""}</address></div>}
          {hours && <div className="v-footer-col"><b>Horário</b><span>{hours}</span></div>}
          {whatsappLink && <div className="v-footer-col"><b>WhatsApp</b><span><a href={whatsappLink} target="_blank" rel="noopener noreferrer">Fazer pedido pelo WhatsApp</a></span></div>}
          {instagram && <div className="v-footer-col"><b>Instagram</b><span><a href={instagram} target="_blank" rel="noopener noreferrer">{business.instagram}</a></span></div>}
        </div>
        {isDemo && <p className="v-footer-legal">Cardápio em modo demonstração: sabores, preços e fotos ainda não são os da Delícias da Sandra.</p>}
      </div>
    </footer>
  </div>;
}

type DemoMenuProduct = { id: string; name: string; basePrice: number };
type DemoChatMessage = { id: string; author: "agent" | "visitor"; text: string; metadata?: { pixKey?: string; products?: DemoMenuProduct[] } };
function newDemoSessionId() { return crypto.randomUUID().replaceAll("-", ""); }
function AgentMenuCarousel({ products }: { products: DemoMenuProduct[] }) {
  return <div className="agent-menu" aria-label="Cardápio disponível"><p>Aqui está o nosso cardápio:</p><div className="agent-menu-carousel" tabIndex={0} aria-label="Deslize para ver todos os sabores">{products.map(product => <article className="agent-menu-card" key={product.id}><strong>{product.name}</strong><span>{formatCurrency(product.basePrice)}</span></article>)}</div></div>;
}
function AgentDemo({ onBack }: { onBack: () => void }) {
  const [sessionId, setSessionId] = useState(newDemoSessionId);
  const [messages, setMessages] = useState<DemoChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [copiedPixKey, setCopiedPixKey] = useState<string | null>(null);
  const messagesViewportRef = useRef<HTMLDivElement | null>(null);
  const composerInputRef = useRef<HTMLInputElement | null>(null);
  const composerRef = useRef<HTMLFormElement | null>(null);
  const shouldStickToBottomRef = useRef(true);
  const initializedSessionRef = useRef("");
  const copiedPixTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const send = async (rawText: string) => {
    const text = rawText.trim();
    if (!text || loading) return;
    shouldStickToBottomRef.current = true;
    setError(""); setDraft(""); setLoading(true);
    setMessages(current => [...current, { id: `visitor-${crypto.randomUUID()}`, author: "visitor", text }]);
    try {
      const response = await api<{ messages: { id: string; text: string; metadata?: { pixKey?: string; products?: DemoMenuProduct[] } }[] }>("/api/public/agent/messages", { method: "POST", body: JSON.stringify({ sessionId, text }) });
      setMessages(current => [...current, ...response.messages.map(message => ({ ...message, author: "agent" as const }))]);
    } catch (caught) { setError(caught instanceof Error ? caught.message : "Não foi possível falar com a assistente."); }
    finally { setLoading(false); }
  };
  const copyPixKey = async (pixKey: string) => {
    try {
      await navigator.clipboard.writeText(pixKey);
      setCopiedPixKey(pixKey);
      if (copiedPixTimerRef.current) clearTimeout(copiedPixTimerRef.current);
      copiedPixTimerRef.current = setTimeout(() => setCopiedPixKey(current => current === pixKey ? null : current), 1_800);
    } catch {
      setError("Não foi possível copiar a chave PIX. Tente selecionar e copiar o texto.");
    }
  };
  useEffect(() => () => { if (copiedPixTimerRef.current) clearTimeout(copiedPixTimerRef.current); }, []);
  useEffect(() => {
    const viewport = messagesViewportRef.current;
    if (!viewport || !shouldStickToBottomRef.current) return;
    viewport.scrollTo({ top: viewport.scrollHeight, behavior: messages.length <= 1 ? "auto" : "smooth" });
  }, [messages, loading]);
  // O Safari mantém o layout viewport com a altura original quando o teclado
  // aparece. Nesse caso, o teclado pode cobrir o composer mesmo com unidades
  // dinâmicas no CSS. Observamos a VisualViewport e deslocamos a página só
  // enquanto o campo do chat estiver em foco.
  useEffect(() => {
    const input = composerInputRef.current;
    if (!input) return;
    let frame = 0;
    const keepComposerVisible = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (document.activeElement !== input) return;
        const visualViewport = window.visualViewport;
        if (!visualViewport) {
          input.scrollIntoView({ block: "nearest" });
          return;
        }
        const composerBottom = composerRef.current?.getBoundingClientRect().bottom;
        const visibleBottom = visualViewport.height - 12;
        if (composerBottom && composerBottom > visibleBottom) {
          window.scrollBy({ top: composerBottom - visibleBottom, behavior: "auto" });
        }
      });
    };
    const visualViewport = window.visualViewport;
    input.addEventListener("focus", keepComposerVisible);
    visualViewport?.addEventListener("resize", keepComposerVisible);
    visualViewport?.addEventListener("scroll", keepComposerVisible);
    return () => {
      cancelAnimationFrame(frame);
      input.removeEventListener("focus", keepComposerVisible);
      visualViewport?.removeEventListener("resize", keepComposerVisible);
      visualViewport?.removeEventListener("scroll", keepComposerVisible);
    };
  }, []);
  const handleMessagesScroll = () => {
    const viewport = messagesViewportRef.current;
    if (!viewport) return;
    shouldStickToBottomRef.current = viewport.scrollHeight - viewport.scrollTop - viewport.clientHeight < 56;
  };
  const restart = () => { const nextSession = newDemoSessionId(); setSessionId(nextSession); setMessages([]); setError(""); setDraft(""); };
  useEffect(() => {
    if (initializedSessionRef.current === sessionId) return;
    initializedSessionRef.current = sessionId;
    void send("Olá");
  }, [sessionId]); // eslint-disable-line react-hooks/exhaustive-deps
  return <section className="section page agent-demo-page"><Back onClick={onBack} /><div className="agent-demo-heading"><div><p className="eyebrow">DEMONSTRAÇÃO AO VIVO</p><h1>A assistente que atende enquanto você produz.</h1><p className="subtle">Este chat usa o mesmo cérebro do atendimento. É uma simulação segura: nenhum pedido é enviado para a produção.</p></div><button className="secondary agent-reset" onClick={restart} disabled={loading}><RotateCcw size={16} aria-hidden="true" /> Recomeçar</button></div><div className="agent-chat" aria-label="Conversa com a assistente"><div className="agent-chat-top"><span className="agent-status"><i /> Assistente Delícias da Sandra</span><small>online para demonstração</small></div><div className="agent-messages" ref={messagesViewportRef} onScroll={handleMessagesScroll} aria-live="polite">{messages.map(message => <div className={`agent-message ${message.author}`} key={message.id}><div>{message.author === "agent" && message.metadata?.products?.length ? <AgentMenuCarousel products={message.metadata.products} /> : <span>{renderChatText(message.text)}</span>}{message.author === "agent" && message.metadata?.pixKey && <button className="agent-copy-pix" type="button" onClick={() => void copyPixKey(message.metadata!.pixKey!)}>{copiedPixKey === message.metadata.pixKey ? "Copiado!" : "Copiar chave PIX"}</button>}</div></div>)}{loading && <div className="agent-message agent typing" aria-label="Assistente digitando"><span><i /><i /><i /></span></div>}</div><form ref={composerRef} className="agent-composer" onSubmit={event => { event.preventDefault(); void send(draft); }} aria-busy={loading}><input ref={composerInputRef} value={draft} onChange={event => setDraft(event.target.value)} placeholder="Escreva sua mensagem…" maxLength={1500} aria-label="Sua mensagem" autoComplete="off" /><button className="primary" disabled={loading || !draft.trim()} aria-label="Enviar mensagem"><Send size={18} aria-hidden="true" /></button></form></div>{error && <p className="error">{error}</p>}<div className="agent-prompts"><span>Experimente:</span>{["Quais bolos vocês têm?", "Quero um bolo de milho de 600 g", "Como posso pagar?"].map(prompt => <button key={prompt} className="choice" onClick={() => void send(prompt)} disabled={loading}>{prompt}</button>)}</div></section>;
}
function Menu({ products, cart, onBack, onProduct, onAdd, orderHref }: { products: Product[]; cart: CartLine[]; onBack: () => void; onProduct: (p: Product) => void; onAdd: (p: Product) => void; orderHref: OrderHref }) {
  const ordered = [...products].sort((a,b) => Number(b.isDay === true) - Number(a.isDay === true) || Number(b.isFeatured) - Number(a.isFeatured) || Number(b.isAvailable) - Number(a.isAvailable) || a.displayOrder - b.displayOrder);
  const groups = groupMenuProducts(ordered);
  const quantityOf = (id: string) => cart.find(l => l.product.id === id)?.quantity ?? 0;
  return <section className="section page menu-page"><Back onClick={onBack} /><p className="eyebrow">CARDÁPIO ATUALIZADO</p><h1>Bolos e salgados da Sandra.</h1><p className="subtle">Escolha seu favorito e confira os tamanhos disponíveis.</p><h2 className="sr-only">Produtos disponíveis</h2><div className="product-grid menu-grid">{groups.map(group => { const p = group.find(item => item.isAvailable) || group[0]!; return <ProductCard key={p.id} product={p} variants={group} to={`/cardapio/${p.slug}`} isDay={p.isDay === true} quantity={group.reduce((sum, item) => sum + quantityOf(item.id), 0)} onClick={() => onProduct(p)} onAdd={() => onAdd(p)} orderHref={orderHref} />; })}</div></section>;
}
// A área clicável do cartão é um link quando há destino — para que o
// rastreador siga o produto — e continua um botão quando não há.
function ProductMain({ to, onClick, children }: { to?: string; onClick: () => void; children: ReactNode }) {
  return to
    ? <Link className="product-main" to={to}>{children}</Link>
    : <button className="product-main" onClick={onClick}>{children}</button>;
}
function ProductCard({ product, variants = [product], isDay = false, quantity = 0, to, onClick, onAdd, orderHref }: { key?: string; product: Product; variants?: Product[]; isDay?: boolean; quantity?: number; to?: string; onClick: () => void; onAdd?: () => void; orderHref?: OrderHref }) {
  const promo = product.promotionalPrice && product.minimumPromotionalQuantity;
  const inCart = quantity > 0;
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  const handleAdd = () => { onAdd?.(); setJustAdded(true); if (addedTimer.current) clearTimeout(addedTimer.current); addedTimer.current = setTimeout(() => setJustAdded(false), 800); };
  const hasOptions = variants.length > 1;
  const available = variants.some(item => item.isAvailable);
  return <article className={`product-card ${!available ? "sold-out" : ""}${inCart ? " in-cart" : ""}`}>
    <ProductMain to={to} onClick={onClick}>
      <div className="product-photo"><img loading="lazy" decoding="async" src={productImageSrc(product)} alt={hasRealProductImage(product) ? `${menuDisplayName(product)} — Delícias da Sandra` : `Imagem ilustrativa; a foto de ${menuDisplayName(product)} ainda não foi cadastrada`} />{isDay && <span className="day-badge">Destaque do dia</span>}{!hasRealProductImage(product) && <span className="photo-note">Foto ilustrativa</span>}</div>
      <div className="product-copy"><p className="product-category">{product.category}</p><h3>{menuDisplayName(product)}</h3>{hasOptions || product.sizeLabel ? <div className="product-sizes">{variants.map(item => <span key={item.id}>{item.sizeLabel && <b>{item.sizeLabel}</b>}<strong>{formatCurrency(item.basePrice)}</strong></span>)}</div> : <strong>{formatCurrency(product.basePrice)}</strong>}{promo && <small className="promo">{formatCurrency(product.promotionalPrice!)} cada a partir de {product.minimumPromotionalQuantity} un. no pedido</small>}</div>
    </ProductMain>
    <div className="product-footer"><span className={available ? "available" : "unavailable"}>{available ? "Disponível hoje" : "Indisponível hoje"}{inCart && <b className="in-cart-count"> · {quantity} no pedido</b>}</span>{hasOptions ? (orderHref ? <a className="product-options-link" href={orderHref(product.slug)}>Ver tamanhos</a> : <Link className="product-options-link" to={`/cardapio/${product.slug}`}>Ver tamanhos</Link>) : orderHref ? (available ? <a className="add-icon" href={orderHref(product.slug)} aria-label={`Fazer pedido de ${product.name}`}><Plus size={18} aria-hidden="true" /></a> : <span className="add-icon" aria-hidden="true">—</span>) : onAdd && <button disabled={!available} className={`add-icon${justAdded ? " added" : ""}${inCart ? " in-cart-icon" : ""}`} onClick={handleAdd} aria-label={`Adicionar ${product.name} ao pedido`}>{available ? <Plus size={18} aria-hidden="true" /> : "—"}</button>}</div>
  </article>;
}
function ProductDetail({ product, variants, recommendations, cart, onBack, onAdd, orderHref }: { product: Product; variants: Product[]; recommendations: Product[]; cart: CartLine[]; onBack: () => void; onAdd: (p: Product, q: number) => void; orderHref: OrderHref }) {
  const [quantity, setQuantity] = useState(1);
  const [justAdded, setJustAdded] = useState(false);
  const addedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => { if (addedTimer.current) clearTimeout(addedTimer.current); }, []);
  const cartQuantity = cart.reduce((sum, line) => sum + line.quantity, 0);
  const price = calculateLinePrice(product, quantity, cartQuantity + quantity);
  const handleAdd = () => { onAdd(product, quantity); setJustAdded(true); if (addedTimer.current) clearTimeout(addedTimer.current); addedTimer.current = setTimeout(() => setJustAdded(false), 800); };
  return <section className="section page product-page">
    <Back onClick={onBack} />
    <figure className="product-hero-photo"><img src={productImageSrc(product)} alt={hasRealProductImage(product) ? `${menuDisplayName(product)} — Delícias da Sandra` : `Imagem ilustrativa de ${product.name}`} width={900} height={1124} decoding="async" />{!hasRealProductImage(product) && <figcaption>Imagem ilustrativa</figcaption>}</figure>
    <p className="eyebrow">{product.category.toUpperCase()} · FEITO ARTESANALMENTE</p>
    <h1>{menuDisplayName(product)}</h1>
    {product.description && product.description !== menuDisplayName(product) && <p className="detail-description">{product.description}</p>}
    {variants.length > 1 && <div className="product-variant-picker"><p>Escolha o tamanho</p><div>{variants.map(item => <Link key={item.id} to={`/cardapio/${item.slug}`} aria-current={item.id === product.id ? "page" : undefined} className={item.id === product.id ? "product-variant active" : "product-variant"}><span>{item.sizeLabel}</span><strong>{formatCurrency(item.basePrice)}</strong></Link>)}</div></div>}
    {variants.length === 1 && product.sizeLabel && <p className="product-size-single">{product.sizeLabel}</p>}
    {!product.isAvailable && <span className="unavailable">Indisponível hoje</span>}
    <strong className="big-price">{formatCurrency(price.unitPrice)}</strong>
    {product.promotionalPrice && <p className="promo">{formatCurrency(product.promotionalPrice)} cada a partir de {product.minimumPromotionalQuantity} unidades no pedido.</p>}
    <Info label="Ingredientes" value={product.ingredients} /><Info label="Alergênicos" value={product.allergens} />
    {orderHref ? (product.isAvailable ? <a className="primary wide" href={orderHref(product.slug)}>Fazer pedido <ChevronRight size={18} aria-hidden="true" /></a> : <p className="cart-nudge">Indisponível hoje.</p>) : <><div className="quantity"><button aria-label="Diminuir quantidade" onClick={() => setQuantity(q => Math.max(1, q - 1))}><Minus size={18} aria-hidden="true" /></button><b>{quantity}</b><button aria-label="Aumentar quantidade" onClick={() => setQuantity(q => q + 1)}><Plus size={18} aria-hidden="true" /></button></div><button disabled={!product.isAvailable} className={`primary wide${justAdded ? " added" : ""}`} onClick={handleAdd}>{!product.isAvailable ? "Indisponível hoje" : `Adicionar ao pedido · ${formatCurrency(price.total)}`}</button></>}
    <RelatedProducts products={recommendations} />
  </section>;
}
function RelatedProducts({ products }: { products: Product[] }) { return products.length ? <section className="related"><p className="eyebrow">COMBINA COM</p><h2>Outros favoritos da Delícias da Sandra</h2><div>{products.map(product => <span key={product.id}>{product.name}</span>)}</div></section> : null }
function Cart({ lines, subtotal, discount, onBack, onChange, onCheckout }: { lines: CartLine[]; subtotal: number; discount: number; onBack: () => void; onChange: (id: string, q: number) => void; onCheckout: () => void }) { const [confirmingClear, setConfirmingClear] = useState(false); const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0); const promoLine = lines.find(line => line.product.minimumPromotionalQuantity !== null); const promotionHint = promoLine && totalQuantity < promoLine.product.minimumPromotionalQuantity! ? promoLine.product.minimumPromotionalQuantity! - totalQuantity : null; return <section className="section page cart-page"><Back onClick={onBack} /><p className="eyebrow">SEU PEDIDO</p><h1>Seu pedido está quase pronto.</h1>{lines.length === 0 ? <div className="empty"><GiftBox aria-hidden="true" /><h2>Ainda não tem nada por aqui.</h2><p>Escolha seus favoritos no cardápio.</p><button className="primary" onClick={onBack}>Ver cardápio</button></div> : <>{promotionHint !== null && <p className="cart-nudge">Faltam {promotionHint} itens para aproveitar o preço por quantidade.</p>}<h2 className="sr-only">Itens do pedido</h2><div className="cart-list">{lines.map(line => { const price = calculateLinePrice(line.product, line.quantity, totalQuantity); return <article className="cart-line" key={line.product.id}><img loading="lazy" decoding="async" src={productImageSrc(line.product)} alt={`Imagem demonstrativa de ${line.product.name}`} width={60} height={60} /><div><h3>{line.product.name}</h3><p>{formatCurrency(price.unitPrice)} cada</p><div className="quantity small"><button aria-label="Diminuir" onClick={() => onChange(line.product.id, line.quantity - 1)}><span className="qty-dot"><Minus size={14} aria-hidden="true" /></span></button><b>{line.quantity}</b><button aria-label="Aumentar" onClick={() => onChange(line.product.id, line.quantity + 1)}><span className="qty-dot"><Plus size={14} aria-hidden="true" /></span></button></div></div><strong>{formatCurrency(price.total)}</strong></article>; })}</div><Totals subtotal={subtotal} discount={discount} deliveryFee={0} /><button className="primary wide" onClick={onCheckout}>Continuar pedido <ChevronRight size={18} aria-hidden="true" /></button>{confirmingClear ? <p className="clear-confirm"><span>Remover todos os itens?</span><button className="link-danger" onClick={() => { lines.forEach(l => onChange(l.product.id, 0)); setConfirmingClear(false); }}>Sim, limpar</button><button className="text-button" onClick={() => setConfirmingClear(false)}>Cancelar</button></p> : <button className="link-danger" onClick={() => setConfirmingClear(true)}>Limpar pedido</button>}</>}</section> }
function Checkout({ business, lines, summary, onBack, onSent }: { business: Business; lines: CartLine[]; summary: { subtotal: number; discount: number }; onBack: () => void; onSent: (handoff: OrderHandoff) => void }) {
  const [pickupMethod, setPickupMethod] = useState<"PESSOAL" | "UBER_MOTO">("PESSOAL");
  const [payment, setPayment] = useState(business.paymentMethods[0] ?? "PIX");
  const [pickupTime, setPickupTime] = useState("");
  const [phone, setPhone] = useState("");
  const [changeFor, setChangeFor] = useState("");
  const [error, setError] = useState("");
  const pickupSlots = Array.isArray(business.pickupSlots) ? business.pickupSlots.filter(slot => typeof slot === "string" && slot.trim().length > 0) : [];
  // O pedido existe como mensagem no WhatsApp da Sandra, não como registro
  // aqui: sem um número válido não há para onde enviar, e prometer envio
  // seria pior do que dizer que o canal está pendente.
  const whatsappReady = isValidWhatsappNumber(business.whatsapp);
  const contactLink = buildWhatsappLink(business.whatsapp);
  const totalQuantity = lines.reduce((sum, line) => sum + line.quantity, 0);
  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!whatsappReady) { setError("O WhatsApp da Delícias da Sandra ainda não está configurado. Fale com a Sandra por outro canal para fazer seu pedido."); return; }
    if (pickupSlots.length > 0 && !pickupTime) { setError("Escolha um horário para retirar seu pedido."); return; }
    const form = new FormData(event.currentTarget);
    const order = {
      greetingName: business.responsibleName,
      lines: lines.map(line => { const price = calculateLinePrice(line.product, line.quantity, totalQuantity); return { name: line.product.name, quantity: line.quantity, unitPrice: price.unitPrice, total: price.total }; }),
      subtotal: summary.subtotal,
      discount: summary.discount,
      customerName: String(form.get("name") ?? ""),
      customerPhone: phone,
      pickupMode: pickupMethod,
      pickupTime,
      paymentMethod: payment,
      changeFor: payment === "DINHEIRO" ? changeFor : "",
      notes: String(form.get("notes") ?? ""),
    };
    const link = buildOrderWhatsappLink(business.whatsapp, order);
    if (!link) { setError("Não foi possível montar o link do WhatsApp. Tente novamente."); return; }
    // Abre a conversa com a mensagem pronta. Quem envia é sempre a pessoa,
    // dentro do WhatsApp dela — nada é enviado automaticamente daqui.
    window.open(link, "_blank", "noopener,noreferrer");
    onSent({ link, message: buildOrderWhatsappMessage(order) });
  };
  return <section className="section page checkout-page"><Back onClick={onBack} /><p className="eyebrow">FINALIZAR PEDIDO</p><h1>Para quem é essa delícia?</h1><p className="subtle">Só pedimos o necessário para a Sandra preparar seu pedido.</p>
    {!whatsappReady && <p className="cart-nudge">O número de WhatsApp da loja está pendente de configuração, então ainda não é possível enviar o pedido por aqui.</p>}
    <form className="checkout-form" onSubmit={submit}>
      <label>Seu nome<input required name="name" autoComplete="name" maxLength={100} placeholder="Ex.: Maria Silva" /></label>
      <label>Seu WhatsApp (opcional)<input name="phone" type="tel" autoComplete="tel" inputMode="numeric" maxLength={16} placeholder="(85) 99999-9999" aria-describedby="ajuda-telefone" value={phone} onChange={e => setPhone(maskPhoneBR(e.target.value))} /><small id="ajuda-telefone" className="campo-ajuda">Com DDD. Só se quiser que a Sandra tenha outro contato — a conversa já chega pelo seu WhatsApp.</small></label>
      <fieldset><legend>Como você vai retirar seu pedido?</legend><div className="choice-row"><button type="button" aria-pressed={pickupMethod === "PESSOAL"} className={pickupMethod === "PESSOAL" ? "choice active" : "choice"} onClick={() => setPickupMethod("PESSOAL")}>Vou retirar pessoalmente</button><button type="button" aria-pressed={pickupMethod === "UBER_MOTO"} className={pickupMethod === "UBER_MOTO" ? "choice active" : "choice"} onClick={() => setPickupMethod("UBER_MOTO")}>Vou solicitar Uber Moto</button></div>{pickupMethod === "UBER_MOTO" && <p className="cart-nudge">A Delícias da Sandra não realiza entregas. Depois que o pedido estiver pronto, você poderá solicitar um Uber Moto para fazer a retirada.</p>}</fieldset>
      <fieldset><legend>Escolha o horário de retirada</legend>{pickupSlots.length === 0 ? (contactLink ? <p className="cart-nudge">Os horários de retirada ainda não estão disponíveis. Combine o horário na própria conversa ou <a href={contactLink} target="_blank" rel="noopener noreferrer">fale conosco pelo WhatsApp</a>.</p> : <p className="cart-nudge">Os horários de retirada ainda não estão disponíveis. Combine o horário na conversa com a Sandra.</p>) : <div className="choice-row" role="radiogroup" aria-label="Horário de retirada">{pickupSlots.map(slot => <button type="button" key={slot} aria-pressed={pickupTime === slot} className={pickupTime === slot ? "choice active" : "choice"} onClick={() => setPickupTime(slot)}>{slot}</button>)}</div>}</fieldset>
      <fieldset><legend>Como você prefere pagar?</legend><div className="choice-row">{business.paymentMethods.map(method => <button type="button" key={method} aria-pressed={payment === method} className={payment === method ? "choice active" : "choice"} onClick={() => setPayment(method)}>{paymentLabel(method)}</button>)}</div></fieldset>
      {payment === "DINHEIRO" && <label>Troco para qual valor?<input name="change" autoComplete="off" inputMode="numeric" maxLength={16} placeholder="Opcional — ex.: R$ 50,00" value={changeFor} onChange={e => setChangeFor(maskCurrencyBRL(e.target.value))} /></label>}
      <label>Algum detalhe importante?<textarea name="notes" autoComplete="off" maxLength={1000} placeholder="Opcional" /></label>
      <Totals subtotal={summary.subtotal} discount={summary.discount} deliveryFee={0} />
      <p className="subtle">Vamos abrir o WhatsApp com o resumo do seu pedido já escrito. Você confere e envia. O pedido só fica confirmado quando a Sandra responder.</p>
      {error && <p className="error">{error}</p>}
      <button className="primary wide" disabled={!whatsappReady}>Enviar pedido pelo WhatsApp <Send size={18} aria-hidden="true" /></button>
    </form></section>;
}
function OrderHandoffView({ link, message, onMenu, onClear }: { link: string; message: string; onMenu: () => void; onClear: () => void }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => { try { await navigator.clipboard?.writeText(message); setCopied(true); } catch { setCopied(false); } };
  return <section className="section page confirmation">
    <div className="check"><Send aria-hidden="true" /></div>
    <p className="eyebrow">PEDIDO PRONTO PARA ENVIAR</p>
    <h1>Agora é só enviar no WhatsApp.</h1>
    <p className="subtle">Abrimos uma conversa com a Sandra e já escrevemos o resumo do seu pedido. Confira a mensagem e toque em enviar <b>dentro do WhatsApp</b>.</p>
    <div className="next-steps"><b>Seu pedido ainda não está confirmado</b><p>Ele será confirmado quando a Sandra responder na conversa. Nada foi registrado automaticamente por aqui.</p></div>
    <a className="primary wide" href={link} target="_blank" rel="noopener noreferrer">Abrir o WhatsApp <MessageCircle size={18} aria-hidden="true" /></a>
    <div className="handoff-message"><b>Mensagem do seu pedido</b><pre>{message}</pre><button className="text-button" onClick={copy}><Clipboard size={15} aria-hidden="true" /> {copied ? "Mensagem copiada" : "Copiar mensagem"}</button></div>
    <button className="secondary wide" onClick={onMenu}>Voltar ao cardápio</button>
    <button className="link-danger" onClick={onClear}>Limpar meu pedido</button>
  </section>;
}
function Totals({ subtotal, discount, deliveryFee }: { subtotal: number; discount: number; deliveryFee: number }) { return <div className="totals"><p><span>Subtotal</span><b>{formatCurrency(subtotal + discount)}</b></p>{discount > 0 && <p className="saving"><span>Economia</span><b>− {formatCurrency(discount)}</b></p>}{deliveryFee > 0 && <p><span>Entrega</span><b>{formatCurrency(deliveryFee)}</b></p>}<p className="total"><span>Total</span><b>{formatCurrency(subtotal + deliveryFee)}</b></p></div> }
function Info({ label, value }: { label: string; value?: string }) { return value ? <div className="info"><b>{label}</b><p>{value}</p></div> : null; }
function Back({ onClick }: { onClick: () => void }) { return <button className="back" onClick={onClick}><ArrowLeft size={18} aria-hidden="true" /> Voltar</button> }
