// Pruebas de las reglas de unicidad de códigos y documentos de empleado.
import {
  generateNextEmployeeCode,
  buildCodeCorrectionPlan,
  findEmployeeCodeDuplicates,
  findDocumentDuplicates,
  normalizeDocumentNumber,
} from "@/lib/employeeCode";

const results = [];

const check = (name, fn) => {
  try {
    fn();
    results.push({ name, passed: true });
  } catch (error) {
    results.push({ name, passed: false, error: error.message });
  }
};

const assertEqual = (actual, expected, label) => {
  if (actual !== expected) {
    throw new Error(`${label}: esperado ${expected}, obtenido ${actual}`);
  }
};

const employees = (list) =>
  list.map((item, index) => ({
    id: item.id || `emp-${String(index + 1).padStart(3, "0")}`,
    created_date: item.created_date || `2025-01-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`,
    document_type: "DNI",
    document_number: item.document_number || `7000000${index + 1}`,
    first_name: item.first_name || "Trabajador",
    last_name: item.last_name || `Prueba${index + 1}`,
    status: item.status || "Activo",
    employee_code: item.employee_code,
  }));

export const runEmployeeCodeTests = () => {
  results.length = 0;

  check("El siguiente código se genera después del mayor registrado", () => {
    const list = employees([{ employee_code: "FP0001" }, { employee_code: "FP0014" }]);
    assertEqual(generateNextEmployeeCode(list), "FP0015", "código siguiente");
  });

  check("Un código ya existente con ceros no se vuelve a generar", () => {
    const list = employees([{ employee_code: "FP0007" }, { employee_code: "FP7" }]);
    const next = generateNextEmployeeCode(list);
    assertEqual(next, "FP0008", "código siguiente");
  });

  check("Se salta el siguiente número si ya está ocupado", () => {
    const list = employees([{ employee_code: "FP0003" }, { employee_code: "FP0004" }]);
    assertEqual(generateNextEmployeeCode(list), "FP0005", "código siguiente");
  });

  check("Ignora espacios y mayúsculas al comparar códigos", () => {
    const list = employees([{ employee_code: " fp0002 " }]);
    assertEqual(generateNextEmployeeCode(list), "FP0003", "código siguiente");
  });

  check("Detecta los códigos repetidos", () => {
    const list = employees([
      { employee_code: "FP0010" },
      { employee_code: "FP0010" },
      { employee_code: "FP0011" },
    ]);
    const duplicates = findEmployeeCodeDuplicates(list);
    assertEqual(duplicates.length, 1, "grupos duplicados");
    assertEqual(duplicates[0].employees.length, 2, "registros del grupo");
  });

  check("La corrección conserva el registro más antiguo y libera el repetido", () => {
    const list = employees([
      { employee_code: "FP0010", first_name: "Segundo", created_date: "2025-03-01T00:00:00.000Z" },
      { employee_code: "FP0010", first_name: "Primero", created_date: "2024-05-01T00:00:00.000Z" },
    ]);
    const plan = buildCodeCorrectionPlan(list);
    assertEqual(plan.corrections.length, 1, "correcciones");
    assertEqual(plan.corrections[0].employee.first_name, "Segundo", "registro corregido");
    assertEqual(plan.corrections[0].newCode, "FP0011", "código nuevo");
  });

  check("El código se conserva en el empleado activo del grupo", () => {
    const list = employees([
      { employee_code: "FP0010", first_name: "Cesado", status: "Cesado", created_date: "2023-01-01T00:00:00.000Z" },
      { employee_code: "FP0010", first_name: "Activo", status: "Activo", created_date: "2025-06-01T00:00:00.000Z" },
    ]);
    const plan = buildCodeCorrectionPlan(list);
    assertEqual(plan.corrections.length, 1, "correcciones");
    assertEqual(plan.corrections[0].employee.first_name, "Cesado", "registro corregido");
    assertEqual(plan.corrections[0].newCode, "FP0011", "código nuevo");
  });

  check("Los códigos corregidos no chocan con los que ya existen", () => {
    const list = employees([
      { employee_code: "FP0010" },
      { employee_code: "FP0010" },
      { employee_code: "FP0011" },
    ]);
    const plan = buildCodeCorrectionPlan(list);
    assertEqual(plan.corrections[0].newCode, "FP0012", "código nuevo");
  });

  check("Los empleados sin código reciben uno libre", () => {
    const list = employees([{ employee_code: "FP0001" }, { employee_code: "" }]);
    const plan = buildCodeCorrectionPlan(list);
    assertEqual(plan.missing.length, 1, "sin código");
    assertEqual(plan.corrections[0].newCode, "FP0002", "código asignado");
  });

  check("Una base sin duplicados no genera correcciones", () => {
    const list = employees([{ employee_code: "FP0001" }, { employee_code: "FP0002" }]);
    assertEqual(buildCodeCorrectionPlan(list).corrections.length, 0, "correcciones");
  });

  check("El documento se compara por tipo y número normalizados", () => {
    assertEqual(normalizeDocumentNumber("dni", "12 345 678"), "DNI::12345678", "DNI normalizado");
    assertEqual(normalizeDocumentNumber("CE", " 00ab12cd "), "CE::00AB12CD", "CE normalizado");
  });

  check("Detecta documentos registrados en dos empleados", () => {
    const list = employees([
      { employee_code: "FP0001", document_number: "12345678" },
      { employee_code: "FP0002", document_number: "12345678" },
      { employee_code: "FP0003", document_number: "87654321" },
    ]);
    const duplicates = findDocumentDuplicates(list);
    assertEqual(duplicates.length, 1, "grupos de documentos duplicados");
  });

  const passed = results.filter((r) => r.passed).length;
  return { results, passed, failed: results.length - passed };
};

export default runEmployeeCodeTests;