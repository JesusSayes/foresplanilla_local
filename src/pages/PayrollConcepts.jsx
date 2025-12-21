import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { 
  TrendingUp, TrendingDown, DollarSign, Plus, Trash2, Search, Calendar
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function PayrollConcepts() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [searchTerm, setSearchTerm] = useState("");
  const [departmentFilter, setDepartmentFilter] = useState("all");
  const [showFormFor, setShowFormFor] = useState(null);
  const [formData, setFormData] = useState({
    concept_type: "Ingreso",
    concept_name: "",
    amount: "",
    is_recurring: false,
    notes: "",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);

        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };

    loadUserData();
  }, []);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await base44.entities.Employee.filter({ status: "Activo" });
    },
  });

  const { data: payrollConcepts = [], isLoading } = useQuery({
    queryKey: ["payrollConcepts", selectedMonth, selectedYear],
    queryFn: async () => {
      return await base44.entities.PayrollConcept.filter({
        month: selectedMonth,
        year: selectedYear
      }, "-created_date");
    },
  });

  const createConceptMutation = useMutation({
    mutationFn: async (conceptData) => {
      return await base44.entities.PayrollConcept.create(conceptData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success("Concepto agregado");
      resetForm();
    },
    onError: () => {
      toast.error("Error al agregar concepto");
    },
  });

  const deleteConceptMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.PayrollConcept.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success("Concepto eliminado");
    },
    onError: () => {
      toast.error("Error al eliminar concepto");
    },
  });

  const handleSubmit = (employeeId) => {
    if (!formData.concept_name || !formData.amount) {
      toast.error("Completa los campos obligatorios");
      return;
    }

    const conceptData = {
      employee_id: employeeId,
      concept_type: formData.concept_type,
      concept_name: formData.concept_name,
      amount: parseFloat(formData.amount),
      period: `${format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}`,
      month: selectedMonth,
      year: selectedYear,
      is_recurring: formData.is_recurring,
      is_applied: false,
      notes: formData.notes,
    };

    createConceptMutation.mutate(conceptData);
  };

  const resetForm = () => {
    setFormData({
      concept_type: "Ingreso",
      concept_name: "",
      amount: "",
      is_recurring: false,
      notes: "",
    });
    setShowFormFor(null);
  };

  const filteredEmployees = allEmployees.filter(emp => {
    const matchesSearch = searchTerm ? (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    ) : true;
    
    const matchesDept = departmentFilter === "all" || emp.department_name === departmentFilter;
    
    return matchesSearch && matchesDept;
  });

  const departments = [...new Set(allEmployees.map(e => e.department_name))].filter(Boolean);

  // Calcular estadísticas
  const stats = {
    totalIngresos: payrollConcepts
      .filter(c => c.concept_type === "Ingreso")
      .reduce((sum, c) => sum + c.amount, 0),
    totalDescuentos: payrollConcepts
      .filter(c => c.concept_type === "Descuento" || c.concept_type === "Aportación")
      .reduce((sum, c) => sum + c.amount, 0),
    empleadosConConceptos: [...new Set(payrollConcepts.map(c => c.employee_id))].length,
    totalConceptos: payrollConcepts.length,
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden gestionar conceptos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión de Conceptos de Planilla
          </h1>
          <p className="text-slate-600 text-lg">
            Administra ingresos, descuentos y aportaciones adicionales por empleado
          </p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                S/ {stats.totalIngresos.toFixed(2)}
              </div>
              <p className="text-slate-600 text-sm">Total Ingresos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                S/ {stats.totalDescuentos.toFixed(2)}
              </div>
              <p className="text-slate-600 text-sm">Total Descuentos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.empleadosConConceptos}
              </div>
              <p className="text-slate-600 text-sm">Empleados con Conceptos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <Calendar className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">
                {stats.totalConceptos}
              </div>
              <p className="text-slate-600 text-sm">Total Conceptos</p>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-bold">Periodo y Filtros</CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex flex-wrap gap-4">
              <div>
                <Label className="text-sm mb-2 block">Mes</Label>
                <Select value={String(selectedMonth)} onValueChange={(v) => setSelectedMonth(parseInt(v))}>
                  <SelectTrigger className="w-40">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Array.from({ length: 12 }, (_, i) => (
                      <SelectItem key={i + 1} value={String(i + 1)}>
                        {format(new Date(2024, i), 'MMMM', { locale: es })}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Año</Label>
                <Select value={String(selectedYear)} onValueChange={(v) => setSelectedYear(parseInt(v))}>
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {[2023, 2024, 2025, 2026].map(year => (
                      <SelectItem key={year} value={String(year)}>{year}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="flex-1 min-w-64">
                <Label className="text-sm mb-2 block">Buscar Empleado</Label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Nombre o código..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>

              <div>
                <Label className="text-sm mb-2 block">Departamento</Label>
                <Select value={departmentFilter} onValueChange={setDepartmentFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    {departments.map(dept => (
                      <SelectItem key={dept} value={dept}>{dept}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Employee List with Concepts */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b">
            <CardTitle className="text-xl font-bold">
              Empleados - {format(new Date(selectedYear, selectedMonth - 1), 'MMMM yyyy', { locale: es })}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : filteredEmployees.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-600">No se encontraron empleados</p>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredEmployees.map(emp => {
                  const empConcepts = payrollConcepts.filter(c => c.employee_id === emp.id);
                  const totalIngresos = empConcepts
                    .filter(c => c.concept_type === "Ingreso")
                    .reduce((sum, c) => sum + c.amount, 0);
                  const totalDescuentos = empConcepts
                    .filter(c => c.concept_type === "Descuento" || c.concept_type === "Aportación")
                    .reduce((sum, c) => sum + c.amount, 0);

                  return (
                    <div key={emp.id} className="p-4 border border-slate-200 rounded-lg">
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1">
                          <h4 className="font-bold text-slate-900 text-lg">
                            {emp.employee_code} - {emp.first_name} {emp.last_name}
                          </h4>
                          <p className="text-sm text-slate-600">{emp.department_name}</p>
                          {empConcepts.length > 0 && (
                            <div className="flex gap-3 mt-2">
                              <span className="text-sm text-green-600 font-semibold">
                                +S/ {totalIngresos.toFixed(2)}
                              </span>
                              <span className="text-sm text-red-600 font-semibold">
                                -S/ {totalDescuentos.toFixed(2)}
                              </span>
                            </div>
                          )}
                        </div>
                        <Button
                          size="sm"
                          onClick={() => setShowFormFor(showFormFor === emp.id ? null : emp.id)}
                          variant={showFormFor === emp.id ? "outline" : "default"}
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          {showFormFor === emp.id ? "Cancelar" : "Agregar Concepto"}
                        </Button>
                      </div>

                      {/* Form */}
                      {showFormFor === emp.id && (
                        <div className="mb-4 p-4 bg-slate-50 rounded-lg space-y-3">
                          <div className="grid grid-cols-2 gap-3">
                            <div>
                              <Label className="text-xs">Tipo</Label>
                              <Select value={formData.concept_type} onValueChange={(v) => setFormData({...formData, concept_type: v})}>
                                <SelectTrigger className="h-9">
                                  <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                  <SelectItem value="Ingreso">Ingreso Adicional</SelectItem>
                                  <SelectItem value="Descuento">Descuento</SelectItem>
                                  <SelectItem value="Aportación">Aportación</SelectItem>
                                </SelectContent>
                              </Select>
                            </div>
                            <div>
                              <Label className="text-xs">Monto (S/)</Label>
                              <Input
                                type="number"
                                step="0.01"
                                value={formData.amount}
                                onChange={(e) => setFormData({...formData, amount: e.target.value})}
                                className="h-9"
                                placeholder="0.00"
                              />
                            </div>
                          </div>
                          <div>
                            <Label className="text-xs">Concepto</Label>
                            <Input
                              value={formData.concept_name}
                              onChange={(e) => setFormData({...formData, concept_name: e.target.value})}
                              className="h-9"
                              placeholder="Ej: Bono productividad, Préstamo, Aporte EsSalud"
                            />
                          </div>
                          <div>
                            <Label className="text-xs">Notas (opcional)</Label>
                            <Textarea
                              value={formData.notes}
                              onChange={(e) => setFormData({...formData, notes: e.target.value})}
                              className="h-16 text-sm"
                              placeholder="Detalles adicionales..."
                            />
                          </div>
                          <div className="flex items-center gap-2">
                            <input
                              type="checkbox"
                              id={`recurring-${emp.id}`}
                              checked={formData.is_recurring}
                              onChange={(e) => setFormData({...formData, is_recurring: e.target.checked})}
                              className="w-4 h-4 rounded"
                            />
                            <label htmlFor={`recurring-${emp.id}`} className="text-xs text-slate-600">
                              Aplicar automáticamente todos los meses
                            </label>
                          </div>
                          <Button onClick={() => handleSubmit(emp.id)} size="sm" className="w-full">
                            Guardar Concepto
                          </Button>
                        </div>
                      )}

                      {/* Concepts List */}
                      {empConcepts.length > 0 && (
                        <div className="space-y-2">
                          {empConcepts.map((concept) => (
                            <div key={concept.id} className="flex items-start justify-between p-3 bg-white border border-slate-200 rounded-lg">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-1">
                                  {concept.concept_type === "Ingreso" ? (
                                    <TrendingUp className="w-4 h-4 text-green-600" />
                                  ) : (
                                    <TrendingDown className="w-4 h-4 text-red-600" />
                                  )}
                                  <span className="font-semibold text-slate-900 text-sm">
                                    {concept.concept_name}
                                  </span>
                                  <Badge 
                                    className={
                                      concept.concept_type === "Ingreso" 
                                        ? "bg-green-100 text-green-700" 
                                        : concept.concept_type === "Descuento"
                                        ? "bg-red-100 text-red-700"
                                        : "bg-orange-100 text-orange-700"
                                    }
                                  >
                                    {concept.concept_type}
                                  </Badge>
                                  {concept.is_applied && (
                                    <Badge className="bg-blue-100 text-blue-700">Aplicado</Badge>
                                  )}
                                </div>
                                <p className={`font-bold text-sm ${
                                  concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                                }`}>
                                  S/ {concept.amount.toFixed(2)}
                                </p>
                                {concept.notes && (
                                  <p className="text-xs text-slate-600 mt-1">{concept.notes}</p>
                                )}
                                {concept.is_recurring && (
                                  <p className="text-xs text-blue-600 mt-1">🔄 Recurrente</p>
                                )}
                              </div>
                              {!concept.is_applied && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteConceptMutation.mutate(concept.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}