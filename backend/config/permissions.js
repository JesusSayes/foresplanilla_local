export const BASE44_PERMISSIONS = Object.freeze({
  // Empleados
  'employees.view': 'Ver empleados',
  'employees.edit': 'Editar empleados',
  'employees.create': 'Crear empleados',
  'employees.delete': 'Eliminar empleados',
  'employees.import': 'Importar empleados masivamente',
  'employees.export': 'Exportar datos de empleados',
  'employees.change_status': 'Cambiar estado de empleados',
  'employees.view_financials': 'Ver información financiera de empleados',

  // Asistencia
  'attendance.view_own': 'Ver propia asistencia',
  'attendance.view_all': 'Ver asistencia de todos',
  'attendance.view_department': 'Ver asistencia del departamento',
  'attendance.edit': 'Editar registros de asistencia',
  'attendance.approve_edits': 'Aprobar/rechazar edición de registros de asistencia',
  'attendance.approve_incidents': 'Aprobar/rechazar incidencias',
  'attendance.approve_compensations': 'Aprobar compensaciones de tardanzas y horas extras',
  'attendance.view_reports': 'Ver reportes de asistencia',
  'attendance.manage': 'Gestión completa de asistencia',
  'attendance.export': 'Exportar reportes de asistencia',

  // Vacaciones
  'vacations.view_own': 'Ver propias vacaciones',
  'vacations.view_all': 'Ver vacaciones de todos',
  'vacations.view_department': 'Ver vacaciones del departamento',
  'vacations.request': 'Solicitar vacaciones',
  'vacations.approve': 'Aprobar solicitudes de vacaciones',
  'vacations.manage_balances': 'Gestionar saldos de vacaciones',
  'vacations.view_calendar': 'Ver calendario de vacaciones',
  'vacations.manage': 'Gestión completa de vacaciones',
  'vacations.calendar': 'Ver calendario de vacaciones',

  // Nómina
  'payroll.view_own': 'Ver propias boletas',
  'payroll.view_all': 'Ver todas las boletas',
  'payroll.process': 'Procesar planilla',
  'payroll.edit': 'Editar boletas',
  'payroll.create': 'Crear boletas',
  'payroll.delete': 'Eliminar boletas',
  'payroll.calculate': 'Calcular nómina',
  'payroll.approve': 'Aprobar nómina',
  'payroll.export': 'Exportar datos de planilla',
  'payroll.manage_concepts': 'Gestionar conceptos de planilla',

  // Certificados
  'certificates.view_own': 'Ver propios certificados',
  'certificates.view_all': 'Ver todos los certificados',
  'certificates.generate': 'Generar certificados',
  'certificates.approve': 'Aprobar certificados',
  'certificates.create': 'Crear certificados',
  'certificates.request': 'Solicitar certificados',

  // Horarios
  'schedules.view': 'Ver horarios',
  'schedules.edit': 'Editar horarios',
  'schedules.create': 'Crear horarios',
  'schedules.delete': 'Eliminar horarios',
  'schedules.assign': 'Asignar horarios',

  // Feriados
  'holidays.view': 'Ver feriados',
  'holidays.manage': 'Gestionar feriados',
  'holidays.create': 'Crear feriados',
  'holidays.edit': 'Editar feriados',
  'holidays.delete': 'Eliminar feriados',

  // Sedes
  'sites.view': 'Ver sedes',
  'sites.create': 'Crear sedes',
  'sites.edit': 'Editar sedes',
  'sites.delete': 'Eliminar sedes',
  'sites.manage': 'Gestión completa de sedes',

  // Departamentos
  'departments.view': 'Ver departamentos',
  'departments.create': 'Crear departamentos',
  'departments.edit': 'Editar departamentos',
  'departments.delete': 'Eliminar departamentos',
  'departments.manage': 'Gestión completa de departamentos',

  // Cargos/Posiciones
  'positions.view': 'Ver cargos',
  'positions.create': 'Crear cargos',
  'positions.edit': 'Editar cargos',
  'positions.delete': 'Eliminar cargos',
  'positions.manage': 'Gestión completa de cargos',

  // Bancos
  'banks.view': 'Ver bancos',
  'banks.create': 'Crear bancos',
  'banks.edit': 'Editar bancos',
  'banks.delete': 'Eliminar bancos',

  // Reportes
  'reports.view': 'Ver reportes',
  'reports.export': 'Exportar reportes',
  'reports.advanced': 'Acceso a reportes avanzados',
  'reports.attendance': 'Ver reportes de asistencia',
  'reports.payroll': 'Ver reportes de nómina',
  'reports.vacations': 'Ver reportes de vacaciones',
  'reports.employees': 'Ver reportes de empleados',

  // Centros de Costo
  'cost_centers.view': 'Ver centros de costo',
  'cost_centers.create': 'Crear centros de costo',
  'cost_centers.edit': 'Editar centros de costo',
  'cost_centers.delete': 'Eliminar centros de costo',
  'cost_centers.assign': 'Asignar centros de costo',
  'cost_centers.view_amounts': 'Ver montos de centros de costo',

  // Planillas
  'payroll.view_amounts': 'Ver montos en planillas',
  'payroll.view_department': 'Ver planillas del departamento',

  // Contabilidad
  'accounting.view': 'Ver asientos contables',
  'accounting.manage': 'Gestionar asientos contables',

  // Préstamos
  'loans.view': 'Ver préstamos',
  'loans.manage': 'Gestionar préstamos',

  // Contratos
  'contracts.view': 'Ver contratos',
  'contracts.view_amounts': 'Ver montos de contratos',
  'contracts.create': 'Crear contratos',
  'contracts.edit': 'Editar contratos',
  'contracts.delete': 'Eliminar contratos',
  'contracts.approve': 'Aprobar contratos',
  'contracts.sign': 'Firmar contratos digitalmente',
  'contracts.manage_templates': 'Gestionar plantillas de contratos',
  'contracts.manage_renewals': 'Gestionar renovaciones automáticas',

  // Notificaciones
  'notifications.manage_contract_alerts': 'Gestionar alertas de vencimiento de contratos',

  // Administración
  'roles.view': 'Ver roles',
  'roles.create': 'Crear roles',
  'roles.edit': 'Editar roles',
  'roles.delete': 'Eliminar roles',
  'roles.manage': 'Gestionar roles y permisos',
  'roles.assign': 'Asignar roles a usuarios',
  'system.admin': 'Acceso administrativo completo',
  'system.settings': 'Configurar ajustes del sistema',
});

