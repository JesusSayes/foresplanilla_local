// Los registros históricos tienen ambos campos en cero tras el ALTER.
export const compensationMinutes = (incident) => {
  const minutes = Number(incident.overtime_minutes_25 || 0) + Number(incident.overtime_minutes_35 || 0);
  return minutes > 0 ? minutes : Math.round(Number(incident.hours_to_adjust || 0) * 60);
};
