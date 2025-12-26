import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Calendar } from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths } from "date-fns";
import { es } from "date-fns/locale";

export default function ScheduleCalendarView() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedEmployee, setSelectedEmployee] = useState("all");

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const { data: assignments = [] } = useQuery({
    queryKey: ["scheduleAssignments"],
    queryFn: async () => {
      return await base44.entities.ScheduleAssignment.filter({ is_active: true });
    },
  });

  const { data: templates = [] } = useQuery({
    queryKey: ["scheduleTemplates"],
    queryFn: async () => {
      return await base44.entities.WorkScheduleTemplate.list();
    },
  });

  const monthStart = startOfMonth(currentDate);
  const monthEnd = endOfMonth(currentDate);
  const days = eachDayOfInterval({ start: monthStart, end: monthEnd });

  const getEmployeeScheduleForDay = (employeeId, date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    const assignment = assignments.find(a => 
      a.employee_id === employeeId &&
      a.valid_from <= dateStr &&
      (!a.valid_until || a.valid_until >= dateStr)
    );

    if (!assignment) return null;

    const template = templates.find(t => t.id === assignment.template_id);
    if (!template) return null;

    const dayOfWeek = format(date, "EEEE", { locale: es }).toLowerCase();
    const dayMap = {
      "lunes": "monday",
      "martes": "tuesday",
      "miércoles": "wednesday",
      "jueves": "thursday",
      "viernes": "friday",
      "sábado": "saturday",
      "domingo": "sunday"
    };

    const dayKey = dayMap[dayOfWeek];
    const daySchedule = template.weekly_schedule?.[dayKey];

    if (!daySchedule?.enabled) return null;

    return {
      template,
      start: daySchedule.start,
      end: daySchedule.end
    };
  };

  const filteredEmployees = selectedEmployee === "all" 
    ? employees.slice(0, 10) // Mostrar solo primeros 10
    : employees.filter(e => e.id === selectedEmployee);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Calendar className="w-5 h-5 text-indigo-600" />
            Calendario de Horarios
          </CardTitle>
          <div className="flex items-center gap-4">
            <Select value={selectedEmployee} onValueChange={setSelectedEmployee}>
              <SelectTrigger className="w-64">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los empleados (primeros 10)</SelectItem>
                {employees.map(emp => (
                  <SelectItem key={emp.id} value={emp.id}>
                    {emp.first_name} {emp.last_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(subMonths(currentDate, 1))}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <div className="text-sm font-semibold min-w-32 text-center">
                {format(currentDate, "MMMM yyyy", { locale: es })}
              </div>
              <Button
                variant="outline"
                size="icon"
                onClick={() => setCurrentDate(addMonths(currentDate, 1))}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
            </div>
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse">
            <thead>
              <tr>
                <th className="p-2 border text-left bg-slate-50 sticky left-0 z-10">Empleado</th>
                {days.map(day => (
                  <th key={day.toISOString()} className="p-2 border text-center bg-slate-50 min-w-20">
                    <div className="text-xs text-slate-600">
                      {format(day, "EEE", { locale: es })}
                    </div>
                    <div className="text-sm font-bold">{format(day, "d")}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredEmployees.map(emp => (
                <tr key={emp.id} className="hover:bg-slate-50">
                  <td className="p-2 border sticky left-0 bg-white z-10">
                    <div className="font-semibold text-sm text-slate-900">
                      {emp.first_name} {emp.last_name}
                    </div>
                    <div className="text-xs text-slate-600">{emp.employee_code}</div>
                  </td>
                  {days.map(day => {
                    const schedule = getEmployeeScheduleForDay(emp.id, day);
                    const isWeekend = getDay(day) === 0 || getDay(day) === 6;
                    
                    return (
                      <td
                        key={day.toISOString()}
                        className={`p-1 border text-center ${isWeekend ? "bg-slate-50" : ""}`}
                      >
                        {schedule ? (
                          <div className="text-xs">
                            <Badge className="bg-green-100 text-green-700 text-xs mb-1">
                              {schedule.template.schedule_type}
                            </Badge>
                            <div className="font-mono text-slate-700">
                              {schedule.start} - {schedule.end}
                            </div>
                          </div>
                        ) : (
                          <div className="text-slate-400 text-xs">-</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}