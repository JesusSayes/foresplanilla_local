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
  Employee: createEntityAPI('/api/employees'),
  Position: createEntityAPI('/api/master-data/positions'),
  Department: createEntityAPI('/api/master-data/departments'),
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
  WorkSchedule: createEntityAPI('/api/attendance/schedules'),
  VacationRequest: createEntityAPI('/api/vacations/requests'),
  VacationBalance: createEntityAPI('/api/vacations/balances'),
  Payslip: createEntityAPI('/api/payroll/payslips'),
  PayslipTemplate: createEntityAPI('/api/payroll/templates'),
  PayrollConcept: createEntityAPI('/api/payroll/concepts'),
  Certificate: createEntityAPI('/api/certificates'),
  Notification: createEntityAPI('/api/notifications'),
  CompanyInfo: createEntityAPI('/api/company/info'),
  CostCenter: createEntityAPI('/api/cost-centers'),
  DatabaseConnection: createEntityAPI('/api/database/connections'),
  SyncLog: createEntityAPI('/api/sync/logs'),
};

export default entitiesAPI;
