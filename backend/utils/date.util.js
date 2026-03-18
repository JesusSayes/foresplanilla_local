export const parseDate = (value) => {
  if (!value) return null;

  const d = new Date(value);
  return isNaN(d.getTime()) ? null : d;
};

export const pick = (obj, fields) =>
  Object.fromEntries(
    Object.entries(obj).filter(([k]) => fields.includes(k))
  );
