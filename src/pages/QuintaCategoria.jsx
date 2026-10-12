import { usePermissions } from "@/components/hooks/usePermissions";
import { authAPI } from "@/api/localClient";
import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Plus, Edit2, Trash2, Search, Calculator, Settings, AlertCircle, FileText } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/payrollUtils";
import QuintaConfigModal from "@/components/quinta/QuintaConfigModal";
import QuintaCalculoDetailModal from "@/components/quinta/QuintaCalculoDetailModal";
import EmployeeSearchSelect from "@/components/employees/EmployeeSearchSelect";

export default function QuintaCategoria() {
  const { hasPermission } = usePermissions();
  const [currentUser, setCurrentUser] = useState(null);
  const [activeTab, setActiveTab] = useState("calculos");
  const [showConfigForm, setShowConfigForm] = useState(false);
  const [editingConfig, setEditingConfig] = useState(null);
  const [selectedCalculo, setSelectedCalculo] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [calcMonth, setCalcMonth] = useState(new Date().getMonth() + 1);
  const [calcYear, setCalcYear] = useState(new Date().getFullYear());
  const [calcEmployee, setCalcEmployee] = useState("");
  const [calculating, setCalculating] = useState(false);

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.me();
        setCurrentUser(user);
      } catch (e) { console.error(e); }
    };
    loadUser();
  }, []);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["supplementEmployees", "QuintaCategoria"],
    queryFn: async () => await entitiesAPI.Employee.accessible(["payroll.view_all", "payroll.create", "payroll.calculate"]),
  });

  const { data: configs = [] } = useQuery({
    queryKey: ["quintaConfigs"],
    queryFn: async () => await entitiesAPI.QuintaCategoriaConfig.list("-year"),
  });

  const { data: calculos = [] } = useQuery({
    queryKey: ["quintaCalculos", calcYear],
    queryFn: async () => await entitiesAPI.QuintaCategoriaCalculo.filter({ year: calcYear }, "-created_date"),
  });

  const saveConfigMutation = useMutation({
    mutationFn: async (data) => {
      if (editingConfig) {
        return await entitiesAPI.QuintaCategoriaConfig.update(editingConfig.id, data);
      }
      return await entitiesAPI.QuintaCategoriaConfig.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quintaConfigs"] });
      toast.success(editingConfig ? "Configuración actualizada" : "Configuración creada");
      setShowConfigForm(false);
      setEditingConfig(null);
    },
    onError: () => toast.error("Error al guardar configuración"),
  });

  const deleteConfigMutation = useMutation({
    mutationFn: async (id) => await entitiesAPI.QuintaCategoriaConfig.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quintaConfigs"] });
      toast.success("Configuración eliminada");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  const calculateMutation = useMutation({
    mutationFn: async ({ employeeId, month, year }) => {
      const response = await entitiesAPI.QuintaCategoriaCalculo.calculate( {
        employee_id: employeeId,
        year,
        month,
      });
      return response.data || response;
    },
    onSuccess: (data) => {
      if (data.status === "success") {
        queryClient.invalidateQueries({ queryKey: ["quintaCalculos"] });
        toast.success("Cálculo generado. Revise y apruebe antes de aplicar.");
        setSelectedCalculo(null);
      } else {
        toast.error(data.error || "Error en el cálculo");
      }
    },
    onError: (err) => {
      const msg = err?.response?.data?.error || err?.message || "Error al calcular";
      toast.error(msg, { duration: 8000 });
    },
  });

  const approveCalculoMutation = useMutation({
    mutationFn: async ({ calculoId, override }) => {
      const updateData = {
        status: "Aprobada",
        approved_by: currentUser?.email,
        approved_date: new Date().toISOString(),
      };
      if (override?.calculation_mode === "manual") {
        updateData.calculation_mode = "manual";
        updateData.manual_amount = override.manual_amount;
        updateData.manual_reason = override.manual_reason;
        updateData.current_month_retention = override.manual_amount;
      }
      return await entitiesAPI.QuintaCategoriaCalculo.update(calculoId, updateData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quintaCalculos"] });
      toast.success("Cálculo aprobado");
      setSelectedCalculo(null);
    },
    onError: () => toast.error("Error al aprobar"),
  });

  const applyCalculoMutation = useMutation({
    mutationFn: async (calculoId) => {
      return await entitiesAPI.QuintaCategoriaCalculo.update(calculoId, {
        status: "Aplicada",
        applied_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quintaCalculos"] });
      toast.success("Retención marcada como aplicada; verifique la boleta manualmente");
      setSelectedCalculo(null);
    },
    onError: () => toast.error("Error al aplicar"),
  });

  const revertCalculoMutation = useMutation({
    mutationFn: async (calculoId) => {
      return await entitiesAPI.QuintaCategoriaCalculo.update(calculoId, {
        status: "Revertida",
        reverted_by: currentUser?.email,
        reverted_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["quintaCalculos"] });
      toast.success("Cálculo revertido");
      setSelectedCalculo(null);
    },
    onError: () => toast.error("Error al revertir"),
  });

  const handleCalculate = async () => {
    if (!calcEmployee) {
      toast.error("Selecciona un empleado");
      return;
    }
    setCalculating(true);
    try {
      await calculateMutation.mutateAsync({
        employeeId: calcEmployee,
        month: calcMonth,
        year: calcYear,
      });
    } finally {
      setCalculating(false);
    }
  };

  const filteredCalculos = calculos.filter((c) => {
    if (calcMonth && c.month !== calcMonth) return false;
    if (searchTerm) {
      const emp = allEmployees.find((e) => e.id === c.employee_id);
      const name = emp ? `${emp.first_name} ${emp.last_name}`.toLowerCase() : "";
      if (!name.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  const getEmployeeName = (id) => {
    const emp = allEmployees.find((e) => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "N/A";
  };

  const activeConfig = configs.find((c) => c.is_active && c.year === calcYear);

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-6">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Retención de Quinta Categoría</h1>
          <p className="text-slate-600 text-sm">Cálculo automático y ajuste manual autorizado de retenciones de Impuesto a la Renta de Quinta Categoría</p>
        </div>

        {!activeConfig && (
          <div className="mb-6 bg-amber-50 border border-amber-300 rounded-lg p-4 flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-amber-800">No hay configuración tributaria activa para {calcYear}</p>
              <p className="text-xs text-amber-700 mt-1">Configure la UIT y las escalas progresivas en la pestaña "Configuración" antes de calcular retenciones.</p>
            </div>
          </div>
        )}

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="calculos"><Calculator className="w-4 h-4 mr-2" />Cálculos</TabsTrigger>
            <TabsTrigger value="config"><Settings className="w-4 h-4 mr-2" />Configuración</TabsTrigger>
          </TabsList>

          {/* Tab Cálculos */}
          <TabsContent value="calculos" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-lg font-bold">Generar Cálculo de Retención</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end">
                  <div>
                    <Label>Empleado</Label>
                    <EmployeeSearchSelect
                      employees={allEmployees}
                      value={calcEmployee}
                      onValueChange={setCalcEmployee}
                      placeholder="Buscar empleado..."
                    />
                  </div>
                  <div>
                    <Label>Mes</Label>
                    <Select value={calcMonth?.toString()} onValueChange={(v) => setCalcMonth(Number(v))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                          <SelectItem key={m} value={m.toString()}>{m}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Año</Label>
                    <Input type="number" value={calcYear} onChange={(e) => setCalcYear(Number(e.target.value))} />
                  </div>
                  <Button
                    onClick={handleCalculate}
                    disabled={calculating || !activeConfig}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    {calculating ? <><Calculator className="w-4 h-4 mr-2 animate-spin" />Calculando...</> : <><Calculator className="w-4 h-4 mr-2" />Calcular</>}
                  </Button>
                </div>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg font-bold">Cálculos del Ejercicio {calcYear}</CardTitle>
                  <div className="relative w-64">
                    <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                    <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead className="bg-slate-50 border-b">
                      <tr>
                        <th className="text-left p-3 text-xs font-semibold text-slate-600">Empleado</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-600">Período</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600">Ingreso Proy.</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600">Imp. Anual</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600">Ret. Previas</th>
                        <th className="text-right p-3 text-xs font-semibold text-slate-600">Ret. Mes</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-600">Modo</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-600">Estado</th>
                        <th className="text-center p-3 text-xs font-semibold text-slate-600">Acciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredCalculos.length === 0 ? (
                        <tr><td colSpan={9} className="text-center py-12 text-slate-500">
                          <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                          No hay cálculos registrados para este período
                        </td></tr>
                      ) : (
                        filteredCalculos.map((c) => (
                          <tr key={c.id} className="border-t hover:bg-slate-50">
                            <td className="p-3 font-medium">{getEmployeeName(c.employee_id)}</td>
                            <td className="p-3 text-center">{c.month}/{c.year}</td>
                            <td className="p-3 text-right font-mono">{formatMoney(c.projected_annual_income)}</td>
                            <td className="p-3 text-right font-mono">{formatMoney(c.projected_annual_tax)}</td>
                            <td className="p-3 text-right font-mono">{formatMoney(c.prior_retentions)}</td>
                            <td className="p-3 text-right font-mono font-semibold text-indigo-600">
                              {formatMoney(c.calculation_mode === "manual" ? c.manual_amount : c.current_month_retention)}
                            </td>
                            <td className="p-3 text-center">
                              <Badge variant="outline" className={c.calculation_mode === "manual" ? "bg-purple-50 text-purple-700" : "bg-teal-50 text-teal-700"}>
                                {c.calculation_mode === "manual" ? "Manual" : "Auto"}
                              </Badge>
                            </td>
                            <td className="p-3 text-center">
                              <Badge className={
                                c.status === "Aplicada" ? "bg-green-100 text-green-700" :
                                c.status === "Aprobada" ? "bg-blue-100 text-blue-700" :
                                c.status === "Revertida" ? "bg-red-100 text-red-700" :
                                "bg-amber-100 text-amber-700"
                              }>{c.status}</Badge>
                            </td>
                            <td className="p-3 text-center">
                              <Button size="sm" variant="ghost" onClick={() => setSelectedCalculo(c)}>
                                <FileText className="w-4 h-4" />
                              </Button>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tab Configuración */}
          <TabsContent value="config" className="space-y-6">
            <div className="flex justify-end">
              <Button onClick={() => { setEditingConfig(null); setShowConfigForm(true); }} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" /> Nueva Configuración
              </Button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {configs.length === 0 ? (
                <div className="col-span-full text-center py-12 text-slate-500">
                  <Settings className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p>No hay configuraciones registradas</p>
                  <p className="text-xs mt-1">Crea una configuración para cada ejercicio fiscal</p>
                </div>
              ) : (
                configs.map((cfg) => (
                  <Card key={cfg.id} className={`border-0 shadow-md ${cfg.is_active ? "ring-2 ring-indigo-400" : ""}`}>
                    <CardHeader className="border-b pb-3">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-lg">Ejercicio {cfg.year}</CardTitle>
                        {cfg.is_active && <Badge className="bg-green-100 text-green-700">Activa</Badge>}
                      </div>
                    </CardHeader>
                    <CardContent className="p-4 space-y-2 text-sm">
                      <div className="flex justify-between"><span className="text-slate-600">UIT:</span><span className="font-mono font-semibold">{formatMoney(cfg.uit_amount)}</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Deducción:</span><span className="font-mono">{cfg.annual_deduction_uit} UIT</span></div>
                      <div className="flex justify-between"><span className="text-slate-600">Tramos:</span><span className="font-mono">{cfg.tax_brackets?.length || 0} escalas</span></div>
                      {cfg.notes && <p className="text-xs text-slate-500 italic mt-2">{cfg.notes}</p>}
                      <div className="flex gap-2 pt-2">
                        <Button size="sm" variant="ghost" onClick={() => { setEditingConfig(cfg); setShowConfigForm(true); }}>
                          <Edit2 className="w-3 h-3" />
                        </Button>
                        <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => {
                          if (confirm(`¿Eliminar configuración del ejercicio ${cfg.year}?`)) deleteConfigMutation.mutate(cfg.id);
                        }}>
                          <Trash2 className="w-3 h-3" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                ))
              )}
            </div>
          </TabsContent>
        </Tabs>
      </div>

      {showConfigForm && (
        <QuintaConfigModal
          initialData={editingConfig}
          onSave={(data) => saveConfigMutation.mutate(data)}
          onCancel={() => { setShowConfigForm(false); setEditingConfig(null); }}
        />
      )}

      {selectedCalculo && (
        <QuintaCalculoDetailModal
          calculo={selectedCalculo}
          employeeName={getEmployeeName(selectedCalculo.employee_id)}
          canApprove={hasPermission("payroll.edit") || hasPermission("system.admin")}
          onApprove={(override) => approveCalculoMutation.mutate({ calculoId: selectedCalculo.id, override })}
          onApplyManual={() => applyCalculoMutation.mutate(selectedCalculo.id)}
          onRevert={() => {
            if (confirm("¿Revertir este cálculo? La retención quedará anulada.")) revertCalculoMutation.mutate(selectedCalculo.id);
          }}
          onCancel={() => setSelectedCalculo(null)}
        />
      )}
    </div>
  );
}