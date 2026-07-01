/**
 * Utilidad para el cálculo automático de la Asignación Familiar.
 *
 * Reglas legales (D.S. 011-92-TR, art. 6 — Ley de Compensación por Tiempo
 * de Servicios y asignación familiar):
 * - Tienen derecho los trabajadores con hijos menores de 18 años a su cargo.
 * - Si el hijo cursa estudios superiores/universitarios, el beneficio se
 *   extiende hasta que termine dichos estudios, con un tope máximo de 6 años
 *   posteriores a la mayoría de edad (hasta los 24 años).
 * - El monto es FIJO: 10% de la RMV vigente, sin importar el número de hijos.
 *   Basta con tener al menos un hijo elegible para percibir el beneficio completo.
 *
 * @param {Array} derechohabientes - Lista de derechohabientes del empleado
 * @param {number} rmvAmount - Remuneración Mínima Vital vigente (default 1025)
 * @param {Date} referenceDate - Fecha de referencia para el cálculo de edad
 * @returns {Object} { qualifies, eligibleCount, amount, allowancePerChild, children }
 */
export function getFamilyAllowanceEligibility(
  derechohabientes,
  rmvAmount = 1130,
  referenceDate = new Date()
) {
  const allowancePerChild = (rmvAmount || 1130) * 0.10;
  const children = [];

  for (const dh of derechohabientes || []) {
    // Solo se evalúan hijos
    if (dh.relationship !== "Hijo/a" && dh.relationship !== "Hijo Menor de Edad") continue;
    if (!dh.birth_date) continue;

    const birthDate = new Date(dh.birth_date.split("T")[0]);
    const refDate = new Date(referenceDate);
    let age = refDate.getFullYear() - birthDate.getFullYear();
    const monthDiff = refDate.getMonth() - birthDate.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && refDate.getDate() < birthDate.getDate())) {
      age--;
    }

    let eligible = false;
    let reason = "";

    if (age < 18) {
      eligible = true;
      reason = "Menor de 18 años";
    } else if (age >= 18 && age <= 24) {
      if (dh.is_studying && dh.study_proof_url) {
        eligible = true;
        reason = "Estudiante superior con constancia (18-24 años)";
      } else if (dh.is_studying && !dh.study_proof_url) {
        reason = "Marcado como estudiante pero sin constancia adjunta";
      } else {
        reason = "Mayor de 18 sin estudios superiores acreditados";
      }
    } else {
      reason = "Mayor de 24 años (excede el tope legal)";
    }

    children.push({
      id: dh.id,
      name: `${dh.first_name} ${dh.last_name || ""}`.trim(),
      birth_date: dh.birth_date,
      age,
      is_studying: dh.is_studying || false,
      has_study_proof: !!dh.study_proof_url,
      study_proof_url: dh.study_proof_url || null,
      is_active: dh.is_active !== false,
      eligible,
      reason,
    });
  }

  // Solo contar hijos activos y elegibles
  const eligibleChildren = children.filter((c) => c.eligible && c.is_active);

  // El monto es FIJO: 10% de la RMV vigente, sin importar el número de hijos.
  // Basta con tener al menos un hijo elegible para percibir el beneficio completo.
  return {
    qualifies: eligibleChildren.length > 0,
    eligibleCount: eligibleChildren.length,
    amount: eligibleChildren.length > 0 ? allowancePerChild : 0,
    allowancePerChild,
    children,
  };
}