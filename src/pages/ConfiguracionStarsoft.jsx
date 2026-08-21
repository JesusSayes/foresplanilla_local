import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { starsoftAPI } from "@/api/localClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Settings, ShieldCheck, Loader2, CheckCircle, XCircle, KeyRound,
  Building2, Link2, Send, AlertCircle, Save, BookOpen
} from "lucide-react";
import { toast } from "sonner";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import CuentasPlanillaSection from "@/components/starsoft/CuentasPlanillaSection";

const PROD_DEFAULT = "003";
const PRUEBA_DEFAULT = "001";

export default function ConfiguracionStarsoft() {
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    cod_empresa: "003",
    cod_sistema: "01",
    auth_url: "",
    api_url: "",
    client_id: "",
    client_secret: "",
    notes: "",
  });
  // Configuración de cuentas contables por tipo de planilla (lista flexible).
  // Cada entrada: { tipo_planilla, cuenta, debe_haber }
  const [cuentasPorPlanilla, setCuentasPorPlanilla] = useState([]);
  const [showSecret, setShowSecret] = useState(false);
  const [configId, setConfigId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState(null);
  const [empresaMode, setEmpresaMode] = useState("produccion"); // "produccion" | "prueba"

  const { data: config } = useQuery({
    queryKey: ["starsoftConfig"],
    queryFn: () => entitiesAPI.StarsoftConfig.filter({ is_active: true }),
  });

  // Cuentas contables disponibles (Datos Maestros) para configurar debe/haber por planilla.
  // Se cargan todas las cuentas excepto las explícitamente inactivas (is_active=false),
  // ya que registros históricos tienen is_active=null.
  const { data: cuentasContables = [] } = useQuery({
    queryKey: ["cuentasContablesStarsoft"],
    queryFn: async () => {
      const all = await base44.entities.CuentaContable.list();
      return (all || []).filter((c) => c.is_active !== false);
    },
  });

  useEffect(() => {
    if (config && config.length > 0) {
      const c = config[0];
      setConfigId(c.id);
      setEmpresaMode(String(c.cod_empresa || "003").padStart(3, "0") === PROD_DEFAULT ? "produccion" : "prueba");
      setForm({
        cod_empresa: c.cod_empresa || "003",
        cod_sistema: c.cod_sistema || "01",
        auth_url: c.auth_url || "",
        api_url: c.api_url || "",
        client_id: c.client_id || "",
        client_secret: c.client_secret || "",
        notes: c.notes || "",
      });
      // Normalizar cuentas_por_planilla al formato actual: array de { tipo_planilla, cuenta, debe_haber }
      // Migrar valores legacy "regular"/"snp" a los nuevos tipos de contrato.
      const LEGACY_TIPO_MAP = { regular: "Plazo Fijo", snp: "SNP" };
      const normalizeTipo = (t) => LEGACY_TIPO_MAP[t] || t;
      if (Array.isArray(c.cuentas_por_planilla)) {
        const normalizadas = [];
        c.cuentas_por_planilla.forEach(e => {
          if (e.tipo_planilla && e.cuenta && e.debe_haber) {
            // Formato actual
            normalizadas.push({ tipo_planilla: normalizeTipo(e.tipo_planilla), cuenta: e.cuenta, debe_haber: e.debe_haber });
          } else if (e.tipo_planilla && e.cuenta_debe !== undefined && e.cuenta_haber !== undefined) {
            // Formato anterior {tipo_planilla, cuenta_debe, cuenta_haber} -> dos registros
            if (e.cuenta_debe) normalizadas.push({ tipo_planilla: normalizeTipo(e.tipo_planilla), cuenta: e.cuenta_debe, debe_haber: "D" });
            if (e.cuenta_haber) normalizadas.push({ tipo_planilla: normalizeTipo(e.tipo_planilla), cuenta: e.cuenta_haber, debe_haber: "H" });
          } else if (e.tipo_planilla && e.cuenta && e.debe_haber && e.uso) {
            // Formato intermedio {tipo_planilla, cuenta, debe_haber, uso} -> conservar sin uso
            normalizadas.push({ tipo_planilla: normalizeTipo(e.tipo_planilla), cuenta: e.cuenta, debe_haber: e.debe_haber });
          }
        });
        setCuentasPorPlanilla(normalizadas);
      } else if (c.cuentas_por_planilla && typeof c.cuentas_por_planilla === "object") {
        // Migración desde estructura legacy { regular: {...}, snp: {...} }
        // "regular" → "Plazo Fijo" y "snp" → "SNP" (nuevos valores por tipo de contrato)
        const LEGACY_MAP = { regular: "Plazo Fijo", snp: "SNP" };
        const migradas = [];
        ["regular", "snp"].forEach(tipo => {
          const block = c.cuentas_por_planilla[tipo];
          if (block) {
            if (block.cuenta_debe) migradas.push({ tipo_planilla: LEGACY_MAP[tipo], cuenta: block.cuenta_debe, debe_haber: "D" });
            if (block.cuenta_haber_neto) migradas.push({ tipo_planilla: LEGACY_MAP[tipo], cuenta: block.cuenta_haber_neto, debe_haber: "H" });
          }
        });
        setCuentasPorPlanilla(migradas);
      }
      if (c.last_test_status) {
        setTestResult({
          status: c.last_test_status,
          message: c.last_test_message,
          date: c.last_test_date,
        });
      }
    }
  }, [config]);

  const saveMutation = useMutation({
    mutationFn: async () => {
      const payload = { ...form, is_active: true, cuentas_por_planilla: cuentasPorPlanilla };
      if (configId) {
        return entitiesAPI.StarsoftConfig.update(configId, payload);
      }
      const created = await entitiesAPI.StarsoftConfig.create(payload);
      setConfigId(created.id);
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["starsoftConfig"]);
      toast.success("Configuración de Starsoft guardada");
    },
    onError: (err) => toast.error(`Error al guardar: ${err.message}`),
  });

  const handleProbarConexion = async () => {
    if (!form.auth_url || !form.api_url) {
      toast.error("Debe ingresar las URLs de autenticación y envío antes de probar");
      return;
    }
    // Guardar antes de probar
    await saveMutation.mutateAsync();
    setTesting(true);
    setTestResult(null);
    try {
      const data = await starsoftAPI.testConnection();
      if (data?.success) {
        setTestResult({ status: "success", message: data.message, date: new Date().toISOString() });
        toast.success("Conexión exitosa con Starsoft");
      } else {
        const msg = data?.error || "Error desconocido";
        setTestResult({ status: "error", message: msg, date: new Date().toISOString() });
        toast.error(`Error de conexión: ${msg}`);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err.message;
      setTestResult({ status: "error", message: msg, date: new Date().toISOString() });
      toast.error(`Error de conexión: ${msg}`);
    } finally {
      setTesting(false);
      queryClient.invalidateQueries(["starsoftConfig"]);
    }
  };

  const esProd = empresaMode === "produccion";

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2 flex items-center gap-3">
            <Settings className="w-9 h-9 text-indigo-600" />
            Configuración Starsoft
          </h1>
          <p className="text-slate-600 text-lg">
            Configure las credenciales y empresa destino para la migración de asientos contables vía API
          </p>
        </div>

        <Tabs defaultValue="general" className="mb-6">
          <TabsList className="grid grid-cols-2 w-full max-w-md mb-4">
            <TabsTrigger value="general" className="gap-1.5">
              <Building2 className="w-3.5 h-3.5" /> Empresa y Conexión
            </TabsTrigger>
            <TabsTrigger value="cuentas" className="gap-1.5">
              <BookOpen className="w-3.5 h-3.5" /> Cuentas por Planilla
            </TabsTrigger>
          </TabsList>
          <TabsContent value="general">
        {/* Credenciales de API */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <KeyRound className="w-4 h-4 text-indigo-600" />
              Credenciales de API
            </CardTitle>
            <CardDescription>
              ClientID y ClientSecret generados en Starsoft para el uso de las APIs. Se almacenan en la configuración con acceso restringido a administradores.
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-sm font-semibold text-slate-700">ClientID <span className="text-red-500">*</span></Label>
                <Input
                  type={showSecret ? "text" : "password"}
                  value={form.client_id}
                  onChange={e => setForm({ ...form, client_id: e.target.value })}
                  placeholder="Ingrese el ClientID"
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label className="text-sm font-semibold text-slate-700">ClientSecret <span className="text-red-500">*</span></Label>
                <Input
                  type={showSecret ? "text" : "password"}
                  value={form.client_secret}
                  onChange={e => setForm({ ...form, client_secret: e.target.value })}
                  placeholder="Ingrese el ClientSecret"
                  className="mt-1.5"
                />
              </div>
            </div>
            <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showSecret}
                onChange={e => setShowSecret(e.target.checked)}
                className="rounded border-slate-300"
              />
              Mostrar credenciales
            </label>
            <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
              <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p className="text-sm text-blue-700">
                Use el botón <strong>Probar Conexión</strong> para verificar que las credenciales y la empresa destino sean válidas.
              </p>
            </div>
          </CardContent>
        </Card>

        {/* Formulario principal */}
        <Card className="border-0 shadow-lg mb-6">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <Building2 className="w-4 h-4 text-indigo-600" />
              Empresa Destino y Endpoints
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {/* Selector de empresa */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 mb-2 block">
                Empresa Destino <span className="text-red-500">*</span>
              </Label>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {/* Prueba (editable) */}
                <div
                  onClick={() => {
                    setEmpresaMode("prueba");
                    if (!form.cod_empresa || String(form.cod_empresa).padStart(3, "0") === PROD_DEFAULT) {
                      setForm({ ...form, cod_empresa: PRUEBA_DEFAULT });
                    }
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    !esProd
                      ? "border-amber-500 bg-amber-50 shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-base">Empresa de Prueba</span>
                    <Badge className="bg-amber-100 text-amber-700 border-amber-300">Prueba</Badge>
                  </div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">Código de empresa</Label>
                  <Input
                    value={!esProd ? form.cod_empresa : ""}
                    onChange={e => setForm({ ...form, cod_empresa: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    placeholder="001, 002, 004, 006..."
                    disabled={esProd}
                    className={`text-lg font-bold ${esProd ? "opacity-40" : "border-amber-300 bg-white focus:border-amber-500"}`}
                  />
                  <p className="text-xs text-amber-600 mt-1.5">
                    Escriba aquí el código de la empresa de prueba.
                  </p>
                </div>

                {/* Producción (editable) */}
                <div
                  onClick={() => {
                    setEmpresaMode("produccion");
                    if (!form.cod_empresa) setForm({ ...form, cod_empresa: PROD_DEFAULT });
                  }}
                  className={`p-4 rounded-xl border-2 transition-all cursor-pointer ${
                    esProd
                      ? "border-green-500 bg-green-50 shadow-md"
                      : "border-slate-200 bg-white hover:border-slate-300"
                  }`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-bold text-slate-900 text-base">Empresa de Producción</span>
                    <Badge className="bg-green-100 text-green-700 border-green-300">Producción</Badge>
                  </div>
                  <Label className="text-xs font-medium text-slate-500 mb-1 block">Código de empresa</Label>
                  <Input
                    value={esProd ? form.cod_empresa : ""}
                    onChange={e => setForm({ ...form, cod_empresa: e.target.value })}
                    onClick={e => e.stopPropagation()}
                    placeholder="003..."
                    disabled={!esProd}
                    className={`text-lg font-bold ${!esProd ? "opacity-40" : "border-green-300 bg-white focus:border-green-500"}`}
                  />
                  <p className="text-xs text-green-600 mt-1.5">
                    Escriba el código de empresa de producción (puede cambiar cada año).
                  </p>
                </div>
              </div>
            </div>

            {/* Código de sistema */}
            <div>
              <Label className="text-sm font-semibold text-slate-700">Código de Sistema (codSistema)</Label>
              <Input
                value={form.cod_sistema}
                onChange={e => setForm({ ...form, cod_sistema: e.target.value })}
                placeholder="01"
                className="mt-1.5 max-w-xs"
              />
            </div>

            {/* URLs */}
            <div>
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Link2 className="w-3.5 h-3.5" /> URL de Autenticación <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.auth_url}
                onChange={e => setForm({ ...form, auth_url: e.target.value })}
                placeholder="https://api.starsoft.com/autenticacion"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">Endpoint POST donde se envían clientID, clientSecret, codEmpresa, codSistema</p>
            </div>

            <div>
              <Label className="text-sm font-semibold text-slate-700 flex items-center gap-1.5">
                <Send className="w-3.5 h-3.5" /> URL de Envío de Asientos <span className="text-red-500">*</span>
              </Label>
              <Input
                value={form.api_url}
                onChange={e => setForm({ ...form, api_url: e.target.value })}
                placeholder="https://api.starsoft.com/asientos"
                className="mt-1.5"
              />
              <p className="text-xs text-slate-400 mt-1">Endpoint POST donde se envía la trama de cada asiento con el Bearer token</p>
            </div>

            {/* Notas */}
            <div>
              <Label className="text-sm font-semibold text-slate-700">Notas</Label>
              <Input
                value={form.notes}
                onChange={e => setForm({ ...form, notes: e.target.value })}
                placeholder="Notas adicionales..."
                className="mt-1.5"
              />
            </div>

            {/* Botones */}
            <div className="flex flex-wrap gap-3 pt-2">
              <Button
                onClick={() => saveMutation.mutate()}
                disabled={saveMutation.isPending}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                Guardar Configuración
              </Button>
              <Button
                variant="outline"
                onClick={handleProbarConexion}
                disabled={testing || saveMutation.isPending}
                className="border-indigo-300 text-indigo-700 hover:bg-indigo-50"
              >
                {testing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
                Probar Conexión
              </Button>
            </div>

            {/* Resultado de prueba */}
            {testResult && (
              <div className={`mt-2 p-4 rounded-xl border ${
                testResult.status === "success"
                  ? "bg-green-50 border-green-200"
                  : "bg-red-50 border-red-200"
              }`}>
                <div className="flex items-start gap-3">
                  {testResult.status === "success"
                    ? <CheckCircle className="w-5 h-5 text-green-600 shrink-0 mt-0.5" />
                    : <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
                  <div className="flex-1">
                    <p className={`font-semibold ${testResult.status === "success" ? "text-green-800" : "text-red-800"}`}>
                      {testResult.status === "success" ? "Conexión exitosa" : "Error de conexión"}
                    </p>
                    <p className={`text-sm mt-0.5 ${testResult.status === "success" ? "text-green-700" : "text-red-700"}`}>
                      {testResult.message}
                    </p>
                    {testResult.date && (
                      <p className="text-xs text-slate-400 mt-1">
                        {format(new Date(testResult.date), "dd/MM/yyyy HH:mm:ss", { locale: es })}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

          </TabsContent>
          <TabsContent value="cuentas">
        {/* Configuración de cuentas por tipo de planilla */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-base flex items-center gap-2">
              <BookOpen className="w-4 h-4 text-indigo-600" />
              Cuentas Contables por Tipo de Planilla
            </CardTitle>
            <CardDescription>
              Configure las cuentas del debe y haber que se usarán al generar los asientos contables.
              Las cuentas se seleccionan desde la tabla Cuentas Contables (Datos Maestros).
            </CardDescription>
          </CardHeader>
          <CardContent className="p-6 space-y-5">
            {cuentasContables.length === 0 ? (
              <div className="flex items-start gap-2 p-3 bg-amber-50 rounded-lg border border-amber-200">
                <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                <p className="text-sm text-amber-700">
                  No hay cuentas contables registradas. Registre cuentas en Datos Maestros → Cuentas Contables para habilitar esta configuración.
                </p>
              </div>
            ) : (
              <>
                <CuentasPlanillaSection
                  value={cuentasPorPlanilla}
                  onChange={setCuentasPorPlanilla}
                  cuentas={cuentasContables}
                />
                <div className="flex items-start gap-2 p-3 bg-blue-50 rounded-lg border border-blue-200">
                  <AlertCircle className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                  <p className="text-sm text-blue-700">
                    Agregue un registro por cada cuenta: indique el tipo de planilla, la cuenta contable y si es del <strong>Debe</strong> (gasto) o del <strong>Haber</strong> (neto a pagar / descuentos).
                    Las cuentas no configuradas usarán los valores por defecto del sistema al generar los asientos.
                  </p>
                </div>
                <div className="flex justify-end pt-2">
                  <Button
                    onClick={() => saveMutation.mutate()}
                    disabled={saveMutation.isPending}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {saveMutation.isPending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
                    Guardar Cuentas por Planilla
                  </Button>
                </div>
              </>
            )}
          </CardContent>
        </Card>

          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
