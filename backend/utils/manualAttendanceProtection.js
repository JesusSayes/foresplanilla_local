export const AUTO_CALCULATED_ATTENDANCE_FIELDS = new Set([
  "clock_in",
  "clock_out",
  "worked_hours",
  "regular_hours",
  "overtime_hours_25",
  "overtime_hours_35",
  "is_late",
  "late_minutes",
  "is_absent",
  "status",
  "notes",
]);

export const MANUAL_PROTECTION_METADATA_FIELDS = new Set([
  "manually_protected_fields",
  "last_approved_edit_id",
  "manually_modified_by_id",
  "manually_modified_by",
  "manually_modified_at",
]);

const AUTHORITATIVE_MANUAL_STATUSES = new Set(["Justificado", "Vacaciones"]);

const comparableValue = value => {
  if (value === null || value === undefined) return value;
  if (typeof value === "number") return value;
  if (typeof value === "object" && typeof value.toString === "function") {
    const numericValue = Number(value.toString());
    return Number.isNaN(numericValue) ? value.toString() : numericValue;
  }
  return value;
};

export const getProtectedFields = record => {
  const protectedFields = new Set(
    Array.isArray(record?.manually_protected_fields)
      ? record.manually_protected_fields
      : []
  );

  if (AUTHORITATIVE_MANUAL_STATUSES.has(record?.status)) {
    for (const field of AUTO_CALCULATED_ATTENDANCE_FIELDS) {
      protectedFields.add(field);
    }
  }

  return protectedFields;
};

export const changedAutoCalculatedFields = (existing, requestedData) =>
  Object.keys(requestedData).filter(field =>
    AUTO_CALCULATED_ATTENDANCE_FIELDS.has(field) &&
    comparableValue(existing?.[field]) !== comparableValue(requestedData[field])
  );

export const mergeProtectedFields = (record, fields) => [
  ...new Set([
    ...getProtectedFields(record),
    ...fields,
  ]),
];

export const protectValue = (protectedFields, field, currentValue, calculatedValue) =>
  protectedFields.has(field) ? currentValue : calculatedValue;

export const manualModifierData = employee => {
  const name = `${employee?.first_name || ""} ${employee?.last_name || ""}`.trim();
  return {
    manually_modified_by_id: employee?.id || null,
    manually_modified_by: name || null,
    manually_modified_at: new Date(),
  };
};
