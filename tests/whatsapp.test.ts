import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderWhatsappLink, buildOrderWhatsappMessage, buildWhatsappLink, isValidWhatsappNumber, normalizeWhatsappNumber } from "../src/lib/whatsapp.ts";

test("normaliza número com máscara brasileira, adicionando o código do país", () => {
  assert.equal(normalizeWhatsappNumber("(85) 99123-4567"), "5585991234567");
});

test("mantém o número quando o código do país já está presente com +55", () => {
  assert.equal(normalizeWhatsappNumber("+55 85 99123-4567"), "5585991234567");
});

test("mantém o número quando já vem somente com dígitos e código do país", () => {
  assert.equal(normalizeWhatsappNumber("5585991234567"), "5585991234567");
});

test("adiciona o código do país quando vem somente com dígitos e DDD (sem 55)", () => {
  assert.equal(normalizeWhatsappNumber("85991234567"), "5585991234567");
});

test("retorna string vazia quando o valor é vazio, nulo ou indefinido", () => {
  assert.equal(normalizeWhatsappNumber(""), "");
  assert.equal(normalizeWhatsappNumber(null), "");
  assert.equal(normalizeWhatsappNumber(undefined), "");
});

test("buildWhatsappLink retorna null quando não há número configurado", () => {
  assert.equal(buildWhatsappLink(""), null);
  assert.equal(buildWhatsappLink(null), null);
});

test("buildWhatsappLink gera URL wa.me com apenas dígitos e mensagem codificada", () => {
  const link = buildWhatsappLink("(85) 99123-4567", "Olá!");
  assert.equal(link, "https://wa.me/5585991234567?text=Ol%C3%A1!");
});

test("buildWhatsappLink usa a mensagem padrão quando nenhuma é informada", () => {
  const link = buildWhatsappLink("85991234567");
  assert.ok(link?.startsWith("https://wa.me/5585991234567?text="));
  assert.ok(link?.includes(encodeURIComponent("Delícias da Sandra")));
});

test("isValidWhatsappNumber aceita celular brasileiro com 9 dígitos", () => {
  assert.equal(isValidWhatsappNumber("(85) 99123-4567"), true);
  assert.equal(isValidWhatsappNumber("+55 85 99123-4567"), true);
  assert.equal(isValidWhatsappNumber("5585991234567"), true);
});

test("isValidWhatsappNumber rejeita celular com um dígito faltando", () => {
  // Casos reais que já estiveram configurados no projeto: 8 dígitos depois do
  // DDD, começando em 9 — nem celular (9 dígitos) nem fixo (começa em 2–5).
  assert.equal(isValidWhatsappNumber("+55 85 99003-808"), false);
  assert.equal(isValidWhatsappNumber("+55 85 9900-3808"), false);
  assert.equal(isValidWhatsappNumber("+55 85 9145-7889"), false);
  // Com o nono dígito, o mesmo número passa a ser válido.
  assert.equal(isValidWhatsappNumber("+55 85 99900-3808"), true);
});

test("isValidWhatsappNumber rejeita vazio, lixo e DDD impossível", () => {
  assert.equal(isValidWhatsappNumber(""), false);
  assert.equal(isValidWhatsappNumber(null), false);
  assert.equal(isValidWhatsappNumber("123"), false);
  assert.equal(isValidWhatsappNumber("5500991234567"), false);
  assert.equal(isValidWhatsappNumber("558599123456789"), false);
});

test("isValidWhatsappNumber aceita fixo comercial com 8 dígitos", () => {
  assert.equal(isValidWhatsappNumber("+55 85 3333-4444"), true);
});

test("buildWhatsappLink devolve null para número inválido em vez de link quebrado", () => {
  assert.equal(buildWhatsappLink("+55 85 99003-808"), null);
});

const orderInput = {
  greetingName: "Sandra",
  lines: [
    { name: "Brownie de Brigadeiro", quantity: 2, unitPrice: 5, total: 10 },
    { name: "Bolo de Cenoura com Chocolate", quantity: 1, unitPrice: 42.5, total: 42.5 },
  ],
  subtotal: 52.5,
  discount: 0,
  customerName: "Maria José da Conceição",
  customerPhone: "(85) 98888-7777",
  pickupMode: "PESSOAL" as const,
  pickupTime: "15:30",
  paymentMethod: "PIX",
  notes: "Sem açúcar no topo, por favor — é para uma comemoração à noite.",
};

