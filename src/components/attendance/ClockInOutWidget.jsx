import React, { useState, useEffect } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Clock, CheckCircle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function ClockInOutWidget({ employee, workSchedule, todayRecord, onClockAction }) {
  const [currentTime, setCurrentTime] = useState(new Date());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  const getTodaySchedule = () => {
    if (!workSchedule) return { start: "09:00", end: "18:00" };
    
    const dayOfWeek = format(currentTime, "EEEE", { locale: es }).toLowerCase();
    const dayMapping = {
      "lunes": { start: workSchedule.monday_start, end: workSchedule.monday_end },
      "martes": { start: workSchedule.tuesday_start, end: workSchedule.tuesday_end },
      "miércoles": { start: workSchedule.wednesday_start, end: workSchedule.wednesday_end },
      "jueves": { start: workSchedule.thursday_start, end: workSchedule.thursday_end },
      "viernes": { start: workSchedule.friday_start, end: workSchedule.friday_end },
      "sábado": { start: workSchedule.saturday_start, end: workSchedule.saturday_end },
      "domingo": { start: workSchedule.sunday_start, end: workSchedule.sunday_end },
    };
    
    return dayMapping[dayOfWeek] || { start: "09:00", end: "18:00" };
  };

  const calculateLateMinutes = (clockInTime, scheduledStart, tolerance) => {
    const [clockHour, clockMin] = clockInTime.split(":").map(Number);
    const [schedHour, schedMin] = scheduledStart.split(":").map(Number);
    
    const clockMinutes = clockHour * 60 + clockMin;
    const schedMinutes = schedHour * 60 + schedMin;
    
    const diff = clockMinutes - schedMinutes;
    return diff > tolerance ? diff - tolerance : 0;
  };

  const handleClockIn = async () => {
    setLoading(true);
    try {
      const currentTimeStr = format(currentTime, "HH:mm");
      const schedule = getTodaySchedule();
      const tolerance = workSchedule?.tolerance_minutes || 10;
      
      const lateMinutes = calculateLateMinutes(currentTimeStr, schedule.start, tolerance);
      const isLate = lateMinutes > 0;
      
      await onClockAction({
        employee_id: employee.id,
        date: format(currentTime, "yyyy-MM-dd"),
        clock_in: currentTimeStr,
        scheduled_start: schedule.start,
        scheduled_end: schedule.end,
        is_late: isLate,
        late_minutes: lateMinutes,
        status: "Incompleto",
      });
      
      if (isLate) {
        toast.warning(`Entrada registrada con ${lateMinutes} minutos de tardanza`);
      } else {
        toast.success("Entrada registrada correctamente");
      }
    } catch (error) {
      toast.error("Error al registrar entrada");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleClockOut = async () => {
    if (!todayRecord) {
      toast.error("No hay registro de entrada para hoy");
      return;
    }
    
    setLoading(true);
    try {
      const currentTimeStr = format(currentTime, "HH:mm");
      const [inHour, inMin] = todayRecord.clock_in.split(":").map(Number);
      const [outHour, outMin] = currentTimeStr.split(":").map(Number);
      
      const inMinutes = inHour * 60 + inMin;
      const outMinutes = outHour * 60 + outMin;
      const breakMinutes = workSchedule?.break_duration_minutes || 60;
      
      const totalMinutes = outMinutes - inMinutes - breakMinutes;
      const workedHours = totalMinutes / 60;
      
      await onClockAction({
        ...todayRecord,
        clock_out: currentTimeStr,
        worked_hours: workedHours,
        status: "Completo",
      }, true);
      
      toast.success(`Salida registrada. Horas trabajadas: ${workedHours.toFixed(2)}h`);
    } catch (error) {
      toast.error("Error al registrar salida");
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const schedule = getTodaySchedule();
  const hasSchedule = schedule.start && schedule.end;
  
  if (!hasSchedule) {
    return (
      <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-100 to-slate-200">
        <CardContent className="p-8 text-center">
          <AlertCircle className="w-12 h-12 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600">No hay horario asignado para hoy</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-xl bg-gradient-to-br from-indigo-600 to-purple-600 text-white">
      <CardContent className="p-8">
        <div className="text-center mb-6">
          <Clock className="w-12 h-12 mx-auto mb-4 opacity-90" />
          <div className="text-5xl font-bold mb-2">
            {format(currentTime, "HH:mm:ss")}
          </div>
          <p className="text-indigo-100 text-lg">
            {format(currentTime, "EEEE, dd 'de' MMMM", { locale: es })}
          </p>
        </div>

        <div className="bg-white/20 backdrop-blur-sm rounded-lg p-4 mb-6">
          <div className="flex justify-between text-sm">
            <div>
              <p className="text-indigo-100 mb-1">Entrada programada</p>
              <p className="text-white font-bold text-lg">{schedule.start}</p>
            </div>
            <div className="text-right">
              <p className="text-indigo-100 mb-1">Salida programada</p>
              <p className="text-white font-bold text-lg">{schedule.end}</p>
            </div>
          </div>
        </div>

        {todayRecord ? (
          <div className="space-y-4">
            <div className="bg-green-500/30 border border-green-300/50 rounded-lg p-4 text-center">
              <CheckCircle className="w-8 h-8 mx-auto mb-2" />
              <p className="font-semibold mb-1">Entrada registrada</p>
              <p className="text-2xl font-bold">{todayRecord.clock_in}</p>
              {todayRecord.is_late && (
                <p className="text-sm text-yellow-200 mt-2">
                  ⚠️ Tardanza: {todayRecord.late_minutes} minutos
                </p>
              )}
            </div>

            {!todayRecord.clock_out ? (
              <Button
                onClick={handleClockOut}
                disabled={loading}
                className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold py-6 text-lg"
              >
                {loading ? "Registrando..." : "🏁 Registrar Salida"}
              </Button>
            ) : (
              <div className="bg-blue-500/30 border border-blue-300/50 rounded-lg p-4 text-center">
                <CheckCircle className="w-8 h-8 mx-auto mb-2" />
                <p className="font-semibold mb-1">Salida registrada</p>
                <p className="text-2xl font-bold">{todayRecord.clock_out}</p>
                <p className="text-sm mt-2">
                  Horas trabajadas: {todayRecord.worked_hours?.toFixed(2)}h
                </p>
              </div>
            )}
          </div>
        ) : (
          <Button
            onClick={handleClockIn}
            disabled={loading}
            className="w-full bg-white text-indigo-600 hover:bg-indigo-50 font-bold py-6 text-lg"
          >
            {loading ? "Registrando..." : "🚀 Registrar Entrada"}
          </Button>
        )}

        {workSchedule && (
          <p className="text-center text-indigo-100 text-xs mt-4">
            Tolerancia: {workSchedule.tolerance_minutes} minutos
          </p>
        )}
      </CardContent>
    </Card>
  );
}