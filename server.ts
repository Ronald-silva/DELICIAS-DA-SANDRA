import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import express, { type NextFunction, type Request, type Response } from "express";
import { createServer as createViteServer } from "vite";
import { type PricingProduct } from "./src/lib/pricing.ts";
import { ORDER_STATUSES } from "./src/lib/orderStatuses.ts";
import { resolveStorePath, loadStoreFile, saveStoreFile } from "./src/lib/store.ts";
import { uniqueSlug } from "./src/lib/slug.ts";
import { createOrder, OrderCreationError, type Order } from "./src/lib/orders.ts";
import { closeDatabasePool, getDatabasePool } from "./src/lib/database.ts";
import { createHealthHandler } from "./src/lib/health.ts";
import { buildPageSeo, buildRobotsTxt, buildSitemapXml, injectSeo, resolveSiteRole, resolveSiteUrl, type SiteRole } from "./src/lib/seo.ts";
import { isValidWhatsappNumber } from "./src/lib/whatsapp.ts";
import { BROWNIER_DELIVERY_ENABLED, BROWNIER_HOURS_VERSION, BROWNIER_INSTAGRAM, BROWNIER_ADDRESS_REFERENCE, BROWNIER_PICKUP_ADDRESS, BROWNIER_PAYMENT_METHODS, BROWNIER_PIX_KEY, BROWNIER_WHATSAPP, ensureBrownierDeliveryEnabled, ensureBrownierInstagram, ensureBrownierPaymentMethods, ensureBrownierPickupAddress, ensureBrownierAddressReference, ensureBrownierOperatingHours, ensureBrownierPixKey, ensureBrownierResponsible, ensureBrownierWhatsapp } from "./src/lib/business-defaults.ts";
import { validateStructuredWeeklyHours } from "./src/lib/business-hours.ts";
import { createWhatsappConversationRuntime } from "./src/agent/whatsapp-conversation.runtime.ts";
import { createPostgresConversationState } from "./src/agent/postgres-conversation-state.ts";
import {
  createEvolutionGoTextSender,
  createEvolutionGoWebhookHandler,
  readEvolutionGoConfig,
  readEvolutionWebhookToken,
} from "./src/integrations/evolution-go.ts";

type Product = PricingProduct & {
  id: string; slug: string; description: string; category: string; imageUrl: string;
  isActive: boolean; isAvailable: boolean; isFeatured: boolean; isDay?: boolean; displayOrder: number;
  ingredients?: string; allergens?: string; updatedAt: string;
};
type Store = {
  business: Record<string, unknown>;
  products: Product[];
  orders: Order[];
};

// RISCO CONHECIDO (Railway): o Store continua sendo o mesmo arquivo JSON em
// disco já usado por produtos/pedidos (src/lib/store.ts) — nenhum PostgreSQL
// novo foi introduzido para dados comerciais nesta etapa, e o Postgres já
// existente (getDatabasePool, abaixo) continua exclusivo do estado de
// conversas do WhatsApp. Isso inclui agora `business.operatingHours`: sem um
// volume persistente montado em `BF_STORE_PATH`/`data/`, um redeploy no
// Railway apaga o filesystem efêmero do container e os horários cadastrados
// pelo painel (assim como produtos e pedidos) somem, voltando ao horário
// inicial via backfill no próximo boot. Antes de qualquer deploy real, o
// Railway precisa de um volume persistente apontando para esse caminho.
const storePath = resolveStorePath();
const orderStatuses = ORDER_STATUSES;
const limitedRequests = new Map<string, { count: number; started: number }>();

const IS_PRODUCTION = process.env.NODE_ENV === "production";
const INSECURE_DEFAULT_ADMIN_CODE = "brownies-demo";
const ADMIN_SESSION_TTL_MS = Number(process.env.ADMIN_SESSION_TTL_MS) > 0 ? Number(process.env.ADMIN_SESSION_TTL_MS) : 4 * 60 * 60 * 1000;
const LOGIN_WINDOW_MS = Number(process.env.ADMIN_LOGIN_WINDOW_MS) > 0 ? Number(process.env.ADMIN_LOGIN_WINDOW_MS) : 10 * 60 * 1000;
const LOGIN_MAX_ATTEMPTS = 5;
const loginAttempts = new Map<string, { count: number; started: number }>();
const adminSessionSecret = crypto.randomBytes(32);
let resolvedAdminAccessCode: string;

