// Pruebas del cálculo centralizado de AFP/ONP (PayrollCalculator.calculatePensionContribution)
// y del tratamiento de conceptos pensionarios heredados / sobrescrituras manuales.
//
// Ejecutar desde la consola del navegador:
//   import('@/lib/pensionCalcTests').then(m => console.log(m.runPensionContributionTests()))
// Devuelve { passed, failed, results }.

import { PayrollCalculator } from "@/components/payroll/PayrollCalculator";
import {
  isLegacyAutoPensionConcept,
  isManualPensionOverride,
  hasManualPensionOverride,
} from "@/lib/pensionConcepts";

const round2 = (v) => Math.round(v * 100) / 100;

const makeEmployee = (overrides = {}) => ({
  employee_code: "E001",
  first_name: "Test",
  last_name: "Empleado",
  base_salary: 3000,
  pension_system: "AFP",
  afp_commission_type: "Flujo",
  ...overrides,
});

const makeAFP = (overrides = {}) => ({
  name: "AFP Prueba",
  commission_percentage: 1.5,
  obligatory_contribution_percentage: 10,
  insurance_percentage: 1.74,
  ...overrides,
});

const tests = [];

const test = (name, fn) => {
  tests.push({ name, fn });
};

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

// 1. ONP: totalIncome = 2000 → descuento 260.00
test("ONP 13% sobre totalIncome=2000 => 260.00", () => {
  const emp = makeEmployee({ pension_system: "ONP" });
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(2000, { afp: null });
  assert(res.items.length === 1, `Se esperaba 1 ítem ONP, vino ${res.items.length}`);
  assert(res.items[0].name === "ONP", `Nombre esperado "ONP", vino "${res.items[0].name}"`);
  assert(res.items[0].code === "0607", `Código esperado "0607", vino "${res.items[0].code}"`);
  assert(res.code === "0607", `Código general ONP esperado "0607", vino "${res.code}"`);
  assert(res.items[0].amount === 260, `Monto esperado 260.00, vino ${res.items[0].amount}`);
  assert(res.totalAmount === 260, `Total esperado 260.00, vino ${res.totalAmount}`);
});

// 2. AFP con comisión: aporte + seguro + comisión
test("AFP con comisión: aporte + seguro + comisión", () => {
  const emp = makeEmployee();
  const afp = makeAFP();
  const totalIncome = 3000;
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(totalIncome, { afp });
  assert(res.items.length === 3, `Se esperaban 3 ítems AFP, vino ${res.items.length}`);
  const aporte = round2(totalIncome * 0.10);
  const seguro = round2(totalIncome * 0.0174);
  const comision = round2(totalIncome * 0.015);
  assert(res.items[0].amount === aporte, `Aporte esperado ${aporte}, vino ${res.items[0].amount}`);
  assert(res.items[1].amount === seguro, `Seguro esperado ${seguro}, vino ${res.items[1].amount}`);
  assert(res.items[2].amount === comision, `Comisión esperada ${comision}, vino ${res.items[2].amount}`);
  assert(res.totalAmount === round2(aporte + seguro + comision), `Total esperado ${round2(aporte + seguro + comision)}, vino ${res.totalAmount}`);
  // Códigos PLAME individuales (Tabla 22 SUNAT): aporte=0608, seguro=0606, comisión=0601
  assert(res.items[0].code === "0608", `Aporte obligatorio debe usar "0608", vino "${res.items[0].code}"`);
  assert(res.items[1].code === "0606", `Prima de seguro debe usar "0606", vino "${res.items[1].code}"`);
  assert(res.items[2].code === "0601", `Comisión debe usar "0601", vino "${res.items[2].code}"`);
  assert(!res.items.every(i => i.code === "0601"), "Los componentes AFP no deben compartir el mismo código");
  // Código general AFP: no fija "0601"; refleja el único ítem o queda vacío si hay varios
  assert(res.code === "", `Código general AFP con varios ítems debe ser "", vino "${res.code}"`);
});

