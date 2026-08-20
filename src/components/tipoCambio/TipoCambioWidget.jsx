import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Settings, Save, X, TrendingUp, AlertCircle, Check,
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

function todayInPeru() {
  const now = new Date();
  const peruMs = now.getTime() + now.getTimezoneOffset() * 60000 + (-5 * 60 * 60000);
  const d = new Date(peruMs);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export default function TipoCambioWidget({ employee }) {
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCompra, setManualCompra] = useState("");
  const [manualVenta, setManualVenta] = useState("");
  const [configUrl, setConfigUrl] = useState("");

  const isAdmin = employee?.role === "admin" || employee?.role === "super_admin";
  const today = todayInPeru();

  // Query: tipo de cambio de hoy
  const { data: tipoCambio, isLoading } = useQuery({
    queryKey: ["tipoCambio", today],
    queryFn: async () => {
      const results = await base44.entities.TipoCambio.filter({ fecha: today, estado: true });
      return results?.[0] || null;
    },
  });

  // Query: configuración activa
  const { data: config } = useQuery({
    queryKey: ["tipoCambioConfig"],
    queryFn: async () => {
      const results = await base44.entities.TipoCambioConfig.filter({ is_active: true });
      return results?.[0] || null;
    },
  });

  useEffect(() => {
    if (config?.api_url) setConfigUrl(config.api_url);
  }, [config]);

  // Mutation: obtener automáticamente (llama al backend function)
  const fetchAutoMutation = useMutation({
    mutationFn: async () => {
      return await base44.functions.invoke("obtenerTipoCambioDiario", {});
    },
    onSuccess: (res) => {
      const data = res.data;
      if (data?.success) {
        toast.success(data.already_exists
          ? "El tipo de cambio de hoy ya estaba registrado."
          : "Tipo de cambio obtenido automáticamente.");
        queryClient.invalidateQueries(["tipoCambio", today]);
      } else {
        toast.error(data?.error || "No se pudo obtener el tipo de cambio.");
      }
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || err?.message || "Error al consultar el API.";
      toast.error(msg);
    },
  });

  // Mutation: guardar manual
  const saveManualMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.TipoCambio.create(data);
    },
    onSuccess: () => {
      toast.success("Tipo de cambio registrado manualmente.");
      setShowManual(false);
      setManualCompra("");
      setManualVenta("");
      queryClient.invalidateQueries(["tipoCambio", today]);
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || "Error al guardar el tipo de cambio.";
      toast.error(msg);
    },
  });

  // Mutation: guardar configuración
  const saveConfigMutation = useMutation({
    mutationFn: async (url) => {
      if (config?.id) {
        return await base44.entities.TipoCambioConfig.update(config.id, { api_url: url });
      }
      return await base44.entities.TipoCambioConfig.create({ api_url: url, is_active: true });
    },
    onSuccess: () => {
      toast.success("Configuración de API guardada.");
      setShowConfig(false);
      queryClient.invalidateQueries(["tipoCambioConfig"]);
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || "Error al guardar la configuración.";
      toast.error(msg);
    },
  });

  const handleSaveManual = () => {
    const compra = Number(manualCompra);
    const venta = Number(manualVenta);
    if (!compra || !venta || isNaN(compra) || isNaN(venta)) {
      toast.error("Ingrese valores válidos para compra y venta.");
      return;
    }
    saveManualMutation.mutate({
      fecha: today,
      valor_compra: compra,
      valor_venta: venta,
      estado: true,
      fuente: "manual",
      registrado_por: employee?.work_email || "",
    });
  };

  const handleSaveConfig = () => {
    if (!configUrl.trim()) {
      toast.error("Ingrese una URL válida.");
      return;
    }
    saveConfigMutation.mutate(configUrl.trim());
  };

  const hasRate = !!tipoCambio;
  const canManualEntry = isAdmin && !hasRate;

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-slate-50/50 pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-base font-bold flex items-center gap-2">
            <TrendingUp className="w-4 h-4 text-indigo-600" />
            Tipo de Cambio
          </CardTitle>
          {isAdmin && (
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7"
              onClick={() => setShowConfig(!showConfig)}
              title="Configurar API"
            >
              <Settings className="w-4 h-4" />
            </Button>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-1">
          {format(new Date(today + "T00:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
        </p>
      </CardHeader>

      <CardContent className="p-4 space-y-3">
        {/* Configuración del API */}
        {showConfig && isAdmin && (
          <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg space-y-2">
            <Label className="text-xs font-semibold text-amber-800">
              URL del API de Tipo de Cambio
            </Label>
            <Input
              value={configUrl}
              onChange={(e) => setConfigUrl(e.target.value)}
              placeholder="https://api.apis.net.pe/v1/tipo-cambio-sunat"
              className="text-sm h-8"
            />
            <div className="flex gap-2">
              <Button
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={handleSaveConfig}
                disabled={saveConfigMutation.isPending}
              >
                <Save className="w-3 h-3 mr-1" />
                {saveConfigMutation.isPending ? "Guardando..." : "Guardar"}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-7 text-xs"
                onClick={() => { setShowConfig(false); setConfigUrl(config?.api_url || ""); }}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </div>
        )}

        {/* Estado del tipo de cambio */}
        {isLoading ? (
          <div className="flex items-center justify-center py-4">
            <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : hasRate ? (
          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-green-700 font-medium mb-1">Compra</p>
                <p className="text-lg font-bold text-green-800">
                  S/ {Number(tipoCambio.valor_compra).toFixed(3)}
                </p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-700 font-medium mb-1">Venta</p>
                <p className="text-lg font-bold text-blue-800">
                  S/ {Number(tipoCambio.valor_venta).toFixed(3)}
                </p>
              </div>
            </div>
            <div className="flex items-center justify-center gap-2">
              <Badge className={
                tipoCambio.fuente === "auto"
                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                  : "bg-amber-100 text-amber-700 border-amber-200"
              }>
                {tipoCambio.fuente === "auto" ? (
                  <><Check className="w-3 h-3 mr-1" /> Automático</>
                ) : (
                  <><AlertCircle className="w-3 h-3 mr-1" /> Manual</>
                )}
              </Badge>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-center">
              <AlertCircle className="w-5 h-5 text-amber-500 mx-auto mb-1" />
              <p className="text-sm text-amber-800 font-medium">
                No hay tipo de cambio registrado para hoy.
              </p>
              <p className="text-xs text-amber-600 mt-1">
                {config?.api_url
                  ? "Intenta obtenerlo automáticamente o regístralo manualmente."
                  : "Configura la URL del API para obtenerlo automáticamente."}
              </p>
            </div>

            {isAdmin && config?.api_url && (
              <Button
                className="w-full h-8 text-xs"
                onClick={() => fetchAutoMutation.mutate()}
                disabled={fetchAutoMutation.isPending}
              >
                <RefreshCw className={`w-3 h-3 mr-1 ${fetchAutoMutation.isPending ? "animate-spin" : ""}`} />
                {fetchAutoMutation.isPending ? "Consultando..." : "Obtener automáticamente"}
              </Button>
            )}

            {canManualEntry && (
              <>
                {!showManual ? (
                  <Button
                    variant="outline"
                    className="w-full h-8 text-xs"
                    onClick={() => setShowManual(true)}
                  >
                    Registrar manualmente
                  </Button>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <Label className="text-xs text-slate-600">Compra</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={manualCompra}
                          onChange={(e) => setManualCompra(e.target.value)}
                          placeholder="3.750"
                          className="text-sm h-8"
                        />
                      </div>
                      <div>
                        <Label className="text-xs text-slate-600">Venta</Label>
                        <Input
                          type="number"
                          step="0.001"
                          value={manualVenta}
                          onChange={(e) => setManualVenta(e.target.value)}
                          placeholder="3.760"
                          className="text-sm h-8"
                        />
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        className="h-7 text-xs flex-1"
                        onClick={handleSaveManual}
                        disabled={saveManualMutation.isPending}
                      >
                        <Save className="w-3 h-3 mr-1" />
                        {saveManualMutation.isPending ? "Guardando..." : "Guardar"}
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => { setShowManual(false); setManualCompra(""); setManualVenta(""); }}
                      >
                        <X className="w-3 h-3" />
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}