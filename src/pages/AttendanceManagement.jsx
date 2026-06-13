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
  AlertCircle, Users, Search, FileText, Download, Database, History, Printer, Palmtree, CalendarClock
} from "lucide-react";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { todayLima, todayDateLima, parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import IncidentHistory from "../components/attendance/IncidentHistory";
import { generateAutoClockings } from "../components/attendance/AutoClockingJob";
import JustifyModal from "../components/attendance/JustifyModal";
import AssignScheduleModal from "../components/attendance/AssignScheduleModal";
import AttendanceEditRequestModal from "../components/attendance/AttendanceEditRequestModal";
import AttendanceEditRequestsPanel from "../components/attendance/AttendanceEditRequestsPanel";

export default function AttendanceManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedDate, setSelectedDate] = useState(todayDateLima());
  const [dateFrom, setDateFrom] = useState(null);
  const [dateTo, setDateTo] = useState(null);
  const [isRangeMode, setIsRangeMode] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSite, setSelectedSite] = useState("all");
  const [selectedArea, setSelectedArea] = useState("all");
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
  const [justifyingDate, setJustifyingDate] = useState(null);
  const [showScheduleModal, setShowScheduleModal] = useState(false);
  const [schedulingEmployee, setSchedulingEmployee] = useState(null);
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editRequestRecord, setEditRequestRecord] = useState(null);
  const [editRequestEmployee, setEditRequestEmployee] = useState(null);
  const [incidentSearchTerm, setIncidentSearchTerm] = useState("");
  const [overtimeSearchTerm, setOvertimeSearchTerm] = useState("");
  const [pageSize, setPageSize] = useState(300);
  const [currentPage, setCurrentPage] = useState(1);
  const [justificationData, setJustificationData] = useState({
    incident_type: "Omisión de Marcación",
    justification: "",
    supporting_document_url: "",
    justified_time_start: "09:00",
    justified_time_end: "18:00",
    full_day_justification: true,
  });

  const { getAccessibleSites, hasPermission, loading: permissionsLoading, employee: permEmployee } = usePermissions();
  const queryClient = useQueryClient();

  // Definir aquí para que esté disponible en todos los useEffect y handlers
  const effectiveEmployee = employee || permEmployee;

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
        const fromStr = dateToStringLima(dateFrom);
        const toStr = dateToStringLima(dateTo);
        return allRecs.filter(r => r.date >= fromStr && r.date <= toStr);
      }
      const dateStr = dateToStringLima(selectedDate);
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

  const todayIsHoliday = holidays.some(h => h.date === dateToStringLima(selectedDate) && h.is_mandatory);
  const holidayInfo = holidays.find(h => h.date === dateToStringLima(selectedDate));

  const { data: allIncidents = [] } = useQuery({
    queryKey: ["allIncidents"],
    queryFn: async () => await base44.entities.AttendanceIncident.list("-created_date", 2000),
  });

  // Los incidentes se filtrarán después de calcular accessibleEmployeeIds (ver abajo)
  const pendingIncidents = allIncidents.filter(i => i.status === "Pendiente");
  const approvedIncidents = allIncidents.filter(i => i.status === "Aprobada");
  const rejectedIncidents = allIncidents.filter(i => i.status === "Rechazada");

  const { data: overtimeAlerts = [] } = useQuery({
    queryKey: ["overtimeAlerts"],
    queryFn: async () => await base44.entities.OvertimeAlert.filter({ status: "Pendiente" }, "-created_date"),
  });

  const { data: pendingEditRequests = [] } = useQuery({
    queryKey: ["attendanceEditRequests"],
    queryFn: async () => await base44.entities.AttendanceEditRequest.filter({ status: "Pendiente" }, "-requested_at", 500),
  });

  const { data: workSchedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => await base44.entities.WorkSchedule.list("-created_date"),
  });

  // Vacaciones aprobadas que cubren la(s) fecha(s) seleccionada(s)
  const { data: approvedVacations = [] } = useQuery({
    queryKey: ["approvedVacations", dateToStringLima(selectedDate), isRangeMode, dateFrom, dateTo],
    queryFn: async () => {
      const all = await base44.entities.VacationRequest.filter({ status: "Aprobada" }, "-start_date", 500);
      if (isRangeMode && dateFrom && dateTo) {
        const fromStr = dateToStringLima(dateFrom);
        const toStr = dateToStringLima(dateTo);
        return all.filter(v => v.start_date <= toStr && v.end_date >= fromStr);
      }
      const dateStr = dateToStringLima(selectedDate);
      return all.filter(v => v.start_date <= dateStr && v.end_date >= dateStr);
    },
  });

  useEffect(() => {
    const generateExemptClockings = async () => {
      if (!effectiveEmployee || effectiveEmployee.role !== "admin") return;
      const result = await generateAutoClockings(selectedDate);
      if (result.success && result.recordsCreated > 0) {
        queryClient.invalidateQueries(["todayAttendance"]);
        toast.success(`✓ ${result.recordsCreated} marcación(es) automática(s) generada(s)`);
      }
    };
    generateExemptClockings();
  }, [selectedDate, effectiveEmployee]);

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
    onSuccess: async (result) => {
      // Recalcular métricas para todos los empleados con registros en la fecha seleccionada
      const dateStr = dateToStringLima(selectedDate);
      const recordsForDate = await base44.entities.AttendanceRecord.filter({ date: dateStr });
      const affectedEmployeeIds = [...new Set(recordsForDate.map(r => r.employee_id))];
      for (const empId of affectedEmployeeIds) {
        await base44.functions.invoke("recalcularAsistencia", {
          employee_id: empId,
          date_from: dateStr,
          date_to: dateStr,
        });
      }
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success(`✓ ${result.imported} marcaciones importadas y métricas recalculadas. ${result.errors} errores.`);
    },
    onError: () => toast.error("Error al importar marcaciones"),
  });

  // Obtener horario vigente para un empleado en una fecha específica (respeta effective_from/to)
  const getEmployeeScheduleForDate = (empId, dateStr) => {
    const emp = allEmployees.find(e => e.id === empId);
    const dStr = dateStr || format(selectedDate, "yyyy-MM-dd");

    const candidates = workSchedules.filter(s => {
      if (!s.is_active) return false;
      const isForEmployee = s.employee_id === empId;
      const isForDept = !s.employee_id && emp?.department_name &&
        (s.departments?.includes(emp.department_name) || s.department_name === emp.department_name);
      return isForEmployee || isForDept;
    });

    const empSchedules = candidates.filter(s => s.employee_id === empId);
    const deptSchedules = candidates.filter(s => !s.employee_id);

    const findBest = (list) => {
      const valid = list.filter(s => {
        const from = s.effective_from || "0000-01-01";
        const to = s.effective_to || "9999-12-31";
        return from <= dStr && to >= dStr;
      });
      valid.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
      return valid[0] || null;
    };

    return findBest(empSchedules) || findBest(deptSchedules) || null;
  };

  // Compatibilidad: sin fecha usa la fecha seleccionada
  const getEmployeeSchedule = (empId) => getEmployeeScheduleForDate(empId, dateToStringLima(selectedDate));
  const isOvertimeAuthorized = (empId) => getEmployeeSchedule(empId)?.overtime_authorized || false;

  const handleEditRecord = (record, empOverride) => {
    // Buscar el empleado del registro
    const emp = empOverride || allEmployees.find(e => e.id === record.employee_id);
    // Verificar si hay solicitud pendiente para este registro
    const existingPending = pendingEditRequests.find(r => r.attendance_record_id === record.id);
    if (existingPending) {
      toast.warning("Ya existe una solicitud de edición pendiente para este registro. Espera a que sea revisada.");
      return;
    }
    setEditRequestRecord(record);
    setEditRequestEmployee(emp);
    setShowEditRequestModal(true);
  };

  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Calcular preview de métricas en tiempo real para el modal de edición
  const calcEditPreview = (clockIn, clockOut, recordDate, employeeId) => {
    if (!clockIn) return null;
    const schedule = getEmployeeScheduleForDate(employeeId, recordDate);
    const dow = new Date(recordDate + "T00:00:00").getDay();
    const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
    const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
    const scheduledStart  = schedule ? (schedule[dayStartMap[dow]] || "09:00") : "09:00";
    const scheduledEnd    = schedule ? (schedule[dayEndMap[dow]]   || "18:00") : "18:00";
    const breakMinutes    = schedule?.break_duration_minutes ?? 60;
    const toleranceMinutes = schedule?.tolerance_minutes ?? 10;
    const overtimeAuthorized = schedule?.overtime_authorized ?? false;

    const [inH, inM]   = clockIn.split(":").map(Number);
    const inTotal      = inH * 60 + inM;
    const [schedH, schedM] = scheduledStart.split(":").map(Number);
    const schedTotal   = schedH * 60 + schedM;
    const [endH, endM] = scheduledEnd.split(":").map(Number);
    const schedEndTotal = endH * 60 + endM;

    const rawLate = inTotal - schedTotal;
    const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;

    let workedHours = 0, regularHours = 0, overtimeHours25 = 0, overtimeHours35 = 0;
    if (clockOut) {
      const [outH, outM] = clockOut.split(":").map(Number);
      const outTotal = outH * 60 + outM;
      const totalMinutes = outTotal - inTotal - breakMinutes;
      workedHours = Math.max(0, totalMinutes / 60);
      const regularMinutes = Math.max(0, schedEndTotal - Math.max(inTotal, schedTotal) - breakMinutes);
      const normalHoursMax = regularMinutes / 60;
      if (workedHours <= normalHoursMax) {
        regularHours = workedHours;
      } else {
        regularHours = normalHoursMax;
        const extraHours = workedHours - normalHoursMax;
        if (overtimeAuthorized) {
          overtimeHours25 = Math.min(extraHours, 2);
          overtimeHours35 = Math.max(0, extraHours - 2);
        }
      }
    }
    return { scheduledStart, scheduledEnd, lateMinutes, isLate: lateMinutes > 0, workedHours, regularHours, overtimeHours25, overtimeHours35, overtimeAuthorized };
  };

  const handleSaveEdit = async () => {
    if (!editingRecord || isSavingEdit) return;
    setIsSavingEdit(true);
    const clockIn  = editingRecord.clock_in;
    const clockOut = editingRecord.clock_out;
    const recordDate = editingRecord.date;

    try {
      // 1. Guardar clock_in/out, notas y estado.
      //    IMPORTANTE: NO tocar overtime_authorized aquí — eso solo lo cambia la aprobación de la alerta.
      await base44.entities.AttendanceRecord.update(editingRecord.id, {
        clock_in:  clockIn  || null,
        clock_out: clockOut || null,
        notes:     editingRecord.notes,
        status:    editingRecord.status,
        is_absent: editingRecord.status === "Ausente",
      });

      // 2. Si hay entrada Y salida, verificar si existen HE sin autorización
      if (clockIn && clockOut) {
        const schedule = getEmployeeScheduleForDate(editingRecord.employee_id, recordDate);
        if (schedule) {
          const dow = new Date(recordDate + "T00:00:00").getDay();
          const dayEndMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
          const schedStart = (() => {
            const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
            return schedule[dayStartMap[dow]] || "09:00";
          })();
          const schedEnd   = schedule[dayEndMap[dow]] || "18:00";
          const breakMin   = schedule.break_duration_minutes ?? 60;

          const [inH, inM]   = clockIn.split(":").map(Number);
          const [outH, outM] = clockOut.split(":").map(Number);
          const [endH, endM] = schedEnd.split(":").map(Number);
          const [stH, stM]   = schedStart.split(":").map(Number);

          const inTotal    = inH * 60 + inM;
          const outTotal   = outH * 60 + outM;
          const schedEndMin = endH * 60 + endM;
          const schedStartMin = stH * 60 + stM;

          const workedMin  = outTotal - inTotal - breakMin;
          const workedHrs  = Math.max(0, workedMin / 60);
          // Horas normales = desde cuando empezó (o desde su hora programada si llegó tarde) hasta fin de jornada, menos break
          const normalHrs  = Math.max(0, (schedEndMin - Math.max(inTotal, schedStartMin) - breakMin) / 60);
          const extraHrs   = Math.max(0, workedHrs - normalHrs);

          // overtime_authorized: usa el valor actual del registro (ya persistido) o el del horario
          const overtimeAuth = editingRecord.overtime_authorized ?? schedule.overtime_authorized ?? false;

          // Buscar alertas pendientes para este registro
          const existingAlerts = await base44.entities.OvertimeAlert.filter({
            attendance_record_id: editingRecord.id,
            status: "Pendiente",
          });

          if (extraHrs > 0 && !overtimeAuth) {
            if (!existingAlerts || existingAlerts.length === 0) {
              // Crear nueva alerta
              await base44.entities.OvertimeAlert.create({
                employee_id:          editingRecord.employee_id,
                attendance_record_id: editingRecord.id,
                alert_date:           recordDate,
                overtime_hours:       extraHrs,
                status:               "Pendiente",
              });
              toast.warning(`⚠️ ${extraHrs.toFixed(2)}h extras sin autorización — se generó alerta de aprobación.`);
            } else {
              // Actualizar la alerta existente con las nuevas horas
              await base44.entities.OvertimeAlert.update(existingAlerts[0].id, {
                overtime_hours: extraHrs,
              });
              toast.warning(`⚠️ ${extraHrs.toFixed(2)}h extras — alerta de aprobación pendiente.`);
            }
          } else if (extraHrs === 0 && existingAlerts && existingAlerts.length > 0) {
            // La marcación corregida ya no genera extras → cancelar alerta pendiente
            await base44.entities.OvertimeAlert.update(existingAlerts[0].id, { status: "Descartado" });
          }
        }
      }

      // 3. Recalcular con el backend.
      //    El backend respeta overtime_authorized del registro:
      //    - Si es false (o no hay alerta aprobada), HE quedan en 0.
      //    - Si es true (alerta aprobada), calcula HE 25% y 35%.
      await base44.functions.invoke("recalcularAsistencia", {
        employee_id: editingRecord.employee_id,
        date_from:   recordDate,
        date_to:     recordDate,
      });

      queryClient.invalidateQueries(["todayAttendance"]);
      queryClient.invalidateQueries(["overtimeAlerts"]);
      toast.success("Registro actualizado y métricas recalculadas");
      setShowEditModal(false);
      setEditingRecord(null);
    } finally {
      setIsSavingEdit(false);
    }
  };

  const handleApproveIncident = async (incident) => {
    // No modificar clock_in, clock_out, worked_hours ni regular_hours del AttendanceRecord.
    // Las horas justificadas viven en attendance_incident.hours_to_adjust.
    // Solo actualizamos el status del incidente vía reviewIncidentMutation.
    reviewIncidentMutation.mutate({
      id: incident.id,
      data: {
        status: "Aprobada",
        reviewed_by: `${effectiveEmployee?.first_name} ${effectiveEmployee?.last_name}`,
        review_date: todayLima(),
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
        reviewed_by: `${effectiveEmployee?.first_name} ${effectiveEmployee?.last_name}`,
        review_date: todayLima(),
        review_comments: reviewComments,
      }
    });
  };

  const [justifyingSchedule, setJustifyingSchedule] = useState(null);

  const handleJustifyClick = async (emp, record, overrideDate) => {
    setJustifyingEmployee(emp);

    const dateStr = overrideDate || dateToStringLima(selectedDate);
    setJustifyingDate(overrideDate ? new Date(overrideDate + "T00:00:00") : selectedDate);

    // Obtener el horario del empleado para la fecha específica
    const sched = getEmployeeScheduleForDate(emp.id, dateStr);
    const dow = new Date(dateStr + "T00:00:00").getDay();
    const dayStarts = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
    const dayEnds   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
    setJustifyingSchedule(sched ? {
      start: sched[dayStarts[dow]] || "09:00",
      end:   sched[dayEnds[dow]]   || "18:00",
    } : { start: "09:00", end: "18:00" });

    // Buscar justificación previa: primero en cache local, si no — fetch directo por fecha exacta
    let prevIncident = allIncidents.find(
      i => i.employee_id === emp.id && i.incident_date === dateStr
    );

    if (!prevIncident) {
      // Fetch directo para asegurar que encontramos el incidente aunque no esté en los 500 cargados
      const fetched = await base44.entities.AttendanceIncident.filter({
        employee_id: emp.id,
        incident_date: dateStr,
      });
      prevIncident = fetched?.[0] || null;
    }

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

      // Horario programado del día
      const schedStart = sched ? (sched[dayStarts[dow]] || "09:00") : "09:00";
      const schedEnd   = sched ? (sched[dayEnds[dow]]   || "18:00") : "18:00";

      const toMin = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
      const fromMin = (m) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const breakMin = sched?.break_duration_minutes ?? 60;

      const schedStartMin = toMin(schedStart);
      const schedEndMin   = toMin(schedEnd);
      // Horas de jornada completa (sin break)
      const fullDayHours = Math.max(0, (schedEndMin - schedStartMin - breakMin) / 60);

      let incidentType = "Omisión de Marcación";
      let startTime = schedStart;
      let endTime = schedEnd;
      let isFullDay = false;

      if (!record || record.is_absent || (!record.clock_in && !record.clock_out)) {
        // Sin ninguna marcación → justificar día completo
        incidentType = record?.is_absent ? "Falta" : "Omisión de Marcación";
        isFullDay = true;
        startTime = schedStart;
        endTime = schedEnd;
      } else if (record.clock_in && !record.clock_out) {
        // Tiene entrada pero no salida → justificar desde salida programada
        // Las horas a justificar son las que faltan desde la hora programada de salida
        const clockInMin = toMin(record.clock_in.slice(0, 5));
        // Horas ya trabajadas (estimado hasta fin de jornada)
        const workedSoFar = Math.max(0, (schedEndMin - clockInMin - breakMin) / 60);
        const missingHours = Math.max(0, fullDayHours - workedSoFar);

        if (missingHours <= 0) {
          // Ya completó la jornada, justificar salida programada
          startTime = schedEnd;
          endTime = schedEnd;
        } else {
          // Justificar desde la hora de salida programada
          startTime = schedEnd;
          endTime = schedEnd;
        }
        incidentType = "Omisión de Marcación";
        isFullDay = false;
      } else if (record.clock_in && record.clock_out) {
        // Tiene entrada y salida pero hay horas faltantes
        const clockInMin  = toMin(record.clock_in.slice(0, 5));
        const clockOutMin = toMin(record.clock_out.slice(0, 5));
        const workedMin   = Math.max(0, clockOutMin - clockInMin - breakMin);
        const workedHrs   = workedMin / 60;
        const missingHrs  = Math.max(0, fullDayHours - workedHrs);

        if (missingHrs > 0) {
          // Calcular el período faltante: desde clock_out hasta completar la jornada
          const justEndMin  = Math.min(clockOutMin + Math.round(missingHrs * 60), schedEndMin);
          startTime = record.clock_out.slice(0, 5);
          endTime   = fromMin(justEndMin);
        } else {
          startTime = schedStart;
          endTime   = schedEnd;
          isFullDay = true;
        }
        incidentType = "Omisión de Marcación";
        isFullDay = false;
      } else if (record.is_late) {
        // Llegó tarde → justificar tardanza (desde schedStart hasta clock_in)
        incidentType = "Justificación de Tardanza";
        startTime = schedStart;
        endTime   = record.clock_in?.slice(0, 5) || schedStart;
        isFullDay = false;
      }

      setJustificationData({
        incident_type: incidentType,
        justification: "",
        supporting_document_url: "",
        justified_time_start: startTime,
        justified_time_end: endTime,
        full_day_justification: isFullDay,
      });
    }

    setShowJustifyModal(true);
  };

  // Aplicar restricción de sedes según el rol (null=todas, undefined=cargando)
  const accessibleSites = permissionsLoading ? undefined : getAccessibleSites();
  const isSiteRestricted = accessibleSites !== null && accessibleSites !== undefined;
  const hasSingleSite = isSiteRestricted && Array.isArray(accessibleSites) && accessibleSites.length === 1;

  // Auto-aplicar filtro de sede cuando hay restricción a una sola sede
  useEffect(() => {
    if (hasSingleSite) {
      setSelectedSite(accessibleSites[0]);
    }
  }, [hasSingleSite, Array.isArray(accessibleSites) ? accessibleSites.join(",") : ""]);

  const siteAllowedEmployees = accessibleSites === undefined
    ? [] // cargando permisos
    : accessibleSites === null
      ? allEmployees // acceso total
      : allEmployees.filter(emp => accessibleSites.includes(emp.site));

  const filteredEmployees = siteAllowedEmployees.filter(emp => {
    const term = searchTerm.toLowerCase().trim();
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const fullNameReverse = `${emp.last_name} ${emp.first_name}`.toLowerCase();
    const matchesSearch = !term ||
      fullName.includes(term) ||
      fullNameReverse.includes(term) ||
      emp.document_number.toLowerCase().includes(term) ||
      term.split(/\s+/).every(word => fullName.includes(word));
    const matchesSite = selectedSite === "all" || emp.site === selectedSite || (selectedSite === "sin_sede" && !emp.site);
    const matchesArea = selectedArea === "all" || emp.area_trabajo === selectedArea || (selectedArea === "sin_area" && !emp.area_trabajo);
    return matchesSearch && matchesSite && matchesArea;
  });

  // IDs de empleados accesibles para filtrar incidentes y alertas
  const accessibleEmployeeIds = new Set(siteAllowedEmployees.map(e => e.id));

  // En modo rango: generar una fila por cada combinación empleado × fecha con registro
  // En modo fecha única: comportamiento original (todos los empleados para esa fecha)
  let employeesWithRecords = [];

  const todayDateStr = todayLima();

  if (isRangeMode && dateFrom && dateTo) {
    // Generar todas las fechas del rango, solo hasta hoy
    const dateList = [];
    const cur = new Date(dateFrom);
    cur.setHours(0, 0, 0, 0);
    const end = new Date(dateTo);
    end.setHours(0, 0, 0, 0);
    while (cur <= end) {
      const dateStr = format(cur, "yyyy-MM-dd");
      if (dateStr <= todayDateStr) dateList.push(dateStr);
      cur.setDate(cur.getDate() + 1);
    }

    // Para cada empleado filtrado × cada fecha → una fila (solo si existe registro en BD)
    const rows = [];
    for (const emp of filteredEmployees) {
      // Excluir empleados cesados antes del rango
      if (emp.termination_date) {
        const termination = new Date(emp.termination_date + "T00:00:00");
        const rangeStart = new Date(dateFrom); rangeStart.setHours(0, 0, 0, 0);
        if (rangeStart > termination) continue;
      }
      for (const dateStr of dateList) {
        // Si el empleado estaba cesado en esta fecha específica, omitir
        if (emp.termination_date) {
          const termination = new Date(emp.termination_date + "T00:00:00");
          const rowDay = new Date(dateStr + "T00:00:00");
          if (rowDay > termination) continue;
        }
        const record = todayRecords.find(r => r.employee_id === emp.id && r.date === dateStr);
        if (!record) continue; // solo mostrar si existe registro en la BD
        rows.push({ ...emp, record, displayDate: dateStr });
      }
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
    // Solo mostrar empleados que tengan un registro en la BD para la fecha seleccionada (no futura)
    const selectedDateStr = dateToStringLima(selectedDate);
    if (selectedDateStr > todayDateStr) {
      employeesWithRecords = [];
    } else {
    employeesWithRecords = filteredEmployees.filter(emp => {
      if (emp.termination_date) {
        const termination = new Date(emp.termination_date + "T00:00:00");
        const selected = new Date(selectedDate); selected.setHours(0, 0, 0, 0);
        if (selected > termination) return false;
      }
      const record = todayRecords.find(r => r.employee_id === emp.id);
      return !!record; // solo si existe registro en la BD
    }).map(emp => {
      const record = todayRecords.find(r => r.employee_id === emp.id);
      return { ...emp, record, displayDate: format(selectedDate, "yyyy-MM-dd") };
    }).filter(emp => {
      if (attendanceFilter === "all") return true;
      if (attendanceFilter === "sin_entrada") return !emp.record.clock_in;
      if (attendanceFilter === "sin_salida") return emp.record.clock_in && !emp.record.clock_out;
      if (attendanceFilter === "con_tardanza") return emp.record.is_late;
      return true;
    });
    } // end else (fecha no futura)
  }

  const [recalculandoTodo, setRecalculandoTodo] = useState(false);
  const [recalcProgress, setRecalcProgress] = useState({ done: 0, total: 0 });

  const handleRecalcularTodo = async () => {
    if (!window.confirm("¿Recalcular tardanzas y horas para TODOS los empleados? Esto puede tardar varios minutos.")) return;
    setRecalculandoTodo(true);
    const empList = allEmployees.filter(e => e.status === "Activo");
    setRecalcProgress({ done: 0, total: empList.length });
    let done = 0;
    for (const emp of empList) {
      await base44.functions.invoke("recalcularAsistencia", {
        employee_id: emp.id,
        date_from: "2020-01-01",
        date_to: format(new Date(), "yyyy-MM-dd"),
      });
      done++;
      setRecalcProgress({ done, total: empList.length });
    }
    setRecalculandoTodo(false);
    queryClient.invalidateQueries(["todayAttendance"]);
    toast.success(`✓ Recálculo completado para ${done} empleados`);
  };

  const handleExportToExcel = async () => {
    // Cargar TODOS los incidentes frescos para no depender del caché limitado
    let freshIncidents = allIncidents;
    try {
      const fetched = await base44.entities.AttendanceIncident.list("-incident_date", 5000);
      if (fetched && fetched.length > 0) freshIncidents = fetched;
    } catch (_) { /* usa caché si falla */ }

    const dataToExport = employeesWithRecords.map(emp => {
      const rowDate = emp.displayDate || format(selectedDate, "yyyy-MM-dd");
      const workedHours = emp.record?.worked_hours || 0;

      // Horario programado para este empleado y fecha
      const schedForRow = getEmployeeScheduleForDate(emp.id, rowDate);
      const dowForRow = new Date(rowDate + "T00:00:00").getDay();
      const stMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
      const enMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
      const horarioProg = schedForRow
        ? `${schedForRow[stMap[dowForRow]] || '--'}–${schedForRow[enMap[dowForRow]] || '--'}`
        : 'Sin horario';

      // Buscar TODOS los incidentes para este empleado y fecha
      const incidentsForRow = freshIncidents.filter(
        i => i.employee_id === emp.id && i.incident_date === rowDate
      );
      // Priorizar aprobada > pendiente > rechazada
      const incident = incidentsForRow.find(i => i.status === 'Aprobada')
        || incidentsForRow.find(i => i.status === 'Pendiente')
        || incidentsForRow[0]
        || null;

      // Estado real de la marcación: vacaciones > incidente aprobado > status del registro
      const estadoMarcacion = (() => {
        // 1. Si el registro ya tiene status "Vacaciones" (grabado al aprobar)
        if (emp.record?.status === 'Vacaciones') return 'Vacaciones';
        // 2. Si existe una solicitud de vacaciones aprobada que cubre esta fecha
        const isOnVacation = approvedVacations.some(
          v => v.employee_id === emp.id && v.start_date <= rowDate && v.end_date >= rowDate
        );
        if (isOnVacation) return 'Vacaciones';
        // 3. Si hay incidente aprobado
        if (incident && incident.status === 'Aprobada') return 'Justificado';
        // 4. Status real del registro
        return emp.record?.status || 'Sin marcar';
      })();

      // Calcular tiempo justificado
      let tiempoPapeleta = '';
      if (incident) {
        if (incident.full_day_justification) {
          tiempoPapeleta = '8.00 h';
        } else {
          const ts = incident.justified_time_start || '09:00';
          const te = incident.justified_time_end || '18:00';
          const [sh, sm] = ts.split(':').map(Number);
          const [eh, em] = te.split(':').map(Number);
          const hrs = Math.max(0, ((eh * 60 + em) - (sh * 60 + sm)) / 60);
          tiempoPapeleta = `${hrs.toFixed(2)} h`;
        }
      }

      // Para vacaciones: usar el horario programado real, no el que quedó grabado
      let entradaExcel = emp.record?.clock_in || '--:--';
      let salidaExcel  = emp.record?.clock_out || '--:--';
      if (estadoMarcacion === 'Vacaciones') {
        const schedVac = getEmployeeScheduleForDate(emp.id, rowDate);
        const dowVac = new Date(rowDate + "T00:00:00").getDay();
        const startsMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
        const endsMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
        if (schedVac) {
          entradaExcel = schedVac[startsMap[dowVac]] || entradaExcel;
          salidaExcel  = schedVac[endsMap[dowVac]]   || salidaExcel;
        }
      }

      return {
        'Horario Programado': horarioProg,
        'Fecha': rowDate,
        'Tipo Doc': emp.document_type,
        'DNI': emp.document_number,
        'Nombres': emp.first_name,
        'Apellidos': emp.last_name,
        'Cargo': emp.position,
        'Departamento': emp.department_name,
        'Sede': emp.site || 'Sin sede',
        'Entrada': entradaExcel,
        'Salida': salidaExcel,
        'Horas Trabajadas': workedHours.toFixed(2),
        'Tardanza (min)': emp.record?.late_minutes || 0,
        'HE 25%': (emp.record?.overtime_hours_25 ?? 0).toFixed(2),
        'HE 35%': (emp.record?.overtime_hours_35 ?? 0).toFixed(2),
        'Estado Marcación': estadoMarcacion,
        'Tiene Justificación': incident ? 'Sí' : 'No',
        'Tipo Incidente': incident ? incident.incident_type : '',
        'Estado Papeleta': incident ? incident.status : '',
        'Período Justificado': incident
          ? (incident.full_day_justification
              ? `Día completo (${incident.justified_time_start || '09:00'} - ${incident.justified_time_end || '18:00'})`
              : `${incident.justified_time_start || ''} - ${incident.justified_time_end || ''}`)
          : '',
        'Horas Justificadas': tiempoPapeleta,
        'Detalle Justificación': incident ? incident.justification : '',
        'Documento Adjunto': incident?.supporting_document_url || '',
        'Revisado por': incident?.reviewed_by || '',
        'Fecha Revisión': incident?.review_date || '',
        'Comentarios Revisión': incident?.review_comments || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Asistencia');
    const filterText = attendanceFilter === "all" ? "Todos" : attendanceFilter === "sin_entrada" ? "Sin_Entrada" : attendanceFilter === "sin_salida" ? "Sin_Salida" : "Con_Tardanza";
    const dateLabel = isRangeMode && dateFrom && dateTo
      ? `${dateToStringLima(dateFrom)}_${dateToStringLima(dateTo)}`
      : dateToStringLima(selectedDate);
    XLSX.writeFile(wb, `Asistencia_${dateLabel}_${filterText}.xlsx`);
    toast.success('✓ Archivo Excel generado correctamente');
  };

  const handlePrint = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) { toast.error('Por favor, permite las ventanas emergentes para imprimir'); return; }
    const filterText = attendanceFilter === "all" ? "Todos los empleados" : attendanceFilter === "sin_entrada" ? "Sin marcar entrada" : attendanceFilter === "sin_salida" ? "Sin marcar salida" : "Con tardanza";
    const printContent = `<!DOCTYPE html><html><head><title>Reporte de Asistencia</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px}.header h1{margin:5px 0;font-size:24px}.header p{margin:3px 0;color:#666}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#4f46e5;color:white;font-weight:bold}tr:nth-child(even){background-color:#f9fafb}.late{color:#ea580c;font-weight:bold}.absent{color:#dc2626;font-weight:bold}.complete{color:#16a34a;font-weight:bold}.footer{margin-top:30px;text-align:center;font-size:11px;color:#666}@media print{body{margin:0}.no-print{display:none}}</style></head><body><div class="header"><h1>Reporte de Asistencia</h1><p><strong>Fecha:</strong> ${format(parseDateLima(dateToStringLima(selectedDate)), "dd 'de' MMMM, yyyy", { locale: es })}</p><p><strong>Filtro aplicado:</strong> ${filterText}</p><p><strong>Total de empleados:</strong> ${employeesWithRecords.length}</p></div><table><thead><tr><th>DNI</th><th>Empleado</th><th>Cargo</th><th>Departamento</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Tardanza</th><th>HE 25%</th><th>HE 35%</th><th>Estado</th></tr></thead><tbody>${employeesWithRecords.map(emp => { const wh = emp.record?.worked_hours || 0; return `<tr><td>${emp.document_number}</td><td>${emp.first_name} ${emp.last_name}</td><td>${emp.position}</td><td>${emp.department_name}</td><td>${emp.record?.clock_in || '--:--'}</td><td>${emp.record?.clock_out || '--:--'}</td><td>${wh.toFixed(2)}h</td><td class="${emp.record?.is_late ? 'late' : ''}">${emp.record?.late_minutes || 0} min</td><td>${(emp.record?.overtime_hours_25 ?? 0).toFixed(2)}h</td><td>${(emp.record?.overtime_hours_35 ?? 0).toFixed(2)}h</td><td class="${emp.record?.status === 'Completo' ? 'complete' : emp.record?.status === 'Ausente' ? 'absent' : ''}">${emp.record?.status || 'Sin marcar'}</td></tr>`; }).join('')}</tbody></table><div class="footer"><p>Generado el ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm")} - Sistema de Recursos Humanos</p></div><script>window.onload=function(){window.print()}</script></body></html>`;
    printWindow.document.write(printContent);
    printWindow.document.close();
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

  const getStatusConfig = (status, hasClockIn, incident) => {
    // Si el registro está marcado como Vacaciones
    if (status === "Vacaciones") {
      return { color: "bg-amber-100 text-amber-800 border-amber-300", icon: Palmtree, text: "Vacaciones" };
    }
    // Si hay un incidente aprobado asociado, mostrar "Justificado"
    if (incident && incident.status === "Aprobada") {
      return { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Justificado" };
    }
    if (!hasClockIn) return { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Sin marcar" };
    const configs = {
      "Completo": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, text: "Completo" },
      "Incompleto": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock, text: "En curso" },
      "Ausente": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Ausente" },
      "Justificado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Justificado" },
    };
    return configs[status] || configs["Incompleto"];
  };

  if (permissionsLoading && !effectiveEmployee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  if (!effectiveEmployee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8 text-center">
          <p className="text-slate-600">No se encontró un empleado vinculado a tu cuenta.</p>
          <p className="text-sm text-slate-400 mt-2">Contacta al administrador del sistema.</p>
        </CardContent></Card>
      </div>
    );
  }

  // Verificar permisos directamente (sin PermissionGuard para evitar doble instancia del hook)
  const canAccessAttendance = hasPermission("system.admin") ||
    hasPermission("attendance.view_all") ||
    hasPermission("attendance.manage") ||
    hasPermission("attendance.view_department");

  if (!canAccessAttendance) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <p className="text-slate-600">No tienes permisos para acceder a esta sección.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-full mx-auto px-4 py-6">
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
            <div className="flex items-center justify-between gap-3">
              <TabsList className="grid grid-cols-4">
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
                <TabsTrigger value="edit-requests">
                  Ediciones
                  {pendingEditRequests.length > 0 && <Badge className="ml-2 bg-indigo-500 text-white">{pendingEditRequests.length}</Badge>}
                </TabsTrigger>
              </TabsList>
              <div className="flex items-center gap-2">
                {hasPermission("system.admin") && (
                  <Button
                    onClick={handleRecalcularTodo}
                    variant="outline"
                    disabled={recalculandoTodo}
                    className="whitespace-nowrap border-orange-300 text-orange-700 hover:bg-orange-50"
                  >
                    {recalculandoTodo
                      ? `Recalculando... ${recalcProgress.done}/${recalcProgress.total}`
                      : "Recalcular Todo"}
                  </Button>
                )}
                <Button onClick={() => handleExportToExcel()} variant="outline" className="bg-green-600 text-white hover:bg-green-700 whitespace-nowrap">
                  <Download className="w-4 h-4 mr-2" />Excel
                </Button>
                <Button onClick={handlePrint} variant="outline" className="whitespace-nowrap">
                  <Printer className="w-4 h-4 mr-2" />Imprimir
                </Button>
              </div>
            </div>

            {/* Attendance Tab */}
            <TabsContent value="attendance" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="flex-1 min-w-[180px]">
                      <div className="relative">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                        <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }} className="pl-10" />
                      </div>
                    </div>
                    <div className="relative">
                      <Select value={selectedSite} onValueChange={(v) => { setSelectedSite(v); setCurrentPage(1); }} disabled={hasSingleSite}>
                        <SelectTrigger className={`w-36 ${hasSingleSite ? "opacity-70 cursor-not-allowed bg-slate-100" : ""}`}>
                          <SelectValue placeholder="Sede" />
                        </SelectTrigger>
                        <SelectContent>
                          {!isSiteRestricted && <SelectItem value="all">Todas</SelectItem>}
                          {!isSiteRestricted && <SelectItem value="sin_sede">Sin sede</SelectItem>}
                          {isSiteRestricted && accessibleSites.length > 1 && <SelectItem value="all">Todas (permitidas)</SelectItem>}
                          {sites
                            .filter(site => accessibleSites === null || accessibleSites.includes(site.name))
                            .map(site => <SelectItem key={site.id} value={site.name}>{site.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                      {hasSingleSite && (
                        <span className="absolute -top-5 left-0 text-xs text-amber-600 font-medium whitespace-nowrap">🔒 Sede restringida</span>
                      )}
                    </div>
                    <Select value={selectedArea} onValueChange={(v) => { setSelectedArea(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-44">
                        <SelectValue placeholder="Área" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todas las áreas</SelectItem>
                        <SelectItem value="sin_area">Sin área</SelectItem>
                        {[...new Set(siteAllowedEmployees.map(e => e.area_trabajo).filter(Boolean))].sort().map(area => (
                          <SelectItem key={area} value={area}>{area}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>

                    <Select value={attendanceFilter} onValueChange={(v) => { setAttendanceFilter(v); setCurrentPage(1); }}>
                      <SelectTrigger className="w-44"><SelectValue placeholder="Filtro" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">Todos</SelectItem>
                        <SelectItem value="sin_entrada"><div className="flex items-center gap-2"><XCircle className="w-4 h-4 text-red-600" />Sin entrada</div></SelectItem>
                        <SelectItem value="sin_salida"><div className="flex items-center gap-2"><Clock className="w-4 h-4 text-yellow-600" />Sin salida</div></SelectItem>
                        <SelectItem value="con_tardanza"><div className="flex items-center gap-2"><AlertCircle className="w-4 h-4 text-orange-600" />Con tardanza</div></SelectItem>
                      </SelectContent>
                    </Select>

                    {/* Selector de fecha única */}
                    {!isRangeMode && (
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="bg-green-50 border-green-200 hover:bg-green-100 whitespace-nowrap">
                            <CalendarIcon className="mr-2 h-4 w-4 text-green-700" />
                            <span className="text-green-700">{format(parseDateLima(dateToStringLima(selectedDate)), "dd MMM yyyy", { locale: es })}</span>
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar mode="single" selected={selectedDate} onSelect={(date) => date && setSelectedDate(date)} locale={es} />
                        </PopoverContent>
                      </Popover>
                    )}

                    {/* Selector rango de fechas */}
                    {isRangeMode && (
                      <div className="flex items-center gap-2">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="bg-blue-50 border-blue-200 hover:bg-blue-100 whitespace-nowrap">
                              <CalendarIcon className="mr-2 h-4 w-4 text-blue-700" />
                              <span className="text-blue-700">{dateFrom ? format(parseDateLima(dateToStringLima(dateFrom)), "dd MMM yyyy", { locale: es }) : "Desde"}</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={dateFrom} onSelect={(d) => d && setDateFrom(d)} locale={es} />
                          </PopoverContent>
                        </Popover>
                        <span className="text-slate-400 text-sm">—</span>
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" className="bg-blue-50 border-blue-200 hover:bg-blue-100 whitespace-nowrap">
                              <CalendarIcon className="mr-2 h-4 w-4 text-blue-700" />
                              <span className="text-blue-700">{dateTo ? format(parseDateLima(dateToStringLima(dateTo)), "dd MMM yyyy", { locale: es }) : "Hasta"}</span>
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0">
                            <Calendar mode="single" selected={dateTo} onSelect={(d) => d && setDateTo(d)} locale={es} />
                          </PopoverContent>
                        </Popover>
                      </div>
                    )}

                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => { setIsRangeMode(!isRangeMode); setDateFrom(null); setDateTo(null); setCurrentPage(1); }}
                      className={isRangeMode ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700" : ""}
                    >
                      {isRangeMode ? "Rango activo" : "Por rango"}
                    </Button>

                    {/* Paginación en la misma línea de filtros */}
                    <div className="flex items-center gap-3 ml-auto">
                      <span className="text-sm text-slate-500 whitespace-nowrap">
                        {employeesWithRecords.length === 0 ? "0 registros" : `${Math.min((currentPage - 1) * pageSize + 1, employeesWithRecords.length)}–${Math.min(currentPage * pageSize, employeesWithRecords.length)} de ${employeesWithRecords.length}`}
                      </span>
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="outline" disabled={currentPage === 1} onClick={() => setCurrentPage(p => p - 1)} className="h-8 px-2">‹</Button>
                        <span className="text-sm text-slate-600 px-2">{currentPage} / {Math.max(Math.ceil(employeesWithRecords.length / pageSize), 1)}</span>
                        <Button size="sm" variant="outline" disabled={currentPage >= Math.max(Math.ceil(employeesWithRecords.length / pageSize), 1)} onClick={() => setCurrentPage(p => p + 1)} className="h-8 px-2">›</Button>
                      </div>
                    </div>
                  </div>

                  {/* Tabla con anchos fijos para alineación perfecta */}
                  <div className="overflow-x-auto">
                    <table className="w-full border-collapse" style={{tableLayout: "fixed"}}>
                      <colgroup>
                        <col style={{width: "200px"}} />
                        <col style={{width: "60px"}} />
                        <col style={{width: "68px"}} />
                        <col style={{width: "68px"}} />
                        <col style={{width: "62px"}} />
                        <col style={{width: "65px"}} />
                        <col style={{width: "65px"}} />
                        <col style={{width: "58px"}} />
                        <col style={{width: "68px"}} />
                        <col style={{width: "58px"}} />
                        <col style={{width: "58px"}} />
                        <col style={{width: "200px"}} />
                      </colgroup>
                      <thead>
                        <tr className="bg-slate-100 rounded-lg">
                          <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 rounded-l-lg">Empleado</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Fecha</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Entrada</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Salida</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Horas</th>
                          <th className="text-center text-xs font-semibold text-green-600 uppercase tracking-wide px-2 py-2">H.Just. Ini</th>
                          <th className="text-center text-xs font-semibold text-green-600 uppercase tracking-wide px-2 py-2">H.Just. Fin</th>
                          <th className="text-center text-xs font-semibold text-green-600 uppercase tracking-wide px-2 py-2">H.Just.</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Tardanza</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">HE 25%</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">HE 35%</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2 rounded-r-lg">Estado / Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeesWithRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((emp, idx) => {
                          const rowDate = emp.displayDate || format(selectedDate, "yyyy-MM-dd");
                          const vacation = approvedVacations.find(v => v.employee_id === emp.id && v.start_date <= rowDate && v.end_date >= rowDate) || null;
                          const scheduledTimes = vacation ? getScheduledTimes(emp.id) : null;
                          // Buscar incidente aprobado para esta fila
                          const rowIncident = allIncidents.find(
                            i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada"
                          ) || allIncidents.find(
                            i => i.employee_id === emp.id && i.incident_date === rowDate
                          ) || null;

                          const statusConfig = vacation
                            ? { color: "bg-amber-100 text-amber-800 border-amber-300", icon: Palmtree, text: "Vacaciones" }
                            : getStatusConfig(emp.record?.status, emp.record?.clock_in, rowIncident);
                          const StatusIcon = statusConfig.icon;
                          const rowKey = `${emp.id}-${rowDate}-${idx}`;

                          const sched = getEmployeeScheduleForDate(emp.id, rowDate);
                          const dow2 = new Date(rowDate + "T00:00:00").getDay();
                          const starts = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
                          const ends = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
                          const schedSt = sched ? sched[starts[dow2]] : null;
                          const schedEn = sched ? sched[ends[dow2]] : null;
                          const hasPendingEdit = emp.record && pendingEditRequests.some(r => r.attendance_record_id === emp.record?.id);

                          return (
                            <tr key={rowKey} className={`border-b last:border-b-0 hover:bg-slate-50 transition-colors ${vacation ? "bg-amber-50/40" : "bg-white"}`}>
                              {/* Empleado */}
                              <td className={`px-3 py-2 border-l-2 ${vacation ? "border-amber-300" : "border-transparent"}`}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${vacation ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-indigo-500 to-purple-600"}`}>
                                    {emp.first_name[0]}{emp.last_name[0]}
                                  </div>
                                  <div className="min-w-0 overflow-hidden">
                                    <p className="font-semibold text-slate-900 text-xs truncate">{emp.document_type} {emp.document_number} - {emp.first_name} {emp.last_name}</p>
                                    <p className="text-xs text-slate-400 truncate">{emp.department_name}</p>
                                    {!sched && <p className="text-xs text-red-500">Sin horario</p>}
                                    {sched && !schedSt && <p className="text-xs text-slate-400">Día libre</p>}
                                    {sched && schedSt && <p className="text-xs text-indigo-600">🕐 {schedSt}–{schedEn}</p>}
                                    {vacation && <p className="text-xs text-amber-700 font-medium">🌴 {vacation.request_type}</p>}
                                  </div>
                                </div>
                              </td>
                              {/* Fecha */}
                              <td className="px-2 py-2 text-center">
                                <span className="text-xs font-semibold text-slate-700 bg-slate-100 px-1.5 py-0.5 rounded whitespace-nowrap">
                                 {format(parseDateLima(rowDate), "dd MMM", { locale: es })}
                                </span>
                              </td>
                              {/* Entrada */}
                              <td className="px-2 py-2 text-center">
                                {vacation
                                  ? <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{scheduledTimes?.start}</span>
                                  : <span className={`text-sm font-bold ${emp.record?.clock_in ? 'text-slate-900' : 'text-slate-300'}`}>{emp.record?.clock_in ? emp.record.clock_in.slice(0, 5) : "--:--"}</span>
                                }
                              </td>
                              {/* Salida */}
                              <td className="px-2 py-2 text-center">
                                {vacation
                                  ? <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{scheduledTimes?.end}</span>
                                  : <span className={`text-sm font-bold ${emp.record?.clock_out ? 'text-slate-900' : 'text-slate-300'}`}>{emp.record?.clock_out ? emp.record.clock_out.slice(0, 5) : "--:--"}</span>
                                }
                              </td>
                              {/* Horas (regular_hours — horas efectivas dentro de jornada) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const rh = vacation ? 8 : Number(emp.record?.regular_hours || 0);
                                  const totalMin = Math.round(rh * 60);
                                  const hh = Math.floor(totalMin / 60);
                                  const mm = totalMin % 60;
                                  return <span className="text-sm font-bold text-slate-900">{hh}h {mm}m</span>;
                                })()}
                              </td>
                              {/* H. Just. Inicio — solo si hay incidente aprobado */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const approvedInc = allIncidents.find(i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada");
                                  if (!approvedInc) return <span className="text-xs text-slate-300">—</span>;
                                  return <span className="text-xs font-semibold text-green-700">{approvedInc.justified_time_start || "—"}</span>;
                                })()}
                              </td>
                              {/* H. Just. Fin — solo si hay incidente aprobado */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const approvedInc = allIncidents.find(i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada");
                                  if (!approvedInc) return <span className="text-xs text-slate-300">—</span>;
                                  return <span className="text-xs font-semibold text-green-700">{approvedInc.justified_time_end || "—"}</span>;
                                })()}
                              </td>
                              {/* H. Just. — horas justificadas aprobadas (considerando jornada y refrigerio) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const approvedInc = allIncidents.find(i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada");
                                  if (!approvedInc) return <span className="text-xs text-slate-300">—</span>;
                                  let justMins = 0;
                                  if (approvedInc.full_day_justification) {
                                    // Día completo: usar jornada del horario menos refrigerio
                                    const s = getEmployeeScheduleForDate(emp.id, rowDate);
                                    const dow3 = new Date(rowDate + "T00:00:00").getDay();
                                    const st = s?.[["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"][dow3]] || "09:00";
                                    const en = s?.[["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"][dow3]] || "18:00";
                                    const brk = s?.break_duration_minutes ?? 60;
                                    const [sh2, sm2] = st.split(":").map(Number);
                                    const [eh2, em2] = en.split(":").map(Number);
                                    justMins = Math.max(0, (eh2 * 60 + em2) - (sh2 * 60 + sm2) - brk);
                                  } else {
                                    const ts = approvedInc.justified_time_start || "09:00";
                                    const te = approvedInc.justified_time_end || "09:00";
                                    const [sh2, sm2] = ts.split(":").map(Number);
                                    const [eh2, em2] = te.split(":").map(Number);
                                    const rawMins = (eh2 * 60 + em2) - (sh2 * 60 + sm2);
                                    // Descontar refrigerio solo si el período cubre la hora del break del horario
                                    const s = getEmployeeScheduleForDate(emp.id, rowDate);
                                    const breakMin = s?.break_duration_minutes ?? 0;
                                    const breakStart = s?.break_start || null;
                                    if (breakStart && breakMin > 0) {
                                      const [bh, bm] = breakStart.split(":").map(Number);
                                      const breakStartMins = bh * 60 + bm;
                                      const justStartMins = sh2 * 60 + sm2;
                                      const justEndMins = eh2 * 60 + em2;
                                      // Si el período justificado cubre el break, descontarlo
                                      if (justStartMins <= breakStartMins && justEndMins >= breakStartMins + breakMin) {
                                        justMins = Math.max(0, rawMins - breakMin);
                                      } else {
                                        justMins = Math.max(0, rawMins);
                                      }
                                    } else {
                                      justMins = Math.max(0, rawMins);
                                    }
                                  }
                                  const jh = Math.floor(justMins / 60);
                                  const jm = justMins % 60;
                                  return <span className="text-xs font-bold text-green-700">{jh}h {jm}m</span>;
                                })()}
                              </td>
                              {/* Tardanza neta (raw - ajuste del incidente aprobado) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const rawLate = vacation ? 0 : (emp.record?.late_minutes || 0);
                                  const approvedInc = vacation ? null : allIncidents.find(i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada");
                                  const adjustedLate = approvedInc ? Math.max(0, rawLate - (approvedInc.late_minutes_to_adjust || 0)) : rawLate;
                                  const lh = Math.floor(adjustedLate / 60);
                                  const lm = adjustedLate % 60;
                                  const lateStr = lh > 0 ? `${lh}h ${lm}m` : `${lm}m`;
                                  return <span className={`text-xs font-bold ${!vacation && adjustedLate > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{lateStr}</span>;
                                })()}
                              </td>
                              {/* HE 25% */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const heMin = vacation ? 0 : Math.round((emp.record?.overtime_hours_25 ?? 0) * 60);
                                  const hh = Math.floor(heMin / 60);
                                  const hm = heMin % 60;
                                  const heStr = hh > 0 ? `${hh}h ${hm}m` : `${hm}m`;
                                  return <span className={`text-xs font-bold ${!vacation && heMin > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{heStr}</span>;
                                })()}
                              </td>
                              {/* HE 35% */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const heMin = vacation ? 0 : Math.round((emp.record?.overtime_hours_35 ?? 0) * 60);
                                  const hh = Math.floor(heMin / 60);
                                  const hm = heMin % 60;
                                  const heStr = hh > 0 ? `${hh}h ${hm}m` : `${hm}m`;
                                  return <span className={`text-xs font-bold ${!vacation && heMin > 0 ? 'text-purple-600' : 'text-slate-300'}`}>{heStr}</span>;
                                })()}
                              </td>
                              {/* Estado y Acciones */}
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1 flex-wrap justify-start">
                                  <Badge className={`${statusConfig.color} text-xs shrink-0 whitespace-nowrap`} style={{minWidth: "78px", justifyContent: "center"}}>
                                    <StatusIcon className="w-3 h-3 mr-1" />{statusConfig.text}
                                  </Badge>
                                  {!vacation && emp.record && (
                                    hasPendingEdit ? (
                                      <Badge className="h-7 px-2 text-xs shrink-0 whitespace-nowrap bg-indigo-100 text-indigo-700 border border-indigo-300 flex items-center gap-1">
                                        <Clock className="w-3 h-3" />Edición pendiente
                                      </Badge>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0 whitespace-nowrap" onClick={() => handleEditRecord(emp.record, emp)}>
                                        <Edit className="w-3 h-3 mr-1" />Editar
                                      </Button>
                                    )
                                  )}
                                  {!vacation && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-7 px-2 text-xs shrink-0 whitespace-nowrap ${rowIncident ? "text-blue-700 border-blue-300 hover:bg-blue-50" : "text-orange-600 border-orange-200 hover:bg-orange-50"}`}
                                      onClick={() => handleJustifyClick(emp, emp.record, rowDate)}
                                    >
                                      <FileText className="w-3 h-3 mr-1" />{rowIncident ? "Ver/Editar" : "Justificar"}
                                    </Button>
                                  )}

                                  <Button size="sm" variant="outline" className="h-7 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 shrink-0" title="Asignar horario"
                                    onClick={() => { setSchedulingEmployee({ ...emp, _rowDate: rowDate }); setShowScheduleModal(true); }}>
                                    <CalendarClock className="w-3 h-3" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
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
                  <div className="relative max-w-sm mb-6">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input
                      placeholder="Buscar por nombre..."
                      value={overtimeSearchTerm}
                      onChange={(e) => setOvertimeSearchTerm(e.target.value)}
                      className="pl-9"
                    />
                  </div>
                  {overtimeAlerts.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                      <p className="text-slate-600">No hay alertas de horas extras</p>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {overtimeAlerts.filter(a => {
                       if (!accessibleEmployeeIds.has(a.employee_id)) return false;
                       if (!overtimeSearchTerm) return true;
                       const emp = allEmployees.find(e => e.id === a.employee_id);
                       const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
                       return name.includes(overtimeSearchTerm.toLowerCase());
                      }).map(alert => {
                       const emp = allEmployees.find(e => e.id === alert.employee_id);
                       const record = todayRecords.find(r => r.id === alert.attendance_record_id);
                       const alertSched = emp ? getEmployeeScheduleForDate(emp.id, alert.alert_date) : null;
                       const alertDow = new Date(alert.alert_date + "T00:00:00").getDay();
                       const dowStarts = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
                       const dowEnds   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
                       const schedStart = alertSched?.[dowStarts[alertDow]];
                       const schedEnd   = alertSched?.[dowEnds[alertDow]];
                       const schedName  = alertSched?.schedule_name?.replace(new RegExp(`\\s*-\\s*${emp?.first_name}\\s+${emp?.last_name}\\s*$`, 'i'), '') || null;

                       return (
                         <div key={alert.id} className="p-4 border-2 border-red-200 bg-red-50 rounded-lg">
                           <div className="flex items-start justify-between mb-4">
                             <div className="flex-1">
                               <div className="flex items-center gap-3 mb-2">
                                 <h4 className="font-bold text-slate-900">{emp ? `${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                 <Badge className="bg-red-600 text-white">{alert.overtime_hours.toFixed(2)}h extras</Badge>
                               </div>
                               <p className="text-sm text-slate-600 mb-2">{emp?.position} • {emp?.department_name}</p>
                               <p className="text-sm text-slate-700">📅 {format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}</p>
                               {record && <p className="text-sm text-slate-600 mt-1">Marcación: {record.clock_in} - {record.clock_out} ({record.worked_hours?.toFixed(2)}h trabajadas)</p>}
                               {alertSched && (
                                 <p className="text-sm text-slate-600 mt-1">
                                   🗓️ Horario: <span className="font-medium">{schedName}</span>
                                   {schedStart && schedEnd && <span className="text-indigo-600 ml-1">({schedStart}–{schedEnd})</span>}
                                 </p>
                               )}
                             </div>
                           </div>
                           <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg mb-4">
                             <p className="text-sm text-yellow-900">⚠️ Este empleado <strong>no está autorizado</strong> para realizar horas extras de forma permanente. Puede corregir la marcación, descartar la alerta o <strong>aceptar las HE únicamente para este día</strong> sin modificar su autorización general.</p>
                           </div>
                           <div className="flex gap-2 flex-wrap">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => {
                                if (!record) return;
                                const empForAlert = allEmployees.find(e => e.id === alert.employee_id);
                                handleEditRecord(record, empForAlert);
                              }}>
                                <Edit className="w-4 h-4 mr-2" />Solicitar Corrección
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                                onClick={async () => {
                                  // 1. Marcar overtime_authorized=true en el registro del día
                                  if (record) {
                                    await base44.entities.AttendanceRecord.update(record.id, {
                                      overtime_authorized: true,
                                      notes: (record.notes ? record.notes + " | " : "") + `HE aceptadas: ${alert.overtime_hours.toFixed(2)}h (${alert.alert_date})`
                                    });
                                  }
                                  // 2. Marcar alerta como aprobada
                                  await base44.entities.OvertimeAlert.update(alert.id, {
                                    status: "Aprobado",
                                    notes: `HE aceptadas solo para el día ${alert.alert_date}`
                                  });
                                  // 3. Recalcular asistencia del día (tardanza + HE 25% + HE 35%)
                                  await base44.functions.invoke("recalcularAsistencia", {
                                    employee_id: alert.employee_id,
                                    date_from: alert.alert_date,
                                    date_to: alert.alert_date,
                                  });
                                  queryClient.invalidateQueries(["overtimeAlerts"]);
                                  queryClient.invalidateQueries(["todayAttendance"]);
                                  queryClient.invalidateQueries(["attendanceRecords"]);
                                  toast.success(`HE aceptadas y recalculadas para el ${format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}: HE25% y HE35% actualizadas`);
                                }}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />Aceptar HE (solo este día)
                              </Button>
                              <Button size="sm" variant="outline" className="text-slate-600" onClick={async () => {
                                await base44.entities.OvertimeAlert.update(alert.id, { status: "Descartado" });
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
              <div className="relative max-w-sm">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por nombre..."
                  value={incidentSearchTerm}
                  onChange={(e) => setIncidentSearchTerm(e.target.value)}
                  className="pl-9"
                />
              </div>
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
                          {pendingIncidents.filter(i => {
                            if (!accessibleEmployeeIds.has(i.employee_id)) return false;
                            if (!incidentSearchTerm) return true;
                            const emp = allEmployees.find(e => e.id === i.employee_id);
                            const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
                            return name.includes(incidentSearchTerm.toLowerCase());
                          }).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-slate-200 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.position}</p>
                                    <div className="flex gap-4 text-sm">
                                      <Badge className="bg-orange-100 text-orange-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(parseDateLima(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
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
                          {approvedIncidents.filter(i => {
                            if (!accessibleEmployeeIds.has(i.employee_id)) return false;
                            if (!incidentSearchTerm) return true;
                            const emp = allEmployees.find(e => e.id === i.employee_id);
                            const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
                            return name.includes(incidentSearchTerm.toLowerCase());
                          }).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-green-200 bg-green-50/30 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.position}</p>
                                    <div className="flex gap-4 text-sm flex-wrap">
                                      <Badge className="bg-green-100 text-green-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(parseDateLima(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
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
                                  <span>Fecha: {incident.review_date ? format(parseDateLima(incident.review_date), "dd MMM yyyy", { locale: es }) : "N/A"}</span>
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
                          {rejectedIncidents.filter(i => {
                            if (!accessibleEmployeeIds.has(i.employee_id)) return false;
                            if (!incidentSearchTerm) return true;
                            const emp = allEmployees.find(e => e.id === i.employee_id);
                            const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
                            return name.includes(incidentSearchTerm.toLowerCase());
                          }).map(incident => {
                            const emp = allEmployees.find(e => e.id === incident.employee_id);
                            return (
                              <div key={incident.id} className="p-4 border border-red-200 bg-red-50/30 rounded-lg">
                                <div className="flex items-start justify-between mb-4">
                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 mb-1">{emp ? `${emp.document_type} ${emp.document_number} - ${emp.first_name} ${emp.last_name}` : "Empleado desconocido"}</h4>
                                    <p className="text-sm text-slate-600 mb-2">{emp?.position}</p>
                                    <div className="flex gap-4 text-sm flex-wrap">
                                      <Badge className="bg-red-100 text-red-700">{incident.incident_type}</Badge>
                                      <span className="text-slate-600">📅 {format(parseDateLima(incident.incident_date), "dd MMM yyyy", { locale: es })}</span>
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
                                  <span>Fecha: {incident.review_date ? format(parseDateLima(incident.review_date), "dd MMM yyyy", { locale: es }) : "N/A"}</span>
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

                                  {/* Edit Requests Tab */}
                                  <TabsContent value="edit-requests" className="space-y-6">
                                  <AttendanceEditRequestsPanel
                                  allEmployees={allEmployees}
                                  reviewer={effectiveEmployee}
                                  canApprove={hasPermission("attendance.approve_edits") || hasPermission("system.admin")}
                                  />
                                  </TabsContent>

                                  </Tabs>
                                  </div>

        {/* Edit Request Modal */}
        {showEditRequestModal && editRequestRecord && (
          <AttendanceEditRequestModal
            record={editRequestRecord}
            employee={editRequestEmployee}
            requester={effectiveEmployee}
            onClose={() => { setShowEditRequestModal(false); setEditRequestRecord(null); setEditRequestEmployee(null); }}
            onSuccess={() => {
              queryClient.invalidateQueries(["attendanceEditRequests"]);
              queryClient.invalidateQueries(["todayAttendance"]);
            }}
          />
        )}

        {/* Edit Record Modal (legacy — kept for overtime alerts correction) */}
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
                    <p className="text-sm text-slate-600">Fecha: <strong>{editingRecord.date ? format(parseDateLima(editingRecord.date), "dd 'de' MMMM, yyyy", { locale: es }) : "Sin fecha"}</strong></p>
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
                        <SelectItem value="Vacaciones">Vacaciones</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Notas <span className="text-xs font-normal text-slate-400">(opcional)</span></label>
                    <Textarea value={editingRecord.notes} onChange={(e) => setEditingRecord({ ...editingRecord, notes: e.target.value })} placeholder="Observaciones adicionales..." rows={3} />
                  </div>
                  {/* Preview de métricas calculadas en tiempo real */}
                  {editingRecord.clock_in && (() => {
                    const preview = calcEditPreview(editingRecord.clock_in, editingRecord.clock_out, editingRecord.date, editingRecord.employee_id);
                    if (!preview) return null;
                    return (
                      <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                        <p className="text-xs font-semibold text-indigo-900 mb-3">📊 Vista previa del cálculo (horario {preview.scheduledStart}–{preview.scheduledEnd})</p>
                        <div className="grid grid-cols-2 gap-3 text-sm">
                          <div className="flex justify-between">
                            <span className="text-slate-600">Horas trabajadas:</span>
                            <span className="font-bold text-slate-900">{preview.workedHours.toFixed(2)}h</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Horas regulares:</span>
                            <span className="font-bold text-slate-900">{preview.regularHours.toFixed(2)}h</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">Tardanza:</span>
                            <span className={`font-bold ${preview.isLate ? 'text-orange-600' : 'text-green-600'}`}>
                              {preview.lateMinutes} min {preview.isLate ? '⚠️' : '✓'}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">HE 25%:</span>
                            <span className={`font-bold ${preview.overtimeHours25 > 0 ? 'text-blue-600' : 'text-slate-400'}`}>
                              {preview.overtimeHours25.toFixed(2)}h {!preview.overtimeAuthorized && preview.overtimeHours25 > 0 ? '🔒' : ''}
                            </span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-slate-600">HE 35%:</span>
                            <span className={`font-bold ${preview.overtimeHours35 > 0 ? 'text-purple-600' : 'text-slate-400'}`}>
                              {preview.overtimeHours35.toFixed(2)}h {!preview.overtimeAuthorized && preview.overtimeHours35 > 0 ? '🔒' : ''}
                            </span>
                          </div>
                        </div>
                        {!preview.overtimeAuthorized && (preview.overtimeHours25 > 0 || preview.overtimeHours35 > 0) && (
                          <p className="text-xs text-orange-700 mt-2">🔒 Las horas extras no se contabilizarán para pago porque el empleado no tiene HE autorizadas (se generará alerta).</p>
                        )}
                      </div>
                    );
                  })()}

                  <div className="flex gap-3">
                    <Button variant="outline" className="flex-1" onClick={() => setShowEditModal(false)}>Cancelar</Button>
                    <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleSaveEdit} disabled={isSavingEdit}>
                      {isSavingEdit ? "Guardando..." : "Guardar Cambios"}
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
                    <p className="text-sm text-slate-600 mb-2"><strong>Fecha:</strong> {format(parseDateLima(reviewingIncident.incident_date), "dd 'de' MMMM, yyyy", { locale: es })}</p>
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

        {/* Assign Schedule Modal */}
        {showScheduleModal && schedulingEmployee && (
          <AssignScheduleModal
            employee={schedulingEmployee}
            initialDate={schedulingEmployee._rowDate ? new Date(schedulingEmployee._rowDate + "T00:00:00") : new Date()}
            onClose={() => { setShowScheduleModal(false); setSchedulingEmployee(null); }}
            onSuccess={() => {
              queryClient.invalidateQueries(["workSchedules"]);
              queryClient.invalidateQueries(["todayAttendance"]);
            }}
          />
        )}

        {/* Justify Modal — componente separado */}
        {showJustifyModal && justifyingEmployee && (
          <JustifyModal
            justifyingEmployee={justifyingEmployee}
            justificationData={justificationData}
            setJustificationData={setJustificationData}
            selectedDate={justifyingDate || selectedDate}
            employeeSchedule={justifyingSchedule}
            attendanceRecord={todayRecords.find(r => r.employee_id === justifyingEmployee.id && r.date === (justifyingDate ? format(justifyingDate, "yyyy-MM-dd") : dateToStringLima(selectedDate)))}
            todayRecords={todayRecords}
            employee={effectiveEmployee}
            existingIncident={existingIncident}
            onClose={() => { setShowJustifyModal(false); setJustifyingEmployee(null); setExistingIncident(null); setJustifyingDate(null); setJustifyingSchedule(null); }}
            onSuccess={() => {
              setShowJustifyModal(false);
              setJustifyingEmployee(null);
              setExistingIncident(null);
              setJustifyingDate(null);
              setJustifyingSchedule(null);
              setJustificationData({ incident_type: "Olvido de Marcación", justification: "", supporting_document_url: "", justified_time_start: "09:00", justified_time_end: "18:00", full_day_justification: true });
              queryClient.invalidateQueries(["allIncidents"]);
              queryClient.invalidateQueries(["todayAttendance"]);
            }}
          />
        )}
      </div>
    </>
  );
}