// 3. AFP con commission_percentage = 0: aporte + seguro, sin comisión
test("AFP con commission_percentage=0: aporte + seguro, sin comisión", () => {
  const emp = makeEmployee();
  const afp = makeAFP({ commission_percentage: 0 });
  const totalIncome = 3000;
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(totalIncome, { afp });
  assert(res.items.length === 2, `Se esperaban 2 ítems (aporte+seguro), vino ${res.items.length}`);
  assert(!res.items.some(i => /comisión/i.test(i.name)), "No debe generarse el ítem Comisión");
  const aporte = round2(totalIncome * 0.10);
  const seguro = round2(totalIncome * 0.0174);
  assert(res.totalAmount === round2(aporte + seguro), `Total esperado ${round2(aporte + seguro)}, vino ${res.totalAmount}`);
});

// AFP Mixta: la comisión configurada no se descuenta del flujo mensual.
test("AFP Mixta: aporte + seguro, sin comisión sobre el flujo", () => {
  const emp = makeEmployee({ afp_commission_type: "Mixta" });
  const afp = makeAFP({ commission_percentage: 1.5 });
  const totalIncome = 3000;
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(totalIncome, { afp });
  assert(res.items.length === 2, `Se esperaban 2 ítems (aporte+seguro), vino ${res.items.length}`);
  assert(!res.items.some(i => /comisión/i.test(i.name)), "AFP Mixta no debe generar comisión mensual");
  assert(res.totalAmount === round2(totalIncome * 0.10) + round2(totalIncome * 0.0174), "Total Mixta debe incluir solo aporte y seguro");
});

// 4. AFP sin AFP asignada: no genera descuento y registra error
test("AFP sin AFP asignada: no genera descuento y registra error", () => {
  const emp = makeEmployee();
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(3000, { afp: null });
  assert(res.items.length === 0, "No debe generar ítems sin AFP asignada");
  assert(res.totalAmount === 0, "Total debe ser 0");
  assert(calc.errors.length > 0, "Debe registrar un error de cálculo");
});

// 5. Planilla Quincenal: no genera AFP/ONP (calculatePayroll)
test("Planilla Quincenal: no genera AFP/ONP", async () => {
  const emp = makeEmployee();
  const afp = makeAFP();
  const calc = new PayrollCalculator(emp, 1, 2026, "Quincenal");
  const result = await calc.calculatePayroll([], { worked_days: 15, regular_hours: 0, overtime_hours: 0 }, 1130, { afp });
  const pensionDeds = result.deductions.filter(d => d.concept_category === "AFP/ONP");
  assert(pensionDeds.length === 0, `Quincenal no debe generar descuentos AFP/ONP, vino ${pensionDeds.length}`);
});

// 6. Conceptos AFP heredados: no duplican descuentos (calculatePayroll)
test("Conceptos AFP heredados: no duplican descuentos", async () => {
  const emp = makeEmployee();
  const afp = makeAFP();
  const legacyConcepts = [
    { employee_id: "x", concept_type: "Descuento", concept_name: "AFP - Comisión", is_dynamic: true, calculation_formula: "base_salary * 0.015", is_recurring: true, concept_category: undefined },
    { employee_id: "x", concept_type: "Descuento", concept_name: "AFP - Aporte Obligatorio", is_dynamic: true, calculation_formula: "base_salary * 0.10", is_recurring: true, concept_category: undefined },
    { employee_id: "x", concept_type: "Descuento", concept_name: "AFP - Seguro", is_dynamic: true, calculation_formula: "base_salary * 0.0174", is_recurring: true, concept_category: undefined },
  ];
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  // Incluir un ingreso para que totalIncome > 0
  const concepts = [
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Remuneración Base", concept_name: "Remuneración", is_dynamic: false, amount: 3000, is_recurring: true },
    ...legacyConcepts,
  ];
  const result = await calc.calculatePayroll(concepts, { worked_days: 30, regular_hours: 0, overtime_hours: 0 }, 1130, { afp });
  const pensionDeds = result.deductions.filter(d => d.concept_category === "AFP/ONP");
  // Deben existir exactamente 3 ítems (los centralizados), no 6 (duplicados).
  assert(pensionDeds.length === 3, `Se esperaban 3 ítems AFP centralizados (sin duplicar), vino ${pensionDeds.length}`);
});

