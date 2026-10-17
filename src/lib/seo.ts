// Preparação técnica de SEO. Tudo aqui é puro: recebe o Store e a rota,
// devolve strings. Nenhuma função lê relógio, rede ou process.env — isso é
// responsabilidade do server.ts.
//
// REGRA DE OURO DESTE ARQUIVO: nada é afirmado sobre o negócio que não esteja
// no Store. Enquanto `business.isDemo` for true, o conteúdo cadastrado é a
// semente de demonstração herdada e NENHUM dado estruturado local (endereço,
// telefone, horário, preços) é publicado — só identidade e URL, que são reais.

export type SeoBusiness = {
  name?: unknown;
  description?: unknown;
  tagline?: unknown;
  address?: unknown;
  addressReference?: unknown;
  whatsapp?: unknown;
  instagram?: unknown;
  isDemo?: unknown;
  operatingHours?: unknown;
};

export type SeoProduct = {
  slug?: unknown;
  name?: unknown;
  description?: unknown;
  category?: unknown;
  basePrice?: unknown;
  isActive?: unknown;
  isAvailable?: unknown;
};

const FALLBACK_NAME = "Delícias da Sandra";
const DEFAULT_DESCRIPTION = "Cardápio de bolos, doces e salgados artesanais da Delícias da Sandra, em Fortaleza. Monte seu pedido e envie direto pelo WhatsApp.";
const LOGO_PATH = "/brand/delicias-da-sandra-logo.png";

// Rotas que nunca devem ser indexadas: painel da operação e as etapas de
// pedido, que só fazem sentido para quem já está navegando.
const NOINDEX_PREFIXES = ["/equipe", "/carrinho", "/finalizar", "/pedido", "/assistente"];

export function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function text(value: unknown): string {
  return typeof value === "string" ? value.replace(/\s+/g, " ").trim() : "";
}

function businessName(business: SeoBusiness): string {
  return text(business.name) || FALLBACK_NAME;
}

// Papel que este endereço cumpre:
// - "landing": a vitrine indexável (domínio principal), com o cardápio.
// - "app": o sistema de pedidos (subdomínio) — carrinho, checkout e painel,
//   inteiramente fora do índice do Google.
// - "single": os dois no mesmo endereço (padrão, e o que vale em
//   desenvolvimento). Comporta-se como a vitrine, com as etapas de pedido
//   marcadas noindex individualmente.
export type SiteRole = "landing" | "app" | "single";

export function hostOf(url: string | undefined): string {
  const match = /^https?:\/\/([a-z0-9.-]+)(:\d+)?$/i.exec(text(url).replace(/\/+$/, ""));
  return match ? match[1]!.toLowerCase() : "";
}

// Sem PUBLIC_APP_URL configurada não existe divisão: tudo é um site só. Isso
// mantém o desenvolvimento local e o deploy atual funcionando sem mudança.
export function resolveSiteRole(host: string | undefined, appUrl: string | undefined): SiteRole {
  const appHost = hostOf(appUrl);
  if (!appHost) return "single";
  const current = text(host).toLowerCase().split(":")[0];
  if (!current) return "single";
  return current === appHost ? "app" : "landing";
}

// Aceita somente um host com forma de host. O cabeçalho Host é controlado por
// quem faz a requisição, então um valor estranho não pode virar canonical.
export function resolveSiteUrl(configured: string | undefined, host: string | undefined, protocol = "https"): string {
  const fromConfig = text(configured).replace(/\/+$/, "");
  if (/^https?:\/\/[a-z0-9.-]+(:\d+)?$/i.test(fromConfig)) return fromConfig;
  const safeHost = text(host).toLowerCase();
  if (!/^[a-z0-9.-]+(:\d+)?$/.test(safeHost)) return "";
  const scheme = protocol === "http" ? "http" : "https";
  return `${scheme}://${safeHost}`;
}

