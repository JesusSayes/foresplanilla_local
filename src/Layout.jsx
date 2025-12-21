import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, FileText, Calendar, Clock, 
  User, Award, LogOut, Menu, X, Shield, CheckSquare, CalendarDays, Users
} from "lucide-react";

export default function Layout({ children, currentPageName }) {
  const [employee, setEmployee] = useState(null);
  const [loading, setLoading] = useState(true);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Pages that don't need sidebar/layout
  const noLayoutPages = ["Home"];

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const user = await base44.auth.me();
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading employee:", error);
      } finally {
        setLoading(false);
      }
    };

    loadEmployee();
  }, []);

  const handleLogout = () => {
    base44.auth.logout();
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
      { name: "Dashboard", icon: LayoutDashboard, path: "Dashboard" },
      { name: "Gestión Empleados", icon: Users, path: "EmployeeManagement" },
      { name: "Datos Maestros", icon: Shield, path: "MasterDataManagement" },
      { name: "Gestión Asistencia", icon: CheckSquare, path: "AttendanceManagement" },
      { name: "Gestión Horarios", icon: Clock, path: "ScheduleManagement" },
      { name: "Reportes Asistencia", icon: Clock, path: "AttendanceReports" },
      { name: "Gestión Feriados", icon: CalendarDays, path: "HolidayManagement" },
      { name: "Roles y Permisos", icon: Shield, path: "RoleManagement" },
      { name: "Aprobar Vacaciones", icon: CheckSquare, path: "ManagerApprovals" },
      { name: "Calendario Vacaciones", icon: CalendarDays, path: "VacationCalendar" },
      { name: "Boletas", icon: FileText, path: "Payslips" },
      { name: "Vacaciones", icon: Calendar, path: "VacationRequest" },
      { name: "Asistencia", icon: Clock, path: "Attendance" },
      { name: "Certificados", icon: Award, path: "Certificates" },
      { name: "Perfil", icon: User, path: "MyProfile" },
    ];

    if (role === "admin") return adminMenu;
    if (role === "manager") return managerMenu;
    return employeeMenu;
  };

  const getRoleBadge = (role) => {
    const badges = {
      "admin": { text: "Administrador", color: "bg-purple-100 text-purple-700 border-purple-300" },
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
            <nav className="hidden lg:flex items-center gap-1">
              {menuItems.map((item) => {
                const Icon = item.icon;
                const isActive = currentPageName === item.path;
                
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

            {/* Right Side Actions */}
            <div className="flex items-center gap-3">
              {employee && (
                <div className="hidden md:flex items-center gap-3 pr-3 border-r border-slate-200">
                  <p className="text-sm text-slate-600">
                    {employee.first_name} {employee.last_name}
                  </p>
                  <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${roleBadge.color}`}>
                    <Shield className="w-3 h-3" />
                    {roleBadge.text}
                  </div>
                </div>
              )}

              <Button
                variant="outline"
                size="sm"
                className="hidden lg:flex text-red-600 hover:bg-red-50 hover:text-red-700"
                onClick={handleLogout}
              >
                <LogOut className="w-4 h-4 mr-2" />
                Cerrar Sesión
              </Button>

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