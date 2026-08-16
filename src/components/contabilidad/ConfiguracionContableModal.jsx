import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Settings, Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";
import ConfiguracionContableTable from "./ConfiguracionContableTable";
import { getAllDefaults } from "@/lib/empresaContable";

export default function ConfiguracionContableModal({ open, onClose, empresaActiva }) {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState("tipo_planilla");
  const [loadingDefaults, setLoadingDefaults] = useState(false);

  const { data: configs = [], isLoading: loadingConfigs } = useQuery({
    queryKey: ["configuracionContable", empresaActiva?.codigo],
    queryFn: () =>
      base44.entities.ConfiguracionContable.filter(
        { empresa_codigo: empresaActiva?.codigo },
        "tipo_mapeo"
      ),
    enabled: open && !!empresaActiva?.codigo,
  });

  const { data: cuentas = [] } = useQuery({
    queryKey: ["cuentas_contables"],
    queryFn: () => base44.entities.CuentaContable.list("cuenta"),
    enabled: open,
  });

  const { data: subdiarios = [] } = useQuery({
    queryKey: ["subdiarios_catalog"],
    queryFn: () => base44.entities.Subdiario.list("codigo"),
    enabled: open,
  });

  const handleLoadDefaults = async () => {
    if (!empresaActiva?.codigo) return;
    if (
      configs.length > 0 &&
      !confirm(
        `Ya existen ${configs.length} mapeos para ${empresaActiva.nombre}. ¿Cargar valores por defecto de todos modos? Esto duplicará los mapeos existentes.`
      )
    )
      return;
    setLoadingDefaults(true);
    try {
      const allDefaults = getAllDefaults().map((d) => ({
        ...d,
        empresa_codigo: empresaActiva.codigo,
        activo: true,
      }));
      await base44.entities.ConfiguracionContable.bulkCreate(allDefaults);
      queryClient.invalidateQueries(["configuracionContable"]);
      toast.success(`${allDefaults.length} mapeos cargados para ${empresaActiva.nombre}`);
    } catch (error) {
      toast.error("Error al cargar valores por defecto");
      console.error(error);
    } finally {
      setLoadingDefaults(false);
    }
  };

  if (!open) return null;

  const configCount = configs.length;

  return (
    <div
      className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-2xl max-w-6xl w-full max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b">
          <div>
            <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
              <Settings className="w-5 h-5 text-indigo-600" />
              Configuración Contable
            </h2>
            <p className="text-sm text-slate-500 mt-1">
              Mapeo de cuentas para{" "}
              <span className="font-semibold text-slate-700">
                {empresaActiva?.codigo} — {empresaActiva?.nombre}
              </span>
              {empresaActiva?.es_prueba ? (
                <Badge className="ml-2 bg-amber-100 text-amber-700 border-amber-200">Empresa de Prueba</Badge>
              ) : (
                <Badge className="ml-2 bg-green-100 text-green-700 border-green-200">Empresa Final</Badge>
              )}
            </p>
          </div>
          <div className="flex items-center gap-2">
            {configCount === 0 && (
              <Button
                variant="outline"
                onClick={handleLoadDefaults}
                disabled={loadingDefaults}
              >
                {loadingDefaults ? (
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                ) : (
                  <Upload className="w-4 h-4 mr-2" />
                )}
                Cargar valores por defecto
              </Button>
            )}
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-700 text-xl font-bold w-8 h-8 flex items-center justify-center"
            >
              ✕
            </button>
          </div>
        </div>

        {/* Tabs */}
        <div className="px-6 pt-4 flex-1 overflow-hidden flex flex-col">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
            <TabsList className="mb-4">
              <TabsTrigger value="tipo_planilla">Tipos de Planilla</TabsTrigger>
              <TabsTrigger value="origen_asiento">Orígenes de Asiento</TabsTrigger>
              <TabsTrigger value="concepto_planilla">Conceptos de Planilla</TabsTrigger>
            </TabsList>
            <div className="flex-1 overflow-auto">
              <TabsContent value="tipo_planilla" className="mt-0">
                <ConfiguracionContableTable
                  empresaCodigo={empresaActiva?.codigo}
                  tipoMapeo="tipo_planilla"
                  cuentas={cuentas}
                  subdiarios={subdiarios}
                />
              </TabsContent>
              <TabsContent value="origen_asiento" className="mt-0">
                <ConfiguracionContableTable
                  empresaCodigo={empresaActiva?.codigo}
                  tipoMapeo="origen_asiento"
                  cuentas={cuentas}
                  subdiarios={subdiarios}
                />
              </TabsContent>
              <TabsContent value="concepto_planilla" className="mt-0">
                <ConfiguracionContableTable
                  empresaCodigo={empresaActiva?.codigo}
                  tipoMapeo="concepto_planilla"
                  cuentas={cuentas}
                  subdiarios={subdiarios}
                />
              </TabsContent>
            </div>
          </Tabs>
        </div>

        {/* Footer */}
        <div className="p-4 border-t flex items-center justify-between">
          <p className="text-xs text-slate-500">
            Los cambios se guardan automáticamente al editar cada campo. Los asientos ya generados no se
            modifican retroactivamente.
          </p>
          <Button onClick={onClose}>Cerrar</Button>
        </div>
      </div>
    </div>
  );
}