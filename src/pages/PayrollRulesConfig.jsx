import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Calculator, Plus, Edit, Trash2, TrendingUp, DollarSign, FileCode } from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "../components/hooks/usePermissions";

export default function PayrollRulesConfig() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [showFormulaForm, setShowFormulaForm] = useState(false);
  const [showTaxForm, setShowTaxForm] = useState(false);
  const [showScaleForm, setShowScaleForm] = useState(false);
  const [editingFormula, setEditingFormula] = useState(null);
  const [editingTax, setEditingTax] = useState(null);
  const [editingScale, setEditingScale] = useState(null);
  const [formulaData, setFormulaData] = useState({});
  const [taxData, setTaxData] = useState({});
  const [scaleData, setScaleData] = useState({});

  const queryClient = useQueryClient();

  const { data: formulas = [] } = useQuery({
    queryKey: ["payrollFormulas"],
    queryFn: () => base44.entities.PayrollFormula.list("-priority"),
  });

  const { data: taxTables = [] } = useQuery({
    queryKey: ["taxTables"],
    queryFn: () => base44.entities.TaxTable.list("-created_date"),
  });

  const { data: salaryScales = [] } = useQuery({
    queryKey: ["salaryScales"],
    queryFn: () => base44.entities.SalaryScale.list("-effective_date"),
  });

  const createFormulaMutation = useMutation({
    mutationFn: (data) => base44.entities.PayrollFormula.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollFormulas"]);
      toast.success("Fórmula creada");
      setShowFormulaForm(false);
      setFormulaData({});
    },
  });

  const updateFormulaMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.PayrollFormula.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollFormulas"]);
      toast.success("Fórmula actualizada");
      setShowFormulaForm(false);
      setEditingFormula(null);
    },
  });

  const deleteFormulaMutation = useMutation({
    mutationFn: (id) => base44.entities.PayrollFormula.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollFormulas"]);
      toast.success("Fórmula eliminada");
    },
  });

  const createTaxMutation = useMutation({
    mutationFn: (data) => base44.entities.TaxTable.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["taxTables"]);
      toast.success("Tabla de impuestos creada");
      setShowTaxForm(false);
      setTaxData({});
    },
  });

  const updateTaxMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TaxTable.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["taxTables"]);
      toast.success("Tabla actualizada");
      setShowTaxForm(false);
      setEditingTax(null);
    },
  });

  const deleteTaxMutation = useMutation({
    mutationFn: (id) => base44.entities.TaxTable.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["taxTables"]);
      toast.success("Tabla eliminada");
    },
  });

  const createScaleMutation = useMutation({
    mutationFn: (data) => base44.entities.SalaryScale.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["salaryScales"]);
      toast.success("Escala salarial creada");
      setShowScaleForm(false);
      setScaleData({});
    },
  });

  const updateScaleMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.SalaryScale.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["salaryScales"]);
      toast.success("Escala actualizada");
      setShowScaleForm(false);
      setEditingScale(null);
    },
  });

  const deleteScaleMutation = useMutation({
    mutationFn: (id) => base44.entities.SalaryScale.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["salaryScales"]);
      toast.success("Escala eliminada");
    },
  });

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  if (!hasPermission("payroll.edit")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para configurar reglas de nómina</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Motor de Reglas de Nómina</h1>
          <p className="text-slate-600 text-lg">Configura fórmulas, impuestos y escalas salariales</p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Calculator className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{formulas.length}</div>
              <p className="text-slate-600 text-sm">Fórmulas Activas</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{taxTables.length}</div>
              <p className="text-slate-600 text-sm">Tablas de Impuestos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{salaryScales.length}</div>
              <p className="text-slate-600 text-sm">Escalas Salariales</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="formulas" className="space-y-6">
          <TabsList className="grid w-full max-w-2xl grid-cols-3">
            <TabsTrigger value="formulas">Fórmulas</TabsTrigger>
            <TabsTrigger value="taxes">Impuestos</TabsTrigger>
            <TabsTrigger value="scales">Escalas Salariales</TabsTrigger>
          </TabsList>

          {/* Fórmulas */}
          <TabsContent value="formulas">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Fórmulas de Nómina</CardTitle>
                  <Button onClick={() => {
                    setFormulaData({ 
                      name: "", 
                      formula_type: "Ingreso", 
                      formula: "", 
                      is_active: true,
                      priority: 0 
                    });
                    setShowFormulaForm(true);
                  }} className="bg-indigo-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Fórmula
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {formulas.map(formula => (
                    <div key={formula.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between mb-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-slate-900">{formula.name}</h4>
                            <Badge className={
                              formula.formula_type === "Ingreso" ? "bg-green-100 text-green-700" :
                              formula.formula_type === "Deducción" ? "bg-red-100 text-red-700" :
                              formula.formula_type === "Contribución Empleador" ? "bg-blue-100 text-blue-700" :
                              "bg-purple-100 text-purple-700"
                            }>
                              {formula.formula_type}
                            </Badge>
                            {formula.is_active && <Badge className="bg-green-100 text-green-700">Activa</Badge>}
                          </div>
                          <p className="text-sm text-slate-600 mb-2">{formula.description}</p>
                          <div className="p-2 bg-slate-50 rounded font-mono text-xs text-slate-700">
                            {formula.formula}
                          </div>
                          {formula.conditions && (
                            <p className="text-xs text-slate-500 mt-1">
                              Condición: {formula.conditions}
                            </p>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingFormula(formula);
                            setFormulaData(formula);
                            setShowFormulaForm(true);
                          }}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => {
                            if (confirm("¿Eliminar fórmula?")) deleteFormulaMutation.mutate(formula.id);
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Tablas de Impuestos */}
          <TabsContent value="taxes">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Tablas de Impuestos</CardTitle>
                  <Button onClick={() => {
                    setTaxData({ 
                      name: "", 
                      tax_type: "Renta 5ta", 
                      calculation_method: "Porcentaje Fijo",
                      is_active: true,
                      brackets: []
                    });
                    setShowTaxForm(true);
                  }} className="bg-indigo-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Tabla
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {taxTables.map(tax => (
                    <div key={tax.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-slate-900">{tax.name}</h4>
                            <Badge className="bg-blue-100 text-blue-700">{tax.tax_type}</Badge>
                            <Badge variant="outline">{tax.calculation_method}</Badge>
                          </div>
                          {tax.calculation_method === "Porcentaje Fijo" && (
                            <p className="text-sm text-slate-600">Tasa: {tax.fixed_rate}%</p>
                          )}
                          {tax.calculation_method === "Tramos" && tax.brackets && (
                            <div className="text-xs text-slate-600 space-y-1">
                              {tax.brackets.map((b, i) => (
                                <div key={i}>
                                  S/ {b.min_amount} - {b.max_amount || "∞"}: {b.rate}%
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingTax(tax);
                            setTaxData(tax);
                            setShowTaxForm(true);
                          }}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => {
                            if (confirm("¿Eliminar tabla?")) deleteTaxMutation.mutate(tax.id);
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Escalas Salariales */}
          <TabsContent value="scales">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle>Escalas Salariales</CardTitle>
                  <Button onClick={() => {
                    setScaleData({ 
                      name: "", 
                      scale_type: "Antigüedad",
                      min_years: 0,
                      percentage_increase: 0,
                      fixed_amount: 0,
                      is_active: true
                    });
                    setShowScaleForm(true);
                  }} className="bg-indigo-600">
                    <Plus className="w-4 h-4 mr-2" />
                    Nueva Escala
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-3">
                  {salaryScales.map(scale => (
                    <div key={scale.id} className="p-4 border rounded-lg">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <h4 className="font-bold text-slate-900">{scale.name}</h4>
                            <Badge className="bg-green-100 text-green-700">{scale.scale_type}</Badge>
                          </div>
                          <p className="text-sm text-slate-600 mb-1">{scale.description}</p>
                          <div className="text-xs text-slate-600">
                            {scale.scale_type === "Antigüedad" && (
                              <p>{scale.min_years} - {scale.max_years || "∞"} años</p>
                            )}
                            {scale.position && <p>Cargo: {scale.position}</p>}
                            <p>Incremento: {scale.percentage_increase}% + S/ {scale.fixed_amount}</p>
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button size="sm" variant="outline" onClick={() => {
                            setEditingScale(scale);
                            setScaleData(scale);
                            setShowScaleForm(true);
                          }}>
                            <Edit className="w-3 h-3" />
                          </Button>
                          <Button size="sm" variant="outline" className="text-red-600" onClick={() => {
                            if (confirm("¿Eliminar escala?")) deleteScaleMutation.mutate(scale.id);
                          }}>
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>

        {/* Modal Fórmula */}
        {showFormulaForm && (
          <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={() => setShowFormulaForm(false)}>
            <Card className="max-w-3xl w-full" onClick={(e) => e.stopPropagation()}>
              <CardHeader className="border-b">
                <CardTitle>{editingFormula ? "Editar" : "Nueva"} Fórmula</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div>
                  <Label>Nombre *</Label>
                  <Input value={formulaData.name || ""} onChange={(e) => setFormulaData({...formulaData, name: e.target.value})} />
                </div>
                <div>
                  <Label>Tipo *</Label>
                  <Select value={formulaData.formula_type} onValueChange={(v) => setFormulaData({...formulaData, formula_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ingreso">Ingreso</SelectItem>
                      <SelectItem value="Deducción">Deducción</SelectItem>
                      <SelectItem value="Contribución Empleador">Contribución Empleador</SelectItem>
                      <SelectItem value="Variable Auxiliar">Variable Auxiliar</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Fórmula * (ej: base_salary * 0.0975)</Label>
                  <Textarea value={formulaData.formula || ""} onChange={(e) => setFormulaData({...formulaData, formula: e.target.value})} rows={3} className="font-mono text-sm" />
                  <p className="text-xs text-slate-500 mt-1">
                    Variables: base_salary, worked_days, regular_hours, overtime_hours, horas_extras_25, etc.
                  </p>
                </div>
                <div>
                  <Label>Condiciones (opcional)</Label>
                  <Input value={formulaData.conditions || ""} onChange={(e) => setFormulaData({...formulaData, conditions: e.target.value})} placeholder="contract_type == 'Indeterminado'" />
                </div>
                <div>
                  <Label>Descripción</Label>
                  <Textarea value={formulaData.description || ""} onChange={(e) => setFormulaData({...formulaData, description: e.target.value})} rows={2} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Prioridad (orden ejecución)</Label>
                    <Input type="number" value={formulaData.priority || 0} onChange={(e) => setFormulaData({...formulaData, priority: parseInt(e.target.value)})} />
                  </div>
                  <div className="flex items-center gap-2 pt-6">
                    <input type="checkbox" checked={formulaData.is_active} onChange={(e) => setFormulaData({...formulaData, is_active: e.target.checked})} className="w-4 h-4" />
                    <Label>Activa</Label>
                  </div>
                </div>
                <div className="flex gap-3">
                  <Button variant="outline" className="flex-1" onClick={() => setShowFormulaForm(false)}>Cancelar</Button>
                  <Button className="flex-1 bg-indigo-600" onClick={() => {
                    if (editingFormula) {
                      updateFormulaMutation.mutate({ id: editingFormula.id, data: formulaData });
                    } else {
                      createFormulaMutation.mutate(formulaData);
                    }
                  }}>
                    {editingFormula ? "Actualizar" : "Crear"}
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}