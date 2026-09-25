// Compatibilidad con los filtros de rango enviados por las pantallas de asistencia.
export function attendanceDateFilter(value) {
  const range = typeof value === 'object' && value !== null;
  if (range && (Array.isArray(value) || !Object.keys(value).length ||
      Object.keys(value).some(key => !['$gte', '$lte'].includes(key)))) {
    throw new Error('Rango de fechas inválido');
  }
  const parse = (input, end = false) => {
    if (typeof input !== 'string' || !/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(input)) {
      throw new Error('Fecha inválida');
    }
    const day = input.slice(0, 10);
    const date = new Date(`${day}T${end ? '23:59:59.999' : '00:00:00.000'}Z`);
    if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== day) {
      throw new Error('Fecha inválida');
    }
    return date;
  };
  const result = {};
  if (!range || Object.hasOwn(value, '$gte')) result.gte = parse(range ? value.$gte : value);
  if (!range || Object.hasOwn(value, '$lte')) result.lte = parse(range ? value.$lte : value, true);
  if (result.gte && result.lte && result.gte > result.lte) throw new Error('Rango de fechas invertido');
  return result;
}
