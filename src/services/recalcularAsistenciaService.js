import localClient from '@/api/localClient';

const recalcularAsistenciaService = {
  invoke: async (employee_id, date_from, date_to) => {
    try {
      const response = await localClient.post('/api/attendance/recalcular', {
        employee_id,
        date_from,
        date_to,
      });
      return response.data;
    } catch (error) {
      console.error('Error en recalcularAsistenciaService:', error);
      throw new Error(error.response?.data?.error || 'Error recalculando asistencia');
    }
  },
};

export default recalcularAsistenciaService;