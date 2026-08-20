import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  RefreshCw, Settings, Save, X, TrendingUp, AlertCircle, Check, CalendarDays,
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

export default function TipoCambioManagement() {
  const queryClient = useQueryClient();
  const [showConfig, setShowConfig] = useState(false);
  const [showManual, setShowManual] = useState(false);
  const [manualCompra, setManualCompra] = useState("");
  const [manualVenta, setManualVenta] = useState("");
  const [manualFecha, setManualFecha] = useState("");
  const [configUrl, setConfigUrl] = useState("");
  const [currentUser, setCurrentUser] = useState(null);

  const today = todayInPeru();

  useEffect(() => {
    base44.auth.me().then(setCurrentUser).catch(() => {});
    setManualFecha(today);
  }, [today]);

  const isAdmin = currentUser?.role === "admin";

  // Query: todos los registros (historial)
  const { data: historial, isLoading } = useQuery({
    queryKey: ["tipoCambioHistorial"],
    queryFn: async () => {
      const results = await base44.entities.TipoCambio.list("-fecha", 500);
      return results || [];
    },
  });

  // Query: tipo de cambio de hoy
  const { data: tipoCambioHoy } = useQuery({
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

  // Mutation: obtener automáticamente
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
        queryClient.invalidateQueries(["tipoCambioHistorial"]);
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
      // Si ya existe para esa fecha, actualizar; si no, crear
      const existing = await base44.entities.TipoCambio.filter({ fecha: data.fecha });
      if (existing && existing.length > 0) {
        return await base44.entities.TipoCambio.update(existing[0].id, {
          valor_compra: data.valor_compra,
          valor_venta: data.valor_venta,
          fuente: "manual",
          registrado_por: currentUser?.email || "",
        });
      }
      return await base44.entities.TipoCambio.create(data);
    },
    onSuccess: () => {
      toast.success("Tipo de cambio registrado manualmente.");
      setShowManual(false);
      setManualCompra("");
      setManualVenta("");
      queryClient.invalidateQueries(["tipoCambio", today]);
      queryClient.invalidateQueries(["tipoCambioHistorial"]);
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
    if (!manualFecha) {
      toast.error("Seleccione una fecha.");
      return;
    }
    saveManualMutation.mutate({
      fecha: manualFecha,
      valor_compra: compra,
      valor_venta: venta,
      estado: true,
      fuente: "manual",
      registrado_por: currentUser?.email || "",
    });
  };

  const handleSaveConfig = () => {
    if (!configUrl.trim()) {
      toast.error("Ingrese una URL válida.");
      return;
    }
    saveConfigMutation.mutate(configUrl.trim());
  };

  const hasRateToday = !!tipoCambioHoy;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <TrendingUp className="w-8 h-8 text-indigo-600" />
              Tipo de Cambio Diario
            </h1>
            <p className="text-slate-600 mt-1">
              Gestión del tipo de cambio USD/PEN — histórico y configuración del API.
            </p>
          </div>

          {/* Acciones superiores derecha */}
          <div className="flex items-center gap-2">
            {isAdmin && config?.api_url && (
              <Button
                onClick={() => fetchAutoMutation.mutate()}
                disabled={fetchAutoMutation.isPending}
              >
                <RefreshCw className={`w-4 h-4 mr-2 ${fetchAutoMutation.isPending ? "animate-spin" : ""}`} />
                {fetchAutoMutation.isPending ? "Consultando..." : "Obtener hoy automáticamente"}
              </Button>
            )}
            {isAdmin && (
              <Button
                variant="outline"
                onClick={() => setShowConfig(!showConfig)}
              >
                <Settings className="w-4 h-4 mr-2" />
                Configurar API
              </Button>
            )}
          </div>
        </div>

        {/* Panel de configuración del API (superior derecha, expandible) */}
        {showConfig && isAdmin && (
          <Card className="mb-6 border-amber-200">
            <CardHeader className="border-b bg-amber-50/50 pb-3">
              <CardTitle className="text-base font-bold flex items-center gap-2 text-amber-800">
                <Settings className="w-4 h-4" />
                Configuración del API de Tipo de Cambio
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4 space-y-3">
              <div>
                <Label className="text-sm font-semibold text-slate-700">
                  URL del API
                </Label>
                <Input
                  value={configUrl}
                  onChange={(e) => setConfigUrl(e.target.value)}
                  placeholder="https://api.apis.net.pe/v1/tipo-cambio-sunat"
                  className="mt-1.5"
                />
                <p className="text-xs text-slate-500 mt-1">
                  El API debe retornar JSON con los campos <code>compra</code> y <code>venta</code>.
                </p>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={handleSaveConfig}
                  disabled={saveConfigMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saveConfigMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
                <Button
                  variant="outline"
                  onClick={() => { setShowConfig(false); setConfigUrl(config?.api_url || ""); }}
                >
                  <X className="w-4 h-4 mr-2" />
                  Cancelar
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Columna izquierda: tipo de cambio de hoy + registro manual */}
          <div className="lg:col-span-1 space-y-4">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50 pb-3">
                <CardTitle className="text-base font-bold flex items-center gap-2">
                  <CalendarDays className="w-4 h-4 text-indigo-600" />
                  Tipo de Cambio de Hoy
                </CardTitle>
                <p className="text-xs text-slate-500 mt-1">
                  {format(new Date(today + "T00:00:00"), "EEEE d 'de' MMMM, yyyy", { locale: es })}
                </p>
              </CardHeader>
              <CardContent className="p-4">
                {isLoading ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="w-6 h-6 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : hasRateToday ? (
                  <div className="space-y-3">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-green-700 font-medium mb-1">Compra</p>
                        <p className="text-xl font-bold text-green-800">
                          S/ {Number(tipoCambioHoy.valor_compra).toFixed(3)}
                        </p>
                      </div>
                      <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                        <p className="text-xs text-blue-700 font-medium mb-1">Venta</p>
                        <p className="text-xl font-bold text-blue-800">
                          S/ {Number(tipoCambioHoy.valor_venta).toFixed(3)}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-center gap-2">
                      <Badge className={
                        tipoCambioHoy.fuente === "auto"
                          ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                          : "bg-amber-100 text-amber-700 border-amber-200"
                      }>
                        {tipoCambioHoy.fuente === "auto" ? (
                          <><Check className="w-3 h-3 mr-1" /> Automático</>
                        ) : (
                          <><AlertCircle className="w-3 h-3 mr-1" /> Manual</>
                        )}
                      </Badge>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => {
                          setManualFecha(today);
                          setManualCompra(String(tipoCambioHoy.valor_compra));
                          setManualVenta(String(tipoCambioHoy.valor_venta));
                          setShowManual(true);
                        }}
                      >
                        Editar valor
                      </Button>
                    )}
                  </div>
                ) : (
                  <div className="space-y-3">
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-center">
                      <AlertCircle className="w-6 h-6 text-amber-500 mx-auto mb-2" />
                      <p className="text-sm text-amber-800 font-medium">
                        No hay tipo de cambio registrado para hoy.
                      </p>
                      <p className="text-xs text-amber-600 mt-1">
                        {config?.api_url
                          ? "Obténgalo automáticamente o regístrelo manualmente."
                          : "Configure la URL del API para obtenerlo automáticamente."}
                      </p>
                    </div>
                    {isAdmin && (
                      <Button
                        variant="outline"
                        className="w-full"
                        onClick={() => { setManualFecha(today); setShowManual(true); }}
                      >
                        Registrar manualmente
                      </Button>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Formulario de registro manual */}
            {showManual && isAdmin && (
              <Card className="border-0 shadow-lg">
                <CardHeader className="border-b bg-slate-50/50 pb-3">
                  <CardTitle className="text-base font-bold">
                    Registro Manual
                  </CardTitle>
                </CardHeader>
                <CardContent className="p-4 space-y-3">
                  <div>
                    <Label className="text-sm text-slate-600">Fecha</Label>
                    <Input
                      type="date"
                      value={manualFecha}
                      onChange={(e) => setManualFecha(e.target.value)}
                      className="mt-1.5"
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label className="text-sm text-slate-600">Compra</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={manualCompra}
                        onChange={(e) => setManualCompra(e.target.value)}
                        placeholder="3.750"
                        className="mt-1.5"
                      />
                    </div>
                    <div>
                      <Label className="text-sm text-slate-600">Venta</Label>
                      <Input
                        type="number"
                        step="0.001"
                        value={manualVenta}
                        onChange={(e) => setManualVenta(e.target.value)}
                        placeholder="3.760"
                        className="mt-1.5"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={handleSaveManual}
                      disabled={saveManualMutation.isPending}
                      className="flex-1"
                    >
                      <Save className="w-4 h-4 mr-2" />
                      {saveManualMutation.isPending ? "Guardando..." : "Guardar"}
                    </Button>
                    <Button
                      variant="outline"
                      onClick={() => { setShowManual(false); setManualCompra(""); setManualVenta(""); }}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>

          {/* Columna central + derecha: histórico completo */}
          <div className="lg:col-span-2">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-lg font-bold flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-indigo-600" />
                  Histórico de Tipos de Cambio
                </CardTitle>
                <p className="text-sm text-slate-500">
                  {historial?.length || 0} registro(s) en total
                </p>
              </CardHeader>
              <CardContent className="p-0">
                {isLoading ? (
                  <div className="flex items-center justify-center py-12">
                    <div className="w-8 h-8 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />
                  </div>
                ) : historial && historial.length > 0 ? (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-50 border-b border-slate-200">
                        <tr>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600">Fecha</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Compra</th>
                          <th className="text-right px-4 py-3 font-semibold text-slate-600">Venta</th>
                          <th className="text-center px-4 py-3 font-semibold text-slate-600">Origen</th>
                          <th className="text-left px-4 py-3 font-semibold text-slate-600 hidden md:table-cell">Registrado por</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {historial.map((reg) => (
                          <tr key={reg.id} className="hover:bg-slate-50 transition-colors">
                            <td className="px-4 py-3 text-slate-900 font-medium">
                              {format(new Date(reg.fecha + "T00:00:00"), "dd/MM/yyyy", { locale: es })}
                            </td>
                            <td className="px-4 py-3 text-right text-green-700 font-semibold">
                              S/ {Number(reg.valor_compra).toFixed(3)}
                            </td>
                            <td className="px-4 py-3 text-right text-blue-700 font-semibold">
                              S/ {Number(reg.valor_venta).toFixed(3)}
                            </td>
                            <td className="px-4 py-3 text-center">
                              <Badge className={
                                reg.fuente === "auto"
                                  ? "bg-emerald-100 text-emerald-700 border-emerald-200"
                                  : "bg-amber-100 text-amber-700 border-amber-200"
                              }>
                                {reg.fuente === "auto" ? "Automático" : "Manual"}
                              </Badge>
                            </td>
                            <td className="px-4 py-3 text-slate-500 text-xs hidden md:table-cell">
                              {reg.registrado_por || "—"}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <AlertCircle className="w-12 h-12 text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">No hay registros de tipo de cambio</p>
                    <p className="text-sm text-slate-400 mt-1">
                      Los registros aparecerán aquí a medida que se obtengan día a día.
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </div>
  );
}