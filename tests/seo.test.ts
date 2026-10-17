import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPageSeo,
  buildPostalAddress,
  hostOf,
  resolveSiteRole,
  buildRobotsTxt,
  buildSitemapXml,
  escapeHtml,
  injectSeo,
  isNoindexPath,
  renderSeoHead,
  resolveSiteUrl,
} from "../src/lib/seo.ts";

const SITE = "https://delicias-da-sandra.onrender.com";

const demoBusiness = {
  name: "Delícias da Sandra",
  tagline: "Feito com carinho e qualidade",
  description: "Bolos, brownies, doces e salgados artesanais em Fortaleza.",
  address: "Fortaleza – CE",
  whatsapp: "+55 85 99003-808",
  isDemo: true,
  operatingHours: { MON: [{ open: "14:00", close: "22:00" }], SAT: [] },
};

const products = [
  { slug: "brigadeiro", name: "Brownie de Brigadeiro", description: "Brownie artesanal com brigadeiro cremoso.", basePrice: 5, isActive: true, isAvailable: true },
  { slug: "oreo", name: "Brownie de Oreo", description: "Com pedaços de biscoito.", basePrice: 5, isActive: true, isAvailable: false },
  { slug: "oculto", name: "Fora do cardápio", description: "", basePrice: 9, isActive: false, isAvailable: true },
];

test("resolveSiteUrl prefere PUBLIC_SITE_URL e remove barras finais", () => {
  assert.equal(resolveSiteUrl("https://deliciasdasandra.com.br/", "outro.host", "https"), "https://deliciasdasandra.com.br");
});

test("resolveSiteUrl cai para o host da requisição quando não há configuração", () => {
  assert.equal(resolveSiteUrl(undefined, "delicias-da-sandra.onrender.com", "https"), SITE);
  assert.equal(resolveSiteUrl("", "localhost:3000", "http"), "http://localhost:3000");
});

test("resolveSiteUrl recusa host e configuração com forma inválida", () => {
  // O cabeçalho Host é controlado por quem faz a requisição: um valor
  // estranho não pode virar canonical nem entrar no sitemap.
  assert.equal(resolveSiteUrl(undefined, 'evil.com/"><script>', "https"), "");
  assert.equal(resolveSiteUrl(undefined, undefined, "https"), "");
  assert.equal(resolveSiteUrl("javascript:alert(1)", undefined, "https"), "");
});

test("rotas de pedido e do painel são noindex", () => {
  for (const path of ["/equipe", "/carrinho", "/finalizar", "/pedido/enviado", "/assistente"]) {
    assert.equal(isNoindexPath(path), true, path);
  }
  for (const path of ["/", "/cardapio", "/cardapio/brigadeiro"]) {
    assert.equal(isNoindexPath(path), false, path);
  }
});

test("home recebe título, descrição e canonical", () => {
  const seo = buildPageSeo({ pathname: "/", business: demoBusiness, products, siteUrl: SITE });
  assert.equal(seo.title, "Delícias da Sandra — Feito com carinho e qualidade");
  assert.equal(seo.description, demoBusiness.description);
  assert.equal(seo.canonical, `${SITE}/`);
  assert.equal(seo.robots, "index, follow");
});

test("página de produto usa nome e descrição do próprio produto", () => {
  const seo = buildPageSeo({ pathname: "/cardapio/brigadeiro", business: demoBusiness, products, siteUrl: SITE });
  assert.equal(seo.title, "Brownie de Brigadeiro — Delícias da Sandra");
  assert.equal(seo.description, "Brownie artesanal com brigadeiro cremoso.");
  assert.equal(seo.canonical, `${SITE}/cardapio/brigadeiro`);
});

test("produto inexistente ou inativo cai no título do cardápio", () => {
  for (const path of ["/cardapio/nao-existe", "/cardapio/oculto"]) {
    const seo = buildPageSeo({ pathname: path, business: demoBusiness, products, siteUrl: SITE });
    assert.equal(seo.title, "Cardápio — Delícias da Sandra");
  }
});

test("checkout e painel saem com noindex e sem dados estruturados", () => {
  const seo = buildPageSeo({ pathname: "/finalizar", business: demoBusiness, products, siteUrl: SITE });
  assert.equal(seo.robots, "noindex, nofollow");
  assert.equal(seo.jsonLd, null);
});