// Falha alto e explicitamente em produção em vez de aceitar o código de demo
// conhecido publicamente — chamada uma única vez, antes do app.listen, para
// que um ADMIN_ACCESS_CODE ausente ou inseguro impeça o servidor de subir.
function initializeAdminAuth() {
  const configured = process.env.ADMIN_ACCESS_CODE?.trim() || "";
  if (IS_PRODUCTION) {
    if (!configured) throw new Error("ADMIN_ACCESS_CODE precisa estar definido em produção. Defina uma variável de ambiente forte antes de iniciar o servidor.");
    if (configured === INSECURE_DEFAULT_ADMIN_CODE) throw new Error("ADMIN_ACCESS_CODE não pode usar o valor padrão de demonstração em produção. Defina um código forte e exclusivo.");
    resolvedAdminAccessCode = configured;
  } else {
    resolvedAdminAccessCode = configured || INSECURE_DEFAULT_ADMIN_CODE;
  }
}
function secureCompare(a: string, b: string): boolean {
  const bufA = Buffer.from(a); const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return crypto.timingSafeEqual(bufA, bufB);
}
function loginAttemptRecord(ip: string) {
  const now = Date.now(); const entry = loginAttempts.get(ip);
  return !entry || now - entry.started > LOGIN_WINDOW_MS ? { count: 0, started: now } : entry;
}
// Token opaco assinado (HMAC) contendo apenas um timestamp de expiração — nunca
// o código administrativo — e verificado com comparação de tempo constante.
function signSessionPayload(payload: string): string {
  return crypto.createHmac("sha256", adminSessionSecret).update(payload).digest("base64url");
}
function createAdminSessionToken(): string {
  const payload = Buffer.from(JSON.stringify({ exp: Date.now() + ADMIN_SESSION_TTL_MS }), "utf8").toString("base64url");
  return `${payload}.${signSessionPayload(payload)}`;
}
function verifyAdminSessionToken(token: string | undefined): boolean {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return false;
  if (!secureCompare(signature, signSessionPayload(payload))) return false;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { exp?: number };
    return typeof data.exp === "number" && Date.now() < data.exp;
  } catch { return false; }
}

const demoStore: Store = {
  business: {
    name: "Delícias da Sandra", tagline: "Feito com carinho e qualidade", description: "Bolos, brownies, doces e salgados artesanais em Fortaleza. Veja o cardápio e monte seu pedido em poucos minutos.",
    phone: BROWNIER_WHATSAPP, whatsapp: BROWNIER_WHATSAPP, address: BROWNIER_PICKUP_ADDRESS, addressReference: BROWNIER_ADDRESS_REFERENCE, hours: "", instagram: BROWNIER_INSTAGRAM, pickupEnabled: true, deliveryEnabled: BROWNIER_DELIVERY_ENABLED,
    pickupSlots: [],
    paymentMethods: [...BROWNIER_PAYMENT_METHODS], deliveryFee: 0,
    pixKey: BROWNIER_PIX_KEY,
    receivedMessage: "Recebemos seu pedido! A equipe da Delícias da Sandra vai confirmar os detalhes em breve.",
    availabilityNotice: "Os itens podem variar conforme a disponibilidade do dia.",
    isDemo: true,
  },
  products: [
    ["brigadeiro", "Brownie de Brigadeiro", "Brownie artesanal finalizado com brigadeiro cremoso.", 5, true, "Chocolate, brigadeiro, farinha, ovos e manteiga", "Contém glúten, leite e ovos"],
    ["ninho", "Brownie de Ninho", "Brownie de chocolate com cobertura de leite em pó.", 5, true, "Chocolate, leite em pó, farinha, ovos e manteiga", "Contém glúten, leite e ovos"],
    ["oreo", "Brownie de Oreo", "Brownie com pedaços de biscoito de chocolate.", 5, true, "Chocolate, biscoito, farinha, ovos e manteiga", "Contém glúten, leite e ovos"],
    ["prestigio", "Brownie de Prestígio", "Chocolate e coco em uma combinação clássica.", 5, true, "Chocolate, coco, farinha, ovos e manteiga", "Contém glúten, leite e ovos"],
    ["ovomaltine", "Brownie de Ovomaltine", "Brownie de chocolate com cobertura crocante de Ovomaltine.", 5, true, "Chocolate, Ovomaltine, farinha, ovos e manteiga", "Contém glúten, leite, ovos e amendoim"],
    ["doce-de-leite", "Brownie de Doce de Leite", "Brownie macio com doce de leite cremoso.", 5, true, "Chocolate, doce de leite, farinha, ovos e manteiga", "Contém glúten, leite e ovos"],
  ].map(([slug, name, description, basePrice, available, ingredients, allergens], index) => ({
    id: `demo-${slug}`, slug: String(slug), name: String(name), description: String(description), category: "Brownies", imageUrl: "",
    basePrice: Number(basePrice), promotionalPrice: 3, minimumPromotionalQuantity: 20,
    isActive: true, isAvailable: Boolean(available), isFeatured: index < 3, isDay: slug === "brigadeiro", displayOrder: index + 1,
    ingredients: String(ingredients), allergens: String(allergens), updatedAt: new Date().toISOString(),
  })),
  orders: [],
};

