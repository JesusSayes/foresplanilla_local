import React, { useState, useMemo } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Clock, X, AlertCircle, CheckCircle2, TrendingUp, UserCheck, Search } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima } from "@/lib/dateUtils";

export default function CompensationModal({
  employee,
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
        if (
          comp.attendance_record_id &&
          (comp.status === "Pendiente" || comp.status === "Rechazada")
        ) {
          initial[comp.attendance_record_id] = {
            date: comp.incident_date,
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

  // Filtrar registros con tardanza u horas extras del empleado seleccionado
  const daysWithIncidents = useMemo(() => {
    if (!employee) return [];
    const base = periodRecords
      .filter((r) => r.employee_id === employee.id)
      .filter(
        (r) =>
          (r.late_minutes > 0) ||
          ((r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0) > 0)
      );

    // In edit mode, also include days with existing editable compensations
    if (editMode && pendingCompensations?.length) {
      const existingIds = new Set(base.map((r) => r.id));
      for (const comp of pendingCompensations) {
        if (
          comp.attendance_record_id &&
          !existingIds.has(comp.attendance_record_id)
        ) {
          const rec = periodRecords.find(
            (r) => r.id === comp.attendance_record_id
          );
          if (rec) {
            base.push(rec);
            existingIds.add(rec.id);
          }
        }
      }
    }

    return base.sort((a, b) => a.date.localeCompare(b.date));
  }, [employee, periodRecords, editMode, pendingCompensations]);

  // Fechas que ya tienen compensación registrada
  const compensatedDates = useMemo(() => {
    return new Set(
      existingCompensations
        .filter((c) => c.employee_id === employee?.id)
        .filter((c) => (editMode ? c.status === "Aprobada" : true))
        .map((c) => c.incident_date)
    );
  }, [existingCompensations, employee, editMode]);

  // Filtrar empleados para el selector de autorizador
  const filteredAuthorizers = useMemo(() => {
    if (!authorizerSearch.trim()) {
      return allEmployees
        .filter((e) => e.status === "Activo" && e.id !== employee?.id)
        .slice(0, 50);
    }
    const term = authorizerSearch.toLowerCase().trim();
    return allEmployees
      .filter(
        (e) =>
          e.status === "Activo" &&
          e.id !== employee?.id &&
          (`${e.first_name} ${e.last_name}`.toLowerCase().includes(term) ||
            `${e.last_name} ${e.first_name}`.toLowerCase().includes(term) ||
            (e.document_number || "").toLowerCase().includes(term) ||
            (e.position || "").toLowerCase().includes(term))
      )
      .slice(0, 50);
  }, [allEmployees, authorizerSearch, employee]);

  const toggleDay = (recordId, date) => {
    setSelectedDays((prev) => {
      const next = { ...prev };
      if (next[recordId]) {
        delete next[recordId];
      } else {
        next[recordId] = { date, lateMinutes: 0, overtimeMinutes: 0 };
      }
      return next;
    });
  };

  const updateCompensationMinutes = (recordId, field, value) => {
    setSelectedDays((prev) => ({
      ...prev,
      [recordId]: {
        ...prev[recordId],
        [field]: Math.max(0, parseInt(value) || 0),
      },
    }));
  };

  const selectedList = Object.entries(selectedDays).map(([recordId, data]) => {
    const rec = daysWithIncidents.find((r) => r.id === recordId);
    return { recordId, record: rec, ...data };
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
    try {
      await onSubmit(selectedList, compensationReason, authorizer);
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
                {editMode
                  ? "Editar Compensación de Tardanzas"
                  : "Solicitar Compensación de Tardanzas"}
              </CardTitle>
              <p className="text-sm text-slate-600 mt-1">
                {employee.first_name} {employee.last_name} —{" "}
                {employee.document_type} {employee.document_number}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-5 h-5" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">
          {/* Resumen del periodo */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="text-xs font-semibold text-orange-700">
                  Días con tardanza
                </span>
              </div>
              <p className="text-2xl font-bold text-orange-900">
                {daysWithIncidents.filter((r) => r.late_minutes > 0).length}
              </p>
              <p className="text-xs text-orange-600">
                {daysWithIncidents.reduce(
                  (s, r) => s + (r.late_minutes || 0),
                  0
                )}{" "}
                min totales
              </p>
            </div>
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="w-4 h-4 text-blue-600" />
                <span className="text-xs font-semibold text-blue-700">
                  Días con horas extras
                </span>
              </div>
              <p className="text-2xl font-bold text-blue-900">
                {daysWithIncidents.filter(
                  (r) =>
                    (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0) > 0
                ).length}
              </p>
              <p className="text-xs text-blue-600">
                {(
                  daysWithIncidents.reduce(
                    (s, r) =>
                      s + (r.overtime_hours_25 ?? 0) + (r.overtime_hours_35 ?? 0),
                    0
                  )
                ).toFixed(2)}{" "}
                h totales
              </p>
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

          {/* Tabla de días con incidencias */}
          <div>
            <p className="text-sm font-semibold text-slate-900 mb-2">
              Seleccione los días a compensar:
            </p>
            {daysWithIncidents.length === 0 ? (
              <div className="text-center py-8 bg-slate-50 rounded-lg">
                <CheckCircle2 className="w-12 h-12 text-green-300 mx-auto mb-2" />
                <p className="text-slate-500 text-sm">
                  No hay tardanzas ni horas extras en el período seleccionado
                </p>
              </div>
            ) : (
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-[280px] overflow-y-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Sel.
                      </th>
                      <th className="text-left px-3 py-2 text-xs font-semibold text-slate-600">
                        Fecha
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-orange-600">
                        Tardanza (min)
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-blue-600">
                        HE (min)
                      </th>
                      <th className="text-center px-3 py-2 text-xs font-semibold text-slate-600">
                        Compensar
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {daysWithIncidents.map((rec) => {
                      const isSelected = !!selectedDays[rec.id];
                      const isAlreadyCompensated = compensatedDates.has(
                        rec.date
                      );
                      const overtimeMin = Math.round(
                        ((rec.overtime_hours_25 ?? 0) +
                          (rec.overtime_hours_35 ?? 0)) *
                          60
                      );
                      return (
                        <tr
                          key={rec.id}
                          className={`border-t border-slate-100 ${
                            isSelected ? "bg-indigo-50" : "hover:bg-slate-50"
                          } ${isAlreadyCompensated ? "opacity-50" : ""}`}
                        >
                          <td className="px-3 py-2">
                            <Checkbox
                              checked={isSelected}
                              disabled={isAlreadyCompensated}
                              onCheckedChange={() =>
                                !isAlreadyCompensated &&
                                toggleDay(rec.id, rec.date)
                              }
                            />
                          </td>
                          <td className="px-3 py-2">
                            <span className="font-medium text-slate-900">
                              {format(parseDateLima(rec.date), "dd MMM yyyy", {
                                locale: es,
                              })}
                            </span>
                            {isAlreadyCompensated && (
                              <Badge className="ml-2 bg-purple-100 text-purple-700 text-xs">
                                Ya compensado
                              </Badge>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {rec.late_minutes > 0 ? (
                              <span className="font-bold text-orange-600">
                                {rec.late_minutes}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2 text-center">
                            {overtimeMin > 0 ? (
                              <span className="font-bold text-blue-600">
                                {overtimeMin}
                              </span>
                            ) : (
                              <span className="text-slate-300">—</span>
                            )}
                          </td>
                          <td className="px-3 py-2">
                            {isSelected && (
                              <div className="flex gap-1 justify-center">
                                <Input
                                  type="number"
                                  placeholder="min tard"
                                  className="h-7 w-16 text-xs text-center"
                                  value={
                                    selectedDays[rec.id]?.lateMinutes || ""
                                  }
                                  onChange={(e) =>
                                    updateCompensationMinutes(
                                      rec.id,
                                      "lateMinutes",
                                      e.target.value
                                    )
                                  }
                                />
                                <Input
                                  type="number"
                                  placeholder="min HE"
                                  className="h-7 w-16 text-xs text-center"
                                  value={
                                    selectedDays[rec.id]?.overtimeMinutes || ""
                                  }
                                  onChange={(e) =>
                                    updateCompensationMinutes(
                                      rec.id,
                                      "overtimeMinutes",
                                      e.target.value
                                    )
                                  }
                                />
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

          {/* Resumen de compensación */}
          {selectedList.length > 0 && (
            <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <AlertCircle className="w-4 h-4 text-indigo-600" />
                <p className="text-sm font-semibold text-indigo-900">
                  Resumen de compensación solicitada
                </p>
              </div>
              <div className="grid grid-cols-3 gap-3 text-sm">
                <div>
                  <span className="text-slate-600">Días seleccionados:</span>
                  <span className="font-bold ml-1">
                    {selectedList.length}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Min. tardanza:</span>
                  <span className="font-bold ml-1 text-orange-600">
                    {totalLateToCompensate}
                  </span>
                </div>
                <div>
                  <span className="text-slate-600">Min. HE:</span>
                  <span className="font-bold ml-1 text-blue-600">
                    {totalOvertimeToCompensate}
                  </span>
                </div>
              </div>
              {authorizer && (
                <p className="text-xs text-indigo-700 mt-2">
                  <UserCheck className="w-3 h-3 inline mr-1" />
                  Autorizador: {authorizer.first_name} {authorizer.last_name}
                </p>
              )}
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