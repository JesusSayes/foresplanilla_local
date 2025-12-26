import React from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const DAYS = [
  { key: "monday", label: "Lunes" },
  { key: "tuesday", label: "Martes" },
  { key: "wednesday", label: "Miércoles" },
  { key: "thursday", label: "Jueves" },
  { key: "friday", label: "Viernes" },
  { key: "saturday", label: "Sábado" },
  { key: "sunday", label: "Domingo" }
];

export default function WeeklyScheduleEditor({ schedule, onChange }) {
  const handleDayChange = (dayKey, field, value) => {
    const newSchedule = {
      ...schedule,
      [dayKey]: {
        ...schedule[dayKey],
        [field]: value
      }
    };
    onChange(newSchedule);
  };

  return (
    <div className="space-y-3">
      {DAYS.map(day => {
        const dayData = schedule[day.key] || { start: "", end: "", enabled: false };
        
        return (
          <div key={day.key} className="flex items-center gap-4 p-3 bg-slate-50 rounded-lg">
            <div className="w-32">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={dayData.enabled}
                  onChange={(e) => handleDayChange(day.key, "enabled", e.target.checked)}
                  className="w-4 h-4 rounded"
                />
                <span className="font-semibold text-sm text-slate-900">{day.label}</span>
              </label>
            </div>
            
            <div className="flex items-center gap-3 flex-1">
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Entrada</Label>
                <Input
                  type="time"
                  value={dayData.start}
                  onChange={(e) => handleDayChange(day.key, "start", e.target.value)}
                  disabled={!dayData.enabled}
                  className="h-9"
                />
              </div>
              
              <div className="flex-1">
                <Label className="text-xs text-slate-600">Salida</Label>
                <Input
                  type="time"
                  value={dayData.end}
                  onChange={(e) => handleDayChange(day.key, "end", e.target.value)}
                  disabled={!dayData.enabled}
                  className="h-9"
                />
              </div>

              {dayData.enabled && dayData.start && dayData.end && (
                <div className="text-sm text-slate-600 min-w-16 text-right">
                  {(() => {
                    const [startH, startM] = dayData.start.split(":").map(Number);
                    const [endH, endM] = dayData.end.split(":").map(Number);
                    const totalMinutes = (endH * 60 + endM) - (startH * 60 + startM);
                    const hours = (totalMinutes / 60).toFixed(1);
                    return `${hours}h`;
                  })()}
                </div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}