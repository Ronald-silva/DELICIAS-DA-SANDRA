import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { createSandraMenuProducts, isLegacyBrownieMenu } from "../src/lib/menu-catalog.ts";

test("cardápio da Sandra contém nove fotos e todos os preços por peso", () => {
  const products = createSandraMenuProducts("2026-10-30T00:00:00.000Z");
  const groups = new Map<string, typeof products>();
  for (const product of products) {
    groups.set(product.menuGroup, [...(groups.get(product.menuGroup) || []), product]);
    assert.ok(existsSync(path.resolve("public", product.imageUrl.slice(1))), product.imageUrl);
    assert.equal(product.promotionalPrice, null);
  }
  assert.equal(groups.size, 9);
  assert.equal(products.length, 14);
  assert.deepEqual(groups.get("amanteigado-doce-leite")?.map(({ sizeLabel, basePrice }) => [sizeLabel, basePrice]), [["1 kg", 40], ["500 g", 25]]);
  assert.deepEqual(groups.get("bolo-milho-cremoso")?.map(({ sizeLabel, basePrice }) => [sizeLabel, basePrice]), [["1,5 kg", 50], ["600 g", 30]]);
  for (const group of ["chocolate-brigadeiro", "cenoura-chocolate", "amanteigado-abacaxi"]) {
    assert.deepEqual(groups.get(group)?.map(({ sizeLabel, basePrice }) => [sizeLabel, basePrice]), [["1 kg", 40], ["500 g", 25]]);
  }
  assert.deepEqual(["fofo-amanteigado", "bolo-mole", "torta-frango", "empadao"].map(group => groups.get(group)?.[0]?.basePrice), [30, 50, 80, 80]);
});

test("migração reconhece somente a semente antiga intacta", () => {
  const legacy = ["brigadeiro", "ninho", "oreo", "prestigio", "ovomaltine", "doce-de-leite"].map(slug => ({ id: `demo-${slug}`, name: `Brownie ${slug}`, basePrice: 5, category: "Brownies", imageUrl: "", promotionalPrice: 3, minimumPromotionalQuantity: 20 }));
  assert.equal(isLegacyBrownieMenu(legacy), true);
  assert.equal(isLegacyBrownieMenu(legacy.map((product, index) => index === 0 ? { ...product, basePrice: 6 } : product)), false);
  assert.equal(isLegacyBrownieMenu(legacy.map((product, index) => index === 0 ? { ...product, imageUrl: "/images/foto-propria.jpg" } : product)), false);
  assert.equal(isLegacyBrownieMenu(createSandraMenuProducts()), false);
});
