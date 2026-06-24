import React, { useState, useRef, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar } from "@/components/ui/calendar";
import { CalendarIcon, Clock, RefreshCw, CheckCircle, ChevronDown, Search, X } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

// Selector de fecha inline (sin Popover/portal para evitar conflictos con overflow)
function InlineDatePicker({ value, onChange, label, hint, className = "" }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div className={className}>
      {label && <Label className="font-semibold text-slate-800 mb-2 block">{label}</Label>}
      <div className="relative" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center gap-2 px-3 py-2 border border-green-200 bg-green-50 hover:bg-green-100 rounded-md text-sm text-green-700 font-medium transition-colors"
        >
          <CalendarIcon className="w-4 h-4 text-green-600 shrink-0" />
          {value ? format(value, "dd 'de' MMMM yyyy", { locale: es }) : <span className="text-slate-400">Sin fecha</span>}
        </button>
        {open && (
          <div className="absolute z-[200] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl left-0">
            <Calendar
              mode="single"
              selected={value}
              onSelect={d => { if (d) { onChange(d); setOpen(false); } }}
              locale={es}
              initialFocus
            />
          </div>
        )}
      </div>
      {hint && <p className="text-xs text-slate-500 mt-1">{hint}</p>}
    </div>
  );
}

function InlineDatePickerOptional({ value, onChange, label }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  return (
    <div>
      {label && <Label className="font-semibold text-slate-800 mb-2 block">{label}</Label>}
      <div className="flex gap-2" ref={ref}>
        <div className="relative flex-1">
          <button
            type="button"
            onClick={() => setOpen(o => !o)}
            className="w-full flex items-center gap-2 px-3 py-2 border border-slate-200 bg-white hover:bg-slate-50 rounded-md text-sm transition-colors"
          >
            <CalendarIcon className="w-4 h-4 text-slate-400 shrink-0" />
            {value
              ? <span className="text-slate-800">{format(value, "dd 'de' MMMM yyyy", { locale: es })}</span>
              : <span className="text-slate-400">Sin fecha de fin</span>
            }
          </button>
          {open && (
            <div className="absolute z-[200] mt-1 bg-white border border-slate-200 rounded-lg shadow-xl left-0">
              <Calendar
                mode="single"
                selected={value}
                onSelect={d => { onChange(d || null); setOpen(false); }}
                locale={es}
                initialFocus
              />
            </div>
          )}
        </div>
        {value && (
          <Button variant="outline" size="sm" onClick={() => onChange(null)} className="text-slate-500 shrink-0">
            <X className="w-4 h-4" />
          </Button>
        )}
      </div>
    </div>
  );
}

