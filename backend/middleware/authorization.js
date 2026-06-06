import prisma from '../config/prisma.js';

const LEGACY_PERMISSIONS = {
  super_admin: ['system.admin'],
  admin: ['system.admin'],
  hr_readonly: ['employees.view', 'attendance.view_all', 'roles.view'],
  manager: ['employees.view', 'attendance.view_department', 'attendance.approve_incidents'],
  empleado: ['attendance.view_own'],
};

const normalizeJsonArray = (value) => Array.isArray(value) ? value : [];
const normalizeSite = value => String(value || '').trim().toLocaleLowerCase();

export const loadAccessContext = async (req, res, next) => {
  try {
    const employee = await prisma.employee.findFirst({
      where: { work_email: req.user?.email },
    });

    if (!employee) {
      return res.status(403).json({ error: 'No existe un empleado asociado al usuario' });
    }

    const assignments = await prisma.user_role.findMany({
      where: { employee_id: employee.id },
    });
    const roleIds = assignments.map(assignment => assignment.role_id).filter(Boolean);
    const roles = roleIds.length > 0
      ? await prisma.role.findMany({ where: { id: { in: roleIds } } })
      : [];

    const permissions = new Set();
    if (employee.role === 'super_admin') {
      permissions.add('system.admin');
    } else if (roles.length > 0) {
      roles.forEach(role => normalizeJsonArray(role.permissions).forEach(permission => permissions.add(permission)));
    } else {
      (LEGACY_PERMISSIONS[employee.role] || LEGACY_PERMISSIONS.empleado).forEach(permission => permissions.add(permission));
    }

    req.access = { employee, roles, permissions, hasCustomRoles: roles.length > 0 };
    next();
  } catch (error) {
    next(error);
  }
};

export const hasPermission = (access, permission) => (
  access?.permissions?.has('system.admin') || access?.permissions?.has(permission)
);

export const requireAnyPermission = (...requiredPermissions) => (req, res, next) => {
  if (requiredPermissions.some(permission => hasPermission(req.access, permission))) {
    return next();
  }

  return res.status(403).json({
    error: 'Permiso insuficiente',
    required_permissions: requiredPermissions,
  });
};

const roleGrantsPermission = (role, permission) => {
  const permissions = normalizeJsonArray(role.permissions);
  return permissions.includes('system.admin') || permissions.includes(permission);
};

const getRoleEmployeeIds = async (access, role, permission) => {
  if (roleGrantsPermission(role, 'system.admin')) return null;

  const where = {};
  const and = [];
  let allowedSites = null;

  if (permission.endsWith('.view_own')) {
    return [access.employee.id];
  }

  // Una restricción por sede define el alcance completo del rol. No debe
  // reducirse adicionalmente al departamento del usuario.
  if (!role.site_restricted && (permission.endsWith('.view_department') || role.department_restricted)) {
    if (!access.employee.department_name) return [access.employee.id];
    and.push({ department_name: access.employee.department_name });
  }

  if (role.site_restricted) {
    const configuredSites = normalizeJsonArray(role.allowed_sites);
    allowedSites = configuredSites.length > 0
      ? configuredSites
      : (access.employee.site ? [access.employee.site] : []);
    if (allowedSites.length === 0) return [];
  }

  if (role.team_restricted) {
    const teamIds = normalizeJsonArray(access.employee.managed_team_ids);
    and.push({ id: { in: [...new Set([access.employee.id, ...teamIds])] } });
  }

  if (and.length === 0 && allowedSites === null) return null;
  if (and.length > 0) where.AND = and;

  const employees = await prisma.employee.findMany({ where, select: { id: true, site: true } });
  if (allowedSites === null) return employees.map(employee => employee.id);

  const normalizedSites = new Set(allowedSites.map(normalizeSite));
  return employees
    .filter(employee => normalizedSites.has(normalizeSite(employee.site)))
    .map(employee => employee.id);
};

export const resolveAccessibleEmployeeIds = async (access, requestedPermissions) => {
  if (!access) return [];
  if (access.permissions.has('system.admin')) return null;

  const permissions = requestedPermissions.filter(permission => hasPermission(access, permission));
  if (permissions.length === 0) return [];

  if (!access.hasCustomRoles) {
    if (permissions.some(permission => permission.endsWith('.view_all'))) return null;
    if (permissions.some(permission => permission.endsWith('.view_department')) ||
        (access.employee.role === 'manager' && permissions.includes('attendance.approve_incidents'))) {
      if (!access.employee.department_name) return [access.employee.id];
      const employees = await prisma.employee.findMany({
        where: { department_name: access.employee.department_name },
        select: { id: true },
      });
      return employees.map(employee => employee.id);
    }
    return [access.employee.id];
  }

  const employeeIds = new Set();
  for (const permission of permissions) {
    const grantingRoles = access.roles.filter(role => roleGrantsPermission(role, permission));
    for (const role of grantingRoles) {
      const roleEmployeeIds = await getRoleEmployeeIds(access, role, permission);
      if (roleEmployeeIds === null) return null;
      roleEmployeeIds.forEach(id => employeeIds.add(id));
    }
  }

  return [...employeeIds];
};

export const attachEmployeeScope = (...permissions) => async (req, res, next) => {
  try {
    req.accessibleEmployeeIds = await resolveAccessibleEmployeeIds(req.access, permissions);
    next();
  } catch (error) {
    next(error);
  }
};

export const canAccessEmployee = (req, employeeId) => (
  req.accessibleEmployeeIds === null || req.accessibleEmployeeIds?.includes(employeeId)
);
