// Máscaras de entrada. Tudo puro: recebe o que a pessoa digitou, devolve o
// texto formatado. Nenhuma função aqui lê o DOM.
//
// Princípios seguidos em todas elas:
// - Formatam progressivamente, enquanto a pessoa digita, sem esperar o fim.
// - Nunca recusam a digitação: o que não serve é descartado em silêncio, de
//   modo que colar um valor de qualquer formato funciona.
// - Trabalham sobre os dígitos, então apagar com backspace volta um caractere
//   de cada vez, sem o cursor "pular" para o fim.
// - Têm sempre uma função de leitura (`unmask…`) para devolver o valor cru a
//   quem for gravar.

export function onlyDigits(value: string): string {
  return (value ?? "").replace(/\D/g, "");
}

// Um número nacional brasileiro tem no máximo 11 dígitos. Passou disso e
// começa com 55, é o código do país colado junto — sem isto, colar
// "+55 85 99123-4567" faria o 55 virar DDD. O corte só vale acima de 11
// dígitos, então quem tem DDD 55 digita normalmente.
function stripCountryCode(digits: string): string {
  return digits.length > 11 && digits.startsWith("55") ? digits.slice(2) : digits;
}

// Telefone brasileiro: (85) 99999-9999 para celular, (85) 3333-4444 para fixo.
// O formato muda sozinho no nono dígito, sem exigir que a pessoa escolha antes
// qual é o tipo do número.
export function maskPhoneBR(value: string): string {
  const d = stripCountryCode(onlyDigits(value)).slice(0, 11);
  if (d.length <= 2) return d.length ? `(${d}` : "";
  const ddd = `(${d.slice(0, 2)}) `;
  const resto = d.slice(2);
  if (resto.length <= 4) return ddd + resto;
  if (resto.length <= 8) return `${ddd}${resto.slice(0, 4)}-${resto.slice(4)}`;
  return `${ddd}${resto.slice(0, 5)}-${resto.slice(5)}`;
}

// Moeda: a digitação alimenta os centavos, da direita para a esquerda —
// digitar 1,2,3,4 mostra R$ 12,34. É o padrão que não exige que a pessoa
// acerte vírgula nem ponto, e resolve o conflito entre o separador decimal
// brasileiro e o teclado numérico do celular.
export function maskCurrencyBRL(value: string): string {
  const d = onlyDigits(value).replace(/^0+(?=\d)/, "").slice(0, 11);
  if (!d) return "";
  const centavos = d.padStart(3, "0");
  const inteiros = centavos.slice(0, -2);
  const decimais = centavos.slice(-2);
  return `R$ ${Number(inteiros).toLocaleString("pt-BR")},${decimais}`;
}

// Leitura do valor mascarado como número. Aceita também o que a pessoa possa
// ter colado ("12.50", "12,50", "R$ 12,50").
export function parseCurrencyBRL(value: string): number {
  const texto = (value ?? "").trim();
  if (!texto) return 0;
  const d = onlyDigits(texto);
  if (!d) return 0;
  // Se veio mascarado por esta própria máscara, os dois últimos dígitos são
  // os centavos. Se a pessoa colou "12.5" ou "12,5", respeitamos o separador.
  const separador = /[.,](\d{1,2})\s*$/.exec(texto);
  if (separador && !texto.startsWith("R$")) {
    const inteiro = onlyDigits(texto.slice(0, separador.index));
    const centavos = separador[1]!.padEnd(2, "0");
    return Number(`${inteiro || "0"}.${centavos}`);
  }
  if (!/[.,]/.test(texto)) return Number(d);
  return Number(d) / 100;
}

// Inteiro positivo, para quantidade e ordem de exibição.
export function maskInteger(value: string, max = 6): string {
  return onlyDigits(value).replace(/^0+(?=\d)/, "").slice(0, max);
}

// Formata um número já guardado para dentro do campo mascarado.
export function currencyToMask(value: number | null | undefined): string {
  if (value === null || value === undefined || !Number.isFinite(value)) return "";
  return maskCurrencyBRL(String(Math.round(value * 100)));
}