export default function AssignScheduleModal({ employee, onClose, onSuccess, initialDate }) {
  const [effectiveFrom, setEffectiveFrom] = useState(initialDate || new Date());
  const [effectiveTo, setEffectiveTo] = useState(null);
  const [selectedScheduleId, setSelectedScheduleId] = useState("");
  const [recalcRange, setRecalcRange] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scheduleSearchTerm, setScheduleSearchTerm] = useState("");
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef(null);

  const { data: allSchedules = [] } = useQuery({
    queryKey: ["workSchedules"],
    queryFn: () => base44.entities.WorkSchedule.list("-effective_from"),
  });

  const templateSchedules = allSchedules.filter(s => !s.employee_id && s.is_active);
  const empSchedules = allSchedules.filter(s => s.employee_id === employee.id && s.is_active);

  const today = format(new Date(), "yyyy-MM-dd");
  const currentSchedule = (() => {
    const empCandidates = empSchedules.filter(s => {
      const from = s.effective_from || "0000-01-01";
      const to = s.effective_to || "9999-12-31";
      return from <= today && to >= today;
    });
    empCandidates.sort((a, b) => (b.effective_from || "0000-01-01").localeCompare(a.effective_from || "0000-01-01"));
    return empCandidates[0] || null;
  })();

  // Pre-seleccionar la plantilla que corresponde al horario actual del empleado
  useEffect(() => {
    if (!currentSchedule || !templateSchedules.length || selectedScheduleId) return;

    // Buscar la plantilla cuyo nombre base coincide con el horario actual del empleado
    // El nombre del horario individual tiene formato: "{plantilla} - {nombre empleado}"
    const matchByName = templateSchedules.find(t =>
      currentSchedule.schedule_name.startsWith(t.schedule_name)
    );
    if (matchByName) {
      setSelectedScheduleId(matchByName.id);
    }
  }, [currentSchedule, templateSchedules]);

  useEffect(() => {
    const handleClickOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const visibleSchedules = templateSchedules.filter(s =>
    s.schedule_name.toLowerCase().includes(scheduleSearchTerm.toLowerCase())
  );

  const selectedScheduleObj = allSchedules.find(s => s.id === selectedScheduleId);

  const getSchedulePreview = (s) => {
    if (!s) return null;
    return [
      { day: "Lun", start: s.monday_start, end: s.monday_end },
      { day: "Mar", start: s.tuesday_start, end: s.tuesday_end },
      { day: "Mié", start: s.wednesday_start, end: s.wednesday_end },
      { day: "Jue", start: s.thursday_start, end: s.thursday_end },
      { day: "Vie", start: s.friday_start, end: s.friday_end },
      { day: "Sáb", start: s.saturday_start, end: s.saturday_end },
    ].filter(d => d.start);
  };

  const preview = getSchedulePreview(selectedScheduleObj);

  const handleSave = async () => {
    if (!selectedScheduleId) {
      toast.error("Selecciona un horario");
      return;
    }
    if (!effectiveFrom) {
      toast.error("Debes indicar la fecha de inicio de vigencia");
      return;
    }

    setSaving(true);
    try {
      const selectedSchedule = allSchedules.find(s => s.id === selectedScheduleId);
      if (!selectedSchedule) throw new Error("Horario no encontrado");

      const effectiveFromStr = format(effectiveFrom, "yyyy-MM-dd");
      const effectiveToStr = effectiveTo ? format(effectiveTo, "yyyy-MM-dd") : null;

      // Si la fecha de fin ya pasó, el horario se creará inactivo
      const isExpired = effectiveToStr !== null && effectiveToStr < today;

      // 1. Cerrar horarios individuales del empleado que se superpongan
      for (const s of empSchedules) {
        const sTo = s.effective_to || "9999-12-31";
        if (sTo >= effectiveFromStr) {
          const dayBefore = new Date(effectiveFromStr + "T00:00:00");
          dayBefore.setDate(dayBefore.getDate() - 1);
          const dayBeforeStr = format(dayBefore, "yyyy-MM-dd");
          const sFrom = s.effective_from || "0000-01-01";
          if (dayBeforeStr < sFrom) {
            await base44.entities.WorkSchedule.update(s.id, { is_active: false });
          } else {
            await base44.entities.WorkSchedule.update(s.id, { effective_to: dayBeforeStr });
          }
        }
      }

      // 2. Crear nuevo WorkSchedule individual
      await base44.entities.WorkSchedule.create({
        employee_id: employee.id,
        schedule_name: `${selectedSchedule.schedule_name} - ${employee.first_name} ${employee.last_name}`,
        effective_from: effectiveFromStr,
        effective_to: effectiveToStr,
        is_active: !isExpired,
        monday_start: selectedSchedule.monday_start,
        monday_end: selectedSchedule.monday_end,
        tuesday_start: selectedSchedule.tuesday_start,
        tuesday_end: selectedSchedule.tuesday_end,
        wednesday_start: selectedSchedule.wednesday_start,
        wednesday_end: selectedSchedule.wednesday_end,
        thursday_start: selectedSchedule.thursday_start,
        thursday_end: selectedSchedule.thursday_end,
        friday_start: selectedSchedule.friday_start,
        friday_end: selectedSchedule.friday_end,
        saturday_start: selectedSchedule.saturday_start,
        saturday_end: selectedSchedule.saturday_end,
        sunday_start: selectedSchedule.sunday_start,
        sunday_end: selectedSchedule.sunday_end,
        break_duration_minutes: selectedSchedule.break_duration_minutes ?? 60,
        tolerance_minutes: selectedSchedule.tolerance_minutes ?? 10,
        exempt_from_clocking: selectedSchedule.exempt_from_clocking ?? false,
        overtime_authorized: selectedSchedule.overtime_authorized ?? false,
      });

      // 3. Recalcular asistencias si se solicitó (solo si el período no está completamente en el futuro)
      if (recalcRange && !isExpired) {
        const dateTo = effectiveToStr || format(new Date(), "yyyy-MM-dd");
        if (effectiveFromStr <= dateTo) {
          const res = await base44.functions.invoke("recalcularAsistencia", {
            employee_id: employee.id,
            date_from: effectiveFromStr,
            date_to: dateTo,
          });
          toast.success(`Horario asignado y ${res.data?.updated || 0} registros recalculados`);
        } else {
          toast.success("Horario asignado correctamente");
        }
      } else if (isExpired) {
        toast.warning("Horario guardado como inactivo porque la fecha de vigencia ya venció.");
      } else {
        toast.success("Horario asignado correctamente");
      }

      onSuccess?.();
      onClose();
    } catch (error) {
      toast.error("Error al asignar horario: " + error.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[60] p-6"
      onClick={onClose}
    >
      <Card className="max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <CardHeader className="border-b bg-indigo-50">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-xl font-bold text-indigo-900">{currentSchedule ? "Reasignar Horario" : "Asignar Horario"}</CardTitle>
              <p className="text-sm text-indigo-700 mt-1">
                {employee.first_name} {employee.last_name} · {employee.employee_code}
              </p>
            </div>
            <Button variant="ghost" size="icon" onClick={onClose}>✕</Button>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5 overflow-visible">

          {/* Horario actual vigente */}
          {currentSchedule ? (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
              <p className="text-xs font-semibold text-amber-700 mb-1">⚠️ Horario actualmente asignado:</p>
              <p className="text-sm font-semibold text-slate-800">{currentSchedule.schedule_name}</p>
              <p className="text-xs text-slate-600">
                Vigente desde: {currentSchedule.effective_from || "siempre"}
                {currentSchedule.effective_to ? ` · Hasta: ${currentSchedule.effective_to}` : " · Sin fecha de fin"}
              </p>
              <p className="text-xs text-amber-600 mt-1">La plantilla seleccionada abajo reemplazará este horario desde la fecha que indiques.</p>
            </div>
          ) : (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs text-blue-700">Este empleado no tiene un horario individual asignado actualmente.</p>
            </div>
          )}

          {/* Selector de horario con búsqueda */}
          <div>
            <Label className="font-semibold text-slate-800 mb-2 block">
              {currentSchedule ? "Plantilla de Horario a Asignar *" : "Nuevo Horario *"}
            </Label>
            <div className="relative" ref={dropdownRef}>
              <button
                type="button"
                className="w-full flex items-center justify-between border border-input rounded-md px-3 py-2 text-sm bg-white shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring"
                onClick={() => setDropdownOpen(o => !o)}
              >
                <span className={selectedScheduleObj ? "text-slate-900 font-medium" : "text-slate-400"}>
                  {selectedScheduleObj ? selectedScheduleObj.schedule_name : "Buscar y seleccionar plantilla..."}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  {selectedScheduleId && (
                    <span
                      role="button"
                      tabIndex={0}
                      className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500"
                      onClick={e => { e.stopPropagation(); setSelectedScheduleId(""); setScheduleSearchTerm(""); }}
                    >
                      <X className="w-3.5 h-3.5" />
                    </span>
                  )}
                  <ChevronDown className="w-4 h-4 text-slate-400" />
                </div>
              </button>
              {dropdownOpen && (
                <div className="absolute z-[150] w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg max-h-64 flex flex-col">
                  <div className="p-2 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        autoFocus
                        placeholder="Buscar horario..."
                        value={scheduleSearchTerm}
                        onChange={e => setScheduleSearchTerm(e.target.value)}
                        className="pl-8 h-8"
                      />
                    </div>
                  </div>
                  <div className="overflow-y-auto">
                    {visibleSchedules.length === 0 ? (
                      <p className="text-sm text-slate-400 text-center py-4">No se encontraron horarios</p>
                    ) : (
                      visibleSchedules.map(s => (
                        <button
                          key={s.id}
                          type="button"
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 hover:text-indigo-800 transition-colors ${selectedScheduleId === s.id ? "bg-indigo-50 text-indigo-800 font-semibold" : "text-slate-800"}`}
                          onClick={() => {
                            setSelectedScheduleId(s.id);
                            setScheduleSearchTerm("");
                            setDropdownOpen(false);
                          }}
                        >
                          {s.schedule_name}
                        </button>
                      ))
                    )}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Preview del horario seleccionado */}
          {preview && preview.length > 0 && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
              <p className="text-xs font-semibold text-blue-700 mb-2 flex items-center gap-1">
                <Clock className="w-3.5 h-3.5" /> Vista previa del horario
              </p>
              <div className="grid grid-cols-3 gap-1.5">
                {preview.map(d => (
                  <div key={d.day} className="text-xs bg-white rounded px-2 py-1 border border-blue-100">
                    <span className="font-semibold text-blue-800">{d.day}</span>
                    <span className="text-slate-600 ml-1">{d.start}–{d.end}</span>
                  </div>
                ))}
              </div>
              {selectedScheduleObj?.tolerance_minutes > 0 && (
                <p className="text-xs text-blue-600 mt-2">
                  Tolerancia: {selectedScheduleObj.tolerance_minutes} min · Break: {selectedScheduleObj.break_duration_minutes ?? 60} min
                </p>
              )}
            </div>
          )}

          {/* Vigente desde — calendario inline */}
          <InlineDatePicker
            label="Vigente desde *"
            value={effectiveFrom}
            onChange={setEffectiveFrom}
            hint="El nuevo horario aplicará desde esta fecha en adelante."
          />

          {/* Vigente hasta — opcional, calendario inline */}
          <InlineDatePickerOptional
            label={<>Vigente hasta <span className="font-normal text-slate-400">(opcional — dejar vacío = sin fecha de fin)</span></>}
            value={effectiveTo}
            onChange={setEffectiveTo}
          />

          {/* Recalcular asistencias */}
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg">
            <label className="flex items-start gap-3 cursor-pointer">
              <input
                type="checkbox"
                checked={recalcRange}
                onChange={e => setRecalcRange(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-indigo-600"
              />
              <div>
                <p className="text-sm font-semibold text-amber-900 flex items-center gap-1">
                  <RefreshCw className="w-3.5 h-3.5" />
                  Recalcular asistencias en el período
                </p>
                <p className="text-xs text-amber-700 mt-0.5">
                  Recalcula automáticamente horas trabajadas, tardanzas y horas extras
                  de todos los registros existentes entre la fecha de inicio y hoy
                  (o fecha de fin si se definió).
                </p>
              </div>
            </label>
          </div>

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onClose}>Cancelar</Button>
            <Button
              className="flex-1 bg-indigo-600 hover:bg-indigo-700"
              onClick={handleSave}
              disabled={saving || !selectedScheduleId}
            >
              {saving ? (
                <><RefreshCw className="w-4 h-4 mr-2 animate-spin" />Procesando...</>
              ) : (
                <><CheckCircle className="w-4 h-4 mr-2" />Asignar Horario</>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}