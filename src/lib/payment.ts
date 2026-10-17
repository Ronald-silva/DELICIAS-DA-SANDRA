// Formas de pagamento aceitas e como cada uma é escrita para o cliente.
// Fica num módulo só porque o mesmo rótulo aparece no checkout, na mensagem
// do WhatsApp e no painel — antes, cada lugar escrevia o seu, e o cliente via
// "DINHEIRO" em caixa alta num botão e "Dinheiro" na mensagem.

export const PAYMENT_METHODS = ["PIX", "DINHEIRO", "CARTAO"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

// A_COMBINAR não é oferecido no site, mas continua aceito pelo servidor para
// pedidos vindos do atendimento por WhatsApp.
const LABELS: Record<string, string> = {
  PIX: "PIX",
  DINHEIRO: "Dinheiro",
  CARTAO: "Cartão",
  A_COMBINAR: "A combinar",
};

export const ACCEPTED_PAYMENT_METHODS = [...PAYMENT_METHODS, "A_COMBINAR"] as const;

export function paymentLabel(method: string | undefined | null): string {
  const key = (method ?? "").trim().toUpperCase();
  return LABELS[key] ?? (method ?? "").trim();
}

export function isAcceptedPaymentMethod(method: unknown): boolean {
  return typeof method === "string" && (ACCEPTED_PAYMENT_METHODS as readonly string[]).includes(method.trim().toUpperCase());
}
