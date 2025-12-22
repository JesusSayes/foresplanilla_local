import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, Plus, Trash2, Search, TrendingUp, 
  TrendingDown, Users, AlertCircle, Edit2, CheckCircle
} from "lucide-react";
import { toast } from "sonner";

// Conceptos predefinidos según legislación peruana
const PREDEFINED_CONCEPTS = {
  ingresos: [
    { 
      name: "Remuneración Básica", 
      isDefault: true, 
      isCompulsory: true, 
      is_dynamic: true,
      calculation_formula: "(base_salary / 30) * worked_days",
      description: "Salario base proporcional a días trabajados (30 días = salario completo)"
    },
    { 
      name: "Asignación Familiar", 
      description: "10% de RMV para trabajadores con hijos menores",
      is_dynamic: true,
      calculation_formula: "rmv * 0.10"
    },
    { 
      name: "Horas Extras al 25%", 
      description: "Primeras 2 horas extras diarias",
      is_dynamic: true,
      calculation_formula: "(base_salary / 30 / 8) * 1.25 * horas_extras_25"
    },
    { 
      name: "Horas Extras al 35%", 
      description: "Horas extras posteriores a las 2 primeras",
      is_dynamic: true,
      calculation_formula: "(base_salary / 30 / 8) * 1.35 * horas_extras_35"
    },
    { 
      name: "Bonificación por Movilidad", 
      description: "No mayor a 24% de RMV",
      is_dynamic: false
    },
    { 
      name: "Bonificación por Alimentación", 
      description: "No mayor a 20% de RMV",
      is_dynamic: false
    },
    { 
      name: "Comisiones", 
      description: "Variable por ventas o desempeño",
      is_dynamic: false
    },
    { 
      name: "Gratificación Ordinaria", 
      description: "Julio y Diciembre - equivalente a 1 sueldo",
      is_dynamic: true,
      calculation_formula: "base_salary"
    },
    { 
      name: "Gratificación Extraordinaria", 
      description: "Bonificación adicional voluntaria",
      is_dynamic: false
    },
    { 
      name: "Bonificación por Escolaridad", 
      description: "Apoyo educativo",
      is_dynamic: false
    },
    { 
      name: "Trabajo Nocturno (Sobretasa 35%)", 
      description: "Trabajo entre 22:00 y 06:00",
      is_dynamic: true,
      calculation_formula: "(base_salary / 30 / 8) * 0.35 * horas_nocturnas"
    },
  ],
  descuentos: [
    { 
      name: "AFP - Comisión", 
      description: "Variable según AFP (aprox. 1.47% - 1.69%)", 
      percentage: 1.6,
      is_dynamic: true,
      calculation_formula: "base_salary * 0.016"
    },
    { 
      name: "AFP - Aporte Obligatorio", 
      description: "10% sobre remuneración asegurable", 
      percentage: 10,
      is_dynamic: true,
      calculation_formula: "base_salary * 0.10"
    },
    { 
      name: "AFP - Seguro", 
      description: "Aprox. 1.33% sobre remuneración asegurable", 
      percentage: 1.33,
      is_dynamic: true,
      calculation_formula: "base_salary * 0.0133"
    },
    { 
      name: "ONP", 
      description: "13% sobre remuneración bruta", 
      percentage: 13,
      is_dynamic: true,
      calculation_formula: "base_salary * 0.13"
    },
    { 
      name: "Impuesto a la Renta 5ta Categoría", 
      description: "Según escala progresiva",
      is_dynamic: false
    },
    { 
      name: "Préstamos", 
      description: "Descuento por préstamos otorgados",
      is_dynamic: false
    },
    { 
      name: "Adelanto Quincenal", 
      description: "Adelanto de primera quincena",
      is_dynamic: false
    },
    { 
      name: "Descuento por Tardanzas", 
      description: "Según reglamento interno",
      is_dynamic: false
    },
    { 
      name: "Descuento por Inasistencias", 
      description: "Descuento proporcional",
      is_dynamic: false
    },
    { 
      name: "Retención Judicial", 
      description: "Por orden judicial",
      is_dynamic: false
    },
  ],
  aportaciones: [
    { 
      name: "ESSALUD", 
      description: "9% sobre remuneración asegurable (empleador)", 
      percentage: 9, 
      paidBy: "employer",
      is_dynamic: true,
      calculation_formula: "base_salary * 0.09"
    },
    { 
      name: "Seguro Vida Ley", 
      description: "Aprox. 0.53% - 1.55% (empleador)", 
      paidBy: "employer",
      is_dynamic: true,
      calculation_formula: "base_salary * 0.0053"
    },
    { 
      name: "SCTR Salud", 
      description: "Seguro complementario trabajo de riesgo (empleador)", 
      paidBy: "employer",
      is_dynamic: false
    },
    { 
      name: "SCTR Pensión", 
      description: "Seguro complementario trabajo de riesgo (empleador)", 
      paidBy: "employer",
      is_dynamic: false
    },
  ],
  otros: [
    { 
      name: "CTS Mayo", 
      description: "Compensación por Tiempo de Servicios - Mayo",
      is_dynamic: false
    },
    { 
      name: "CTS Noviembre", 
      description: "Compensación por Tiempo de Servicios - Noviembre",
      is_dynamic: false
    },
    { 
      name: "Utilidades", 
      description: "Participación en utilidades de la empresa",
      is_dynamic: false
    },
    { 
      name: "Vacaciones", 
      description: "30 días calendario por año trabajado",
      is_dynamic: true,
      calculation_formula: "base_salary"
    },
    { 
      name: "Liquidación de Beneficios Sociales", 
      description: "Al cese laboral",
      is_dynamic: false
    },
  ]
};

