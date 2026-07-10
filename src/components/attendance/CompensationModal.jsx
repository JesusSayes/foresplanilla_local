import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import {
  Clock,
  X,
  AlertCircle,
  CheckCircle2,
  TrendingUp,
  UserCheck,
  Search,
  CalendarDays,
  ArrowRightLeft,
  Zap,
  CalendarX,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";
import {
  computeScheduledHours,
  computeScheduledHoursForPeriod,
  getScheduleForDate,
} from "@/lib/attendanceMetrics";

const fmtHours = (h) => {
  const val = h ?? 0;
  const totalMinutes = Math.round(val * 60);
  const hh = Math.floor(totalMinutes / 60);
  const mm = totalMinutes % 60;
  return `${hh}:${String(mm).padStart(2, "0")}`;
};

const fmtMinutes = (minutes) => {
  const val = minutes ?? 0;
  const sign = val < 0 ? "-" : val > 0 ? "+" : "";
  const abs = Math.abs(val);
  const hh = Math.floor(abs / 60);
  const mm = abs % 60;
  return `${sign}${hh}:${String(mm).padStart(2, "0")}`;
};

export default function CompensationModal({
  employee,
  employeeSchedule,
  periodStart,
  periodEnd,
  periodRecords,
  existingCompensations = [],
  allEmployees = [],
  editMode = false,
  pendingCompensations = [],
  onClose,
  onSubmit,
}) {
  const [selectedDays, setSelectedDays] = useState(() => {
    if (editMode && pendingCompensations?.length) {
      const initial = {};
      for (const comp of pendingCompensations) {
        if (comp.status === "Pendiente" || comp.status === "Rechazada") {
          initial[comp.incident_date] = {
            date: comp.incident_date,
            recordId: comp.attendance_record_id || null,
            lateMinutes: comp.late_minutes_to_adjust || 0,
            overtimeMinutes: Math.round((comp.hours_to_adjust || 0) * 60),
          };
        }
      }
      return initial;
    }
    return {};
  });
  const [compensationReason, setCompensationReason] = useState(
    editMode && pendingCompensations?.length
      ? pendingCompensations[0]?.justification || ""
      : ""
  );
  const [authorizer, setAuthorizer] = useState(
    editMode && pendingCompensations?.length && allEmployees?.length
      ? allEmployees.find(
          (e) => e.id === pendingCompensations[0]?.authorizer_id
        ) || null
      : null
  );
  const [authorizerSearch, setAuthorizerSearch] = useState("");
  const [showAuthorizerList, setShowAuthorizerList] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState(null);

  const allEmployeeRecords = useMemo(() => {
    if (!employee) return [];
    return periodRecords.filter((r) => r.employee_id === employee.id);
  }, [employee, periodRecords]);

  // Generar TODOS los días del período (con y sin registro de asistencia)
  const allScheduledDays = useMemo(() => {
    if (!employee || !periodStart || !periodEnd) return [];

    const days = [];
    const start = new Date(periodStart + "T00:00:00");
    const end = new Date(periodEnd + "T00:00:00");

    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      const dateStr = format(d, "yyyy-MM-dd");
      const record = allEmployeeRecords.find((r) => r.date === dateStr);
      const schedForDay = employeeSchedule
        ? getScheduleForDate(employeeSchedule, d)
        : null;

      // Incluir si tiene horario programado para ese día O tiene un registro
      if (schedForDay || record) {
        days.push({
          date: dateStr,
          scheduleTimes: schedForDay,
          record,
          hasRecord: !!record,
          workedHours: record?.worked_hours ?? 0,
          lateMinutes: record?.late_minutes || 0,
          overtimeMinutes: Math.round(
            ((record?.overtime_hours_25 ?? 0) + (record?.overtime_hours_35 ?? 0)) * 60
          ),
        });
      }
    }

    // En modo edición, incluir días de compensaciones pendientes que no estén en la lista
    if (editMode && pendingCompensations?.length) {
      const existingDates = new Set(days.map((d) => d.date));
      for (const comp of pendingCompensations) {
        if (comp.incident_date && !existingDates.has(comp.incident_date)) {
          days.push({
            date: comp.incident_date,
            scheduleTimes: null,
            record: null,
            hasRecord: false,
            workedHours: 0,
            lateMinutes: comp.late_minutes_to_adjust || 0,
            overtimeMinutes: Math.round((comp.hours_to_adjust || 0) * 60),
          });
          existingDates.add(comp.incident_date);
        }
      }
    }

    return days.sort((a, b) => a.date.localeCompare(b.date));
  }, [employee, employeeSchedule, periodStart, periodEnd, allEmployeeRecords, editMode, pendingCompensations]);

  const summary = useMemo(() => {
    const scheduledHours = employeeSchedule
      ? computeScheduledHoursForPeriod(employeeSchedule, periodStart, periodEnd)
      : allEmployeeRecords.reduce((s, r) => s + computeScheduledHours(r), 0);
    const regularHours = allEmployeeRecords.reduce(
      (s, r) => s + (r.regular_hours ?? 0),
      0
    );
    const overtimeHours = allEmployeeRecords.reduce(
      (s, r) => s + (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0),
      0
    );
    const lateMinutes = allEmployeeRecords.reduce(
      (s, r) => s + (r.late_minutes ?? 0),
      0
    );
    return { scheduledHours, regularHours, overtimeHours, lateMinutes };
  }, [allEmployeeRecords, employeeSchedule, periodStart, periodEnd]);

  const compensatedDates = useMemo(() => {
    return new Set(
      existingCompensations
        .filter((c) => c.employee_id === employee?.id)
        .filter((c) => (editMode ? c.status === "Aprobada" : true))
        .map((c) => c.incident_date)
    );
  }, [existingCompensations, employee, editMode]);

  const filteredAuthorizers = useMemo(() => {
    if (!authorizerSearch.trim()) {
      return allEmployees.filter((e) => e.status === "Activo").slice(0, 50);
    }
    const term = authorizerSearch.toLowerCase().trim();
    return allEmployees
      .filter(
        (e) =>
          e.status === "Activo" &&
          (`${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
            `${e.last_name} ${e.first_name}`.toLowerCase().includes(term) ||
            (e.document_number || "").toLowerCase().includes(term) ||
            (e.position || "").toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [allEmployees, authorizerSearch]);

  const toggleDay = (day) => {
    setSelectedDays((prev) => {
      const next = { ...prev };
      if (next[day.date]) {
        delete next[day.date];
      } else {
        next[day.date] = {
          date: day.date,
          recordId: day.record?.id || null,
          lateMinutes: 0,
          overtimeMinutes: 0,
        };
      }
      return next;
    });
  };

  const updateCompensationMinutes = (date, field, value) => {
    setSelectedDays((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        [field]: Math.max(0, parseInt(value) || 0),
      },
    }));
  };

  const autoFillDay = (date) => {
    const day = allScheduledDays.find((d) => d.date === date);
    if (!day) return;
    const lateMin = day.lateMinutes;
    const overtimeMin = day.overtimeMinutes;
    const minVal = Math.min(lateMin, overtimeMin);
    setSelectedDays((prev) => ({
      ...prev,
      [date]: {
        ...prev[date],
        lateMinutes: minVal > 0 ? minVal : lateMin,
        overtimeMinutes: minVal > 0 ? minVal : overtimeMin,
      },
    }));
  };

  const selectAllCompensable = () => {
    setSelectedDays((prev) => {
      const next = { ...prev };
      for (const day of allScheduledDays) {
        if (compensatedDates.has(day.date)) continue;
        if (day.lateMinutes > 0 || day.overtimeMinutes > 0) {
          const minVal = Math.min(day.lateMinutes, day.overtimeMinutes);
          next[day.date] = {
            date: day.date,
            recordId: day.record?.id || null,
            lateMinutes: minVal > 0 ? minVal : day.lateMinutes,
            overtimeMinutes: minVal > 0 ? minVal : day.overtimeMinutes,
          };
        }
      }
      return next;
    });
  };

  const autoFillAll = () => {
    setSelectedDays((prev) => {
      const next = { ...prev };
      for (const [date, data] of Object.entries(next)) {
        const day = allScheduledDays.find((d) => d.date === date);
        if (!day) continue;
        const lateMin = day.lateMinutes;
        const overtimeMin = day.overtimeMinutes;
        const minVal = Math.min(lateMin, overtimeMin);
        next[date] = {
          ...data,
          lateMinutes: minVal > 0 ? minVal : lateMin,
          overtimeMinutes: minVal > 0 ? minVal : overtimeMin,
        };
      }
      return next;
    });
  };

  const selectedList = Object.entries(selectedDays).map(([date, data]) => {
    const day = allScheduledDays.find((d) => d.date === date);
    return { recordId: data.recordId || null, record: day?.record, ...data };
  });

  const totalLateToCompensate = selectedList.reduce(
    (sum, s) => sum + (s.lateMinutes || 0),
    0
  );
  const totalOvertimeToCompensate = selectedList.reduce(
    (sum, s) => sum + (s.overtimeMinutes || 0),
    0
  );

  const handleSubmit = async () => {
    if (selectedList.length === 0) return;
    if (!compensationReason.trim()) return;
    if (!authorizer) return;
    setSubmitting(true);
    setSubmitError(null);
    try {
      await onSubmit(selectedList, compensationReason, authorizer);
    } catch (error) {
      setSubmitError(error?.message || "Ocurrió un error al registrar la compensación.");
    } finally {
      setSubmitting(false);
    }
  };

  if (!employee) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-start sm:items-center justify-center z-50 p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <Card
        className="max-w-4xl w-full my-4 sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold">
                {editMode ? "Editar Compensación" : "Solicitar Compensación"}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {employee.first_name} {employee.last_name} —{" "}
                {employee.document_type} {employee.document_number}
                {employeeSchedule && (
                  <span className="text-slate-400">
                    {" · "}
                    {employeeSchedule.schedule_name}
                  </span>
                )}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Resumen de horas del período — 4 tarjetas */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CalendarDays className="w-4 h-4 text-slate-600" />
                <span className="text-[11px] font-semibold text-slate-700">
                  Horas Programadas
                </span>
              </div>
              <p className="text-xl font-bold text-slate-900">
                {fmtHours(summary.scheduledHours)}
              </p>
            </div>
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <CheckCircle2 className="w-4 h-4 text-green-600" />
                <span className="text-[11px] font-semibold text-green-700">
                  Trab. dentro
                </span>
              </div>
              <p className="text-xl font-bold text-green-900">
                {fmtHours(summary.regularHours)}
              </p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-[11px] font-semibold text-blue-700">
                  Trab. en exceso
                </span>
              </div>
              <p className="text-xl font-bold text-blue-900">
                {fmtHours(summary.overtimeHours)}
              </p>
            </div>
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-[11px] font-semibold text-orange-700">
                  Tardanzas
                </span>
              </div>
              <p className="text-xl font-bold text-orange-900">
                {fmtMinutes(summary.lateMinutes)}
              </p>
            </div>
          </div>

          {/* Información de compensación bidireccional */}
          <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
            <div className="flex items-start gap-2">
              <ArrowRightLeft className="w-4 h-4 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-800">
                <p className="font-semibold mb-1">Compensación bidireccional</p>
                <p>
                  Seleccione cualquier fecha del período (incluyendo días sin
                  registro) para compensar. Use horas en exceso para{" "}
                  <span className="font-medium">reducir tardanzas</span> (↓
                  naranja) o asigne minutos a compensar en{" "}
                  <span className="font-medium">
                    fechas donde no trabajó
                  </span>{" "}
                  (↓ azul).
                </p>
              </div>
            </div>
          </div>

          {/* Selector de autorizador */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Persona que debe autorizar *
            </label>
            {authorizer ? (
              <div className="flex items-center justify-between p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full flex items-center justify-center text-white text-sm font-bold bg-gradient-to-br from-indigo-500 to-purple-600">
                    {authorizer.first_name[0]}{authorizer.last_name[0]}
                  </div>
                  <div>
                    <p className="font-semibold text-slate-900 text-sm">
                      {authorizer.first_name} {authorizer.last_name}
                    </p>
                    <p className="text-xs text-slate-500">
                      {authorizer.position || "Sin cargo"} · {authorizer.department_name || "Sin área"}
                    </p>
                  </div>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => { setAuthorizer(null); setAuthorizerSearch(""); setShowAuthorizerList(true); }}
                  className="text-slate-500 hover:text-red-500"
                >
                  <X className="w-4 h-4" /> Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por nombre, DNI o cargo..."
                  value={authorizerSearch}
                  onChange={(e) => {
                    setAuthorizerSearch(e.target.value);
                    setShowAuthorizerList(true);
                  }}
                  onFocus={() => setShowAuthorizerList(true)}
                  className="pl-9"
                />
                {showAuthorizerList && (
                  <div className="absolute z-50 mt-1 w-full max-h-64 overflow-y-auto bg-white border border-slate-200 rounded-lg shadow-lg">
                    {filteredAuthorizers.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">
                        No se encontraron empleados
                      </p>
                    ) : (
                      filteredAuthorizers.map((emp) => (
                        <button
                          key={emp.id}
                          type="button"
                          onClick={() => {
                            setAuthorizer(emp);
                            setShowAuthorizerList(false);
                            setAuthorizerSearch("");
                          }}
                          className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-indigo-50 transition-colors text-left border-b border-slate-50 last:border-b-0"
                        >
                          <div className="w-7 h-7 rounded-full flex items-center justify-center text-white text-xs font-bold shrink-0 bg-gradient-to-br from-slate-400 to-slate-500">
                            {emp.first_name[0]}{emp.last_name[0]}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="font-medium text-slate-900 text-sm truncate">
                              {emp.first_name} {emp.last_name}
                            </p>
                            <p className="text-xs text-slate-400 truncate">
                              {emp.document_type} {emp.document_number} · {emp.position || ""}
                            </p>
                          </div>
                          <UserCheck className="w-4 h-4 text-slate-300 shrink-0" />
                        </button>
                      ))
                    )}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Tabla de todos los días del período */}
          <div>
            <div className="flex items-center justify-between mb-2 flex-wrap gap-2">
              <p className="text-sm font-semibold text-slate-900">
                Seleccione las fechas a compensar:
              </p>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                  onClick={selectAllCompensable}
                >
                  <Zap className="w-3 h-3 mr-1" />
                  Seleccionar días con compensación
                </Button>
                {Object.keys(selectedDays).length > 0 && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs border-indigo-300 text-indigo-700 hover:bg-indigo-50"
                    onClick={autoFillAll}
                  >
                    <Zap className="w-3 h-3 mr-1" />
                    Auto-completar todo
                  </Button>
                )}
              </div>
            </div>
            {allScheduledDays.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-lg">
                <CalendarX className="w-12 h-12 text-slate-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  No hay días programados ni registros en el período seleccionado
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[360px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Sel.
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Fecha
                      </th>
                      <th className="text-left px-2 py-2 text-xs font-semibold text-slate-600">
                        Horario
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-green-600">
                        Hrs. Trab.
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-orange-600">
                        Tardanza
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-blue-600">
                        HE (min)
                      </th>
                      <th className="text-center px-2 py-2 text-xs font-semibold text-slate-600">
                        Compensar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {allScheduledDays.map((day) => {
                      const isSelected = !!selectedDays[day.date];
                      const isAlreadyCompensated = compensatedDates.has(day.date);
                      return (
                        <tr
                          key={day.date}
                          className={`border-t border-slate-100 ${
                            isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                          } ${isAlreadyCompensated ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={isSelected}
                              disabled={isAlreadyCompensated}
                              onCheckedChange={() =>
                                !isAlreadyCompensated && toggleDay(day)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900">
                              {format(parseDateLima(day.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            <div className="flex items-center gap-1 mt-0.5">
                              {day.hasRecord ? (
                                <Badge className="bg-green-100 text-green-700 text-[10px] px-1.5 py-0">
                                  Trabajado
                                </Badge>
                              ) : (
                                <Badge className="bg-slate-100 text-slate-500 text-[10px] px-1.5 py-0">
                                  <CalendarX className="w-2.5 h-2.5 mr-0.5" />
                                  Sin registro
                                </Badge>
                              )}
                              {isAlreadyCompensated && (
                                <Badge className="bg-purple-100 text-purple-700 text-[10px] px-1.5 py-0">
                                  Ya compensado
                                </Badge>
                              )}
                            </div>
                          </td>
                          <td className="px-2 py-2">
                            <span className="text-xs text-slate-500">
                              {day.scheduleTimes
                                ? `${day.scheduleTimes.start} - ${day.scheduleTimes.end}`
                                : day.record
                                  ? `${day.record.scheduled_start || "—"} - ${day.record.scheduled_end || "—"}`
                                  : "—"}
                            </span>
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.hasRecord ? (
                              <span className="text-xs font-semibold text-green-700">
                                {fmtHours(day.workedHours ?? 0)}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-xs">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.lateMinutes > 0 ? (
                              <span className="font-bold text-orange-600">
                                {day.lateMinutes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2 text-center">
                            {day.overtimeMinutes > 0 ? (
                              <span className="font-bold text-blue-600">
                                {day.overtimeMinutes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-2 py-2">
                            {isSelected && (
                              <div className="space-y-1">
                                <div className="flex items-center gap-1 justify-center">
                                  <Input
                                    type="number"
                                    placeholder="tard"
                                    className="h-8 w-20 text-xs text-center border-orange-300 focus:border-orange-500"
                                    value={selectedDays[day.date]?.lateMinutes || ""}
                                    onChange={(e) =>
                                      updateCompensationMinutes(
                                        day.date,
                                        "lateMinutes",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <Input
                                    type="number"
                                    placeholder="HE"
                                    className="h-8 w-20 text-xs text-center border-blue-300 focus:border-blue-500"
                                    value={selectedDays[day.date]?.overtimeMinutes || ""}
                                    onChange={(e) =>
                                      updateCompensationMinutes(
                                        day.date,
                                        "overtimeMinutes",
                                        e.target.value
                                      )
                                    }
                                  />
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    className="h-7 px-1.5 text-xs text-indigo-600 hover:bg-indigo-100"
                                    onClick={() => autoFillDay(day.date)}
                                    title="Auto-completar con el mínimo entre tardanza y HE"
                                  >
                                    <Zap className="w-3 h-3" />
                                  </Button>
                                </div>
                                <div className="flex justify-center gap-3 text-[9px] text-slate-400">
                                  <span className="text-orange-500">↓ tardanza</span>
                                  <span className="text-blue-500">↓ HE</span>
                                </div>
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
          </div>

          {/* Motivo */}
          <div>
            <label className="block text-sm font-semibold text-slate-900 mb-2">
              Motivo de la compensación *
            </label>
            <Textarea
              value={compensationReason}
              onChange={(e) => setCompensationReason(e.target.value)}
              placeholder="Indique el motivo por el cual se solicita la compensación..."
              rows={2}
            />
          </div>

          {/* Resumen de compensación bidireccional */}
          {selectedList.length > 0 && (
            <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center gap-2 mb-3">
                <AlertCircle className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-900">
                  Resumen de compensación
                </p>
              </div>
              <div className="grid grid-cols-2 gap-3 mb-3">
                <div className="bg-white rounded-lg p-2.5 border border-orange-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <Clock className="w-3.5 h-3.5 text-orange-600" />
                    <span className="text-xs font-medium text-orange-700">
                      Tardanza a compensar
                    </span>
                  </div>
                  <p className="text-lg font-bold text-orange-900">
                    {totalLateToCompensate} min
                  </p>
                </div>
                <div className="bg-white rounded-lg p-2.5 border border-blue-200">
                  <div className="flex items-center gap-1.5 mb-1">
                    <TrendingUp className="w-3.5 h-3.5 text-blue-600" />
                    <span className="text-xs font-medium text-blue-700">
                      HE a compensar
                    </span>
                  </div>
                  <p className="text-lg font-bold text-blue-900">
                    {totalOvertimeToCompensate} min
                  </p>
                </div>
              </div>
              <div className="flex items-center justify-between text-xs">
                <div className="text-slate-600">
                  <span className="font-medium">Fechas seleccionadas:</span>{" "}
                  {selectedList.length}
                </div>
                {totalLateToCompensate === totalOvertimeToCompensate &&
                  totalLateToCompensate > 0 && (
                    <Badge className="bg-green-100 text-green-700 text-xs">
                      <ArrowRightLeft className="w-3 h-3 mr-1" />
                      Compensación equilibrada
                    </Badge>
                  )}
              </div>
              {authorizer && (
                <p className="text-xs text-indigo-700 mt-2 pt-2 border-t border-indigo-100">
                  <UserCheck className="w-3 h-3 inline mr-1" />
                  Autorizador: {authorizer.first_name} {authorizer.last_name}
                </p>
              )}
            </div>
          )}

          {/* Error de envío */}
          {submitError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{submitError}</p>
            </div>
          )}

          {/* Botones */}
          <div className="flex gap-3">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={submitting}
            >
              Cancelar
            </Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSubmit}
              disabled={
                submitting ||
                selectedList.length === 0 ||
                !compensationReason.trim() ||
                !authorizer
              }
            >
              {submitting
                ? "Guardando..."
                : `${editMode ? "Actualizar" : "Registrar"} compensación (${
                    selectedList.length
                  })`}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}