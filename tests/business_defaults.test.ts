import assert from "node:assert/strict";
import test from "node:test";
import { BROWNIER_ADDRESS_REFERENCE, BROWNIER_DELIVERY_ENABLED, BROWNIER_HOURS_VERSION, BROWNIER_INSTAGRAM, BROWNIER_PAYMENT_METHODS, BROWNIER_PICKUP_ADDRESS, BROWNIER_PIX_KEY, BROWNIER_RESPONSIBLE_NAME, BROWNIER_WHATSAPP, ensureBrownierAddressReference, ensureBrownierDeliveryEnabled, ensureBrownierInstagram, ensureBrownierPaymentMethods, ensureBrownierPickupAddress, ensureBrownierOperatingHours, ensureBrownierPixKey, ensureBrownierResponsible, ensureBrownierWhatsapp } from "../src/lib/business-defaults.ts";
import { INITIAL_OPERATING_HOURS } from "../src/lib/business-hours.ts";
import { isValidWhatsappNumber } from "../src/lib/whatsapp.ts";
import { buildPostalAddress } from "../src/lib/seo.ts";

test("a semente comercial usa o endereço oficial de retirada", () => {
  assert.equal(BROWNIER_PICKUP_ADDRESS, "Rua Ajurana, 80 — Itaoca, Fortaleza – CE");
});

test("o endereço oficial sustenta um PostalAddress com cidade e estado separados", () => {
  // Trava de regressão: se o formato do endereço mudar e deixar de ser
  // reconhecido, o dado estruturado local perde addressLocality, que é por
  // onde a busca local casa o negócio com a região.
  assert.deepEqual(buildPostalAddress(BROWNIER_PICKUP_ADDRESS), {
    "@type": "PostalAddress",
    streetAddress: "Rua Ajurana, 80 — Itaoca",
    addressLocality: "Fortaleza",
    addressRegion: "CE",
    addressCountry: "BR",
  });
});

test("backfill troca o placeholder antigo de endereço pelo endereço real", () => {
  for (const legado of ["Fortaleza – CE", "Fortaleza - CE", " Fortaleza – CE "]) {
    const store = { business: { address: legado }, products: [], orders: [] };
    assert.equal(ensureBrownierPickupAddress(store).business.address, BROWNIER_PICKUP_ADDRESS, legado);
  }
});

test("ponto de referência é cadastrado e fica fora do endereço estruturado", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: {}, products: [], orders: [] };
  const result = ensureBrownierAddressReference(store);
  assert.equal(result.business.addressReference, BROWNIER_ADDRESS_REFERENCE);
  assert.equal(BROWNIER_ADDRESS_REFERENCE, "Próximo ao Shopping Parangaba");
  assert.equal(ensureBrownierAddressReference(result), result);
  // O endereço estruturado não pode carregar a referência.
  assert.equal(JSON.stringify(buildPostalAddress(BROWNIER_PICKUP_ADDRESS)).includes("Parangaba"), false);
});

test("backfill não sobrescreve o ponto de referência cadastrado no painel", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { addressReference: "Ao lado da praça" }, products: [], orders: [] };
  assert.equal(ensureBrownierAddressReference(store), store);
});

test("backfill persiste o endereço oficial sem alterar os demais dados comerciais", () => {
  const store = {
    business: { name: "Delícias da Sandra", address: "", phone: "", hours: "", paymentMethods: ["PIX"] },
    products: [],
    orders: [],
  };
  const result = ensureBrownierPickupAddress(store);
  assert.equal(result.business.address, BROWNIER_PICKUP_ADDRESS);
  assert.equal(result.business.phone, "");
  assert.equal(result.business.hours, "");
  assert.deepEqual(result.business.paymentMethods, ["PIX"]);
  assert.equal(store.business.address, "");
});

test("backfill é idempotente quando o endereço já está correto", () => {
  const store = { business: { address: BROWNIER_PICKUP_ADDRESS }, products: [], orders: [] };
  assert.equal(ensureBrownierPickupAddress(store), store);
});

test("backfill não sobrescreve o endereço cadastrado no painel", () => {
  const store = { business: { address: "Rua Alguma, 100 — Fortaleza – CE" }, products: [], orders: [] };
  assert.equal(ensureBrownierPickupAddress(store), store);
  assert.equal(store.business.address, "Rua Alguma, 100 — Fortaleza – CE");
});

test("backfill cadastra Sandra como responsável comercial", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { name: "Delícias da Sandra" }, products: [], orders: [] };
  const result = ensureBrownierResponsible(store);
  assert.equal(BROWNIER_RESPONSIBLE_NAME, "Sandra");
  assert.equal(result.business.responsibleName, "Sandra");
  assert.equal(store.business.responsibleName, undefined);
});

