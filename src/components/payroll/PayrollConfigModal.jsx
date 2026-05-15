import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Settings, X, Save, Info } from "lucide-react";
import { toast } from "sonner";

export default function PayrollConfigModal({ onClose }) {
  const queryClient = useQueryClient();

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["payrollConfig"],
    queryFn: () => base44.entities.PayrollConfig.filter({ config_type: "Quincenal", is_active: true }),
  });

  const existingConfig = configs[0] || null;

  const [percentage, setPercentage] = useState(40);
  const [cutoffDay, setCutoffDay] = useState(7);

  useEffect(() => {
    if (existingConfig) {
      setPercentage(existingConfig.quincenal_percentage ?? 40);
      setCutoffDay(existingConfig.quincenal_cutoff_day ?? 7);
    }
  }, [existingConfig]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const data = {
        config_type: "Quincenal",
        quincenal_percentage: parseFloat(percentage),
        quincenal_cutoff_day: parseInt(cutoffDay),
        is_active: true,
      };
      if (existingConfig?.id) {
        return base44.entities.PayrollConfig.update(existingConfig.id, data);
      } else {
        return base44.entities.PayrollConfig.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["payrollConfig"] });
      toast.success("Configuración guardada correctamente");
      onClose();
    },
    onError: () => toast.error("Error al guardar la configuración"),
  });

  return (
    <div
      className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-6 border-b">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-indigo-100 rounded-lg">
              <Settings className="w-5 h-5 text-indigo-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-slate-900">Configuración Planilla Quincenal</h2>
              <p className="text-sm text-slate-500">Parámetros de cálculo del adelanto quincenal</p>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-slate-500">Cargando configuración...</div>
        ) : (
          <div className="p-6 space-y-6">
            {/* Porcentaje */}
            <div>
              <Label className="text-sm font-semibold text-slate-700">
                Porcentaje del sueldo base para planilla quincenal
              </Label>
              <div className="flex items-center gap-3 mt-2">
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={percentage}
                  onChange={(e) => setPercentage(e.target.value)}
                  className="w-32"
                />
                <span className="text-slate-600 font-medium">%</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                El monto del adelanto será: sueldo base × {percentage}%. Actualmente: {percentage}% del sueldo.
              </p>
            </div>

            {/* Día de corte */}
            <div>
              <Label className="text-sm font-semibold text-slate-700">
                Día límite de ingreso para inclusión en planilla quincenal
              </Label>
              <div className="flex items-center gap-3 mt-2">
                <span className="text-slate-600 text-sm">Día</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={cutoffDay}
                  onChange={(e) => setCutoffDay(e.target.value)}
                  className="w-24"
                />
                <span className="text-slate-600 text-sm">de cada mes</span>
              </div>
              <p className="text-xs text-slate-500 mt-1 flex items-start gap-1">
                <Info className="w-3 h-3 mt-0.5 shrink-0" />
                Solo se incluirán en la planilla quincenal los trabajadores cuya fecha de ingreso sea
                hasta el día {cutoffDay} del mes en proceso.
              </p>
            </div>

            {/* Reglas informativas */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 text-sm text-amber-800 space-y-1">
              <p className="font-semibold mb-2">Reglas fijas de la planilla quincenal:</p>
              <p>• <strong>No</strong> se aplican descuentos por inasistencias ni tardanzas.</p>
              <p>• El monto es fijo: {percentage}% del sueldo base del contrato.</p>
              <p>• Solo incluye trabajadores ingresados hasta el día {cutoffDay} del mes.</p>
            </div>

            <div className="flex gap-3 pt-2">
              <Button variant="outline" className="flex-1" onClick={onClose}>
                Cancelar
              </Button>
              <Button
                className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
              >
                <Save className="w-4 h-4 mr-2" />
                {saveMutation.isPending ? "Guardando..." : "Guardar Configuración"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}