export function isNoindexPath(pathname: string): boolean {
  return NOINDEX_PREFIXES.some(prefix => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export type PageSeo = {
  title: string;
  description: string;
  canonical: string;
  robots: string;
  image: string;
  jsonLd: string | null;
  noscript: string;
};

function activeProducts(products: SeoProduct[]): SeoProduct[] {
  return products.filter(product => product.isActive !== false && text(product.slug) !== "");
}

function priceText(value: unknown): string {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })
    : "";
}

// Conteúdo rastreável sem JavaScript. A aplicação é uma SPA: o HTML publicado
// é só `<div id="root">`, então sem isto um rastreador que não executa JS vê
// uma página vazia. Vai dentro de <noscript>, por isso não duplica nada na
// tela de quem tem JS.
function buildNoscript(business: SeoBusiness, products: SeoProduct[], pathname: string): string {
  const name = escapeHtml(businessName(business));
  const parts: string[] = [`<h1>${name}</h1>`];
  const description = text(business.description) || DEFAULT_DESCRIPTION;
  parts.push(`<p>${escapeHtml(description)}</p>`);

  if (pathname === "/" || pathname === "/cardapio" || pathname.startsWith("/cardapio/")) {
    const list = activeProducts(products);
    if (list.length > 0) {
      parts.push("<h2>Cardápio</h2>");
      parts.push(`<ul>${list.map(product => {
        const price = priceText(product.basePrice);
        const productDescription = text(product.description);
        return `<li><strong>${escapeHtml(text(product.name))}</strong>${price ? ` — ${escapeHtml(price)}` : ""}${productDescription ? `<br />${escapeHtml(productDescription)}` : ""}</li>`;
      }).join("")}</ul>`);
    }
  }

  const address = text(business.address);
  const reference = text(business.addressReference);
  if (address) parts.push(`<p>Retirada: ${escapeHtml(address)}${reference ? ` — ${escapeHtml(reference)}` : ""}</p>`);
  parts.push("<p>Para pedir, ative o JavaScript ou fale com a gente pelo WhatsApp.</p>");
  return `<noscript>${parts.join("")}</noscript>`;
}

// Dados estruturados. WebSite (nome + URL) é a única parte sempre publicada,
// porque é a única sustentada por informação real hoje. O bloco local —
// endereço, telefone, horário e cardápio com preços — só sai quando
// `business.isDemo` for false, e cada campo ainda é checado individualmente.
function buildJsonLd(business: SeoBusiness, products: SeoProduct[], siteUrl: string, isValidWhatsapp: boolean): string | null {
  if (!siteUrl) return null;
  const name = businessName(business);
  const graph: Record<string, unknown>[] = [
    { "@type": "WebSite", "@id": `${siteUrl}/#website`, name, url: `${siteUrl}/`, inLanguage: "pt-BR" },
  ];

  if (business.isDemo === false) {
    const local: Record<string, unknown> = {
      "@type": "Bakery",
      "@id": `${siteUrl}/#local`,
      name,
      url: `${siteUrl}/`,
      image: `${siteUrl}${LOGO_PATH}`,
    };
    const description = text(business.description);
    if (description) local.description = description;
    const address = buildPostalAddress(text(business.address));
    if (address) local.address = address;
    if (isValidWhatsapp) local.telephone = `+${text(business.whatsapp).replace(/\D/g, "")}`;
    const hours = buildOpeningHours(business.operatingHours);
    if (hours.length > 0) local.openingHoursSpecification = hours;
    const offers = activeProducts(products)
      .filter(product => typeof product.basePrice === "number" && product.basePrice > 0)
      .map(product => ({
        "@type": "Offer",
        itemOffered: { "@type": "MenuItem", name: text(product.name) },
        price: Number(product.basePrice).toFixed(2),
        priceCurrency: "BRL",
        availability: product.isAvailable === false ? "https://schema.org/OutOfStock" : "https://schema.org/InStock",
      }));
    if (offers.length > 0) local.makesOffer = offers;
    graph.push(local);
  }

  return JSON.stringify({ "@context": "https://schema.org", "@graph": graph });
}

