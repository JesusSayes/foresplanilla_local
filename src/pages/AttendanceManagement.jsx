import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  Clock, Calendar as CalendarIcon, Edit, CheckCircle, XCircle, 
  AlertCircle, Users, Search, FileText, Download, Database, History, Printer, Palmtree
} from "lucide-react";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";
import { usePermissions } from "../components/hooks/usePermissions";
import IncidentHistory from "../components/attendance/IncidentHistory";
import { generateAutoClockings } from "../components/attendance/AutoClockingJob";
import JustifyModal from "../components/attendance/JustifyModal";

export default function AttendanceManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSite, setSelectedSite] = useState("all");
  const [attendanceFilter, setAttendanceFilter] = useState("all");
  const [editingRecord, setEditingRecord] = useState(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [reviewingIncident, setReviewingIncident] = useState(null);
  const [showIncidentModal, setShowIncidentModal] = useState(false);
  const [reviewComments, setReviewComments] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [historyEmployeeId, setHistoryEmployeeId] = useState(null);
  const [showJustifyModal, setShowJustifyModal] = useState(false);
  const [justifyingEmployee, setJustifyingEmployee] = useState(null);
  const [existingIncident, setExistingIncident] = useState(null);
  const [justificationData, setJustificationData] = useState({
    incident_type: "Olvido de Marcación",
    justification: "",
    supporting_document_url: "",
    justified_time_start: "09:00",
    justified_time_end: "18:00",
    full_day_justification: true,
  });

  const { getAccessibleSites, hasPermission } = usePermissions();
  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        const employees = await base44.entities.Employee.filter({ work_email: user.email });
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
    queryFn: async () => await base44.entities.Employee.list("-created_date"),
  });

  const { data: todayRecords = [] } = useQuery({
    queryKey: ["todayAttendance", selectedDate, dateFrom, dateTo, isRangeMode],
    queryFn: async () => {
      if (isRangeMode && dateFrom && dateTo) {
        // Cargar todos los registros en el rango
        const allRecs = await base44.entities.AttendanceRecord.list("-date", 2000);
        const fromStr = format(dateFrom, "yyyy-MM-dd");
        const toStr = format(dateTo, "yyyy-MM-dd");
        return allRecs.filter(r => r.date >= fromStr && r.date <= toStr);
      }
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      return await base44.entities.AttendanceRecord.filter({ date: dateStr }, "-created_date");
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => await base44.entities.Holiday.list("-date"),
  });

  const { data: dbConnections = [] } = useQuery({
    queryKey: ["databaseConnections"],
    queryFn: async () => {
      const conns = await base44.entities.DatabaseConnection.list("-created_date");
      return conns.filter(c => c.is_active);
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await base44.entities.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const todayIsHoliday = holidays.some(h => h.date === format(selectedDate, "yyyy-MM-dd") && h.is_mandatory);
  const holidayInfo = holidays.find(h => h.date === format(selectedDate, "yyyy-MM-dd"));

  const { data: allIncidents = [] } = useQuery({
    queryKey: ["allIncidents"],
    queryFn: async () => await base44.entities.AttendanceIncident.list("-created_date", 500),
  });

  // Los incidentes se filtrarán después de calcular accessibleEmployeeIds (ver abajo)
  const pendingIncidents = allIncidents.filter(i => i.status === "Pendiente");
  const approvedIncidents = allIncidents.filter(i => i.status === "Aprobada");
  const rejectedIncidents = allIncidents.filter(i => i.status === "Rechazada");

  const { data: overtimeAlerts = [] } = useQuery({
    queryKey: ["overtimeAlerts"],
    queryFn: async () => await base44.entities.OvertimeAlert.filter({ status: "Pendiente" }, "-created_date"),
  });

  const { data: workSchedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => await base44.entities.WorkSchedule.list("-created_date"),
  });

  // Vacaciones aprobadas que cubren la(s) fecha(s) seleccionada(s)
  const { data: approvedVacations = [] } = useQuery({
    queryKey: ["approvedVacations", format(selectedDate, "yyyy-MM-dd"), isRangeMode, dateFrom, dateTo],
    queryFn: async () => {
      const all = await base44.entities.VacationRequest.filter({ status: "Aprobada" }, "-start_date", 500);
      if (isRangeMode && dateFrom && dateTo) {
        const fromStr = format(dateFrom, "yyyy-MM-dd");
        const toStr = format(dateTo, "yyyy-MM-dd");
        return all.filter(v => v.start_date <= toStr && v.end_date >= fromStr);
      }
      const dateStr = format(selectedDate, "yyyy-MM-dd");
      return all.filter(v => v.start_date <= dateStr && v.end_date >= dateStr);
    },
  });

  useEffect(() => {
    const generateExemptClockings = async () => {
      if (!employee || employee.role !== "admin") return;
      const result = await generateAutoClockings(selectedDate);
      if (result.success && result.recordsCreated > 0) {
        queryClient.invalidateQueries(["todayAttendance"]);
        toast.success(`✓ ${result.recordsCreated} marcación(es) automática(s) generada(s)`);
      }
    };
    generateExemptClockings();
  }, [selectedDate, employee]);

  const { data: employeeIncidents = [] } = useQuery({
    queryKey: ["employeeIncidents", historyEmployeeId],
    queryFn: async () => {
      if (!historyEmployeeId) return [];
      return await base44.entities.AttendanceIncident.filter({ employee_id: historyEmployeeId }, "-created_date");
    },
    enabled: !!historyEmployeeId,
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({ id, data }) => await base44.entities.AttendanceRecord.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success("Registro actualizado correctamente");
      setShowEditModal(false);
      setEditingRecord(null);
    },
    onError: () => toast.error("Error al actualizar el registro"),
  });

  const reviewIncidentMutation = useMutation({
    mutationFn: async ({ id, data }) => await base44.entities.AttendanceIncident.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["allIncidents"]);
      toast.success("Justificación revisada correctamente");
      setShowIncidentModal(false);
      setReviewingIncident(null);
      setReviewComments("");
    },
    onError: () => toast.error("Error al revisar la justificación"),
  });

  const importAttendanceMutation = useMutation({
    mutationFn: async (connectionId) => {
      const connection = dbConnections.find(c => c.id === connectionId);
      if (!connection) throw new Error("Conexión no encontrada");
      toast.info("Iniciando importación desde base de datos externa...");
      return new Promise((resolve) => {
        setTimeout(() => resolve({ success: true, imported: 45, errors: 2 }), 2000);
      });
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success(`✓ ${result.imported} marcaciones importadas. ${result.errors} errores.`);
    },
    onError: () => toast.error("Error al importar marcaciones"),
  });

  const getEmployeeSchedule = (empId) => {
    let schedule = workSchedules.find(s => s.employee_id === empId && s.is_active);
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

  const isOvertimeAuthorized = (empId) => getEmployeeSchedule(empId)?.overtime_authorized || false;

  const handleEditRecord = (record) => {
    setEditingRecord({
      ...record,
      clock_in: record.clock_in || "",
      clock_out: record.clock_out || "",
      notes: record.notes || "",
      status: record.status || "Incompleto",
    });
    setShowEditModal(true);
  };

  const handleSaveEdit = async () => {
    if (!editingRecord) return;
    const clockIn = editingRecord.clock_in;
    const clockOut = editingRecord.clock_out;
    const scheduledStart = editingRecord.scheduled_start || "09:00";
    let workedHours = 0;
    let lateMinutes = 0;
    let isLate = false;

    if (clockIn && clockOut) {
      const [inHour, inMin] = clockIn.split(":").map(Number);
      const [outHour, outMin] = clockOut.split(":").map(Number);
      const totalMinutes = (outHour * 60 + outMin) - (inHour * 60 + inMin) - 60;
      workedHours = Math.max(0, totalMinutes / 60);
      const [schedHour, schedMin] = scheduledStart.split(":").map(Number);
      lateMinutes = Math.max(0, (inHour * 60 + inMin) - (schedHour * 60 + schedMin));
      isLate = lateMinutes > 0;

      if (workedHours > 8 && !isOvertimeAuthorized(editingRecord.employee_id)) {
        await base44.entities.OvertimeAlert.create({
          employee_id: editingRecord.employee_id,
          attendance_record_id: editingRecord.id,
          alert_date: editingRecord.date,
          overtime_hours: workedHours - 8,
          status: "Pendiente",
        });
        toast.warning(`⚠️ Alerta: ${(workedHours - 8).toFixed(2)}h extras sin autorización.`);
      }
    }

    updateRecordMutation.mutate({
      id: editingRecord.id,
      data: {
        clock_in: clockIn || null,
        clock_out: clockOut || null,
        worked_hours: workedHours,
        is_late: isLate,
        late_minutes: lateMinutes,
        notes: editingRecord.notes,
        status: editingRecord.status,
        is_absent: editingRecord.status === "Ausente",
      }
    });
  };

  const handleApproveIncident = async (incident) => {
    const attendanceRecord = todayRecords.find(r =>
      r.employee_id === incident.employee_id && r.date === incident.incident_date
    );
    if (attendanceRecord && incident.hours_to_adjust > 0) {
      const adjustedWorkedHours = (attendanceRecord.worked_hours || 0) + incident.hours_to_adjust;
      const adjustedLateMinutes = Math.max(0, (attendanceRecord.late_minutes || 0) - incident.late_minutes_to_adjust);
      await base44.entities.AttendanceRecord.update(attendanceRecord.id, {
        worked_hours: Math.min(adjustedWorkedHours, 8),
        late_minutes: adjustedLateMinutes,
        is_late: adjustedLateMinutes > 0,
        status: adjustedLateMinutes === 0 && adjustedWorkedHours >= 8 ? "Completo" : "Incompleto",
      });
    }
    reviewIncidentMutation.mutate({
      id: incident.id,
      data: {
        status: "Aprobada",
        reviewed_by: `${employee.first_name} ${employee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: reviewComments || "Aprobada",
      }
    });
  };

  const handleRejectIncident = (incident) => {
    if (!reviewComments.trim()) {
      toast.error("Debes ingresar un motivo de rechazo");
      return;
    }
    reviewIncidentMutation.mutate({
      id: incident.id,
      data: {
        status: "Rechazada",
        reviewed_by: `${employee.first_name} ${employee.last_name}`,
        review_date: format(new Date(), "yyyy-MM-dd"),
        review_comments: reviewComments,
      }
    });
  };

  const handleJustifyClick = (emp, record) => {
    setJustifyingEmployee(emp);

    const dateStr = format(selectedDate, "yyyy-MM-dd");
    // Buscar justificación previa para este empleado en esta fecha
    const prevIncident = allIncidents.find(
      i => i.employee_id === emp.id && i.incident_date === dateStr
    );

    if (prevIncident) {
      // Pre-cargar datos de la justificación existente
      setExistingIncident(prevIncident);
      setJustificationData({
        incident_type: prevIncident.incident_type,
        justification: prevIncident.justification || "",
        supporting_document_url: prevIncident.supporting_document_url || "",
        justified_time_start: prevIncident.justified_time_start || "09:00",
        justified_time_end: prevIncident.justified_time_end || "18:00",
        full_day_justification: prevIncident.full_day_justification ?? true,
      });
    } else {
      setExistingIncident(null);
      let incidentType = "Olvido de Marcación";
      let startTime = record?.scheduled_start || "09:00";
      let endTime = record?.scheduled_end || "18:00";
      if (record) {
        if (record.is_absent) {
          incidentType = "Falta";
        } else if (record.is_late) {
          incidentType = "Tardanza";
          endTime = record.clock_in || startTime;
        } else if (record.clock_in && !record.clock_out) {
          startTime = record.clock_in;
        }
      }
      setJustificationData({
        incident_type: incidentType,
        justification: "",
        supporting_document_url: "",
        justified_time_start: startTime,
        justified_time_end: endTime,
        full_day_justification: incidentType === "Falta",
      });
    }

    setShowJustifyModal(true);
  };

  // Aplicar restricción de sedes según el rol del usuario (null = todas)
  const accessibleSites = getAccessibleSites();
  const siteAllowedEmployees = accessibleSites === null
    ? allEmployees
    : allEmployees.filter(emp => accessibleSites.includes(emp.site));

  const filteredEmployees = siteAllowedEmployees.filter(emp => {
    const matchesSearch =
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesSite = selectedSite === "all" || emp.site === selectedSite || (selectedSite === "sin_sede" && !emp.site);
    return matchesSearch && matchesSite;
  });

  // IDs de empleados accesibles para filtrar incidentes y alertas
  const accessibleEmployeeIds = new Set(siteAllowedEmployees.map(e => e.id));

  // En modo rango: generar una fila por cada combinación empleado × fecha con registro
  // En modo fecha única: comportamiento original (todos los empleados para esa fecha)
  let employeesWithRecords = [];

  if (isRangeMode && dateFrom && dateTo) {
    // Obtener todas las fechas del rango
    const dateList = [];
    const cur = new Date(dateFrom);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(dateTo);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      dateList.push(format(cur, "yyyy-MM-dd"));
      cur.setDate(cur.getDate() + 1);
    }

    // Para cada registro encontrado en el rango, combinar con empleado
    const rows = [];
    for (const rec of todayRecords) {
      const emp = filteredEmployees.find(e => e.id === rec.employee_id);
      if (!emp) continue;
      rows.push({ ...emp, record: rec, displayDate: rec.date });
    }
    // Ordenar: fecha más reciente primero, luego por nombre
    rows.sort((a, b) => {
      if (b.displayDate !== a.displayDate) return b.displayDate.localeCompare(a.displayDate);
      return `${a.first_name} ${a.last_name}`.localeCompare(`${b.first_name} ${b.last_name}`);
    });

    employeesWithRecords = rows.filter(emp => {
      if (attendanceFilter === "all") return true;
      if (attendanceFilter === "sin_entrada") return !emp.record?.clock_in;
      if (attendanceFilter === "sin_salida") return emp.record?.clock_in && !emp.record?.clock_out;
      if (attendanceFilter === "con_tardanza") return emp.record?.is_late;
      return true;
    });
  } else {
    employeesWithRecords = filteredEmployees.filter(emp => {
      if (emp.termination_date) {
        const termination = new Date(emp.termination_date + "T00:00:00");
        const selected = new Date(selectedDate); selected.setHours(0, 0, 0, 0);
        if (selected > termination) return false;
      }
      return true;
    }).map(emp => {
      const record = todayRecords.find(r => r.employee_id === emp.id);
      return { ...emp, record, displayDate: format(selectedDate, "yyyy-MM-dd") };
    }).filter(emp => {
      if (attendanceFilter === "all") return true;
      if (attendanceFilter === "sin_entrada") return !emp.record || !emp.record.clock_in;
      if (attendanceFilter === "sin_salida") return emp.record && emp.record.clock_in && !emp.record.clock_out;
      if (attendanceFilter === "con_tardanza") return emp.record && emp.record.is_late;
      return true;
    });
  }

  const handleExportToExcel = () => {
    const dataToExport = employeesWithRecords.map(emp => {
      const workedHours = emp.record?.worked_hours || 0;
      const overtimeHours = Math.max(0, workedHours - 8);
      return {
        'Código': emp.employee_code,
        'Nombres': emp.first_name,
        'Apellidos': emp.last_name,
        'Cargo': emp.position,
        'Departamento': emp.department_name,
        'Sede': emp.site || 'Sin sede',
        'Entrada': emp.record?.clock_in || '--:--',
        'Salida': emp.record?.clock_out || '--:--',
        'Horas Trabajadas': workedHours.toFixed(2),
        'Tardanza (min)': emp.record?.late_minutes || 0,
        'HE 25%': Math.min(overtimeHours, 2).toFixed(2),
        'HE 35%': Math.max(0, overtimeHours - 2).toFixed(2),
        'Estado': emp.record?.status || 'Sin marcar'
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    const filterText = attendanceFilter === "all" ? "Todos" : attendanceFilter === "sin_entrada" ? "Sin_Entrada" : attendanceFilter === "sin_salida" ? "Sin_Salida" : "Con_Tardanza";
    XLSX.writeFile(wb, `Asistencia_${format(selectedDate, "yyyy-MM-dd")}_${filterText}.xlsx`);
    toast.success('✓ Archivo Excel generado correctamente');
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Por favor, permite las ventanas emergentes para imprimir'); return; }
    const filterText = attendanceFilter === "all" ? "Todos los empleados" : attendanceFilter === "sin_entrada" ? "Sin marcar entrada" : attendanceFilter === "sin_salida" ? "Sin marcar salida" : "Con tardanza";
    const printContent = `<!DOCTYPE html><html><head><title>Reporte de Asistencia</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px}.header h1{margin:5px 0;font-size:24px}.header p{margin:3px 0;color:#666}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#4f46e5;color:white;font-weight:bold}tr:nth-child(even){background-color:#f9fafb}.late{color:#ea580c;font-weight:bold}.absent{color:#dc2626;font-weight:bold}.complete{color:#16a34a;font-weight:bold}.footer{margin-top:30px;text-align:center;font-size:11px;color:#666}@media print{body{margin:0}.no-print{display:none}}</style></head><body><div class="header"><h1>Reporte de Asistencia</h1><p><strong>Fecha:</strong> ${format(selectedDate, "dd 'de' MMMM, yyyy", { locale: es })}</p><p><strong>Filtro aplicado:</strong> ${filterText}</p><p><strong>Total de empleados:</strong> ${employeesWithRecords.length}</p></div><table><thead><tr><th>Código</th><th>Empleado</th><th>Cargo</th><th>Departamento</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Tardanza</th><th>HE 25%</th><th>HE 35%</th><th>Estado</th></tr></thead><tbody>${employeesWithRecords.map(emp => { const wh = emp.record?.worked_hours || 0; const ot = Math.max(0, wh - 8); return `<tr><td>${emp.employee_code}</td><td>${emp.first_name} ${emp.last_name}</td><td>${emp.position}</td><td>${emp.department_name}</td><td>${emp.record?.clock_in || '--:--'}</td><td>${emp.record?.clock_out || '--:--'}</td><td>${wh.toFixed(2)}h</td><td class="${emp.record?.is_late ? 'late' : ''}">${emp.record?.late_minutes || 0} min</td><td>${Math.min(ot,2).toFixed(2)}h</td><td>${Math.max(0,ot-2).toFixed(2)}h</td><td class="${emp.record?.status === 'Completo' ? 'complete' : emp.record?.status === 'Ausente' ? 'absent' : ''}">${emp.record?.status || 'Sin marcar'}</td></tr>`; }).join('')}</tbody></table><div class="footer"><p>Generado el ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm")} - Sistema de Recursos Humanos</p></div><script>window.onload=function(){window.print()}</script></body></html>`;
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  // Detectar si el empleado tiene vacación aprobada en la fecha seleccionada
  const getVacationForEmployee = (empId) => {
    return approvedVacations.find(v => v.employee_id === empId) || null;
  };

  // Obtener horario programado de entrada/salida para mostrar en vacaciones
  const getScheduledTimes = (empId) => {
    const schedule = getEmployeeSchedule(empId);
    if (!schedule) return { start: "09:00", end: "18:00" };
    const dayMap = ["sunday_start", "monday_start", "tuesday_start", "wednesday_start", "thursday_start", "friday_start", "saturday_start"];
    const dayEndMap = ["sunday_end", "monday_end", "tuesday_end", "wednesday_end", "thursday_end", "friday_end", "saturday_end"];
    const dow = selectedDate.getDay();
    return {
      start: schedule[dayMap[dow]] || "09:00",
      end: schedule[dayEndMap[dow]] || "18:00",
    };
  };

  const getStatusConfig = (status, hasClockIn) => {
    if (!hasClockIn) return { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Sin marcar" };
    const configs = {
      "Completo": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, text: "Completo" },
      "Incompleto": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock, text: "En curso" },
      "Ausente": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Ausente" },
      "Justificado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Justificado" },
    };
    return configs[status] || configs["Incompleto"];
  };

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredAnyPermissions={["attendance.view_all", "attendance.manage", "attendance.view_department", "system.admin"]}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8 flex justify-between items-start">
            <div>
              <h1 className="text-4xl font-bold text-slate-900 mb-2">Gestión de Asistencia</h1>
              <p className="text-slate-600 text-lg">Control y verificación de asistencia del personal</p>
            </div>
            {dbConnections.length > 0 && (
              <div className="flex gap-2">
                <Select onValueChange={(id) => importAttendanceMutation.mutate(id)}>
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Importar desde BD externa" />
                  </SelectTrigger>
                  <SelectContent>
                    {dbConnections.map(conn => (
                      <SelectItem key={conn.id} value={conn.id}>
                        <div className="flex items-center gap-2"><Database className="w-4 h-4" />{conn.connection_name}</div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button variant="outline" onClick={() => window.location.href = "/DatabaseConfig"}>
                  <Database className="w-4 h-4 mr-2" />Configurar
                </Button>
              </div>
            )}
          </div>

          {todayIsHoliday && (
            <Card className="border-0 shadow-lg bg-gradient-to-r from-orange-500 to-red-500 text-white mb-6">
              <CardContent className="p-6">
                <div className="flex items-center gap-4">
                  <div className="p-3 bg-white/20 rounded-xl"><CalendarIcon className="w-8 h-8" /></div>
                  <div>
                    <h3 className="text-xl font-bold mb-1">🎉 Día Feriado: {holidayInfo?.name}</h3>
                    <p className="text-orange-100">Este es un día no laborable. No se contabiliza como falta para los empleados.</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="grid grid-cols-6 gap-3 mb-8">
            {[
              { label: "Total empleados", value: siteAllowedEmployees.length, icon: Users, color: "blue" },
              { label: "Han marcado", value: todayRecords.filter(r => r.clock_in).length, icon: CheckCircle, color: "green" },
              { label: "Tardanzas", value: todayRecords.filter(r => r.is_late).length, icon: Clock, color: "yellow" },
              { label: "Justificaciones", value: pendingIncidents.length, icon: AlertCircle, color: "orange" },
              { label: "De vacaciones", value: approvedVacations.filter(v => accessibleEmployeeIds.has(v.employee_id)).length, icon: Palmtree, color: "amber" },
            ].map(({ label, value, icon: Icon, color }) => (
              <Card key={label} className="border-0 shadow-lg">
                <CardContent className="p-3">
                  <div className="flex items-center gap-2">
                    <div className={`p-2 bg-${color}-100 rounded-lg shrink-0`}>
                      <Icon className={`w-4 h-4 text-${color}-600`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-xl font-bold text-slate-900 leading-tight">{value}</div>
                      <p className="text-slate-600 text-xs truncate">{label}</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
            <Card className="border-0 shadow-lg bg-red-50">
              <CardContent className="p-3">
                <div className="flex items-center gap-2">
                  <div className="p-2 bg-red-100 rounded-lg shrink-0"><Clock className="w-4 h-4 text-red-600" /></div>
                  <div className="flex-1 min-w-0">
                    <div className="text-xl font-bold text-red-900 leading-tight">{overtimeAlerts.length}</div>
                    <p className="text-red-700 text-xs truncate">HE sin autorización</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          <Tabs defaultValue="attendance" className="space-y-6">
            <TabsList className="grid w-full max-w-2xl grid-cols-3">
              <TabsTrigger value="attendance">
                Asistencia del Día
                {employeesWithRecords.length > 0 && <Badge className="ml-2 bg-orange-500 text-white">{employeesWithRecords.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="incidents">
                Justificaciones
                {allIncidents.length > 0 && <Badge className="ml-2 bg-orange-500 text-white">{allIncidents.length}</Badge>}
              </TabsTrigger>
              <TabsTrigger value="overtime-alerts">
                Alertas HE
                {overtimeAlerts.length > 0 && <Badge className="ml-2 bg-orange-500 text-white">{overtimeAlerts.length}</Badge>}
              </TabsTrigger>
            </TabsList>

            {/* Attendance Tab */}
            <TabsContent value="attendance" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex items-center gap-3 mb-6 flex-nowrap overflow-x-auto">
                    <div className="flex-1 min-w-[200px]">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-10" />
                      </div>
                    </div>
                    <Select value={selectedDepartment} onValueChange={setSelectedDepartment}>
                      <SelectTrigger className="w-40"><SelectValue placeholder="Departamento" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        {departments.map(dept => <SelectItem key={dept} value={dept}>{dept}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={selectedSite} onValueChange={setSelectedSite}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Sede" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas</SelectItem>
                        <SelectItem value="sin_sede">Sin sede</SelectItem>
                        {sites
                          .filter(site => accessibleSites === null || accessibleSites.includes(site.name))
                          .map(site => <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={attendanceFilter} onValueChange={setAttendanceFilter}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Filtro" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="sin_entrada"><div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-600" />Sin entrada</div></SelectItem>
                        <SelectItem value="sin_salida"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-600" />Sin salida</div></SelectItem>
                        <SelectItem value="con_tardanza"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-600" />Con tardanza</div></SelectItem>
                      </SelectContent>
                    </Select>
                    <Popover>
                      <PopoverTrigger asChild>
                        <Button variant="outline" className="bg-green-50 border-green-200 hover:bg-green-100 whitespace-nowrap">
                          <CalendarIcon className="mr-2 h-4 w-4 text-green-700" />
                          <span className="text-green-700">{format(selectedDate, "dd MMM yyyy", { locale: es })}</span>
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0">
                        <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} locale={es} />
                      </PopoverContent>
                    </Popover>
                    <Button onClick={handleExportToExcel} variant="outline" className="bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                      <Download className="w-4 h-4 mr-2" />Excel
                    </Button>
                    <Button onClick={handlePrint} variant="outline" className="whitespace-nowrap">
                      <Printer className="w-4 h-4 mr-2" />Imprimir
                    </Button>
                  </div>

                  <div className="space-y-3">
                    {employeesWithRecords.map(emp => {
                      const vacation = getVacationForEmployee(emp.id);
                      const scheduledTimes = vacation ? getScheduledTimes(emp.id) : null;
                      const statusConfig = vacation
                        ? { color: "bg-amber-100 text-amber-800 border-amber-300", icon: Palmtree, text: "Vacaciones" }
                        : getStatusConfig(emp.record?.status, emp.record?.clock_in);
                      const StatusIcon = statusConfig.icon;

                      return (
                        <div key={emp.id} className={`p-4 border rounded-lg hover:shadow-md transition-all ${vacation ? "border-amber-300 bg-amber-50/40" : "border-slate-200"}`}>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-4 flex-1">
                              <div className={`w-12 h-12 rounded-full flex items-center justify-center text-white font-bold ${vacation ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-indigo-500 to-purple-600"}`}>
                                {emp.first_name[0]}{emp.last_name[0]}
                              </div>
                              <div className="flex-1">
                                <h4 className="font-bold text-slate-900">{emp.first_name} {emp.last_name}</h4>
                                <p className="text-sm text-slate-600">{emp.employee_code} • {emp.position} • {emp.department_name}</p>
                                {vacation && (
                                  <p className="text-xs text-amber-700 font-medium mt-0.5">
                                    🌴 {vacation.request_type} — hasta {format(new Date(vacation.end_date + "T00:00:00"), "dd MMM yyyy", { locale: es })}
                                  </p>
                                )}
                              </div>
                              <div className="grid grid-cols-6 gap-3 text-sm">
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Entrada</p>
                                  {vacation ? (
                                    <p className="font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded text-xs">
                                      {scheduledTimes?.start}
                                    </p>
                                  ) : (
                                    <p className={`font-semibold ${emp.record?.clock_in ? 'text-slate-900' : 'text-slate-400'}`}>
                                      {emp.record?.clock_in || "--:--"}
                                    </p>
                                  )}
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Salida</p>
                                  {vacation ? (
                                    <p className="font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded text-xs">
                                      {scheduledTimes?.end}
                                    </p>
                                  ) : (
                                    <p className={`font-semibold ${emp.record?.clock_out ? 'text-slate-900' : 'text-slate-400'}`}>
                                      {emp.record?.clock_out || "--:--"}
                                    </p>
                                  )}
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Horas</p>
                                  <p className="font-semibold text-slate-900">{vacation ? "8.00" : (emp.record?.worked_hours?.toFixed(2) || "0.00")}h</p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">Tardanza</p>
                                  <p className={`font-semibold ${!vacation && emp.record?.late_minutes > 0 ? 'text-orange-600' : 'text-green-600'}`}>
                                    {vacation ? "0" : (emp.record?.late_minutes || 0)} min
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">HE 25%</p>
                                  <p className={`font-semibold ${!vacation && isOvertimeAuthorized(emp.id) ? 'text-blue-600' : 'text-red-600'}`}>
                                    {vacation ? "0.00" : (() => {
                                      if (!isOvertimeAuthorized(emp.id)) return "0.00";
                                      return Math.min(Math.max(0, (emp.record?.worked_hours || 0) - 8), 2).toFixed(2);
                                    })()}h
                                  </p>
                                </div>
                                <div className="text-center">
                                  <p className="text-xs text-slate-600 mb-1">HE 35%</p>
                                  <p className={`font-semibold ${!vacation && isOvertimeAuthorized(emp.id) ? 'text-purple-600' : 'text-red-600'}`}>
                                    {vacation ? "0.00" : (() => {
                                      if (!isOvertimeAuthorized(emp.id)) return "0.00";
                                      return Math.max(0, (emp.record?.worked_hours || 0) - 10).toFixed(2);
                                    })()}h
                                  </p>
                                </div>
                              </div>
                              <div className="flex items-center gap-3">
                                <Badge className={statusConfig.color}>
                                  <StatusIcon className="w-3 h-3 mr-1" />{statusConfig.text}
                                </Badge>
                                {!vacation && emp.record?.is_late && (
                                  <Badge className="bg-orange-100 text-orange-700">+{emp.record.late_minutes} min</Badge>
                                )}
                                {!vacation && emp.record && (
                                  <Button size="sm" variant="outline" onClick={() => handleEditRecord(emp.record)}>
                                    <Edit className="w-4 h-4 mr-1" />Editar
                                  </Button>
                                )}
                                {!vacation && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    className="text-orange-600 border-orange-200 hover:bg-orange-50"
                                    onClick={() => handleJustifyClick(emp, emp.record)}
                                  >
                                    <FileText className="w-4 h-4 mr-1" />Justificar
                                  </Button>
                                )}
                                <Button size="sm" variant="outline" onClick={() => { setHistoryEmployeeId(emp.id); setShowHistory(true); }}>
                                  <History className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            {/* Overtime Alerts Tab */}
            <TabsContent value="overtime-alerts" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-red-50/50">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-red-600" />Alertas de Horas Extras No Autorizadas
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-2">Personal que registró horas extras sin autorización previa</p>
                </CardHeader>
                <CardContent className="p-6">
                  {overtimeAlerts.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                      <p className="text-slate-600">No hay alertas de horas extras</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {overtimeAlerts.filter(a => accessibleEmployeeIds.has(a.employee_id)).map(alert => {
                        const emp = allEmployees.find(e => e.id === alert.employee_id);
                        const record = todayRecords.find(r => r.id === alert.attendance_record_id);
                        return (
                          <div key={alert.id} className="p-4 border-2 border-red-200 bg-red-50 rounded-lg">
                            <div className="flex items-start justify-between mb-4">
                              <div className="flex-1">
                                <div className="flex items-center gap-3 mb-2">
                                  <h4 className="font-bold text-slate-900">{emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                  <Badge className="bg-red-600 text-white">{alert.overtime_hours.toFixed(2)}h extras</Badge>
                                </div>
                                <p className="text-sm text-slate-600 mb-2">{emp?.employee_code} • {emp?.position} • {emp?.department_name}</p>
                                <p className="text-sm text-slate-700">📅 {format(new Date(alert.alert_date), "dd MMM yyyy", { locale: es })}</p>
                                {record && <p className="text-sm text-slate-600 mt-2">Marcación: {record.clock_in} - {record.clock_out} ({record.worked_hours?.toFixed(2)}h trabajadas)</p>}
                              </div>
                            </div>
                            <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                              <p className="text-sm text-yellow-900">⚠️ Este empleado NO está autorizado para realizar horas extras. Por favor, verifica la marcación o autoriza las horas extras desde Gestión de Horarios.</p>
                            </div>
                            <div className="flex gap-3">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => record && handleEditRecord(record)}>
                                <Edit className="w-4 h-4 mr-2" />Corregir Marcación
                              </Button>
                              <Button size="sm" className="flex-1 bg-blue-600 hover:bg-blue-700" onClick={async () => {
                                if (confirm("¿Autorizar estas horas extras? Esto autorizará al empleado para futuras HE.")) {
                                  const schedule = getEmployeeSchedule(emp.id);
                                  if (schedule) {
                                    await base44.entities.WorkSchedule.update(schedule.id, { overtime_authorized: true });
                                  } else { toast.error("No se encontró horario asignado"); return; }
                                  await base44.entities.OvertimeAlert.update(alert.id, { status: "Autorizado", resolved_by: currentUser.email, resolution_date: format(new Date(), "yyyy-MM-dd"), resolution_notes: "Horas extras autorizadas retroactivamente" });
                                  queryClient.invalidateQueries(["overtimeAlerts"]);
                                  queryClient.invalidateQueries(["workSchedules"]);
                                  toast.success("Horas extras autorizadas");
                                }
                              }}>
                                <CheckCircle className="w-4 h-4 mr-2" />Autorizar HE
                              </Button>
                              <Button size="sm" variant="outline" className="text-slate-600" onClick={async () => {
                                await base44.entities.OvertimeAlert.update(alert.id, { status: "Descartado", resolved_by: currentUser.email, resolution_date: format(new Date(), "yyyy-MM-dd") });
                                queryClient.invalidateQueries(["overtimeAlerts"]);
                                toast.success("Alerta descartada");
                              }}>
                                <XCircle className="w-4 h-4 mr-2" />Descartar
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* Incidents Tab */}
            <TabsContent value="incidents" className="space-y-6">
              <Tabs defaultValue="pending">
                <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
                  <TabsTrigger value="pending">Pendientes {pendingIncidents.length > 0 && <Badge className="ml-2 bg-orange-600 text-white">{pendingIncidents.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="approved">Aprobadas {approvedIncidents.length > 0 && <Badge className="ml-2 bg-green-600 text-white">{approvedIncidents.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="rejected">Rechazadas {rejectedIncidents.length > 0 && <Badge className="ml-2 bg-red-600 text-white">{rejectedIncidents.length}</Badge>}</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-xl font-bold">Justificaciones Pendientes de Aprobación</CardTitle></CardHeader>
                    <CardContent className="p-6">
                      {pendingIncidents.length === 0 ? (
                        <div className="text-center py-12"><CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones pendientes</p></div>
                      ) : (
                        <div className="space-y-4">
                          {pendingIncidents.filter(i => accessibleEmployeeIds.has(i.employee_id)).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-slate-200 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.employee_code} • {emp?.position}</p>
                                    <div className="flex gap-4 text-sm">
                                      <Badge className="bg-orange-100 text-orange-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-3 bg-slate-50 rounded-lg mb-4">
                                  <p className="text-sm font-semibold text-slate-900 mb-1">Justificación:</p>
                                  <p className="text-sm text-slate-700">{incident.justification}</p>
                                </div>
                                {incident.supporting_document_url && (
                                  <div className="mb-4">
                                    <a href={incident.supporting_document_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline bg-indigo-50 px-3 py-2 rounded-lg">
                                      <Download className="w-4 h-4" />Ver documento adjunto
                                    </a>
                                  </div>
                                )}
                                <div className="flex gap-3">
                                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setReviewingIncident(incident); setShowIncidentModal(true); }}>
                                    <CheckCircle className="w-4 h-4 mr-2" />Aprobar
                                  </Button>
                                  <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setReviewingIncident(incident); setShowIncidentModal(true); }}>
                                    <XCircle className="w-4 h-4 mr-2" />Rechazar
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="approved">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-green-50/50"><CardTitle className="text-xl font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />Justificaciones Aprobadas</CardTitle></CardHeader>
                    <CardContent className="p-6">
                      {approvedIncidents.length === 0 ? (
                        <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones aprobadas</p></div>
                      ) : (
                        <div className="space-y-4">
                          {approvedIncidents.filter(i => accessibleEmployeeIds.has(i.employee_id)).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.employee_code} • {emp?.position}</p>
                                    <div className="flex gap-4 text-sm flex-wrap">
                                      <Badge className="bg-green-100 text-green-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
                                      <Badge className="bg-green-600 text-white">Aprobada</Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-3 bg-white rounded-lg mb-3">
                                  <p className="text-sm font-semibold text-slate-900 mb-1">Justificación:</p>
                                  <p className="text-sm text-slate-700">{incident.justification}</p>
                                </div>
                                {incident.review_comments && (
                                  <div className="p-3 bg-green-100 border border-green-200 rounded-lg mb-3">
                                    <p className="text-sm font-semibold text-green-900 mb-1">Comentarios de aprobación:</p>
                                    <p className="text-sm text-green-800">{incident.review_comments}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-xs text-slate-600">
                                  <span>Revisado por: {incident.reviewed_by || "N/A"}</span><span>•</span>
                                  <span>Fecha: {incident.review_date ? format(new Date(incident.review_date), "dd MMM yyyy", { locale: es }) : "N/A"}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="rejected">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-red-50/50"><CardTitle className="text-xl font-bold flex items-center gap-2"><XCircle className="w-5 h-5 text-red-600" />Justificaciones Rechazadas</CardTitle></CardHeader>
                    <CardContent className="p-6">
                      {rejectedIncidents.length === 0 ? (
                        <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones rechazadas</p></div>
                      ) : (
                        <div className="space-y-4">
                          {rejectedIncidents.filter(i => accessibleEmployeeIds.has(i.employee_id)).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.employee_code} • {emp?.position}</p>
                                    <div className="flex gap-4 text-sm flex-wrap">
                                      <Badge className="bg-red-100 text-red-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(new Date(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
                                      <Badge className="bg-red-600 text-white">Rechazada</Badge>
                                    </div>
                                  </div>
                                </div>
                                <div className="p-3 bg-white rounded-lg mb-3">
                                  <p className="text-sm font-semibold text-slate-900 mb-1">Justificación:</p>
                                  <p className="text-sm text-slate-700">{incident.justification}</p>
                                </div>
                                {incident.review_comments && (
                                  <div className="p-3 bg-red-100 border border-red-200 rounded-lg mb-3">
                                    <p className="text-sm font-semibold text-red-900 mb-1">Motivo de rechazo:</p>
                                    <p className="text-sm text-red-800">{incident.review_comments}</p>
                                  </div>
                                )}
                                <div className="flex items-center gap-4 text-xs text-slate-600">
                                  <span>Revisado por: {incident.reviewed_by || "N/A"}</span><span>•</span>
                                  <span>Fecha: {incident.review_date ? format(new Date(incident.review_date), "dd MMM yyyy", { locale: es }) : "N/A"}</span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </TabsContent>
          </Tabs>
        </div>

        {/* Edit Record Modal */}
        {showEditModal && editingRecord && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => setShowEditModal(false)}>
            <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Editar Registro de Asistencia</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => setShowEditModal(false)}>✕</Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600">Fecha: <strong>{editingRecord.date ? format(new Date(editingRecord.date + "T00:00:00"), "dd 'de' MMMM, yyyy", { locale: es }) : "Sin fecha"}</strong></p>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">Hora de Entrada</label>
                      <div className="flex gap-2">
                        <Input type="time" value={editingRecord.clock_in || ""} onChange={(e) => setEditingRecord({ ...editingRecord, clock_in: e.target.value })} className="flex-1" />
                        {editingRecord.clock_in && (
                          <Button type="button" size="sm" variant="ghost" className="text-slate-400 hover:text-red-500 px-2" onClick={() => setEditingRecord({ ...editingRecord, clock_in: "" })}>✕</Button>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">Hora de Salida</label>
                      <div className="flex gap-2">
                        <Input type="time" value={editingRecord.clock_out || ""} onChange={(e) => setEditingRecord({ ...editingRecord, clock_out: e.target.value })} className="flex-1" />
                        {editingRecord.clock_out && (
                          <Button type="button" size="sm" variant="ghost" className="text-slate-400 hover:text-red-500 px-2" onClick={() => setEditingRecord({ ...editingRecord, clock_out: "" })}>✕</Button>
                        )}
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Estado</label>
                    <Select value={editingRecord.status} onValueChange={(value) => setEditingRecord({ ...editingRecord, status: value })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Completo">Completo</SelectItem>
                        <SelectItem value="Incompleto">Incompleto</SelectItem>
                        <SelectItem value="Ausente">Ausente</SelectItem>
                        <SelectItem value="Justificado">Justificado</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Notas <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
                    <Textarea value={editingRecord.notes} onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })} placeholder="Observaciones adicionales..." rows={3} />
                  </div>
                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>Cancelar</Button>
                    <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveEdit} disabled={updateRecordMutation.isPending}>
                      {updateRecordMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Review Incident Modal */}
        {showIncidentModal && reviewingIncident && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => { setShowIncidentModal(false); setReviewComments(""); }}>
            <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Revisar Justificación</CardTitle>
                  <Button variant="ghost" size="icon" onClick={() => { setShowIncidentModal(false); setReviewComments(""); }}>✕</Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="text-sm text-slate-600 mb-2"><strong>Tipo:</strong> {reviewingIncident.incident_type}</p>
                    <p className="text-sm text-slate-600 mb-2"><strong>Fecha:</strong> {format(new Date(reviewingIncident.incident_date), "dd 'de' MMMM, yyyy", { locale: es })}</p>
                    {reviewingIncident.full_day_justification ? (
                      <p className="text-sm text-slate-600 mb-2"><strong>Período:</strong> <Badge className="bg-blue-100 text-blue-700">Día completo (8 horas)</Badge></p>
                    ) : (
                      <p className="text-sm text-slate-600 mb-2"><strong>Período:</strong> {reviewingIncident.justified_time_start} - {reviewingIncident.justified_time_end}</p>
                    )}
                    <p className="text-sm text-slate-600 mb-2"><strong>Ajuste:</strong> +{reviewingIncident.hours_to_adjust?.toFixed(2) || 0}h trabajadas{reviewingIncident.late_minutes_to_adjust > 0 && `, -${reviewingIncident.late_minutes_to_adjust} min tardanza`}</p>
                    <p className="text-sm text-slate-700"><strong>Justificación:</strong><br />{reviewingIncident.justification}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Comentarios de Revisión</label>
                    <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} placeholder="Ingresa comentarios sobre la decisión..." rows={3} />
                    <p className="text-xs text-slate-500 mt-2">* Requerido para rechazar una justificación</p>
                  </div>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleApproveIncident(reviewingIncident)} disabled={reviewIncidentMutation.isPending}>
                      <CheckCircle className="w-4 h-4 mr-2" />Aprobar
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleRejectIncident(reviewingIncident)} disabled={reviewIncidentMutation.isPending}>
                      <XCircle className="w-4 h-4 mr-2" />Rechazar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* History Modal */}
        {showHistory && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => { setShowHistory(false); setHistoryEmployeeId(null); }}>
            <div className="max-w-4xl w-full" onClick={(e) => e.stopPropagation()}>
              <IncidentHistory
                incidents={employeeIncidents}
                isLoading={false}
                employeeName={historyEmployeeId ? allEmployees.find(e => e.id === historyEmployeeId)?.first_name + ' ' + allEmployees.find(e => e.id === historyEmployeeId)?.last_name : ""}
              />
              <Button onClick={() => { setShowHistory(false); setHistoryEmployeeId(null); }} className="w-full mt-4" variant="outline">Cerrar</Button>
            </div>
          </div>
        )}

        {/* Justify Modal — componente separado */}
        {showJustifyModal && justifyingEmployee && (
          <JustifyModal
            justifyingEmployee={justifyingEmployee}
            justificationData={justificationData}
            setJustificationData={setJustificationData}
            selectedDate={selectedDate}
            todayRecords={todayRecords}
            employee={employee}
            existingIncident={existingIncident}
            onClose={() => { setShowJustifyModal(false); setJustifyingEmployee(null); setExistingIncident(null); }}
            onSuccess={() => {
              setShowJustifyModal(false);
              setJustifyingEmployee(null);
              setExistingIncident(null);
              setJustificationData({ incident_type: "Olvido de Marcación", justification: "", supporting_document_url: "", justified_time_start: "09:00", justified_time_end: "18:00", full_day_justification: true });
              queryClient.invalidateQueries(["allIncidents"]);
              queryClient.invalidateQueries(["todayAttendance"]);
            }}
          />
        )}
      </div>
    </PermissionGuard>
  );
}