export const BASE44_PERMISSION_KEYS = Object.freeze(Object.keys(BASE44_PERMISSIONS));

// Permisos que nacieron durante la migración local. No son fuente de verdad
// Base44, pero se aceptan para no invalidar roles ya guardados en BD.
export const LOCAL_PERMISSION_ALIASES = Object.freeze({
  'attendance.view_reports': [
    'reports.attendance',
    'attendance.export',
  ],
  'attendance.manage_schedules': [
    'schedules.view',
    'schedules.create',
    'schedules.edit',
    'schedules.assign',
    'schedules.delete',
  ],
  'schedules.manage': [
    'schedules.view',
    'schedules.create',
    'schedules.edit',
    'schedules.assign',
    'schedules.delete',
  ],
  'vacations.request': [
    'vacations.view_own',
  ],
  'vacations.manage_balances': [
    'vacations.manage',
  ],
  'vacations.view_calendar': [
    'vacations.calendar',
  ],
  'payroll.process': [
    'payroll.calculate',
    'payroll.create',
  ],
  'payroll.manage_concepts': [
    'payroll.edit',
    'payroll.create',
    'payroll.delete',
  ],
  'certificates.generate': [
    'certificates.create',
  ],
  'contracts.manage_templates': [
    'contracts.create',
    'contracts.edit',
  ],
  'contracts.manage_renewals': [
    'contracts.edit',
  ],
});

export const LOCAL_PERMISSION_KEYS = Object.freeze(Object.keys(LOCAL_PERMISSION_ALIASES));

export const SCHEDULE_PERMISSION_GROUPS = Object.freeze({
  view: [
    'schedules.view',
    'schedules.create',
    'schedules.edit',
    'schedules.assign',
    'schedules.delete',
  ],
  create: [
    'schedules.create',
    'schedules.assign',
  ],
  update: [
    'schedules.edit',
    'schedules.assign',
  ],
  delete: [
    'schedules.delete',
  ],
});

export const LEGACY_ROLE_PERMISSIONS = Object.freeze({
  super_admin: ['system.admin'],
  admin: ['system.admin'],
  hr_readonly: [
    'employees.view',
    'attendance.view_all',
    'vacations.view_all',
    'payroll.view_all',
    'certificates.view_all',
    'schedules.view',
    'holidays.view',
    'reports.view',
    'reports.export',
    'roles.view',
  ],
  manager: [
    'employees.view',
    'attendance.view_department',
    'attendance.approve_incidents',
    'vacations.view_department',
    'vacations.approve',
    'payroll.view_own',
    'certificates.view_own',
    'schedules.view',
    'holidays.view',
    'reports.view',
    'reports.export',
  ],
  empleado: [
    'attendance.view_own',
    'vacations.view_own',
    'payroll.view_own',
    'certificates.view_own',
    'schedules.view',
    'holidays.view',
  ],
});

export const ACCESSIBLE_EMPLOYEE_PERMISSION_KEYS = Object.freeze([
  'attendance.view_all',
  'attendance.view_department',
  'attendance.view_own',
  'attendance.edit',
  'attendance.approve_incidents',
  'attendance.approve_edits',
  'attendance.approve_compensations',
  'attendance.manage',
  'roles.assign',
  'roles.manage',
  'certificates.view_all',
  'certificates.create',
  'certificates.approve',
  ...SCHEDULE_PERMISSION_GROUPS.view,
  ...LOCAL_PERMISSION_KEYS,
]);