async function loadStore(): Promise<Store> {
  const store = await loadStoreFile(storePath, () => demoStore);
  const withOfficialAddress = ensureBrownierAddressReference(ensureBrownierPickupAddress(store));
  const withOperatingHours = ensureBrownierOperatingHours(withOfficialAddress);
  const withResponsible = ensureBrownierResponsible(withOperatingHours);
  const withPixKey = ensureBrownierPixKey(withResponsible);
  const withWhatsapp = ensureBrownierWhatsapp(withPixKey);
  const withInstagram = ensureBrownierInstagram(withWhatsapp);
  const withDelivery = ensureBrownierDeliveryEnabled(withInstagram);
  const withPaymentMethods = ensureBrownierPaymentMethods(withDelivery);
  if (withPaymentMethods !== store) await saveStore(withPaymentMethods);
  return withPaymentMethods;
}
async function saveStore(store: Store) { return saveStoreFile(storePath, store); }
function publicProduct(product: Product) {
  const { id, slug, name, description, category, imageUrl, basePrice, promotionalPrice, minimumPromotionalQuantity, isAvailable, isFeatured, isDay, displayOrder, ingredients, allergens, updatedAt } = product;
  return { id, slug, name, description, category, imageUrl, basePrice, promotionalPrice, minimumPromotionalQuantity, isAvailable, isFeatured, isDay: isDay === true, displayOrder, ingredients, allergens, updatedAt };
}
function validText(value: unknown, max: number) { return typeof value === "string" && value.trim().length > 0 && value.trim().length <= max; }
function admin(req: Request, res: Response, next: NextFunction) {
  const header = req.header("authorization") || "";
  const token = header.startsWith("Bearer ") ? header.slice(7).trim() : undefined;
  if (!verifyAdminSessionToken(token)) return res.status(401).json({ error: "Sessão administrativa inválida ou expirada." });
  next();
}
function publicRateLimit(req: Request, res: Response, next: NextFunction) {
  const key = req.ip || "unknown"; const now = Date.now(); const entry = limitedRequests.get(key);
  const current = !entry || now - entry.started > 60_000 ? { count: 1, started: now } : { ...entry, count: entry.count + 1 };
  limitedRequests.set(key, current);
  if (current.count > 20) return res.status(429).json({ error: "Muitas tentativas. Aguarde um instante." });
  next();
}
function publicCode() { return `BF-${crypto.randomBytes(4).toString("hex").toUpperCase()}`; }

