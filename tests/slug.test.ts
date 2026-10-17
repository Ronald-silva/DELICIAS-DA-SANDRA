import assert from "node:assert/strict";
import test from "node:test";
import { slugify, uniqueSlug } from "../src/lib/slug.ts";

test("slugify preserva todas as letras do nome", () => {
  // Regressão do bug que apagava todo "u", todo "f" e todos os dígitos: a
  // classe de caracteres que deveria remover acentos tinha uma barra
  // invertida a mais e acabava removendo 0-9, A-Z, "u" e "f".
  assert.equal(slugify("Bolo de Cenoura com Chocolate"), "bolo-de-cenoura-com-chocolate");
  assert.equal(slugify("Pudim"), "pudim");
  assert.equal(slugify("Brigadeiro Gourmet"), "brigadeiro-gourmet");
  assert.equal(slugify("Coxinha de Frango"), "coxinha-de-frango");
});

test("slugify mantém dígitos, que também eram apagados", () => {
  assert.equal(slugify("Bolo 2 andares"), "bolo-2-andares");
  assert.equal(slugify("Kit 12 brownies"), "kit-12-brownies");
});

test("slugify troca acento pela letra sem acento, em vez de cortar a palavra", () => {
  assert.equal(slugify("Pão de Mel"), "pao-de-mel");
  assert.equal(slugify("Torta de Limão"), "torta-de-limao");
  assert.equal(slugify("Maçã do Amor"), "maca-do-amor");
  assert.equal(slugify("Café Gelado"), "cafe-gelado");
  assert.equal(slugify("Açaí"), "acai");
});

test("slugify limpa pontuação, espaços repetidos e sobras nas pontas", () => {
  assert.equal(slugify("  Bolo   de   Fubá!!!  "), "bolo-de-fuba");
  assert.equal(slugify("Doce & Salgado"), "doce-salgado");
  assert.equal(slugify("---Brownie---"), "brownie");
});

test("slugify devolve vazio quando não sobra nada aproveitável", () => {
  assert.equal(slugify("🎂🎂"), "");
  assert.equal(slugify("!!!"), "");
  assert.equal(slugify(""), "");
});

test("uniqueSlug não repete endereço de produto já existente", () => {
  const existentes = ["bolo-de-cenoura", "bolo-de-cenoura-2"];
  assert.equal(uniqueSlug("Bolo de Cenoura", existentes), "bolo-de-cenoura-3");
  assert.equal(uniqueSlug("Bolo de Milho", existentes), "bolo-de-milho");
});

test("uniqueSlug cai no fallback quando o nome não gera slug", () => {
  assert.equal(uniqueSlug("🎂", [], "a1b2c3"), "a1b2c3");
  assert.equal(uniqueSlug("🎂", [], ""), "item");
});

test("uniqueSlug não devolve string vazia nem com fallback vazio", () => {
  const slug = uniqueSlug("", [], "");
  assert.ok(slug.length > 0);
  assert.match(slug, /^[a-z0-9-]+$/);
});
