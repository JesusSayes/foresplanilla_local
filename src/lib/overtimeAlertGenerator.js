import localClient from "@/api/localClient";

// El servidor limita la consulta al período y conserva las decisiones previas.
export const generateOvertimeAlertsForAllRecords = async ({ date, onProgress }) => {
  const { data } = await localClient.post('/api/attendance/overtime-alerts/generate', date ? { date } : {});
  onProgress?.({ done: data.total, total: data.total });
  return data;
};
