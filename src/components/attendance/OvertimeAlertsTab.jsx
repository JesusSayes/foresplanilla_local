import React, { useState, useMemo } from "react";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Clock, Edit, CheckCircle, XCircle, Search, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima, todayLima } from "@/lib/dateUtils";
import { getSegmentClockTimes } from "@/lib/attendanceMetrics";
import { toast } from "sonner";
import PaginationBar from "@/components/ui/PaginationBar";

const PAGE_SIZE = 20;

/**
 * Pestaña de Alertas de Horas Extras con sub-tabs (Pendientes / Procesadas),
 * filtro por rango de fechas y filas compactas con botones a la derecha.
 */
export default function OvertimeAlertsTab({
  overtimeAlerts,
  allEmployees,
  todayRecords,
  getEmployeeScheduleForDate,
  accessibleEmployeeIds,
  currentUser,
  onEditRecord,
}) {
  const queryClient = useQueryClient();
  const [subTab, setSubTab] = useState("pendientes");
  const [searchTerm, setSearchTerm] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [page, setPage] = useState(1);

  const pendingAlerts = useMemo(
    () => overtimeAlerts.filter((a) => a.status === "Pendiente"),
    [overtimeAlerts]
  );
  const processedAlerts = useMemo(
    () => overtimeAlerts.filter((a) => a.status === "Autorizado" || a.status === "Descartado"),
    [overtimeAlerts]
  );

  const applyFilters = (list) =>
    list.filter((a) => {
      if (!accessibleEmployeeIds.has(a.employee_id)) return false;
      if (searchTerm) {
        const emp = allEmployees.find((e) => e.id === a.employee_id);
        const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
        if (!name.includes(searchTerm.toLowerCase())) return false;
      }
      if (dateFrom && a.alert_date < dateFrom) return false;
      if (dateTo && a.alert_date > dateTo) return false;
      return true;
    });

  const activeList = subTab === "pendientes" ? pendingAlerts : processedAlerts;
  const filteredAlerts = useMemo(() => applyFilters(activeList), [
    activeList,
    accessibleEmployeeIds,
    searchTerm,
    dateFrom,
    dateTo,
  ]);
  const pagedAlerts = filteredAlerts.slice(
    (page - 1) * PAGE_SIZE,
    page * PAGE_SIZE
  );

  const resetPage = () => setPage(1);

  const handleAcceptHE = async (alert, record) => {
    if (record) {
      await base44.entities.AttendanceRecord.update(record.id, {
        overtime_authorized: true,
        notes: (record.notes ? record.notes + " | " : "") +
          `HE aceptadas: ${alert.overtime_hours.toFixed(2)}h (${alert.alert_date})`,
      });
    }
    await base44.entities.OvertimeAlert.update(alert.id, {
      status: "Autorizado",
      resolved_by: currentUser?.email || "",
      resolution_date: todayLima(),
      resolution_notes: `HE aceptadas solo para el día ${alert.alert_date}`,
    });
    await base44.functions.invoke("recalcularAsistencia", {
      employee_id: alert.employee_id,
      date_from: alert.alert_date,
      date_to: alert.alert_date,
    });
    queryClient.invalidateQueries(["overtimeAlerts"]);
    queryClient.invalidateQueries(["todayAttendance"]);
    queryClient.invalidateQueries(["attendanceRecords"]);
    toast.success(
      `HE aceptadas y recalculadas para el ${format(parseDateLima(alert.alert_date), "dd MMM yyyy", { locale: es })}`
    );
  };

  const handleDismiss = async (alert) => {
    await base44.entities.OvertimeAlert.update(alert.id, { status: "Descartado" });
    queryClient.invalidateQueries(["overtimeAlerts"]);
    toast.success("Alerta descartada");
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

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-red-50/50">
        <CardTitle className="text-xl font-bold flex items-center gap-2">
          <Clock className="w-5 h-5 text-red-600" />
          Alertas de Horas Extras No Autorizadas
        </CardTitle>
        <p className="text-sm text-slate-600 mt-2">
          Personal que registró horas extras sin autorización previa
        </p>
      </CardHeader>
      <CardContent className="p-6">
        {/* Sub-tabs: Pendientes / Procesadas */}
        <Tabs value={subTab} onValueChange={(v) => { setSubTab(v); resetPage(); }} className="mb-4">
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
          {(dateFrom || dateTo) && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => { setDateFrom(""); setDateTo(""); resetPage(); }}
            >
              ✕ Rango
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

        {/* Alert list */}
        {filteredAlerts.length === 0 ? (
          <div className="text-center py-12">
            <CheckCircle className="w-16 h-16 text-green-300 mx-auto mb-4" />
            <p className="text-slate-600">
              {subTab === "pendientes"
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

              return (
                <div
                  key={alert.id}
                  className={`flex items-center gap-4 px-4 py-2.5 rounded-lg border ${
                    isProcessed
                      ? isAuthorized
                        ? "border-green-200 bg-green-50/50"
                        : "border-slate-200 bg-slate-50/50"
                      : "border-red-200 bg-red-50/50"
                  }`}
                >
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
                        {Math.abs(alert.overtime_hours).toFixed(2)}h
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
                    {!isProcessed && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            if (!record) return;
                            const empForAlert = allEmployees.find((e) => e.id === alert.employee_id);
                            onEditRecord(record, empForAlert);
                          }}
                        >
                          <Edit className="w-3.5 h-3.5 mr-1" />Corregir
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="text-blue-700 border-blue-300 hover:bg-blue-50"
                          onClick={() => handleAcceptHE(alert, record)}
                        >
                          <CheckCircle className="w-3.5 h-3.5 mr-1" />
                          {alert.overtime_hours < 0 ? "Autorizar" : "Aceptar HE"}
                        </Button>
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
      </CardContent>
    </Card>
  );
}