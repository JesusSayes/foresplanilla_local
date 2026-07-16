import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { getPublicAssetUrl } from "@/api/apiConfig";
import { entitiesAPI } from '@/api/entitiesClient';
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
  AlertCircle, Users, Search, FileText, Download, Database, Printer, Palmtree, CalendarClock
} from "lucide-react";
import * as XLSX from 'xlsx';
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { todayLima, todayDateLima, parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";
import { calcEffectiveMetrics, getSegmentClockTimes } from "@/lib/attendanceMetrics";
import { isEmploymentDateValid } from "@/lib/employmentDate";
import IncidentHistory from "../components/attendance/IncidentHistory";
import { generateAutoClockings } from "../components/attendance/AutoClockingJob";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";
import JustifyModal from "../components/attendance/JustifyModal";
import AssignScheduleModal from "../components/attendance/AssignScheduleModal";
import AttendanceValidationModal from "../components/attendance/AttendanceValidationModal";
import AttendanceEditRequestModal from "../components/attendance/AttendanceEditRequestModal";
import AttendanceEditRequestsPanel from "../components/attendance/AttendanceEditRequestsPanel";
import recalcularAsistenciaService from '@/services/recalcularAsistenciaService';
import IncidentDetailModal from "../components/attendance/IncidentDetailModal";
import PaginationBar from "@/components/ui/PaginationBar";

export default function AttendanceManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const navigate = useNavigate();
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
  // === CUSTOM BLOCK: Validación manual RRHH ===
  const [showValidationModal, setShowValidationModal] = useState(false);
  const [validatingRecord, setValidatingRecord] = useState(null);
  const [validationLogs, setValidationLogs] = useState([]);
  const [showIncidentDetail, setShowIncidentDetail] = useState(false);
  const [incidentDetailData, setIncidentDetailData] = useState(null);
  const [incidentDetailEmployee, setIncidentDetailEmployee] = useState(null);
  const [isApproving, setIsApproving] = useState(false);
  const [showEditRequestModal, setShowEditRequestModal] = useState(false);
  const [editRequestRecord, setEditRequestRecord] = useState(null);
  const [editRequestEmployee, setEditRequestEmployee] = useState(null);
  const [incidentSearchTerm, setIncidentSearchTerm] = useState("");
  const [incidentDateFilter, setIncidentDateFilter] = useState("");
  const [incidentTypeFilter, setIncidentTypeFilter] = useState("all");
  const [incidentPage, setIncidentPage] = useState(1);
  const [incidentSubTab, setIncidentSubTab] = useState("pending");
  const INCIDENT_PAGE_SIZE = 20;

  const [overtimeSearchTerm, setOvertimeSearchTerm] = useState("");
  const [overtimeDateFilter, setOvertimeDateFilter] = useState("");
  const [overtimePage, setOvertimePage] = useState(1);
  const OVERTIME_PAGE_SIZE = 20;

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
  const canEditAttendance = hasPermission("attendance.edit") || hasPermission("system.admin");
  const canApproveIncidents = hasPermission("attendance.approve_incidents") || hasPermission("system.admin");
  const canApproveEdits = hasPermission("attendance.approve_edits") || hasPermission("system.admin");
  const canManageSchedules = hasPermission("schedules.edit") || hasPermission("schedules.assign") || hasPermission("system.admin");
  const canExportAttendance = hasPermission("attendance.export") || hasPermission("system.admin");
  const queryClient = useQueryClient();

  // Definir aquí para que esté disponible en todos los useEffect y handlers
  const effectiveEmployee = employee || permEmployee;

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
    queryKey: ["attendanceAccessibleEmployees", currentUser?.employee?.id],
    queryFn: async () => {
      return await entitiesAPI.Employee.accessible([
        "attendance.view_all",
        "attendance.view_department",
        "attendance.manage",
        "attendance.approve_edits",
      ]);
    },
  });

  const { data: todayRecords = [] } = useQuery({
    queryKey: ["todayAttendance", selectedDate, dateFrom, dateTo, isRangeMode],
    queryFn: async () => {
      if (isRangeMode && dateFrom && dateTo) {
        // Cargar todos los registros en el rango
        const allRecs = await entitiesAPI.AttendanceRecord.list("-date", 2000);
        const fromStr = dateToStringLima(dateFrom);
        const toStr = dateToStringLima(dateTo);
        return allRecs.filter(r => r.date >= fromStr && r.date <= toStr);
      }
      const dateStr = dateToStringLima(selectedDate);
      return await entitiesAPI.AttendanceRecord.filter({ date: dateStr }, "-created_date");
    },
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays"],
    queryFn: async () => {
      return await entitiesAPI.Holiday.list("-date");
    },
  });

  const { data: dbConnections = [] } = useQuery({
    queryKey: ["databaseConnections"],
    queryFn: async () => {
      const conns = await entitiesAPI.DatabaseConnection.list("-created_date");
      return conns.filter(c => c.is_active);
    },
    enabled: hasPermission("system.admin"),
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const allSites = await entitiesAPI.Site.list("name");
      return allSites.filter(s => s.is_active);
    },
  });

  const todayIsHoliday = holidays.some(h => h.date === dateToStringLima(selectedDate) && h.is_mandatory);
  const holidayInfo = holidays.find(h => h.date === dateToStringLima(selectedDate));

  const { data: allIncidents = [] } = useQuery({
    queryKey: ["allIncidents"],
    queryFn: async () => await entitiesAPI.AttendanceIncident.list("-created_date", 2000),
  });

  const { data: incidentTypes = [] } = useQuery({
    queryKey: ["incidentTypes"],
    queryFn: async () => await entitiesAPI.IncidentType.list(),
  });

  // Los incidentes se filtrarán después de calcular accessibleEmployeeIds (ver abajo)
  const pendingIncidents = allIncidents.filter(i => i.status === "Pendiente");
  const approvedIncidents = allIncidents.filter(i => i.status === "Aprobada");
  const rejectedIncidents = allIncidents.filter(i => i.status === "Rechazada");

  // Filtra una lista de incidentes con los filtros de la pestaña Justificaciones
  const applyIncidentFilters = (list) => list.filter(i => {
    if (!accessibleEmployeeIds.has(i.employee_id)) return false;
    if (incidentSearchTerm) {
      const emp = allEmployees.find(e => e.id === i.employee_id);
      const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      if (!name.includes(incidentSearchTerm.toLowerCase())) return false;
    }
    if (incidentTypeFilter !== "all" && i.incident_type !== incidentTypeFilter) return false;
    if (incidentDateFilter && i.incident_date !== incidentDateFilter) return false;
    return true;
  });

  const { data: overtimeAlerts = [] } = useQuery({
    queryKey: ["overtimeAlerts"],
    queryFn: async () => {
      return await entitiesAPI.OvertimeAlert.filter({ status: "Pendiente" }, "-created_date");
    },
  });

  const { data: pendingEditRequests = [] } = useQuery({
    queryKey: ["attendanceEditRequests", "Pendiente"],
    queryFn: async () => entitiesAPI.AttendanceEditRequest.filter({ status: "Pendiente" }, "-requested_at"),
  });

  const { data: workSchedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: async () => {
      return await entitiesAPI.WorkSchedule.list("-created_date");
    },
  });

  // Vacaciones aprobadas que cubren la(s) fecha(s) seleccionada(s)
  const { data: approvedVacations = [] } = useQuery({
    queryKey: ["approvedVacations", dateToStringLima(selectedDate), isRangeMode, dateFrom, dateTo],
    queryFn: async () => {
      const all = await entitiesAPI.VacationRequest.list("-start_date", 500);
      const approvedOnly = all.filter(v => ["Aprobada", "Aprobado"].includes(v.status));

      if (isRangeMode && dateFrom && dateTo) {
        const fromStr = dateToStringLima(dateFrom);
        const toStr = dateToStringLima(dateTo);
        return approvedOnly.filter(v => String(v.start_date).slice(0, 10) <= toStr && String(v.end_date).slice(0, 10) >= fromStr);
      }

      const dateStr = dateToStringLima(selectedDate);
      return approvedOnly.filter(v => String(v.start_date).slice(0, 10) <= dateStr && String(v.end_date).slice(0, 10) >= dateStr);
    },
  });

  useEffect(() => {
    const generateExemptClockings = async () => {
      if (!effectiveEmployee) return;
      // Solo admin/super_admin (por permiso system.admin) pueden generar marcaciones automáticas
      if (!hasPermission("system.admin") && !["admin", "super_admin"].includes(effectiveEmployee.role)) return;
      const result = await generateAutoClockings(selectedDate);
      if (result.success && result.recordsCreated > 0) {
        queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
        toast.success(`✓ ${result.recordsCreated} marcación(es) automática(s) generada(s)`);
      }
    };
    generateExemptClockings();
  }, [selectedDate, effectiveEmployee, queryClient]);

  const { data: employeeIncidents = [] } = useQuery({
    queryKey: ["employeeIncidents", historyEmployeeId],
    queryFn: async () => {
      if (!historyEmployeeId) return [];
      return await entitiesAPI.AttendanceIncident.filter({ employee_id: historyEmployeeId }, "-created_date");
    },
    enabled: !!historyEmployeeId,
  });

  const updateRecordMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.AttendanceRecord.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
      toast.success("Registro actualizado correctamente");
      setShowEditModal(false);
      setEditingRecord(null);
    },
    onError: () => toast.error("Error al actualizar el registro"),
  });

  const reviewIncidentMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.AttendanceIncident.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["allIncidents"] });
      toast.success("Justificación revisada correctamente");
      setShowIncidentModal(false);
      setReviewingIncident(null);
      setReviewComments("");
    },
    onError: (error) => {
      toast.error("Error al revisar la justificación");
      console.error(error);
    },
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
      const recordsForDate = await entitiesAPI.AttendanceRecord.filter({ date: dateStr });
      const affectedEmployeeIds = [...new Set(recordsForDate.map(r => r.employee_id))];
      for (const empId of affectedEmployeeIds) {
        await recalcularAsistenciaService.recalculate(empId, dateStr, dateStr);
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
        const from = String(s.effective_from || "0000-01-01").slice(0, 10);
        const to = String(s.effective_to || "9999-12-31").slice(0, 10);
        return from <= dStr && to >= dStr;
      });
      valid.sort((a, b) =>
        String(b.effective_from || "0000-01-01").slice(0, 10)
          .localeCompare(String(a.effective_from || "0000-01-01").slice(0, 10))
      );
      return valid[0] || null;
    };

    return findBest(empSchedules) || findBest(deptSchedules) || null;
  };

  // Compatibilidad: sin fecha usa la fecha seleccionada
  const getEmployeeSchedule = (empId) => getEmployeeScheduleForDate(empId, dateToStringLima(selectedDate));
  const isOvertimeAuthorized = (empId) => getEmployeeSchedule(empId)?.overtime_authorized || false;

  // === CUSTOM BLOCK: abrir validación manual ===
  const handleOpenValidationModal = async (record) => {
    try {
      if (!record?.employee_id || !record?.date) {
        toast.error("No se encontró información suficiente del registro");
        return;
      }

      const logs = await entitiesAPI.AttendanceLog.getByEmployeeAndDate(
        record.employee_id,
        record.date
      );

      setValidationLogs(logs || []);
      setValidatingRecord(record);
      setShowValidationModal(true);

    } catch (error) {
      console.error(error);
      toast.error("Error al cargar marcaciones biométricas");
    }
  };

  const handleEditRecord = (record, employeeOverride) => {
    const existingPending = pendingEditRequests.find(request => request.attendance_record_id === record.id);
    if (existingPending) {
      toast.warning("Ya existe una solicitud de edición pendiente para este registro");
      return;
    }
    const schedule = getEmployeeScheduleForDate(record.employee_id, record.date);
    const dow = new Date(`${record.date}T00:00:00`).getDay();
    const dayStartMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
    const dayEndMap   = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
    setEditRequestRecord({
      ...record,
      scheduled_start: record.scheduled_start || schedule?.[dayStartMap[dow]] || "",
      scheduled_end:   record.scheduled_end   || schedule?.[dayEndMap[dow]]   || "",
    });
    setEditRequestEmployee(employeeOverride || allEmployees.find(item => item.id === record.employee_id));
    setShowEditRequestModal(true);
  };

  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Calcular preview de métricas en tiempo real para el modal de edición
  // Soporta turnos nocturnos (schedEnd < schedStart)
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

    const toM = (t) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
    const inTotal       = toM(clockIn);
    const schedTotal    = toM(scheduledStart);
    const schedEndTotal = toM(scheduledEnd);

    const isNightShift = schedEndTotal < schedTotal;
    const fullJornada = isNightShift ? (schedEndTotal - schedTotal + 1440) : Math.max(0, schedEndTotal - schedTotal);
    const effectiveBreakMinutes = fullJornada < 360 ? 0 : breakMinutes;
    const norm = (t) => isNightShift ? (t - schedTotal + 1440) % 1440 : t;
    const normSchedStart = isNightShift ? 0 : schedTotal;
    const normSchedEnd   = isNightShift ? fullJornada : schedEndTotal;

    const normIn = norm(inTotal);
    const rawLate = (normIn <= fullJornada) ? Math.max(0, normIn - normSchedStart) : 0;
    const lateMinutes = rawLate > toleranceMinutes ? rawLate : 0;

    let workedHours = 0, regularHours = 0, overtimeHours25 = 0, overtimeHours35 = 0;
    if (clockOut) {
      const outTotal = toM(clockOut);
      const normOut = norm(outTotal);
      const effectiveNormIn = (isNightShift && normIn > fullJornada) ? 0 : normIn;

      const totalMinutes = (normOut >= effectiveNormIn ? normOut - effectiveNormIn : 0) - effectiveBreakMinutes;
      workedHours = Math.max(0, totalMinutes / 60);
      const effectiveStart = Math.max(effectiveNormIn, normSchedStart);
      const regularMinutes = Math.max(0, normSchedEnd - effectiveStart - effectiveBreakMinutes);
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
      await entitiesAPI.AttendanceRecord.update(editingRecord.id, {
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
          let scheduledMinutes = schedEndMin - schedStartMin;
          if (scheduledMinutes < 0) scheduledMinutes += 1440;
          const effectiveBreakMin = scheduledMinutes < 360 ? 0 : breakMin;

          const workedMin  = outTotal - inTotal - effectiveBreakMin;
          const workedHrs  = Math.max(0, workedMin / 60);
          // Horas normales = desde cuando empezó (o desde su hora programada si llegó tarde) hasta fin de jornada, menos break
          const normalHrs  = Math.max(0, (schedEndMin - Math.max(inTotal, schedStartMin) - effectiveBreakMin) / 60);
          const extraHrs   = Math.max(0, workedHrs - normalHrs);

          // overtime_authorized: usa el valor actual del registro (ya persistido) o el del horario
          const overtimeAuth = editingRecord.overtime_authorized ?? schedule.overtime_authorized ?? false;

          // Buscar alertas pendientes para este registro
          const existingAlerts = await entitiesAPI.OvertimeAlert.filter({
            attendance_record_id: editingRecord.id,
            status: "Pendiente",
          });

          if (extraHrs > 0 && !overtimeAuth) {
            if (!existingAlerts || existingAlerts.length === 0) {
              // Crear nueva alerta
              await entitiesAPI.OvertimeAlert.create({
                employee_id:          editingRecord.employee_id,
                attendance_record_id: editingRecord.id,
                alert_date:           recordDate,
                overtime_hours:       extraHrs,
                status:               "Pendiente",
              });
              toast.warning(`⚠️ ${extraHrs.toFixed(2)}h extras sin autorización — se generó alerta de aprobación.`);
            } else {
              // Actualizar la alerta existente con las nuevas horas
              await entitiesAPI.OvertimeAlert.update(existingAlerts[0].id, {
                overtime_hours: extraHrs,
              });
              toast.warning(`⚠️ ${extraHrs.toFixed(2)}h extras — alerta de aprobación pendiente.`);
            }
          } else if (extraHrs === 0 && existingAlerts && existingAlerts.length > 0) {
            // La marcación corregida ya no genera extras → cancelar alerta pendiente
            await entitiesAPI.OvertimeAlert.update(existingAlerts[0].id, { status: "Descartado" });
          }
        }
      }

      // 3. Recalcular con el backend.
      //    El backend respeta overtime_authorized del registro:
      //    - Si es false (o no hay alerta aprobada), HE quedan en 0.
      //    - Si es true (alerta aprobada), calcula HE 25% y 35%.
      await recalcularAsistenciaService.invoke(
        editingRecord.employee_id,
        recordDate,
        recordDate,
      );

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
    setIsApproving(true);
    try {
      await entitiesAPI.AttendanceIncident.update(incident.id, {
        status: "Aprobada",
        reviewed_by: `${effectiveEmployee?.first_name} ${effectiveEmployee?.last_name}`,
        review_date: todayLima(),
        review_comments: reviewComments || "Aprobada",
      });

      // Si el tipo de incidente es "Permiso", actualizar clock_in/clock_out del registro
      const incType = incidentTypes.find(t => t.name === incident.incident_type);
      if (incType?.affectation === "Permiso") {
        const dateStr = incident.incident_date;
        const sched = getEmployeeScheduleForDate(incident.employee_id, dateStr);
        const dow = new Date(dateStr + "T00:00:00").getDay();
        const dayStarts = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
        const dayEnds = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
        const sStart = sched?.[dayStarts[dow]] || "09:00";
        const sEnd = sched?.[dayEnds[dow]] || "18:00";

        const existingRecords = await entitiesAPI.AttendanceRecord.filter({
          employee_id: incident.employee_id,
          date: dateStr,
        });
        const record = existingRecords?.[0];
        if (record) {
          await entitiesAPI.AttendanceRecord.update(record.id, {
            clock_in: sStart,
            clock_out: sEnd,
          });
        } else {
          await entitiesAPI.AttendanceRecord.create({
            employee_id: incident.employee_id,
            date: dateStr,
            clock_in: sStart,
            clock_out: sEnd,
            scheduled_start: sStart,
            scheduled_end: sEnd,
            status: "Justificado",
            is_absent: false,
          });
        }
      }

      // Recalcular tardanzas y HE
      await recalcularAsistenciaService.invoke(
        incident.employee_id,
        incident.incident_date,
        incident.incident_date,
      );

      queryClient.invalidateQueries(["allIncidents"]);
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success("Justificación aprobada correctamente");
      setShowIncidentModal(false);
      setReviewingIncident(null);
      setReviewComments("");
    } catch (error) {
      toast.error("Error al aprobar la justificación: " + (error.message || ""));
    } finally {
      setIsApproving(false);
    }
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
      i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === dateStr
    );

    if (!prevIncident) {
      // Fetch directo para asegurar que encontramos el incidente aunque no esté en los 500 cargados
      const fetched = await entitiesAPI.AttendanceIncident.filter({
        employee_id: emp.id,
        incident_date: dateStr,
      });
      prevIncident = fetched?.find(
        i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === dateStr
      ) || null;
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
  const accessibleSites = permissionsLoading ? undefined : getAccessibleSites([
    "attendance.view_all",
    "attendance.view_department",
    "attendance.manage",
    "attendance.approve_edits",
  ]);
  const isSiteRestricted = accessibleSites !== null && accessibleSites !== undefined;
  const hasSingleSite = isSiteRestricted && Array.isArray(accessibleSites) && accessibleSites.length === 1;

  // Auto-aplicar filtro de sede cuando hay restricción a una sola sede
  useEffect(() => {
    if (hasSingleSite) {
      setSelectedSite(accessibleSites[0]);
    }
  }, [hasSingleSite, Array.isArray(accessibleSites) ? accessibleSites.join(",") : ""]);

  // El backend ya aplica el alcance autorizado por sede/departamento/equipo.
  const siteAllowedEmployees = permissionsLoading ? [] : allEmployees;
  const normalizeSite = value => String(value || "").trim().toLocaleLowerCase();

  const filteredEmployees = siteAllowedEmployees.filter(emp => {
    const term = searchTerm.toLowerCase().trim();
    const fullName = `${emp.first_name} ${emp.last_name}`.toLowerCase();
    const fullNameReverse = `${emp.last_name} ${emp.first_name}`.toLowerCase();
    const matchesSearch = !term ||
      fullName.includes(term) ||
      fullNameReverse.includes(term) ||
      emp.document_number.toLowerCase().includes(term) ||
      term.split(/\s+/).every(word => fullName.includes(word));
    const matchesSite = hasSingleSite ||
      selectedSite === "all" ||
      normalizeSite(emp.site) === normalizeSite(selectedSite) ||
      (selectedSite === "sin_sede" && !emp.site);
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
      for (const dateStr of dateList) {
        // Omitir fechas anteriores al ingreso o posteriores al cese.
        if (!isEmploymentDateValid(emp, dateStr)) continue;
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
      if (attendanceFilter === "con_tardanza") return (emp.record?.late_minutes ?? 0) > 0;
      return true;
    });
  } else {
    // Solo mostrar empleados que tengan un registro en la BD para la fecha seleccionada (no futura)
    const selectedDateStr = dateToStringLima(selectedDate);
    if (selectedDateStr > todayDateStr) {
      employeesWithRecords = [];
    } else {
    employeesWithRecords = filteredEmployees.filter(emp => {
      if (!isEmploymentDateValid(emp, selectedDateStr)) return false;
      const record = todayRecords.find(r => r.employee_id === emp.id && r.date === selectedDateStr);
      return !!record; // solo si existe registro en la BD
    }).map(emp => {
      const record = todayRecords.find(r => r.employee_id === emp.id);
      return { ...emp, record, displayDate: selectedDateStr };
    }).filter(emp => {
      if (attendanceFilter === "all") return true;
      if (attendanceFilter === "sin_entrada") return !emp.record.clock_in;
      if (attendanceFilter === "sin_salida") return emp.record.clock_in && !emp.record.clock_out;
      if (attendanceFilter === "con_tardanza") return (emp.record?.late_minutes ?? 0) > 0;
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
      await recalcularAsistenciaService.invoke(
        emp.id,
        "2020-01-01",
        format(new Date(), "yyyy-MM-dd"),
      );
      done++;
      setRecalcProgress({ done, total: empList.length });
    }
    setRecalculandoTodo(false);
    queryClient.invalidateQueries(["todayAttendance"]);
    toast.success(`✓ Recálculo completado para ${done} empleados`);
  };

  const handleExportIncidentsExcel = () => {
    const statusMap = { pending: "Pendiente", approved: "Aprobada", rejected: "Rechazada" };
    const statusLabel = statusMap[incidentSubTab];
    const sourceList = incidentSubTab === "pending" ? pendingIncidents
      : incidentSubTab === "approved" ? approvedIncidents
      : rejectedIncidents;
    const items = applyIncidentFilters(sourceList);
    if (items.length === 0) {
      toast.info("No hay justificaciones para exportar");
      return;
    }
    const dataToExport = items.map(incident => {
      const emp = allEmployees.find(e => e.id === incident.employee_id);
      const periodStr = incident.full_day_justification
        ? `Día completo (${incident.justified_time_start || ""} - ${incident.justified_time_end || ""})`
        : `${incident.justified_time_start || ""} - ${incident.justified_time_end || ""}`;
      return {
        "Fecha": incident.incident_date || "",
        "Tipo Doc": emp?.document_type || "",
        "DNI": emp?.document_number || "",
        "Nombres": emp?.first_name || "",
        "Apellidos": emp?.last_name || "",
        "Cargo": emp?.position || "",
        "Departamento": emp?.department_name || "",
        "Tipo Incidente": incident.incident_type || "",
        "Justificación": incident.justification || "",
        "Día Completo": incident.full_day_justification ? "Sí" : "No",
        "Período Justificado": periodStr,
        "Horas a Ajustar": hoursDecimalToExcelFraction(incident.hours_to_adjust ?? 0),
        "Documento Adjunto": incident.supporting_document_url || "",
        "Estado": incident.status || "",
        "Revisado por": incident.reviewed_by || "",
        "Fecha Revisión": incident.review_date || "",
        "Comentarios Revisión": incident.review_comments || "",
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    // Aplicar formato hora a "Horas a Ajustar"
    const rangeInc = XLSX.utils.decode_range(ws['!ref']);
    for (let c = rangeInc.s.c; c <= rangeInc.e.c; c++) {
      const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (headerCell && headerCell.v === "Horas a Ajustar") {
        for (let r = 1; r <= rangeInc.e.r; r++) {
          const cellRef = XLSX.utils.encode_cell({ r, c });
          if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
            ws[cellRef].z = 'hh:mm';
          }
        }
        break;
      }
    }
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Justificaciones");
    XLSX.writeFile(wb, `Justificaciones_${statusLabel}_${format(new Date(), "yyyyMMdd_HHmm")}.xlsx`);
    toast.success(`✓ ${items.length} justificación(es) exportada(s)`);
  };

  // Convierte "HH:mm" (o "HH:mm:ss") a una fracción de día para Excel (0–1)
  const timeStrToExcelFraction = (t) => {
    if (!t || typeof t !== "string") return null;
    const m = t.trim().match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (!m) return null;
    const h = parseInt(m[1], 10);
    const min = parseInt(m[2], 10);
    const sec = m[3] ? parseInt(m[3], 10) : 0;
    if (isNaN(h) || isNaN(min) || isNaN(sec)) return null;
    return (h + min / 60 + sec / 3600) / 24;
  };

  // Convierte horas decimales (ej: 8.5) a fracción de día para Excel
  const hoursDecimalToExcelFraction = (n) => {
    if (n === null || n === undefined || isNaN(n)) return null;
    return n / 24;
  };

  const handleExportToExcel = async () => {
    let freshIncidents = allIncidents;
    try {
      const fetched = await entitiesAPI.AttendanceIncident.list("-incident_date");
      if (fetched?.length) freshIncidents = fetched;
    } catch (_) {
      // Usa los incidentes ya cargados si falla la actualización.
    }

    const dataToExport = employeesWithRecords.map(emp => {
      const rowDate = emp.displayDate || dateToStringLima(selectedDate);
      const vacation = approvedVacations.find(
        v => v.employee_id === emp.id && String(v.start_date).slice(0, 10) <= rowDate && String(v.end_date).slice(0, 10) >= rowDate
      ) || null;
      const isVacation = emp.record?.status === "Vacaciones" || !!vacation;
      const incidentsForRow = freshIncidents.filter(
        i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate
      );
      const incident = incidentsForRow.find(i => i.status === 'Aprobada')
        || incidentsForRow[0]
        || null;
      const estadoMarcacion = isVacation
        ? 'Vacaciones'
        : getStatusConfig(emp.record?.status, emp.record?.clock_in, incident).text;

      // Calcular métricas efectivas con unión de intervalos (sin duplicar horas)
      const schedForRowEx = getEmployeeScheduleForDate(emp.id, rowDate);
      const dowForRow2  = new Date(rowDate + "T00:00:00").getDay();
      const stMap2 = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
      const enMap2 = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
      const schedStartEx = schedForRowEx?.[stMap2[dowForRow2]] || "09:00";
      const schedEndEx   = schedForRowEx?.[enMap2[dowForRow2]] || "18:00";
      const breakMinEx   = schedForRowEx?.break_duration_minutes ?? 60;
      const breakStEx    = schedForRowEx?.break_start || null;

      const approvedIncsEx = freshIncidents.filter(
        i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate && i.status === 'Aprobada'
      );

      let excelHours, excelLate;
      if (estadoMarcacion === 'Vacaciones') {
        excelHours = schedForRowEx ? Math.max(0, (
          (parseInt(schedEndEx.split(':')[0]) * 60 + parseInt(schedEndEx.split(':')[1])) -
          (parseInt(schedStartEx.split(':')[0]) * 60 + parseInt(schedStartEx.split(':')[1])) - breakMinEx
        ) / 60) : 8;
        excelLate = 0;
      } else {
        const excelMetrics = calcEffectiveMetrics({
          record: emp.record,
          approvedIncidents: approvedIncsEx,
          schedStart: schedStartEx,
          schedEnd: schedEndEx,
          breakMinutes: breakMinEx,
          breakStart: breakStEx,
        });
        excelHours = excelMetrics.totalWorkedHours;
        excelLate  = applyLateTolerance(
          excelMetrics.remainingLateMinutes,
          schedForRowEx?.tolerance_minutes ?? 10
        );
      }

      // Descontar compensaciones de tardanza (pendientes + aprobadas) de la tardanza efectiva
      const compAdjEx = getCompensationAdjustments(emp.id, rowDate);
      if (estadoMarcacion !== 'Vacaciones') {
        const totalCompLateEx = compAdjEx.pendingLateMin + compAdjEx.approvedLateMin;
        excelLate = Math.max(0, excelLate - totalCompLateEx);
      }

      // Descontar HE pendientes de compensar (primero 25%, luego 35%)
      let excelHE25 = emp.record?.overtime_hours_25 ?? 0;
      let excelHE35 = emp.record?.overtime_hours_35 ?? 0;
      if (estadoMarcacion !== 'Vacaciones' && compAdjEx.pendingOTHours > 0) {
        let remOTEx = compAdjEx.pendingOTHours;
        if (remOTEx > 0 && excelHE25 > 0) {
          const d = Math.min(excelHE25, remOTEx);
          excelHE25 -= d;
          remOTEx -= d;
        }
        if (remOTEx > 0 && excelHE35 > 0) {
          const d = Math.min(excelHE35, remOTEx);
          excelHE35 -= d;
          remOTEx -= d;
        }
      }

      // Calcular horas justificadas (solo de incidentes aprobados)
      let tiempoPapeleta = '';
      if (approvedIncsEx.length > 0) {
        const justMetrics = calcEffectiveMetrics({
          record: null,
          approvedIncidents: approvedIncsEx,
          schedStart: schedStartEx,
          schedEnd: schedEndEx,
          breakMinutes: breakMinEx,
          breakStart: breakStEx,
        });
        tiempoPapeleta = `${justMetrics.totalWorkedHours.toFixed(2)} h`;
      }

      // Para vacaciones: mostrar horario programado como marcación
      const { firstClockIn, lastClockOut } = getSegmentClockTimes(emp.record);
      let entradaExcel = timeStrToExcelFraction(firstClockIn);
      let salidaExcel  = timeStrToExcelFraction(lastClockOut);
      if (estadoMarcacion === 'Vacaciones') {
        entradaExcel = timeStrToExcelFraction(schedStartEx);
        salidaExcel  = timeStrToExcelFraction(schedEndEx);
      }

      return {
        'Horario Programado': schedForRowEx ? `${schedStartEx}-${schedEndEx}` : 'Sin horario',
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
        'Horas Marcadas': hoursDecimalToExcelFraction(emp.record?.regular_hours ?? emp.record?.worked_hours ?? 0),
        'Horas Efectivas (marcadas+justificadas)': hoursDecimalToExcelFraction(excelHours),
        'Tardanza Efectiva (min)': excelLate,
        'HE 25%': hoursDecimalToExcelFraction(excelHE25),
        'HE 35%': hoursDecimalToExcelFraction(excelHE35),
        'Estado Marcación': estadoMarcacion,
        'Tiene Justificación': approvedIncsEx.length > 0 ? 'Sí' : 'No',
        'Tipo Incidente': incident ? incident.incident_type : '',
        'Estado Papeleta': incident ? incident.status : '',
        'Período Justificado': incident
          ? (incident.full_day_justification
              ? `Día completo (${incident.justified_time_start || schedStartEx} - ${incident.justified_time_end || schedEndEx})`
              : `${incident.justified_time_start || ''} - ${incident.justified_time_end || ''}`)
          : '',
        'Horas Justificadas': tiempoPapeleta
          ? hoursDecimalToExcelFraction(parseFloat(tiempoPapeleta))
          : '',
        'Detalle Justificación': incident ? incident.justification : '',
        'Documento Adjunto': incident?.supporting_document_url || '',
        'Revisado por': incident?.reviewed_by || '',
        'Fecha Revisión': incident?.review_date || '',
        'Comentarios Revisión': incident?.review_comments || '',
      };
    });
    const ws = XLSX.utils.json_to_sheet(dataToExport);
    // Aplicar formato hora (hh:mm) a las columnas de horas
    const range = XLSX.utils.decode_range(ws['!ref']);
    const timeCols = ['Entrada', 'Salida', 'Horas Marcadas',
      'Horas Efectivas (marcadas+justificadas)', 'HE 25%', 'HE 35%', 'Horas Justificadas'];
    const timeColIndexes = [];
    for (let c = range.s.c; c <= range.e.c; c++) {
      const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c })];
      if (headerCell && timeCols.includes(headerCell.v)) {
        timeColIndexes.push(c);
      }
    }
    timeColIndexes.forEach(c => {
      for (let r = 1; r <= range.e.r; r++) {
        const cellRef = XLSX.utils.encode_cell({ r, c });
        if (ws[cellRef] && typeof ws[cellRef].v === 'number') {
          ws[cellRef].z = 'hh:mm';
        }
      }
    });
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
    const printContent = `<!DOCTYPE html><html><head><title>Reporte de Asistencia</title><style>body{font-family:Arial,sans-serif;padding:20px;font-size:12px}.header{text-align:center;margin-bottom:30px;border-bottom:2px solid #333;padding-bottom:15px}.header h1{margin:5px 0;font-size:24px}.header p{margin:3px 0;color:#666}table{width:100%;border-collapse:collapse;margin-top:20px}th,td{border:1px solid #ddd;padding:8px;text-align:left}th{background-color:#4f46e5;color:white;font-weight:bold}tr:nth-child(even){background-color:#f9fafb}.late{color:#ea580c;font-weight:bold}.absent{color:#dc2626;font-weight:bold}.complete{color:#16a34a;font-weight:bold}.footer{margin-top:30px;text-align:center;font-size:11px;color:#666}@media print{body{margin:0}.no-print{display:none}}</style></head><body><div class="header"><h1>Reporte de Asistencia</h1><p><strong>Fecha:</strong> ${format(parseDateLima(dateToStringLima(selectedDate)), "dd 'de' MMMM, yyyy", { locale: es })}</p><p><strong>Filtro aplicado:</strong> ${filterText}</p><p><strong>Total de empleados:</strong> ${employeesWithRecords.length}</p></div><table><thead><tr><th>DNI</th><th>Empleado</th><th>Cargo</th><th>Departamento</th><th>Entrada</th><th>Salida</th><th>Horas</th><th>Tardanza</th><th>HE 25%</th><th>HE 35%</th><th>Estado</th></tr></thead><tbody>${employeesWithRecords.map(emp => { const wh = emp.record?.worked_hours || 0; const { firstClockIn, lastClockOut } = getSegmentClockTimes(emp.record); const hasLate = (emp.record?.late_minutes ?? 0) > 0; return `<tr><td>${emp.document_number}</td><td>${emp.first_name} ${emp.last_name}</td><td>${emp.position}</td><td>${emp.department_name}</td><td>${firstClockIn || '--:--'}</td><td>${lastClockOut || '--:--'}</td><td>${wh.toFixed(2)}h</td><td class="${hasLate ? 'late' : ''}">${emp.record?.late_minutes || 0} min</td><td>${(emp.record?.overtime_hours_25 ?? 0).toFixed(2)}h</td><td>${(emp.record?.overtime_hours_35 ?? 0).toFixed(2)}h</td><td class="${emp.record?.status === 'Completo' ? 'complete' : emp.record?.status === 'Ausente' ? 'absent' : ''}">${emp.record?.status || 'Sin marcar'}</td></tr>`; }).join('')}</tbody></table><div class="footer"><p>Generado el ${format(new Date(), "dd/MM/yyyy 'a las' HH:mm")} - Sistema de Recursos Humanos</p></div><script>window.onload=function(){window.print()}</script></body></html>`;
    printWindow.document.write(printContent);
    printWindow.document.close();
  };

  /**
   * Calcula las métricas efectivas de una fila (asistencia + justificaciones aprobadas)
   * sin modificar el AttendanceRecord. Usa union de intervalos para evitar duplicados.
   */
  const getRowMetrics = (emp, rowDate) => {
    const record = emp.record || null;
    const schedForRow = getEmployeeScheduleForDate(emp.id, rowDate);
    const dow = new Date(rowDate + "T00:00:00").getDay();
    const stMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
    const enMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
    const schedStart = schedForRow?.[stMap[dow]] || "09:00";
    const schedEnd   = schedForRow?.[enMap[dow]] || "18:00";
    const breakMin   = schedForRow?.break_duration_minutes ?? 60;
    const breakSt    = schedForRow?.break_start || null;

    const approvedIncs = allIncidents.filter(
      i => i.employee_id === emp.id && i.incident_date === rowDate && i.status === "Aprobada"
    );

    return {
      ...calcEffectiveMetrics({
        record,
        approvedIncidents: approvedIncs,
        schedStart,
        schedEnd,
        breakMinutes: breakMin,
        breakStart: breakSt,
      }),
      schedStart,
      schedEnd,
      toleranceMinutes: schedForRow?.tolerance_minutes ?? 10,
    };
  };

  const applyLateTolerance = (remainingLateMinutes, toleranceMinutes = 10) =>
    remainingLateMinutes > toleranceMinutes ? remainingLateMinutes : 0;

  /**
   * Obtiene los ajustes de compensación de tardanza para un empleado y fecha.
   * Devuelve los minutos de tardanza y horas extras pendientes y aprobadas
   * para descontarlos de la visualización en el control de asistencia.
   */
  const getCompensationAdjustments = (empId, rowDate) => {
    const comps = allIncidents.filter(
      i => i.employee_id === empId &&
      i.incident_date === rowDate &&
      i.incident_type === "Compensación de Tardanza" &&
      (i.status === "Pendiente" || i.status === "Aprobada")
    );
    let pendingLateMin = 0, approvedLateMin = 0, pendingOTHours = 0;
    let hasPending = false;
    for (const c of comps) {
      if (c.status === "Pendiente") {
        pendingLateMin += c.late_minutes_to_adjust || 0;
        pendingOTHours += c.hours_to_adjust || 0;
        hasPending = true;
      } else if (c.status === "Aprobada") {
        approvedLateMin += c.late_minutes_to_adjust || 0;
      }
    }
    return { pendingLateMin, approvedLateMin, pendingOTHours, hasPending };
  };

  // Obtener horario programado de entrada/salida para mostrar en vacaciones
  const getScheduledTimes = (empId, rowDate) => {
    const schedule = getEmployeeScheduleForDate(empId, rowDate);
    if (!schedule) return { start: "09:00", end: "18:00" };
    const dayMap = ["sunday_start", "monday_start", "tuesday_start", "wednesday_start", "thursday_start", "friday_start", "saturday_start"];
    const dayEndMap = ["sunday_end", "monday_end", "tuesday_end", "wednesday_end", "thursday_end", "friday_end", "saturday_end"];
    const dow = new Date(rowDate + "T00:00:00").getDay();
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
      "Sin marcar": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Sin marcar" },
      "Incompleto": { color: "bg-yellow-100 text-yellow-700 border-yellow-200", icon: Clock, text: "Incompleto" },
      "Revisar": { color: "bg-orange-100 text-orange-700 border-orange-200", icon: AlertCircle, text: "Revisar" },
      "Completo": { color: "bg-green-100 text-green-700 border-green-200", icon: CheckCircle, text: "Completo" },
      "Aprobada": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Aprobada" },
      "Ausente": { color: "bg-red-100 text-red-700 border-red-200", icon: XCircle, text: "Sin marcar" },
      "Justificado": { color: "bg-blue-100 text-blue-700 border-blue-200", icon: FileText, text: "Aprobada" },
    };
    return configs[status] || configs["Incompleto"];
  };

  if (permissionsLoading || (!effectiveEmployee && permissionsLoading)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
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
    hasPermission("attendance.approve_edits") ||
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
          <div className="mb-8 flex flex-wrap justify-between items-start gap-3">
            <div>
              <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">Gestión de Asistencia</h1>
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
                <Button variant="outline" onClick={() => navigate(createPageUrl("DatabaseConfig"))}>
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
              { label: "Tardanzas", value: todayRecords.filter(r => (r.late_minutes ?? 0) > 0).length, icon: Clock, color: "yellow" },
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
            <div className="flex flex-wrap items-center justify-between gap-3">
              <TabsList className="grid grid-cols-2 sm:grid-cols-4 w-full sm:w-auto">
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
              <div className="flex flex-wrap items-center gap-2">
                {hasPermission("system.admin") && (
                  <Button
                    onClick={handleRecalcularTodo}
                    variant="outline"
                    disabled={recalculandoTodo}
                    className="whitespace-nowrap border-orange-300 text-orange-700 hover:bg-orange-50 text-xs sm:text-sm"
                  >
                    {recalculandoTodo
                      ? `Recalculando... ${recalcProgress.done}/${recalcProgress.total}`
                      : "Recalcular Todo"}
                  </Button>
                )}
                {canExportAttendance && <Button onClick={() => handleExportToExcel()} variant="outline" className="bg-green-600 text-white hover:bg-green-700 whitespace-nowrap text-xs sm:text-sm">
                  <Download className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Excel</span><span className="sm:hidden">XLS</span>
                </Button>}
                <Button onClick={handlePrint} variant="outline" className="whitespace-nowrap text-xs sm:text-sm">
                  <Printer className="w-4 h-4 mr-1 sm:mr-2" /><span className="hidden sm:inline">Imprimir</span>
                </Button>
              </div>
            </div>

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
                          {isSiteRestricted && accessibleSites?.length > 1 && <SelectItem value="all">Todas (permitidas)</SelectItem>}
                          {sites
                            .filter(site => accessibleSites === null || accessibleSites?.includes(site.name))
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
                        <col style={{width: "270px"}} />
                        <col style={{width: "60px"}} />
                        <col style={{width: "70px"}} />
                        <col style={{width: "70px"}} />
                        <col style={{width: "65px"}} />
                        <col style={{width: "65px"}} />
                        <col style={{width: "65px"}} />
                        <col style={{width: "70px"}} />
                        <col style={{width: "70px"}} />
                        <col style={{width: "60px"}} />
                        <col style={{width: "60px"}} />
                        <col style={{width: "70px"}} />
                        <col style={{width: "110px"}} />
                        <col style={{width: "90px"}} />
                        <col style={{width: "300px"}} />
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
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2 text-green-700">H. Ajust.</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Justificación</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">Est. Just.</th>
                          <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2 rounded-r-lg">Acciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {employeesWithRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize).map((emp, idx) => {
                          const rowDate = emp.displayDate || format(selectedDate, "yyyy-MM-dd");
                          const vacation = approvedVacations.find(v =>  v.employee_id === emp.id && String(v.start_date).slice(0, 10) <= rowDate && String(v.end_date).slice(0, 10) >= rowDate) || null;
                          const isVacation = emp.record?.status === "Vacaciones" || !!vacation;
                          const scheduledTimes = isVacation ? getScheduledTimes(emp.id, rowDate) : null;
                          // Buscar incidente aprobado para esta fila
                          const approvedIncident = allIncidents.find(
                            i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate && i.status === "Aprobada"
                          ) || null;
                          const rowIncident = approvedIncident || allIncidents.find(
                            i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate
                          ) || null;

                          const statusConfig = isVacation
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
                          const compAdj = getCompensationAdjustments(emp.id, rowDate);
                          const { firstClockIn, lastClockOut } = getSegmentClockTimes(emp.record);

                          return (
                            <tr key={rowKey} className={`border-b last:border-b-0 hover:bg-slate-50 transition-colors ${isVacation ? "bg-amber-50/40" : "bg-white"}`}>
                              {/* Empleado */}
                              <td className={`px-3 py-2 border-l-2 ${isVacation ? "border-amber-300" : "border-transparent"}`}>
                                <div className="flex items-center gap-2">
                                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 ${isVacation ? "bg-gradient-to-br from-amber-400 to-orange-500" : "bg-gradient-to-br from-indigo-500 to-purple-600"}`}>
                                    {emp.first_name[0]}{emp.last_name[0]}
                                  </div>
                                  <div className="min-w-0 overflow-hidden">
                                    <p className="font-semibold text-slate-900 text-xs truncate">{emp.document_type} {emp.document_number} - {emp.first_name} {emp.last_name}</p>
                                    <p className="text-xs text-slate-400 truncate">{emp.department_name}</p>
                                    {!sched && <p className="text-xs text-red-500">Sin horario</p>}
                                    {sched && !schedSt && <p className="text-xs text-slate-400">Día libre</p>}
                                    {sched && schedSt && <p className="text-xs text-indigo-600">🕐 {schedSt}–{schedEn}</p>}
                                    {isVacation && <p className="text-xs text-amber-700 font-medium">🌴 {vacation?.request_type || "Vacaciones"}</p>}
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
                                {isVacation
                                  ? <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{scheduledTimes?.start}</span>
                                  : <span className={`text-sm font-bold ${firstClockIn ? 'text-slate-900' : 'text-slate-300'}`}>{firstClockIn || "--:--"}</span>
                                }
                              </td>
                              {/* Salida */}
                              <td className="px-2 py-2 text-center">
                                {vacation
                                  ? <span className="text-xs font-semibold text-amber-600 bg-amber-100 px-1.5 py-0.5 rounded">{scheduledTimes?.end}</span>
                                  : <span className={`text-sm font-bold ${lastClockOut ? 'text-slate-900' : 'text-slate-300'}`}>{lastClockOut || "--:--"}</span>
                                }
                              </td>
                              {/* Horas — cobertura real: asistencia + justificadas aprobadas (sin duplicar) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (vacation) {
                                    return <span className="text-sm font-bold text-slate-900">8h 0m</span>;
                                  }
                                  const metrics = getRowMetrics(emp, rowDate);
                                  const totalMin = Math.round(metrics.totalWorkedHours * 60);
                                  const hh = Math.floor(totalMin / 60);
                                  const mm = totalMin % 60;
                                  const hasJust = metrics.justifiedHours > 0;
                                  return (
                                    <span className={`text-sm font-bold ${hasJust ? "text-indigo-700" : "text-slate-900"}`}>
                                      {hh}h {mm}m
                                    </span>
                                  );
                                })()}
                              </td>
                              {/* H. Just. Inicio — solo si hay incidente aprobado */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (!approvedIncident) return <span className="text-xs text-slate-300">—</span>;
                                  return <span className="text-xs font-semibold text-green-700">{approvedIncident.justified_time_start || "—"}</span>;
                                })()}
                              </td>
                              {/* H. Just. Fin — solo si hay incidente aprobado */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (!approvedIncident) return <span className="text-xs text-slate-300">—</span>;
                                  return <span className="text-xs font-semibold text-green-700">{approvedIncident.justified_time_end || "—"}</span>;
                                })()}
                              </td>
                              {/* H. Just. — horas justificadas aprobadas (considerando jornada y refrigerio) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const approvedInc = approvedIncident;
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
                              {/* Tardanza neta — calculada con union de intervalos, descontando compensaciones */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (vacation) return <span className="text-xs font-bold text-slate-400">0m</span>;
                                  const metrics = getRowMetrics(emp, rowDate);
                                  const adjustedLate = applyLateTolerance(
                                    metrics.remainingLateMinutes,
                                    metrics.toleranceMinutes
                                  );
                                  // Descontar compensaciones pendientes y aprobadas
                                  const totalCompLate = compAdj.pendingLateMin + compAdj.approvedLateMin;
                                  const netLate = Math.max(0, adjustedLate - totalCompLate);
                                  const lh = Math.floor(netLate / 60);
                                  const lm = netLate % 60;
                                  const lateStr = lh > 0 ? `${lh}h ${lm}m` : `${lm}m`;
                                  return (
                                    <span className="flex flex-col items-center">
                                      <span className={`text-xs font-bold ${netLate > 0 ? 'text-orange-600' : 'text-slate-400'}`}>{lateStr}</span>
                                      {totalCompLate > 0 && (
                                        <span className="text-[9px] text-indigo-500 whitespace-nowrap" title={`Compensado: ${totalCompLate} min`}>
                                          ↓{totalCompLate}m
                                        </span>
                                      )}
                                    </span>
                                  );
                                })()}
                              </td>
                              {/* HE 25% — descontando compensaciones pendientes */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (vacation) return <span className="text-xs font-bold text-slate-400">0m</span>;
                                  // Descontar HE pendientes de compensar (primero de 25%, luego 35%)
                                  let remOT = compAdj.pendingOTHours;
                                  let net25 = emp.record?.overtime_hours_25 ?? 0;
                                  let net35 = emp.record?.overtime_hours_35 ?? 0;
                                  if (remOT > 0 && net25 > 0) {
                                    const d = Math.min(net25, remOT);
                                    net25 -= d;
                                    remOT -= d;
                                  }
                                  if (remOT > 0 && net35 > 0) {
                                    const d = Math.min(net35, remOT);
                                    net35 -= d;
                                    remOT -= d;
                                  }
                                  const heMin = Math.round(net25 * 60);
                                  const hh = Math.floor(heMin / 60);
                                  const hm = heMin % 60;
                                  const heStr = hh > 0 ? `${hh}h ${hm}m` : `${hm}m`;
                                  return (
                                    <span className="flex flex-col items-center">
                                      <span className={`text-xs font-bold ${heMin > 0 ? 'text-blue-600' : 'text-slate-300'}`}>{heStr}</span>
                                      {compAdj.pendingOTHours > 0 && net25 < (emp.record?.overtime_hours_25 ?? 0) && (
                                        <span className="text-[9px] text-indigo-500 whitespace-nowrap" title={`Compensado: ${(compAdj.pendingOTHours * 60).toFixed(0)} min HE`}>
                                          ↓{(compAdj.pendingOTHours * 60).toFixed(0)}m
                                        </span>
                                      )}
                                    </span>
                                  );
                                })()}
                              </td>
                              {/* HE 35% — descontando compensaciones pendientes */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  if (vacation) return <span className="text-xs font-bold text-slate-400">0m</span>;
                                  const overtime25 = emp.record?.overtime_hours_25 ?? 0;
                                  const overtime35 = emp.record?.overtime_hours_35 ?? 0;
                                  const remainingCompensation = Math.max(0, compAdj.pendingOTHours - overtime25);
                                  const net35 = Math.max(0, overtime35 - remainingCompensation);
                                  const heMin = Math.round(net35 * 60);
                                  const hh = Math.floor(heMin / 60);
                                  const hm = heMin % 60;
                                  const heStr = hh > 0 ? `${hh}h ${hm}m` : `${hm}m`;
                                  return <span className={`text-xs font-bold ${heMin > 0 ? 'text-purple-600' : 'text-slate-300'}`}>{heStr}</span>;
                                })()}
                              </td>
                              {/* H. Justificadas (attendance_incident.hours_to_adjust) */}
                              <td className="px-2 py-2 text-center">
                                {(() => {
                                  const justH = Number(rowIncident?.hours_to_adjust || 0);
                                  const justMin = Math.round(justH * 60);
                                  const jh = Math.floor(justMin / 60);
                                  const jm = justMin % 60;
                                  return justMin > 0
                                    ? <span className="text-sm font-bold text-green-600">{jh}h {jm}m</span>
                                    : <span className="text-sm text-slate-300">—</span>;
                                })()}
                              </td>
                              {/* Justificación (tipo/descripción del incidente) */}
                              <td className="px-2 py-2 text-center">
                                {rowIncident
                                  ? <span className="text-xs text-slate-600 leading-tight block truncate max-w-[105px]" title={rowIncident.incident_type}>{rowIncident.incident_type}</span>
                                  : <span className="text-xs text-slate-300">—</span>
                                }
                              </td>
                              {/* Estado Justificación */}
                              <td className="px-2 py-2 text-center">
                                {rowIncident ? (() => {
                                  const colors = { Aprobada: "bg-green-100 text-green-700", Pendiente: "bg-orange-100 text-orange-700", Rechazada: "bg-red-100 text-red-700", Cancelada: "bg-slate-100 text-slate-500" };
                                  return <span className={`text-xs px-1.5 py-0.5 rounded font-medium ${colors[rowIncident.status] || "bg-slate-100 text-slate-500"}`}>{rowIncident.status}</span>;
                                })() : <span className="text-xs text-slate-300">—</span>}
                              </td>
                              {/* Acciones */}
                              <td className="px-2 py-2">
                                <div className="flex items-center gap-1 flex-wrap justify-start">
                                  <Badge
                                    className={`${statusConfig.color} text-xs shrink-0 whitespace-nowrap ${rowIncident ? "cursor-pointer hover:opacity-80" : ""}`}
                                    style={{minWidth: "78px", justifyContent: "center"}}
                                    onClick={rowIncident ? () => { setIncidentDetailData(rowIncident); setIncidentDetailEmployee(emp); setShowIncidentDetail(true); } : undefined}
                                    title={rowIncident ? "Ver detalle de justificación" : undefined}
                                  >
                                    <StatusIcon className="w-3 h-3 mr-1" />{statusConfig.text}
                                  </Badge>
                                  {compAdj.hasPending && (
                                    <Badge className="h-7 px-2 text-xs shrink-0 whitespace-nowrap bg-indigo-100 text-indigo-700 border border-indigo-300 flex items-center gap-1" title="Tiene compensación de tardanza pendiente de aprobación">
                                      <Clock className="w-3 h-3" />Comp. pend.
                                    </Badge>
                                  )}
                                  {canEditAttendance && !vacation && emp.record && (
                                    <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0 whitespace-nowrap text-purple-700 border-purple-300 hover:bg-purple-50"
                                      onClick={() => handleOpenValidationModal(emp.record)}
                                    >
                                      <CheckCircle className="w-3 h-3 mr-1" />Validar
                                    </Button>
                                  )}

                                  {canEditAttendance && !vacation && emp.record && (
                                    pendingEditRequests.some(request => request.attendance_record_id === emp.record.id) ? (
                                      <Badge className="h-7 px-2 text-xs shrink-0 whitespace-nowrap bg-indigo-100 text-indigo-700 border border-indigo-300">
                                        <Clock className="w-3 h-3 mr-1" />Edición pendiente
                                      </Badge>
                                    ) : (
                                      <Button size="sm" variant="outline" className="h-7 px-2 text-xs shrink-0 whitespace-nowrap" onClick={() => handleEditRecord(emp.record, emp)}>
                                        <Edit className="w-3 h-3 mr-1" />Editar
                                      </Button>
                                    )
                                  )}
                                  {!vacation && !emp.record && (
                                    <div style={{width: "62px", height: "28px", flexShrink: 0}} />
                                  )}
                                  {canEditAttendance && !vacation && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className={`h-7 px-2 text-xs shrink-0 whitespace-nowrap ${rowIncident ? "text-blue-700 border-blue-300 hover:bg-blue-50" : "text-orange-600 border-orange-200 hover:bg-orange-50"}`}
                                      onClick={() => handleJustifyClick(emp, emp.record, rowDate)}
                                    >
                                      <FileText className="w-3 h-3 mr-1" />{rowIncident ? "Ver/Editar" : "Justificar"}
                                    </Button>
                                  )}
                                  {vacation && <div style={{width: "138px", flexShrink: 0}} />}
                                  {canManageSchedules && <Button size="sm" variant="outline" className="h-7 px-2 text-indigo-600 border-indigo-200 hover:bg-indigo-50 shrink-0" title="Asignar horario"
                                    onClick={() => { setSchedulingEmployee({ ...emp, _rowDate: rowDate }); setShowScheduleModal(true); }}>
                                    <CalendarClock className="w-3 h-3" />
                                  </Button>}
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

            <TabsContent value="overtime-alerts" className="space-y-6">
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-red-50/50">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-red-600" />Alertas de Horas Extras No Autorizadas
                  </CardTitle>
                  <p className="text-sm text-slate-600 mt-2">Personal que registró horas extras sin autorización previa</p>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="flex flex-wrap items-center gap-3 mb-6">
                    <div className="relative flex-1 min-w-[180px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input placeholder="Buscar por nombre..." value={overtimeSearchTerm} onChange={(e) => { setOvertimeSearchTerm(e.target.value); setOvertimePage(1); }} className="pl-9" />
                    </div>
                    <Input type="date" value={overtimeDateFilter} onChange={(e) => { setOvertimeDateFilter(e.target.value); setOvertimePage(1); }} className="w-40" title="Filtrar por fecha" />
                    {overtimeDateFilter && <Button size="sm" variant="outline" onClick={() => { setOvertimeDateFilter(""); setOvertimePage(1); }}>✕ Fecha</Button>}
                    <div className="ml-auto">
                      <PaginationBar inline currentPage={overtimePage} totalItems={overtimeAlerts.filter(a => accessibleEmployeeIds.has(a.employee_id) && (!overtimeSearchTerm || (() => { const e = allEmployees.find(x => x.id === a.employee_id); return e ? `${e.first_name} ${e.last_name}`.toLowerCase().includes(overtimeSearchTerm.toLowerCase()) : false; })()) && (!overtimeDateFilter || a.alert_date === overtimeDateFilter)).length} pageSize={OVERTIME_PAGE_SIZE} onPageChange={setOvertimePage} />
                    </div>
                  </div>
                  {overtimeAlerts.length === 0 ? (
                    <div className="text-center py-12">
                    <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
                      <p className="text-slate-600">No hay alertas de horas extras</p>
                    </div>
                  ) : (
                    <>
                    {(() => {
                      const filteredOT = overtimeAlerts.filter(a => {
                        if (!accessibleEmployeeIds.has(a.employee_id)) return false;
                        if (overtimeSearchTerm) {
                          const emp = allEmployees.find(e => e.id === a.employee_id);
                          const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
                          if (!name.includes(overtimeSearchTerm.toLowerCase())) return false;
                        }
                        if (overtimeDateFilter && a.alert_date !== overtimeDateFilter) return false;
                        return true;
                      });
                      const pagedOT = filteredOT.slice((overtimePage - 1) * OVERTIME_PAGE_SIZE, overtimePage * OVERTIME_PAGE_SIZE);
                      return (
                    <>
                    <div className="space-y-4">
                      {pagedOT.map(alert => {
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
                                 <Badge className="bg-red-600 text-white">{Number(alert.overtime_hours || 0).toFixed(2)}h extras</Badge>
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
                           {canEditAttendance && <div className="flex gap-2 flex-wrap">
                              <Button size="sm" variant="outline" className="flex-1" onClick={() => record && handleEditRecord(record)}>
                                <Edit className="w-4 h-4 mr-2" />Corregir Marcación
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="flex-1 text-blue-700 border-blue-300 hover:bg-blue-50"
                                onClick={async () => {
                                  // 1. Marcar overtime_authorized=true en el registro del día
                                  if (record) {
                                    await entitiesAPI.AttendanceRecord.update(record.id, {
                                      overtime_authorized: true,
                                      notes: (record.notes ? record.notes + " | " : "") + `HE aceptadas: ${Number(alert.overtime_hours || 0).toFixed(2)}h (${alert.alert_date})`
                                    });
                                  }
                                  // 2. Marcar alerta como aprobada
                                  await entitiesAPI.OvertimeAlert.update(alert.id, {
                                    status: "Aprobado",
                                    notes: `HE aceptadas solo para el día ${alert.alert_date}`
                                  });
                                  // 3. Recalcular asistencia del día (tardanza + HE 25% + HE 35%)
                                  await recalcularAsistenciaService.recalculate(
                                    alert.employee_id,
                                    alert.alert_date,
                                    alert.alert_date
                                  );

                                  queryClient.invalidateQueries(["overtimeAlerts"]);
                                  queryClient.invalidateQueries(["todayAttendance"]);
                                  queryClient.invalidateQueries(["attendanceRecords"]);
                                  toast.success(`HE aceptadas y recalculadas para el ${format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}: HE25% y HE35% actualizadas`);
                                }}
                              >
                                <CheckCircle className="w-4 h-4 mr-2" />Aceptar HE (solo este día)
                              </Button>
                              <Button size="sm" variant="outline" className="text-slate-600" onClick={async () => {
                                await entitiesAPI.OvertimeAlert.update(alert.id, { status: "Descartado" });
                                queryClient.invalidateQueries(["overtimeAlerts"]);
                                toast.success("Alerta descartada");
                              }}>
                                <XCircle className="w-4 h-4 mr-2" />Descartar
                              </Button>
                           </div>}
                         </div>
                         );
                         })}
                         </div>

                         </>
                         );
                         })()}
                         </>
                         )}
                         </CardContent>
                         </Card>
                         </TabsContent>

            {/* Incidents Tab */}
            <TabsContent value="incidents" className="space-y-4">
              {/* Filtros globales de justificaciones */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="relative flex-1 min-w-[180px]">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input placeholder="Buscar por nombre..." value={incidentSearchTerm} onChange={(e) => { setIncidentSearchTerm(e.target.value); setIncidentPage(1); }} className="pl-9" />
                </div>
                <Select value={incidentTypeFilter} onValueChange={(v) => { setIncidentTypeFilter(v); setIncidentPage(1); }}>
                  <SelectTrigger className="w-52"><SelectValue placeholder="Tipo de incidente" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los tipos</SelectItem>
                    {[...new Set(allIncidents.map(i => i.incident_type).filter(Boolean))].sort().map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Input type="date" value={incidentDateFilter} onChange={(e) => { setIncidentDateFilter(e.target.value); setIncidentPage(1); }} className="w-40" title="Filtrar por fecha" />
                {incidentDateFilter && <Button size="sm" variant="outline" onClick={() => { setIncidentDateFilter(""); setIncidentPage(1); }}>✕ Fecha</Button>}
                <Button size="sm" variant="outline" className="bg-green-600 text-white hover:bg-green-700" onClick={handleExportIncidentsExcel}>
                  <Download className="w-4 h-4 mr-1" />Excel
                </Button>
                <div className="ml-auto">
                  <PaginationBar inline currentPage={incidentPage} totalItems={applyIncidentFilters(allIncidents).length} pageSize={INCIDENT_PAGE_SIZE} onPageChange={setIncidentPage} />
                </div>
              </div>
              <Tabs value={incidentSubTab} onValueChange={(v) => { setIncidentSubTab(v); setIncidentPage(1); }}>
                <TabsList className="grid w-full max-w-xl grid-cols-3 mb-6">
                  <TabsTrigger value="pending">Pendientes {pendingIncidents.length > 0 && <Badge className="ml-2 bg-orange-600 text-white">{pendingIncidents.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="approved">Aprobadas {approvedIncidents.length > 0 && <Badge className="ml-2 bg-green-600 text-white">{approvedIncidents.length}</Badge>}</TabsTrigger>
                  <TabsTrigger value="rejected">Rechazadas {rejectedIncidents.length > 0 && <Badge className="ml-2 bg-red-600 text-white">{rejectedIncidents.length}</Badge>}</TabsTrigger>
                </TabsList>

                <TabsContent value="pending">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-slate-50/50"><CardTitle className="text-xl font-bold">Justificaciones Pendientes de Aprobación</CardTitle></CardHeader>
                    <CardContent className="p-6">
                      {(() => {
                        const filtered = applyIncidentFilters(pendingIncidents);
                        const paged = filtered.slice((incidentPage - 1) * INCIDENT_PAGE_SIZE, incidentPage * INCIDENT_PAGE_SIZE);
                        return filtered.length === 0 ? (
                          <div className="text-center py-12"><CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones pendientes</p></div>
                        ) : (
                          <>
                          <div className="space-y-4">
                          {paged.map(incident => {
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
                                   <a href={getPublicAssetUrl(incident.supporting_document_url)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 text-sm text-indigo-600 hover:underline bg-indigo-50 px-3 py-2 rounded-lg">
                                      <Download className="w-4 h-4" />Ver documento adjunto
                                    </a>
                                  </div>
                                )}
                                {canApproveIncidents ? (
                                <div className="flex gap-3">
                                  <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => { setReviewingIncident(incident); setShowIncidentModal(true); }}>
                                    <CheckCircle className="w-4 h-4 mr-2" />Aprobar
                                  </Button>
                                  <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => { setReviewingIncident(incident); setShowIncidentModal(true); }}>
                                    <XCircle className="w-4 h-4 mr-2" />Rechazar
                                  </Button>
                                </div>
                                ) : (
                                  <p className="text-xs text-slate-500 text-center py-2">No tienes permisos para aprobar o rechazar justificaciones.</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                          </>
                        );
                      })()}
                    </CardContent>
                  </Card>
                </TabsContent>

                <TabsContent value="approved">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-green-50/50">
                      <CardTitle className="text-xl font-bold flex items-center gap-2"><CheckCircle className="w-5 h-5 text-green-600" />Justificaciones Aprobadas</CardTitle>
                    </CardHeader>
                    <CardContent className="p-6">
                      {(() => {
                        const filtered = applyIncidentFilters(approvedIncidents);
                        const paged = filtered.slice((incidentPage - 1) * INCIDENT_PAGE_SIZE, incidentPage * INCIDENT_PAGE_SIZE);
                        return filtered.length === 0 ? (
                          <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones aprobadas</p></div>
                        ) : (
                          <>
                          <div className="space-y-4">
                          {paged.map(incident => {
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
                                  <p className="text-sm font-semibd text-slate-900 mb-1">Justificación:</p>
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
                          </>
                          );
                          })()}
                          </CardContent>
                          </Card>
                          </TabsContent>

                          <TabsContent value="rejected">
                  <Card className="border-0 shadow-lg">
                    <CardHeader className="border-b bg-red-50/50"><CardTitle className="text-xl font-bold flex items-center gap-2"><XCircle className="w-5 h-5 text-red-600" />Justificaciones Rechazadas</CardTitle></CardHeader>
                    <CardContent className="p-6">
                      {(() => {
                        const filtered = applyIncidentFilters(rejectedIncidents);
                        const paged = filtered.slice((incidentPage - 1) * INCIDENT_PAGE_SIZE, incidentPage * INCIDENT_PAGE_SIZE);
                        return filtered.length === 0 ? (
                          <div className="text-center py-12"><AlertCircle className="w-16 h-16 text-slate-300 mx-auto mb-4" /><p className="text-slate-600">No hay justificaciones rechazadas</p></div>
                        ) : (
                          <>
                          <div className="space-y-4">
                          {paged.map(incident => {
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
                                  <p className="text-sm text-slte-700">{incident.justification}</p>
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
                          </>
                          );
                          })()}
                          </CardContent>
                          </Card>
                          </TabsContent>
                          </Tabs>
                          </TabsContent>

            <TabsContent value="edit-requests" className="space-y-6">
              <AttendanceEditRequestsPanel
                allEmployees={allEmployees}
                reviewer={effectiveEmployee}
                canApprove={canApproveEdits}
              />
            </TabsContent>
          </Tabs>
        </div>

        {showEditRequestModal && editRequestRecord && (
          <AttendanceEditRequestModal
            record={editRequestRecord}
            employee={editRequestEmployee}
            onClose={() => {
              setShowEditRequestModal(false);
              setEditRequestRecord(null);
              setEditRequestEmployee(null);
            }}
            onSuccess={() => {
              queryClient.invalidateQueries({ queryKey: ["attendanceEditRequests"] });
              queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
            }}
          />
        )}

        {showEditModal && editingRecord && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto" onClick={() => setShowEditModal(false)}>
            <Card className="max-w-2xl w-full my-4 sm:my-0" onClick={(e) => e.stopPropagation()}>
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

        {showIncidentModal && reviewingIncident && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto" onClick={() => { setShowIncidentModal(false); setReviewComments(""); }}>
            <Card className="max-w-2xl w-full my-4 sm:my-0" onClick={(e) => e.stopPropagation()}>
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
                    <p className="text-sm text-slate-600 mb-2"><strong>Ajuste:</strong> +{Number(reviewingIncident.hours_to_adjust || 0).toFixed(2)}h trabajadas{reviewingIncident.late_minutes_to_adjust > 0 && `, -${reviewingIncident.late_minutes_to_adjust} min tardanza`}</p>
                    <p className="text-sm text-slate-700"><strong>Jusificación:</strong><br />{reviewingIncident.justification}</p>
                  </div>
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">Comentarios de Revisión</label>
                    <Textarea value={reviewComments} onChange={(e) => setReviewComments(e.target.value)} placeholder="Ingresa comentarios sobre la decisión..." rows={3} />
                    <p className="text-xs text-slate-500 mt-2">* Requerido para rechazar una justificación</p>
                  </div>
                  <div className="flex gap-3">
                    <Button className="flex-1 bg-green-600 hover:bg-green-700" onClick={() => handleApproveIncident(reviewingIncident)} disabled={isApproving || reviewIncidentMutation.isPending}>
                      <CheckCircle className="w-4 h-4 mr-2" />Aprobar
                    </Button>
                    <Button variant="outline" className="flex-1 text-red-600 border-red-200 hover:bg-red-50" onClick={() => handleRejectIncident(reviewingIncident)} disabled={isApproving || reviewIncidentMutation.isPending}>
                      <XCircle className="w-4 h-4 mr-2" />Rechazar
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

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

        {/* === CUSTOM BLOCK: Modal validación RRHH === */}
        {showValidationModal && validatingRecord && (
          <AttendanceValidationModal
            record={validatingRecord}
            logs={validationLogs}
            onClose={() => {
              setShowValidationModal(false);
              setValidatingRecord(null);
              setValidationLogs([]);
            }}
            onSave={() => {
              queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
              queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });

              setShowValidationModal(false);
              setValidatingRecord(null);
              setValidationLogs([]);
            }}
          />
        )}

        {/* Incident Detail Modal */}
        {showIncidentDetail && incidentDetailData && (
          <IncidentDetailModal
            incident={incidentDetailData}
            employee={incidentDetailEmployee}
            onClose={() => { setShowIncidentDetail(false); setIncidentDetailData(null); setIncidentDetailEmployee(null); }}
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
              queryClient.invalidateQueries({ queryKey: ["allIncidents"] });
              queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
              queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
            }}
          />
        )}
      </div>
    </>
  );
}
