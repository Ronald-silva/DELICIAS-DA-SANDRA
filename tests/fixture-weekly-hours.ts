// Agenda de exemplo para os testes que exercitam ALGORITMO (está aberto
// agora? qual a próxima abertura? como o atendimento verbaliza o horário?).
//
// Existe para que esses testes não dependam de INITIAL_OPERATING_HOURS, que é
// o horário comercial real da loja: quando a Sandra muda o expediente, quem
// precisa mudar junto é o teste que FIXA esse horário (business_hours.test.ts),
// não uma dúzia de testes de lógica que só precisavam de uma semana qualquer.
import type { StructuredWeeklyHours } from "../src/lib/business-hours.ts";

export const SAMPLE_WEEKLY_HOURS: StructuredWeeklyHours = {
  MON: [{ open: "14:00", close: "22:00" }],
  TUE: [{ open: "14:00", close: "22:00" }],
  WED: [{ open: "14:00", close: "22:00" }],
  THU: [{ open: "14:00", close: "22:00" }],
  FRI: [{ open: "14:00", close: "22:00" }],
  SAT: [],
  SUN: [],
};
