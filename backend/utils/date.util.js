export const parseDate = (value) => {
  if (!value) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    const [y, m, d] = value.split("-").map(Number);

    return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  }

  const parsed = new Date(value);

  return isNaN(parsed.getTime()) ? null : parsed;
};

export const pick = (obj, fields) =>
  Object.fromEntries(
    Object.entries(obj).filter(([k]) => fields.includes(k))
  );
