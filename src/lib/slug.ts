// Geração do identificador que vira a URL pública do produto
// (/cardapio/<slug>) e a entrada dele no sitemap. Puro: não lê Store nem
// relógio.

// Remove acentuação de verdade: NFD separa a letra do sinal diacrítico, e a
// faixa U+0300–U+036F é o bloco desses sinais combinantes.
export function slugify(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Dois sabores com o mesmo nome gerariam a mesma URL, e a página de produto
// mostraria sempre o primeiro — o segundo ficaria inalcançável e o sitemap
// listaria a mesma URL duas vezes. O sufixo numérico evita isso.
// `fallback` cobre nomes que não sobrevivem à normalização (só emoji, só
// pontuação): sem ele o slug sairia vazio e a URL seria /cardapio/.
export function uniqueSlug(value: string, taken: Iterable<string>, fallback = ""): string {
  const base = slugify(value) || slugify(fallback) || "item";
  const used = new Set(taken);
  if (!used.has(base)) return base;
  for (let suffix = 2; suffix <= 1000; suffix += 1) {
    const candidate = `${base}-${suffix}`;
    if (!used.has(candidate)) return candidate;
  }
  return `${base}-${used.size + 1}`;
}
