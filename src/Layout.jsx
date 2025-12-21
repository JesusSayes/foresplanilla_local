import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "./utils";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { 
  LayoutDashboard, FileText, Calendar, Clock, 
  User, Award, LogOut, Menu, X, Shield, CheckSquare, CalendarDays
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
      { name: "Importar Empleados", icon: Shield, path: "ImportEmployees" },
      { name: "Gestión Asistencia", icon: CheckSquare, path: "AttendanceManagement" },
      { name: "Reportes Asistencia", icon: Clock, path: "AttendanceReports" },
      { name: "Gestión Feriados", icon: CalendarDays, path: "HolidayManagement" },
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
      {/* Mobile menu button */}
      <div className="lg:hidden fixed top-4 left-4 z-50">
        <Button
          variant="outline"
          size="icon"
          onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          className="bg-white shadow-lg"
        >
          {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
        </Button>
      </div>

      {/* Sidebar */}
      <aside className={`
        fixed top-0 left-0 h-full w-72 bg-white border-r border-slate-200 z-40
        transform transition-transform duration-300 ease-in-out
        ${mobileMenuOpen ? 'translate-x-0' : '-translate-x-full'}
        lg:translate-x-0
      `}>
        <div className="flex flex-col h-full">
          {/* Header */}
          <div className="p-6 border-b border-slate-200">
            <h1 className="text-2xl font-bold text-slate-900 mb-2">
              Portal RRHH
            </h1>
            {employee && (
              <div className="space-y-2">
                <p className="text-sm text-slate-600">
                  {employee.first_name} {employee.last_name}
                </p>
                <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-xs font-semibold ${roleBadge.color}`}>
                  <Shield className="w-3 h-3" />
                  {roleBadge.text}
                </div>
              </div>
            )}
          </div>

          {/* Navigation */}
          <nav className="flex-1 overflow-y-auto p-4">
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
          </nav>

          {/* Logout */}
          <div className="p-4 border-t border-slate-200">
            <Button
              variant="outline"
              className="w-full justify-start text-red-600 hover:bg-red-50 hover:text-red-700"
              onClick={handleLogout}
            >
              <LogOut className="w-5 h-5 mr-3" />
              Cerrar Sesión
            </Button>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <main className="lg:ml-72">
        {children}
      </main>

      {/* Mobile overlay */}
      {mobileMenuOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-30 lg:hidden"
          onClick={() => setMobileMenuOpen(false)}
        />
      )}
    </div>
  );
}