import assert from "node:assert/strict";
import test from "node:test";
import { currencyToMask, maskCurrencyBRL, maskInteger, maskPhoneBR, onlyDigits, parseCurrencyBRL } from "../src/lib/mask.ts";

test("telefone se forma enquanto a pessoa digita, sem travar em nenhum passo", () => {
  // Até 10 dígitos o número ainda cabe num fixo, então é assim que aparece; no
  // 11º dígito a máscara vira celular sozinha. É o que a pessoa vê digitando.
  const passos = ["8", "85", "859", "8599", "85991", "859912", "8599123", "85991234", "859912345", "8599123456", "85991234567"];
  const esperado = ["(8", "(85", "(85) 9", "(85) 99", "(85) 991", "(85) 9912", "(85) 9912-3", "(85) 9912-34", "(85) 9912-345", "(85) 9912-3456", "(85) 99123-4567"];
  passos.forEach((entrada, i) => assert.equal(maskPhoneBR(entrada), esperado[i], entrada));
});

test("telefone fixo de 10 dígitos fica com 4 dígitos antes do hífen", () => {
  assert.equal(maskPhoneBR("8533334444"), "(85) 3333-4444");
});

test("telefone aceita valor colado em qualquer formato", () => {
  assert.equal(maskPhoneBR("85 99123 4567"), "(85) 99123-4567");
  assert.equal(maskPhoneBR("(85)99123-4567"), "(85) 99123-4567");
});

test("telefone descarta o código do país colado junto", () => {
  // Sem isso, o 55 do país virava o DDD e o número saía todo deslocado.
  assert.equal(maskPhoneBR("+55 (85) 99123-4567"), "(85) 99123-4567");
  assert.equal(maskPhoneBR("5585991234567"), "(85) 99123-4567");
  assert.equal(maskPhoneBR("+55 85 3333-4444"), "(85) 3333-4444");
  assert.equal(maskPhoneBR("+55 85 99900-3808"), "(85) 99900-3808");
});

test("DDD 55 continua funcionando ao ser digitado", () => {
  // O corte só vale acima de 11 dígitos, então um número de Santa Maria (RS)
  // digitado normalmente não é confundido com código de país.
  assert.equal(maskPhoneBR("55999887766"), "(55) 99988-7766");
  assert.equal(maskPhoneBR("5533334444"), "(55) 3333-4444");
});

test("telefone descarta o excedente em vez de recusar a digitação", () => {
  assert.equal(maskPhoneBR("859912345679999"), "(85) 99123-4567");
  assert.equal(maskPhoneBR("abc"), "");
  assert.equal(maskPhoneBR(""), "");
});

test("apagar o telefone volta um caractere por vez", () => {
  // Simula backspace: a máscara é reaplicada sobre o texto já encurtado.
  let texto = "(85) 99123-4567";
  const vistos: string[] = [];
  while (texto) { texto = maskPhoneBR(texto.slice(0, -1)); vistos.push(texto); }
  assert.deepEqual(vistos.slice(0, 4), ["(85) 9912-3456", "(85) 9912-345", "(85) 9912-34", "(85) 9912-3"]);
  assert.equal(vistos.at(-1), "");
});

test("moeda preenche centavos da direita para a esquerda", () => {
  assert.equal(maskCurrencyBRL("1"), "R$ 0,01");
  assert.equal(maskCurrencyBRL("12"), "R$ 0,12");
  assert.equal(maskCurrencyBRL("123"), "R$ 1,23");
  assert.equal(maskCurrencyBRL("1234"), "R$ 12,34");
  assert.equal(maskCurrencyBRL("123456"), "R$ 1.234,56");
});

test("moeda ignora o que não é dígito e zeros à esquerda", () => {
  assert.equal(maskCurrencyBRL("R$ 12,34"), "R$ 12,34");
  assert.equal(maskCurrencyBRL("abc"), "");
  assert.equal(maskCurrencyBRL(""), "");
  assert.equal(maskCurrencyBRL("0001234"), "R$ 12,34");
});

test("moeda lida com valor alto sem perder a separação de milhar", () => {
  assert.equal(maskCurrencyBRL("123456789"), "R$ 1.234.567,89");
});

test("leitura da moeda devolve o número que será gravado", () => {
  assert.equal(parseCurrencyBRL("R$ 12,34"), 12.34);
  assert.equal(parseCurrencyBRL("R$ 1.234,56"), 1234.56);
  assert.equal(parseCurrencyBRL("R$ 0,05"), 0.05);
  assert.equal(parseCurrencyBRL(""), 0);
});

test("leitura da moeda respeita o separador de um valor colado", () => {
  assert.equal(parseCurrencyBRL("12,50"), 12.5);
  assert.equal(parseCurrencyBRL("12.50"), 12.5);
  assert.equal(parseCurrencyBRL("12,5"), 12.5);
  assert.equal(parseCurrencyBRL("45"), 45);
});

test("moeda e leitura são consistentes nos dois sentidos", () => {
  for (const valor of [0.05, 5, 12.34, 45.9, 1234.56]) {
    assert.equal(parseCurrencyBRL(currencyToMask(valor)), valor, String(valor));
  }
  assert.equal(currencyToMask(null), "");
  assert.equal(currencyToMask(undefined), "");
});

test("inteiro aceita só dígitos e remove zero à esquerda", () => {
  assert.equal(maskInteger("20"), "20");
  assert.equal(maskInteger("0020"), "20");
  assert.equal(maskInteger("2a0"), "20");
  assert.equal(maskInteger(""), "");
  assert.equal(maskInteger("1234567890", 4), "1234");
});

test("onlyDigits é a base compartilhada das máscaras", () => {
  assert.equal(onlyDigits("(85) 99123-4567"), "85991234567");
  assert.equal(onlyDigits("R$ 1.234,56"), "123456");
});
