const recalcularAsistenciaService = {
  invoke: async (employee_id, date_from, date_to) => {
    try {
      const response = await fetch('/api/attendance/recalcular', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ employee_id, date_from, date_to }),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Error recalculando asistencia');
      }

      return await response.json();
    } catch (error) {
      console.error('Error en recalcularAsistenciaService:', error);
      throw error;
    }
  },
};

export default recalcularAsistenciaService;