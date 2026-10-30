export type MenuProduct = {
  id: string;
  slug: string;
  name: string;
  menuName: string;
  menuGroup: string;
  sizeLabel?: string;
  description: string;
  category: string;
  imageUrl: string;
  basePrice: number;
  promotionalPrice: null;
  minimumPromotionalQuantity: null;
  isActive: boolean;
  isAvailable: boolean;
  isFeatured: boolean;
  isDay: boolean;
  displayOrder: number;
  updatedAt: string;
};

type MenuEntry = {
  slug: string;
  name: string;
  image: string;
  category: "Bolos" | "Salgados";
  options: Array<[size: string, price: number]>;
};

const MENU: MenuEntry[] = [
  { slug: "amanteigado-doce-leite", name: "Amanteigado com cobertura de doce de leite", image: "amanteigado-cobertura-doce-de-leite.jpeg", category: "Bolos", options: [["1 kg", 40], ["500 g", 25]] },
  { slug: "bolo-milho-cremoso", name: "Bolo de milho cremoso", image: "bolo-milho-cremoso.jpeg", category: "Bolos", options: [["1,5 kg", 50], ["600 g", 30]] },
  { slug: "chocolate-brigadeiro", name: "Chocolate com cobertura de brigadeiro", image: "bolo-chocolate-brigadeiro.jpeg", category: "Bolos", options: [["1 kg", 40], ["500 g", 25]] },
  { slug: "cenoura-chocolate", name: "Cenoura com cobertura de chocolate", image: "cenoura-cobertura-chocolate.jpeg", category: "Bolos", options: [["1 kg", 40], ["500 g", 25]] },
  { slug: "amanteigado-abacaxi", name: "Amanteigado com cobertura de abacaxi", image: "bolo-amanteigado-cobertura-abacaxi.jpeg", category: "Bolos", options: [["1 kg", 40], ["500 g", 25]] },
  { slug: "fofo-amanteigado", name: "Fofo amanteigado", image: "bolo-fofo-amanteigado.jpeg", category: "Bolos", options: [["1 kg", 30]] },
  { slug: "bolo-mole", name: "Bolo mole", image: "bolo-mole.jpeg", category: "Bolos", options: [["", 50]] },
  { slug: "torta-frango", name: "Torta de frango cremosa", image: "torta-salgada-frango.jpeg", category: "Salgados", options: [["", 80]] },
  { slug: "empadao", name: "Empadão", image: "empadao.jpeg", category: "Salgados", options: [["", 80]] },
];

export function createSandraMenuProducts(updatedAt = new Date().toISOString()): MenuProduct[] {
  let displayOrder = 0;
  return MENU.flatMap((entry, groupIndex) => entry.options.map(([sizeLabel, basePrice]) => {
    displayOrder += 1;
    const sizeSlug = sizeLabel.toLowerCase().replace(",", "-").replace(/\s+/g, "-");
    const slug = sizeSlug ? `${entry.slug}-${sizeSlug}` : entry.slug;
    return {
      id: `sandra-${slug}`,
      slug,
      name: sizeLabel ? `${entry.name} — ${sizeLabel}` : entry.name,
      menuName: entry.name,
      menuGroup: entry.slug,
      ...(sizeLabel ? { sizeLabel } : {}),
      description: entry.name,
      category: entry.category,
      imageUrl: `/images/${entry.image}`,
      basePrice,
      promotionalPrice: null,
      minimumPromotionalQuantity: null,
      isActive: true,
      isAvailable: true,
      isFeatured: groupIndex < 3,
      isDay: false,
      displayOrder,
      updatedAt,
    };
  }));
}

// Só substitui a semente antiga intacta. Produtos editados pelo painel e
// cardápios reais precisam permanecer como estão.
const LEGACY_DEMO_IDS = new Set(["demo-brigadeiro", "demo-ninho", "demo-oreo", "demo-prestigio", "demo-ovomaltine", "demo-doce-de-leite"]);

export function isLegacyBrownieMenu(products: Array<{ id: string; name: string; basePrice: number; category?: string; imageUrl?: string; promotionalPrice?: number | null; minimumPromotionalQuantity?: number | null }>): boolean {
  return products.length === LEGACY_DEMO_IDS.size
    && products.every(product => LEGACY_DEMO_IDS.has(product.id)
      && product.name.startsWith("Brownie ")
      && product.basePrice === 5
      && product.category === "Brownies"
      && product.imageUrl === ""
      && product.promotionalPrice === 3
      && product.minimumPromotionalQuantity === 20);
}
