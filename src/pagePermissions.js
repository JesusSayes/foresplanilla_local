/**
 * Mapa de permisos requeridos por página.
 * Centraliza la seguridad de acceso a páginas sensibles.
 * Si una página no está aquí, es accesible para cualquier usuario autenticado
 * (páginas de autoservicio: Mi Perfil, Mi Asistencia, Dashboard, etc.).
 */
export const PAGE_PERMISSIONS = {
  // ── Admin-only (system.admin) ──
  DataExport: { requiredPermission: "system.admin" },
  DatabaseConfig: { requiredPermission: "system.admin" },
  UserManagement: { requiredPermission: "system.admin" },
  SystemRoleInitializer: { requiredPermission: "system.admin" },
  BackfillAsistencia: { requiredPermission: "system.admin" },
  AccessDeviceConfig: { requiredPermission: "system.admin" },
  SubdiarioManagement: { requiredPermission: "system.admin" },
  TipoAnexoManagement: { requiredPermission: "system.admin" },

  // ── System settings ──
  CompanySettings: { requiredPermission: "system.settings" },
  PayslipTemplateConfig: { requiredPermission: "system.settings" },

  // ── Payroll / Financial ──
  ConsultaPlanillas: { requiredPermission: "payroll.view_all" },
  SunatExport: {
    requiredAnyPermissions: [
      "accounting.view",
      "accounting.manage",
      "payroll.view_all",
      "payroll.create",
      "payroll.calculate",
    ],
  },
  AsientosContables: {
    requiredAnyPermissions: [
      "accounting.view",
      "accounting.manage",
      "payroll.view_all",
      "payroll.create",
      "payroll.calculate",
    ],
  },
  CuentasContables: {
    requiredAnyPermissions: [
      "accounting.view",
      "accounting.manage",
      "payroll.view_all",
    ],
  },
  BeneficiosSociales: {
    requiredAnyPermissions: [
      "payroll.view_all",
      "payroll.create",
      "payroll.calculate",
    ],
  },
  HistorialRemunerativo: {
    requiredAnyPermissions: [
      "payroll.view_all",
      "payroll.create",
      "payroll.calculate",
    ],
  },
  PayrollConcepts: { requiredPermission: "payroll.view_all" },
  CostCenterValuation: { requiredPermission: "cost_centers.view" },

  // ── Contracts ──
  ContractRenewalAutomation: { requiredPermission: "contracts.view" },
  ContractTemplateConfig: { requiredPermission: "contracts.view" },

  // ── Employee data ──
  OrgChart: { requiredPermission: "employees.view" },

  // ── Attendance ──
  CompensacionTardanzas: {
    requiredAnyPermissions: [
      "attendance.approve_compensations",
      "attendance.manage",
      "attendance.view_all",
      "system.admin",
    ],
  },

  // ── Self-service (mínimo permiso) ──
  Payslips: { requiredPermission: "payroll.view_own" },
  Certificates: { requiredAnyPermissions: ["certificates.view_own", "certificates.view_all"] },
};