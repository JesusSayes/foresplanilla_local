export const toDateString = value => {
  if (!value) return null;
  if (typeof value === "string") return value.slice(0, 10);
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString().slice(0, 10);
};

export const isEmploymentDateValid = (employee, date) => {
  const dateStr = toDateString(date);
  if (!dateStr) return false;

  const hireDate = toDateString(employee?.hire_date);
  const terminationDate = toDateString(employee?.termination_date);

  return (!hireDate || dateStr >= hireDate) &&
    (!terminationDate || dateStr <= terminationDate);
};

export const employmentEndDate = (employee, fallbackDate) => {
  const fallback = toDateString(fallbackDate);
  const terminationDate = toDateString(employee?.termination_date);
  if (!fallback) return terminationDate;
  if (!terminationDate) return fallback;
  return terminationDate < fallback ? terminationDate : fallback;
};
