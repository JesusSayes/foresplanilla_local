/**
 * Computes permission flags from a list of permission strings.
 * These flags are synced to user.data so that RLS rules can verify
 * permissions using user_condition checks (which only support equality).
 *
 * @param {string[]} permissions - Array of permission strings
 * @returns {Object} - Object with boolean permission flags
 */
export function computePermissionFlags(permissions) {
  const hasAdmin = permissions.includes("system.admin");
  const has = (perm) => hasAdmin || permissions.includes(perm);
  const hasAny = (perms) => hasAdmin || perms.some((p) => permissions.includes(p));

  return {
    // Employees
    can_view_all_employees: has("employees.view"),
    can_create_employees: has("employees.create"),
    can_edit_employees: has("employees.edit"),
    can_delete_employees: has("employees.delete"),

    // Attendance
    can_view_all_attendance: hasAny([
      "attendance.view_all",
      "attendance.view_department",
      "attendance.manage",
    ]),
    can_manage_attendance: hasAny(["attendance.edit", "attendance.manage"]),
    can_approve_attendance_edits: has("attendance.approve_edits"),
    can_approve_attendance_incidents: has("attendance.approve_incidents"),
    can_approve_compensations: hasAny(["attendance.approve_compensations", "attendance.manage"]),

    // Vacations
    can_view_all_vacations: hasAny([
      "vacations.view_all",
      "vacations.view_department",
    ]),
    can_approve_vacations: hasAny(["vacations.approve", "vacations.manage"]),
    can_manage_vacations: has("vacations.manage"),

    // Payroll
    can_view_all_payroll: hasAny(["payroll.view_all", "payroll.view_department"]),
    can_create_payroll: hasAny(["payroll.create", "payroll.calculate"]),
    can_edit_payroll: has("payroll.edit"),
    can_delete_payroll: has("payroll.delete"),

    // Certificates
    can_view_all_certificates: has("certificates.view_all"),
    can_approve_certificates: has("certificates.approve"),
    can_create_certificates: has("certificates.create"),

    // Contracts
    can_view_contracts: has("contracts.view"),
    can_create_contracts: has("contracts.create"),
    can_edit_contracts: has("contracts.edit"),
    can_delete_contracts: has("contracts.delete"),

    // Cost centers
    can_view_cost_centers: has("cost_centers.view"),
    can_manage_cost_centers: hasAny([
      "cost_centers.create",
      "cost_centers.edit",
      "cost_centers.assign",
    ]),

    // Accounting
    can_view_accounting: hasAny(["accounting.view", "accounting.manage"]),
    can_manage_accounting: has("accounting.manage"),

    // Loans
    can_view_loans: hasAny(["loans.view", "loans.manage"]),
    can_manage_loans: has("loans.manage"),

    // Roles
    can_view_roles: has("roles.view"),
    can_manage_roles: hasAny(["roles.manage", "roles.assign"]),

    // Schedules
    can_view_schedules: hasAny([
      "schedules.view",
      "schedules.edit",
      "schedules.create",
      "schedules.assign",
    ]),
    can_manage_schedules: hasAny([
      "schedules.edit",
      "schedules.create",
      "schedules.assign",
    ]),

    // Holidays
    can_view_holidays: has("holidays.view"),
    can_manage_holidays: hasAny([
      "holidays.manage",
      "holidays.create",
      "holidays.edit",
      "holidays.delete",
    ]),

    // System
    can_manage_system: has("system.settings"),

    // Reports
    can_view_reports: has("reports.view"),
  };
}