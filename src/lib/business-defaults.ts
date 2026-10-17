import { INITIAL_OPERATING_HOURS, isStructuredWeeklyHours } from "./business-hours.ts";
import { isValidWhatsappNumber } from "./whatsapp.ts";

// Endereço de retirada confirmado pela Sandra em 2026-10-17. O bairro Itaoca
// e a cidade vêm de informação já estabelecida no projeto; o CEP ainda não
// foi informado — ele não é necessário para a página, só para o cadastro no
// Google Empresa.
export const BROWNIER_PICKUP_ADDRESS = "Rua Ajurana, 80 — Itaoca, Fortaleza – CE";

// Valores que a semente já gravou antes de haver endereço real. Só estes são
// substituídos pelo backfill: qualquer outro texto veio do painel e é
// preservado.
const LEGACY_PICKUP_ADDRESSES = ["Fortaleza – CE", "Fortaleza - CE"];

// Ponto de referência, confirmado pela Sandra em 2026-10-17. Fica fora de
// `address` de propósito: o endereço precisa bater exatamente com o que for
// cadastrado no Google Empresa, e uma referência no meio quebra essa
// correspondência. Serve para o cliente achar o local, não para o rastreador.
export const BROWNIER_ADDRESS_REFERENCE = "Próximo ao Shopping Parangaba";
export const BROWNIER_RESPONSIBLE_NAME = "Sandra";
export const BROWNIER_PIX_KEY = "";

// WhatsApp oficial da loja, confirmado pela Sandra em 2026-10-17. Substitui o
// "+55 85 99003-808" anterior, que tinha só 8 dígitos depois do DDD e era
// rejeitado por `isValidWhatsappNumber` — o site ficava sem link nenhum.
// Pode ser trocado sem alterar código: por SANDRA_WHATSAPP no ambiente ou
// pelo painel em /equipe → Configurações, que agora persiste.
export const BROWNIER_WHATSAPP = process.env.SANDRA_WHATSAPP?.trim() || "+55 85 99900-3808";
export const BROWNIER_INSTAGRAM = "@delicias_da_sandraoficial";
export const BROWNIER_PAYMENT_METHODS = ["PIX", "DINHEIRO", "CARTAO"] as const;
export const BROWNIER_DELIVERY_ENABLED = false;
export const BROWNIER_HOURS_VERSION = 2;

type StoreWithBusiness = { business: Record<string, unknown> };

function isFilled(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

// O endereço de retirada é uma informação comercial oficial. Além de compor
// a semente, este backfill mantém instalações que já tinham o JSON criado com
// o valor vazio consistentes após reinício ou novo deploy.
//
// Preenche o vazio e corrige os textos de placeholder conhecidos, mas nunca
// sobrescreve um endereço digitado no painel: antes, o backfill rodava a cada
// loadStore() e revertia o que a Sandra salvava, que via "Configurações
// salvas" e encontrava o valor antigo no request seguinte.
export function ensureBrownierPickupAddress<T extends StoreWithBusiness>(store: T): T {
  const current = store.business.address;
  if (isFilled(current) && !LEGACY_PICKUP_ADDRESSES.includes((current as string).trim())) return store;
  return {
    ...store,
    business: {
      ...store.business,
      address: BROWNIER_PICKUP_ADDRESS,
    },
  };
}

// Preenche o vazio e respeita o que o painel cadastrou, igual aos demais.
export function ensureBrownierAddressReference<T extends StoreWithBusiness>(store: T): T {
  if (isFilled(store.business.addressReference)) return store;
  return { ...store, business: { ...store.business, addressReference: BROWNIER_ADDRESS_REFERENCE } };
}

// Fato comercial confirmado pelo responsável. Mantido no Store para que o
// agente responda de modo determinístico, inclusive em instalações antigas.
export function ensureBrownierResponsible<T extends StoreWithBusiness>(store: T): T {
  if (store.business.responsibleName === BROWNIER_RESPONSIBLE_NAME) return store;
  return { ...store, business: { ...store.business, responsibleName: BROWNIER_RESPONSIBLE_NAME } };
}

// Chave PIX comercial confirmada. Sem chave oficial ainda, o backfill não
// sobrescreve o que o painel já cadastrou (evita apagar valor operacional).
export function ensureBrownierPixKey<T extends StoreWithBusiness>(store: T): T {
  if (!BROWNIER_PIX_KEY) return store;
  if (store.business.pixKey === BROWNIER_PIX_KEY) return store;
  return { ...store, business: { ...store.business, pixKey: BROWNIER_PIX_KEY } };
}

// Canal oficial para comprovantes e dúvidas. O backfill mantém o contato
// disponível tanto para o link público do site quanto para o agente.
//
// Preenche quando o store não tem número e também quando o número salvo é
// inválido — mas nunca sobrescreve um número válido cadastrado no painel, que
// é hoje o único caminho para a Sandra corrigir o número incompleto da semente.
export function ensureBrownierWhatsapp<T extends StoreWithBusiness>(store: T): T {
  const current = store.business.whatsapp;
  if (isFilled(current) && isValidWhatsappNumber(current as string)) return store;
  if (current === BROWNIER_WHATSAPP) return store;
  return { ...store, business: { ...store.business, whatsapp: BROWNIER_WHATSAPP } };
}

// Mesma regra do endereço: preenche o vazio, respeita o que o painel salvou.
export function ensureBrownierInstagram<T extends StoreWithBusiness>(store: T): T {
  if (isFilled(store.business.instagram)) return store;
  return { ...store, business: { ...store.business, instagram: BROWNIER_INSTAGRAM } };
}

// Diferente de endereço e WhatsApp, esta lista é normalizada à força: ela
// define o que o site OFERECE, e manter "A_COMBINAR" fora das opções públicas
// é uma decisão de operação, não um dado que o painel edita. Incluir o cartão
// aqui é o que faz a opção aparecer em instalações já existentes.
export function ensureBrownierPaymentMethods<T extends StoreWithBusiness>(store: T): T {
  const current = store.business.paymentMethods;
  if (Array.isArray(current) && current.length === BROWNIER_PAYMENT_METHODS.length && current.every((value, index) => value === BROWNIER_PAYMENT_METHODS[index])) return store;
  return { ...store, business: { ...store.business, paymentMethods: [...BROWNIER_PAYMENT_METHODS] } };
}

export function ensureBrownierDeliveryEnabled<T extends StoreWithBusiness>(store: T): T {
  if (store.business.deliveryEnabled === BROWNIER_DELIVERY_ENABLED) return store;
  return { ...store, business: { ...store.business, deliveryEnabled: BROWNIER_DELIVERY_ENABLED } };
}

// Backfill idempotente do horário estruturado: só preenche quando
// `business.operatingHours` está ausente ou já não é um horário estruturado
// válido — instalações que já têm horário cadastrado pelo painel nunca são
// sobrescritas. Mesmo padrão de `ensureBrownierPickupAddress`: função pura,
// devolve a MESMA referência quando nada muda.
export function ensureBrownierOperatingHours<T extends StoreWithBusiness>(store: T): T {
  // Migração versionada: aplica a agenda oficial nova uma única vez às lojas
  // antigas; edições posteriores feitas no painel preservam a mesma versão.
  if (store.business.operatingHoursVersion === BROWNIER_HOURS_VERSION && isStructuredWeeklyHours(store.business.operatingHours)) return store;
  return {
    ...store,
    business: {
      ...store.business,
      operatingHours: INITIAL_OPERATING_HOURS,
      operatingHoursVersion: BROWNIER_HOURS_VERSION,
    },
  };
}
