import { useEffect } from "react";
import { useLoading } from "./loadingContext";

/**
 * Vincula el estado de carga de una o varias consultas de react-query
 * al overlay de carga global. Muestra el overlay cuando alguna de las
 * consultas indicadas está en curso (fetching) y lo oculta cuando todas
 * terminan.
 *
 * Uso:
 *   const todayQuery = useQuery({ ... });
 *   const incidentsQuery = useQuery({ ... });
 *   useQueryLoading([
 *     { isFetching: todayQuery.isFetching, message: "Consultando asistencia..." },
 *     { isFetching: incidentsQuery.isFetching, message: "Consultando justificaciones..." },
 *   ]);
 *
 * El conteo concurrente del contexto evita ocultar prematuramente
 * cuando hay operaciones manuales en curso.
 */
export const useQueryLoading = (queries = []) => {
  const { showLoading, hideLoading } = useLoading();

  const anyFetching = queries.some((q) => q.isFetching);
  const firstFetchingMessage = queries.find((q) => q.isFetching)?.message;

  useEffect(() => {
    if (anyFetching) {
      showLoading(firstFetchingMessage);
    } else {
      hideLoading();
    }
    // Limpieza: al desmontar o antes de re-ejecutar, decrementar el contador
    return () => { hideLoading(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [anyFetching, firstFetchingMessage]);
};