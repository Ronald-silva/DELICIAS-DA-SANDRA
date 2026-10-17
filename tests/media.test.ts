import assert from "node:assert/strict";
import test from "node:test";
import { hasRealProductImage, productImageSrc } from "../src/lib/media.ts";

test("retorna a imagem enviada quando imageUrl está preenchida", () => {
  assert.equal(productImageSrc({ imageUrl: "data:image/png;base64,AAAA" }), "data:image/png;base64,AAAA");
});

test("retorna a imagem demonstrativa quando imageUrl está ausente", () => {
  assert.equal(productImageSrc({}), "/images/brownie-hero-demo.webp");
});

test("retorna a imagem demonstrativa quando imageUrl é string vazia", () => {
  assert.equal(productImageSrc({ imageUrl: "" }), "/images/brownie-hero-demo.webp");
});

test("hasRealProductImage distingue foto cadastrada de imagem de demonstração", () => {
  assert.equal(hasRealProductImage({ imageUrl: "data:image/png;base64,AAAA" }), true);
  assert.equal(hasRealProductImage({}), false);
  assert.equal(hasRealProductImage({ imageUrl: "" }), false);
  assert.equal(hasRealProductImage({ imageUrl: "   " }), false);
});

test("productImageSrc ignora imageUrl só com espaços", () => {
  assert.equal(productImageSrc({ imageUrl: "   " }), "/images/brownie-hero-demo.webp");
});
