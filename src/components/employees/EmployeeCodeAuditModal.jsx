import React, { useMemo, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AlertTriangle, ArrowRight, CheckCircle2, Copy, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { base44 } from "@/api/base44Client";
import { buildCodeCorrectionPlan, findDocumentDuplicates } from "@/lib/employeeCode";

const employeeLabel = (emp) =>
  `${emp.first_name || ""} ${emp.last_name || ""}`.trim() || emp.id;

export default function EmployeeCodeAuditModal({ employees, currentUserEmail, onClose, onCorrected }) {
  const [applying, setApplying] = useState(false);
  const [corrected, setCorrected] = useState(null);

  const plan = useMemo(() => buildCodeCorrectionPlan(employees), [employees]);
  const documentDuplicates = useMemo(() => findDocumentDuplicates(employees), [employees]);

  const handleApply = async () => {
    setApplying(true);
    try {
      // Se relee la base antes de corregir para no repetir códigos creados
      // mientras el panel estaba abierto.
      const fresh = await base44.entities.Employee.list("-created_date");
      const freshPlan = buildCodeCorrectionPlan(fresh);

      if (freshPlan.corrections.length === 0) {
        setCorrected(0);
        onCorrected();
        toast.success("No hay códigos duplicados por corregir");
        return;
      }

      await base44.entities.Employee.bulkUpdate(
        freshPlan.corrections.map((item) => ({
          id: item.employee.id,
          employee_code: item.newCode,
        }))
      );

      await base44.entities.EmployeeChangeLog.bulkCreate(
        freshPlan.corrections.map((item) => ({
          employee_id: item.employee.id,
          field_changed: "employee_code",
          old_value: item.oldCode || "(vacío)",
          new_value: item.newCode,
          change_type: "Corrección de código",
          changed_by: currentUserEmail || "Sistema",
          change_date: new Date().toISOString(),
          notes:
            item.reason === "duplicado"
              ? "Código duplicado corregido desde la revisión de códigos"
              : "Código asignado a un empleado sin código registrado",
        }))
      );

      setCorrected(freshPlan.corrections.length);
      onCorrected();
      toast.success(`${freshPlan.corrections.length} código(s) corregido(s)`);
    } catch (error) {
      toast.error("No se pudieron corregir los códigos. Intenta nuevamente.");
      console.error(error);
    } finally {
      setApplying(false);
    }
  };

  const nothingToFix = plan.corrections.length === 0;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-3 sm:p-6 overflow-y-auto"
      onClick={onClose}
    >
      <Card className="max-w-4xl w-full my-4" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="text-lg sm:text-xl font-bold flex items-center gap-2">
                <Copy className="w-5 h-5 text-indigo-600" />
                Revisión de códigos de empleado
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                Verifica que no existan dos empleados con el mismo código. Los registros del personal no se eliminan ni se fusionan.
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}><X className="w-5 h-5" /></Button>
          </div>
        </CardHeader>

        <CardContent className="p-4 sm:p-6 max-h-[75vh] overflow-y-auto space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Códigos duplicados</p>
              <p className="text-2xl font-bold text-slate-900">{plan.duplicates.length}</p>
              <p className="text-xs text-slate-500">{plan.duplicates.reduce((sum, g) => sum + g.employees.length, 0)} empleados involucrados</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Empleados sin código</p>
              <p className="text-2xl font-bold text-slate-900">{plan.missing.length}</p>
              <p className="text-xs text-slate-500">Se les asignará uno</p>
            </div>
            <div className="rounded-lg border border-slate-200 p-3">
              <p className="text-xs text-slate-500">Documentos duplicados</p>
              <p className="text-2xl font-bold text-slate-900">{documentDuplicates.length}</p>
              <p className="text-xs text-slate-500">Se revisan manualmente</p>
            </div>
          </div>

          {corrected !== null && (
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">
                {corrected === 0
                  ? "La revisión finalizó sin códigos por corregir."
                  : `Se corrigieron ${corrected} código(s). Todos los empleados tienen ahora un código único.`}
              </p>
            </div>
          )}

          {nothingToFix ? (
            <div className="flex items-start gap-3 p-3 bg-green-50 border border-green-200 rounded-lg">
              <CheckCircle2 className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
              <p className="text-sm text-green-800">
                No se encontraron códigos duplicados ni empleados sin código.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Correcciones propuestas</p>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-100">
                {plan.corrections.map((item) => (
                  <div key={item.employee.id} className="flex flex-wrap items-center gap-3 p-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-slate-900 truncate">{employeeLabel(item.employee)}</p>
                      <p className="text-xs text-slate-500">
                        {item.employee.document_type} {item.employee.document_number}
                        {item.reason === "duplicado" ? " · código repetido" : " · sin código"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-mono text-red-600">{item.oldCode || "(vacío)"}</span>
                      <ArrowRight className="w-4 h-4 text-slate-400" />
                      <span className="font-mono font-semibold text-green-700">{item.newCode}</span>
                    </div>
                  </div>
                ))}
              </div>
              <p className="text-xs text-slate-500">
                Se conserva el código del empleado activo más antiguo de cada grupo; los demás reciben el siguiente código libre. No se elimina ningún registro.
              </p>
            </div>
          )}

          {documentDuplicates.length > 0 && (
            <div className="space-y-2">
              <div className="flex items-start gap-2 p-3 bg-amber-50 border border-amber-200 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-800">
                  Hay documentos de identidad registrados en más de un empleado. El documento no se modifica automáticamente: revisa cada caso antes de continuar.
                </p>
              </div>
              <div className="rounded-lg border border-amber-200 divide-y divide-amber-100">
                {documentDuplicates.map((group) => (
                  <div key={`${group.document_type}-${group.document_number}`} className="p-3">
                    <div className="flex items-center gap-2 mb-1">
                      <Badge className="bg-amber-100 text-amber-800">{group.document_type}</Badge>
                      <span className="font-mono text-sm font-semibold text-slate-900">{group.document_number}</span>
                    </div>
                    <ul className="text-xs text-slate-600 space-y-0.5">
                      {group.employees.map((emp) => (
                        <li key={emp.id}>
                          {emp.employee_code} · {employeeLabel(emp)} · {emp.status || "—"}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-3 pt-2 border-t">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cerrar</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleApply}
              disabled={applying || nothingToFix}
            >
              {applying ? (
                <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Corrigiendo...</>
              ) : (
                `Corregir ${plan.corrections.length} código(s)`
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}