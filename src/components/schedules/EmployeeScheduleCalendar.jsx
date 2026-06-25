import React, { useState } from "react";
import { format, startOfMonth, endOfMonth, eachDayOfInterval, getDay, addMonths, subMonths, isSameMonth, isToday } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronLeft, ChevronRight, Plus, Clock, X } from "lucide-react";

const DAY_KEYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];

function getScheduleForDate(date, schedules) {
  const dateStr = format(date, "yyyy-MM-dd");
  return schedules.filter(s => {
    const from = s.effective_from || "0000-01-01";
    const to = s.effective_to || "9999-12-31";
    return from <= dateStr && to >= dateStr && s.is_active !== false;
  });
}

function getDayScheduleInfo(date, schedule) {
  const dayKey = DAY_KEYS[getDay(date)];
  const start = schedule[`${dayKey}_start`];
  const end = schedule[`${dayKey}_end`];
  if (!start || !end) return null;
  return { start, end };
}

export default function EmployeeScheduleCalendar({ employee, schedules, templates, onAssign, onEdit, onClose }) {
  const [currentMonth, setCurrentMonth] = useState(new Date());

  const days = eachDayOfInterval({ start: startOfMonth(currentMonth), end: endOfMonth(currentMonth) });

  // Padding days at start
  const firstDayOfWeek = getDay(days[0]); // 0=Sun
  const paddingDays = Array(firstDayOfWeek).fill(null);

  const weekDayLabels = ["Dom", "Lun", "Mar", "Mié", "Jue", "Vie", "Sáb"];

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl my-4" onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b bg-indigo-50 rounded-t-2xl">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              Calendario de Horarios — {employee.first_name} {employee.last_name}
            </h2>
            <p className="text-sm text-slate-500">{employee.employee_code} · {employee.department_name || "Sin departamento"}</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-slate-200 rounded-lg transition-colors">
            <X className="w-5 h-5 text-slate-600" />
          </button>
        </div>

        {/* Legend */}
        <div className="px-6 pt-4 flex flex-wrap gap-3 text-xs">
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-100 border border-indigo-300 inline-block" /> Con horario</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-amber-50 border border-amber-300 inline-block" /> Sin turno ese día</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-slate-100 border border-slate-200 inline-block" /> Sin horario asignado</span>
          <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-indigo-600 inline-block" /> Hoy</span>
        </div>

        {/* Month navigator */}
        <div className="flex items-center justify-between px-6 py-3">
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => subMonths(m, 1))}>
            <ChevronLeft className="w-4 h-4" />
          </Button>
          <h3 className="text-lg font-semibold text-slate-800 capitalize">
            {format(currentMonth, "MMMM yyyy", { locale: es })}
          </h3>
          <Button variant="outline" size="icon" onClick={() => setCurrentMonth(m => addMonths(m, 1))}>
            <ChevronRight className="w-4 h-4" />
          </Button>
        </div>

        {/* Calendar Grid */}
        <div className="px-6 pb-6">
          {/* Week headers */}
          <div className="grid grid-cols-7 mb-2">
            {weekDayLabels.map(d => (
              <div key={d} className="text-center text-xs font-semibold text-slate-500 py-1">{d}</div>
            ))}
          </div>

          {/* Days */}
          <div className="grid grid-cols-7 gap-1">
            {paddingDays.map((_, i) => (
              <div key={`pad-${i}`} />
            ))}
            {days.map(day => {
              const activeSchedules = getScheduleForDate(day, schedules);
              const hasAssignment = activeSchedules.length > 0;
              const today = isToday(day);
              const inMonth = isSameMonth(day, currentMonth);

              let cellBg = "bg-slate-50 border-slate-200"; // no schedule assigned
              if (hasAssignment) {
                // Check if there's actually a working slot that day
                const workingSlots = activeSchedules.filter(s => getDayScheduleInfo(day, s));
                if (workingSlots.length > 0) {
                  cellBg = "bg-indigo-50 border-indigo-200 hover:bg-indigo-100";
                } else {
                  cellBg = "bg-amber-50 border-amber-200 hover:bg-amber-100"; // assigned but no shift this day
                }
              } else {
                cellBg = "bg-slate-50 border-slate-200 hover:bg-slate-100";
              }

              if (today) cellBg = "bg-indigo-600 border-indigo-700 text-white";

              return (
                <button
                  key={day.toISOString()}
                  onClick={() => {
                    if (hasAssignment) {
                      onEdit(activeSchedules[0]);
                    } else {
                      onAssign(day);
                    }
                  }}
                  className={`relative min-h-[72px] rounded-lg border p-1.5 text-left transition-all ${cellBg} ${!inMonth ? "opacity-40" : ""}`}
                >
                  <div className={`text-xs font-bold mb-1 ${today ? "text-white" : "text-slate-700"}`}>
                    {format(day, "d")}
                  </div>

                  {hasAssignment && !today && (() => {
                    const workingSlots = activeSchedules.flatMap(s => {
                      const info = getDayScheduleInfo(day, s);
                      return info ? [{ schedule: s, info }] : [];
                    });
                    if (workingSlots.length > 0) {
                      return workingSlots.slice(0, 2).map(({ schedule, info }, idx) => (
                        <div key={idx} className="text-xs bg-indigo-600 text-white rounded px-1 py-0.5 mb-0.5 truncate leading-tight">
                          <Clock className="w-2.5 h-2.5 inline mr-0.5" />
                          {info.start}–{info.end}
                        </div>
                      ));
                    } else {
                      return (
                        <div className="text-xs text-amber-600 font-medium">Libre</div>
                      );
                    }
                  })()}

                  {!hasAssignment && !today && (
                    <div className="flex items-center justify-center h-8 opacity-40">
                      <Plus className="w-3 h-3 text-slate-400" />
                    </div>
                  )}

                  {today && (
                    <div className="text-xs text-indigo-100 font-medium">Hoy</div>
                  )}
                </button>
              );
            })}
          </div>
        </div>

        {/* Schedule list for this employee */}
        <div className="px-6 pb-6 border-t pt-4">
          <h4 className="text-sm font-semibold text-slate-700 mb-3">Horarios asignados a este empleado</h4>
          {schedules.length === 0 ? (
            <p className="text-sm text-slate-500 text-center py-4">No tiene horarios asignados</p>
          ) : (
            <div className="space-y-2">
              {schedules.map(s => {
                const todayStr = format(new Date(), "yyyy-MM-dd");
                const from = s.effective_from || "0000-01-01";
                const to = s.effective_to || "9999-12-31";
                const isVigente = from <= todayStr && to >= todayStr && s.is_active !== false;
                return (
                  <div key={s.id} className={`flex items-center justify-between px-3 py-2 rounded-lg border ${isVigente ? "bg-green-50 border-green-200" : "bg-slate-50 border-slate-200"}`}>
                    <div>
                      <p className="text-sm font-medium text-slate-800">{s.schedule_name}</p>
                      <p className="text-xs text-slate-500">
                        Lun–Vie: {s.monday_start || "--"} – {s.monday_end || "--"} ·
                        {s.effective_from ? ` Desde ${s.effective_from}` : ""}{s.effective_to ? ` hasta ${s.effective_to}` : " sin límite"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      {isVigente && <Badge className="bg-green-100 text-green-700 text-xs">Vigente</Badge>}
                      <Button size="sm" variant="outline" onClick={() => onEdit(s)} className="h-7 text-xs">
                        Editar
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          <Button onClick={() => onAssign(null)} className="mt-3 w-full bg-indigo-600 hover:bg-indigo-700" size="sm">
            <Plus className="w-4 h-4 mr-2" />
            Agregar nuevo horario
          </Button>
        </div>
      </div>
    </div>
  );
}