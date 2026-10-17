import assert from "node:assert/strict";
import test from "node:test";
import { ACCEPTED_PAYMENT_METHODS, PAYMENT_METHODS, isAcceptedPaymentMethod, paymentLabel } from "../src/lib/payment.ts";
import { BROWNIER_PAYMENT_METHODS, ensureBrownierPaymentMethods } from "../src/lib/business-defaults.ts";

test("cartão faz parte das formas oferecidas no site", () => {
  assert.deepEqual([...PAYMENT_METHODS], ["PIX", "DINHEIRO", "CARTAO"]);
  assert.deepEqual([...BROWNIER_PAYMENT_METHODS], ["PIX", "DINHEIRO", "CARTAO"]);
});

test("A_COMBINAR continua aceito pelo servidor, mas não é oferecido no site", () => {
  // Pedidos montados no atendimento por WhatsApp podem usá-lo.
  assert.equal(isAcceptedPaymentMethod("A_COMBINAR"), true);
  assert.equal((PAYMENT_METHODS as readonly string[]).includes("A_COMBINAR"), false);
  assert.deepEqual([...ACCEPTED_PAYMENT_METHODS], ["PIX", "DINHEIRO", "CARTAO", "A_COMBINAR"]);
});

test("rótulos são escritos para o cliente, não em caixa alta de banco de dados", () => {
  assert.equal(paymentLabel("PIX"), "PIX");
  assert.equal(paymentLabel("DINHEIRO"), "Dinheiro");
  assert.equal(paymentLabel("CARTAO"), "Cartão");
  assert.equal(paymentLabel("A_COMBINAR"), "A combinar");
});

test("rótulo desconhecido é devolvido como veio, sem quebrar a tela", () => {
  assert.equal(paymentLabel("VALE_REFEICAO"), "VALE_REFEICAO");
  assert.equal(paymentLabel(""), "");
  assert.equal(paymentLabel(undefined), "");
});

test("validação recusa forma de pagamento não aceita", () => {
  assert.equal(isAcceptedPaymentMethod("BOLETO"), false);
  assert.equal(isAcceptedPaymentMethod(""), false);
  assert.equal(isAcceptedPaymentMethod(null), false);
  assert.equal(isAcceptedPaymentMethod(123), false);
});

test("backfill migra a lista antiga para incluir cartão", () => {
  const store = { business: { paymentMethods: ["PIX", "DINHEIRO"] }, products: [], orders: [] };
  assert.deepEqual(ensureBrownierPaymentMethods(store).business.paymentMethods, ["PIX", "DINHEIRO", "CARTAO"]);
});

test("backfill preenche quando a lista está ausente ou vazia", () => {
  for (const atual of [undefined, [], "nada"]) {
    const store: { business: Record<string, unknown>; products: unknown[]; orders: unknown[] } = { business: { paymentMethods: atual }, products: [], orders: [] };
    assert.deepEqual(ensureBrownierPaymentMethods(store).business.paymentMethods, ["PIX", "DINHEIRO", "CARTAO"]);
  }
});

test("backfill normaliza à força: a lista do site é decidida no código", () => {
  // Diferente de endereço e WhatsApp, esta lista não é editada pelo painel —
  // ela define o que o site oferece, e é normalizada em todo boot. É o que
  // mantém "A_COMBINAR" fora das opções públicas.
  const store = { business: { paymentMethods: ["PIX", "A_COMBINAR"] }, products: [], orders: [] };
  assert.deepEqual(ensureBrownierPaymentMethods(store).business.paymentMethods, ["PIX", "DINHEIRO", "CARTAO"]);
});

test("backfill é idempotente quando a lista já está correta", () => {
  const store = { business: { paymentMethods: ["PIX", "DINHEIRO", "CARTAO"] }, products: [], orders: [] };
  assert.equal(ensureBrownierPaymentMethods(store), store);
});
