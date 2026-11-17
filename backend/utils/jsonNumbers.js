import { Prisma } from '@prisma/client';

// JSON.stringify llama a Decimal.toJSON antes del replacer. Consultar el
// valor original permite convertir solo Decimal, sin alterar DNI ni códigos.
export function jsonNumbers(key, value) {
  const original = this[key];
  return Prisma.Decimal.isDecimal(original) ? original.toNumber() : value;
}
