import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, CheckCircle2, Clock, UserX, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { getScheduleForDate } from "@/lib/attendanceMetrics";
import {
  findLateInconsistencies,
  findAbsenceFindings,
  ABSENCE_KIND,
} from "@/lib/attendanceReconciliation";

const MONTHS = Array.from({ length: 12 }, (_, i) => i + 1);
const YEARS = [2024, 2025, 2026, 2027];

// Límite de filas dibujadas por pestaña: un mes puede tener miles de jornadas
// detectadas y la vista previa debe seguir siendo navegable. El total detectado
// siempre se informa.
const MAX_VISIBLE_ROWS = 300;

const dateStringsOfMonth = (month, year) => {
  const last = new Date(year, month, 0).getDate();
  const pad = (n) => String(n).padStart(2, "0");
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(last)}`,
  };
};

/**
 * Vista previa de regularización de asistencia: muestra el detalle por fecha de
 * las tardanzas inconsistentes y de las faltas detectadas, y aplica la
 * regularización SOLO al confirmar el usuario. Nunca modifica boletas aprobadas
 * o pagadas: esos casos se informan para su recálculo explícito.
 */
export default function ReconciliationModal({ onClose, accessibleEmployeeIds = null }) {
  const queryClient = useQueryClient();
  const today = new Date();
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [year, setYear] = useState(today.getFullYear());
  const [selectedLate, setSelectedLate] = useState(new Set());
  const [selectedAbsence, setSelectedAbsence] = useState(new Set());
  const [applying, setApplying] = useState(false);

  const { start, end } = dateStringsOfMonth(month, year);

  const { data: employees = [] } = useQuery({
    queryKey: ["reconciliationEmployees"],
    queryFn: async () => await base44.entities.Employee.list("-created_date", 2000),
  });

  const { data: records = [] } = useQuery({
    queryKey: ["reconciliationRecords", month, year],
    queryFn: async () => {
      const res = await base44.entities.AttendanceRecord.filter(
        { date: { $gte: start, $lte: end } },
        "-date",
        2000
      );
      return Array.isArray(res) ? res : (res?.items || []);
    },
  });

  const { data: incidents = [] } = useQuery({
    queryKey: ["reconciliationIncidents", month, year],
    queryFn: async () => {
      const res = await base44.entities.AttendanceIncident.filter({ status: "Aprobada" }, "-incident_date", 2000);
      return Array.isArray(res) ? res : (res?.items || []);
    },
  });

  const { data: schedules = [] } = useQuery({
    queryKey: ["reconciliationSchedules"],
    queryFn: async () => await base44.entities.WorkSchedule.list("schedule_name", 1000),
  });

  const { data: holidays = [] } = useQuery({
    queryKey: ["reconciliationHolidays"],
    queryFn: async () => await base44.entities.Holiday.list("-date", 500),
  });

  const { data: vacations = [] } = useQuery({
    queryKey: ["reconciliationVacations"],
    queryFn: async () => {
      const all = await base44.entities.VacationRequest.list("-created_date", 2000);
      return all.filter((v) => v.status === "Aprobada" || v.status === "Aprobado");
    },
  });

  const { data: payslips = [] } = useQuery({
    queryKey: ["reconciliationPayslips", month, year],
    queryFn: async () => {
      const res = await base44.entities.Payslip.filter({ month, year }, "-created_date", 1000);
      return Array.isArray(res) ? res : (res?.items || []);
    },
  });

  const { data: generalConfig = {} } = useQuery({
    queryKey: ["generalPayrollConfig"],
    queryFn: async () => {
      const configs = await base44.entities.PayrollConfig.filter({ config_type: "General", is_active: true });
      return configs.length > 0 ? configs[0] : {};
    },
  });
  const enableCompensation = generalConfig?.enable_tardiness_compensation || false;

  const employeeNameById = useMemo(() => {
    const map = new Map();
    for (const e of employees) {
      map.set(e.id, `${e.employee_code || ""} ${e.first_name || ""} ${e.last_name || ""}`.trim());
    }
    return map;
  }, [employees]);

  const employeeById = useMemo(() => new Map(employees.map((e) => [e.id, e])), [employees]);

  // Horario aplicable por empleado y fecha (respeta vigencia y prioridad de empleado).
  const getScheduleDay = useMemo(() => {
    return (employeeId, dateStr) => {
      const employee = employeeById.get(employeeId);
      const isActive = (ws) => ws.is_active !== false;
      const pickValid = (list) => {
        const valid = list.filter((ws) => {
          const from = ws.effective_from || "0000-01-01";
          const to = ws.effective_to || "9999-12-31";
          return from <= dateStr && to >= dateStr;
        });
        valid.sort((a, b) => String(b.effective_from || "0000-01-01").localeCompare(String(a.effective_from || "0000-01-01")));
        const chosen = valid[0];
        if (!chosen) return null;
        const day = getScheduleForDate(chosen, new Date(dateStr + "T00:00:00"));
        if (!day) return null;
        // getScheduleForDate devuelve solo inicio/fin: se añaden la tolerancia y el
        // refrigerio del horario elegido, que son los que usa asistencia y planilla.
        return {
          start: day.start,
          end: day.end,
          tolerance_minutes: chosen.tolerance_minutes ?? 10,
          breakMinutes: chosen.break_duration_minutes ?? 0,
          breakStart: chosen.break_start || null,
        };
      };
      const own = pickValid(schedules.filter((ws) => ws.employee_id === employeeId && isActive(ws)));
      if (own) return own;
      const deptName = employee?.department_name;
      return pickValid(
        schedules.filter((ws) => !ws.employee_id && isActive(ws) &&
          (ws.department_name === deptName || (ws.departments || []).includes(deptName)))
      );
    };
  }, [schedules, employeeById]);

  const approvedIncidentsByKey = useMemo(() => {
    const map = new Map();
    for (const i of incidents) {
      const key = `${i.employee_id}|${String(i.incident_date || "").slice(0, 10)}`;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(i);
    }
    return map;
  }, [incidents]);

  const approvedCompensationByKey = useMemo(() => {
    const map = new Map();
    for (const i of incidents) {
      if (i.incident_type !== "Compensación de Tardanza") continue;
      const key = `${i.employee_id}|${String(i.incident_date || "").slice(0, 10)}`;
      map.set(key, (map.get(key) || 0) + (i.late_minutes_to_adjust || 0));
    }
    return map;
  }, [incidents]);

  const payslipStatusByEmployee = useMemo(() => {
    const map = new Map();
    for (const p of payslips) map.set(p.employee_id, p.status || "");
    return map;
  }, [payslips]);

  const holidaySet = useMemo(() => new Set(holidays.map((h) => String(h.date || "").slice(0, 10))), [holidays]);

  const isVacationDay = useMemo(() => {
    return (employeeId, dateStr) =>
      vacations.some((v) =>
        v.employee_id === employeeId &&
        String(v.start_date || "").slice(0, 10) <= dateStr &&
        String(v.end_date || "").slice(0, 10) >= dateStr
      );
  }, [vacations]);

  const scopedRecords = useMemo(() => {
    if (!accessibleEmployeeIds) return records;
    return records.filter((r) => accessibleEmployeeIds.has(r.employee_id));
  }, [records, accessibleEmployeeIds]);

  const scopedEmployees = useMemo(() => {
    const list = employees.filter((e) => e.status !== "Suspendido");
    if (!accessibleEmployeeIds) return list;
    return list.filter((e) => accessibleEmployeeIds.has(e.id));
  }, [employees, accessibleEmployeeIds]);

  const lateRows = useMemo(
    () =>
      findLateInconsistencies({
        records: scopedRecords,
        getScheduleDay,
        approvedIncidentsByKey,
        approvedCompensationByKey,
        employeeNameById,
        enableCompensation,
        payslipStatusByEmployee,
      }),
    [scopedRecords, getScheduleDay, approvedIncidentsByKey, approvedCompensationByKey, employeeNameById, enableCompensation, payslipStatusByEmployee]
  );

  const absenceRows = useMemo(
    () =>
      findAbsenceFindings({
        employees: scopedEmployees,
        records: scopedRecords,
        getScheduleDay,
        approvedIncidentsByKey,
        employeeNameById,
        periodStart: start,
        periodEnd: end,
        isHoliday: (dateStr) => holidaySet.has(dateStr),
        isVacation: isVacationDay,
      }),
    [scopedEmployees, scopedRecords, getScheduleDay, approvedIncidentsByKey, employeeNameById, start, end, holidaySet, isVacationDay]
  );

  const toggle = (setter, set, key) => {
    const next = new Set(set);
    if (next.has(key)) next.delete(key);
    else next.add(key);
    setter(next);
  };

  const refresh = () => {
    queryClient.invalidateQueries(["reconciliationRecords"]);
    queryClient.invalidateQueries(["attendanceRecords"]);
    queryClient.invalidateQueries(["todayAttendance"]);
    queryClient.invalidateQueries(["allIncidents"]);
    queryClient.invalidateQueries(["compensationRecords"]);
    queryClient.invalidateQueries(["manualOvertime"]);
  };

  const handleApplyLate = async () => {
    const rows = lateRows.filter((r) => selectedLate.has(r.recordId));
    if (rows.length === 0) {
      toast.error("Seleccione al menos una jornada para regularizar.");
      return;
    }
    const blocked = rows.filter((r) => r.requiresManualRecalc);
    const applicable = rows.filter((r) => !r.requiresManualRecalc && !r.needsReview);
    setApplying(true);
    try {
      for (const row of applicable) {
        await base44.entities.AttendanceRecord.update(row.recordId, {
          is_late: row.effectiveMinutes > 0,
          late_minutes: row.effectiveMinutes,
        });
      }
      refresh();
      toast.success(
        `${applicable.length} jornada(s) regularizada(s).` +
          (blocked.length > 0
            ? ` ${blocked.length} no se modificó(aron): su boleta está aprobada o pagada y requiere recálculo explícito de planilla.`
            : "")
      );
      setSelectedLate(new Set());
    } catch (error) {
      toast.error("Error al regularizar tardanzas: " + (error.message || ""));
    } finally {
      setApplying(false);
    }
  };

  const applyAbsence = async (confirm) => {
    const rows = absenceRows.filter((r) => selectedAbsence.has(`${r.employeeId}|${r.date}`));
    if (rows.length === 0) {
      toast.error("Seleccione al menos una jornada.");
      return;
    }
    setApplying(true);
    try {
      for (const row of rows) {
        if (confirm) {
          if (row.recordId) {
            const payload = { is_absent: true, status: "Ausente" };
            if (!(row.isAbsent && row.recordStatus === "Ausente")) {
              payload.notes = "Falta confirmada en la regularización de inasistencias";
            }
            await base44.entities.AttendanceRecord.update(row.recordId, payload);
          } else {
            await base44.entities.AttendanceRecord.create({
              employee_id: row.employeeId,
              date: row.date,
              is_absent: true,
              status: "Ausente",
              notes: "Falta confirmada en la regularización de inasistencias",
            });
          }
        } else if (row.recordId) {
          await base44.entities.AttendanceRecord.update(row.recordId, {
            is_absent: false,
            status: row.recordStatus === "Ausente" ? "Completo" : row.recordStatus,
          });
        }
      }
      refresh();
      toast.success(
        confirm
          ? `${rows.length} jornada(s) confirmada(s) como falta injustificada.`
          : `${rows.length} jornada(s) marcada(s) como no falta (sin descuento).`
      );
      setSelectedAbsence(new Set());
    } catch (error) {
      toast.error("Error al regularizar asistencias: " + (error.message || ""));
    } finally {
      setApplying(false);
    }
  };

  const actionableAbsence = absenceRows.filter(
    (r) => r.kind === ABSENCE_KIND.CONFIRMED || r.kind === ABSENCE_KIND.REVIEW
  );

  const visibleLateRows = lateRows.slice(0, MAX_VISIBLE_ROWS);
  const visibleAbsenceRows = absenceRows.slice(0, MAX_VISIBLE_ROWS);

  const checkboxFor = (checked, onChange) => (
    <Checkbox checked={checked} onCheckedChange={onChange} />
  );

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-6xl w-full my-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle className="text-xl font-bold">Regularizar asistencia</CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Vista previa por fecha. Nada se modifica hasta que confirme. Las boletas aprobadas o
                pagadas no se tocan: se informan para su recálculo explícito.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
          <div className="flex gap-3 mt-4">
            <Select value={String(month)} onValueChange={(v) => { setMonth(parseInt(v)); setSelectedLate(new Set()); setSelectedAbsence(new Set()); }}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {MONTHS.map((m) => (
                  <SelectItem key={m} value={String(m)}>{format(new Date(2024, m - 1), "MMMM", { locale: es })}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={String(year)} onValueChange={(v) => { setYear(parseInt(v)); setSelectedLate(new Set()); setSelectedAbsence(new Set()); }}>
              <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
              <SelectContent>
                {YEARS.map((y) => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <Tabs defaultValue="late">
            <TabsList>
              <TabsTrigger value="late">
                <Clock className="w-4 h-4 mr-1" />Tardanzas ({lateRows.length})
              </TabsTrigger>
              <TabsTrigger value="absence">
                <UserX className="w-4 h-4 mr-1" />Inasistencias ({absenceRows.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="late" className="space-y-4">
              {lateRows.length === 0 ? (
                <p className="text-sm text-slate-600 py-6 text-center">
                  No se detectaron tardanzas inconsistentes en {format(new Date(year, month - 1), "MMMM yyyy", { locale: es })}.
                </p>
              ) : (
                <>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="p-2 w-10"></th>
                          <th className="p-2 text-left">Trabajador</th>
                          <th className="p-2 text-left">Fecha</th>
                          <th className="p-2 text-center">Almacenado</th>
                          <th className="p-2 text-center">Calculado</th>
                          <th className="p-2 text-center">Tolerancia</th>
                          <th className="p-2 text-center">Comp. aplicada</th>
                          <th className="p-2 text-left">Situación</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleLateRows.map((row) => (
                          <tr key={row.recordId} className="border-t">
                            <td className="p-2">
                              {row.needsReview
                                ? <span className="text-xs text-slate-400">—</span>
                                : checkboxFor(
                                    selectedLate.has(row.recordId),
                                    () => toggle(setSelectedLate, selectedLate, row.recordId)
                                  )}
                            </td>
                            <td className="p-2">{row.employeeName}</td>
                            <td className="p-2">{row.date}</td>
                            <td className="p-2 text-center">
                              {row.storedMinutes} min {row.storedIsLate ? "(tarde)" : ""}
                            </td>
                            <td className="p-2 text-center font-semibold">
                              {row.markedMinutes === null ? "sin datos" : `${row.effectiveMinutes} min`}
                            </td>
                            <td className="p-2 text-center">{row.toleranceMinutes} min</td>
                            <td className="p-2 text-center">{row.appliedCompensationMinutes} min</td>
                            <td className="p-2">
                              {row.needsReview ? (
                                <Badge className="bg-amber-100 text-amber-700 text-xs">Requiere revisión: {row.reason}</Badge>
                              ) : row.requiresManualRecalc ? (
                                <Badge className="bg-red-100 text-red-700 text-xs">
                                  Boleta {row.payslipStatus.toLowerCase()}: requiere recálculo explícito
                                </Badge>
                              ) : (
                                <Badge className="bg-blue-100 text-blue-700 text-xs">Se regularizará a {row.effectiveMinutes} min</Badge>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  {lateRows.length > MAX_VISIBLE_ROWS && (
                    <p className="text-xs text-amber-700">
                      Se muestran las primeras {MAX_VISIBLE_ROWS} de {lateRows.length} jornadas detectadas.
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3">
                    <p className="text-xs text-slate-500">
                      Se regularizan <strong>is_late</strong> y <strong>late_minutes</strong> juntos, con el
                      mismo resultado que usa la planilla.
                    </p>
                    <Button onClick={handleApplyLate} disabled={applying || selectedLate.size === 0} className="bg-indigo-600 hover:bg-indigo-700">
                      <CheckCircle2 className="w-4 h-4 mr-2" />
                      {applying ? "Regularizando..." : `Regularizar ${selectedLate.size} jornada(s)`}
                    </Button>
                  </div>
                </>
              )}
            </TabsContent>

            <TabsContent value="absence" className="space-y-4">
              {absenceRows.length === 0 ? (
                <p className="text-sm text-slate-600 py-6 text-center">
                  No se detectaron faltas ni inconsistencias en {format(new Date(year, month - 1), "MMMM yyyy", { locale: es })}.
                </p>
              ) : (
                <>
                  <div className="flex items-start gap-2 p-3 bg-slate-50 border rounded-lg text-xs text-slate-600">
                    <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                    <p>
                      Solo se descuenta en planilla la falta confirmada. Un descanso, un feriado, una
                      ausencia cubierta por incidencia aprobada o un permiso sin goce no generan descuento
                      por falta injustificada.
                    </p>
                  </div>
                  <div className="overflow-x-auto border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 text-slate-600">
                        <tr>
                          <th className="p-2 w-10"></th>
                          <th className="p-2 text-left">Trabajador</th>
                          <th className="p-2 text-left">Fecha</th>
                          <th className="p-2 text-left">Situación detectada</th>
                          <th className="p-2 text-left">Estado actual</th>
                        </tr>
                      </thead>
                      <tbody>
                        {visibleAbsenceRows.map((row) => {
                          const key = `${row.employeeId}|${row.date}`;
                          const actionable = row.kind === ABSENCE_KIND.CONFIRMED || row.kind === ABSENCE_KIND.REVIEW;
                          return (
                            <tr key={key} className="border-t">
                              <td className="p-2">
                                {actionable
                                  ? checkboxFor(selectedAbsence.has(key), () => toggle(setSelectedAbsence, selectedAbsence, key))
                                  : <span className="text-xs text-slate-400">—</span>}
                              </td>
                              <td className="p-2">{row.employeeName}</td>
                              <td className="p-2">{row.date}</td>
                              <td className="p-2">
                                <Badge
                                  className={
                                    row.kind === ABSENCE_KIND.CONFIRMED
                                      ? "bg-red-100 text-red-700 text-xs"
                                      : row.kind === ABSENCE_KIND.REVIEW
                                        ? "bg-amber-100 text-amber-700 text-xs"
                                        : row.kind === ABSENCE_KIND.COVERED
                                          ? "bg-green-100 text-green-700 text-xs"
                                          : "bg-slate-100 text-slate-700 text-xs"
                                  }
                                >
                                  {row.reason}
                                </Badge>
                              </td>
                              <td className="p-2 text-slate-600">
                                {row.hasRecord
                                  ? `${row.recordStatus || "sin estado"}${row.isAbsent ? " · marcado ausente" : ""}`
                                  : "Sin registro de asistencia"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {absenceRows.length > MAX_VISIBLE_ROWS && (
                    <p className="text-xs text-amber-700">
                      Se muestran las primeras {MAX_VISIBLE_ROWS} de {absenceRows.length} jornadas detectadas.
                    </p>
                  )}
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <p className="text-xs text-slate-500">
                      Confirme solo las faltas reales. Los casos de {actionableAbsence.length} jornada(s)
                      seleccionables quedarán con el descuento aplicado una sola vez en planilla.
                    </p>
                    <div className="flex gap-2">
                      <Button variant="outline" onClick={() => applyAbsence(false)} disabled={applying || selectedAbsence.size === 0}>
                        No es falta (sin descuento)
                      </Button>
                      <Button onClick={() => applyAbsence(true)} disabled={applying || selectedAbsence.size === 0} className="bg-red-600 hover:bg-red-700">
                        <UserX className="w-4 h-4 mr-2" />
                        {applying ? "Aplicando..." : `Confirmar falta (${selectedAbsence.size})`}
                      </Button>
                    </div>
                  </div>
                </>
              )}
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>
  );
}