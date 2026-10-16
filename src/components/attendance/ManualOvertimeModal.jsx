import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AlertCircle, Clock, Plus, RotateCcw } from "lucide-react";
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

  // Fetch existing manual OT records for this employee/period/type
  const { data: existingRecords = [], refetch } = useQuery({
    queryKey: ["manualOvertime", employee?.id, month, year, payrollType],
    queryFn: async () => {
      if (!employee?.id) return [];
      return await base44.entities.HorasExtrasManual.filter({
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
      return await base44.entities.Payslip.filter({
        employee_id: employee.id,
        month: month,
        year: year,
        payroll_type: payrollType,
      });
    },
    enabled: !!employee?.id,
  });

  const activeRecords = existingRecords.filter(r => r.status === "Activo");

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
      await base44.entities.HorasExtrasManual.create({
        employee_id: employee.id,
        payslip_id: closedPayslip?.id || "",
        month: month,
        year: year,
        payroll_type: payrollType,
        overtime_hours_25: Number(hours25) || 0,
        overtime_minutes_25: Number(minutes25) || 0,
        overtime_hours_35: Number(hours35) || 0,
        overtime_minutes_35: Number(minutes35) || 0,
        overtime_destination: destination,
        reason: reason.trim(),
        status: "Activo",
        created_by: currentUser?.email || "",
      });
      toast.success("Horas extras manuales registradas correctamente.");
      setHours25(0); setMinutes25(0); setHours35(0); setMinutes35(0); setReason(""); setDestination("pago");
      refetch();
      queryClient.invalidateQueries({ queryKey: ["manualOvertime"] });
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
      await base44.entities.HorasExtrasManual.update(record.id, {
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
          <div className="grid grid-cols-3 gap-3">
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
          </div>

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
                        <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50 h-7 px-2" onClick={() => handleRevert(r)} disabled={revertingId === r.id}>
                          <RotateCcw className="w-3 h-3 mr-1" />
                          {revertingId === r.id ? "..." : "Revertir"}
                        </Button>
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
              <div>
                <Label className="text-xs font-semibold text-slate-600 mb-1 block">Motivo / Nota <span className="text-red-500">*</span></Label>
                <Textarea value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Describa el motivo del registro manual de horas extras..." rows={2} />
              </div>
              <Button onClick={handleSave} disabled={saving} className="w-full bg-red-600 hover:bg-red-700">
                <Plus className="w-4 h-4 mr-2" />
                {saving ? "Guardando..." : "Registrar Horas Extras Manuales"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}