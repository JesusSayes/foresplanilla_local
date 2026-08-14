import React, { useState, useMemo, useEffect, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card, CardContent } from "@/components/ui/card";
import {
  X, Settings, CheckCircle, AlertTriangle, FileText, Bell,
  Loader2, Play, ArrowLeft, RotateCcw
} from "lucide-react";
import { format, differenceInDays, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

const PHASE_SELECT = "select";
const PHASE_RUNNING = "running";
const PHASE_DONE = "done";

export default function ProcessRenewalModal({
  open,
  onClose,
  rules,
  contracts,
  allEmployees,
  currentUser,
  onCompleted,
}) {
  const [phase, setPhase] = useState(PHASE_SELECT);
  const [assignments, setAssignments] = useState({}); // contractId -> ruleId
  const [log, setLog] = useState([]);
  const [summary, setSummary] = useState(null);
  const [processing, setProcessing] = useState(false);
  const logEndRef = useRef(null);

  const activeRules = useMemo(() => (rules || []).filter(r => r.is_active), [rules]);

  // Contratos candidatos: vigentes con fecha de vencimiento que coinciden con al menos una regla activa
  const candidateContracts = useMemo(() => {
    const today = new Date();
    return (contracts || [])
      .filter(c => c.end_date && c.status === "Vigente")
      .map(c => {
        const endDate = new Date(c.end_date);
        const daysUntilExpiration = differenceInDays(endDate, today);
        const matchingRules = activeRules.filter(rule => {
          const typeMatches = (rule.contract_types || []).includes(c.contract_type);
          // Incluye contratos ya vencidos (días negativos) que siguen marcados como Vigente:
          // son los más urgentes de renovar. El umbral "menos de X días" cubre tanto
          // los próximos a vencer como los vencidos pendientes de renovación.
          const daysMatch = daysUntilExpiration < rule.days_before_expiration;
          const renewableMatch = !rule.only_renewable || c.renewable;
          return typeMatches && daysMatch && renewableMatch;
        });
        return { contract: c, daysUntilExpiration, matchingRules };
      })
      .filter(item => item.matchingRules.length > 0)
      .sort((a, b) => a.daysUntilExpiration - b.daysUntilExpiration);
  }, [contracts, activeRules]);

  // Inicializar asignaciones por defecto (primera regla que coincida) cuando se abre el modal
  useEffect(() => {
    if (open) {
      const defaultAssignments = {};
      candidateContracts.forEach(({ contract, matchingRules }) => {
        if (matchingRules.length > 0) {
          defaultAssignments[contract.id] = matchingRules[0].id;
        }
      });
      setAssignments(defaultAssignments);
      setPhase(PHASE_SELECT);
      setLog([]);
      setSummary(null);
      setProcessing(false);
    }
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-scroll del log
  useEffect(() => {
    if (logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [log]);

  if (!open) return null;

  const addLog = (type, message) => {
    setLog(prev => [...prev, { id: Date.now() + Math.random(), type, message, time: new Date() }]);
  };

  const handleStartProcessing = async () => {
    setPhase(PHASE_RUNNING);
    setLog([]);
    setProcessing(true);

    const today = new Date();
    let notificationsCreated = 0;
    let draftsCreated = 0;
    let errorsCount = 0;
    const processedNames = new Set();

    addLog("info", `Iniciando procesamiento de ${candidateContracts.length} contrato(s) candidato(s)...`);

    for (const { contract, daysUntilExpiration } of candidateContracts) {
      const ruleId = assignments[contract.id];
      const rule = activeRules.find(r => r.id === ruleId);
      if (!rule) {
        addLog("warn", `Sin regla asignada para el contrato de ${getEmployeeName(contract)}. Se omite.`);
        continue;
      }

      const emp = allEmployees.find(e => e.id === contract.employee_id);
      const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido";

      const daysLabel = daysUntilExpiration < 0
        ? `vencido hace ${Math.abs(daysUntilExpiration)} día(s)`
        : `vence en ${daysUntilExpiration} día(s)`;
      addLog("info", `Evaluando contrato de ${empName} (${contract.position || "sin cargo"}) — ${daysLabel}, regla: "${rule.name}".`);

      // Notificación
      if (rule.send_notification) {
        try {
          addLog("info", `→ Generando notificación para ${empName}...`);
          const notificationData = {
            user_email: currentUser?.email,
            type: "contract_renewal",
            title: `Contrato próximo a vencer: ${empName}`,
            message: `El contrato de ${empName} (${contract.position || ""}) vence el ${format(new Date(contract.end_date), "dd/MM/yyyy")}. ${rule.auto_create_draft ? "Se ha creado un borrador automático." : "Requiere revisión."}`,
            is_read: false,
            link: "/ContractManagement",
          };
          await base44.entities.Notification.create(notificationData);
          notificationsCreated++;
          addLog("success", `✓ Notificación creada para ${empName}.`);

          if (rule.notification_emails?.length > 0) {
            for (const email of rule.notification_emails) {
              try {
                await base44.integrations.Core.SendEmail({
                  to: email,
                  subject: `Alerta: Contrato próximo a vencer - ${empName}`,
                  body: `El contrato del empleado ${empName} está próximo a vencer.\n\n- Cargo: ${contract.position || ""}\n- Tipo: ${contract.contract_type}\n- Vence: ${format(new Date(contract.end_date), "dd 'de' MMMM 'de' yyyy", { locale: es })}\n- Días restantes: ${daysUntilExpiration}\n\n${rule.auto_create_draft ? "Se ha creado un borrador de renovación automáticamente." : "Por favor, revisa la renovación."}`,
                });
                addLog("success", `✓ Correo enviado a ${email}.`);
              } catch (err) {
                addLog("error", `✗ Error enviando correo a ${email}: ${err.message || "desconocido"}`);
                errorsCount++;
              }
            }
          }
        } catch (err) {
          addLog("error", `✗ Error creando notificación para ${empName}: ${err.message || "desconocido"}`);
          errorsCount++;
        }
      }

      // Borrador automático
      if (rule.auto_create_draft && contract.renewable) {
        try {
          addLog("info", `→ Generando borrador de contrato para ${empName}...`);
          const newStartDate = new Date(contract.end_date);
          newStartDate.setDate(newStartDate.getDate() + 1);
          const newEndDate = addMonths(newStartDate, rule.draft_extension_months || 12);

          const draftData = {
            employee_id: contract.employee_id,
            contract_number: `${contract.contract_number || emp?.employee_code || "CTR"}-REN-${format(new Date(), "yyyyMMdd")}`,
            contract_type: contract.contract_type,
            start_date: format(newStartDate, "yyyy-MM-dd"),
            end_date: format(newEndDate, "yyyy-MM-dd"),
            position: contract.position,
            department: contract.department,
            work_location: contract.work_location,
            salary: contract.salary,
            activity_cost: contract.activity_cost ?? 0,
            food_cost: contract.food_cost ?? 0,
            transport_cost: contract.transport_cost ?? 0,
            work_schedule: contract.work_schedule,
            weekly_hours: contract.weekly_hours,
            functions: contract.functions,
            benefits: contract.benefits,
            trial_period_days: 0,
            renewable: contract.renewable,
            status: "Vencido",
            signed_date: format(new Date(), "yyyy-MM-dd"),
            notes: `[BORRADOR AUTOMÁTICO] Renovación del contrato ${contract.contract_number || contract.id}. Generado por regla: ${rule.name}`,
          };

          await base44.entities.Contract.create(draftData);
          draftsCreated++;
          processedNames.add(empName);
          addLog("success", `✓ Borrador generado para ${empName} (vigencia: ${format(newStartDate, "dd/MM/yyyy")} al ${format(newEndDate, "dd/MM/yyyy")}).`);
        } catch (err) {
          addLog("error", `✗ Error generando borrador para ${empName}: ${err.message || "desconocido"}`);
          errorsCount++;
        }
      } else if (rule.auto_create_draft && !contract.renewable) {
        addLog("warn", `⚠ Contrato de ${empName} no es renovable. No se genera borrador.`);
      }

      // Pequeña pausa para permitir render del log
      await new Promise(r => setTimeout(r, 120));
    }

    addLog("info", `Procesamiento finalizado.`);
    setSummary({
      total: candidateContracts.length,
      notifications: notificationsCreated,
      drafts: draftsCreated,
      errors: errorsCount,
      processedNames: [...processedNames],
    });
    setProcessing(false);
    setPhase(PHASE_DONE);
    if (onCompleted) onCompleted({ drafts: draftsCreated, notifications: notificationsCreated });
  };

  const handleReset = () => {
    setPhase(PHASE_SELECT);
    setLog([]);
    setSummary(null);
  };

  const getEmployeeName = (contract) => {
    const emp = allEmployees.find(e => e.id === contract.employee_id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido";
  };

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100] p-4">
      <Card className="max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-slate-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Settings className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {phase === PHASE_SELECT && "Procesar Renovación de Contratos"}
                {phase === PHASE_RUNNING && "Procesando..."}
                {phase === PHASE_DONE && "Procesamiento Completado"}
              </h2>
              <p className="text-sm text-slate-500">
                {phase === PHASE_SELECT && "Asigna una regla a cada contrato próximo a vencer"}
                {phase === PHASE_RUNNING && "Generando borradores y notificaciones en tiempo real"}
                {phase === PHASE_DONE && "Resumen de acciones realizadas"}
              </p>
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={onClose} disabled={processing}>
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* FASE 1: Selección de reglas */}
          {phase === PHASE_SELECT && (
            <div className="space-y-4">
              {activeRules.length === 0 ? (
                <div className="text-center py-10">
                  <AlertTriangle className="w-12 h-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">No hay reglas activas configuradas</p>
                  <p className="text-sm text-slate-500 mt-1">Crea o activa al menos una regla antes de procesar.</p>
                </div>
              ) : candidateContracts.length === 0 ? (
                <div className="text-center py-10">
                  <CheckCircle className="w-12 h-12 text-green-400 mx-auto mb-3" />
                  <p className="text-slate-700 font-medium">No hay contratos próximos a vencer que coincidan con las reglas activas</p>
                  <p className="text-sm text-slate-500 mt-1">Todo está al día por ahora.</p>
                </div>
              ) : (
                <>
                  <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 flex items-start gap-2">
                    <Bell className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
                    <p className="text-sm text-blue-800">
                      Se encontraron <strong>{candidateContracts.length}</strong> contrato(s) próximo(s) a vencer.
                      {activeRules.length > 1
                        ? " Selecciona qué regla aplicar a cada uno antes de procesar."
                        : " Se aplicará la única regla activa a todos."}
                    </p>
                  </div>

                  <div className="space-y-2">
                    {candidateContracts.map(({ contract, daysUntilExpiration, matchingRules }) => {
                      const emp = allEmployees.find(e => e.id === contract.employee_id);
                      const empName = emp ? `${emp.first_name} ${emp.last_name}` : "Empleado desconocido";
                      return (
                        <div key={contract.id} className="p-3 border border-slate-200 rounded-lg bg-white">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-3">
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <h4 className="font-semibold text-slate-900 truncate">{empName}</h4>
                                <Badge className={daysUntilExpiration <= 15 ? "bg-red-100 text-red-700" : "bg-orange-100 text-orange-700"}>
                                  {daysUntilExpiration < 0
                                    ? `Vencido hace ${Math.abs(daysUntilExpiration)} día${Math.abs(daysUntilExpiration) !== 1 ? "s" : ""}`
                                    : `${daysUntilExpiration} día${daysUntilExpiration !== 1 ? "s" : ""}`}
                                </Badge>
                              </div>
                              <p className="text-xs text-slate-500 mt-0.5">
                                {contract.position || "Sin cargo"} • {contract.contract_type} • Vence: {format(new Date(contract.end_date), "dd/MM/yyyy")}
                              </p>
                            </div>
                            <div className="sm:w-64 shrink-0">
                              {matchingRules.length === 1 ? (
                                <div className="px-3 py-2 bg-slate-50 rounded-md text-sm text-slate-700 border border-slate-200">
                                  Regla: <strong>{matchingRules[0].name}</strong>
                                </div>
                              ) : (
                                <Select
                                  value={assignments[contract.id] || ""}
                                  onValueChange={(val) => setAssignments(prev => ({ ...prev, [contract.id]: val }))}
                                >
                                  <SelectTrigger className="w-full">
                                    <SelectValue placeholder="Selecciona regla" />
                                  </SelectTrigger>
                                  <SelectContent>
                                    {matchingRules.map(r => (
                                      <SelectItem key={r.id} value={r.id}>{r.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}

          {/* FASE 2: Log en tiempo real */}
          {phase === PHASE_RUNNING && (
            <div className="space-y-3">
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Loader2 className="w-4 h-4 animate-spin text-indigo-600" />
                <span>Ejecutando acciones...</span>
              </div>
              <LogConsole log={log} logEndRef={logEndRef} />
            </div>
          )}

          {/* FASE 3: Resumen final */}
          {phase === PHASE_DONE && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <SummaryCard icon={FileText} label="Borradores generados" value={summary?.drafts || 0} color="indigo" />
                <SummaryCard icon={Bell} label="Notificaciones" value={summary?.notifications || 0} color="blue" />
                <SummaryCard icon={AlertTriangle} label="Errores" value={summary?.errors || 0} color={summary?.errors > 0 ? "red" : "slate"} />
                <SummaryCard icon={Settings} label="Contratos procesados" value={summary?.total || 0} color="slate" />
              </div>

              {summary?.processedNames?.length > 0 && (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                  <p className="text-sm font-semibold text-indigo-900 mb-2">
                    Borradores generados para {summary.processedNames.length} trabajador(es):
                  </p>
                  <ul className="space-y-1">
                    {summary.processedNames.map((name, i) => (
                      <li key={i} className="text-sm text-indigo-800 flex items-center gap-2">
                        <CheckCircle className="w-3.5 h-3.5 text-indigo-600" />
                        {name}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              <LogConsole log={log} logEndRef={logEndRef} collapsed />
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t bg-slate-50 flex justify-end gap-3">
          {phase === PHASE_SELECT && (
            <>
              <Button variant="outline" onClick={onClose}>Cancelar</Button>
              <Button
                className="bg-blue-600 hover:bg-blue-700"
                disabled={candidateContracts.length === 0 || activeRules.length === 0}
                onClick={handleStartProcessing}
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar Procesamiento
              </Button>
            </>
          )}
          {phase === PHASE_RUNNING && (
            <Button variant="outline" disabled>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Procesando...
            </Button>
          )}
          {phase === PHASE_DONE && (
            <>
              <Button variant="outline" onClick={handleReset}>
                <RotateCcw className="w-4 h-4 mr-2" />
                Volver a seleccionar
              </Button>
              <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={onClose}>
                <CheckCircle className="w-4 h-4 mr-2" />
                Finalizar
              </Button>
            </>
          )}
        </div>
      </Card>
    </div>
  );
}

function LogConsole({ log, logEndRef, collapsed }) {
  const [expanded, setExpanded] = useState(!collapsed);
  return (
    <div>
      {collapsed && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-sm text-slate-600 hover:text-slate-900 mb-2 flex items-center gap-1"
        >
          {expanded ? "Ocultar" : "Ver"} registro detallado de acciones
        </button>
      )}
      {expanded && (
        <div className="bg-slate-900 rounded-lg p-4 max-h-72 overflow-y-auto font-mono text-xs">
          {log.length === 0 ? (
            <p className="text-slate-400">Esperando acciones...</p>
          ) : (
            log.map(entry => (
              <div key={entry.id} className="flex gap-2 py-0.5">
                <span className="text-slate-500 shrink-0">
                  {format(entry.time, "HH:mm:ss")}
                </span>
                <span className={
                  entry.type === "success" ? "text-green-400" :
                  entry.type === "error" ? "text-red-400" :
                  entry.type === "warn" ? "text-amber-400" :
                  "text-slate-300"
                }>
                  {entry.message}
                </span>
              </div>
            ))
          )}
          <div ref={logEndRef} />
        </div>
      )}
    </div>
  );
}

function SummaryCard({ icon: Icon, label, value, color }) {
  const colors = {
    indigo: "bg-indigo-50 text-indigo-700 border-indigo-200",
    blue: "bg-blue-50 text-blue-700 border-blue-200",
    red: "bg-red-50 text-red-700 border-red-200",
    slate: "bg-slate-50 text-slate-700 border-slate-200",
  };
  return (
    <div className={`p-3 rounded-lg border ${colors[color] || colors.slate}`}>
      <div className="flex items-center gap-2 mb-1">
        <Icon className="w-4 h-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}