// Só publica endereço quando há mais que cidade/estado — um número indica
// logradouro. "Fortaleza – CE" sozinho não sustenta um PostalAddress.
//
// Quando o endereço termina em ", <Cidade> – <UF>", cidade e estado saem em
// campos próprios: é por addressLocality que a busca local do Google casa o
// negócio com quem procura na região. Qualquer outro formato vai inteiro em
// streetAddress, sem tentar adivinhar.
export function buildPostalAddress(address: string): Record<string, unknown> | null {
  if (!address || !/\d/.test(address)) return null;
  const match = /^(.*\S)\s*,\s*([^,]+?)\s*[–—-]\s*([A-Z]{2})$/.exec(address);
  // Só aceita como cidade um trecho que pareça nome de cidade. Sem isto, um
  // endereço como "Rua Alguma, 100 — Fortaleza – CE" (sem vírgula antes da
  // cidade) faria "100 — Fortaleza" virar addressLocality.
  if (match && !/[\d–—-]/.test(match[2]!)) {
    return { "@type": "PostalAddress", streetAddress: match[1]!, addressLocality: match[2]!, addressRegion: match[3]!, addressCountry: "BR" };
  }
  return { "@type": "PostalAddress", streetAddress: address, addressCountry: "BR" };
}

const SCHEMA_WEEKDAYS: Record<string, string> = {
  MON: "Monday", TUE: "Tuesday", WED: "Wednesday", THU: "Thursday", FRI: "Friday", SAT: "Saturday", SUN: "Sunday",
};

function buildOpeningHours(operatingHours: unknown): Record<string, unknown>[] {
  if (!operatingHours || typeof operatingHours !== "object") return [];
  const entries = operatingHours as Record<string, unknown>;
  const specs: Record<string, unknown>[] = [];
  for (const [day, schemaDay] of Object.entries(SCHEMA_WEEKDAYS)) {
    const ranges = entries[day];
    if (!Array.isArray(ranges)) continue;
    for (const range of ranges) {
      const open = text((range as { open?: unknown })?.open);
      const close = text((range as { close?: unknown })?.close);
      if (open && close) specs.push({ "@type": "OpeningHoursSpecification", dayOfWeek: `https://schema.org/${schemaDay}`, opens: open, closes: close });
    }
  }
  return specs;
}

export function buildPageSeo({ pathname, business, products, siteUrl, isValidWhatsapp = false, role = "single" }: {
  pathname: string;
  business: SeoBusiness;
  products: SeoProduct[];
  siteUrl: string;
  isValidWhatsapp?: boolean;
  role?: SiteRole;
}): PageSeo {
  const name = businessName(business);
  const tagline = text(business.tagline);
  // No sistema, nenhuma rota é indexável: quem rankeia é a vitrine, e um
  // cardápio servido nos dois endereços viraria conteúdo duplicado.
  const noindex = role === "app" || isNoindexPath(pathname);
  let title = tagline ? `${name} — ${tagline}` : name;
  let description = text(business.description) || DEFAULT_DESCRIPTION;

  if (pathname === "/cardapio") {
    title = `Cardápio — ${name}`;
  } else if (pathname.startsWith("/cardapio/")) {
    const slug = decodeURIComponent(pathname.slice("/cardapio/".length));
    const product = activeProducts(products).find(candidate => text(candidate.slug) === slug);
    if (product) {
      title = `${text(product.name)} — ${name}`;
      const productDescription = text(product.description);
      if (productDescription) description = productDescription;
    } else {
      title = `Cardápio — ${name}`;
    }
  }

  return {
    title,
    description,
    canonical: siteUrl && role !== "app" ? `${siteUrl}${pathname === "/" ? "/" : pathname}` : "",
    robots: noindex ? "noindex, nofollow" : "index, follow",
    image: siteUrl ? `${siteUrl}${LOGO_PATH}` : LOGO_PATH,
    jsonLd: noindex ? null : buildJsonLd(business, products, siteUrl, isValidWhatsapp),
    noscript: buildNoscript(business, products, pathname),
  };
}

