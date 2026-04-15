import React, { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Calendar, AlertCircle, Info } from "lucide-react";
import { format, subDays, parseISO } from "date-fns";
import { es } from "date-fns/locale";

export default function AttendancePeriodModal({ defaultDateFrom, defaultDateTo, onConfirm, onCancel, actionLabel = "Vista Previa" }) {
  const [dateFrom, setDateFrom] = useState(defaultDateFrom);
  const [dateTo, setDateTo] = useState(defaultDateTo);
  const [error, setError] = useState("");

  useEffect(() => {
    setDateFrom(defaultDateFrom);
    setDateTo(defaultDateTo);
    setError("");
  }, [defaultDateFrom, defaultDateTo]);

  const minDateFrom = format(subDays(parseISO(defaultDateFrom), 7), "yyyy-MM-dd");
  const minDateTo = format(subDays(parseISO(defaultDateTo), 7), "yyyy-MM-dd");

  const handleConfirm = () => {
    if (!dateFrom || !dateTo) {
      setError("Debes especificar ambas fechas.");
      return;
    }
    if (dateFrom > dateTo) {
      setError("La fecha de inicio no puede ser mayor que la fecha de fin.");
      return;
    }
    if (dateFrom < minDateFrom) {
      setError(`La fecha de inicio no puede ser más de 7 días antes del ${format(parseISO(defaultDateFrom), "dd/MM/yyyy")}.`);
      return;
    }
    if (dateTo < minDateTo) {
      setError(`La fecha de fin no puede ser más de 7 días antes del ${format(parseISO(defaultDateTo), "dd/MM/yyyy")}.`);
      return;
    }
    setError("");
    onConfirm({ dateFrom, dateTo });
  };

  const isModified = dateFrom !== defaultDateFrom || dateTo !== defaultDateTo;

  return (
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={onCancel}>
      <Card className="max-w-lg w-full shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-blue-50">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Calendar className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-900">Período de Cómputo de Asistencias</CardTitle>
              <p className="text-sm text-slate-500 mt-0.5">Confirma o ajusta el rango de fechas considerado</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-6 space-y-5">

          <div className="flex items-start gap-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <p className="text-sm text-blue-800">
              Se calcularán tardanzas, horas extras y faltas de los registros de asistencia comprendidos en este período.
              Puedes ajustar las fechas hasta <strong>7 días atrás</strong> de cada fecha por defecto.
            </p>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-1.5 block">Fecha de inicio</Label>
              <Input
                type="date"
                value={dateFrom}
                min={minDateFrom}
                max={defaultDateFrom}
                onChange={(e) => { setDateFrom(e.target.value); setError(""); }}
              />
              <p className="text-xs text-slate-400 mt-1">
                Por defecto: {format(parseISO(defaultDateFrom), "dd/MM/yyyy")}
              </p>
            </div>
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-1.5 block">Fecha de fin</Label>
              <Input
                type="date"
                value={dateTo}
                min={minDateTo}
                max={defaultDateTo}
                onChange={(e) => { setDateTo(e.target.value); setError(""); }}
              />
              <p className="text-xs text-slate-400 mt-1">
                Por defecto: {format(parseISO(defaultDateTo), "dd/MM/yyyy")}
              </p>
            </div>
          </div>

          {isModified && !error && (
            <div className="flex items-center gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
              <p className="text-xs text-amber-800">
                Período modificado: <strong>{format(parseISO(dateFrom), "dd MMM", { locale: es })} — {format(parseISO(dateTo), "dd MMM yyyy", { locale: es })}</strong>
              </p>
            </div>
          )}

          {!isModified && !error && (
            <div className="flex items-center gap-2 p-2.5 bg-green-50 border border-green-200 rounded-lg">
              <Calendar className="w-4 h-4 text-green-600 shrink-0" />
              <p className="text-xs text-green-800">
                Período por defecto: <strong>{format(parseISO(dateFrom), "dd MMM", { locale: es })} — {format(parseISO(dateTo), "dd MMM yyyy", { locale: es })}</strong>
              </p>
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertCircle className="w-4 h-4 text-red-600 shrink-0 mt-0.5" />
              <p className="text-sm text-red-700">{error}</p>
            </div>
          )}

          <div className="flex gap-3 pt-2">
            <Button variant="outline" className="flex-1" onClick={onCancel}>
              Cancelar
            </Button>
            <Button className="flex-1 bg-indigo-600 hover:bg-indigo-700" onClick={handleConfirm}>
              <Calendar className="w-4 h-4 mr-2" />
              Confirmar y {actionLabel}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}