test("com dados de demonstração só publica WebSite — nada local", () => {
  const seo = buildPageSeo({ pathname: "/", business: demoBusiness, products, siteUrl: SITE, isValidWhatsapp: false });
  const graph = JSON.parse(seo.jsonLd!)["@graph"];
  assert.equal(graph.length, 1);
  assert.equal(graph[0]["@type"], "WebSite");
  assert.equal(seo.jsonLd!.includes("openingHoursSpecification"), false);
  assert.equal(seo.jsonLd!.includes("telephone"), false);
  assert.equal(seo.jsonLd!.includes("Offer"), false);
});

test("com isDemo false publica o bloco local só com os campos sustentados", () => {
  const business = { ...demoBusiness, isDemo: false, whatsapp: "+55 85 99123-4567" };
  const seo = buildPageSeo({ pathname: "/", business, products, siteUrl: SITE, isValidWhatsapp: true });
  const local = JSON.parse(seo.jsonLd!)["@graph"].find((node: { "@type": string }) => node["@type"] === "Bakery");
  assert.ok(local);
  assert.equal(local.telephone, "+5585991234567");
  // "Fortaleza – CE" é cidade/estado, não endereço de retirada: fica de fora.
  assert.equal(local.address, undefined);
  assert.equal(local.openingHoursSpecification.length, 1);
  assert.equal(local.openingHoursSpecification[0].opens, "14:00");
  // Só produtos ativos entram nas ofertas, com a disponibilidade correta.
  assert.deepEqual(local.makesOffer.map((offer: { itemOffered: { name: string } }) => offer.itemOffered.name), ["Brownie de Brigadeiro", "Brownie de Oreo"]);
  assert.equal(local.makesOffer[1].availability, "https://schema.org/OutOfStock");
});

test("endereço com logradouro entra como PostalAddress; telefone inválido não entra", () => {
  const business = { ...demoBusiness, isDemo: false, address: "Rua Alguma, 100 — Itaoca, Fortaleza – CE" };
  const seo = buildPageSeo({ pathname: "/", business, products, siteUrl: SITE, isValidWhatsapp: false });
  const local = JSON.parse(seo.jsonLd!)["@graph"].find((node: { "@type": string }) => node["@type"] === "Bakery");
  assert.equal(local.address.streetAddress, "Rua Alguma, 100 — Itaoca");
  assert.equal(local.address.addressLocality, "Fortaleza");
  assert.equal(local.telephone, undefined);
});

test("endereço sem vírgula antes da cidade não inventa addressLocality", () => {
  assert.deepEqual(buildPostalAddress("Rua Alguma, 100 — Fortaleza – CE"), {
    "@type": "PostalAddress",
    streetAddress: "Rua Alguma, 100 — Fortaleza – CE",
    addressCountry: "BR",
  });
});

test("noscript traz o cardápio rastreável sem JavaScript", () => {
  const seo = buildPageSeo({ pathname: "/", business: demoBusiness, products, siteUrl: SITE });
  assert.match(seo.noscript, /^<noscript>/);
  assert.ok(seo.noscript.includes("Brownie de Brigadeiro"), seo.noscript);
  assert.ok(seo.noscript.includes("R$"), seo.noscript);
  assert.equal(seo.noscript.includes("Fora do cardápio"), false);
});

test("escapeHtml e renderSeoHead não deixam escapar HTML de dados do painel", () => {
  assert.equal(escapeHtml('<img src=x onerror="a">'), "&lt;img src=x onerror=&quot;a&quot;&gt;");
  const business = { ...demoBusiness, name: 'Sandra <script>alert("x")</script>', tagline: "" };
  const head = renderSeoHead(buildPageSeo({ pathname: "/", business, products, siteUrl: SITE }));
  assert.equal(head.includes("<script>alert"), false);
  assert.ok(head.includes("&lt;script&gt;"), head);
});

test("JSON-LD escapa o sinal de menor para não fechar o script", () => {
  const business = { ...demoBusiness, name: "Sandra </script>" };
  const head = renderSeoHead(buildPageSeo({ pathname: "/", business, products, siteUrl: SITE }));
  assert.equal(head.includes("</script><"), false);
  assert.ok(head.includes("\\u003c/script"), head);
});