async function startServer() {
  initializeAdminAuth();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    if (req.path === "/api/admin/products" || req.path.startsWith("/api/admin/products/")) return next();
    express.json({ limit: "64kb" })(req, res, next);
  });
  const adminProductBody = express.json({ limit: "8mb" });
  const evolutionConfig = readEvolutionGoConfig(process.env);
  const evolutionWebhookToken = readEvolutionWebhookToken(process.env, {
    production: IS_PRODUCTION,
    evolutionConfigured: Boolean(evolutionConfig),
  });
  const maxMisunderstandingsRaw = process.env.BF_AGENT_MAX_MISUNDERSTANDINGS?.trim();
  const whatsappConversation = createWhatsappConversationRuntime({
    loadDomainStore: async () => (await loadStore()) as Store,
    saveDomainStore: async store => saveStore(store as Store),
    maxMisunderstandings: maxMisunderstandingsRaw ? Number(maxMisunderstandingsRaw) : undefined,
    // O pool é lazy. Em desenvolvimento/testes sem DATABASE_URL o runtime
    // local continua utilizável; em produção, a primeira mensagem usa o
    // mesmo pool exigido pelo health check.
    persistentState: process.env.DATABASE_URL?.trim()
      ? createPostgresConversationState({ query: (queryText, values) => getDatabasePool().query(queryText, values) })
      : undefined,
  });
  const evolutionSender = evolutionConfig ? createEvolutionGoTextSender({ config: evolutionConfig }) : undefined;
  // Canal web para a apresentação: usa exatamente o mesmo runtime que atende
  // o WhatsApp, mas trabalha sobre uma cópia do cardápio e nunca persiste
  // pedidos. Assim a demo não depende da Evolution nem polui a operação.
  const webDemoConversation = createWhatsappConversationRuntime({
    loadDomainStore: async () => structuredClone((await loadStore()) as Store),
    saveDomainStore: async () => undefined,
    maxMisunderstandings: maxMisunderstandingsRaw ? Number(maxMisunderstandingsRaw) : undefined,
  });

  // SEO técnico. robots.txt e sitemap.xml ficam ANTES de qualquer middleware
  // de arquivos/SPA porque o catch-all devolvia o HTML da aplicação com 200
  // para esses caminhos — para o Google, um robots.txt inválido.
  // A URL base vem de PUBLIC_SITE_URL; sem ela, é derivada do host da
  // requisição (validado em resolveSiteUrl).
  //
  // A vitrine (domínio principal) e o sistema de pedidos (subdomínio) são o
  // mesmo processo: o papel de cada requisição vem do host. Sem
  // PUBLIC_APP_URL definida, tudo continua sendo um site só.
  const siteUrlFor = (req: Request) => resolveSiteUrl(process.env.PUBLIC_SITE_URL, req.get("host"), req.protocol);
  const appUrl = () => resolveSiteUrl(process.env.PUBLIC_APP_URL, undefined, "https");
  const roleFor = (req: Request): SiteRole => resolveSiteRole(req.get("host"), process.env.PUBLIC_APP_URL);

  // A vitrine precisa saber para onde mandar quem vai pedir; o sistema
  // precisa saber que é ele quem atende o pedido.
  app.get("/api/public/site", (req, res) => res.json({ role: roleFor(req), appUrl: appUrl() }));

  app.get("/robots.txt", (req, res) => {
    res.type("text/plain").send(buildRobotsTxt(siteUrlFor(req), roleFor(req)));
  });
  app.get("/sitemap.xml", async (req, res) => {
    if (roleFor(req) === "app") return res.status(404).type("text/plain").send("Sem sitemap: este endereço é o sistema de pedidos, fora do índice.");
    const siteUrl = siteUrlFor(req);
    if (!siteUrl) return res.status(503).type("text/plain").send("Sitemap indisponível: defina PUBLIC_SITE_URL.");
    const store = await loadStore();
    res.type("application/xml").send(buildSitemapXml({ siteUrl, products: store.products, isDemo: store.business.isDemo !== false }));
  });

  app.get("/health", createHealthHandler());
  app.post("/api/webhooks/evolution-go", createEvolutionGoWebhookHandler({
    config: evolutionConfig,
    webhookToken: evolutionWebhookToken,
    conversation: whatsappConversation,
    sender: evolutionSender,
  }));

  app.get("/api/public/business", async (_req, res) => res.json((await loadStore()).business));
  app.get("/api/public/menu", async (_req, res) => {
    const store = await loadStore();
    res.json(store.products.filter(p => p.isActive).sort((a, b) => a.displayOrder - b.displayOrder).map(publicProduct));
  });
  app.get("/api/public/products/:id", async (req, res) => {
    const product = (await loadStore()).products.find(p => (p.id === req.params.id || p.slug === req.params.id) && p.isActive);
    if (!product) return res.status(404).json({ error: "Produto não encontrado." });
    res.json(publicProduct(product));
  });
  app.get("/api/public/promotions", async (_req, res) => {
    const products = (await loadStore()).products.filter(p => p.isActive && p.promotionalPrice && p.minimumPromotionalQuantity).map(publicProduct);
    res.json(products);
  });
  app.post("/api/public/agent/messages", publicRateLimit, async (req, res) => {
    const sessionId = typeof req.body?.sessionId === "string" ? req.body.sessionId.trim() : "";
    const text = typeof req.body?.text === "string" ? req.body.text.trim() : "";
    if (!/^[a-zA-Z0-9_-]{8,100}$/.test(sessionId) || !text || text.length > 1_500) {
      return res.status(400).json({ error: "Mensagem de demonstração inválida." });
    }
    try {
      const result = await webDemoConversation.processText({
        channel: "webchat",
        contactId: `web-demo-${sessionId}`,
        messageId: crypto.randomUUID(),
        text,
      });
      res.json({ messages: result.messages.map(message => ({ id: message.id, text: message.text, ...(message.metadata ? { metadata: message.metadata } : {}) })) });
    } catch (error) {
      console.error("Falha no chat de demonstração", error);
      res.status(503).json({ error: "O assistente está indisponível por um instante. Tente novamente." });
    }
  });
  app.get("/api/public/orders/:publicCode", publicRateLimit, async (req, res) => {
    const order = (await loadStore()).orders.find(o => o.publicCode === req.params.publicCode);
    if (!order) return res.status(404).json({ error: "Pedido não encontrado." });
    const { customerPhone, deliveryAddress, reference, customerNotes, internalNotes, ...safe } = order;
    res.json(safe);
  });
  app.post("/api/public/orders", publicRateLimit, async (req, res) => {
    const store = await loadStore();
    try {
      const { order, replayed } = createOrder({
        store,
        payload: req.body ?? {},
        idempotencyKey: req.header("Idempotency-Key"),
        generatePublicCode: publicCode,
      });
      if (!replayed) await saveStore(store);
      res.setHeader("Idempotency-Replayed", replayed ? "true" : "false");
      res.status(replayed ? 200 : 201).json(order);
    } catch (error) {
      if (error instanceof OrderCreationError) return res.status(error.status).json({ error: error.message });
      console.error(error);
      res.status(500).json({ error: "Não foi possível criar o pedido." });
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const ip = req.ip || "unknown";
    const record = loginAttemptRecord(ip);
    if (record.count >= LOGIN_MAX_ATTEMPTS) { loginAttempts.set(ip, record); return res.status(429).json({ error: "Muitas tentativas. Tente novamente mais tarde." }); }
    const code = typeof req.body?.code === "string" ? req.body.code : "";
    if (!code || !secureCompare(code, resolvedAdminAccessCode)) { record.count += 1; loginAttempts.set(ip, record); return res.status(401).json({ error: "Código de acesso inválido." }); }
    loginAttempts.delete(ip);
    res.json({ token: createAdminSessionToken(), expiresIn: ADMIN_SESSION_TTL_MS });
  });
  app.get("/api/admin/bootstrap", admin, async (_req, res) => res.json(await loadStore()));
  app.put("/api/admin/business", admin, async (req, res) => {
    const body = req.body ?? {};
    if (body.operatingHours !== undefined) {
      const errors = validateStructuredWeeklyHours(body.operatingHours);
      if (errors.length > 0) return res.status(400).json({ error: "Horário de funcionamento inválido.", details: errors });
    }
    const store = await loadStore(); store.business = { ...store.business, ...body, ...(body.operatingHours !== undefined ? { operatingHoursVersion: BROWNIER_HOURS_VERSION } : {}), name: "Delícias da Sandra" }; await saveStore(store); res.json(store.business);
  });
  app.post("/api/admin/products", admin, adminProductBody, async (req, res) => {
    const store = await loadStore(); const body = req.body ?? {};
    if (!validText(body.name, 100)) return res.status(400).json({ error: "Nome do produto é obrigatório." });
    const id = crypto.randomUUID(); const product: Product = { id, slug: uniqueSlug(String(body.slug || body.name), store.products.map(p => p.slug), id), name: body.name.trim(), description: String(body.description || "").trim(), category: String(body.category || "Brownies").trim(), imageUrl: "", basePrice: Number(body.basePrice || 0), promotionalPrice: body.promotionalPrice === null || body.promotionalPrice === "" ? null : Number(body.promotionalPrice), minimumPromotionalQuantity: body.minimumPromotionalQuantity === null || body.minimumPromotionalQuantity === "" ? null : Number(body.minimumPromotionalQuantity), isActive: body.isActive !== false, isAvailable: body.isAvailable !== false, isFeatured: Boolean(body.isFeatured), displayOrder: Number(body.displayOrder || store.products.length + 1), ingredients: String(body.ingredients || ""), allergens: String(body.allergens || ""), updatedAt: new Date().toISOString() };
    store.products.push(product); await saveStore(store); res.status(201).json(product);
  });
  app.put("/api/admin/products/:id", admin, adminProductBody, async (req, res) => {
    const store = await loadStore(); const index = store.products.findIndex(p => p.id === req.params.id); if (index < 0) return res.status(404).json({ error: "Produto não encontrado." });
    const current = store.products[index]; const body = req.body ?? {}; const merged = { ...current, ...body, id: current.id, updatedAt: new Date().toISOString() } as Product;
    if (!validText(merged.name, 100) || !Number.isFinite(Number(merged.basePrice)) || Number(merged.basePrice) < 0) return res.status(400).json({ error: "Dados do produto inválidos." });
    store.products[index] = merged; await saveStore(store); res.json(merged);
  });
  app.delete("/api/admin/products/:id", admin, async (req, res) => { const store = await loadStore(); const before = store.products.length; store.products = store.products.filter(p => p.id !== req.params.id); if (before === store.products.length) return res.status(404).json({ error: "Produto não encontrado." }); await saveStore(store); res.status(204).end(); });
  app.put("/api/admin/orders/:id", admin, async (req, res) => { const store = await loadStore(); const order = store.orders.find(o => o.id === req.params.id); if (!order) return res.status(404).json({ error: "Pedido não encontrado." }); if (req.body.status && !orderStatuses.includes(req.body.status)) return res.status(400).json({ error: "Status inválido." }); Object.assign(order, { status: req.body.status ?? order.status, internalNotes: typeof req.body.internalNotes === "string" ? req.body.internalNotes.slice(0, 1000) : order.internalNotes, updatedAt: new Date().toISOString() }); await saveStore(store); res.json(order); });

  // Uma rota de API inexistente devolvia o HTML da SPA com 200, o que esconde
  // erros de integração e dá ao rastreador páginas duplicadas em /api/*.
  app.use("/api", (_req, res) => res.status(404).json({ error: "Rota não encontrada." }));

  let closeVite: (() => Promise<void>) | undefined;
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    closeVite = () => vite.close();
    app.use(vite.middlewares);
  }
  else {
    const distPath = path.join(process.cwd(), "dist");
    const indexPath = path.join(distPath, "index.html");
    // `index: false` para que "/" caia no handler abaixo e receba as tags da
    // rota em vez do index.html cru, sem description nem canonical.
    app.use(express.static(distPath, { index: false }));
    // O template é lido uma vez e mantido em memória: em produção o dist é
    // gerado no build, antes do processo subir, e não muda com ele em pé.
    let indexTemplate: string | undefined;
    app.get("*", async (req, res) => {
      try {
        indexTemplate ??= await fs.readFile(indexPath, "utf8");
        const store = await loadStore();
        const html = injectSeo(indexTemplate, buildPageSeo({
          pathname: req.path,
          business: store.business,
          products: store.products,
          siteUrl: siteUrlFor(req),
          isValidWhatsapp: isValidWhatsappNumber(String(store.business.whatsapp ?? "")),
          role: roleFor(req),
        }));
        res.status(200).type("html").send(html);
      } catch (error) {
        // A aplicação precisa continuar carregando mesmo se a injeção falhar:
        // o SEO é um ganho adicional, não um ponto único de falha da loja.
        console.error("Falha ao montar o HTML com metadados de SEO", error);
        res.sendFile(indexPath);
      }
    });
  }
  const port = Number(process.env.PORT) || 3000;
  const server = app.listen(port, "0.0.0.0", () => console.log(`Delícias da Sandra em http://0.0.0.0:${port}`));
  let shuttingDown = false;
  const shutdown = (signal: "SIGTERM" | "SIGINT") => {
    if (shuttingDown) return;
    shuttingDown = true;
    console.log(`Recebido ${signal}; encerrando servidor HTTP.`);
    const closeHttpServer = new Promise<void>((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    void Promise.all([closeHttpServer, closeVite?.() ?? Promise.resolve(), closeDatabasePool()])
      .then(() => console.log("Servidor HTTP encerrado."))
      .catch((error: unknown) => {
        console.error("Falha ao encerrar o servidor HTTP.", error);
        process.exitCode = 1;
      });
  };
  process.once("SIGTERM", () => shutdown("SIGTERM"));
  process.once("SIGINT", () => shutdown("SIGINT"));
  return server;
}
startServer().catch(error => { console.error(error); process.exitCode = 1; });