// 7. Sobrescritura manual explícita: reemplaza el cálculo automático
test("Sobrescritura manual explícita: reemplaza el cálculo automático", async () => {
  const emp = makeEmployee();
  const afp = makeAFP();
  const manualConcept = {
    employee_id: "x", concept_type: "Descuento", concept_category: "AFP/ONP",
    concept_name: "AFP Personalizado", is_dynamic: false, amount: 500, is_recurring: true,
  };
  const income = { employee_id: "x", concept_type: "Ingreso", concept_category: "Remuneración Base", concept_name: "Remuneración", is_dynamic: false, amount: 3000, is_recurring: true };
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const result = await calc.calculatePayroll([income, manualConcept], { worked_days: 30, regular_hours: 0, overtime_hours: 0 }, 1130, { afp });
  const pensionDeds = result.deductions.filter(d => d.concept_category === "AFP/ONP");
  assert(pensionDeds.length === 1, `Se esperaba 1 ítem (manual), vino ${pensionDeds.length}`);
  assert(pensionDeds[0].calculated_amount === 500, `Monto manual esperado 500, vino ${pensionDeds[0].calculated_amount}`);
});

test("Concepto pension_contribution explícito ejecuta el cálculo centralizado", async () => {
  const emp = makeEmployee();
  const afp = makeAFP();
  const income = { concept_type: "Ingreso", concept_category: "Remuneración Base", concept_name: "Remuneración", amount: 3000, is_recurring: true };
  const pensionConcept = {
    concept_type: "Descuento",
    concept_category: "AFP/ONP",
    concept_name: "Aporte AFP/ONP",
    system_logic_type: "pension_contribution",
    is_recurring: true,
  };
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const result = await calc.calculatePayroll([income, pensionConcept], { worked_days: 30 }, 1130, { afp });
  const pensionDeds = result.deductions.filter(d => d.concept_category === "AFP/ONP");
  assert(pensionDeds.length === 3, `Se esperaban 3 componentes AFP, vino ${pensionDeds.length}`);
});

// 8. Cambio de AFP / porcentajes: se refleja sin regenerar conceptos
test("Cambio de porcentajes AFP: se refleja sin regenerar conceptos", () => {
  const emp = makeEmployee();
  const afpA = makeAFP({ commission_percentage: 1.5, insurance_percentage: 1.74 });
  const afpB = makeAFP({ commission_percentage: 0.8, insurance_percentage: 1.5, name: "AFP B" });
  const totalIncome = 3000;
  const calcA = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const resA = calcA.calculatePensionContribution(totalIncome, { afp: afpA });
  const calcB = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const resB = calcB.calculatePensionContribution(totalIncome, { afp: afpB });
  assert(resA.totalAmount !== resB.totalAmount, "Totales deben diferir al cambiar porcentajes");
  assert(resB.items.some(i => i.name.includes("AFP B")), "Debe usar la nueva AFP");
});

// 9. Base pensionaria = remuneración básica ejecutada + asignación familiar (NO totalIncome)
test("Base pensionaria usa remuneración básica + asignación familiar, no total ingresos", async () => {
  const emp = makeEmployee({ base_salary: 5000 });
  const afp = makeAFP();
  const concepts = [
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Remuneración Base", concept_name: "Remuneración Básica", is_dynamic: false, amount: 2000, is_recurring: true },
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Asignaciones", concept_name: "Asignación Familiar", is_dynamic: false, amount: 113, is_recurring: true },
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Asignaciones", concept_name: "Movilidad", is_dynamic: false, amount: 300, is_recurring: true },
  ];
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const result = await calc.calculatePayroll(concepts, { worked_days: 30, regular_hours: 0, overtime_hours: 0 }, 1130, { afp });
  const pensionDeds = result.deductions.filter(d => d.concept_category === "AFP/ONP");
  // Base esperada = 2000 (rem. básica) + 113 (asig. familiar) = 2113. NO incluye 300 de movilidad.
  const baseEsperada = 2113;
  const aporteEsperado = round2(baseEsperada * 0.10);
  const aporte = pensionDeds.find(d => /aporte obligatorio/i.test(d.concept_name));
  assert(aporte, "Debe existir el ítem Aporte Obligatorio");
  assert(aporte.calculated_amount === aporteEsperado, `Aporte sobre base ${baseEsperada} = ${aporteEsperado}, vino ${aporte.calculated_amount}`);
  assert(aporte.calculated_amount !== round2(2413 * 0.10), "El aporte NO debe incluir la movilidad en la base");
});

