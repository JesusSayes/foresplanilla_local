// Reglas centralizadas de unicidad de códigos de empleado y de documentos.
// El código de empleado siempre se compara normalizado (sin espacios, mayúsculas)
// para que "fp0007" y "FP0007 " no convivan como si fueran distintos.

export const EMPLOYEE_CODE_PREFIX = "FP";
export const EMPLOYEE_CODE_DIGITS = 4;

const CODE_NUMBER_PATTERN = /^FP0*(\d+)$/;

export const normalizeEmployeeCode = (code) =>
  String(code ?? "").trim().toUpperCase();

export const formatEmployeeCode = (number) =>
  `${EMPLOYEE_CODE_PREFIX}${String(number).padStart(EMPLOYEE_CODE_DIGITS, "0")}`;

const codeNumber = (code) => {
  const match = normalizeEmployeeCode(code).match(CODE_NUMBER_PATTERN);
  return match ? parseInt(match[1], 10) : 0;
};

const usedCodes = (employees, excludeId) =>
  new Set(
    (employees || [])
      .filter((emp) => emp && emp.id !== excludeId)
      .map((emp) => normalizeEmployeeCode(emp.employee_code))
      .filter(Boolean)
  );

/**
 * Siguiente código libre con formato FP0000. Considera TODOS los códigos ya
 * registrados (no solo los que siguen el patrón) y avanza hasta encontrar uno
 * que nadie tenga, de modo que nunca repite un código existente.
 */
export const generateNextEmployeeCode = (employees, { excludeId } = {}) => {
  const used = usedCodes(employees, excludeId);
  const highest = (employees || [])
    .filter((emp) => emp && emp.id !== excludeId)
    .reduce((max, emp) => Math.max(max, codeNumber(emp.employee_code)), 0);

  let next = highest + 1;
  let code = formatEmployeeCode(next);
  while (used.has(code)) {
    next += 1;
    code = formatEmployeeCode(next);
  }
  return code;
};

/** Grupos de empleados que comparten el mismo código. */
export const findEmployeeCodeDuplicates = (employees) => {
  const groups = new Map();
  (employees || []).forEach((emp) => {
    const code = normalizeEmployeeCode(emp?.employee_code);
    if (!code) return;
    if (!groups.has(code)) groups.set(code, []);
    groups.get(code).push(emp);
  });
  return [...groups.entries()]
    .filter(([, list]) => list.length > 1)
    .map(([code, list]) => ({ code, employees: list }))
    .sort((a, b) => a.code.localeCompare(b.code));
};

/** Empleados sin código registrado. */
export const findEmployeesWithoutCode = (employees) =>
  (employees || []).filter((emp) => !normalizeEmployeeCode(emp?.employee_code));

/**
 * Registro que conserva el código original del grupo: primero el empleado
 * activo, y entre iguales el más antiguo. Evita mover el código que se usa hoy
 * en planillas y asistencia.
 */
const canonicalFirst = (group) =>
  [...group].sort((a, b) => {
    const activeA = a.status === "Activo" ? 0 : 1;
    const activeB = b.status === "Activo" ? 0 : 1;
    if (activeA !== activeB) return activeA - activeB;
    const dateA = a.created_date || "";
    const dateB = b.created_date || "";
    if (dateA && dateB && dateA !== dateB) return dateA.localeCompare(dateB);
    return String(a.id).localeCompare(String(b.id));
  });

/**
 * Plan de corrección: conserva el código del registro activo más antiguo de
 * cada grupo y asigna un código libre a los demás, sin eliminar ni fusionar
 * empleados. Los empleados sin código también reciben uno.
 */
export const buildCodeCorrectionPlan = (employees) => {
  const list = [...(employees || [])];
  const duplicates = findEmployeeCodeDuplicates(list);
  const missing = findEmployeesWithoutCode(list);

  const used = new Set(
    list.map((emp) => normalizeEmployeeCode(emp.employee_code)).filter(Boolean)
  );

  const assignFreeCode = () => {
    let highest = 0;
    used.forEach((code) => {
      highest = Math.max(highest, codeNumber(code));
    });
    let next = highest + 1;
    let code = formatEmployeeCode(next);
    while (used.has(code)) {
      next += 1;
      code = formatEmployeeCode(next);
    }
    used.add(code);
    return code;
  };

  const corrections = [];

  duplicates.forEach(({ employees: group }) => {
    const [, ...repeated] = canonicalFirst(group);
    repeated.forEach((emp) => {
      corrections.push({
        employee: emp,
        oldCode: emp.employee_code || "",
        newCode: assignFreeCode(),
        reason: "duplicado",
      });
    });
  });

  missing.forEach((emp) => {
    corrections.push({
      employee: emp,
      oldCode: "",
      newCode: assignFreeCode(),
      reason: "sin código",
    });
  });

  return { duplicates, missing, corrections };
};

// ── Documentos de identidad ──────────────────────────────────────────────

export const normalizeDocumentNumber = (documentType, documentNumber) => {
  const type = String(documentType || "").trim().toUpperCase();
  const raw = String(documentNumber || "").trim();
  const number = type === "DNI" ? raw.replace(/\D/g, "") : raw.toUpperCase();
  return number ? `${type}::${number}` : "";
};

/** Documentos (tipo + número) registrados en más de un empleado. */
export const findDocumentDuplicates = (employees) => {
  const groups = new Map();
  (employees || []).forEach((emp) => {
    const key = normalizeDocumentNumber(emp?.document_type, emp?.document_number);
    if (!key) return;
    if (!groups.has(key)) {
      groups.set(key, {
        document_type: emp.document_type || "",
        document_number: emp.document_number || "",
        employees: [],
      });
    }
    groups.get(key).employees.push(emp);
  });
  return [...groups.values()].filter((group) => group.employees.length > 1);
};