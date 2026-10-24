// ─────────────────────────────────────────────────────────────────────────────
// Selección del contrato aplicable.
//
// El estado "Vigente" NO es suficiente: puede haber varios contratos marcados
// como vigentes, incluidos contratos cuya fecha de fin ya pasó. La selección se
// hace por fechas (inicio/fin) del contrato efectivo, y los contratos
// superpuestos se reportan como inconsistencia en lugar de resolverse de forma
// arbitraria.
// ─────────────────────────────────────────────────────────────────────────────

const normDate = (value) => (value ? String(value).split("T")[0].slice(0, 10) : null);

const startOf = (c) => normDate(c?.start_date);
const endOf = (c) => normDate(c?.end_date);

/** Contrato rescindido/anulado/cancelado: no representa el vínculo laboral. */
export const isCancelledContract = (contract) => {
  const s = String(contract?.status || "").toLowerCase();
  return s.includes("rescind") || s.includes("anulad") || s.includes("cancelad");
};

/** Contrato aprobado: el estado "Vigente" es el único que autoriza la remuneración. */
export const isApprovedContract = (contract) =>
  String(contract?.status || "").trim().toLowerCase() === "vigente";

const sortByStartDesc = (contracts) =>
  [...contracts].sort((a, b) => String(startOf(b) || "1900-01-01").localeCompare(String(startOf(a) || "1900-01-01")));

/** El contrato rige en la fecha indicada si inicio ≤ fecha ≤ fin (fin vacío = vigente). */
export const contractCoversDate = (contract, dateStr) => {
  const date = normDate(dateStr);
  if (!date) return false;
  const start = startOf(contract);
  if (!start) return false;
  if (start > date) return false;
  const end = endOf(contract);
  if (end && end < date) return false;
  return true;
};

/**
 * Contrato efectivo para una fecha (p. ej. hoy): el que rige en esa fecha.
 * Si hay varios, se reportan como superpuestos y se elige el de inicio más
 * reciente que ya empezó (criterio explícito, no arbitrario).
 */
export const pickEffectiveContract = (contracts, dateStr) => {
  const list = (contracts || []).filter((c) => !isCancelledContract(c));
  const covering = sortByStartDesc(list.filter((c) => contractCoversDate(c, dateStr)));
  return { contract: covering[0] || null, overlaps: covering.slice(1), hasConflict: covering.length > 1 };
};

/**
 * Contrato aplicable al período liquidado (histórico o actual).
 * Primero se buscan contratos que solapan el período, priorizando los aprobados.
 * Si ninguno solapa, se usa el último iniciado antes del cierre. El estado actual
 * no debe ocultar contratos históricos ni introducir renovaciones futuras.
 * La falta de aprobación se informa mediante `missingApprovedContract`.
 */
export const pickContractForPeriod = (contracts, periodStartStr, periodEndStr) => {
  const list = (contracts || []).filter((c) => !isCancelledContract(c));

  if (list.length === 0) {
    return {
      contract: null,
      overlaps: [],
      hasConflict: false,
      contractApproved: false,
      missingApprovedContract: true,
    };
  }

  // Las fechas del período prevalecen sobre el estado actual del historial.
  const candidates = sortByStartDesc(list);

  const periodStart = normDate(periodStartStr);
  const periodEnd = normDate(periodEndStr);

  const overlapping = candidates.filter((c) => {
    const start = startOf(c);
    if (!start) return false;
    if (periodEnd && start > periodEnd) return false;
    const end = endOf(c);
    if (end && periodStart && end < periodStart) return false;
    return true;
  });

  if (overlapping.length > 0) {
    const contract = overlapping.find(isApprovedContract) || overlapping[0];
    // Una renovación no invalida el contrato histórico que cubre este período.
    const contractApproved = isApprovedContract(contract) ||
      String(contract?.status || "").trim().toLowerCase() === "renovado";
    return {
      contract,
      overlaps: overlapping.filter(c => c !== contract),
      hasConflict: overlapping.length > 1,
      contractApproved,
      missingApprovedContract: !contractApproved,
    };
  }

  const alreadyStarted = candidates.filter((c) => {
    const start = startOf(c);
    return start && periodEnd && start <= periodEnd;
  });
  const contract = alreadyStarted[0] || null;
  const contractApproved = isApprovedContract(contract);
  return {
    contract,
    overlaps: [],
    hasConflict: false,
    contractApproved,
    missingApprovedContract: !contractApproved,
  };
};

/** Descripción corta para mensajes y avisos. */
export const describeContract = (contract) =>
  contract
    ? `${contract.contract_number || "s/n"} (${startOf(contract) || "sin inicio"} → ${endOf(contract) || "sin fin"}) · S/ ${Number(contract.salary) || 0}`
    : "sin contrato";