// 9b. Sin asignación familiar: base = solo remuneración básica ejecutada
test("Sin asignación familiar: base = solo remuneración básica ejecutada", async () => {
  const emp = makeEmployee({ base_salary: 5000 });
  const afp = makeAFP();
  const concepts = [
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Remuneración Base", concept_name: "Remuneración Básica", is_dynamic: false, amount: 2000, is_recurring: true },
    { employee_id: "x", concept_type: "Ingreso", concept_category: "Asignaciones", concept_name: "Movilidad", is_dynamic: false, amount: 300, is_recurring: true },
  ];
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const result = await calc.calculatePayroll(concepts, { worked_days: 30, regular_hours: 0, overtime_hours: 0 }, 1130, { afp });
  const aporte = result.deductions.find(d => /aporte obligatorio/i.test(d.concept_name));
  const aporteEsperado = round2(2000 * 0.10);
  assert(aporte.calculated_amount === aporteEsperado, `Base solo rem. básica 2000 => aporte ${aporteEsperado}, vino ${aporte.calculated_amount}`);
});

// 10. Redondeo individual de cada componente y del total AFP
test("Redondeo individual de componentes y total AFP", () => {
  const emp = makeEmployee();
  const afp = makeAFP({ commission_percentage: 1.69, insurance_percentage: 1.74 });
  const totalIncome = 2575.55;
  const calc = new PayrollCalculator(emp, 1, 2026, "Mensual");
  const res = calc.calculatePensionContribution(totalIncome, { afp });
  const aporte = round2(totalIncome * 0.10);
  const seguro = round2(totalIncome * 0.0174);
  const comision = round2(totalIncome * 0.0169);
  assert(res.items[0].amount === aporte, "Aporte redondeado individualmente");
  assert(res.items[1].amount === seguro, "Seguro redondeado individualmente");
  assert(res.items[2].amount === comision, "Comisión redondeada individualmente");
  assert(res.totalAmount === round2(aporte + seguro + comision), "Total = suma de redondeos individuales");
});

// 11. Helpers de identificación
test("Helpers: legacy vs manual override", () => {
  const legacy = { concept_type: "Descuento", concept_name: "AFP - Comisión", is_dynamic: true, calculation_formula: "base_salary * 0.015" };
  const onp = { concept_type: "Descuento", concept_name: "ONP", is_dynamic: true, calculation_formula: "base_salary * 0.13" };
  const manual = { concept_type: "Descuento", concept_category: "AFP/ONP", concept_name: "AFP Manual", is_dynamic: false, amount: 500 };
  assert(isLegacyAutoPensionConcept(legacy), "AFP - Comisión sin categoría debe ser legacy");
  assert(isLegacyAutoPensionConcept(onp), "ONP sin categoría debe ser legacy");
  assert(!isLegacyAutoPensionConcept(manual), "Concepto con categoría AFP/ONP no es legacy");
  assert(isManualPensionOverride(manual), "Concepto con categoría AFP/ONP es manual override");
  assert(!isManualPensionOverride(legacy), "Legacy no es manual override");
  assert(hasManualPensionOverride([legacy, manual]), "Debe detectar override manual en la lista");
  assert(!hasManualPensionOverride([legacy, onp]), "Solo legacy => sin override manual");
});

export const runPensionContributionTests = async () => {
  const results = [];
  let passed = 0;
  let failed = 0;
  for (const { name, fn } of tests) {
    try {
      await fn();
      results.push({ name, status: "pass" });
      passed++;
    } catch (err) {
      results.push({ name, status: "fail", error: err.message });
      failed++;
    }
  }
  return { passed, failed, results };
};