test("injectSeo substitui só o conteúdo entre os marcadores e é idempotente", () => {
  const html = [
    "<!doctype html><html><head>",
    "<!-- seo:start -->",
    "<title>Antigo</title>",
    "<!-- seo:end -->",
    "</head><body><div id=\"root\"></div>",
    "<!-- seo-noscript:start -->",
    "<noscript>Antigo</noscript>",
    "<!-- seo-noscript:end -->",
    "</body></html>",
  ].join("\n");
  const seo = buildPageSeo({ pathname: "/cardapio", business: demoBusiness, products, siteUrl: SITE });
  const once = injectSeo(html, seo);
  assert.equal(once.includes("<title>Antigo</title>"), false);
  assert.ok(once.includes("<title>Cardápio — Delícias da Sandra</title>"));
  assert.ok(once.includes('<div id="root"></div>'));
  assert.ok(once.includes("<!doctype html>"));
  assert.equal(once.includes("<noscript>Antigo</noscript>"), false);
  assert.equal(injectSeo(once, seo), once);
});

test("injectSeo devolve o HTML intacto quando não há marcadores", () => {
  const html = "<html><head><title>Sem marcadores</title></head><body></body></html>";
  const seo = buildPageSeo({ pathname: "/", business: demoBusiness, products, siteUrl: SITE });
  assert.equal(injectSeo(html, seo), html);
});

test("robots.txt libera o cardápio, bloqueia painel e pedido e aponta o sitemap", () => {
  const robots = buildRobotsTxt(SITE);
  assert.match(robots, /^User-agent: \*/);
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/equipe/);
  assert.match(robots, /Disallow: \/finalizar/);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
  assert.equal(buildRobotsTxt("").includes("Sitemap:"), false);
});

test("sitemap lista home, cardápio e apenas produtos ativos", () => {
  const xml = buildSitemapXml({ siteUrl: SITE, products, lastmod: "2026-10-16" });
  assert.match(xml, /^<\?xml version="1\.0" encoding="UTF-8"\?>/);
  assert.ok(xml.includes(`<loc>${SITE}/</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/cardapio</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/cardapio/brigadeiro</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/cardapio/oreo</loc>`));
  assert.equal(xml.includes("/cardapio/oculto"), false);
  assert.ok(xml.includes("<lastmod>2026-10-16</lastmod>"));
});

const APP = "https://pedidos.deliciasdasandra.com.br";

test("hostOf extrai o host e recusa valor sem forma de URL", () => {
  assert.equal(hostOf("https://Pedidos.Example.com/"), "pedidos.example.com");
  assert.equal(hostOf("http://localhost:3001"), "localhost");
  assert.equal(hostOf("javascript:alert(1)"), "");
  assert.equal(hostOf(undefined), "");
});

test("sem PUBLIC_APP_URL o site inteiro é um endereço só", () => {
  assert.equal(resolveSiteRole("deliciasdasandra.com.br", undefined), "single");
  assert.equal(resolveSiteRole("deliciasdasandra.com.br", ""), "single");
});

test("o host do subdomínio é o sistema; qualquer outro é a vitrine", () => {
  assert.equal(resolveSiteRole("pedidos.deliciasdasandra.com.br", APP), "app");
  assert.equal(resolveSiteRole("PEDIDOS.deliciasdasandra.com.br:443", APP), "app");
  assert.equal(resolveSiteRole("deliciasdasandra.com.br", APP), "landing");
  assert.equal(resolveSiteRole("www.deliciasdasandra.com.br", APP), "landing");
});

test("no sistema nenhuma rota é indexável e não há canonical nem dados estruturados", () => {
  for (const path of ["/", "/cardapio", "/cardapio/brigadeiro"]) {
    const seo = buildPageSeo({ pathname: path, business: demoBusiness, products, siteUrl: APP, role: "app" });
    assert.equal(seo.robots, "noindex, nofollow", path);
    assert.equal(seo.canonical, "", path);
    assert.equal(seo.jsonLd, null, path);
  }
});

test("na vitrine o cardápio continua indexável e com canonical", () => {
  const seo = buildPageSeo({ pathname: "/cardapio/brigadeiro", business: demoBusiness, products, siteUrl: SITE, role: "landing" });
  assert.equal(seo.robots, "index, follow");
  assert.equal(seo.canonical, `${SITE}/cardapio/brigadeiro`);
});