export function renderSeoHead(seo: PageSeo): string {
  const tags = [
    `<title>${escapeHtml(seo.title)}</title>`,
    `<meta name="description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="robots" content="${seo.robots}" />`,
    seo.canonical ? `<link rel="canonical" href="${escapeHtml(seo.canonical)}" />` : "",
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="Delícias da Sandra" />`,
    `<meta property="og:title" content="${escapeHtml(seo.title)}" />`,
    `<meta property="og:description" content="${escapeHtml(seo.description)}" />`,
    seo.canonical ? `<meta property="og:url" content="${escapeHtml(seo.canonical)}" />` : "",
    `<meta property="og:image" content="${escapeHtml(seo.image)}" />`,
    `<meta property="og:locale" content="pt_BR" />`,
    `<meta name="twitter:card" content="summary_large_image" />`,
    `<meta name="twitter:title" content="${escapeHtml(seo.title)}" />`,
    `<meta name="twitter:description" content="${escapeHtml(seo.description)}" />`,
    `<meta name="twitter:image" content="${escapeHtml(seo.image)}" />`,
    seo.jsonLd ? `<script type="application/ld+json">${seo.jsonLd.replaceAll("<", "\\u003c")}</script>` : "",
  ];
  return tags.filter(Boolean).join("\n    ");
}

const HEAD_START = "<!-- seo:start -->";
const HEAD_END = "<!-- seo:end -->";
const BODY_START = "<!-- seo-noscript:start -->";
const BODY_END = "<!-- seo-noscript:end -->";

function replaceBetween(html: string, start: string, end: string, content: string): string {
  const from = html.indexOf(start);
  const to = html.indexOf(end);
  if (from < 0 || to < 0 || to < from) return html;
  return `${html.slice(0, from + start.length)}\n    ${content}\n    ${html.slice(to)}`;
}

// Substitui apenas o conteúdo entre os marcadores do index.html. Idempotente:
// aplicar duas vezes no mesmo HTML dá o mesmo resultado. Se o HTML não tiver
// os marcadores (build antigo), devolve o HTML intacto em vez de improvisar.
export function injectSeo(html: string, seo: PageSeo): string {
  return replaceBetween(
    replaceBetween(html, HEAD_START, HEAD_END, renderSeoHead(seo)),
    BODY_START,
    BODY_END,
    seo.noscript,
  );
}

export function buildRobotsTxt(siteUrl: string, role: SiteRole = "single"): string {
  // O sistema inteiro fica fora do índice — não há conteúdo para rankear em
  // carrinho, checkout ou painel.
  if (role === "app") return ["User-agent: *", "Disallow: /", ""].join("\n");
  const lines = [
    "User-agent: *",
    "Allow: /",
    "Disallow: /equipe",
    "Disallow: /carrinho",
    "Disallow: /finalizar",
    "Disallow: /pedido",
    "Disallow: /assistente",
    "Disallow: /api/",
    "",
  ];
  if (siteUrl) lines.push(`Sitemap: ${siteUrl}/sitemap.xml`, "");
  return lines.join("\n");
}

export function buildSitemapXml({ siteUrl, products, lastmod }: { siteUrl: string; products: SeoProduct[]; lastmod?: string }): string {
  const urls = ["/", "/cardapio", ...activeProducts(products).map(product => `/cardapio/${text(product.slug)}`)];
  const entries = urls.map(path => [
    "  <url>",
    `    <loc>${escapeHtml(`${siteUrl}${path}`)}</loc>`,
    lastmod ? `    <lastmod>${escapeHtml(lastmod)}</lastmod>` : "",
    "  </url>",
  ].filter(Boolean).join("\n"));
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${entries.join("\n")}\n</urlset>\n`;
}
