import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import PaginationBar from "@/components/ui/PaginationBar";
import {
  Clock,
  TrendingUp,
  Search,
  Calendar as CalendarIcon,
  Plus,
  Pencil,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CalendarDays,
  Scale,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { computeScheduledHours, computeScheduledHoursForPeriod } from "@/lib/attendanceMetrics";
import { toast } from "sonner";
import CompensationModal from "./CompensationModal";

const PAGE_SIZE = 25;

const fmtHours = (h) => {
  const val = h ?? 0;
  return `${val.toFixed(1)}h`;
};

const fmtBalance = (minutes) => {
  if (minutes === 0) return "0 min";
  const sign = minutes > 0 ? "+" : "";
  return `${sign}${minutes} min`;
};

export default function CompensationPanel({
  allEmployees,
  effectiveEmployee,
  accessibleEmployeeIds,
  hasPermission,
}) {
  const queryClient = useQueryClient();
  const today = new Date();
  const firstDayOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const [dateFrom, setDateFrom] = useState(firstDayOfMonth);
  const [dateTo, setDateTo] = useState(today);
  const [useCustomRange, setUseCustomRange] = useState(false);
  const [monthOffset, setMonthOffset] = useState(0);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedSite, setSelectedSite] = useState("all");
  const [filterType, setFilterType] = useState("all");
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pendingCompsForEdit, setPendingCompsForEdit] = useState([]);

  const selectedMonthDate = useMemo(() => {
    return new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
  }, [today, monthOffset]);

  const selectedMonthEnd = useMemo(() => {
    return new Date(
      selectedMonthDate.getFullYear(),
      selectedMonthDate.getMonth() + 1,
      0
    );
  }, [selectedMonthDate]);

  const periodStart = useCustomRange
    ? dateToStringLima(dateFrom)
    : format(selectedMonthDate, "yyyy-MM-dd");
  const periodEnd = useCustomRange
    ? dateToStringLima(dateTo)
    : monthOffset === 0
      ? format(today, "yyyy-MM-dd")
      : format(selectedMonthEnd, "yyyy-MM-dd");

  const { data: periodRecords = [], isLoading } = useQuery({
    queryKey: ["compensationRecords", periodStart, periodEnd],
    queryFn: async () => {
      const all = await base44.entities.AttendanceRecord.list("-date", 2000);
      return all.filter((r) => r.date >= periodStart && r.date <= periodEnd);
    },
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const all = await base44.entities.Site.list("name");
      return all.filter((s) => s.is_active);
    },
  });

  const { data: existingCompensations = [] } = useQuery({
    queryKey: ["compensationIncidents", periodStart, periodEnd],
    queryFn: async () => {
      const all = await base44.entities.AttendanceIncident.list(
        "-incident_date",
        2000
      );
      return all.filter(
        (i) =>
          i.incident_type === "Compensación de Tardanza" &&
          i.incident_date >= periodStart &&
          i.incident_date <= periodEnd
      );
    },
  });

  const { data: workSchedules = [] } = useQuery({
    queryKey: ["workSchedulesForComp"],
    queryFn: async () => {
      return await base44.entities.WorkSchedule.list("schedule_name");
    },
  });

  const scheduleByEmployee = useMemo(() => {
    const map = new Map();
    for (const ws of workSchedules) {
      if (ws.employee_id && ws.is_active !== false) {
        map.set(ws.employee_id, ws);
      }
    }
    for (const emp of allEmployees) {
      if (map.has(emp.id)) continue;
      for (const ws of workSchedules) {
        if (ws.is_active === false) continue;
        if (!ws.employee_id) {
          const matchesDept =
            ws.department_name === emp.department_name ||
            (ws.departments && ws.departments.includes(emp.department_name));
          if (matchesDept) {
            map.set(emp.id, ws);
            break;
          }
        }
      }
    }
    return map;
  }, [workSchedules, allEmployees]);

  // Mostrar TODOS los empleados accesibles con sus métricas
  const employeeStats = useMemo(() => {
    const map = new Map();

    for (const emp of allEmployees) {
      if (!accessibleEmployeeIds.has(emp.id)) continue;
      const schedule = scheduleByEmployee.get(emp.id);
      map.set(emp.id, {
        employee: emp,
        employee_id: emp.id,
        schedule,
        totalScheduledHours: 0,
        totalRegularHours: 0,
        totalOvertimeHours: 0,
        totalLateMinutes: 0,
        lateDays: 0,
        overtimeDays: 0,
        totalDays: 0,
        records: [],
      });
    }

    for (const rec of periodRecords) {
      if (!accessibleEmployeeIds.has(rec.employee_id)) continue;
      if (!map.has(rec.employee_id)) continue;

      const stat = map.get(rec.employee_id);
      stat.records.push(rec);
      stat.totalDays++;
      stat.totalScheduledHours += computeScheduledHours(rec);
      stat.totalRegularHours += rec.regular_hours ?? 0;
      stat.totalOvertimeHours +=
        (rec.overtime_hours_25 ?? 0) + (rec.overtime_hours_35 ?? 0);

      const overtimeMin = Math.round(
        ((rec.overtime_hours_25 ?? 0) + (rec.overtime_hours_35 ?? 0)) * 60
      );
      if ((rec.late_minutes ?? 0) > 0) {
        stat.totalLateMinutes += rec.late_minutes;
        stat.lateDays++;
      }
      if (overtimeMin > 0) {
        stat.overtimeDays++;
      }
    }

    for (const stat of map.values()) {
      if (stat.totalDays === 0 && stat.schedule) {
        stat.totalScheduledHours = computeScheduledHoursForPeriod(
          stat.schedule,
          periodStart,
          periodEnd
        );
      }
    }

    return Array.from(map.values());
  }, [periodRecords, allEmployees, accessibleEmployeeIds, scheduleByEmployee, periodStart, periodEnd]);

  const filteredStats = useMemo(() => {
    return employeeStats.filter((stat) => {
      if (!stat.employee) return false;

      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const fullName =
          `${stat.employee.first_name} ${stat.employee.last_name}`.toLowerCase();
        const reverseName =
          `${stat.employee.last_name} ${stat.employee.first_name}`.toLowerCase();
        if (
          !fullName.includes(term) &&
          !reverseName.includes(term) &&
          !stat.employee.document_number.toLowerCase().includes(term)
        ) {
          return false;
        }
      }

      if (
        selectedSite !== "all" &&
        stat.employee.site !== selectedSite &&
        !(selectedSite === "sin_sede" && !stat.employee.site)
      ) {
        return false;
      }

      if (filterType === "late" && stat.totalLateMinutes === 0) return false;
      if (filterType === "overtime" && stat.totalOvertimeHours === 0)
        return false;

      return true;
    });
  }, [employeeStats, searchTerm, selectedSite, filterType]);

  const employeesWithCompensation = useMemo(() => {
    return new Set(existingCompensations.map((c) => c.employee_id));
  }, [existingCompensations]);

  const editableCompsByEmployee = useMemo(() => {
    const map = new Map();
    for (const c of existingCompensations) {
      if (c.status === "Pendiente" || c.status === "Rechazada") {
        if (!map.has(c.employee_id)) map.set(c.employee_id, []);
        map.get(c.employee_id).push(c);
      }
    }
    return map;
  }, [existingCompensations]);

  const handleOpenModal = (stat) => {
    setSelectedEmployee(stat.employee);
    setEditMode(false);
    setPendingCompsForEdit([]);
    setShowModal(true);
  };

  const handleOpenEditModal = (stat) => {
    const editable = editableCompsByEmployee.get(stat.employee_id) || [];
    setSelectedEmployee(stat.employee);
    setEditMode(true);
    setPendingCompsForEdit(editable);
    setShowModal(true);
  };

  const handleSubmitCompensation = async (selectedList, reason, authorizer) => {
    setSubmitting(true);
    try {
      const incidentsToCreate = selectedList.map((item) => ({
        employee_id: selectedEmployee.id,
        attendance_record_id: item.recordId,
        incident_date: item.date,
        incident_type: "Compensación de Tardanza",
        justification: reason,
        late_minutes_to_adjust: item.lateMinutes || 0,
        hours_to_adjust: (item.overtimeMinutes || 0) / 60,
        full_day_justification: false,
        justified_time_start: item.record?.clock_in || null,
        justified_time_end: item.record?.clock_out || null,
        authorizer_id: authorizer.id,
        authorizer_name: `${authorizer.first_name} ${authorizer.last_name}`,
        status: "Pendiente",
      }));

      if (incidentsToCreate.length > 0) {
        await base44.entities.AttendanceIncident.bulkCreate(incidentsToCreate);
      }

      for (const item of selectedList) {
        if (item.recordId) {
          await base44.entities.AttendanceRecord.update(item.recordId, {
            status: "Compensación",
            notes:
              (item.record?.notes ? item.record.notes + " | " : "") +
              `Compensación solicitada: ${item.lateMinutes || 0} min tardanza, ${
                item.overtimeMinutes || 0
              } min HE`,
          });
        }
      }

      queryClient.invalidateQueries(["compensationIncidents"]);
      queryClient.invalidateQueries(["compensationRecords"]);
      queryClient.invalidateQueries(["allIncidents"]);
      queryClient.invalidateQueries(["todayAttendance"]);

      toast.success(
        `✓ Compensación registrada para ${selectedList.length} día(s)`
      );
      setShowModal(false);
      setSelectedEmployee(null);
    } catch (error) {
      toast.error("Error al registrar compensación: " + (error.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditCompensation = async (selectedList, reason, authorizer) => {
    setSubmitting(true);
    try {
      const toDelete = editableCompsByEmployee.get(selectedEmployee.id) || [];
      for (const comp of toDelete) {
        await base44.entities.AttendanceIncident.delete(comp.id);
      }

      const incidentsToCreate = selectedList.map((item) => ({
        employee_id: selectedEmployee.id,
        attendance_record_id: item.recordId,
        incident_date: item.date,
        incident_type: "Compensación de Tardanza",
        justification: reason,
        late_minutes_to_adjust: item.lateMinutes || 0,
        hours_to_adjust: (item.overtimeMinutes || 0) / 60,
        full_day_justification: false,
        justified_time_start: item.record?.clock_in || null,
        justified_time_end: item.record?.clock_out || null,
        authorizer_id: authorizer.id,
        authorizer_name: `${authorizer.first_name} ${authorizer.last_name}`,
        status: "Pendiente",
      }));

      if (incidentsToCreate.length > 0) {
        await base44.entities.AttendanceIncident.bulkCreate(incidentsToCreate);
      }

      for (const item of selectedList) {
        if (item.recordId && item.record?.status !== "Compensación") {
          await base44.entities.AttendanceRecord.update(item.recordId, {
            status: "Compensación",
          });
        }
      }

      queryClient.invalidateQueries(["compensationIncidents"]);
      queryClient.invalidateQueries(["compensationRecords"]);
      queryClient.invalidateQueries(["allIncidents"]);
      queryClient.invalidateQueries(["todayAttendance"]);

      toast.success(
        `✓ Compensación actualizada (${selectedList.length} día(s))`
      );
      setShowModal(false);
      setSelectedEmployee(null);
      setEditMode(false);
      setPendingCompsForEdit([]);
    } catch (error) {
      toast.error("Error al actualizar compensación: " + (error.message || ""));
    } finally {
      setSubmitting(false);
    }
  };

  const canManage =
    hasPermission("attendance.manage") ||
    hasPermission("attendance.approve_compensations") ||
    hasPermission("system.admin");

  // Totales generales del período
  const periodTotals = useMemo(() => {
    return filteredStats.reduce(
      (acc, s) => ({
        scheduled: acc.scheduled + s.totalScheduledHours,
        regular: acc.regular + s.totalRegularHours,
        overtime: acc.overtime + s.totalOvertimeHours,
        late: acc.late + s.totalLateMinutes,
      }),
      { scheduled: 0, regular: 0, overtime: 0, late: 0 }
    );
  }, [filteredStats]);

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-indigo-50/50">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          Compensación de Tardanzas y Horas en Exceso
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Horas programadas vs. trabajadas por empleado en el período
        </p>
      </CardHeader>
      <CardContent className="p-6">
        {/* Resumen general del período */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
          <div className="bg-slate-50 border border-slate-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CalendarDays className="w-4 h-4 text-slate-600" />
              <span className="text-xs font-semibold text-slate-700">
                Horas Programadas
              </span>
            </div>
            <p className="text-xl font-bold text-slate-900">
              {fmtHours(periodTotals.scheduled)}
            </p>
          </div>
          <div className="bg-green-50 border border-green-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <CheckCircle2 className="w-4 h-4 text-green-600" />
              <span className="text-xs font-semibold text-green-700">
                Trab. dentro horario
              </span>
            </div>
            <p className="text-xl font-bold text-green-900">
              {fmtHours(periodTotals.regular)}
            </p>
          </div>
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <TrendingUp className="w-4 h-4 text-blue-600" />
              <span className="text-xs font-semibold text-blue-700">
                Trab. fuera horario
              </span>
            </div>
            <p className="text-xl font-bold text-blue-900">
              {fmtHours(periodTotals.overtime)}
            </p>
          </div>
          <div className="bg-orange-50 border border-orange-200 rounded-lg p-3">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-orange-600" />
              <span className="text-xs font-semibold text-orange-700">
                Tardanzas totales
              </span>
            </div>
            <p className="text-xl font-bold text-orange-900">
              {periodTotals.late} min
            </p>
          </div>
        </div>

        {/* Filtros */}
        <div className="flex flex-wrap items-center gap-3 mb-6">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Buscar empleado..."
              value={searchTerm}
              onChange={(e) => {
                setSearchTerm(e.target.value);
                setCurrentPage(1);
              }}
              className="pl-9"
            />
          </div>

          <Select
            value={selectedSite}
            onValueChange={(v) => {
              setSelectedSite(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Sede" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="sin_sede">Sin sede</SelectItem>
              {sites.map((site) => (
                <SelectItem key={site.id} value={site.name}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <Select
            value={filterType}
            onValueChange={(v) => {
              setFilterType(v);
              setCurrentPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="Tipo" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="late">Con tardanza</SelectItem>
              <SelectItem value="overtime">Con horas extras</SelectItem>
            </SelectContent>
          </Select>

          {!useCustomRange ? (
            <div className="flex items-center gap-1">
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setMonthOffset((m) => m - 1);
                  setCurrentPage(1);
                }}
              >
                <ChevronLeft className="w-4 h-4" />
              </Button>
              <Badge
                variant="outline"
                className="bg-indigo-50 text-indigo-700 border-indigo-200 px-3 py-1.5 capitalize min-w-[120px] justify-center"
              >
                <CalendarIcon className="w-3.5 h-3.5 mr-1" />
                {format(selectedMonthDate, "MMMM yyyy", { locale: es })}
                {monthOffset === 0 && (
                  <span className="ml-1 text-[10px] font-normal">(actual)</span>
                )}
              </Badge>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => {
                  setMonthOffset((m) => m + 1);
                  setCurrentPage(1);
                }}
              >
                <ChevronRight className="w-4 h-4" />
              </Button>
              {monthOffset !== 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => {
                    setMonthOffset(0);
                    setCurrentPage(1);
                  }}
                >
                  Hoy
                </Button>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-blue-50 border-blue-200 hover:bg-blue-100 whitespace-nowrap"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-blue-700" />
                    <span className="text-blue-700">
                      {dateFrom
                        ? format(parseDateLima(dateToStringLima(dateFrom)), "dd MMM yyyy", {
                            locale: es,
                          })
                        : "Desde"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateFrom}
                    onSelect={(d) => d && setDateFrom(d)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
              <span className="text-slate-400 text-sm">—</span>
              <Popover>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    className="bg-blue-50 border-blue-200 hover:bg-blue-100 whitespace-nowrap"
                  >
                    <CalendarIcon className="mr-2 h-4 w-4 text-blue-700" />
                    <span className="text-blue-700">
                      {dateTo
                        ? format(parseDateLima(dateToStringLima(dateTo)), "dd MMM yyyy", {
                            locale: es,
                          })
                        : "Hasta"}
                    </span>
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0">
                  <Calendar
                    mode="single"
                    selected={dateTo}
                    onSelect={(d) => d && setDateTo(d)}
                    locale={es}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              setUseCustomRange(!useCustomRange);
              setMonthOffset(0);
              setCurrentPage(1);
            }}
            className={
              useCustomRange
                ? "bg-blue-600 text-white border-blue-600 hover:bg-blue-700"
                : ""
            }
          >
            {useCustomRange ? "Rango activo" : "Por rango"}
          </Button>

          <div className="ml-auto">
            <PaginationBar
              inline
              currentPage={currentPage}
              totalItems={filteredStats.length}
              pageSize={PAGE_SIZE}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>

        {/* DataGrid */}
        {isLoading ? (
          <div className="text-center py-12">
            <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-slate-500 text-sm mt-3">Cargando registros...</p>
          </div>
        ) : filteredStats.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <p className="text-slate-600">
              No hay registros de asistencia en el período seleccionado
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border-collapse">
              <thead>
                <tr className="bg-slate-100">
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-3 py-2 rounded-l-lg">
                    Empleado
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">
                    Sede
                  </th>
                  <th className="text-left text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">
                    Horario
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-600 uppercase tracking-wide px-2 py-2">
                    Hrs. Prog.
                  </th>
                  <th className="text-center text-xs font-semibold text-green-600 uppercase tracking-wide px-2 py-2">
                    Hrs. Trab.
                    <span className="block text-[9px] font-normal text-slate-400">
                      dentro
                    </span>
                  </th>
                  <th className="text-center text-xs font-semibold text-blue-600 uppercase tracking-wide px-2 py-2">
                    Hrs. Exceso
                    <span className="block text-[9px] font-normal text-slate-400">
                      fuera
                    </span>
                  </th>
                  <th className="text-center text-xs font-semibold text-orange-600 uppercase tracking-wide px-2 py-2">
                    Tardanzas
                    <span className="block text-[9px] font-normal text-slate-400">
                      min
                    </span>
                  </th>
                  <th className="text-center text-xs font-semibold text-indigo-600 uppercase tracking-wide px-2 py-2">
                    Balance
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2">
                    Estado
                  </th>
                  <th className="text-center text-xs font-semibold text-slate-500 uppercase tracking-wide px-2 py-2 rounded-r-lg">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredStats
                  .slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE)
                  .map((stat) => {
                    const hasComp = employeesWithCompensation.has(
                      stat.employee_id
                    );
                    const hasEditableComp = editableCompsByEmployee.has(
                      stat.employee_id
                    );
                    const overtimeMin = Math.round(stat.totalOvertimeHours * 60);
                    const balanceMin = overtimeMin - stat.totalLateMinutes;
                    const hasIncidents =
                      stat.totalLateMinutes > 0 || stat.totalOvertimeHours > 0;
                    return (
                      <tr
                        key={stat.employee_id}
                        className={`border-b last:border-b-0 hover:bg-slate-50 transition-colors ${
                          hasComp ? "bg-purple-50/40" : "bg-white"
                        }`}
                      >
                        <td className="px-3 py-2 border-l-2 border-transparent">
                          <div className="flex items-center gap-2">
                            <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br from-indigo-500 to-purple-600">
                              {stat.employee.first_name[0]}
                              {stat.employee.last_name[0]}
                            </div>
                            <div className="min-w-0">
                              <p className="font-semibold text-slate-900 text-xs truncate">
                                {stat.employee.document_type}{" "}
                                {stat.employee.document_number} -{" "}
                                {stat.employee.first_name}{" "}
                                {stat.employee.last_name}
                              </p>
                              <p className="text-xs text-slate-400 truncate">
                                {stat.employee.department_name || "Sin área"} ·{" "}
                                {stat.employee.position || ""}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-xs text-slate-600">
                            {stat.employee.site || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2">
                          <span className="text-xs text-slate-600 truncate block max-w-[120px]">
                            {stat.schedule?.schedule_name || "—"}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-semibold text-slate-700">
                            {fmtHours(stat.totalScheduledHours)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-semibold text-green-700">
                            {fmtHours(stat.totalRegularHours)}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className={`text-sm font-bold ${
                              stat.totalOvertimeHours > 0
                                ? "text-blue-600"
                                : "text-slate-300"
                            }`}
                          >
                            {fmtHours(stat.totalOvertimeHours)}
                          </span>
                          {stat.overtimeDays > 0 && (
                            <span className="block text-[9px] text-blue-400">
                              {stat.overtimeDays} día(s)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span
                            className={`text-sm font-bold ${
                              stat.totalLateMinutes > 0
                                ? "text-orange-600"
                                : "text-slate-300"
                            }`}
                          >
                            {stat.totalLateMinutes} min
                          </span>
                          {stat.lateDays > 0 && (
                            <span className="block text-[9px] text-orange-400">
                              {stat.lateDays} día(s)
                            </span>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          <div className="flex items-center justify-center gap-1">
                            <Scale className="w-3 h-3 text-slate-400" />
                            <span
                              className={`text-xs font-bold ${
                                balanceMin > 0
                                  ? "text-blue-600"
                                  : balanceMin < 0
                                    ? "text-orange-600"
                                    : "text-slate-400"
                              }`}
                            >
                              {fmtBalance(balanceMin)}
                            </span>
                          </div>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {hasComp ? (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs">
                              Comp. solicitada
                            </Badge>
                          ) : hasIncidents ? (
                            <Badge className="bg-amber-100 text-amber-700 border-amber-300 text-xs">
                              Por compensar
                            </Badge>
                          ) : (
                            <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                              Sin novedad
                            </Badge>
                          )}
                        </td>
                        <td className="px-2 py-2 text-center">
                          {canManage && (
                            <div className="flex gap-1 justify-center">
                              {hasEditableComp && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs shrink-0 whitespace-nowrap text-blue-700 border-blue-300 hover:bg-blue-50"
                                  onClick={() => handleOpenEditModal(stat)}
                                >
                                  <Pencil className="w-3 h-3 mr-1" />
                                  Editar
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                className="h-7 px-2 text-xs shrink-0 whitespace-nowrap text-indigo-700 border-indigo-300 hover:bg-indigo-50"
                                onClick={() => handleOpenModal(stat)}
                              >
                                <Plus className="w-3 h-3 mr-1" />
                                {hasEditableComp ? "Agregar" : "Solicitar"}
                              </Button>
                            </div>
                          )}
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>

      {showModal && selectedEmployee && (
        <CompensationModal
          employee={selectedEmployee}
          employeeSchedule={scheduleByEmployee.get(selectedEmployee.id)}
          periodStart={periodStart}
          periodEnd={periodEnd}
          periodRecords={periodRecords}
          existingCompensations={existingCompensations}
          allEmployees={allEmployees}
          editMode={editMode}
          pendingCompensations={pendingCompsForEdit}
          onClose={() => {
            setShowModal(false);
            setSelectedEmployee(null);
            setEditMode(false);
            setPendingCompsForEdit([]);
          }}
          onSubmit={editMode ? handleEditCompensation : handleSubmitCompensation}
        />
      )}
    </Card>
  );
}