test("robots.txt do sistema bloqueia tudo e não anuncia sitemap", () => {
  const robots = buildRobotsTxt(APP, "app");
  // Precisa deixar RASTREAR para que o `noindex` da página seja lido; o que o
  // sistema não pode é ser indexado. Bloquear aqui deixaria a URL elegível ao
  // índice sem que o Google jamais visse a instrução para excluí-la.
  assert.match(robots, /^User-agent: \*\nAllow: \/\n/);
  assert.equal(robots.includes("Disallow: /\n"), false);
  assert.match(robots, /Disallow: \/api\//);
  assert.equal(robots.includes("Sitemap:"), false);
});

test("robots.txt da vitrine continua liberando o cardápio", () => {
  const robots = buildRobotsTxt(SITE, "landing");
  assert.match(robots, /Allow: \//);
  assert.match(robots, /Disallow: \/finalizar/);
  assert.match(robots, new RegExp(`Sitemap: ${SITE}/sitemap.xml`));
});

test("buildPostalAddress separa cidade e estado quando o endereço termina em UF", () => {
  assert.deepEqual(buildPostalAddress("Rua Ajurana, 80 — Itaoca, Fortaleza – CE"), {
    "@type": "PostalAddress",
    streetAddress: "Rua Ajurana, 80 — Itaoca",
    addressLocality: "Fortaleza",
    addressRegion: "CE",
    addressCountry: "BR",
  });
  assert.deepEqual(buildPostalAddress("Av. Beira Mar, 1000, Fortaleza - CE"), {
    "@type": "PostalAddress",
    streetAddress: "Av. Beira Mar, 1000",
    addressLocality: "Fortaleza",
    addressRegion: "CE",
    addressCountry: "BR",
  });
});

test("buildPostalAddress não adivinha o que não reconhece", () => {
  // Sem número não há logradouro: cidade e estado sozinhos não viram endereço.
  assert.equal(buildPostalAddress("Fortaleza – CE"), null);
  assert.equal(buildPostalAddress(""), null);
  // Formato fora do padrão vai inteiro em streetAddress, sem inventar campos.
  assert.deepEqual(buildPostalAddress("Rua Qualquer 123"), { "@type": "PostalAddress", streetAddress: "Rua Qualquer 123", addressCountry: "BR" });
});

test("o endereço real entra no dado estruturado quando isDemo for false", () => {
  const business = { ...demoBusiness, isDemo: false, address: "Rua Ajurana, 80 — Itaoca, Fortaleza – CE", addressReference: "Próximo ao Shopping Parangaba" };
  const seo = buildPageSeo({ pathname: "/", business, products, siteUrl: SITE });
  const local = JSON.parse(seo.jsonLd!)["@graph"].find((node: { "@type": string }) => node["@type"] === "Bakery");
  assert.equal(local.address.addressLocality, "Fortaleza");
  // A referência é para humano, não para o dado estruturado.
  assert.equal(seo.jsonLd!.includes("Parangaba"), false);
});

test("o noscript mostra endereço e ponto de referência", () => {
  const business = { ...demoBusiness, address: "Rua Ajurana, 80 — Itaoca, Fortaleza – CE", addressReference: "Próximo ao Shopping Parangaba" };
  const seo = buildPageSeo({ pathname: "/", business, products, siteUrl: SITE });
  assert.ok(seo.noscript.includes("Retirada: Rua Ajurana, 80 — Itaoca, Fortaleza – CE — Próximo ao Shopping Parangaba"), seo.noscript);
});

test("em demonstração o sitemap para nas URLs estáveis, sem os produtos herdados", () => {
  const xml = buildSitemapXml({ siteUrl: SITE, products, isDemo: true });
  assert.ok(xml.includes(`<loc>${SITE}/</loc>`));
  assert.ok(xml.includes(`<loc>${SITE}/cardapio</loc>`));
  assert.equal(xml.includes("/cardapio/brigadeiro"), false);
});

test("o noscript avisa que o cardápio é de demonstração", () => {
  const demo = buildPageSeo({ pathname: "/", business: demoBusiness, products, siteUrl: SITE });
  assert.match(demo.noscript, /Cardápio de demonstração/);
  const real = buildPageSeo({ pathname: "/", business: { ...demoBusiness, isDemo: false }, products, siteUrl: SITE });
  assert.equal(real.noscript.includes("Cardápio de demonstração"), false);
});
