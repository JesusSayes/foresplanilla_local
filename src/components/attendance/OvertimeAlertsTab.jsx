import React, { useState, useMemo } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import recalcularAsistenciaService from "@/services/recalcularAsistenciaService";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Checkbox } from "@/components/ui/checkbox";
import { Clock, Edit, CheckCircle, XCircle, Search, Layers, RefreshCw, Palmtree } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima, todayLima } from "@/lib/dateUtils";
import { getSegmentClockTimes } from "@/lib/attendanceMetrics";
import { toast } from "sonner";
import PaginationBar from "@/components/ui/PaginationBar";
import BulkOvertimeModal from "./BulkOvertimeModal";

const PAGE_SIZE = 20;

// Convierte horas decimales (ej: 2.83) a formato "Xh Ym" (ej: "2h 50m")
const formatHorasMinutos = (horasDec) => {
  const totalMin = Math.round(Math.abs(horasDec) * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${m}m`;
};

/**
 * Pestaña de Alertas de Horas Extras con sub-tabs (Pendientes / Procesadas),
 * filtro por rango de fechas, filtro por área, selección masiva y filas compactas.
 * La lista se ordena por fecha descendente (más recientes primero).
 */
export default function OvertimeAlertsTab({
  overtimeAlerts,
  allEmployees,
  todayRecords,
  getEmployeeScheduleForDate,
  accessibleEmployeeIds,
  currentUser,
  onEditRecord,
  canEditAttendance = false,
  canReviewApproved = false,
  approvedVacations = [],
}) {
  // Verifica si una fecha está cubierta por vacaciones aprobadas del empleado
  const isDateOnVacation = (employeeId, dateStr) => {
    return approvedVacations.some(v =>
      v.employee_id === employeeId &&
      String(v.start_date).slice(0, 10) <= String(dateStr).slice(0, 10) &&
      String(v.end_date).slice(0, 10) >= String(dateStr).slice(0, 10)
    );
  };
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("pendientes");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [page, setPage] = useState(1);
  const [selectedAlertIds, setSelectedAlertIds] = useState(new Set());
  const [showBulkModal, setShowBulkModal] = useState(false);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [reviewingApproved, setReviewingApproved] = useState(false);

  const pendingAlerts = useMemo(
    () => overtimeAlerts.filter((a) => a.status === "Pendiente"),
    [overtimeAlerts]
  );
  const processedAlerts = useMemo(
    () => overtimeAlerts.filter((a) => a.status === "Autorizado" || a.status === "Descartado"),
    [overtimeAlerts]
  );

  // Áreas únicas para el filtro
  const areas = useMemo(() => {
    const set = new Set();
    allEmployees.forEach((e) => {
      if (e.department_name) set.add(e.department_name);
    });
    return [...set].sort();
  }, [allEmployees]);

  const applyFilters = (list) =>
    list
      .filter((a) => {
        if (!accessibleEmployeeIds.has(a.employee_id)) return false;
        const emp = allEmployees.find((e) => e.id === a.employee_id);
        if (searchTerm) {
          const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
          if (!name.includes(searchTerm.toLowerCase())) return false;
        }
        if (areaFilter && emp?.department_name !== areaFilter) return false;
        if (dateFrom && a.alert_date < dateFrom) return false;
        if (dateTo && a.alert_date > dateTo) return false;
        return true;
      })
      .sort((a, b) => b.alert_date.localeCompare(a.alert_date)); // más recientes primero

  const activeList = subTab === "pendientes" ? pendingAlerts : processedAlerts;
  const filteredAlerts = useMemo(() => applyFilters(activeList), [
    activeList,
    accessibleEmployeeIds,
    searchTerm,
    dateFrom,
    dateTo,
    areaFilter,
    allEmployees,
  ]);
  const pagedAlerts = filteredAlerts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const resetPage = () => setPage(1);

  // --- Selección masiva ---
  const filteredPendingIds = subTab === "pendientes" ? filteredAlerts.map((a) => a.id) : [];
  const allSelected =
    filteredPendingIds.length > 0 &&
    filteredPendingIds.every((id) => selectedAlertIds.has(id));
  const someSelected = filteredPendingIds.some((id) => selectedAlertIds.has(id));
  const selectedCount = filteredPendingIds.filter((id) => selectedAlertIds.has(id)).length;

  const toggleSelectAll = () => {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev);
      if (allSelected) {
        filteredPendingIds.forEach((id) => next.delete(id));
      } else {
        filteredPendingIds.forEach((id) => next.add(id));
      }
      return next;
    });
  };

  const toggleOne = (id) => {
    setSelectedAlertIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearSelection = () => setSelectedAlertIds(new Set());

  const handleAcceptHE = async (alert, record, silent = false) => {
    if (!canEditAttendance) return;
    // Bloquear autorización si la fecha está cubierta por vacaciones aprobadas
    if (isDateOnVacation(alert.employee_id, alert.alert_date)) {
      const emp = allEmployees.find(e => e.id === alert.employee_id);
      const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Empleado";
      const msg = `No se pueden autorizar horas extras para ${empName} el ${alert.alert_date}: la fecha está cubierta por vacaciones aprobadas.`;
      if (silent) throw new Error(msg);
      toast.error(msg);
      return;
    }
    try {
      record = record || await entitiesAPI.AttendanceRecord.get(alert.attendance_record_id);
      if (record) {
        await entitiesAPI.AttendanceRecord.update(record.id, {
          overtime_authorized: true,
          notes: (record.notes ? record.notes + " | " : "") +
            `HE aceptadas: ${Number(alert.overtime_hours || 0).toFixed(2)}h (${alert.alert_date})`,
        });
      }
      await entitiesAPI.OvertimeAlert.update(alert.id, {
        status: "Autorizado",
        resolved_by: currentUser?.email || "",
        resolution_date: todayLima(),
        resolution_notes: `HE aceptadas solo para el día ${alert.alert_date}`,
      });
      await recalcularAsistenciaService.recalculate(
        alert.employee_id,
        alert.alert_date,
        alert.alert_date,
      );
      if (!silent) {
        queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
        queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
        queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
        queryClient.invalidateQueries({ queryKey: ["compensationRecords"] });
        queryClient.invalidateQueries({ queryKey: ["compensationPrevMonthRecords"] });
        queryClient.invalidateQueries({ queryKey: ["allAttendanceRecords"] });
        toast.success(
          `HE aceptadas y recalculadas para el ${format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}`
        );
      }
    } catch (error) {
      queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
      queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
      queryClient.invalidateQueries({ queryKey: ["allAttendanceRecords"] });
      if (silent) throw error;
      toast.error("No se pudo completar la autorización de horas extras");
    }
  };

  const handleDismiss = async (alert) => {
    if (!canEditAttendance) return;
    try {
      await entitiesAPI.OvertimeAlert.update(alert.id, { status: "Descartado" });
      queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
      toast.success("Alerta descartada");
    } catch (error) {
      toast.error("No se pudo descartar la alerta");
    }
  };

  // --- Ejecución masiva ---
  const bulkAceptarHE = async () => {
    if (!canEditAttendance || bulkProcessing) return;
    const selected = filteredAlerts.filter((a) => a.status === "Pendiente" && selectedAlertIds.has(a.id));
    if (selected.length === 0) return;
    setShowBulkModal(false);
    setBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    let blocked = 0;
    for (const alert of selected) {
      // Validar vacaciones antes de procesar
      if (isDateOnVacation(alert.employee_id, alert.alert_date)) {
        blocked++;
        continue;
      }
      try {
        const record = todayRecords.find((r) => r.id === alert.attendance_record_id);
        await handleAcceptHE(alert, record, true);
        ok++;
      } catch (e) {
        console.error("Error aceptando HE masivo:", e);
        fail++;
      }
    }
    setBulkProcessing(false);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
    queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
    queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
    queryClient.invalidateQueries({ queryKey: ["compensationRecords"] });
    queryClient.invalidateQueries({ queryKey: ["compensationPrevMonthRecords"] });
    queryClient.invalidateQueries({ queryKey: ["allAttendanceRecords"] });
    if (blocked > 0 && fail > 0)
      toast.warning(`${ok} aprobadas, ${blocked} bloqueadas por vacaciones, ${fail} con error`);
    else if (blocked > 0)
      toast.warning(`${ok} aprobadas, ${blocked} bloqueada(s) por vacaciones aprobadas`);
    else if (fail > 0)
      toast.warning(`${ok} aprobadas, ${fail} con error`);
    else
      toast.success(`${ok} alerta(s) aprobada(s) correctamente`);
  };

  const bulkDescartar = async () => {
    if (!canEditAttendance || bulkProcessing) return;
    const selected = filteredAlerts.filter((a) => a.status === "Pendiente" && selectedAlertIds.has(a.id));
    if (selected.length === 0) return;
    setShowBulkModal(false);
    setBulkProcessing(true);
    let ok = 0;
    let fail = 0;
    for (const alert of selected) {
      try {
        await entitiesAPI.OvertimeAlert.update(alert.id, { status: "Descartado" });
        ok++;
      } catch (e) {
        console.error("Error descartando masivo:", e);
        fail++;
      }
    }
    setBulkProcessing(false);
    clearSelection();
    queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
    if (fail > 0) toast.warning(`${ok} descartadas, ${fail} con error`);
    else toast.success(`${ok} alerta(s) descartada(s)`);
  };

  const bulkCorregir = async () => {
    if (!canEditAttendance || bulkProcessing) return;
    const selected = filteredAlerts.filter((a) => a.status === "Pendiente" && selectedAlertIds.has(a.id));
    if (selected.length === 0) return;
    setShowBulkModal(false);
    const first = selected[0];
    const record = todayRecords.find((r) => r.id === first.attendance_record_id);
    const emp = allEmployees.find((e) => e.id === first.employee_id);
    try {
      const alertRecord = record || await entitiesAPI.AttendanceRecord.get(first.attendance_record_id);
      onEditRecord(alertRecord, emp);
      toast.info(`Abriendo edición del primer registro. ${selected.length - 1} pendiente(s) restante(s).`);
    } catch (error) {
      toast.error("No se encontró el registro de asistencia para corregir");
    }
  };

  // Revisa todas las autorizaciones ya aprobadas: asegura que cada registro
  // tenga overtime_authorized=true y recalcula las métricas de asistencia
  // para que las HE se reflejen en el listado. No recarga la página.
  const handleRevisarAutorizadas = async () => {
    if (!canReviewApproved || reviewingApproved || bulkProcessing) return;
    setReviewingApproved(true);
    try {
      const allAuthorized = await entitiesAPI.OvertimeAlert.filter({ status: "Autorizado" });
      const accessible = allAuthorized.filter((a) => accessibleEmployeeIds.has(a.employee_id));

      if (accessible.length === 0) {
        toast.info("No hay autorizaciones aprobadas para revisar");
        return;
      }

      // Group by attendance_record_id to avoid duplicate work (pre + post
      // shift alerts share the same record).
      const byRecord = new Map();
      for (const alert of accessible) {
        if (alert.attendance_record_id && !byRecord.has(alert.attendance_record_id)) {
          byRecord.set(alert.attendance_record_id, alert);
        }
      }

      const recalcKeys = new Set();
      let recalcCount = 0;
      let failCount = 0;

      for (const alert of byRecord.values()) {
        // Skip records on vacation — cannot authorize HE for vacation dates
        if (isDateOnVacation(alert.employee_id, alert.alert_date)) {
          continue;
        }
        // Ensure overtime_authorized is true (idempotent — no notes appended
        // to avoid duplication on repeated reviews).
        try {
          await entitiesAPI.AttendanceRecord.update(alert.attendance_record_id, {
            overtime_authorized: true,
          });
        } catch (e) {
          console.error("Error actualizando overtime_authorized:", e);
          failCount++;
          continue;
        }

        // Recalculate the date (deduped per employee+date).
        const key = `${alert.employee_id}|${alert.alert_date}`;
        if (!recalcKeys.has(key)) {
          recalcKeys.add(key);
          try {
            await recalcularAsistenciaService.recalculate(alert.employee_id, alert.alert_date, alert.alert_date);
            recalcCount++;
          } catch (e) {
            console.error("Error en recálculo de autorización aprobada:", e);
            failCount++;
          }
        }
      }

      queryClient.invalidateQueries({ queryKey: ["overtimeAlerts"] });
      queryClient.invalidateQueries({ queryKey: ["todayAttendance"] });
      queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
      queryClient.invalidateQueries({ queryKey: ["compensationRecords"] });
      queryClient.invalidateQueries({ queryKey: ["compensationPrevMonthRecords"] });
      queryClient.invalidateQueries({ queryKey: ["allAttendanceRecords"] });

      if (failCount > 0) {
        toast.warning(`Revisión completada: ${recalcCount} recálculo(s), ${failCount} con error`);
      } else {
        toast.success(`✓ ${recalcCount} registro(s) recalculado(s) correctamente`);
      }
    } catch (error) {
      toast.error("Error al revisar autorizaciones: " + (error.message || ""));
    } finally {
      setReviewingApproved(false);
    }
  };

  const renderScheduleInfo = (alert, emp) => {
    const alertSched = emp ? getEmployeeScheduleForDate(emp.id, alert.alert_date) : null;
    const alertDow = new Date(alert.alert_date + "T00:00:00").getDay();
    const dowStarts = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
    const dowEnds = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];
    const schedStart = alertSched?.[dowStarts[alertDow]];
    const schedEnd = alertSched?.[dowEnds[alertDow]];
    const schedName = alertSched?.schedule_name?.replace(
      new RegExp(`\\s*-\\s*${emp?.first_name}\\s+${emp?.last_name}\\s*$`, "i"), ""
    ) || null;
    return { schedName, schedStart, schedEnd };
  };

  const isPendientes = subTab === "pendientes";

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-red-50/50">
        <div className="flex items-start justify-between gap-3 flex-wrap">
          <div>
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Clock className="w-5 h-5 text-red-600" />
              Alertas de Horas Extras No Autorizadas
            </CardTitle>
            <p className="text-sm text-slate-600 mt-2">
              Personal que registró horas extras sin autorización previa
            </p>
          </div>
          {canReviewApproved && (
            <Button
              variant="outline"
              size="sm"
              disabled={reviewingApproved || bulkProcessing}
              onClick={handleRevisarAutorizadas}
              className="border-green-300 text-green-700 hover:bg-green-50 whitespace-nowrap"
              title="Revisa las autorizaciones ya aprobadas y recalcula las horas extras en el listado de asistencia"
            >
              <RefreshCw className={`w-4 h-4 mr-1.5 ${reviewingApproved ? "animate-spin" : ""}`} />
              {reviewingApproved ? "Revisando..." : "Revisar Autorizadas"}
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {/* Sub-tabs: Pendientes / Procesadas */}
        <Tabs
          value={subTab}
          onValueChange={(v) => { setSubTab(v); resetPage(); clearSelection(); }}
          className="mb-4"
        >
          <TabsList>
            <TabsTrigger value="pendientes">
              Pendientes
              {pendingAlerts.length > 0 && (
                <Badge className="ml-2 bg-orange-500 text-white">{pendingAlerts.length}</Badge>
              )}
            </TabsTrigger>
            <TabsTrigger value="procesadas">
              Procesadas
              {processedAlerts.length > 0 && (
                <Badge className="ml-2 bg-slate-500 text-white">{processedAlerts.length}</Badge>
              )}
            </TabsTrigger>
          </TabsList>
        </Tabs>

        {/* Filter bar */}
        <div className="flex flex-wrap items-center gap-3 mb-4">
          <div className="relative flex-1 min-w-[180px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
            <Input
              placeholder="Buscar por nombre..."
              value={searchTerm}
              onChange={(e) => { setSearchTerm(e.target.value); resetPage(); }}
              className="pl-9"
            />
          </div>
          {/* Filtro por área */}
          <select
            value={areaFilter}
            onChange={(e) => { setAreaFilter(e.target.value); resetPage(); }}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm text-slate-700 focus:outline-none focus:ring-1 focus:ring-ring"
            title="Filtrar por área"
          >
            <option value="">Todas las áreas</option>
            {areas.map((a) => (
              <option key={a} value={a}>{a}</option>
            ))}
          </select>
          <Input
            type="date"
            value={dateFrom}
            onChange={(e) => { setDateFrom(e.target.value); resetPage(); }}
            className="w-40"
            title="Desde"
          />
          <span className="text-slate-400 text-sm">→</span>
          <Input
            type="date"
            value={dateTo}
            onChange={(e) => { setDateTo(e.target.value); resetPage(); }}
            className="w-40"
            title="Hasta"
          />
          {(dateFrom || dateTo || areaFilter) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setDateFrom(""); setDateTo(""); setAreaFilter(""); resetPage(); }}
            >
              ✕ Filtros
            </Button>
          )}
          <div className="ml-auto">
            <PaginationBar
              inline
              currentPage={page}
              totalItems={filteredAlerts.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          </div>
        </div>

        {/* Barra de selección masiva (solo en Pendientes) */}
        {isPendientes && canEditAttendance && filteredAlerts.length > 0 && (
          <div className="flex items-center gap-3 mb-3 px-4 py-2 rounded-lg bg-indigo-50/60 border border-indigo-100">
            <div className="flex items-center gap-2">
              <Checkbox
                id="select-all-alerts"
                checked={allSelected ? true : someSelected ? "indeterminate" : false}
                onCheckedChange={toggleSelectAll}
              />
              <label htmlFor="select-all-alerts" className="text-sm font-medium text-slate-700 cursor-pointer select-none">
                Seleccionar todos ({filteredAlerts.length})
              </label>
            </div>
            {selectedCount > 0 && (
              <span className="text-sm text-indigo-700 font-medium">
                {selectedCount} seleccionado(s)
              </span>
            )}
            <Button
              size="sm"
              className="ml-auto bg-indigo-600 hover:bg-indigo-700 text-white"
              disabled={selectedCount === 0 || bulkProcessing}
              onClick={() => setShowBulkModal(true)}
              title={selectedCount === 0 ? "Seleccione al menos una alerta para ejecutar acciones masivas" : ""}
            >
              <Layers className="w-4 h-4 mr-1.5" />
              Ejecución masiva
            </Button>
            {selectedCount === 0 && !bulkProcessing && (
              <span className="text-xs text-slate-400 ml-2">Seleccione alertas para habilitar</span>
            )}
            {selectedCount > 0 && (
              <Button
                size="sm"
                variant="ghost"
                onClick={clearSelection}
                disabled={bulkProcessing}
              >
                Limpiar
              </Button>
            )}
          </div>
        )}

        {/* Alert list */}
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <p className="text-slate-600">
              {isPendientes
                ? "No hay alertas pendientes en el rango seleccionado"
                : "No hay alertas procesadas en el rango seleccionado"}
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {pagedAlerts.map((alert) => {
              const emp = allEmployees.find((e) => e.id === alert.employee_id);
              const record = todayRecords.find((r) => r.id === alert.attendance_record_id);
              const { schedName, schedStart, schedEnd } = renderScheduleInfo(alert, emp);
              const isProcessed = subTab === "procesadas";
              const isAuthorized = alert.status === "Autorizado";
              const isSelected = selectedAlertIds.has(alert.id);
              const isOnVacation = !isProcessed && isDateOnVacation(alert.employee_id, alert.alert_date);

              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-3 px-4 py-2.5 rounded-lg border transition-colors ${
                    isProcessed
                      ? isAuthorized
                        ? "border-green-200 bg-green-50/50"
                        : "border-slate-200 bg-slate-50/50"
                      : isOnVacation
                        ? "border-amber-300 bg-amber-50/50"
                        : isSelected
                        ? "border-indigo-300 bg-indigo-50/60"
                        : "border-red-200 bg-red-50/50"
                  }`}
                >
                  {/* Checkbox masivo (solo Pendientes) */}
                  {isPendientes && canEditAttendance && (
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleOne(alert.id)}
                      disabled={bulkProcessing || isOnVacation}
                    />
                  )}

                  {/* Left: info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h4 className="font-bold text-slate-900 text-sm truncate">
                        {emp
                          ? `${emp.document_type || "DNI"} ${emp.document_number} - ${emp.first_name} ${emp.last_name}`
                          : "Empleado desconocido"}
                      </h4>
                      <Badge
                        className={
                          alert.overtime_hours < 0
                            ? "bg-amber-600 text-white"
                            : "bg-red-600 text-white"
                        }
                      >
                        {alert.overtime_hours < 0 ? "Ingreso anticipado" : "Salida posterior"}:{" "}
                        {formatHorasMinutos(alert.overtime_hours)}
                      </Badge>
                      {isProcessed && (
                        <Badge
                          className={
                            isAuthorized
                              ? "bg-green-600 text-white"
                              : "bg-slate-500 text-white"
                          }
                        >
                          {isAuthorized ? "Autorizado" : "Descartado"}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-slate-600 mt-1 flex items-center gap-2 flex-wrap">
                      <span>{emp?.position} • {emp?.department_name}</span>
                      <span className="text-slate-300">|</span>
                      <span>{format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}</span>
                      {record && (() => {
                        const seg = getSegmentClockTimes(record);
                        return (
                          <>
                            <span className="text-slate-300">|</span>
                            <span>Marc: {seg.firstClockIn || "—"}–{seg.lastClockOut || "—"} ({record.worked_hours?.toFixed(2)}h)</span>
                          </>
                        );
                      })()}
                      {schedName && (
                        <>
                          <span className="text-slate-300">|</span>
                          <span>
                            Horario: <span className="font-medium">{schedName}</span>
                            {schedStart && schedEnd && (
                              <span className="text-indigo-600 ml-1">({schedStart}–{schedEnd})</span>
                            )}
                          </span>
                        </>
                      )}
                    </div>
                    {isProcessed && alert.resolution_date && (
                      <div className="text-xs text-slate-500 mt-0.5">
                        Resuelto por {alert.resolved_by || "—"} el {format(parseDateLima(alert.resolution_date), "dd MMM yyyy", { locale: es })}
                        {alert.resolution_notes ? ` — ${alert.resolution_notes}` : ""}
                      </div>
                    )}
                  </div>

                  {/* Right: actions */}
                  <div className="flex items-center gap-2 shrink-0">
                    {!isProcessed && canEditAttendance && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              const alertRecord = record || await entitiesAPI.AttendanceRecord.get(alert.attendance_record_id);
                              const empForAlert = allEmployees.find((e) => e.id === alert.employee_id);
                              onEditRecord(alertRecord, empForAlert);
                            } catch (error) {
                              toast.error("No se pudo cargar la marcación");
                            }
                          }}
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />Corregir
                        </Button>
                        {isOnVacation ? (
                          <Badge className="bg-amber-100 text-amber-700 border border-amber-300" title="La fecha está cubierta por vacaciones aprobadas">
                            <Palmtree className="w-3 h-3 mr-1" />
                            En vacaciones
                          </Badge>
                        ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-700 border-blue-300 hover:bg-blue-50"
                          onClick={() => handleAcceptHE(alert, record)}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          {alert.overtime_hours < 0 ? "Autorizar" : "Aceptar HE"}
                        </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-slate-600"
                          onClick={() => handleDismiss(alert)}
                        >
                          <XCircle className="w-3.5 h-3.5 mr-1" />Descartar
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de ejecución masiva */}
        <BulkOvertimeModal
          open={showBulkModal && canEditAttendance}
          onClose={setShowBulkModal}
          selectedCount={selectedCount}
          onCorregir={bulkCorregir}
          onAceptarHE={bulkAceptarHE}
          onDescartar={bulkDescartar}
          processing={bulkProcessing}
        />

        {/* Overlay de procesamiento masivo */}
        {bulkProcessing && (
          <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-[60]">
            <div className="bg-white rounded-xl shadow-xl px-8 py-6 flex items-center gap-4">
              <div className="w-8 h-8 border-4 border-indigo-200 border-t-indigo-600 rounded-full animate-spin" />
              <span className="text-slate-700 font-medium">Procesando registros...</span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
