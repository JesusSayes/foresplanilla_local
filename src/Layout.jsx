// @ts-nocheck
import React, { useState, useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { createPageUrl } from "./utils";
import { useAuth } from "@/lib/AuthContext";
import { authAPI } from "@/api/localClient";
import { entitiesAPI } from "@/api/entitiesClient";
import { Button } from "@/components/ui/button";
import {
  LayoutDashboard, FileText, Calendar, Clock,
  User, Award, LogOut, Menu, X, Shield, CheckSquare, CalendarDays, Users, ChevronDown, KeyRound, Eye, EyeOff, AlertCircle
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import NotificationCenter from "./components/notifications/NotificationCenter";

// Permisos básicos fallback por rol legacy
const getBasicPermissionsByRole = (role) => {
  const basicPermissions = {
    super_admin: ["system.admin"],
    admin: ["system.admin", "employees.view", "attendance.view_all", "vacations.view_all", "payroll.view_all", "contracts.view", "cost_centers.view", "reports.view", "roles.view", "schedules.view", "holidays.view", "certificates.view_all"],
    hr_readonly: ["employees.view", "attendance.view_all", "vacations.view_all", "payroll.view_all", "reports.view", "schedules.view", "holidays.view", "certificates.view_all"],
    manager: ["employees.view", "attendance.view_department", "attendance.approve_incidents", "vacations.view_department", "vacations.approve", "payroll.view_own", "certificates.view_own", "schedules.view", "holidays.view", "reports.view"],
    empleado: ["attendance.view_own", "vacations.view_own", "payroll.view_own", "certificates.view_own", "schedules.view", "holidays.view"],
  };
  return basicPermissions[role] || basicPermissions.empleado;
};

export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user: currentUser, logout } = useAuth();
  const [employee, setEmployee] = useState(null);
  const [userPermissions, setUserPermissions] = useState([]);
  const [assignedRoleNames, setAssignedRoleNames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState(null);
  const [mobileOpenSubmenu, setMobileOpenSubmenu] = useState(null);
  const [showChangePassword, setShowChangePassword] = useState(false);
  const [passwordData, setPasswordData] = useState({ newPassword: "", confirmPassword: "" });
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [passwordErrors, setPasswordErrors] = useState([]);
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordSuccess, setPasswordSuccess] = useState(false);

  // Pages that don't need sidebar/layout
  const noLayoutPages = ["Home"];

  const hasPermission = (perm) => {
    return userPermissions.includes("system.admin") || userPermissions.includes(perm);
  };

  const hasAnyPermission = (perms) => perms.some(p => hasPermission(p));

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        if (!currentUser) {
          setLoading(false);
          return;
        }

        // Use employee data from auth context if available
        if (currentUser.employee) {
          const emp = currentUser.employee;
          setEmployee(emp);

          if (emp.role === "super_admin") {
            setUserPermissions(["system.admin"]);
            setAssignedRoleNames([]);
            setLoading(false);
            return;
          }

          try {
            const userRoles = await entitiesAPI.UserRole.filter({ employee_id: emp.id });
            if (userRoles && userRoles.length > 0) {
              const allRoles = await entitiesAPI.Role.list();
              const assignedRoles = allRoles.filter(r => userRoles.some(ur => ur.role_id === r.id));
              const allPerms = new Set();
              assignedRoles.forEach(role => {
                (role.permissions || []).forEach(p => allPerms.add(p));
              });
              setUserPermissions([...allPerms]);
              setAssignedRoleNames(assignedRoles.map(r => r.name));
            } else {
              setUserPermissions(getBasicPermissionsByRole(emp.role));
              setAssignedRoleNames([]);
            }
          } catch {
            setUserPermissions(getBasicPermissionsByRole(emp.role));
            setAssignedRoleNames([]);
          }

          setLoading(false);
          return;
        }

        // Fallback to API call if needed
        const employees = await entitiesAPI.Employee.filter({
          work_email: currentUser.email
        });

        if (employees && employees.length > 0) {
          const emp = employees[0];
          setEmployee(emp);

          // Super admin siempre tiene acceso total
          if (emp.role === "super_admin") {
            setUserPermissions(["system.admin"]);
            setAssignedRoleNames([]);
            setLoading(false);
            return;
          }

          // Cargar roles asignados al empleado
          const userRoles = await entitiesAPI.UserRole.filter({ employee_id: emp.id });

          if (userRoles && userRoles.length > 0) {
            const allRoles = await entitiesAPI.Role.list();
            const assignedRoles = allRoles.filter(r => userRoles.some(ur => ur.role_id === r.id));
            const allPerms = new Set();
            assignedRoles.forEach(role => {
              (role.permissions || []).forEach(p => allPerms.add(p));
            });
            setUserPermissions([...allPerms]);
            setAssignedRoleNames(assignedRoles.map(r => r.name));
          } else {
            // Fallback al rol legacy
            setUserPermissions(getBasicPermissionsByRole(emp.role));
            setAssignedRoleNames([]);
          }
        }
      } catch (error) {
        console.error("Error loading employee:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();

    // Cerrar menú móvil al cambiar de página
    setMobileMenuOpen(false);
    setMobileOpenSubmenu(null);

    // Recargar cuando la pestaña recupera el foco (tras cambios en Roles y Permisos)
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        loadEmployee();
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [currentUser, currentPageName]);

  // Cerrar menú móvil en cualquier cambio de ruta (navegación programática)
  useEffect(() => {
    setMobileMenuOpen(false);
    setMobileOpenSubmenu(null);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  const validatePassword = (pwd) => {
    const errors = [];
    if (pwd.length < 8) errors.push("Debe tener al menos 8 caracteres.");
    if (!/[A-Z]/.test(pwd)) errors.push("Debe contener al menos una letra mayúscula.");
    if (!/[a-z]/.test(pwd)) errors.push("Debe contener al menos una letra minúscula.");
    if (!/[0-9]/.test(pwd)) errors.push("Debe contener al menos un número.");
    return errors;
  };

  const handleChangePassword = async () => {
    const errors = validatePassword(passwordData.newPassword);
    if (errors.length > 0) {
      setPasswordErrors(errors);
      return;
    }
    if (passwordData.newPassword !== passwordData.confirmPassword) {
      setPasswordErrors(["Las contraseñas no coinciden."]);
      return;
    }
    setSavingPassword(true);
    setPasswordErrors([]);
    try {
      const user = await authAPI.me();
      await authAPI.changePassword(user.email, passwordData.newPassword);
      setPasswordSuccess(true);
      setTimeout(() => {
        setShowChangePassword(false);
        setPasswordData({ newPassword: "", confirmPassword: "" });
        setPasswordSuccess(false);
      }, 2000);
    } catch (error) {
      const msg = error?.response?.data?.message
        || error?.response?.data?.detail
        || error?.message
        || "Error desconocido al cambiar la contraseña.";
      setPasswordErrors([`Error: ${msg}`]);
    } finally {
      setSavingPassword(false);
    }
  };

  const openPasswordModal = () => {
    setOpenDropdown(null);
    setPasswordData({ newPassword: "", confirmPassword: "" });
    setPasswordErrors([]);
    setPasswordSuccess(false);
    setShowPassword(false);
    setShowConfirm(false);
    setShowChangePassword(true);
  };

  const getMenuItems = () => {
    const isAdmin = hasPermission("system.admin");
    const items = [];

    // Dashboard
    if (isAdmin || hasAnyPermission(["employees.view", "attendance.view_all", "payroll.view_all"])) {
      items.push({
        name: "Dashboard",
        icon: LayoutDashboard,
        path: "HRDashboard",
        submenu: [
          { name: "Dashboard RRHH", path: "HRDashboard" },
          { name: "Dashboard Personal", path: "Dashboard" },
        ]
      });
    } else {
      items.push({ name: "Dashboard", icon: LayoutDashboard, path: "Dashboard" });
    }

    // Gestión Empleados (solo quien puede ver empleados)
    if (hasPermission("employees.view")) {
      const submenu = [{ name: "Ver Empleados", path: "EmployeeManagement" }];
      if (isAdmin || hasPermission("employees.orgchart")) submenu.push({ name: "Organigrama", path: "OrgChart" });
      if (hasPermission("employees.import")) submenu.push({ name: "Importar Empleados", path: "ImportEmployees" });
      if (hasPermission("vacations.manage")) submenu.push({ name: "Gestión Vacaciones", path: "VacationManagement" });
      if (hasPermission("vacations.approve")) submenu.push({ name: "Aprobar Vacaciones", path: "ManagerApprovals" });
      if (hasAnyPermission(["vacations.view_calendar", "vacations.manage_balances"])) submenu.push({ name: "Calendario Vacaciones", path: "VacationCalendar" });
      if (hasPermission("certificates.view_all")) submenu.push({ name: "Certificados", path: "Certificates" });
      items.push({ name: "Gestión Empleados", icon: Users, path: "EmployeeManagement", submenu });
    }

    // Contratos
    if (hasPermission("contracts.view")) {
      const contractSubmenu = [{ name: "Ver Contratos", path: "ContractManagement" }];
      if (isAdmin || hasPermission("contracts.manage_templates")) contractSubmenu.push({ name: "Plantillas Contratos", path: "ContractTemplateConfig" });
      if (isAdmin || hasPermission("contracts.manage_renewals")) contractSubmenu.push({ name: "Automatización Renovación", path: "ContractRenewalAutomation" });
      items.push({
        name: "Gestión Contratos",
        icon: FileText,
        path: "ContractManagement",
        submenu: contractSubmenu,
      });
    }

    // Asistencia - incluye aprobadores de edición aunque no tengan permisos de vista generales
    if (hasAnyPermission(["attendance.view_all", "attendance.view_department", "attendance.manage", "attendance.approve_edits", "schedules.view"])) {
      const submenu = [];
      if (hasAnyPermission(["attendance.view_all", "attendance.view_department", "attendance.manage", "attendance.approve_edits"])) submenu.push({ name: "Ver Asistencia", path: "AttendanceManagement" });
      if (hasAnyPermission(["reports.attendance", "attendance.view_reports", "attendance.export", "reports.view", "attendance.view_all"])) submenu.push({ name: "Reportes Asistencia", path: "AttendanceReports" });
      if (hasPermission("schedules.view")) submenu.push({ name: "Gestión Horarios", path: "ScheduleManagement" });
      if (isAdmin || hasPermission("attendance.devices")) {
        submenu.push({ name: "Base de Datos Externa", path: "DatabaseConfig" });
        submenu.push({ name: "Control de Acceso Físico", path: "AccessDeviceConfig" });
      }
      items.push({ name: "Gestión Asistencia", icon: CheckSquare, path: "AttendanceManagement", submenu });
    }

    // Planillas — visible si tiene cualquier permiso de planillas O centros de costo O contabilidad
    if (hasAnyPermission([
      "payroll.view_all", "payroll.process", "payroll.approve", "payroll.view_department", "payroll.create", "payroll.calculate", "payroll.view_own",
      "cost_centers.view"
    ])) {
      const submenu = [];
      if (hasAnyPermission(["payroll.view_all", "payroll.process", "payroll.approve", "payroll.view_department", "payroll.create", "payroll.calculate"])) {
        submenu.push({ name: "Generar Planillas", path: "PayrollManagement" });
      }
      if (isAdmin || hasPermission("payroll.manage_concepts")) {
        submenu.push({ name: "Conceptos de Planilla", path: "PayrollConcepts" });
      }
      if (hasAnyPermission(["payroll.view_all", "payroll.process", "payroll.approve", "payroll.view_department", "payroll.create", "payroll.calculate"])) {
        submenu.push({ name: "Consulta de Planillas", path: "ConsultaPlanillas" });
      }
      if (hasAnyPermission(["payroll.view_all", "payroll.process", "payroll.approve", "payroll.view_department", "payroll.create"])) {
        submenu.push({ name: "Préstamos", path: "LoanManagement" });
      }
      if (hasPermission("cost_centers.view")) {
        submenu.push({ name: "Centros de Costo", path: "CostCenterManagement" });
        submenu.push({ name: "Consulta Valorizada", path: "CostCenterValuation" });
      }
      if (hasAnyPermission(["payroll.view_all", "payroll.process", "payroll.approve", "payroll.view_department", "payroll.create", "payroll.calculate"])) {
        submenu.push({ name: "Asientos Contables", path: "AsientosContables" });
        submenu.push({ name: "Cuentas Contables", path: "CuentasContables" });
        submenu.push({ name: "Exportar SUNAT (T-Registro / PLAME)", path: "SunatExport" });
      }
      if (hasAnyPermission(["payroll.view_all", "payroll.create", "payroll.calculate"])) {
        submenu.push({ name: "Beneficios Sociales", path: "BeneficiosSociales" });
        submenu.push({ name: "Historial Remunerativo", path: "HistorialRemunerativo" });
      }
      // Solo mostrar el menú si hay al menos un submenú disponible
      if (submenu.length > 0) {
        const firstPath = submenu[0].path;
        items.push({ name: "Gestión Planillas", icon: FileText, path: firstPath, submenu });
      }
    }

    // Reportes
    if (hasPermission("reports.view")) {
      items.push({
        name: "Reportes",
        icon: FileText,
        path: "Reports",
        submenu: [
          { name: "Reportes Avanzados", path: "Reports" },
        ]
      });
    }

    // Feriados
    if (hasAnyPermission(["holidays.view", "settings.holidays"])) {
      items.push({ name: "Gestión Feriados", icon: CalendarDays, path: "HolidayManagement" });
    }

    // Roles y Permisos
    if (hasAnyPermission(["roles.view", "roles.manage"])) {
      items.push({ name: "Roles y Permisos", icon: Shield, path: "RoleManagement" });
    }

    // Secciones propias del empleado (solo si NO tiene acceso global)
    if (hasPermission("payroll.view_own") && !hasAnyPermission(["payroll.view_all", "payroll.process", "payroll.view_department"])) {
      items.push({ name: "Mis Boletas", icon: FileText, path: "Payslips" });
    }
    if (hasPermission("vacations.view_own") && !hasAnyPermission(["vacations.view_all", "vacations.manage", "vacations.approve"])) {
      items.push({ name: "Mis Vacaciones", icon: Calendar, path: "VacationRequest" });
    }
    if (hasPermission("attendance.view_own") && !hasAnyPermission(["attendance.view_all", "attendance.view_department"])) {
      items.push({ name: "Mi Asistencia", icon: Clock, path: "Attendance" });
    }
    if (hasPermission("certificates.view_own") && !hasPermission("certificates.view_all")) {
      items.push({ name: "Certificados", icon: Award, path: "Certificates" });
    }

    // Mi Perfil siempre
    items.push({ name: "Mi Perfil", icon: User, path: "MyProfile" });

    return items;
  };

  const getRoleBadge = (role) => {
    const badges = {
      "super_admin": { text: "Super Admin", color: "bg-gradient-to-r from-purple-500 to-pink-500 text-white border-purple-400" },
      "admin": { text: "Administrador", color: "bg-purple-100 text-purple-700 border-purple-300" },
      "hr_readonly": { text: "RRHH", color: "bg-cyan-100 text-cyan-700 border-cyan-300" },
      "manager": { text: "Manager", color: "bg-blue-100 text-blue-700 border-blue-300" },
      "empleado": { text: "Empleado", color: "bg-green-100 text-green-700 border-green-300" },
    };
    return badges[role] || badges["empleado"];
  };

  const menuItems = getMenuItems();
  const legacyBadge = getRoleBadge(employee?.role);
  const roleBadge = assignedRoleNames.length > 0
    ? { text: assignedRoleNames.join(", "), color: legacyBadge.color }
    : legacyBadge;

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // Render without layout for specific pages
  if (noLayoutPages.includes(currentPageName)) {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Top Navigation Bar */}
      <header className="fixed top-0 left-0 right-0 bg-white border-b border-slate-200 z-40 shadow-sm">
        <div className="px-4 sm:px-6 py-3 sm:py-4">
          <div className="flex items-center justify-between">
            {/* Logo and Title */}
            <div className="flex items-center gap-4">
              <h1 className="text-xl font-bold text-slate-900">
                Portal RRHH
              </h1>
            </div>

            {/* Desktop Navigation */}
            {employee && (
              <nav className="hidden lg:flex items-center gap-1">
                {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path ||
                  (item.submenu && item.submenu.some(sub => sub.path === currentPageName));

                if (item.submenu) {
                  const isOpen = openDropdown === item.path;
                  return (
                    <div key={item.path} className="relative">
                      <button
                        onClick={() => setOpenDropdown(isOpen ? null : item.path)}
                        className={`
                          flex items-center gap-2 px-4 py-2 rounded-lg
                          transition-all duration-200 text-sm
                          ${isActive
                            ? 'bg-indigo-50 text-indigo-600 font-semibold'
                            : 'text-slate-700 hover:bg-slate-50'
                          }
                        `}
                      >
                        <Icon className="w-4 h-4" />
                        <span>{item.name}</span>
                        <ChevronDown className={`w-3 h-3 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isOpen && (
                        <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                          <div className="py-2">
                            {item.submenu.map((subItem) => (
                              <Link
                                key={subItem.path}
                                to={createPageUrl(subItem.path)}
                                onClick={() => setOpenDropdown(null)}
                                className={`
                                  flex items-center px-4 py-2 text-sm
                                  transition-colors duration-150
                                  ${currentPageName === subItem.path
                                    ? 'bg-indigo-50 text-indigo-600 font-semibold'
                                    : 'text-slate-700 hover:bg-slate-50'
                                  }
                                `}
                              >
                                {subItem.name}
                              </Link>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <Link
                    key={item.path}
                    to={createPageUrl(item.path)}
                    className={`
                      flex items-center gap-2 px-4 py-2 rounded-lg
                      transition-all duration-200 text-sm
                      ${isActive
                        ? 'bg-indigo-50 text-indigo-600 font-semibold'
                        : 'text-slate-700 hover:bg-slate-50'
                      }
                    `}
                  >
                    <Icon className="w-4 h-4" />
                    <span>{item.name}</span>
                  </Link>
                );
                })}
              </nav>
            )}

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {currentUser && (
                <NotificationCenter userEmail={currentUser.email} />
              )}
              {employee && (
                <div className="hidden md:block relative">
                  <button
                    onClick={() => setOpenDropdown(openDropdown === 'profile' ? null : 'profile')}
                    className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all"
                  >
                    <p className="text-sm text-slate-600">
                      {employee.first_name} {employee.last_name}
                    </p>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${roleBadge.color}`}>
                      <Shield className="w-3 h-3" />
                      {roleBadge.text}
                    </div>
                    <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${openDropdown === 'profile' ? 'rotate-180' : ''}`} />
                  </button>
                  {openDropdown === 'profile' && (
                    <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 z-50">
                      <div className="py-2">
                      <Link
                        to={createPageUrl("MyProfile")}
                        onClick={() => setOpenDropdown(null)}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Mi Perfil
                      </Link>
                      <button
                        onClick={openPasswordModal}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <KeyRound className="w-4 h-4" />
                        Cambiar Contraseña
                      </button>
                      {hasPermission("system.settings") && (
                        <>
                          <Link
                            to={createPageUrl("CompanySettings")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Información Empresa
                          </Link>
                          <Link
                            to={createPageUrl("PayslipTemplateConfig")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Plantillas Boletas
                          </Link>
                          <Link
                            to={createPageUrl("MasterDataManagement")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Datos Maestros
                          </Link>
                          <Link
                            to={createPageUrl("UserManagement")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Users className="w-4 h-4" />
                            Usuarios Corporativos
                          </Link>
                          <Link
                            to={createPageUrl("SystemRoleInitializer")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Inicializar Roles Sistema
                          </Link>
                          <Link
                            to={createPageUrl("DataExport")}
                            onClick={() => setOpenDropdown(null)}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Exportar Datos
                          </Link>
                        </>
                      )}
                      <button
                        onClick={() => {
                          setOpenDropdown(null);
                          handleLogout();
                        }}
                        className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                      >
                        <LogOut className="w-4 h-4" />
                        Cerrar Sesión
                      </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Mobile menu button */}
              <Button
                variant="outline"
                size="icon"
                onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
                className="lg:hidden"
              >
                {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
              </Button>
            </div>
          </div>
        </div>
      </header>

      {/* Mobile overlay — z-45 para quedar sobre el header (z-40) pero detrás del menú (z-50) */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 bg-black/50 lg:hidden"
          style={{ zIndex: 45 }}
          onClick={() => {
            setMobileMenuOpen(false);
            setMobileOpenSubmenu(null);
          }}
        />
      )}

      {/* Mobile Menu Panel — z-50 para estar sobre el overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed left-0 right-0 bottom-0 bg-white lg:hidden shadow-2xl overflow-y-auto"
          style={{ top: 73, zIndex: 50 }}
        >
          <nav className="p-4 pb-8">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path ||
                  (item.submenu && item.submenu.some(sub => sub.path === currentPageName));
                const isSubmenuOpen = mobileOpenSubmenu === item.path;

                if (item.submenu) {
                  return (
                    <li key={item.path}>
                      <button
                        type="button"
                        onClick={() => setMobileOpenSubmenu(isSubmenuOpen ? null : item.path)}
                        className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 touch-manipulation ${
                          isActive ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-700'
                        }`}
                      >
                        <Icon className="w-5 h-5 shrink-0" />
                        <span className="flex-1 text-left text-base">{item.name}</span>
                        <ChevronDown className={`w-4 h-4 shrink-0 transition-transform duration-200 ${isSubmenuOpen ? 'rotate-180' : ''}`} />
                      </button>
                      {isSubmenuOpen && (
                        <ul className="ml-4 mt-1 space-y-1 border-l-2 border-indigo-100 pl-3">
                          {item.submenu.map((subItem) => (
                            <li key={subItem.path}>
                              <button
                                type="button"
                                onClick={() => {
                                  navigate(createPageUrl(subItem.path));
                                }}
                                className={`w-full text-left flex items-center gap-2 px-3 py-3 rounded-lg text-base transition-all duration-200 touch-manipulation ${
                                  currentPageName === subItem.path
                                    ? 'bg-indigo-50 text-indigo-600 font-semibold'
                                    : 'text-slate-600'
                                }`}
                              >
                                {subItem.name}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  );
                }

                return (
                  <li key={item.path}>
                    <button
                      type="button"
                      onClick={() => navigate(createPageUrl(item.path))}
                      className={`w-full text-left flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 touch-manipulation ${
                        isActive ? 'bg-indigo-50 text-indigo-600 font-semibold' : 'text-slate-700'
                      }`}
                    >
                      <Icon className="w-5 h-5" />
                      <span className="text-base">{item.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
            <div className="mt-4 pt-4 border-t border-slate-200">
              <Button
                variant="outline"
                className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleLogout}
              >
                <LogOut className="w-5 h-5 mr-3" />
                Cerrar Sesión
              </Button>
            </div>
          </nav>
        </div>
      )}

      {/* Overlay para cerrar dropdowns de escritorio */}
      {openDropdown && (
        <div
          className="fixed inset-0 z-30"
          onClick={() => setOpenDropdown(null)}
        />
      )}

      {/* Main content */}
      <main className="pt-[73px]">
        {children}
      </main>

      {/* Change Password Modal */}
      {showChangePassword && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-6"
          onClick={() => setShowChangePassword(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-md p-8"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-6">
              <div className="p-2 bg-indigo-100 rounded-lg">
                <KeyRound className="w-5 h-5 text-indigo-600" />
              </div>
              <div>
                <h2 className="text-xl font-bold text-slate-900">Cambiar Contraseña</h2>
                <p className="text-sm text-slate-500">{currentUser?.email}</p>
              </div>
            </div>

            {/* Validation errors - centered, prominent */}
            {passwordErrors.length > 0 && (
              <div className="mb-5 bg-red-50 border border-red-200 rounded-xl p-4">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <p className="text-sm font-semibold text-red-700 mb-1">La contraseña no cumple los requisitos:</p>
                    <ul className="space-y-0.5">
                      {passwordErrors.map((err, i) => (
                        <li key={i} className="text-sm text-red-600">• {err}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {passwordSuccess && (
              <div className="mb-5 bg-green-50 border border-green-200 rounded-xl p-4 text-center">
                <p className="text-green-700 font-semibold">✓ Contraseña actualizada correctamente</p>
              </div>
            )}

            <div className="space-y-4">
              <div>
                <Label className="text-sm font-medium text-slate-700">Nueva Contraseña *</Label>
                <div className="relative mt-1.5">
                  <Input
                    type={showPassword ? "text" : "password"}
                    placeholder="Ingrese la nueva contraseña"
                    value={passwordData.newPassword}
                    onChange={(e) => {
                      setPasswordData({ ...passwordData, newPassword: e.target.value });
                      setPasswordErrors([]);
                    }}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div>
                <Label className="text-sm font-medium text-slate-700">Confirmar Contraseña *</Label>
                <div className="relative mt-1.5">
                  <Input
                    type={showConfirm ? "text" : "password"}
                    placeholder="Repita la nueva contraseña"
                    value={passwordData.confirmPassword}
                    onChange={(e) => {
                      setPasswordData({ ...passwordData, confirmPassword: e.target.value });
                      setPasswordErrors([]);
                    }}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowConfirm(!showConfirm)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                  >
                    {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="bg-slate-50 rounded-lg p-3 text-xs text-slate-500 space-y-1">
                <p className="font-semibold text-slate-600 mb-1">Requisitos de contraseña:</p>
                <p className={/[A-Z]/.test(passwordData.newPassword) ? "text-green-600" : ""}>• Al menos una letra mayúscula</p>
                <p className={/[a-z]/.test(passwordData.newPassword) ? "text-green-600" : ""}>• Al menos una letra minúscula</p>
                <p className={/[0-9]/.test(passwordData.newPassword) ? "text-green-600" : ""}>• Al menos un número</p>
                <p className={passwordData.newPassword.length >= 8 ? "text-green-600" : ""}>• Mínimo 8 caracteres</p>
              </div>

              <div className="flex gap-3 pt-2">
                <button
                  onClick={() => setShowChangePassword(false)}
                  className="flex-1 px-4 py-2.5 border border-slate-200 rounded-lg text-sm font-medium text-slate-700 hover:bg-slate-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  onClick={handleChangePassword}
                  disabled={savingPassword || passwordSuccess}
                  className="flex-1 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 rounded-lg text-sm font-medium text-white transition-colors"
                >
                  {savingPassword ? "Guardando..." : "Cambiar Contraseña"}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
