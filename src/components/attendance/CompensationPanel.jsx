import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
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
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import CompensationModal from "./CompensationModal";

const PAGE_SIZE = 25;

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
  const [filterType, setFilterType] = useState("all"); // all, late, overtime
  const [currentPage, setCurrentPage] = useState(1);
  const [showModal, setShowModal] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [pendingCompsForEdit, setPendingCompsForEdit] = useState([]);

  // Calcular mes seleccionado según el offset
  const selectedMonthDate = useMemo(() => {
    const d = new Date(today.getFullYear(), today.getMonth() + monthOffset, 1);
    return d;
  }, [today, monthOffset]);

  const selectedMonthEnd = useMemo(() => {
    // Último día del mes seleccionado
    return new Date(
      selectedMonthDate.getFullYear(),
      selectedMonthDate.getMonth() + 1,
      0
    );
  }, [selectedMonthDate]);

  // Cargar registros del período
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

  // Cargar compensaciones existentes (incidentes de tipo "Compensación de Tardanza")
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

  // Agrupar por empleado y calcular totales
  const employeeStats = useMemo(() => {
    const map = new Map();

    for (const rec of periodRecords) {
      if (!accessibleEmployeeIds.has(rec.employee_id)) continue;

      const overtimeMin = Math.round(
        ((rec.overtime_hours_25 ?? 0) + (rec.overtime_hours_35 ?? 0)) * 60
      );
      const hasLate = (rec.late_minutes ?? 0) > 0;
      const hasOvertime = overtimeMin > 0;
      if (!hasLate && !hasOvertime) continue;

      if (!map.has(rec.employee_id)) {
        const emp = allEmployees.find((e) => e.id === rec.employee_id);
        map.set(rec.employee_id, {
          employee: emp,
          employee_id: rec.employee_id,
          totalLateMinutes: 0,
          totalOvertimeMinutes: 0,
          lateDays: 0,
          overtimeDays: 0,
          records: [],
        });
      }

      const stat = map.get(rec.employee_id);
      stat.records.push(rec);
      if (hasLate) {
        stat.totalLateMinutes += rec.late_minutes;
        stat.lateDays++;
      }
      if (hasOvertime) {
        stat.totalOvertimeMinutes += overtimeMin;
        stat.overtimeDays++;
      }
    }

    return Array.from(map.values());
  }, [periodRecords, allEmployees, accessibleEmployeeIds]);

  // Filtrar
  const filteredStats = useMemo(() => {
    return employeeStats.filter((stat) => {
      if (!stat.employee) return false;

      // Search
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

      // Site
      if (
        selectedSite !== "all" &&
        stat.employee.site !== selectedSite &&
        !(selectedSite === "sin_sede" && !stat.employee.site)
      ) {
        return false;
      }

      // Type filter
      if (filterType === "late" && stat.totalLateMinutes === 0) return false;
      if (filterType === "overtime" && stat.totalOvertimeMinutes === 0)
        return false;

      return true;
    });
  }, [employeeStats, searchTerm, selectedSite, filterType]);

  // Marcar empleados que ya tienen compensación registrada
  const employeesWithCompensation = useMemo(() => {
    return new Set(existingCompensations.map((c) => c.employee_id));
  }, [existingCompensations]);

  // Compensaciones editables (Pendiente o Rechazada) por empleado
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
      // Crear un AttendanceIncident por cada día seleccionado
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

      // Actualizar los registros de asistencia con estado "Compensación"
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
      // Eliminar compensaciones editables existentes para este empleado
      const toDelete = editableCompsByEmployee.get(selectedEmployee.id) || [];
      for (const comp of toDelete) {
        await base44.entities.AttendanceIncident.delete(comp.id);
      }

      // Crear las compensaciones actualizadas
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

      // Asegurar que los registros seleccionados tengan estado "Compensación"
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

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-indigo-50/50">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-indigo-600" />
          Compensación de Tardanzas y Horas en Exceso
        </CardTitle>
        <p className="text-sm text-slate-600 mt-1">
          Empleados con tardanzas u horas extras en el período seleccionado
        </p>
      </CardHeader>
      <CardContent className="p-6">
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

          {/* Selector de período */}
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
              No hay empleados con tardanzas u horas extras en el período
              seleccionado
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
                  <th className="text-center text-xs font-semibold text-orange-600 uppercase tracking-wide px-2 py-2">
                    Días tardanza
                  </th>
                  <th className="text-center text-xs font-semibold text-orange-600 uppercase tracking-wide px-2 py-2">
                    Min. tardanza
                  </th>
                  <th className="text-center text-xs font-semibold text-blue-600 uppercase tracking-wide px-2 py-2">
                    Días HE
                  </th>
                  <th className="text-center text-xs font-semibold text-blue-600 uppercase tracking-wide px-2 py-2">
                    Min. extras
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
                  .map((stat, idx) => {
                    const hasComp = employeesWithCompensation.has(
                      stat.employee_id
                    );
                    const hasEditableComp = editableCompsByEmployee.has(
                      stat.employee_id
                    );
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
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-bold text-orange-600">
                            {stat.lateDays}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-bold text-orange-900">
                            {stat.totalLateMinutes} min
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-bold text-blue-600">
                            {stat.overtimeDays}
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          <span className="text-sm font-bold text-blue-900">
                            {stat.totalOvertimeMinutes} min
                          </span>
                        </td>
                        <td className="px-2 py-2 text-center">
                          {hasComp ? (
                            <Badge className="bg-purple-100 text-purple-700 border-purple-300 text-xs">
                              Comp. solicitada
                            </Badge>
                          ) : (
                            <Badge className="bg-slate-100 text-slate-500 border-slate-200 text-xs">
                              Pendiente
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

      {/* Modal de compensación */}
      {showModal && selectedEmployee && (
        <CompensationModal
          employee={selectedEmployee}
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