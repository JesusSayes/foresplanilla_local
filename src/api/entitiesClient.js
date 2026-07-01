import localClient from './localClient';

const createEntityAPI = (endpoint) => ({
  list: async (sort = '-created_date') => {
    const response = await localClient.get(`${endpoint}?sort=${sort}`);
    return response.data;
  },

  filter: async (filters, sort = '-created_date') => {
    const response = await localClient.post(`${endpoint}/filter?sort=${sort}`, filters);
    return response.data;
  },

  get: async (id) => {
    const response = await localClient.get(`${endpoint}/${id}`);
    return response.data;
  },

  create: async (data) => {
    const response = await localClient.post(endpoint, data);
    return response.data;
  },

  update: async (id, data) => {
    const response = await localClient.put(`${endpoint}/${id}`, data);
    return response.data;
  },

  delete: async (id) => {
    const response = await localClient.delete(`${endpoint}/${id}`);
    return response.data;
  }
});

export const entitiesAPI = {
  Employee: {
    ...createEntityAPI('/api/employees'),
    accessible: async (permissions) => {
      const response = await localClient.get('/api/employees/accessible', {
        params: { permissions: permissions.join(',') }
      });
      return response.data;
    }
  },
  Position: createEntityAPI('/api/master-data/positions'),
  Department: createEntityAPI('/api/master-data/departments'),
  AreaUnidadCargo: createEntityAPI('/api/master-data/area-unidad-cargos'),
  Bank: createEntityAPI('/api/master-data/banks'),
  Site: createEntityAPI('/api/master-data/sites'),
  AFP: createEntityAPI('/api/master-data/afps'),
  Profession: createEntityAPI('/api/master-data/professions'),
  Ubigeo: createEntityAPI('/api/master-data/ubigeos'),
  // Holiday: createEntityAPI('/api/master-data/holidays'),
  // Role: createEntityAPI('/api/master-data/roles'),
  Holiday: createEntityAPI('/api/holidays'),
  Role: createEntityAPI('/api/roles'),
  UserRole: createEntityAPI('/api/users/roles'),
  EmployeeChangeLog: createEntityAPI('/api/employees/changelog'),
  Contract: createEntityAPI('/api/contracts'),
  ContractTemplate: createEntityAPI('/api/contracts/templates'),
  ContractClause: createEntityAPI('/api/contracts/clauses'),
  ContractRenewalRule: createEntityAPI('/api/contracts/renewal-rules'),
  AttendanceRecord: createEntityAPI('/api/attendance/records'),
  AttendanceIncident: createEntityAPI('/api/attendance/incidents'),
  AttendanceEditRequest: {
    ...createEntityAPI('/api/attendance/edit-requests'),
    approve: async (id, data = {}) => {
      const response = await localClient.post(`/api/attendance/edit-requests/${id}/approve`, data);
      return response.data;
    },
    reject: async (id, data) => {
      const response = await localClient.post(`/api/attendance/edit-requests/${id}/reject`, data);
      return response.data;
    },
    cancel: async (id) => {
      const response = await localClient.post(`/api/attendance/edit-requests/${id}/cancel`);
      return response.data;
    },
  },
  OvertimeAlert: createEntityAPI('/api/attendance/overtime-alerts'),
  WorkSchedule: createEntityAPI('/api/attendance/schedules'),
  // AttendanceLog: createEntityAPI('/api/attendance/logs'),
  AttendanceLog: {
    getByEmployeeAndDate: async (employee_id, date) => {
      const response = await localClient.get(
        `/api/attendance/logs?employee_id=${employee_id}&date=${date}`
      );
      return response.data;
    }
  },
  VacationRequest: createEntityAPI('/api/vacations/requests'),
  VacationBalance: createEntityAPI('/api/vacations/balances'),
  // Payslip: createEntityAPI('/api/payroll/payslips'),
  Payslip: {
    ...createEntityAPI('/api/payroll/payslips'),

    bulkCreate: async (data) => {
      const response = await localClient.post('/api/payroll/payslips/bulk', data);
      return response.data;
    }
  },
  PayslipTemplate: createEntityAPI('/api/payroll/templates'),
  PayrollConcept: createEntityAPI('/api/payroll/concepts'),
  PayrollConfig: createEntityAPI('/api/payroll/config'),
  Certificate: createEntityAPI('/api/certificates'),
  Notification: createEntityAPI('/api/notifications'),
  CompanyInfo: createEntityAPI('/api/company/info'),
  CostCenter: createEntityAPI('/api/cost-centers'),
  CostCenterCategory: createEntityAPI('/api/cost-center-categories'),
  CostCenterAssignment: createEntityAPI('/api/cost-center-assignments'),
  CostCenterChangeLog: createEntityAPI('/api/cost-center-changelogs'),
  DatabaseConnection: createEntityAPI('/api/database/connections'),
  SyncLog: createEntityAPI('/api/sync/logs'),
  IncidentType: createEntityAPI('/api/incident-types'),
  SeguroVidaLey: createEntityAPI('/api/master-data/segurovidaley'),
  UIT: createEntityAPI('/api/master-data/uits'),
  AccountingAccount: createEntityAPI('/api/master-data/accountingaccounts'),
  RMV: createEntityAPI('/api/master-data/rmvs'),
  User: createEntityAPI('/api/users'),
  LoanType: createEntityAPI('/api/payroll/loan-types'),
  Loan: createEntityAPI('/api/payroll/loans'),
  LoanInstallment: createEntityAPI('/api/payroll/loan-installments'),
  Derechohabiente: createEntityAPI('/api/derechohabientes'),
  CuentaContable: createEntityAPI('/api/cuentas-contables'),
  Subdiario: createEntityAPI('/api/subdiarios'),
  TipoAnexo: createEntityAPI('/api/tipo-anexos'),
  HistorialRemunerativo: {
    ...createEntityAPI('/api/historial-remunerativo'),
    bulkCreate: async (data) => {
      const response = await localClient.post('/api/historial-remunerativo/bulk', data);
      return response.data;
    }
  },
  AsientoContable: {
    ...createEntityAPI('/api/asientos-contables'),

    bulkCreate: async (data) => {
      const response = await localClient.post('/api/asientos-contables/bulk', data);
      return response.data;
    }
  },
};

export default entitiesAPI;
