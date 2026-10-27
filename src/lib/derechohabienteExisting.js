// La API local devuelve todos los registros del filtro, sin paginación.
import { entitiesAPI } from "@/api/entitiesClient";

const EMPLOYEES_PER_QUERY = 20;

export async function fetchExistingDerechohabientes(employeeIds) {
  const ids = [...new Set((employeeIds || []).filter(Boolean))];
  const records = [];

  for (let start = 0; start < ids.length; start += EMPLOYEES_PER_QUERY) {
    const chunk = ids.slice(start, start + EMPLOYEES_PER_QUERY);
    const page = await entitiesAPI.Derechohabiente.filter({ employee_id: { in: chunk } });
    records.push(...page);
  }

  return records;
}
