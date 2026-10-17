import assert from "node:assert/strict";
import test from "node:test";
import { INITIAL_OPERATING_HOURS, summarizeWeeklyHoursBR, type StructuredWeeklyHours } from "../src/lib/business-hours.ts";
import { SAMPLE_WEEKLY_HOURS } from "./fixture-weekly-hours.ts";

const closed: StructuredWeeklyHours = { MON: [], TUE: [], WED: [], THU: [], FRI: [], SAT: [], SUN: [] };

test("agrupa dias seguidos com o mesmo intervalo", () => {
  assert.equal(summarizeWeeklyHoursBR(SAMPLE_WEEKLY_HOURS), "Segunda a sexta, 14h às 22h");
});

test("um único dia aberto não vira intervalo", () => {
  assert.equal(summarizeWeeklyHoursBR({ ...closed, SAT: [{ open: "09:00", close: "13:30" }] }), "Sábado, 9h às 13h30");
});

test("grupos diferentes são separados e dias fechados não aparecem", () => {
  const hours: StructuredWeeklyHours = {
    ...closed,
    MON: [{ open: "14:00", close: "22:00" }],
    TUE: [{ open: "14:00", close: "22:00" }],
    SAT: [{ open: "08:00", close: "12:00" }],
  };
  assert.equal(summarizeWeeklyHoursBR(hours), "Segunda a terça, 14h às 22h · Sábado, 8h às 12h");
});

test("dois intervalos no mesmo dia aparecem juntos", () => {
  assert.equal(
    summarizeWeeklyHoursBR({ ...closed, WED: [{ open: "08:00", close: "12:00" }, { open: "14:00", close: "18:00" }] }),
    "Quarta, 8h às 12h e 14h às 18h",
  );
});

test("semana inteira fechada devolve string vazia", () => {
  assert.equal(summarizeWeeklyHoursBR(closed), "");
});

test("resumo do horário oficial da loja", () => {
  assert.equal(summarizeWeeklyHoursBR(INITIAL_OPERATING_HOURS), "Segunda a sexta, 8h às 17h · Sábado, 8h às 12h");
});
