import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem } from "@/components/ui/command";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Clock, Calendar as CalendarIcon, Download, Users,
  TrendingUp, AlertCircle, CheckCircle, XCircle, FileText, BarChart3, Search
} from "lucide-react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, isWeekend, differenceInDays } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { BarChart, Bar, LineChart, Line, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';
import jsPDF from 'jspdf'; import 'jspdf-autotable';
import * as XLSX from 'xlsx';
import PermissionGuard from "../components/PermissionGuard";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function AttendanceReports() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [startDate, setStartDate] = useState(startOfMonth(new Date()));
  const [endDate, setEndDate] = useState(endOfMonth(new Date()));
  const [selectedDepartment, setSelectedDepartment] = useState("all");
  const [selectedEmployee, setSelectedEmployee] = useState("all");
  const [reportType, setReportType] = useState("general");
  const [chartType, setChartType] = useState("line");
  const [incidentTypeFilter, setIncidentTypeFilter] = useState("all");

  // Filtros aplicados (se actualizan al hacer clic en Buscar)
  const [appliedStartDate, setAppliedStartDate] = useState(startOfMonth(new Date()));
  const [appliedEndDate, setAppliedEndDate] = useState(endOfMonth(new Date()));
  const [appliedDepartment, setAppliedDepartment] = useState("all");
  const [appliedEmployee, setAppliedEmployee] = useState("all");
  const [appliedReportType, setAppliedReportType] = useState("general");
  const [appliedIncidentType, setAppliedIncidentType] = useState("all");

  // Estados para búsqueda
  const [employeeSearchOpen, setEmployeeSearchOpen] = useState(false);
  const [departmentSearchOpen, setDepartmentSearchOpen] = useState(false);

  const applyFilters = () => {
    setAppliedStartDate(startDate);
    setAppliedEndDate(endDate);
    setAppliedDepartment(selectedDepartment);
    setAppliedEmployee(selectedEmployee);
    setAppliedReportType(reportType);
    setAppliedIncidentType(incidentTypeFilter);
    toast.success('✓ Filtros aplicados correctamente');
  };

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const { data: workSchedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => {
      return await entitiesAPI.WorkSchedule.list("-created_date");
    },
  });

  const { data: attendanceRecords = [] } = useQuery({
    queryKey: ["allAttendanceRecords", appliedStartDate, appliedEndDate],
    queryFn: async () => {
      const records = await entitiesAPI.AttendanceRecord.list("-date");
      return records.filter(r => {
        const recordDate = parseDateLima(r.date);
        return recordDate >= appliedStartDate && recordDate <= appliedEndDate;
      });
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["allIncidents", appliedStartDate, appliedEndDate],
    queryFn: async () => {
      const allIncidents = await entitiesAPI.AttendanceIncident.list("-created_date");
      return allIncidents.filter(i => {
        const incidentDate = parseDateLima(i.incident_date);
        return incidentDate >= appliedStartDate && incidentDate <= appliedEndDate;
      });
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      return await entitiesAPI.Holiday.list("-date");
    },
  });

  const { data: vacationRequests = [] } = useQuery({
    queryKey: ["vacationRequests", appliedStartDate, appliedEndDate],
    queryFn: async () => {
      const allRequests = await entitiesAPI.VacationRequest.list("-created_date");
      return allRequests.filter(v => {
        if (v.status !== "Aprobada") return false;
        const vStart = parseDateLima(v.start_date);
        const vEnd = parseDateLima(v.end_date);
        return !(vEnd < appliedStartDate || vStart > appliedEndDate);
      });
    },
  });

  const isHoliday = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.some(h => h.date === dateStr && h.is_mandatory);
  };

  const getHolidayInfo = (date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return holidays.find(h => h.date === dateStr && h.is_mandatory);
  };

  const isOnVacationOrLeave = (employeeId, date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return vacationRequests.some(v => {
      if (v.employee_id !== employeeId || v.status !== "Aprobada") return false;
      return dateStr >= v.start_date && dateStr <= v.end_date;
    });
  };

  const getVacationOrLeaveInfo = (employeeId, date) => {
    const dateStr = format(date, "yyyy-MM-dd");
    return vacationRequests.find(v => {
      if (v.employee_id !== employeeId || v.status !== "Aprobada") return false;
      return dateStr >= v.start_date && dateStr <= v.end_date;
    });
  };

  const getEmployeeSchedule = (empId) => {
    // Buscar horario individual primero
    let schedule = workSchedules.find(s => s.employee_id === empId && s.is_active);

    // Si no hay individual, buscar por departamento
    if (!schedule) {
      const emp = allEmployees.find(e => e.id === empId);
      if (emp?.department_name) {
        schedule = workSchedules.find(s =>
          s.is_active &&
          (s.departments?.includes(emp.department_name) || s.department_name === emp.department_name)
        );
      }
    }

    return schedule;
  };

  const isOvertimeAuthorized = (empId) => {
    const schedule = getEmployeeSchedule(empId);
    return schedule?.overtime_authorized || false;
  };

  // Calcular feriados en el rango de fechas aplicado
  const holidaysInRange = holidays.filter(h => {
    const holidayDate = parseDateLima(h.date);
    return holidayDate >= appliedStartDate && holidayDate <= appliedEndDate && h.is_mandatory;
  });

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  const filteredEmployees = allEmployees.filter(emp => {
    if (employee?.role === "manager") {
      return emp.department_name === employee.department_name;
    }
    if (appliedDepartment !== "all") {
      return emp.department_name === appliedDepartment;
    }
    return true;
  });

  const displayEmployees = appliedEmployee !== "all"
    ? filteredEmployees.filter(e => e.id === appliedEmployee)
    : filteredEmployees;

  // Generar registros completos incluyendo días sin marcación
  const allRecords = [];
  const allDaysInRange = eachDayOfInterval({ start: appliedStartDate, end: appliedEndDate });

  displayEmployees.forEach(emp => {
    allDaysInRange.forEach(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const existingRecord = attendanceRecords.find(r =>
        r.employee_id === emp.id && r.date === dayStr
      );

      if (existingRecord) {
        allRecords.push(existingRecord);
      } else if (!isWeekend(day)) {
        // Determinar el estado del día
        let status = "Sin marcación";
        let isAbsent = true;

        if (isHoliday(day)) {
          status = "Feriado";
          isAbsent = false;
        } else if (isOnVacationOrLeave(emp.id, day)) {
          const vacInfo = getVacationOrLeaveInfo(emp.id, day);
          status = vacInfo?.request_type || "Vacaciones";
          isAbsent = false;
        }

        // Crear registro virtual para día sin marcación
        allRecords.push({
          id: `virtual-${emp.id}-${dayStr}`,
          employee_id: emp.id,
          date: dayStr,
          clock_in: null,
          clock_out: null,
          worked_hours: null,
          is_late: false,
          late_minutes: 0,
          is_absent: isAbsent,
          status: status
        });
      }
    });
  });

  const filteredRecords = allRecords;

  const calculateEmployeeStats = (employeeId) => {
    const empRecords = filteredRecords.filter(r => r.employee_id === employeeId);
    const recordsWithClockIn = empRecords.filter(r => r.clock_in);

    const totalDays = recordsWithClockIn.length;
    const presentDays = recordsWithClockIn.filter(r => !r.is_absent && r.clock_in).length;
    const lateDays = recordsWithClockIn.filter(r => r.is_late && r.late_minutes > 0).length;

    // No contar como ausencias los días con vacaciones/permisos aprobados o feriados
    const absentDays = empRecords.filter(r => {
      const recordDate = parseDateLima(r.date);
      return r.is_absent
        && !isHoliday(recordDate)
        && !isOnVacationOrLeave(employeeId, recordDate);
    }).length;

    const totalHours = recordsWithClockIn.reduce((sum, r) => sum + (r.worked_hours || 0), 0);
    const totalLateMinutes = recordsWithClockIn.reduce((sum, r) => sum + (r.late_minutes || 0), 0);
    const holidaysInPeriod = empRecords.filter(r => isHoliday(parseDateLima(r.date))).length;

    // Calcular horas extras SOLO si está autorizado
    const authorized = isOvertimeAuthorized(employeeId);
    const overtimeHours = authorized ? recordsWithClockIn.reduce((sum, r) => {
      const hours = r.worked_hours || 0;
      return sum + Math.max(0, hours - 8);
    }, 0) : 0;

    // Calcular días laborables esperados (excluyendo fines de semana, feriados, y vacaciones/permisos aprobados)
    const allDaysInRange = eachDayOfInterval({ start: appliedStartDate, end: appliedEndDate });
    const workDays = allDaysInRange.filter(day =>
      !isWeekend(day)
      && !isHoliday(day)
      && !isOnVacationOrLeave(employeeId, day)
    ).length;
    const expectedDays = workDays;

    // Contar días de vacaciones/permisos en el período
    const vacationDaysInPeriod = allDaysInRange.filter(day =>
      !isWeekend(day) && isOnVacationOrLeave(employeeId, day)
    ).length;

    return {
      totalDays,
      presentDays,
      lateDays,
      absentDays,
      totalHours,
      totalLateMinutes,
      holidaysInPeriod,
      overtimeHours,
      expectedDays,
      vacationDaysInPeriod,
      attendanceRate: expectedDays > 0 ? ((presentDays / expectedDays) * 100).toFixed(1) : 0
    };
  };

  const departmentStats = departments.map(dept => {
    const deptEmployees = allEmployees.filter(e => e.department_name === dept);
    const deptRecords = filteredRecords.filter(r =>
      deptEmployees.some(e => e.id === r.employee_id)
    );

    // Solo contar registros con marcación
    const recordsWithClockIn = deptRecords.filter(r => r.clock_in);

    const lateDays = recordsWithClockIn.filter(r => r.is_late && r.late_minutes > 0).length;
    const absentDays = deptRecords.filter(r => r.is_absent).length;
    const avgAttendance = recordsWithClockIn.length > 0
      ? ((recordsWithClockIn.filter(r => !r.is_absent && r.clock_in).length / recordsWithClockIn.length) * 100).toFixed(1)
      : 0;

    return { dept, employees: deptEmployees.length, lateDays, absentDays, avgAttendance };
  });

  const filteredIncidents = incidents.filter(incident => {
    if (appliedIncidentType !== "all" && incident.incident_type !== appliedIncidentType) {
      return false;
    }
    if (appliedEmployee !== "all" && incident.employee_id !== appliedEmployee) {
      return false;
    }
    if (appliedDepartment !== "all") {
      const emp = allEmployees.find(e => e.id === incident.employee_id);
      if (!emp || emp.department_name !== appliedDepartment) {
        return false;
      }
    }
    return true;
  });

  const pendingIncidents = filteredIncidents.filter(i => i.status === "Pendiente");

  const exportToCSV = () => {
    let dataToExport = [];
    let headers = [];
    let fileName = '';

    if (appliedReportType === "ausentismo") {
      headers = ['Código', 'Empleado', 'Departamento', 'Cargo', 'Días Ausentes', 'Días Esperados', '% Ausentismo'];
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            ausencias: stats.absentDays,
            esperados: stats.expectedDays,
            porcentaje: stats.expectedDays > 0 ? ((stats.absentDays / stats.expectedDays) * 100).toFixed(1) : 0
          };
        })
        .filter(item => item.ausencias > 0)
        .sort((a, b) => b.ausencias - a.ausencias)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.emp.position,
          item.ausencias,
          item.esperados,
          `${item.porcentaje}%`
        ]);
      fileName = `Reporte_Ausentismo_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.csv`;
    } else if (appliedReportType === "tardanzas") {
      headers = ['Código', 'Empleado', 'Departamento', 'Cargo', 'Días con Tardanza', 'Total Minutos', 'Promedio Min/Día'];
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            dias: stats.lateDays,
            minutos: stats.totalLateMinutes,
            promedio: stats.lateDays > 0 ? (stats.totalLateMinutes / stats.lateDays).toFixed(1) : 0
          };
        })
        .filter(item => item.dias > 0)
        .sort((a, b) => b.minutos - a.minutos)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.emp.position,
          item.dias,
          item.minutos,
          item.promedio
        ]);
      fileName = `Reporte_Tardanzas_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.csv`;
    } else if (appliedReportType === "horas_extras") {
      headers = ['Código', 'Empleado', 'Departamento', 'Cargo', 'Horas Extras', 'Días con HE', 'Promedio HE/Día'];
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          const empRecords = filteredRecords.filter(r => r.employee_id === emp.id);
          const diasConHE = empRecords.filter(r => (r.worked_hours || 0) > 8).length;
          return {
            emp,
            horas: stats.overtimeHours,
            dias: diasConHE,
            promedio: diasConHE > 0 ? (stats.overtimeHours / diasConHE).toFixed(2) : 0
          };
        })
        .filter(item => item.horas > 0)
        .sort((a, b) => b.horas - a.horas)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.emp.position,
          item.horas.toFixed(2),
          item.dias,
          item.promedio
        ]);
      fileName = `Reporte_Horas_Extras_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.csv`;
    } else {
      headers = ['Código', 'Empleado', 'Departamento', 'Cargo', 'Días Trabajados', 'Días Esperados', '% Asistencia', 'Tardanzas', 'Ausencias', 'Horas Trabajadas', 'Horas Extras'];
      dataToExport = filteredEmployees.map(emp => {
        const stats = calculateEmployeeStats(emp.id);
        return [
          emp.employee_code,
          `${emp.first_name} ${emp.last_name}`,
          emp.department_name,
          emp.position,
          stats.presentDays,
          stats.expectedDays,
          `${stats.attendanceRate}%`,
          stats.lateDays,
          stats.absentDays,
          stats.totalHours.toFixed(2),
          stats.overtimeHours.toFixed(2)
        ];
      });
      fileName = `Reporte_General_Asistencia_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.csv`;
    }

    if (appliedReportType === "incidencias") {
      headers = ['Código', 'Empleado', 'Departamento', 'Tipo Incidencia', 'Fecha', 'Estado', 'Justificación'];
      dataToExport = filteredIncidents.map(inc => {
        const emp = allEmployees.find(e => e.id === inc.employee_id);
        return [
          emp?.employee_code || "N/A",
          emp ? `${emp.first_name} ${emp.last_name}` : "N/A",
          emp?.department_name || "N/A",
          inc.incident_type,
          format(parseDateLima(inc.incident_date), "dd/MM/yyyy"),
          inc.status,
          inc.justification || ""
        ];
      });
      fileName = `Reporte_Incidencias_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.csv`;
    }

    const csv = [headers, ...dataToExport].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);

    toast.success('✓ Reporte CSV generado correctamente');
  };

  const exportToExcel = () => {
    let dataToExport = [];
    let sheetName = '';
    let fileName = '';

    if (appliedReportType === "ausentismo") {
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            stats,
            porcentaje: stats.expectedDays > 0 ? ((stats.absentDays / stats.expectedDays) * 100).toFixed(1) : 0
          };
        })
        .filter(item => item.stats.absentDays > 0)
        .sort((a, b) => b.stats.absentDays - a.stats.absentDays)
        .map(item => ({
          'Código': item.emp.employee_code,
          'Empleado': `${item.emp.first_name} ${item.emp.last_name}`,
          'Departamento': item.emp.department_name,
          'Cargo': item.emp.position,
          'Días Ausentes': item.stats.absentDays,
          'Días Esperados': item.stats.expectedDays,
          '% Ausentismo': item.porcentaje,
          'Feriados en Período': item.stats.holidaysInPeriod
        }));
      sheetName = 'Reporte Ausentismo';
      fileName = `Reporte_Ausentismo_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.xlsx`;
    } else if (appliedReportType === "tardanzas") {
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            stats,
            promedio: stats.lateDays > 0 ? (stats.totalLateMinutes / stats.lateDays).toFixed(1) : 0
          };
        })
        .filter(item => item.stats.lateDays > 0)
        .sort((a, b) => b.stats.totalLateMinutes - a.stats.totalLateMinutes)
        .map(item => ({
          'Código': item.emp.employee_code,
          'Empleado': `${item.emp.first_name} ${item.emp.last_name}`,
          'Departamento': item.emp.department_name,
          'Cargo': item.emp.position,
          'Días con Tardanza': item.stats.lateDays,
          'Total Minutos': item.stats.totalLateMinutes,
          'Promedio Min/Día': item.promedio,
          'Horas Trabajadas': item.stats.totalHours.toFixed(2)
        }));
      sheetName = 'Reporte Tardanzas';
      fileName = `Reporte_Tardanzas_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.xlsx`;
    } else if (appliedReportType === "horas_extras") {
      dataToExport = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          const empRecords = filteredRecords.filter(r => r.employee_id === emp.id);
          const diasConHE = empRecords.filter(r => (r.worked_hours || 0) > 8).length;
          return {
            emp,
            stats,
            dias: diasConHE,
            promedio: diasConHE > 0 ? (stats.overtimeHours / diasConHE).toFixed(2) : 0
          };
        })
        .filter(item => item.stats.overtimeHours > 0)
        .sort((a, b) => b.stats.overtimeHours - a.stats.overtimeHours)
        .map(item => ({
          'Código': item.emp.employee_code,
          'Empleado': `${item.emp.first_name} ${item.emp.last_name}`,
          'Departamento': item.emp.department_name,
          'Cargo': item.emp.position,
          'Horas Extras': item.stats.overtimeHours.toFixed(2),
          'Días con HE': item.dias,
          'Promedio HE/Día': item.promedio,
          'Total Horas Trabajadas': item.stats.totalHours.toFixed(2)
        }));
      sheetName = 'Reporte Horas Extras';
      fileName = `Reporte_Horas_Extras_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.xlsx`;
    } else {
      dataToExport = filteredEmployees.map(emp => {
        const stats = calculateEmployeeStats(emp.id);
        return {
          'Código': emp.employee_code,
          'Empleado': `${emp.first_name} ${emp.last_name}`,
          'Departamento': emp.department_name,
          'Cargo': emp.position,
          'Días Trabajados': stats.presentDays,
          'Días Esperados': stats.expectedDays,
          '% Asistencia': stats.attendanceRate,
          'Tardanzas': stats.lateDays,
          'Min. Tardanza Total': stats.totalLateMinutes,
          'Ausencias': stats.absentDays,
          'Horas Trabajadas': stats.totalHours.toFixed(2),
          'Horas Extras': stats.overtimeHours.toFixed(2),
          'Feriados': stats.holidaysInPeriod
        };
      });
      sheetName = 'Reporte General';
      fileName = `Reporte_General_Asistencia_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.xlsx`;
    }

    if (appliedReportType === "incidencias") {
      dataToExport = filteredIncidents.map(inc => {
        const emp = allEmployees.find(e => e.id === inc.employee_id);
        return {
          'Código': emp?.employee_code || "N/A",
          'Empleado': emp ? `${emp.first_name} ${emp.last_name}` : "N/A",
          'Departamento': emp?.department_name || "N/A",
          'Tipo de Incidencia': inc.incident_type,
          'Fecha': format(parseDateLima(inc.incident_date), "dd/MM/yyyy"),
          'Estado': inc.status,
          'Justificación': inc.justification || "",
          'Revisado por': inc.reviewed_by || "Pendiente",
          'Fecha de Revisión': inc.review_date ? format(parseDateLima(inc.review_date), "dd/MM/yyyy") : ""
        };
      });
      sheetName = 'Reporte Incidencias';
      fileName = `Reporte_Incidencias_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.xlsx`;
    }

    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, sheetName);

    XLSX.writeFile(wb, fileName);

    toast.success('✓ Reporte Excel generado correctamente');
  };

  const exportToPDF = () => {
    const doc = new jsPDF();
    let title = '';
    let tableData = [];
    let headers = [];
    let fileName = '';

    if (appliedReportType === "ausentismo") {
      title = 'Reporte de Ausentismo';
      headers = [['Código', 'Empleado', 'Departamento', 'Días Ausentes', '% Ausentismo']];
      tableData = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            stats,
            porcentaje: stats.expectedDays > 0 ? ((stats.absentDays / stats.expectedDays) * 100).toFixed(1) : 0
          };
        })
        .filter(item => item.stats.absentDays > 0)
        .sort((a, b) => b.stats.absentDays - a.stats.absentDays)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.stats.absentDays,
          `${item.porcentaje}%`
        ]);
      fileName = `Reporte_Ausentismo_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.pdf`;
    } else if (appliedReportType === "tardanzas") {
      title = 'Reporte de Tardanzas';
      headers = [['Código', 'Empleado', 'Departamento', 'Días Tard.', 'Total Min', 'Prom Min/Día']];
      tableData = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          return {
            emp,
            stats,
            promedio: stats.lateDays > 0 ? (stats.totalLateMinutes / stats.lateDays).toFixed(1) : 0
          };
        })
        .filter(item => item.stats.lateDays > 0)
        .sort((a, b) => b.stats.totalLateMinutes - a.stats.totalLateMinutes)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.stats.lateDays,
          item.stats.totalLateMinutes,
          item.promedio
        ]);
      fileName = `Reporte_Tardanzas_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.pdf`;
    } else if (appliedReportType === "horas_extras") {
      title = 'Reporte de Horas Extras';
      headers = [['Código', 'Empleado', 'Departamento', 'Horas Extras', 'Días con HE', 'Prom HE/Día']];
      tableData = filteredEmployees
        .map(emp => {
          const stats = calculateEmployeeStats(emp.id);
          const empRecords = filteredRecords.filter(r => r.employee_id === emp.id);
          const diasConHE = empRecords.filter(r => (r.worked_hours || 0) > 8).length;
          return {
            emp,
            stats,
            dias: diasConHE,
            promedio: diasConHE > 0 ? (stats.overtimeHours / diasConHE).toFixed(2) : 0
          };
        })
        .filter(item => item.stats.overtimeHours > 0)
        .sort((a, b) => b.stats.overtimeHours - a.stats.overtimeHours)
        .map(item => [
          item.emp.employee_code,
          `${item.emp.first_name} ${item.emp.last_name}`,
          item.emp.department_name,
          item.stats.overtimeHours.toFixed(2),
          item.dias,
          item.promedio
        ]);
      fileName = `Reporte_Horas_Extras_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.pdf`;
    } else {
      title = 'Reporte General de Asistencia';
      headers = [['Código', 'Empleado', 'Depto', 'Días', '%', 'Tard.', 'Aus.', 'Hs', 'Hs.Ext']];
      tableData = filteredEmployees.map(emp => {
        const stats = calculateEmployeeStats(emp.id);
        return [
          emp.employee_code,
          `${emp.first_name} ${emp.last_name}`,
          emp.department_name,
          stats.presentDays,
          `${stats.attendanceRate}%`,
          stats.lateDays,
          stats.absentDays,
          stats.totalHours.toFixed(1),
          stats.overtimeHours.toFixed(1)
        ];
      });
      fileName = `Reporte_General_Asistencia_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.pdf`;
    }

    if (appliedReportType === "incidencias") {
      title = 'Reporte de Incidencias';
      headers = [['Código', 'Empleado', 'Depto', 'Tipo', 'Fecha', 'Estado']];
      tableData = filteredIncidents.map(inc => {
        const emp = allEmployees.find(e => e.id === inc.employee_id);
        return [
          emp?.employee_code || "N/A",
          emp ? `${emp.first_name} ${emp.last_name}` : "N/A",
          emp?.department_name || "N/A",
          inc.incident_type,
          format(parseDateLima(inc.incident_date), "dd/MM/yy"),
          inc.status
        ];
      });
      fileName = `Reporte_Incidencias_${format(appliedStartDate, "yyyy-MM-dd")}_${format(appliedEndDate, "yyyy-MM-dd")}.pdf`;
    }

    doc.setFontSize(18);
    doc.text(title, 14, 20);

    doc.setFontSize(11);
    doc.text(`Período: ${format(appliedStartDate, "dd/MM/yyyy")} - ${format(appliedEndDate, "dd/MM/yyyy")}`, 14, 30);
    doc.text(`Generado: ${format(new Date(), "dd/MM/yyyy HH:mm")}`, 14, 36);

    if (appliedDepartment !== "all") {
      doc.text(`Departamento: ${appliedDepartment}`, 14, 42);
    }

    doc.autoTable({
      startY: appliedDepartment !== "all" ? 48 : 42,
      head: headers,
      body: tableData,
      styles: { fontSize: 8, cellPadding: 2 },
      headStyles: { fillColor: [79, 70, 229], textColor: 255, fontStyle: 'bold' },
      alternateRowStyles: { fillColor: [249, 250, 251] }
    });

    doc.save(fileName);
    toast.success('✓ Reporte PDF generado correctamente');
  };

  // Datos para gráficos
  const dailyAttendanceData = eachDayOfInterval({ start: appliedStartDate, end: appliedEndDate })
    .filter(day => !isWeekend(day))
    .map(day => {
      const dayStr = format(day, "yyyy-MM-dd");
      const dayRecords = filteredRecords.filter(r => r.date === dayStr);
      return {
        date: format(day, "dd/MM", { locale: es }),
        presentes: dayRecords.filter(r => r.clock_in && !r.is_absent).length,
        ausentes: dayRecords.filter(r => r.is_absent).length,
        tardanzas: dayRecords.filter(r => r.is_late).length
      };
    });

  const departmentChartData = departmentStats.map(stat => ({
    name: stat.dept,
    asistencia: parseFloat(stat.avgAttendance),
    tardanzas: stat.lateDays,
    ausencias: stat.absentDays
  }));

  const COLORS = ['#10b981', '#f59e0b', '#ef4444', '#3b82f6', '#8b5cf6'];

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
              Reportes de Asistencia
            </h1>
            <p className="text-slate-600 text-lg">
              Análisis y seguimiento de la asistencia del equipo
            </p>
          </div>

          {/* Filters */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="space-y-4">
                <div className="flex flex-wrap items-center gap-4">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Desde:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(parseDateLima(dateToStringLima(startDate)), "dd MMM yyyy", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={startDate}
                          onSelect={(date) => date && setStartDate(date)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-slate-700">Hasta:</span>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" size="sm">
                          <CalendarIcon className="mr-2 h-4 w-4" />
                          {format(parseDateLima(dateToStringLima(endDate)), "dd MMM yyyy", { locale: es })}
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar
                          mode="single"
                          selected={endDate}
                          onSelect={(date) => date && setEndDate(date)}
                          locale={es}
                        />
                      </PopoverContent>
                    </Popover>
                  </div>

                  <Badge className="bg-blue-100 text-blue-700">
                    {differenceInDays(endDate, startDate) + 1} días
                  </Badge>

                  {employee?.role === "admin" && (
                    <Popover open={departmentSearchOpen} onOpenChange={setDepartmentSearchOpen}>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="w-48 justify-between">
                          {selectedDepartment === "all" ? "Todos los departamentos" : selectedDepartment}
                          <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-64 p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar departamento..." />
                          <CommandEmpty>No se encontró departamento</CommandEmpty>
                          <CommandGroup className="max-h-64 overflow-auto">
                            <CommandItem
                              value="all"
                              onSelect={() => {
                                setSelectedDepartment("all");
                                setDepartmentSearchOpen(false);
                              }}
                            >
                              <CheckCircle className={`mr-2 h-4 w-4 ${selectedDepartment === "all" ? "opacity-100" : "opacity-0"}`} />
                              Todos los departamentos
                            </CommandItem>
                            {departments.map(dept => (
                              <CommandItem
                                key={dept}
                                value={dept}
                                onSelect={() => {
                                  setSelectedDepartment(dept);
                                  setDepartmentSearchOpen(false);
                                }}
                              >
                                <CheckCircle className={`mr-2 h-4 w-4 ${selectedDepartment === dept ? "opacity-100" : "opacity-0"}`} />
                                {dept}
                              </CommandItem>
                            ))}
                          </CommandGroup>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  )}

                  <Popover open={employeeSearchOpen} onOpenChange={setEmployeeSearchOpen}>
                    <PopoverTrigger asChild>
                      <Button variant="outline" className="flex-1 min-w-[320px] justify-between">
                        {selectedEmployee === "all"
                          ? "Todos los empleados"
                          : (() => {
                              const emp = filteredEmployees.find(e => e.id === selectedEmployee);
                              return emp ? `${emp.first_name} ${emp.last_name}` : "Seleccionar empleado";
                            })()
                        }
                        <Search className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-[400px] p-0" align="start">
                      <Command filter={(value, search) => {
                        const lowerSearch = search.toLowerCase();
                        const lowerValue = value.toLowerCase();
                        if (lowerValue.includes(lowerSearch)) return 1;
                        return 0;
                      }}>
                        <CommandInput placeholder="Buscar empleado..." className="h-9" />
                        <CommandEmpty>No se encontró empleado</CommandEmpty>
                        <CommandGroup className="max-h-64 overflow-auto">
                          <CommandItem
                            value="todos los empleados"
                            onSelect={() => {
                              setSelectedEmployee("all");
                              setEmployeeSearchOpen(false);
                            }}
                          >
                            <CheckCircle className={`mr-2 h-4 w-4 shrink-0 ${selectedEmployee === "all" ? "opacity-100" : "opacity-0"}`} />
                            Todos los empleados
                          </CommandItem>
                          {filteredEmployees.map(emp => (
                            <CommandItem
                              key={emp.id}
                              value={`${emp.first_name} ${emp.last_name} ${emp.employee_code}`}
                              onSelect={() => {
                                setSelectedEmployee(emp.id);
                                setEmployeeSearchOpen(false);
                              }}
                            >
                              <CheckCircle className={`mr-2 h-4 w-4 shrink-0 ${selectedEmployee === emp.id ? "opacity-100" : "opacity-0"}`} />
                              <span className="truncate">{emp.first_name} {emp.last_name} ({emp.employee_code})</span>
                            </CommandItem>
                          ))}
                        </CommandGroup>
                      </Command>
                    </PopoverContent>
                  </Popover>

                  <Select value={reportType} onValueChange={setReportType}>
                    <SelectTrigger className="w-48">
                      <SelectValue placeholder="Tipo de reporte" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="general">General</SelectItem>
                      <SelectItem value="ausentismo">Ausentismo</SelectItem>
                      <SelectItem value="tardanzas">Tardanzas</SelectItem>
                      <SelectItem value="horas_extras">Horas Extras</SelectItem>
                      <SelectItem value="incidencias">Incidencias</SelectItem>
                    </SelectContent>
                  </Select>

                  <Select value={incidentTypeFilter} onValueChange={setIncidentTypeFilter}>
                    <SelectTrigger className="w-52">
                      <SelectValue placeholder="Tipo de incidencia" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Todas las incidencias</SelectItem>
                      <SelectItem value="Tardanza">Tardanza</SelectItem>
                      <SelectItem value="Falta">Falta</SelectItem>
                      <SelectItem value="Salida Temprana">Salida Temprana</SelectItem>
                      <SelectItem value="Olvido de Marcación">Olvido de Marcación</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    onClick={applyFilters}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Search className="w-4 h-4 mr-2" />
                    Buscar
                  </Button>

                  <Button
                    onClick={exportToCSV}
                    variant="outline"
                    className="bg-blue-600 text-white hover:bg-blue-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    CSV
                  </Button>
                  <Button
                    onClick={exportToExcel}
                    variant="outline"
                    className="bg-green-600 text-white hover:bg-green-700"
                  >
                    <Download className="w-4 h-4 mr-2" />
                    Excel
                  </Button>
                  <Button
                    onClick={exportToPDF}
                    variant="outline"
                    className="bg-red-600 text-white hover:bg-red-700"
                  >
                    <FileText className="w-4 h-4 mr-2" />
                    PDF
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Summary Cards - Compact Horizontal Layout */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-blue-100 rounded-xl shrink-0">
                    <Users className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {filteredEmployees.length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Empleados activos</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-green-100 rounded-xl shrink-0">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {filteredRecords.filter(r => !r.is_absent).length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Asistencias</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-yellow-100 rounded-xl shrink-0">
                    <Clock className="w-5 h-5 text-yellow-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {filteredRecords.filter(r => r.is_late).length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Tardanzas</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-orange-100 rounded-xl shrink-0">
                    <AlertCircle className="w-5 h-5 text-orange-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {pendingIncidents.length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Justif. pendientes</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 bg-red-100 rounded-xl shrink-0">
                    <XCircle className="w-5 h-5 text-red-600" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-2xl font-bold text-slate-900 leading-tight">
                      {filteredIncidents.length}
                    </div>
                    <p className="text-slate-600 text-xs truncate">Total incidencias</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Listado Individual de Empleados */}
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold">
                Detalle de Asistencia por Empleado
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {filteredRecords.length} registro(s) según filtros aplicados
              </p>
            </CardHeader>
            <CardContent className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-700">Empleado</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Fecha</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Departamento</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Entrada</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Salida</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Horas Trabajadas</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Tardanza</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Estado</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredRecords
                      .sort((a, b) => new Date(b.date) - new Date(a.date))
                      .map((record) => {
                        const emp = allEmployees.find(e => e.id === record.employee_id);
                        if (!emp) return null;

                        return (
                          <tr key={record.id} className="border-b hover:bg-slate-50 transition-colors">
                            <td className="p-3">
                              <div>
                                <p className="font-semibold text-slate-900">
                                  {emp.first_name} {emp.last_name}
                                </p>
                                <p className="text-xs text-slate-500">{emp.employee_code}</p>
                              </div>
                            </td>
                            <td className="p-3 text-center">
                              <p className="font-medium text-slate-900">
                                {format(parseDateLima(record.date), "dd/MM/yyyy")}
                              </p>
                              <p className="text-xs text-slate-500">
                                {format(parseDateLima(record.date), "EEEE", { locale: es })}
                              </p>
                            </td>
                            <td className="p-3 text-center text-sm">{emp.department_name}</td>
                            <td className="p-3 text-center text-sm font-medium">
                              {record.clock_in || <span className="text-slate-400">---</span>}
                            </td>
                            <td className="p-3 text-center text-sm font-medium">
                              {record.clock_out || <span className="text-slate-400">---</span>}
                            </td>
                            <td className="p-3 text-center">
                              {record.worked_hours ? (
                                <span className="font-semibold text-blue-700">
                                  {record.worked_hours.toFixed(2)}h
                                </span>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              {record.is_late && record.late_minutes > 0 ? (
                                <Badge className="bg-yellow-100 text-yellow-700 border-yellow-200">
                                  {record.late_minutes} min
                                </Badge>
                              ) : (
                                <span className="text-slate-400">-</span>
                              )}
                            </td>
                            <td className="p-3 text-center">
                              <Badge className={
                                  record.status === "Completo" ? "bg-green-100 text-green-700 border-green-200" :
                                  record.status === "Ausente" ? "bg-red-100 text-red-700 border-red-200" :
                                  record.status === "Incompleto" ? "bg-yellow-100 text-yellow-700 border-yellow-200" :
                                  record.status === "Feriado" ? "bg-purple-100 text-purple-700 border-purple-200" :
                                  record.status === "Sin marcación" ? "bg-orange-100 text-orange-700 border-orange-200" :
                                  record.status === "Vacaciones" ? "bg-cyan-100 text-cyan-700 border-cyan-200" :
                                  record.status === "Permiso con goce" ? "bg-teal-100 text-teal-700 border-teal-200" :
                                  record.status === "Permiso sin goce" ? "bg-rose-100 text-rose-700 border-rose-200" :
                                  record.status === "Licencia médica" ? "bg-indigo-100 text-indigo-700 border-indigo-200" :
                                  "bg-blue-100 text-blue-700 border-blue-200"
                                }>
                                {record.status}
                              </Badge>
                            </td>
                          </tr>
                        );
                      })}
                  </tbody>
                </table>
              </div>
              {filteredRecords.length === 0 && (
                <div className="text-center py-12">
                  <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">No hay registros de asistencia que coincidan con los filtros aplicados</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Reporte de Incidencias */}
          {appliedReportType === "incidencias" && (
          <Card className="border-0 shadow-lg mb-8">
            <CardHeader className="border-b bg-red-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-6 h-6 text-red-600" />
                  Reporte de Incidencias
                </CardTitle>
                <Badge className="bg-red-100 text-red-700 text-base px-4 py-1">
                  {filteredIncidents.length} incidencias
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b bg-slate-50">
                      <th className="text-left p-3 font-semibold text-slate-700">Empleado</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Departamento</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Tipo</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Fecha</th>
                      <th className="text-center p-3 font-semibold text-slate-700">Estado</th>
                      <th className="text-left p-3 font-semibold text-slate-700">Justificación</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredIncidents.map(inc => {
                      const emp = allEmployees.find(e => e.id === inc.employee_id);
                      return (
                        <tr key={inc.id} className="border-b hover:bg-slate-50">
                          <td className="p-3">
                            <p className="font-semibold text-slate-900">
                              {emp ? `${emp.first_name} ${emp.last_name}` : "N/A"}
                            </p>
                            <p className="text-xs text-slate-500">{emp?.employee_code}</p>
                          </td>
                          <td className="p-3 text-center text-sm">{emp?.department_name}</td>
                          <td className="p-3 text-center">
                            <Badge className={
                              inc.incident_type === "Tardanza" ? "bg-yellow-100 text-yellow-700" :
                              inc.incident_type === "Falta" ? "bg-red-100 text-red-700" :
                              inc.incident_type === "Salida Temprana" ? "bg-orange-100 text-orange-700" :
                              "bg-purple-100 text-purple-700"
                            }>
                              {inc.incident_type}
                            </Badge>
                          </td>
                          <td className="p-3 text-center text-sm">
                           {format(parseDateLima(inc.incident_date), "dd/MM/yyyy")}
                          </td>
                          <td className="p-3 text-center">
                            <Badge className={
                              inc.status === "Aprobada" ? "bg-green-100 text-green-700" :
                              inc.status === "Rechazada" ? "bg-red-100 text-red-700" :
                              "bg-orange-100 text-orange-700"
                            }>
                              {inc.status}
                            </Badge>
                          </td>
                          <td className="p-3 text-sm text-slate-600">
                            {inc.justification || "-"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {filteredIncidents.length === 0 && (
                  <div className="text-center py-12">
                    <AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay incidencias que coincidan con los filtros aplicados</p>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Tabs for different views */}
          <Tabs defaultValue="summary" className="space-y-6">
          <TabsList className="grid w-full max-w-3xl grid-cols-3">
            <TabsTrigger value="summary">Resumen</TabsTrigger>
            <TabsTrigger value="charts">Gráficos</TabsTrigger>
            <TabsTrigger value="details">Detalles</TabsTrigger>
          </TabsList>

            {/* Summary Tab */}
            <TabsContent value="summary" className="space-y-6">
              {/* Información de los Filtros Aplicados */}
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-indigo-50/50">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Users className="w-5 h-5" />
                    Detalle de la Búsqueda
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="grid md:grid-cols-2 gap-6">
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Período</p>
                        <p className="font-semibold text-slate-900">
                          {format(appliedStartDate, "dd/MM/yyyy")} - {format(appliedEndDate, "dd/MM/yyyy")}
                        </p>
                        <p className="text-sm text-slate-500">
                          {differenceInDays(appliedEndDate, appliedStartDate) + 1} días totales
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Tipo de Reporte</p>
                        <Badge className="bg-indigo-100 text-indigo-700">
                          {appliedReportType === "general" && "General"}
                          {appliedReportType === "ausentismo" && "Ausentismo"}
                          {appliedReportType === "tardanzas" && "Tardanzas"}
                          {appliedReportType === "horas_extras" && "Horas Extras"}
                          {appliedReportType === "incidencias" && "Incidencias"}
                        </Badge>
                      </div>
                      {appliedIncidentType !== "all" && (
                        <div>
                          <p className="text-sm text-slate-600 mb-1">Tipo de Incidencia</p>
                          <Badge className="bg-purple-100 text-purple-700">
                            {appliedIncidentType}
                          </Badge>
                        </div>
                      )}
                    </div>
                    <div className="space-y-4">
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Departamento</p>
                        <p className="font-semibold text-slate-900">
                          {appliedDepartment === "all" ? "Todos los departamentos" : appliedDepartment}
                        </p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Empleado</p>
                        <p className="font-semibold text-slate-900">
                          {appliedEmployee === "all"
                            ? "Todos los empleados"
                            : (() => {
                                const emp = allEmployees.find(e => e.id === appliedEmployee);
                                return emp ? `${emp.first_name} ${emp.last_name}` : "N/A";
                              })()
                          }
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Resumen de Resultados */}
                  <div className="mt-6 pt-6 border-t">
                    <p className="text-sm text-slate-600 mb-3">Resumen de Resultados</p>
                    <div className="grid grid-cols-2 md:grid-cols-7 gap-4">
                      <div className="p-3 bg-slate-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Total Empleados</p>
                        <p className="text-2xl font-bold text-slate-900">{displayEmployees.length}</p>
                      </div>
                      <div className="p-3 bg-green-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Total Asistencias</p>
                        <p className="text-2xl font-bold text-green-700">
                          {filteredRecords.filter(r => !r.is_absent && r.clock_in).length}
                        </p>
                      </div>
                      <div className="p-3 bg-yellow-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Total Tardanzas</p>
                        <p className="text-2xl font-bold text-yellow-700">
                          {filteredRecords.filter(r => r.is_late).length}
                        </p>
                      </div>
                      <div className="p-3 bg-red-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Total Ausencias</p>
                        <p className="text-2xl font-bold text-red-700">
                          {filteredRecords.filter(r => r.is_absent).length}
                        </p>
                      </div>
                      <div className="p-3 bg-purple-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Feriados</p>
                        <p className="text-2xl font-bold text-purple-700">{holidaysInRange.length}</p>
                        <p className="text-xs text-purple-600">en el período</p>
                      </div>
                      <div className="p-3 bg-cyan-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Vacaciones/Permisos</p>
                        <p className="text-2xl font-bold text-cyan-700">
                          {vacationRequests.filter(v => v.status === "Aprobada").length}
                        </p>
                        <p className="text-xs text-cyan-600">aprobadas</p>
                      </div>
                      <div className="p-3 bg-orange-50 rounded-lg">
                        <p className="text-xs text-slate-600 mb-1">Total Incidencias</p>
                        <p className="text-2xl font-bold text-orange-700">
                          {filteredIncidents.length}
                        </p>
                        <p className="text-xs text-orange-600">{pendingIncidents.length} pendientes</p>
                      </div>
                    </div>
                  </div>

                  {/* Lista de Feriados en el Período */}
                  {holidaysInRange.length > 0 && (
                    <div className="mt-6 pt-6 border-t">
                      <p className="text-sm text-slate-600 mb-3">Feriados en el Período Seleccionado</p>
                      <div className="grid md:grid-cols-2 gap-3">
                        {holidaysInRange.map(holiday => (
                          <div key={holiday.id} className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
                            <div className="flex items-start justify-between">
                              <div>
                                <p className="font-semibold text-slate-900">{holiday.name}</p>
                                <p className="text-xs text-slate-600">
                                  {format(parseDateLima(holiday.date), "EEEE, dd 'de' MMMM", { locale: es })}
                                </p>
                              </div>
                              <Badge className={
                                holiday.type === "Nacional" ? "bg-blue-100 text-blue-700" :
                                holiday.type === "Regional" ? "bg-purple-100 text-purple-700" :
                                "bg-green-100 text-green-700"
                              }>
                                {holiday.type}
                              </Badge>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Top Tardanzas y Ausencias - Solo si es "Todos" */}
              {appliedEmployee === "all" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">
                        Top Tardanzas y Ausencias
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="grid md:grid-cols-2 gap-6">
                        <div>
                          <h3 className="font-semibold text-slate-900 mb-4">Más Tardanzas</h3>
                          <div className="space-y-2">
                            {displayEmployees
                              .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                              .filter(({ stats }) => stats.lateDays > 0)
                              .sort((a, b) => b.stats.lateDays - a.stats.lateDays)
                              .slice(0, 5)
                              .map(({ emp, stats }) => (
                                <div key={emp.id} className="flex justify-between items-center p-3 bg-yellow-50 rounded-lg">
                                  <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                                  <Badge className="bg-yellow-100 text-yellow-700">
                                    {stats.lateDays} días ({stats.totalLateMinutes} min)
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                        <div>
                          <h3 className="font-semibold text-slate-900 mb-4">Más Ausencias</h3>
                          <div className="space-y-2">
                            {displayEmployees
                              .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                              .filter(({ stats }) => stats.absentDays > 0)
                              .sort((a, b) => b.stats.absentDays - a.stats.absentDays)
                              .slice(0, 5)
                              .map(({ emp, stats }) => (
                                <div key={emp.id} className="flex justify-between items-center p-3 bg-red-50 rounded-lg">
                                  <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                                  <Badge className="bg-red-100 text-red-700">
                                    {stats.absentDays} días
                                  </Badge>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">
                        Horas Extras por Empleado
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <div className="space-y-2">
                        {displayEmployees
                          .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                          .filter(({ stats }) => stats.overtimeHours > 0)
                          .sort((a, b) => b.stats.overtimeHours - a.stats.overtimeHours)
                          .map(({ emp, stats }) => (
                            <div key={emp.id} className="flex justify-between items-center p-3 bg-blue-50 rounded-lg">
                              <div>
                                <span className="font-medium">{emp.first_name} {emp.last_name}</span>
                                <p className="text-xs text-slate-600">{emp.department_name}</p>
                              </div>
                              <Badge className="bg-blue-100 text-blue-700">
                                {stats.overtimeHours.toFixed(2)} horas extra
                              </Badge>
                            </div>
                          ))}
                        {displayEmployees.every(emp => calculateEmployeeStats(emp.id).overtimeHours === 0) && (
                          <p className="text-center text-slate-500 py-8">No hay horas extras registradas en este período</p>
                        )}
                      </div>
                    </CardContent>
                  </Card>
                </>
              )}

              {/* Detalle Individual del Empleado */}
              {appliedEmployee !== "all" && displayEmployees.length > 0 && (() => {
                const emp = displayEmployees[0];
                const stats = calculateEmployeeStats(emp.id);
                const empRecords = filteredRecords.filter(r => r.employee_id === emp.id).sort((a, b) => new Date(a.date) - new Date(b.date));

                return (
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="text-2xl font-bold">
                            {emp.first_name} {emp.last_name}
                          </CardTitle>
                          <p className="text-slate-600 mt-1">
                            {emp.position} • {emp.department_name} • {emp.employee_code}
                          </p>
                        </div>
                        <Badge className={
                          stats.attendanceRate >= 95 ? "bg-green-100 text-green-700" :
                          stats.attendanceRate >= 85 ? "bg-yellow-100 text-yellow-700" :
                          "bg-red-100 text-red-700"
                        }>
                          {stats.attendanceRate}% asistencia
                        </Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      {/* Estadísticas del Empleado */}
                      <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                        <div className="p-4 bg-slate-50 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">Días Trabajados</p>
                          <p className="text-2xl font-bold text-slate-900">{stats.presentDays}</p>
                          <p className="text-xs text-slate-500">de {stats.expectedDays} esperados</p>
                        </div>
                        <div className="p-4 bg-yellow-50 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">Tardanzas</p>
                          <p className="text-2xl font-bold text-yellow-700">{stats.lateDays}</p>
                          <p className="text-xs text-yellow-600">{stats.totalLateMinutes} minutos total</p>
                        </div>
                        <div className="p-4 bg-red-50 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">Ausencias</p>
                          <p className="text-2xl font-bold text-red-700">{stats.absentDays}</p>
                        </div>
                        <div className="p-4 bg-blue-50 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">Horas Trabajadas</p>
                          <p className="text-2xl font-bold text-blue-700">{stats.totalHours.toFixed(1)}</p>
                          <p className="text-xs text-blue-600">{stats.overtimeHours.toFixed(1)}h extras</p>
                        </div>
                        <div className="p-4 bg-cyan-50 rounded-lg">
                          <p className="text-xs text-slate-600 mb-1">Vacaciones/Permisos</p>
                          <p className="text-2xl font-bold text-cyan-700">{stats.vacationDaysInPeriod || 0}</p>
                          <p className="text-xs text-cyan-600">días</p>
                        </div>
                      </div>

                      {/* Detalle Día por Día */}
                      <div className="border-t pt-6">
                        <h3 className="font-semibold text-slate-900 mb-4">Detalle Día por Día</h3>
                        <div className="space-y-2 max-h-96 overflow-y-auto">
                          {empRecords.map((record, idx) => (
                            <div key={idx} className={`p-3 rounded-lg border ${
                              record.is_absent ? 'bg-red-50 border-red-200' :
                              record.is_late ? 'bg-yellow-50 border-yellow-200' :
                              'bg-green-50 border-green-200'
                            }`}>
                              <div className="flex items-center justify-between">
                                <div>
                                  <div className="flex items-center gap-2">
                                   <p className="font-medium text-slate-900">
                                     {format(parseDateLima(record.date), "EEEE, dd 'de' MMMM", { locale: es })}
                                   </p>
                                   {getHolidayInfo(parseDateLima(record.date)) && (
                                     <Badge className="bg-purple-100 text-purple-700 border-purple-200">
                                       🎉 {getHolidayInfo(parseDateLima(record.date)).name}
                                     </Badge>
                                   )}
                                  </div>
                                  <div className="flex items-center gap-4 text-sm mt-1">
                                   <span>Entrada: {record.clock_in || "---"}</span>
                                   <span>Salida: {record.clock_out || "---"}</span>
                                   {record.worked_hours && (
                                     <span className="text-blue-600 font-medium">
                                       {record.worked_hours.toFixed(2)}h trabajadas
                                     </span>
                                   )}
                                  </div>
                                </div>
                                <div className="flex flex-col items-end gap-1">
                                  <Badge className={
                                    record.status === "Completo" ? "bg-green-100 text-green-700" :
                                    record.status === "Ausente" ? "bg-red-100 text-red-700" :
                                    "bg-yellow-100 text-yellow-700"
                                  }>
                                    {record.status}
                                  </Badge>
                                  {record.is_late && record.late_minutes > 0 && (
                                    <Badge className="bg-yellow-100 text-yellow-700">
                                      {record.late_minutes} min tarde
                                    </Badge>
                                  )}
                                </div>
                              </div>
                              {record.notes && (
                                <p className="text-xs text-slate-600 mt-2 italic">{record.notes}</p>
                              )}
                            </div>
                          ))}
                          {empRecords.length === 0 && (
                            <p className="text-center text-slate-500 py-8">
                              No hay registros de asistencia en este período
                            </p>
                          )}
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </TabsContent>

            {/* Charts Tab */}
            <TabsContent value="charts" className="space-y-6">
              {appliedReportType === "general" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                          <TrendingUp className="w-5 h-5" />
                          Tendencia de Asistencia Diaria
                        </CardTitle>
                        <Select value={chartType} onValueChange={setChartType}>
                          <SelectTrigger className="w-32">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="line">Líneas</SelectItem>
                            <SelectItem value="bar">Barras</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        {chartType === "line" ? (
                          <LineChart data={dailyAttendanceData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Line type="monotone" dataKey="presentes" stroke="#10b981" strokeWidth={2} name="Presentes" />
                            <Line type="monotone" dataKey="tardanzas" stroke="#f59e0b" strokeWidth={2} name="Tardanzas" />
                            <Line type="monotone" dataKey="ausentes" stroke="#ef4444" strokeWidth={2} name="Ausentes" />
                          </LineChart>
                        ) : (
                          <BarChart data={dailyAttendanceData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="date" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="presentes" fill="#10b981" name="Presentes" />
                            <Bar dataKey="tardanzas" fill="#f59e0b" name="Tardanzas" />
                            <Bar dataKey="ausentes" fill="#ef4444" name="Ausentes" />
                          </BarChart>
                        )}
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  {employee?.role === "admin" && (
                    <Card className="border-0 shadow-lg">
                      <CardHeader className="border-b bg-slate-50/50">
                        <CardTitle className="text-xl font-bold flex items-center gap-2">
                          <BarChart3 className="w-5 h-5" />
                          Comparativa por Departamento
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="p-6">
                        <ResponsiveContainer width="100%" height={300}>
                          <BarChart data={departmentChartData}>
                            <CartesianGrid strokeDasharray="3 3" />
                            <XAxis dataKey="name" />
                            <YAxis />
                            <Tooltip />
                            <Legend />
                            <Bar dataKey="asistencia" fill="#10b981" name="% Asistencia" />
                            <Bar dataKey="tardanzas" fill="#f59e0b" name="Tardanzas" />
                            <Bar dataKey="ausencias" fill="#ef4444" name="Ausencias" />
                          </BarChart>
                        </ResponsiveContainer>
                      </CardContent>
                    </Card>
                  )}
                </>
              )}

              {appliedReportType === "ausentismo" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <XCircle className="w-5 h-5 text-red-600" />
                        Tendencia de Ausentismo por Día
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dailyAttendanceData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="ausentes" stroke="#ef4444" strokeWidth={3} name="Ausentes" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">Top 10 Empleados con Más Ausencias</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={displayEmployees
                            .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                            .filter(item => item.stats.absentDays > 0)
                            .sort((a, b) => b.stats.absentDays - a.stats.absentDays)
                            .slice(0, 10)
                            .map(item => ({
                              name: `${item.emp.first_name.split(' ')[0]} ${item.emp.last_name.split(' ')[0]}`,
                              ausencias: item.stats.absentDays
                            }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="ausencias" fill="#ef4444" name="Días Ausentes" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}

              {appliedReportType === "tardanzas" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-yellow-600" />
                        Tendencia de Tardanzas por Día
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <LineChart data={dailyAttendanceData}>
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="date" />
                          <YAxis />
                          <Tooltip />
                          <Legend />
                          <Line type="monotone" dataKey="tardanzas" stroke="#f59e0b" strokeWidth={3} name="Tardanzas" />
                        </LineChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">Top 10 Empleados con Más Tardanzas</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={displayEmployees
                            .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                            .filter(item => item.stats.lateDays > 0)
                            .sort((a, b) => b.stats.totalLateMinutes - a.stats.totalLateMinutes)
                            .slice(0, 10)
                            .map(item => ({
                              name: `${item.emp.first_name.split(' ')[0]} ${item.emp.last_name.split(' ')[0]}`,
                              minutos: item.stats.totalLateMinutes,
                              dias: item.stats.lateDays
                            }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="minutos" fill="#f59e0b" name="Total Minutos" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}

              {appliedReportType === "horas_extras" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold flex items-center gap-2">
                        <Clock className="w-5 h-5 text-purple-600" />
                        Horas Extras Acumuladas
                      </CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={displayEmployees
                            .map(emp => ({ emp, stats: calculateEmployeeStats(emp.id) }))
                            .filter(item => item.stats.overtimeHours > 0)
                            .sort((a, b) => b.stats.overtimeHours - a.stats.overtimeHours)
                            .slice(0, 10)
                            .map(item => ({
                              name: `${item.emp.first_name.split(' ')[0]} ${item.emp.last_name.split(' ')[0]}`,
                              horas: parseFloat(item.stats.overtimeHours.toFixed(2))
                            }))}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" angle={-45} textAnchor="end" height={100} />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="horas" fill="#8b5cf6" name="Horas Extras" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">Distribución de Horas Extras por Departamento</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={departments.map(dept => {
                              const deptEmployees = displayEmployees.filter(e => e.department_name === dept);
                              const totalHE = deptEmployees.reduce((sum, emp) => {
                                const stats = calculateEmployeeStats(emp.id);
                                return sum + stats.overtimeHours;
                              }, 0);
                              return {
                                name: dept,
                                value: parseFloat(totalHE.toFixed(2))
                              };
                            }).filter(item => item.value > 0)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}h`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {departments.map((_, index) => (
                              <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}

              {appliedReportType === "incidencias" && (
                <>
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">Incidencias por Tipo</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <BarChart
                          data={[
                            { name: "Tardanza", cantidad: filteredIncidents.filter(i => i.incident_type === "Tardanza").length },
                            { name: "Falta", cantidad: filteredIncidents.filter(i => i.incident_type === "Falta").length },
                            { name: "Salida Temprana", cantidad: filteredIncidents.filter(i => i.incident_type === "Salida Temprana").length },
                            { name: "Olvido Marcación", cantidad: filteredIncidents.filter(i => i.incident_type === "Olvido de Marcación").length }
                          ].filter(item => item.cantidad > 0)}
                        >
                          <CartesianGrid strokeDasharray="3 3" />
                          <XAxis dataKey="name" />
                          <YAxis />
                          <Tooltip />
                          <Bar dataKey="cantidad" fill="#ef4444" name="Cantidad" />
                        </BarChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>

                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50">
                      <CardTitle className="text-xl font-bold">Incidencias por Estado</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      <ResponsiveContainer width="100%" height={300}>
                        <PieChart>
                          <Pie
                            data={[
                              { name: "Pendiente", value: filteredIncidents.filter(i => i.status === "Pendiente").length },
                              { name: "Aprobada", value: filteredIncidents.filter(i => i.status === "Aprobada").length },
                              { name: "Rechazada", value: filteredIncidents.filter(i => i.status === "Rechazada").length }
                            ].filter(item => item.value > 0)}
                            cx="50%"
                            cy="50%"
                            labelLine={false}
                            label={({ name, value }) => `${name}: ${value}`}
                            outerRadius={100}
                            fill="#8884d8"
                            dataKey="value"
                          >
                            {['#f59e0b', '#10b981', '#ef4444'].map((color, index) => (
                              <Cell key={`cell-${index}`} fill={color} />
                            ))}
                          </Pie>
                          <Tooltip />
                        </PieChart>
                      </ResponsiveContainer>
                    </CardContent>
                  </Card>
                </>
              )}
            </TabsContent>

            {/* Details Tab */}
            <TabsContent value="details" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50">
                  <CardTitle className="text-xl font-bold">
                    Detalle por Empleado
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-4">
                    {displayEmployees.map(emp => {
                      const stats = calculateEmployeeStats(emp.id);

                      return (
                        <div key={emp.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                          <div className="flex items-start justify-between mb-3">
                            <div>
                              <h4 className="font-bold text-slate-900 text-lg">
                                {emp.first_name} {emp.last_name}
                              </h4>
                              <p className="text-slate-600 text-sm">
                                {emp.position} • {emp.department_name}
                              </p>
                            </div>
                            <Badge className={
                              stats.attendanceRate >= 95 ? "bg-green-100 text-green-700" :
                              stats.attendanceRate >= 85 ? "bg-yellow-100 text-yellow-700" :
                              "bg-red-100 text-red-700"
                            }>
                              {stats.attendanceRate}% asistencia
                            </Badge>
                          </div>

                          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                            <div className="p-3 bg-slate-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Días trabajados</p>
                              <p className="font-bold text-slate-900">{stats.presentDays} / {stats.expectedDays}</p>
                            </div>
                            <div className="p-3 bg-yellow-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Tardanzas</p>
                              <p className="font-bold text-yellow-700">{stats.lateDays} días</p>
                              <p className="text-xs text-yellow-600">{stats.totalLateMinutes} min</p>
                            </div>
                            <div className="p-3 bg-red-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Ausencias</p>
                              <p className="font-bold text-red-700">{stats.absentDays} días</p>
                            </div>
                            <div className="p-3 bg-blue-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Horas trabajadas</p>
                              <p className="font-bold text-blue-700">{stats.totalHours.toFixed(2)}h</p>
                            </div>
                            <div className="p-3 bg-purple-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Horas extras</p>
                              <p className="font-bold text-purple-700">{stats.overtimeHours.toFixed(2)}h</p>
                            </div>
                            <div className="p-3 bg-green-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Feriados</p>
                              <p className="font-bold text-green-700">{stats.holidaysInPeriod}</p>
                            </div>
                            <div className="p-3 bg-cyan-50 rounded-lg">
                              <p className="text-slate-600 text-xs mb-1">Vacaciones/Permisos</p>
                              <p className="font-bold text-cyan-700">{stats.vacationDaysInPeriod || 0}</p>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </PermissionGuard>
  );
}
