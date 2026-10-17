import { formatCurrency } from "./format.ts";
import { paymentLabel } from "./payment.ts";

const DEFAULT_MESSAGE = "Olá! Vim pelo cardápio da Delícias da Sandra e gostaria de tirar uma dúvida.";

export function normalizeWhatsappNumber(raw: string | undefined | null): string {
  const digits = (raw ?? "").replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("55") && digits.length >= 12) return digits;
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

// Um número brasileiro de WhatsApp é 55 + DDD (2 dígitos, 11 a 99) + assinante.
// Celular: 9 dígitos começando em 9 (13 no total). Fixo: 8 dígitos começando
// em 2–5 (12 no total).
//
// A validação existe porque normalizeWhatsappNumber apenas junta dígitos: ela
// devolve "558599003808" para o número que está hoje na configuração, que é um
// celular com um dígito faltando. Sem esta checagem o site monta um link wa.me
// para uma conversa que não existe, e o cliente acha que falou com a Sandra.
export function isValidWhatsappNumber(raw: string | undefined | null): boolean {
  const digits = normalizeWhatsappNumber(raw);
  if (!/^55\d{10,11}$/.test(digits)) return false;
  if (Number(digits.slice(2, 4)) < 11) return false;
  const subscriber = digits.slice(4);
  return subscriber.length === 9 ? subscriber.startsWith("9") : /^[2-5]/.test(subscriber);
}

export function buildWhatsappLink(raw: string | undefined | null, message: string = DEFAULT_MESSAGE): string | null {
  if (!isValidWhatsappNumber(raw)) return null;
  return `https://wa.me/${normalizeWhatsappNumber(raw)}?text=${encodeURIComponent(message)}`;
}

export type OrderMessageLine = { name: string; quantity: number; unitPrice: number; total: number };

export type OrderMessageInput = {
  // Nome de quem atende, para a saudação. Opcional: sem ele a mensagem abre
  // com um "Olá!" neutro em vez de inventar um nome.
  greetingName?: string;
  lines: OrderMessageLine[];
  // Mesma semântica de AppContext.summary: `subtotal` já é o valor a pagar
  // (desconto por quantidade aplicado) e `discount` é a economia obtida.
  subtotal: number;
  discount: number;
  customerName: string;
  customerPhone?: string;
  pickupMode?: "PESSOAL" | "UBER_MOTO";
  pickupTime?: string;
  paymentMethod?: string;
  changeFor?: string;
  notes?: string;
};

const PICKUP_MODE_LABELS: Record<string, string> = {
  PESSOAL: "Vou retirar pessoalmente",
  UBER_MOTO: "Vou enviar um Uber Moto para retirar",
};

function clean(value: string | undefined): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

// Monta o texto que o cliente vai enviar à Sandra. É só texto: quem envia é a
// pessoa, dentro do WhatsApp dela. Por isso a última linha deixa explícito que
// o pedido ainda depende da confirmação da Sandra — nada aqui promete que o
// pedido foi aceito.
export function buildOrderWhatsappMessage(input: OrderMessageInput): string {
  const blocks: string[] = [];
  const name = clean(input.customerName);
  const greeting = clean(input.greetingName);

  // A mensagem não afirma de onde o pedido veio: o canal de atendimento pode
  // mudar de endereço, e quem recebe já reconhece o formato.
  blocks.push(greeting ? `Olá, ${greeting}! Gostaria de fazer este pedido:` : "Olá! Gostaria de fazer este pedido:");

  const items = input.lines
    .filter(line => line.quantity > 0)
    .map(line => `• ${line.quantity}x ${line.name} — ${formatCurrency(line.unitPrice)} cada = ${formatCurrency(line.total)}`);
  blocks.push(["*Pedido*", ...items].join("\n"));

  const totals: string[] = [];
  if (input.discount > 0) {
    totals.push(`Subtotal: ${formatCurrency(input.subtotal + input.discount)}`);
    totals.push(`Economia: -${formatCurrency(input.discount)}`);
  }
  totals.push(`*Total: ${formatCurrency(input.subtotal)}*`);
  blocks.push(totals.join("\n"));

  const details: string[] = [];
  if (name) details.push(`*Nome:* ${name}`);
  if (clean(input.customerPhone)) details.push(`*Telefone:* ${clean(input.customerPhone)}`);
  const pickupLabel = input.pickupMode ? PICKUP_MODE_LABELS[input.pickupMode] : undefined;
  if (pickupLabel) details.push(`*Retirada:* ${pickupLabel}`);
  if (clean(input.pickupTime)) details.push(`*Horário de retirada:* ${clean(input.pickupTime)}`);
  const pagamento = input.paymentMethod ? paymentLabel(input.paymentMethod) : "";
  if (pagamento) details.push(`*Pagamento:* ${pagamento}`);
  if (clean(input.changeFor)) details.push(`*Troco para:* ${clean(input.changeFor)}`);
  if (details.length > 0) blocks.push(details.join("\n"));

  const notes = clean(input.notes);
  if (notes) blocks.push(`*Observações:* ${notes}`);

  blocks.push("Fico no aguardo da sua confirmação. Obrigado!");

  return blocks.join("\n\n");
}

export function buildOrderWhatsappLink(raw: string | undefined | null, input: OrderMessageInput): string | null {
  return buildWhatsappLink(raw, buildOrderWhatsappMessage(input));
}
