import { useQuery } from "@tanstack/react-query";
import { entitiesAPI } from "@/api/entitiesClient";
import { MEDICAL_REST_TYPE } from "@/lib/medicalSubsidy";

export const medicalIncidentsQueryKey = (year) => ["payrollMedicalIncidents", year];

// El endpoint local devuelve el rango completo, sin el límite del SDK.
// Incluye el año anterior para detectar continuaciones al cambiar de ejercicio.
export default function useMedicalRestIncidents(year) {
  return useQuery({
    queryKey: medicalIncidentsQueryKey(year),
    queryFn: async () => {
      const list = await entitiesAPI.AttendanceIncident.filter({
        incident_type: MEDICAL_REST_TYPE,
        status: "Aprobada",
        incident_date: { $gte: `${Number(year) - 1}-01-01`, $lte: `${year}-12-31` },
      }, "incident_date");
      if (!Array.isArray(list)) throw new Error("Historial médico inválido");
      return list;
    },
    staleTime: 0,
  });
}
