// Fechas de vigencia de RMV tratadas como fecha calendario 'YYYY-MM-DD'.
// Nunca se convierten a/desde UTC, para que el día no se desplace por zona horaria.

export function normalizeRmvDate(value) {
  if (!value) return "";

  if (typeof value === "string") {
    const match = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) return `${match[1]}-${match[2]}-${match[3]}`;
    return "";
  }

  if (value instanceof Date && !Number.isNaN(value.getTime())) {
    const year = value.getFullYear();
    const month = String(value.getMonth() + 1).padStart(2, "0");
    const day = String(value.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  return "";
}

export function formatRmvDate(value) {
  const isoDate = normalizeRmvDate(value);
  if (!isoDate) return "Sin fecha";
  const [year, month, day] = isoDate.split("-");
  return `${day}/${month}/${year}`;
}