import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { MEDICAL_REST_TYPE } from "@/lib/medicalSubsidy";

/** Límite de lectura del historial anual de descansos médicos. */
export const MEDICAL_INCIDENTS_LIMIT = 2000;

export const medicalIncidentsQueryKey = (year) => ["payrollMedicalIncidents", year];

/**
 * Descansos médicos APROBADOS del año calendario (más diciembre del año anterior, para
 * detectar la continuidad de una contingencia). Se lee completo y con datos frescos: un
 * historial ausente no debe interpretarse como "cero días previos".
 */
export default function useMedicalRestIncidents(year) {
  return useQuery({
    queryKey: medicalIncidentsQueryKey(year),
    queryFn: async () => {
      const res = await base44.entities.AttendanceIncident.filter(
        {
          incident_type: MEDICAL_REST_TYPE,
          status: "Aprobada",
          incident_date: { $gte: `${Number(year) - 1}-12-01`, $lte: `${year}-12-31` },
        },
        "-incident_date",
        MEDICAL_INCIDENTS_LIMIT
      );
      const list = Array.isArray(res) ? res : res?.items || [];
      if (list.length >= MEDICAL_INCIDENTS_LIMIT) {
        console.warn(
          "[Planilla] Historial de descansos médicos en el límite de lectura: el acumulado anual podría estar incompleto."
        );
      }
      return list;
    },
    staleTime: 0,
  });
}