test("sem chave PIX oficial o backfill não sobrescreve o store", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { pixKey: "chave-temporaria" }, products: [], orders: [] };
  assert.equal(BROWNIER_PIX_KEY, "");
  assert.equal(ensureBrownierPixKey(store), store);
  assert.equal(store.business.pixKey, "chave-temporaria");
});

test("backfill cadastra o WhatsApp da semente quando o store está sem número", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { whatsapp: "" }, products: [], orders: [] };
  const result = ensureBrownierWhatsapp(store);
  assert.equal(result.business.whatsapp, BROWNIER_WHATSAPP);
  assert.equal(ensureBrownierWhatsapp(result), result);
});

test("o WhatsApp da semente é um número válido, pronto para virar link", () => {
  // Trava de regressão do número oficial: se alguém trocar a semente por um
  // valor malformado, o site inteiro fica sem link de WhatsApp.
  assert.equal(isValidWhatsappNumber(BROWNIER_WHATSAPP), true);
  assert.equal(BROWNIER_WHATSAPP, "+55 85 99900-3808");
});

test("backfill não sobrescreve um WhatsApp válido cadastrado no painel", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { whatsapp: "(85) 98888-7777" }, products: [], orders: [] };
  assert.equal(ensureBrownierWhatsapp(store), store);
  assert.equal(store.business.whatsapp, "(85) 98888-7777");
});

test("backfill substitui um WhatsApp inválido cadastrado no painel", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { whatsapp: "123" }, products: [], orders: [] };
  assert.equal(ensureBrownierWhatsapp(store).business.whatsapp, BROWNIER_WHATSAPP);
});

test("backfill cadastra o Instagram oficial", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { instagram: "" }, products: [], orders: [] };
  const result = ensureBrownierInstagram(store);
  assert.equal(result.business.instagram, BROWNIER_INSTAGRAM);
  assert.equal(BROWNIER_INSTAGRAM, "@delicias_da_sandraoficial");
  assert.equal(ensureBrownierInstagram(result), result);
});

test("backfill não sobrescreve o Instagram cadastrado no painel", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { instagram: "@outro_perfil" }, products: [], orders: [] };
  assert.equal(ensureBrownierInstagram(store), store);
});

test("backfill mantém PIX, dinheiro e cartão, e tira A_COMBINAR das opções do site", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { paymentMethods: ["PIX", "DINHEIRO", "A_COMBINAR"] }, products: [], orders: [] };
  const result = ensureBrownierPaymentMethods(store);
  assert.deepEqual(BROWNIER_PAYMENT_METHODS, ["PIX", "DINHEIRO", "CARTAO"]);
  assert.deepEqual(result.business.paymentMethods, ["PIX", "DINHEIRO", "CARTAO"]);
});

test("backfill mantém entregas desabilitadas conforme a informação comercial oficial", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { deliveryEnabled: false }, products: [], orders: [] };
  assert.equal(ensureBrownierDeliveryEnabled(store).business.deliveryEnabled, BROWNIER_DELIVERY_ENABLED);
});

test("backfill de horário: preenche o horário inicial quando não há operatingHours cadastrado", () => {
  const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = {
    business: { name: "Delícias da Sandra", hours: "" }, products: [], orders: [],
  };
  const result = ensureBrownierOperatingHours(store);
  assert.deepEqual(result.business.operatingHours, INITIAL_OPERATING_HOURS);
  assert.equal(result.business.operatingHoursVersion, BROWNIER_HOURS_VERSION);
  assert.equal(result.business.name, "Delícias da Sandra");
  // Store original não é mutado.
  assert.equal(store.business.operatingHours, undefined);
});

test("backfill de horário é idempotente: nunca sobrescreve um horário já cadastrado pelo painel", () => {
  const customHours = { ...INITIAL_OPERATING_HOURS, SUN: [{ open: "10:00", close: "14:00" }] };
  const store = { business: { operatingHours: customHours, operatingHoursVersion: BROWNIER_HOURS_VERSION }, products: [], orders: [] };
  assert.equal(ensureBrownierOperatingHours(store), store);
  assert.deepEqual(store.business.operatingHours, customHours);
});

test("backfill de horário trata operatingHours malformado como ausente e recadastra o inicial", () => {
  const store = { business: { operatingHours: { MON: "não é uma lista" } }, products: [], orders: [] };
  const result = ensureBrownierOperatingHours(store);
  assert.deepEqual(result.business.operatingHours, INITIAL_OPERATING_HOURS);
});