export default function PayrollConcepts() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [activeTab, setActiveTab] = useState("general");
  const [showForm, setShowForm] = useState(false);
  const [selectedEmployee, setSelectedEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth() + 1);
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [formData, setFormData] = useState({
    concept_type: "Ingreso",
    concept_name: "",
    amount: "",
    is_dynamic: false,
    calculation_formula: "",
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

  const { data: payrollConcepts = [] } = useQuery({
    queryKey: ["payrollConcepts", selectedMonth, selectedYear, selectedEmployee],
    queryFn: async () => {
      const filter = {
        month: selectedMonth,
        year: selectedYear,
      };
      if (selectedEmployee) {
        filter.employee_id = selectedEmployee;
      }
      return await base44.entities.PayrollConcept.filter(filter, "-created_date");
    },
  });

  const createConceptMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.PayrollConcept.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success("Concepto creado correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al crear el concepto");
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
      toast.error("Error al eliminar el concepto");
    },
  });

  const handleAddPredefined = (concept, type) => {
    if (!selectedEmployee && activeTab === "individual") {
      toast.error("Selecciona un empleado primero");
      return;
    }

    const conceptData = {
      employee_id: selectedEmployee || "general",
      concept_type: type === "ingresos" ? "Ingreso" : type === "descuentos" ? "Descuento" : "Aportación",
      concept_name: concept.name,
      amount: concept.is_dynamic ? 0 : "",
      is_dynamic: concept.is_dynamic || false,
      calculation_formula: concept.calculation_formula || "",
      month: selectedMonth,
      year: selectedYear,
      is_recurring: false,
      is_applied: false,
      notes: concept.description || "",
    };

    setFormData({
      ...conceptData,
      amount: concept.is_dynamic ? "0" : "",
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.concept_name) {
      toast.error("El nombre del concepto es obligatorio");
      return;
    }

    if (!formData.is_dynamic && !formData.amount) {
      toast.error("El monto es obligatorio para conceptos fijos");
      return;
    }

    if (formData.is_dynamic && !formData.calculation_formula) {
      toast.error("La fórmula de cálculo es obligatoria para conceptos dinámicos");
      return;
    }

    if (activeTab === "individual" && !selectedEmployee) {
      toast.error("Selecciona un empleado");
      return;
    }

    const conceptData = {
      ...formData,
      employee_id: activeTab === "general" ? "general" : selectedEmployee,
      amount: formData.is_dynamic ? 0 : parseFloat(formData.amount),
    };

    createConceptMutation.mutate(conceptData);
  };

  const resetForm = () => {
    setFormData({
      concept_type: "Ingreso",
      concept_name: "",
      amount: "",
      is_dynamic: false,
      calculation_formula: "",
      is_recurring: false,
      notes: "",
    });
    setShowForm(false);
  };

  const filteredEmployees = allEmployees.filter(emp => 
    emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const generalConcepts = payrollConcepts.filter(c => c.employee_id === "general");
  const individualConcepts = selectedEmployee 
    ? payrollConcepts.filter(c => c.employee_id === selectedEmployee)
    : [];

  const stats = {
    total: payrollConcepts.length,
    ingresos: payrollConcepts.filter(c => c.concept_type === "Ingreso").length,
    descuentos: payrollConcepts.filter(c => c.concept_type === "Descuento").length,
    aportaciones: payrollConcepts.filter(c => c.concept_type === "Aportación").length,
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
            Configura ingresos, descuentos y aportaciones según legislación peruana
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <DollarSign className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.total}</div>
              <p className="text-slate-600 text-sm">Total Conceptos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <TrendingUp className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.ingresos}</div>
              <p className="text-slate-600 text-sm">Ingresos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <TrendingDown className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.descuentos}</div>
              <p className="text-slate-600 text-sm">Descuentos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.aportaciones}</div>
              <p className="text-slate-600 text-sm">Aportaciones</p>
            </CardContent>
          </Card>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="general">Configuración General</TabsTrigger>
            <TabsTrigger value="individual">Por Empleado</TabsTrigger>
          </TabsList>

          {/* General Configuration */}
          <TabsContent value="general" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Conceptos Predefinidos - Legislación Peruana</CardTitle>
                <p className="text-sm text-slate-600 mt-1">
                  Selecciona conceptos estándar según normativa laboral peruana
                </p>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-2 gap-6">
                  {/* Columna Izquierda: Conceptos No Incorporados */}
                  <div className="space-y-4">
                    <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
                      <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <Plus className="w-5 h-5 text-slate-600" />
                        Conceptos Disponibles
                      </h3>
                      <p className="text-xs text-slate-600 mb-4">Haz clic en (+) para incorporar</p>
                      
                      <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
                        {/* Ingresos */}
                        <div>
                          <h4 className="font-semibold text-sm text-green-700 mb-2 flex items-center gap-2">
                            <TrendingUp className="w-4 h-4" />
                            Ingresos
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.ingresos
                              .filter(concept => !generalConcepts.find(c => c.concept_name === concept.name))
                              .map((concept, idx) => (
                                <div key={idx} className="p-2 bg-white border border-slate-200 rounded hover:shadow-sm transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">{concept.name}</h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => handleAddPredefined(concept, "ingresos")}
                                      className="h-7 w-7 p-0 flex-shrink-0"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Descuentos */}
                        <div>
                          <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-2">
                            <TrendingDown className="w-4 h-4" />
                            Descuentos
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.descuentos
                              .filter(concept => !generalConcepts.find(c => c.concept_name === concept.name))
                              .map((concept, idx) => (
                                <div key={idx} className="p-2 bg-white border border-slate-200 rounded hover:shadow-sm transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">{concept.name}</h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                      {concept.percentage && (
                                        <Badge className="bg-red-100 text-red-700 text-xs mt-1">{concept.percentage}%</Badge>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => handleAddPredefined(concept, "descuentos")}
                                      className="h-7 w-7 p-0 flex-shrink-0"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Aportaciones */}
                        <div>
                          <h4 className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Aportaciones
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.aportaciones
                              .filter(concept => !generalConcepts.find(c => c.concept_name === concept.name))
                              .map((concept, idx) => (
                                <div key={idx} className="p-2 bg-blue-50 border border-blue-200 rounded hover:shadow-sm transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">{concept.name}</h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                      {concept.percentage && (
                                        <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">{concept.percentage}%</Badge>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => handleAddPredefined(concept, "aportaciones")}
                                      className="h-7 w-7 p-0 flex-shrink-0"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>

                        {/* Otros */}
                        <div>
                          <h4 className="font-semibold text-sm text-purple-700 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Otros
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.otros
                              .filter(concept => !generalConcepts.find(c => c.concept_name === concept.name))
                              .map((concept, idx) => (
                                <div key={idx} className="p-2 bg-white border border-slate-200 rounded hover:shadow-sm transition-all">
                                  <div className="flex items-start justify-between gap-2">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">{concept.name}</h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                    </div>
                                    <Button
                                      size="sm"
                                      onClick={() => handleAddPredefined(concept, "ingresos")}
                                      className="h-7 w-7 p-0 flex-shrink-0"
                                    >
                                      <Plus className="w-3 h-3" />
                                    </Button>
                                  </div>
                                </div>
                              ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Columna Derecha: Conceptos Incorporados */}
                  <div className="space-y-4">
                    <div className="bg-green-50 p-4 rounded-lg border border-green-200">
                      <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
                        <CheckCircle className="w-5 h-5 text-green-600" />
                        Conceptos Incorporados
                      </h3>
                      <p className="text-xs text-slate-600 mb-4">Configurados para la planilla general</p>
                      
                      <div className="space-y-2 max-h-[600px] overflow-y-auto pr-2">
                        {generalConcepts.length === 0 ? (
                          <div className="text-center py-12 text-slate-500">
                            <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                            <p className="text-sm">No hay conceptos incorporados aún</p>
                            <p className="text-xs mt-1">Agrega conceptos desde la columna izquierda</p>
                          </div>
                        ) : (
                          generalConcepts.map(concept => (
                            <div key={concept.id} className="p-3 bg-white border border-slate-200 rounded-lg hover:shadow-md transition-all">
                              <div className="flex items-start justify-between gap-2 mb-2">
                                <div className="flex-1">
                                  <div className="flex items-center gap-2 mb-1">
                                    {concept.concept_type === "Ingreso" ? (
                                      <TrendingUp className="w-4 h-4 text-green-600" />
                                    ) : concept.concept_type === "Aportación" ? (
                                      <Users className="w-4 h-4 text-blue-600" />
                                    ) : (
                                      <TrendingDown className="w-4 h-4 text-red-600" />
                                    )}
                                    <span className="font-semibold text-slate-900 text-sm">{concept.concept_name}</span>
                                  </div>
                                  <Badge className={
                                    concept.concept_type === "Ingreso" 
                                      ? "bg-green-100 text-green-700 text-xs" 
                                      : concept.concept_type === "Aportación"
                                      ? "bg-blue-100 text-blue-700 text-xs"
                                      : "bg-red-100 text-red-700 text-xs"
                                  }>
                                    {concept.concept_type}
                                  </Badge>
                                  {concept.is_dynamic ? (
                                    <div className="mt-2">
                                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                                        Dinámico
                                      </Badge>
                                      <p className="text-xs text-slate-600 mt-1 font-mono">
                                        {concept.calculation_formula}
                                      </p>
                                    </div>
                                  ) : (
                                    <p className={`font-bold text-sm mt-2 ${
                                      concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                                    }`}>
                                      S/ {concept.amount.toFixed(2)}
                                    </p>
                                  )}
                                  {concept.notes && (
                                    <p className="text-xs text-slate-600 mt-1">{concept.notes}</p>
                                  )}
                                  {concept.is_recurring && (
                                    <Badge className="bg-indigo-100 text-indigo-700 text-xs mt-1">Recurrente</Badge>
                                  )}
                                </div>
                                <div className="flex gap-1">
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => {
                                      setFormData({
                                        concept_type: concept.concept_type,
                                        concept_name: concept.concept_name,
                                        amount: concept.amount?.toString() || "0",
                                        is_dynamic: concept.is_dynamic || false,
                                        calculation_formula: concept.calculation_formula || "",
                                        is_recurring: concept.is_recurring,
                                        notes: concept.notes || "",
                                      });
                                      setShowForm(true);
                                    }}
                                    className="h-7 w-7 p-0 text-slate-600 hover:text-indigo-600"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => deleteConceptMutation.mutate(concept.id)}
                                    className="h-7 w-7 p-0 text-red-600 hover:text-red-700"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                  </Button>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Individual Configuration */}
          <TabsContent value="individual" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <CardTitle className="text-xl font-bold">Conceptos por Empleado</CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="mb-6">
                  <Label>Seleccionar Empleado</Label>
                  <div className="flex gap-3 mt-2">
                    <div className="flex-1 relative">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-4 h-4" />
                      <Input
                        placeholder="Buscar empleado..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <Select value={selectedEmployee || ""} onValueChange={setSelectedEmployee}>
                      <SelectTrigger className="w-64">
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        {filteredEmployees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.employee_code} - {emp.first_name} {emp.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {selectedEmployee && (
                  <div>
                    <div className="flex items-center justify-between mb-4">
                      <h3 className="font-bold text-slate-900">
                        Conceptos Asignados
                      </h3>
                      <Button size="sm" onClick={() => setShowForm(true)}>
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Manual
                      </Button>
                    </div>

                    {individualConcepts.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        No hay conceptos asignados a este empleado
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {individualConcepts.map(concept => (
                          <div key={concept.id} className="p-3 border border-slate-200 rounded-lg flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                {concept.concept_type === "Ingreso" ? (
                                  <TrendingUp className="w-4 h-4 text-green-600" />
                                ) : (
                                  <TrendingDown className="w-4 h-4 text-red-600" />
                                )}
                                <span className="font-semibold text-slate-900">{concept.concept_name}</span>
                                <Badge className={
                                  concept.concept_type === "Ingreso" 
                                    ? "bg-green-100 text-green-700" 
                                    : "bg-red-100 text-red-700"
                                }>
                                  {concept.concept_type}
                                </Badge>
                                {concept.is_recurring && (
                                  <Badge className="bg-blue-100 text-blue-700">Recurrente</Badge>
                                )}
                              </div>
                              {concept.is_dynamic ? (
                                <div className="mt-1">
                                  <Badge className="bg-purple-100 text-purple-700 text-xs">
                                    Dinámico
                                  </Badge>
                                  <p className="text-xs text-slate-600 mt-1 font-mono">
                                    {concept.calculation_formula}
                                  </p>
                                </div>
                              ) : (
                                <p className={`font-bold ${
                                  concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                                }`}>
                                  S/ {concept.amount.toFixed(2)}
                                </p>
                              )}
                              {concept.notes && (
                                <p className="text-xs text-slate-600 mt-1">{concept.notes}</p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => deleteConceptMutation.mutate(concept.id)}
                              className="text-red-600"
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={resetForm}
        >
          <Card 
            className="max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">Agregar Concepto</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Tipo de Concepto</Label>
                <Select value={formData.concept_type} onValueChange={(v) => setFormData({...formData, concept_type: v})}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Ingreso">Ingreso</SelectItem>
                    <SelectItem value="Descuento">Descuento</SelectItem>
                    <SelectItem value="Aportación">Aportación</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label>Nombre del Concepto</Label>
                <Input
                  value={formData.concept_name}
                  onChange={(e) => setFormData({...formData, concept_name: e.target.value})}
                  placeholder="Ej: Bono productividad"
                />
              </div>

              <div>
                <Label>Tipo de Cálculo</Label>
                <Select 
                  value={formData.is_dynamic ? "dynamic" : "fixed"} 
                  onValueChange={(v) => setFormData({
                    ...formData, 
                    is_dynamic: v === "dynamic",
                    amount: v === "dynamic" ? "0" : formData.amount,
                    calculation_formula: v === "fixed" ? "" : formData.calculation_formula
                  })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="fixed">Monto Fijo</SelectItem>
                    <SelectItem value="dynamic">Cálculo Dinámico</SelectItem>
                  </SelectContent>
                </Select>
                <p className="text-xs text-slate-500 mt-1">
                  {formData.is_dynamic 
                    ? "El monto se calculará automáticamente según la fórmula" 
                    : "Ingresa un monto específico"
                  }
                </p>
              </div>

              {formData.is_dynamic ? (
                <div>
                  <Label>Fórmula de Cálculo *</Label>
                  <Input
                    value={formData.calculation_formula}
                    onChange={(e) => setFormData({...formData, calculation_formula: e.target.value})}
                    placeholder="Ej: base_salary * 0.10"
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Variables disponibles: base_salary, worked_days, horas_extras_25, horas_extras_35, horas_nocturnas
                  </p>
                </div>
              ) : (
                <div>
                  <Label>Monto (S/) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={formData.amount}
                    onChange={(e) => setFormData({...formData, amount: e.target.value})}
                    placeholder="0.00"
                  />
                </div>
              )}

              <div>
                <Label>Notas</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Detalles adicionales..."
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="recurring"
                  checked={formData.is_recurring}
                  onChange={(e) => setFormData({...formData, is_recurring: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
                <label htmlFor="recurring" className="text-sm text-slate-600">
                  Aplicar automáticamente todos los meses
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createConceptMutation.isPending}
                >
                  {createConceptMutation.isPending ? "Guardando..." : "Guardar Concepto"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}