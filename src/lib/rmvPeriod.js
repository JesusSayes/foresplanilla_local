// RMV vigente para un período de planilla (mes/año calculado), no necesariamente
// la vigente hoy. Se toma la RMV de mayor fecha de vigencia que no sea posterior
// al último día del mes liquidado; si todas las fechas son posteriores al período
// (no hay RMV registrada anterior), se usa la más antigua registrada.

import { normalizeRmvDate } from "@/lib/rmvDate";

const lastDayOfMonth = (month, year) =>
  new Date(Number(year), Number(month), 0).getDate();

const toPeriodDate = (month, year) =>
  `${year}-${String(month).padStart(2, "0")}-${String(lastDayOfMonth(month, year)).padStart(2, "0")}`;

/**
 * Selecciona la RMV aplicable al período indicado.
 * @returns {Object|null} registro de RMV (con amount/effective_date) o null si no hay datos.
 */
export function selectRmvForPeriod(rmvs = [], month, year) {
  const list = (Array.isArray(rmvs) ? rmvs : [])
    .map((rmv) => ({ ...rmv, _date: normalizeRmvDate(rmv.effective_date) }))
    .filter((rmv) => rmv._date)
    .sort((a, b) => (a._date < b._date ? -1 : a._date > b._date ? 1 : 0));

  if (list.length === 0) return null;

  const periodEnd = toPeriodDate(month, year);
  const vigentes = list.filter((rmv) => rmv._date <= periodEnd);
  const selected = vigentes.length > 0 ? vigentes[vigentes.length - 1] : list[0];

  const { _date, ...rmv } = selected;
  return rmv;
}