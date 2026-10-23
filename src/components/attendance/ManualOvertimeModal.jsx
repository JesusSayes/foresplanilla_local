import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, CheckCircle2, Clock, Pencil, Plus, RotateCcw } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const formatHM = (decimalHours) => {
  const totalMin = Math.round(decimalHours * 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return h > 0 ? `${h}h ${m}m` : `${m}m`;
};

export default function ManualOvertimeModal({ employee, defaultMonth, defaultYear, currentUser, onClose, onSuccess }) {
  const queryClient = useQueryClient();
  const [month, setMonth] = useState(defaultMonth || new Date().getMonth() + 1);
  const [year, setYear] = useState(defaultYear || new Date().getFullYear());
  const [payrollType, setPayrollType] = useState("Mensual");
  const [hours25, setHours25] = useState(0);
  const [minutes25, setMinutes25] = useState(0);
  const [hours35, setHours35] = useState(0);
  const [minutes35, setMinutes35] = useState(0);
  const [reason, setReason] = useState("");
  const [destination, setDestination] = useState("pago");
  const [saving, setSaving] = useState(false);
  const [revertingId, setRevertingId] = useState(null);
  // Fecha de la jornada a la que corresponden las horas manuales. Es obligatoria:
  // el destino y la autorización se toman de la jornada de asistencia de esa fecha.
  const [journeyDate, setJourneyDate] = useState(() => {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  });
  const [selectedRecordId, setSelectedRecordId] = useState(null);
  // Registro manual que esta operación reemplaza (corrección por reversión y reemplazo).
  const [replacingRecordId, setReplacingRecordId] = useState(null);

  // Fetch existing manual OT records for this employee/period/type
  const { data: existingRecords = [], refetch } = useQuery({
    queryKey: ["manualOvertime", employee?.id, month, year, payrollType],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await entitiesAPI.HorasExtrasManual.filter({
        employee_id: employee.id,
        month: month,
        year: year,
        payroll_type: payrollType,
      }, "-created_date");
    },
    enabled: !!employee?.id,
  });

  // Fetch payslips for validation (is the planilla open?)
  const { data: payslips = [] } = useQuery({
    queryKey: ["employeePayslipsValidation", employee?.id, month, year, payrollType],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await entitiesAPI.Payslip.filter({
        employee_id: employee.id,
        month: month,
        year: year,
        payroll_type: payrollType,
      });
    },
    enabled: !!employee?.id,
  });

  // Jornada de asistencia del empleado en la fecha indicada: define el destino y la
  // autorización de las horas extras manuales.
  const { data: journeyRecords = [] } = useQuery({
    queryKey: ["manualOvertimeJourney", employee?.id, journeyDate],
    queryFn: async () => {
      if (!employee?.id || !journeyDate) return [];
      const res = await entitiesAPI.AttendanceRecord.filter(
        { employee_id: employee.id, date: journeyDate },
        "-date",
        10
      );
      return Array.isArray(res) ? res : (res?.items || []);
    },
    enabled: !!employee?.id && !!journeyDate,
  });

  // Selección de la jornada: automática si hay una sola coincidencia; con varias
  // coincidencias se exige elegir antes de guardar.
  useEffect(() => {
    if (journeyRecords.length === 1) {
      setSelectedRecordId(journeyRecords[0].id);
    } else if (journeyRecords.length === 0) {
      setSelectedRecordId(null);
    } else {
      setSelectedRecordId((prev) => (journeyRecords.some((r) => r.id === prev) ? prev : null));
    }
  }, [journeyRecords]);

  const journey = journeyRecords.find((r) => r.id === selectedRecordId) || null;

  // El destino del registro manual se inicializa con el de la jornada seleccionada.
  useEffect(() => {
    if (!journey) return;
    setDestination(journey.overtime_destination === "compensacion" ? "compensacion" : "pago");
  }, [journey?.id, journey?.overtime_destination]);

  // Motivos por los que no se puede guardar todavía (se muestran antes de guardar).
  const journeyIssues = [];
  if (!journeyDate) {
    journeyIssues.push("Indique la fecha de la jornada.");
  } else if (journeyRecords.length === 0) {
    journeyIssues.push(
      `No existe una jornada de asistencia para el ${journeyDate}. Genere o regularice la jornada antes de registrar horas extras manuales.`
    );
  } else if (!journey) {
    journeyIssues.push(
      `Hay ${journeyRecords.length} registros de asistencia para el ${journeyDate}: seleccione la jornada correcta.`
    );
  } else if (destination !== (journey.overtime_destination || "pago")) {
    journeyIssues.push(
      "La jornada está destinada a compensación: no se pueden registrar esas horas para pago. Cambie el destino de la jornada mediante una acción explícita si corresponde."
    );
  } else if (destination === "pago" && journey?.overtime_authorized !== true) {
    journeyIssues.push(
      "La jornada no está autorizada para pago: revise la autorización y el destino de la jornada antes de guardar."
    );
  }

  const activeRecords = existingRecords.filter(r => r.status === "Activo");

  // Destinos ya registrados en el período. Si el nuevo registro usa un destino
  // distinto se avisa explícitamente: el sistema nunca cambia el destino por su
  // cuenta (ni de compensación a pago ni al revés).
  const existingDestinations = [...new Set(activeRecords.map(r => r.overtime_destination || "pago"))];
  const destinationMismatch = existingDestinations.length > 0 && !existingDestinations.includes(destination);
  const destinationLabel = (d) => (d === "compensacion" ? "Compensación" : "Pago");

  // Validation: check if any payslip for this period is closed/paid
  const closedPayslip = payslips.find(p => p.status === "Aprobada" || p.status === "Pagada");
  const isClosed = !!closedPayslip;
  const closedStatus = closedPayslip?.status || "";

  const totalManual25 = activeRecords.reduce((sum, r) =>
    sum + (r.overtime_hours_25 || 0) + (r.overtime_minutes_25 || 0) / 60, 0);
  const totalManual35 = activeRecords.reduce((sum, r) =>
    sum + (r.overtime_hours_35 || 0) + (r.overtime_minutes_35 || 0) / 60, 0);

  const handleSave = async () => {
    if (isClosed) {
      toast.error(`No se puede registrar: la planilla está ${closedStatus.toLowerCase()}.`);
      return;
    }
    // El destino y la autorización se validan contra la jornada de asistencia.
    if (journeyIssues.length > 0) {
      toast.error(journeyIssues[0]);
      return;
    }
    if (hours25 === 0 && minutes25 === 0 && hours35 === 0 && minutes35 === 0) {
      toast.error("Debe ingresar al menos horas o minutos para 25% o 35%.");
      return;
    }
    if (!reason.trim()) {
      toast.error("El motivo/nota es obligatorio.");
      return;
    }
    if ((minutes25 > 0 && minutes25 >= 60) || (minutes35 > 0 && minutes35 >= 60)) {
      toast.error("Los minutos deben ser menor a 60.");
      return;
    }

    setSaving(true);
    try {
      await entitiesAPI.HorasExtrasManual.create({
        employee_id: employee.id,
        payslip_id: closedPayslip?.id || "",
        attendance_record_id: journey?.id || "",
        attendance_date: journeyDate,
        month: month,
        year: year,
        payroll_type: payrollType,
        overtime_hours_25: Number(hours25) || 0,
        overtime_minutes_25: Number(minutes25) || 0,
        overtime_hours_35: Number(hours35) || 0,
        overtime_minutes_35: Number(minutes35) || 0,
        overtime_destination: destination,
        replaces_record_id: replacingRecordId || "",
        reason: reason.trim(),
        status: "Activo",
        created_by: currentUser?.email || "",
      });
      toast.success(
        replacingRecordId
          ? "Registro corregido: el anterior quedó revertido y no se suma."
          : "Horas extras manuales registradas correctamente."
      );
      setHours25(0); setMinutes25(0); setHours35(0); setMinutes35(0); setReason("");
      setReplacingRecordId(null);
      setDestination(journey?.overtime_destination === "compensacion" ? "compensacion" : "pago");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["manualOvertime"] });
      // Refrescar asistencia, saldos de compensación y cálculo de planilla.
      queryClient.invalidateQueries({ queryKey: ["attendanceRecords"] });
      queryClient.invalidateQueries({ queryKey: ["allRecordsForCompMetrics"] });
      queryClient.invalidateQueries({ queryKey: ["compensationRecords"] });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error("Error al registrar: " + (error.message || ""));
    } finally {
      setSaving(false);
    }
  };

  const handleRevert = async (record) => {
    if (!window.confirm("¿Revertir este registro de horas extras manuales?")) return;
    setRevertingId(record.id);
    try {
      await entitiesAPI.HorasExtrasManual.update(record.id, {
        status: "Revertido",
        reverted_by: currentUser?.email || "",
        reverted_date: new Date().toISOString(),
        revert_reason: "Revertido desde panel de asistencia",
      });
      toast.success("Registro revertido.");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["manualOvertime"] });
      if (onSuccess) onSuccess();
    } catch (error) {
      toast.error("Error al revertir: " + (error.message || ""));
    } finally {
      setRevertingId(null);
    }
  };

  // Corrección controlada: carga el registro en el formulario. Al guardar se revierte
  // el original y se crea el reemplazo, conservando la trazabilidad.
  const handleEdit = (record) => {
    if (isClosed) return;
    setReplacingRecordId(record.id);
    if (record.attendance_date) setJourneyDate(String(record.attendance_date).slice(0, 10));
    if (record.attendance_record_id) setSelectedRecordId(record.attendance_record_id);
    setHours25(record.overtime_hours_25 || 0);
    setMinutes25(record.overtime_minutes_25 || 0);
    setHours35(record.overtime_hours_35 || 0);
    setMinutes35(record.overtime_minutes_35 || 0);
    setDestination(record.overtime_destination === "compensacion" ? "compensacion" : "pago");
    setReason(record.reason || "");
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-start justify-center z-50 p-3 sm:p-6 overflow-y-auto" onClick={onClose}>
      <Card className="max-w-2xl w-full my-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <Clock className="w-5 h-5 text-red-600" />
                Horas Extras Manuales
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {employee?.first_name} {employee?.last_name} — {employee?.employee_code} · {employee?.document_type} {employee?.document_number}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Period selector */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Mes</Label>
              <Select value={String(month)} onValueChange={(v) => setMonth(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => (
                    <SelectItem key={i + 1} value={String(i + 1)}>
                      {format(new Date(2024, i), 'MMMM', { locale: es })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Año</Label>
              <Select value={String(year)} onValueChange={(v) => setYear(parseInt(v))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {[2024, 2025, 2026, 2027].map(y => (
                    <SelectItem key={y} value={String(y)}>{y}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Tipo Planilla</Label>
              <Select value={payrollType} onValueChange={setPayrollType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Mensual">Mensual</SelectItem>
                  <SelectItem value="Quincenal">Quincenal</SelectItem>
                  <SelectItem value="Adicional">Adicional</SelectItem>
                  <SelectItem value="SNP">SNP</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs font-semibold text-slate-600 mb-1 block">Fecha de la jornada</Label>
              <Input
                type="date"
                value={journeyDate}
                onChange={(e) => setJourneyDate(e.target.value)}
              />
            </div>
          </div>

          {/* Jornada de asistencia consultada: define destino y autorización */}
          {journeyRecords.length === 1 && journey && (
            <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-slate-500 shrink-0" />
                  <span className="text-sm text-slate-700">
                    Jornada del <strong>{journeyDate}</strong>: {journey.scheduled_start || "--:--"}–{journey.scheduled_end || "--:--"} · estado {journey.status || "sin estado"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className={journey.overtime_destination === "compensacion" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}>
                    {destinationLabel(journey.overtime_destination)}
                  </Badge>
                  <Badge className={journey.overtime_authorized ? "bg-green-100 text-green-700" : "bg-amber-100 text-amber-700"}>
                    {journey.overtime_authorized ? "HE autorizadas" : "HE sin autorizar"}
                  </Badge>
                </div>
              </div>
            </div>
          )}
          {journeyRecords.length > 1 && (
            <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
              <p className="text-sm text-amber-800">
                Hay {journeyRecords.length} jornadas para el {journeyDate}. Seleccione la correcta:
              </p>
              <div className="space-y-1">
                {journeyRecords.map((r) => (
                  <button
                    key={r.id}
                    type="button"
                    onClick={() => setSelectedRecordId(r.id)}
                    className={`w-full text-left px-3 py-2 rounded border text-xs ${selectedRecordId === r.id ? "border-indigo-400 bg-white font-semibold" : "border-amber-200 bg-white/60"}`}
                  >
                    {r.scheduled_start || "--:--"}–{r.scheduled_end || "--:--"} · {destinationLabel(r.overtime_destination)} ·{" "}
                    {r.overtime_authorized ? "autorizada" : "sin autorizar"}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Validation warning */}
          {isClosed ? (
            <div className="p-3 bg-red-50 border border-red-300 rounded-lg flex items-center gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
              <p className="text-sm text-red-700 font-medium">
                La planilla de este período está <strong>{closedStatus}</strong>. No se pueden registrar ni modificar horas extras manuales para planillas cerradas o pagadas.
              </p>
            </div>
          ) : (
            <div className="p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2">
              <Clock className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-sm text-green-700">
                Período abierto. Las horas manuales se sumarán al cálculo de la planilla {payrollType}.
              </p>
            </div>
          )}

          {/* Motivos por los que todavía no se puede guardar */}
          {journeyIssues.length > 0 && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-semibold text-red-700 mb-1">No se puede registrar todavía:</p>
                <ul className="space-y-0.5">
                  {journeyIssues.map((message, index) => (
                    <li key={index} className="text-xs text-red-600">• {message}</li>
                  ))}
                </ul>
              </div>
            </div>
          )}

          {/* Existing active records */}
          {activeRecords.length > 0 && (
            <div className="space-y-2">
              <Label className="text-xs font-semibold text-slate-600">Registros Activos</Label>
              {activeRecords.map(r => {
                const ot25 = (r.overtime_hours_25 || 0) + (r.overtime_minutes_25 || 0) / 60;
                const ot35 = (r.overtime_hours_35 || 0) + (r.overtime_minutes_35 || 0) / 60;
                return (
                  <div key={r.id} className="p-3 bg-red-50 border border-red-200 rounded-lg">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge className="bg-red-100 text-red-700 border border-red-300">Manual</Badge>
                        <span className="text-sm font-semibold text-slate-900">
                          {ot25 > 0 && `25%: ${formatHM(ot25)}`}
                          {ot25 > 0 && ot35 > 0 && " · "}
                          {ot35 > 0 && `35%: ${formatHM(ot35)}`}
                        </span>
                      </div>
                      {!isClosed && (
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="outline" className="text-indigo-600 hover:bg-indigo-50 h-7 px-2" onClick={() => handleEdit(r)}>
                            <Pencil className="w-3 h-3 mr-1" />
                            Editar
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 h-7 px-2" onClick={() => handleRevert(r)} disabled={revertingId === r.id}>
                            <RotateCcw className="w-3 h-3 mr-1" />
                            {revertingId === r.id ? "..." : "Revertir"}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-1"><strong>Nota:</strong> {r.reason}</p>
                    <p className="text-xs text-slate-400 mt-0.5">Destino: {r.overtime_destination === "compensacion" ? "Compensación" : "Pago"} · Registrado por {r.created_by}</p>
                  </div>
                );
              })}
              <div className="p-2 bg-slate-50 rounded text-sm text-slate-700">
                <strong>Total manual:</strong> 25% = {formatHM(totalManual25)} · 35% = {formatHM(totalManual35)}
              </div>
            </div>
          )}

          {/* New record form */}
          {!isClosed && (
            <div className="space-y-4 pt-3 border-t">
              <Label className="text-xs font-semibold text-slate-600 block">Nuevo Registro</Label>
              <div className="grid grid-cols-2 gap-4">
                <div className="p-3 border border-blue-200 rounded-lg bg-blue-50/50">
                  <p className="text-sm font-semibold text-blue-700 mb-2">HE al 25%</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs text-slate-500 mb-1 block">Horas</Label>
                      <Input type="number" min="0" max="23" value={hours25 || ""} onChange={(e) => setHours25(parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-slate-500 mb-1 block">Minutos</Label>
                      <Input type="number" min="0" max="59" value={minutes25 || ""} onChange={(e) => setMinutes25(parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                </div>
                <div className="p-3 border border-purple-200 rounded-lg bg-purple-50/50">
                  <p className="text-sm font-semibold text-purple-700 mb-2">HE al 35%</p>
                  <div className="flex gap-2 items-end">
                    <div className="flex-1">
                      <Label className="text-xs text-slate-500 mb-1 block">Horas</Label>
                      <Input type="number" min="0" max="23" value={hours35 || ""} onChange={(e) => setHours35(parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                    <div className="flex-1">
                      <Label className="text-xs text-slate-500 mb-1 block">Minutos</Label>
                      <Input type="number" min="0" max="59" value={minutes35 || ""} onChange={(e) => setMinutes35(parseInt(e.target.value) || 0)} placeholder="0" />
                    </div>
                  </div>
                </div>
              </div>
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Destino de las horas <span className="text-red-500">*</span></Label>
                <Select value={destination} onValueChange={setDestination}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="pago">Pago (se pagan en planilla)</SelectItem>
                    <SelectItem value="compensacion">Compensación (solo compensan tardanzas, no se pagan)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {destinationMismatch && (
                <div className="p-3 bg-amber-50 border border-amber-300 rounded-lg flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                  <div className="text-xs text-amber-800 space-y-1">
                    <p>
                      Este período ya tiene horas extras manuales con destino{" "}
                      <strong>{existingDestinations.map(destinationLabel).join(", ")}</strong>. Va a registrar con
                      destino <strong>{destinationLabel(destination)}</strong>: confirme que es el destino correcto,
                      el sistema no lo cambia automáticamente.
                    </p>
                    <p>
                      El registro manual se asocia al período y a la jornada de asistencia indicada.
                    </p>
                  </div>
                </div>
              )}
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Motivo / Nota <span className="text-red-500">*</span></Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describa el motivo del registro manual de horas extras..." rows={2} />
              </div>
              {replacingRecordId && (
                <div className="p-2 bg-indigo-50 border border-indigo-200 rounded text-xs text-indigo-700 flex items-center justify-between gap-2">
                  <span>Está corrigiendo un registro existente: al guardar, el anterior queda revertido y solo se suma el nuevo.</span>
                  <Button size="sm" variant="ghost" className="h-6 px-2 text-indigo-700" onClick={() => setReplacingRecordId(null)}>
                    Cancelar corrección
                  </Button>
                </div>
              )}
              <Button onClick={handleSave} disabled={saving || journeyIssues.length > 0} className="w-full bg-red-600 hover:bg-red-700">
                <Plus className="w-4 h-4 mr-2" />
                {saving ? "Guardando..." : replacingRecordId ? "Guardar corrección" : "Registrar Horas Extras Manuales"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}