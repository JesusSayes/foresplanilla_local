// Lectura de los derechohabientes ya registrados de los titulares involucrados.
// Se pagina hasta el final: no se depende de un límite fijo que pueda omitir
// coincidencias (un titular con muchas filas ya no se escapa del control de duplicados).

import { base44 } from "@/api/base44Client";

const EMPLOYEES_PER_QUERY = 20;
const PAGE_SIZE = 500;

export async function fetchExistingDerechohabientes(employeeIds) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  const records = [];

  for (let start = 0; start < ids.length; start += EMPLOYEES_PER_QUERY) {
    const chunk = ids.slice(start, start + EMPLOYEES_PER_QUERY);
    let cursor = null;
    do {
      const page = await base44.entities.Derechohabiente.filter(
        { employee_id: { $in: chunk } },
        { limit: PAGE_SIZE, ...(cursor ? { cursor } : {}) }
      );
      records.push(...(page?.items || []));
      cursor = page?.has_more ? page.next_cursor : null;
    } while (cursor);
  }

  return records;
}