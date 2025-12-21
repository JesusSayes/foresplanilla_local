import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar, User, Filter, ChevronLeft, ChevronRight } from "lucide-react";
import { 
  format, 
  startOfMonth, 
  endOfMonth, 
  eachDayOfInterval, 
  isSameDay,
  addMonths,
  subMonths,
  startOfWeek,
  endOfWeek
} from "date-fns";
import { es } from "date-fns/locale";
import PermissionGuard from "../components/PermissionGuard";

export default function VacationCalendar() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [filterDepartment, setFilterDepartment] = useState("all");
  const [filterEmployee, setFilterEmployee] = useState("all");

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.list();
    },
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["calendarVacationRequests", currentMonth],
    queryFn: async () => {
      const requests = await base44.entities.VacationRequest.filter(
        { status: "Aprobada" },
        "-start_date"
      );
      
      return requests;
    },
  });

  const departments = [...new Set(allEmployees.map(e => e.department_name).filter(Boolean))];

  const filteredRequests = vacationRequests.filter(request => {
    const emp = allEmployees.find(e => e.id === request.employee_id);
    if (!emp) return false;

    const matchesDept = filterDepartment === "all" || emp.department_name === filterDepartment;
    const matchesEmp = filterEmployee === "all" || request.employee_id === filterEmployee;
    
    return matchesDept && matchesEmp;
  });

  const getEmployeeName = (employeeId) => {
    const emp = allEmployees.find(e => e.id === employeeId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Desconocido";
  };

  const getEmployeeDepartment = (employeeId) => {
    const emp = allEmployees.find(e => e.id === employeeId);
    return emp?.department_name || "N/A";
  };

  const isDateInVacation = (date, request) => {
    const start = new Date(request.start_date);
    const end = new Date(request.end_date);
    return date >= start && date <= end;
  };

  const getVacationsForDate = (date) => {
    return filteredRequests.filter(request => isDateInVacation(date, request));
  };

  const monthStart = startOfMonth(currentMonth);
  const monthEnd = endOfMonth(currentMonth);
  const calendarStart = startOfWeek(monthStart, { weekStartsOn: 1 });
  const calendarEnd = endOfWeek(monthEnd, { weekStartsOn: 1 });
  const calendarDays = eachDayOfInterval({ start: calendarStart, end: calendarEnd });

  const weekDays = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

  const employeeColors = {};
  const colors = [
    "bg-blue-100 text-blue-700 border-blue-300",
    "bg-green-100 text-green-700 border-green-300",
    "bg-purple-100 text-purple-700 border-purple-300",
    "bg-orange-100 text-orange-700 border-orange-300",
    "bg-pink-100 text-pink-700 border-pink-300",
    "bg-indigo-100 text-indigo-700 border-indigo-300",
  ];

  filteredRequests.forEach((request, index) => {
    if (!employeeColors[request.employee_id]) {
      employeeColors[request.employee_id] = colors[Object.keys(employeeColors).length % colors.length];
    }
  });

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredRole="manager">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Calendario de Vacaciones
          </h1>
          <p className="text-slate-600 text-lg">
            Visualiza las vacaciones aprobadas del equipo
          </p>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-slate-500" />
                <span className="text-sm font-semibold text-slate-700">Filtros:</span>
              </div>
              
              <Select value={filterDepartment} onValueChange={setFilterDepartment}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Departamento" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los departamentos</SelectItem>
                  {departments.map(dept => (
                    <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={filterEmployee} onValueChange={setFilterEmployee}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Empleado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los empleados</SelectItem>
                  {allEmployees
                    .filter(e => filterDepartment === "all" || e.department_name === filterDepartment)
                    .map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Calendar */}
          <div className="lg:col-span-3">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(subMonths(currentMonth, 1))}
                  >
                    <ChevronLeft className="w-4 h-4" />
                  </Button>
                  
                  <CardTitle className="text-2xl font-bold text-center">
                    {format(currentMonth, "MMMM yyyy", { locale: es })}
                  </CardTitle>
                  
                  <Button
                    variant="outline"
                    size="icon"
                    onClick={() => setCurrentMonth(addMonths(currentMonth, 1))}
                  >
                    <ChevronRight className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-7 gap-2">
                  {/* Week day headers */}
                  {weekDays.map(day => (
                    <div key={day} className="text-center font-semibold text-slate-600 text-sm py-2">
                      {day}
                    </div>
                  ))}

                  {/* Calendar days */}
                  {calendarDays.map(day => {
                    const isCurrentMonth = day.getMonth() === currentMonth.getMonth();
                    const isToday = isSameDay(day, new Date());
                    const vacations = getVacationsForDate(day);

                    return (
                      <div
                        key={day.toISOString()}
                        className={`
                          min-h-[100px] p-2 border rounded-lg
                          ${!isCurrentMonth ? 'bg-slate-50 opacity-40' : 'bg-white'}
                          ${isToday ? 'border-indigo-600 border-2' : 'border-slate-200'}
                          hover:shadow-md transition-all
                        `}
                      >
                        <div className={`
                          text-sm font-semibold mb-1
                          ${isToday ? 'text-indigo-600' : 'text-slate-700'}
                        `}>
                          {format(day, "d")}
                        </div>
                        
                        <div className="space-y-1">
                          {vacations.slice(0, 2).map(vacation => (
                            <div
                              key={vacation.id}
                              className={`
                                text-xs px-2 py-1 rounded border truncate
                                ${employeeColors[vacation.employee_id]}
                              `}
                              title={`${getEmployeeName(vacation.employee_id)} - ${vacation.request_type}`}
                            >
                              {getEmployeeName(vacation.employee_id).split(' ')[0]}
                            </div>
                          ))}
                          {vacations.length > 2 && (
                            <div className="text-xs text-slate-500 px-2">
                              +{vacations.length - 2} más
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Legend & Upcoming */}
          <div className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg font-bold">Próximas Vacaciones</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-4">
                  {filteredRequests
                    .filter(r => new Date(r.start_date) >= new Date())
                    .sort((a, b) => new Date(a.start_date) - new Date(b.start_date))
                    .slice(0, 5)
                    .map(request => (
                      <div key={request.id} className="p-3 border border-slate-200 rounded-lg">
                        <div className="flex items-start gap-2 mb-2">
                          <User className="w-4 h-4 text-slate-500 mt-0.5" />
                          <div className="flex-1">
                            <h4 className="font-semibold text-slate-900 text-sm">
                              {getEmployeeName(request.employee_id)}
                            </h4>
                            <p className="text-xs text-slate-600">
                              {getEmployeeDepartment(request.employee_id)}
                            </p>
                          </div>
                        </div>
                        <div className="text-xs text-slate-600">
                          <p>
                            <strong>Desde:</strong> {format(new Date(request.start_date), "dd MMM", { locale: es })}
                          </p>
                          <p>
                            <strong>Hasta:</strong> {format(new Date(request.end_date), "dd MMM", { locale: es })}
                          </p>
                          <p>
                            <strong>Duración:</strong> {request.total_days} días
                          </p>
                        </div>
                      </div>
                    ))}
                  
                  {filteredRequests.filter(r => new Date(r.start_date) >= new Date()).length === 0 && (
                    <p className="text-slate-500 text-sm text-center py-4">
                      No hay vacaciones próximas
                    </p>
                  )}
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg font-bold">Leyenda</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-2 text-sm">
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 border-2 border-indigo-600 rounded"></div>
                    <span className="text-slate-700">Día actual</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="w-4 h-4 bg-blue-100 border border-blue-300 rounded"></div>
                    <span className="text-slate-700">Vacación aprobada</span>
                  </div>
                  <p className="text-xs text-slate-500 mt-4">
                    Cada empleado tiene un color asignado en el calendario para facilitar la visualización.
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
    </PermissionGuard>
  );
}