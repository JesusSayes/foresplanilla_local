import { randomUUID } from 'node:crypto';

export function prepareLoanData(body, creating = false) {
  const { installment_amounts, ...data } = body;
  for (const field of ['start_date', 'end_date', 'approval_date']) {
    if (data[field]) data[field] = new Date(data[field]);
  }
  if (creating) {
    data.id = randomUUID();
    data.created_date = new Date();
  }
  data.updated_date = new Date();
  return data;
}

// Prisma Decimal se serializa como string; mantener el contrato numérico de la API.
export function serializeLoanData(value) {
  if (Array.isArray(value)) return value.map(serializeLoanData);
  if (!value) return value;
  const result = { ...value };
  for (const field of ['amount', 'monthly_amount']) {
    if (result[field] != null) result[field] = Number(result[field]);
  }
  for (const field of ['start_date', 'end_date', 'approval_date']) {
    if (result[field] instanceof Date) result[field] = result[field].toISOString().slice(0, 10);
  }
  return result;
}