test("mensagem do pedido não afirma de onde o pedido veio", () => {
  const message = buildOrderWhatsappMessage(orderInput);
  assert.match(message, /^Olá, Sandra! Gostaria de fazer este pedido:/);
  assert.equal(message.includes("pelo site"), false);
  assert.equal(message.includes("Delícias da Sandra"), false);
});

test("sem nome de quem atende, a saudação é neutra", () => {
  const { greetingName, ...semNome } = orderInput;
  assert.match(buildOrderWhatsappMessage(semNome), /^Olá! Gostaria de fazer este pedido:/);
});

test("mensagem do pedido traz itens, quantidades, valores unitários e total", () => {
  const message = buildOrderWhatsappMessage(orderInput);
  assert.match(message, /• 2x Brownie de Brigadeiro/);
  assert.match(message, /• 1x Bolo de Cenoura com Chocolate/);
  assert.ok(message.includes("52,50"), message);
  assert.ok(message.includes("42,50"), message);
  assert.match(message, /\*Total:/);
});

test("mensagem do pedido preserva acentuação e observações", () => {
  const message = buildOrderWhatsappMessage(orderInput);
  assert.ok(message.includes("Maria José da Conceição"), message);
  assert.ok(message.includes("Sem açúcar no topo"), message);
  assert.match(message, /\*Horário de retirada:\* 15:30/);
  assert.match(message, /\*Pagamento:\* PIX/);
  assert.match(message, /\*Retirada:\* Vou retirar pessoalmente/);
});

test("mensagem do pedido mostra economia quando há desconto por quantidade", () => {
  const message = buildOrderWhatsappMessage({ ...orderInput, subtotal: 60, discount: 40 });
  assert.match(message, /Subtotal: R\$\s100,00/);
  assert.match(message, /Economia: -R\$\s40,00/);
  assert.match(message, /\*Total: R\$\s60,00\*/);
});

test("mensagem do pedido omite campos não informados e nunca promete confirmação", () => {
  const message = buildOrderWhatsappMessage({
    greetingName: "Sandra",
    lines: [{ name: "Brownie de Oreo", quantity: 1, unitPrice: 5, total: 5 }],
    subtotal: 5,
    discount: 0,
    customerName: "Ana",
  });
  assert.equal(message.includes("Telefone:"), false);
  assert.equal(message.includes("Horário de retirada:"), false);
  assert.equal(message.includes("Troco para:"), false);
  assert.equal(message.includes("Observações:"), false);
  assert.equal(message.includes("Subtotal:"), false);
  assert.match(message, /aguardo da sua confirmação/);
});

test("mensagem do pedido inclui troco e modo Uber Moto quando informados", () => {
  const message = buildOrderWhatsappMessage({ ...orderInput, paymentMethod: "DINHEIRO", changeFor: "100", pickupMode: "UBER_MOTO" });
  assert.match(message, /\*Pagamento:\* Dinheiro/);
  assert.match(message, /\*Troco para:\* 100/);
  assert.match(message, /\*Retirada:\* Vou enviar um Uber Moto para retirar/);
});

test("link do pedido codifica a mensagem inteira e aponta para o número normalizado", () => {
  const link = buildOrderWhatsappLink("(85) 99123-4567", orderInput);
  assert.ok(link?.startsWith("https://wa.me/5585991234567?text="), String(link));
  const decoded = decodeURIComponent(link!.slice(link!.indexOf("?text=") + 6));
  assert.equal(decoded, buildOrderWhatsappMessage(orderInput));
  // Acentos e quebras de linha sobrevivem à ida e volta pela URL.
  assert.ok(decoded.includes("Maria José da Conceição"));
  assert.ok(decoded.includes("\n"));
  assert.equal(link!.includes(" "), false);
  assert.equal(link!.includes("\n"), false);
});

test("link do pedido é null quando o número da loja está pendente", () => {
  assert.equal(buildOrderWhatsappLink("+55 85 99003-808", orderInput), null);
});
