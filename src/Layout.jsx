import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { 
  LayoutDashboard, FileText, Calendar, Clock, 
  User, Award, LogOut, Menu, X, Shield, CheckSquare, CalendarDays, Users, ChevronDown
} from "lucide-react";
import NotificationCenter from "./components/notifications/NotificationCenter";

export default function Layout({ children, currentPageName }) {
  const [employee, setEmployee] = useState(null);
  const [currentUser, setCurrentUser] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Pages that don't need sidebar/layout
  const noLayoutPages = ["Home"];

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const isAuth = await base44.auth.isAuthenticated();
        if (!isAuth) {
          // Si no está autenticado y no está en Home, redirigir a Home
          if (currentPageName !== "Home") {
            window.location.href = createPageUrl("Home");
          }
          setLoading(false);
          return;
        }

        const user = await base44.auth.me();
        setCurrentUser(user);
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });

        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading employee:", error);
        // En caso de error de autenticación, redirigir a Home
        if (currentPageName !== "Home") {
          window.location.href = createPageUrl("Home");
        }
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();
  }, [currentPageName]);

  const handleLogout = () => {
    base44.auth.logout(createPageUrl("Home"));
  };

  const getMenuItems = () => {
    const role = employee?.role || "empleado";

    const employeeMenu = [
      { name: "Dashboard", icon: LayoutDashboard, path: "Dashboard" },
      { name: "Mis Boletas", icon: FileText, path: "Payslips" },
      { name: "Mis Vacaciones", icon: Calendar, path: "VacationRequest" },
      { name: "Mi Asistencia", icon: Clock, path: "Attendance" },
      { name: "Certificados", icon: Award, path: "Certificates" },
      { name: "Mi Perfil", icon: User, path: "MyProfile" },
    ];

    const managerMenu = [
      ...employeeMenu,
      { name: "Reportes Asistencia", icon: Clock, path: "AttendanceReports" },
      { name: "Aprobar Vacaciones", icon: CheckSquare, path: "ManagerApprovals" },
      { name: "Calendario Equipo", icon: CalendarDays, path: "VacationCalendar" },
    ];

    const adminMenu = [
      { 
        name: "Dashboard", 
        icon: LayoutDashboard, 
        path: "HRDashboard",
        submenu: [
          { name: "Dashboard RRHH", path: "HRDashboard" },
          { name: "Dashboard Personal", path: "Dashboard" },
        ]
      },
      { 
        name: "Gestión Empleados", 
        icon: Users, 
        path: "EmployeeManagement",
        submenu: [
          { name: "Ver Empleados", path: "EmployeeManagement" },
          { name: "Organigrama", path: "OrgChart" },
          { name: "Importar Empleados", path: "ImportEmployees" },
          { name: "Gestión Vacaciones", path: "VacationManagement" },
          { name: "Aprobar Vacaciones", path: "ManagerApprovals" },
          { name: "Calendario Vacaciones", path: "VacationCalendar" },
          { name: "Boletas", path: "Payslips" },
          { name: "Vacaciones", path: "VacationRequest" },
          { name: "Certificados", path: "Certificates" },
        ]
      },
      { name: "Gestión Contratos", icon: FileText, path: "ContractManagement" },
      { 
        name: "Gestión Asistencia", 
        icon: CheckSquare, 
        path: "AttendanceManagement",
        submenu: [
          { name: "Ver Asistencia", path: "AttendanceManagement" },
          { name: "Reportes Asistencia", path: "AttendanceReports" },
          { name: "Gestión Horarios", path: "ScheduleManagement" },
          { name: "Base de Datos Externa", path: "DatabaseConfig" },
          { name: "Control de Acceso Físico", path: "AccessDeviceConfig" },
          { name: "Mi Asistencia", path: "Attendance" },
        ]
      },
      { 
        name: "Gestión Planillas", 
        icon: FileText, 
        path: "PayrollManagement",
        submenu: [
          { name: "Generar Planillas", path: "PayrollManagement" },
          { name: "Conceptos de Planilla", path: "PayrollConcepts" },
        ]
      },
      { name: "Gestión Feriados", icon: CalendarDays, path: "HolidayManagement" },
      { name: "Roles y Permisos", icon: Shield, path: "RoleManagement" },
      ];

      const superAdminMenu = [
      ...adminMenu,
      ];

    if (role === "super_admin") return superAdminMenu;
    if (role === "admin") return adminMenu;
    if (role === "manager") return managerMenu;
    if (role === "hr_readonly") return adminMenu; // RRHH Solo lectura ve todo pero sin editar
    return employeeMenu;
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
  const roleBadge = getRoleBadge(employee?.role);

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
        <div className="px-6 py-4">
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
                  return (
                    <div key={item.path} className="relative group">
                      <button
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
                        <ChevronDown className="w-3 h-3" />
                      </button>
                      <div className="absolute top-full left-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                        <div className="py-2">
                          {item.submenu.map((subItem) => (
                            <Link
                              key={subItem.path}
                              to={createPageUrl(subItem.path)}
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
                <div className="hidden md:block relative group">
                  <button className="flex items-center gap-3 px-4 py-2 rounded-lg hover:bg-slate-50 transition-all">
                    <p className="text-sm text-slate-600">
                      {employee.first_name} {employee.last_name}
                    </p>
                    <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${roleBadge.color}`}>
                      <Shield className="w-3 h-3" />
                      {roleBadge.text}
                    </div>
                    <ChevronDown className="w-4 h-4 text-slate-400" />
                  </button>
                  <div className="absolute top-full right-0 mt-1 w-56 bg-white rounded-lg shadow-lg border border-slate-200 opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                    <div className="py-2">
                      <Link
                        to={createPageUrl("MyProfile")}
                        className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                      >
                        <User className="w-4 h-4" />
                        Mi Perfil
                      </Link>
                      {employee?.role === "admin" && (
                        <>
                          <Link
                            to={createPageUrl("CompanySettings")}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Información Empresa
                          </Link>
                          <Link
                            to={createPageUrl("PayslipTemplateConfig")}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Plantillas Boletas
                          </Link>
                          <Link
                            to={createPageUrl("MasterDataManagement")}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Datos Maestros
                          </Link>
                          <Link
                            to={createPageUrl("UserManagement")}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Users className="w-4 h-4" />
                            Usuarios Corporativos
                          </Link>
                          <Link
                            to={createPageUrl("SystemRoleInitializer")}
                            className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 transition-colors"
                          >
                            <Shield className="w-4 h-4" />
                            Inicializar Roles Sistema
                          </Link>
                          </>
                          )}
                          <button
                          onClick={handleLogout}
                          className="w-full flex items-center gap-3 px-4 py-2 text-sm text-red-600 hover:bg-red-50 transition-colors"
                          >
                          <LogOut className="w-4 h-4" />
                          Cerrar Sesión
                          </button>
                    </div>
                  </div>
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

      {/* Mobile Menu Dropdown */}
      {mobileMenuOpen && (
        <div className="fixed top-[73px] left-0 right-0 bg-white border-b border-slate-200 z-30 lg:hidden shadow-lg">
          <nav className="max-h-[calc(100vh-73px)] overflow-y-auto p-4">
            <ul className="space-y-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path;
                
                return (
                  <li key={item.path}>
                    <Link
                      to={createPageUrl(item.path)}
                      onClick={() => setMobileMenuOpen(false)}
                      className={`
                        flex items-center gap-3 px-4 py-3 rounded-lg
                        transition-all duration-200
                        ${isActive 
                          ? 'bg-indigo-50 text-indigo-600 font-semibold' 
                          : 'text-slate-700 hover:bg-slate-50'
                        }
                      `}
                    >
                      <Icon className="w-5 h-5" />
                      <span>{item.name}</span>
                    </Link>
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

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-20 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}

      {/* Main content */}
      <main className="pt-[73px]">
        {children}
      </main>
    </div>
  );
}