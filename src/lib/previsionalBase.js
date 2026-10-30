// Base previsional (remuneración afecta a aportes AFP/ONP) y sus componentes.
//
//   remuneracion_afecta = remuneración mensual
//                       + remuneración vacacional
//                       + asignación familiar
//                       + horas extras
//                       − descuentos por faltas, tardanzas, permisos y salidas anticipadas
//
// Se calcula a partir de los conceptos YA ejecutados por el motor (ingresos y
// descuentos), de modo que refleja exactamente los montos calculados. Es la base
// sobre la que el sistema calcula automáticamente el aporte AFP/ONP (según los
// porcentajes configurados) y queda expuesta como variable en las fórmulas
// dinámicas del módulo de Conceptos de Planilla.

import { safePayrollNumber, roundMoney } from "@/lib/payrollUtils";
import { _normStr, sumOvertimeIncomes } from "@/lib/payrollIncomeHelpers";

// Remuneración mensual: ingresos con categoría "Remuneración Base" o cuyo nombre
// corresponde a la remuneración básica. Sin coincidencias, retorna 0 (no inventa).
export const sumBaseRemuneration = (incomes = []) => {
  if (!Array.isArray(incomes)) return 0;
  const matches = incomes.filter(c =>
    _normStr(c.concept_category) === "remuneración base" ||
    /remuneraci[oó]n\s*b[aá]sica/i.test(c.concept_name || "")
  );
  if (matches.length === 0) return 0;
  return roundMoney(matches.reduce((s, c) => s + safePayrollNumber(c.calculated_amount), 0));
};

// Remuneración vacacional: ingresos cuyo nombre o categoría contienen "vacacion".
export const sumVacationIncomes = (incomes = []) => {
  if (!Array.isArray(incomes)) return 0;
  return roundMoney(
    incomes
      .filter(c =>
        _normStr(c.concept_name).includes("vacacion") ||
        _normStr(c.concept_category).includes("vacacion")
      )
      .reduce((s, c) => s + safePayrollNumber(c.calculated_amount), 0)
  );
};

// Asignación familiar: por lógica del sistema o, como respaldo, por nombre.
export const sumFamilyAllowance = (incomes = []) => {
  if (!Array.isArray(incomes)) return 0;
  const match =
    incomes.find(c => c.system_logic_type === "family_allowance") ||
    incomes.find(c => _normStr(c.concept_name).includes("asignación familiar"));
  return match ? roundMoney(safePayrollNumber(match.calculated_amount)) : 0;
};

// Descuentos de asistencia: faltas, tardanzas, permisos y salidas anticipadas.
// Se reconocen por system_logic_type y, como respaldo, por palabras clave del nombre.
// Los montos de descuento se guardan en negativo; se usan en valor absoluto.
const ATTENDANCE_DISCOUNT_LOGIC = ["absence_discount", "tardiness_discount", "early_departure_discount"];
const ATTENDANCE_DISCOUNT_KEYWORDS = ["falta", "inasistencia", "tardanza", "permiso", "salida anticipada", "sin goce"];

export const sumAttendanceDiscounts = (deductions = []) => {
  if (!Array.isArray(deductions)) return 0;
  return roundMoney(
    deductions
      .filter(c => {
        if (ATTENDANCE_DISCOUNT_LOGIC.includes(c.system_logic_type)) return true;
        const name = _normStr(c.concept_name);
        return ATTENDANCE_DISCOUNT_KEYWORDS.some(k => name.includes(k));
      })
      .reduce((s, c) => s + Math.abs(safePayrollNumber(c.calculated_amount)), 0)
  );
};

// Calcula la base previsional y sus componentes a partir de los conceptos ejecutados.
// externalAttendanceDiscounts: descuentos de asistencia calculados FUERA del motor de
// conceptos (tardanzas, inasistencias y salidas anticipadas que el llamador aplica por
// separado al neto para evitar duplicados). Se restan de la base una sola vez, aquí,
// para que las fórmulas dinámicas y el aporte AFP/ONP usen la base ya ajustada.
export const computePrevisionalVariables = (incomes = [], deductions = [], externalAttendanceDiscounts = 0) => {
  const remuneracion_mensual = sumBaseRemuneration(incomes);
  const remuneracion_vacacional = sumVacationIncomes(incomes);
  const asignacion_familiar = sumFamilyAllowance(incomes);
  const horas_extras = roundMoney(sumOvertimeIncomes(incomes));
  const descuentos_asistencia = roundMoney(
    sumAttendanceDiscounts(deductions) + Math.max(0, safePayrollNumber(externalAttendanceDiscounts))
  );
  const remuneracion_afecta = roundMoney(
    remuneracion_mensual +
    remuneracion_vacacional +
    asignacion_familiar +
    horas_extras -
    descuentos_asistencia
  );
  return {
    remuneracion_mensual,
    remuneracion_vacacional,
    asignacion_familiar,
    horas_extras,
    descuentos_asistencia,
    remuneracion_afecta,
  };
};