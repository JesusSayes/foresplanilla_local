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
import { Textarea } from "@/components/ui/textarea";
import { 
  DollarSign, Plus, Trash2, Search, TrendingUp, 
  TrendingDown, Users, AlertCircle, Edit2, CheckCircle, User, Copy
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
    concept_category: "Bonificaciones",
    concept_name: "",
    concept_code: "",
    description: "",
    amount: "",
    is_dynamic: false,
    calculation_formula: "",
    is_recurring: false,
    is_mandatory: false,
    applies_to_payroll_types: ["Mensual"],
    notes: "",
  });
  const [editingConcept, setEditingConcept] = useState(null);

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

  const { data: afps = [] } = useQuery({
    queryKey: ["afps"],
    queryFn: async () => {
      const allAFPs = await base44.entities.AFP.list("name");
      return allAFPs.filter(a => a.is_active);
    },
  });

  const { data: payrollConcepts = [] } = useQuery({
    queryKey: ["payrollConcepts", selectedMonth, selectedYear, selectedEmployee, activeTab],
    queryFn: async () => {
      if (activeTab === "general") {
        // Para configuración general, traer solo conceptos generales
        return await base44.entities.PayrollConcept.filter({ employee_id: "general" }, "-created_date");
      } else {
        // Para configuración individual, traer conceptos generales + conceptos del empleado
        const allConcepts = await base44.entities.PayrollConcept.list("-created_date");
        
        // Filtrar conceptos generales o del empleado seleccionado
        return allConcepts.filter(c => 
          c.employee_id === "general" || 
          (selectedEmployee && c.employee_id === selectedEmployee)
        );
      }
    },
  });

  const createConceptMutation = useMutation({
    mutationFn: async (data) => {
      if (editingConcept) {
        return await base44.entities.PayrollConcept.update(editingConcept.id, data);
      }
      return await base44.entities.PayrollConcept.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success(editingConcept ? "Concepto actualizado" : "Concepto creado correctamente");
      resetForm();
    },
    onError: () => {
      toast.error(editingConcept ? "Error al actualizar" : "Error al crear el concepto");
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

  const clearAllConceptsMutation = useMutation({
    mutationFn: async () => {
      const allConcepts = await base44.entities.PayrollConcept.list();
      
      // Filtrar conceptos a eliminar (todos excepto AFP y ONP automáticos)
      const conceptsToDelete = allConcepts.filter(c => 
        !c.concept_name.includes("AFP - ") && c.concept_name !== "ONP"
      );
      
      for (const concept of conceptsToDelete) {
        await base44.entities.PayrollConcept.delete(concept.id);
      }
      
      return conceptsToDelete.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success(`${count} conceptos eliminados. Conceptos AFP y ONP preservados.`);
    },
    onError: () => {
      toast.error("Error al limpiar conceptos");
    },
  });

  const syncONPConceptsMutation = useMutation({
    mutationFn: async () => {
      const onpEmployees = allEmployees.filter(emp => emp.pension_system === "ONP");
      
      if (onpEmployees.length === 0) {
        throw new Error("No hay empleados con sistema ONP");
      }

      const allConcepts = await base44.entities.PayrollConcept.list();
      let syncedCount = 0;

      for (const emp of onpEmployees) {
        // Verificar si el empleado ya tiene concepto ONP
        const hasONP = allConcepts.some(c => 
          c.employee_id === emp.id && c.concept_name === "ONP"
        );

        if (!hasONP) {
          // Crear concepto ONP para este empleado
          await base44.entities.PayrollConcept.create({
            employee_id: emp.id,
            concept_type: "Descuento",
            concept_name: "ONP",
            amount: 0,
            is_dynamic: true,
            calculation_formula: "base_salary * 0.13",
            month: selectedMonth,
            year: selectedYear,
            is_recurring: true,
            is_applied: false,
            notes: "ONP - 13% sobre remuneración bruta (Auto-sincronizado)"
          });
          syncedCount++;
        }
      }

      return { total: onpEmployees.length, synced: syncedCount };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      toast.success(
        `Sincronización completa: ${result.synced} empleados actualizados de ${result.total} con ONP`
      );
    },
    onError: (error) => {
      toast.error(error.message || "Error al sincronizar conceptos ONP");
    },
  });

  const handleAddPredefined = (concept, type, afpData = null) => {
    if (!selectedEmployee && activeTab === "individual") {
      toast.error("Selecciona un empleado primero");
      return;
    }

    let formula = concept.calculation_formula || "";
    let description = concept.description || "";

    // Si es un concepto de AFP y se pasó data de AFP específica
    if (afpData) {
      if (concept.name === "AFP - Comisión") {
        formula = `base_salary * ${(afpData.commission_percentage / 100).toFixed(4)}`;
        description = `${afpData.name} - Comisión ${afpData.commission_percentage}%`;
      } else if (concept.name === "AFP - Aporte Obligatorio") {
        formula = `base_salary * ${(afpData.obligatory_contribution_percentage / 100).toFixed(4)}`;
        description = `${afpData.name} - Aporte Obligatorio ${afpData.obligatory_contribution_percentage}%`;
      } else if (concept.name === "AFP - Seguro") {
        formula = `base_salary * ${(afpData.insurance_percentage / 100).toFixed(4)}`;
        description = `${afpData.name} - Seguro ${afpData.insurance_percentage}%`;
      }
    }

    // Determinar categoría basada en tipo
    let category = "Otros";
    if (type === "ingresos") {
      if (concept.name.includes("Remuneración")) category = "Remuneración Base";
      else if (concept.name.includes("Hora")) category = "Horas Extras";
      else if (concept.name.includes("Asignación")) category = "Asignaciones";
      else category = "Bonificaciones";
    } else if (type === "descuentos") {
      if (concept.name.includes("AFP") || concept.name.includes("ONP")) category = "AFP/ONP";
      else if (concept.name.includes("Impuesto") || concept.name.includes("Renta")) category = "Impuestos";
      else if (concept.name.includes("Préstamo")) category = "Préstamos";
      else category = "Descuentos Varios";
    } else if (type === "aportaciones") {
      if (concept.name.includes("ESSALUD")) category = "EsSalud";
      else if (concept.name.includes("SCTR")) category = "SCTR";
      else category = "Otros";
    }

    setEditingConcept(null);
    setFormData({
      concept_type: type === "ingresos" ? "Ingreso" : type === "descuentos" ? "Descuento" : type === "aportaciones" ? "Aportación" : "Otros",
      concept_category: category,
      concept_name: concept.name,
      concept_code: "",
      description: description,
      amount: concept.is_dynamic ? "0" : "",
      is_dynamic: concept.is_dynamic || false,
      calculation_formula: formula,
      is_recurring: false,
      is_mandatory: false,
      applies_to_payroll_types: ["Mensual"],
      notes: description,
    });
    setShowForm(true);
    toast.info("Edita el concepto antes de incorporarlo");
  };

  const handleSubmit = async () => {
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

    // Si es ONP y es concepto general, sincronizar con empleados que tienen ONP
    if (activeTab === "general" && formData.concept_name === "ONP") {
      const onpEmployees = allEmployees.filter(emp => emp.pension_system === "ONP");
      
      // Crear concepto general
      await createConceptMutation.mutateAsync(conceptData);
      
      // Crear conceptos individuales para cada empleado con ONP
      for (const emp of onpEmployees) {
        try {
          await base44.entities.PayrollConcept.create({
            ...conceptData,
            employee_id: emp.id,
            notes: `${conceptData.notes || "ONP - 13% sobre remuneración bruta"} (Auto-asignado)`
          });
        } catch (error) {
          console.error(`Error al crear concepto ONP para empleado ${emp.id}:`, error);
        }
      }
      
      toast.success(`Concepto ONP agregado para ${onpEmployees.length} empleados con ONP`);
      queryClient.invalidateQueries(["payrollConcepts"]);
      resetForm();
    } else {
      createConceptMutation.mutate(conceptData);
    }
  };

  const handleEdit = (concept) => {
    setEditingConcept(concept);
    setFormData({
      concept_type: concept.concept_type,
      concept_category: concept.concept_category || "Otros",
      concept_name: concept.concept_name,
      concept_code: concept.concept_code || "",
      description: concept.description || "",
      amount: concept.amount?.toString() || "0",
      is_dynamic: concept.is_dynamic || false,
      calculation_formula: concept.calculation_formula || "",
      is_recurring: concept.is_recurring || false,
      is_mandatory: concept.is_mandatory || false,
      applies_to_payroll_types: concept.applies_to_payroll_types || ["Mensual"],
      notes: concept.notes || "",
    });
    setShowForm(true);
  };

  const handleCopy = (concept) => {
    setEditingConcept(null);
    setFormData({
      concept_type: concept.concept_type,
      concept_category: concept.concept_category || "Otros",
      concept_name: `${concept.concept_name} (Copia)`,
      concept_code: concept.concept_code ? `${concept.concept_code}_COPY` : "",
      description: concept.description || "",
      amount: concept.amount?.toString() || "0",
      is_dynamic: concept.is_dynamic || false,
      calculation_formula: concept.calculation_formula || "",
      is_recurring: concept.is_recurring || false,
      is_mandatory: concept.is_mandatory || false,
      applies_to_payroll_types: concept.applies_to_payroll_types || ["Mensual"],
      notes: concept.notes || "",
    });
    setShowForm(true);
    toast.info("Concepto copiado. Modifica y guarda.");
  };

  const resetForm = () => {
    setFormData({
      concept_type: "Ingreso",
      concept_category: "Bonificaciones",
      concept_name: "",
      concept_code: "",
      description: "",
      amount: "",
      is_dynamic: false,
      calculation_formula: "",
      is_recurring: false,
      is_mandatory: false,
      applies_to_payroll_types: ["Mensual"],
      notes: "",
    });
    setEditingConcept(null);
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
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Gestión de Conceptos de Planilla
            </h1>
            <p className="text-slate-600 text-lg">
              Configura ingresos, descuentos y aportaciones según legislación peruana
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              onClick={() => syncONPConceptsMutation.mutate()}
              variant="outline"
              className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
              disabled={syncONPConceptsMutation.isPending}
            >
              <CheckCircle className="w-4 h-4 mr-2" />
              {syncONPConceptsMutation.isPending ? "Sincronizando..." : "Sincronizar ONP"}
            </Button>
            <Button
              onClick={() => {
                if (confirm("¿Estás seguro de eliminar todos los conceptos excepto AFP y ONP automáticos? Esta acción no se puede deshacer.")) {
                  clearAllConceptsMutation.mutate();
                }
              }}
              variant="outline"
              className="text-red-600 hover:text-red-700 hover:bg-red-50"
              disabled={clearAllConceptsMutation.isPending}
            >
              <Trash2 className="w-4 h-4 mr-2" />
              {clearAllConceptsMutation.isPending ? "Limpiando..." : "Limpiar Conceptos"}
            </Button>
          </div>
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
                            {PREDEFINED_CONCEPTS.ingresos.map((concept, idx) => {
                              const isAdded = generalConcepts.find(c => c.concept_name === concept.name);
                              return (
                                <div key={idx} className={`p-2 border rounded transition-all ${isAdded ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:shadow-sm'}`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">
                                        {concept.name}
                                        {isAdded && <span className="ml-1 text-green-600">✓</span>}
                                      </h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(concept, "ingresos")}
                                        className="h-7 w-7 p-0 flex-shrink-0"
                                        disabled={isAdded}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                      {isAdded && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Descuentos - AFPs */}
                        <div>
                          <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-2">
                            <TrendingDown className="w-4 h-4" />
                            Descuentos AFP
                          </h4>
                          {afps.length === 0 ? (
                            <p className="text-xs text-slate-500 italic p-2">
                              No hay AFPs registradas. Configúralas en Datos Maestros.
                            </p>
                          ) : (
                            <div className="space-y-3">
                              {afps.map(afp => (
                                <div key={afp.id} className="p-2 bg-red-50 border border-red-200 rounded">
                                  <h5 className="font-semibold text-xs text-slate-900 mb-2">{afp.name}</h5>
                                  <div className="space-y-1">
                                    <div className="flex items-center justify-between p-1 bg-white rounded hover:shadow-sm transition-all">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-slate-800">Comisión</p>
                                        <p className="text-xs text-slate-500">{afp.commission_percentage}%</p>
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(
                                          { name: "AFP - Comisión", is_dynamic: true },
                                          "descuentos",
                                          afp
                                        )}
                                        className="h-6 w-6 p-0"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center justify-between p-1 bg-white rounded hover:shadow-sm transition-all">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-slate-800">Aporte Obligatorio</p>
                                        <p className="text-xs text-slate-500">{afp.obligatory_contribution_percentage}%</p>
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(
                                          { name: "AFP - Aporte Obligatorio", is_dynamic: true },
                                          "descuentos",
                                          afp
                                        )}
                                        className="h-6 w-6 p-0"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                    <div className="flex items-center justify-between p-1 bg-white rounded hover:shadow-sm transition-all">
                                      <div className="flex-1">
                                        <p className="text-xs font-medium text-slate-800">Seguro</p>
                                        <p className="text-xs text-slate-500">{afp.insurance_percentage}%</p>
                                      </div>
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(
                                          { name: "AFP - Seguro", is_dynamic: true },
                                          "descuentos",
                                          afp
                                        )}
                                        className="h-6 w-6 p-0"
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Otros Descuentos */}
                        <div>
                          <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-2">
                            <TrendingDown className="w-4 h-4" />
                            Otros Descuentos
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.descuentos.map((concept, idx) => {
                              const isAdded = generalConcepts.find(c => c.concept_name === concept.name);
                              return (
                                <div key={idx} className={`p-2 border rounded transition-all ${isAdded ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:shadow-sm'}`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">
                                        {concept.name}
                                        {isAdded && <span className="ml-1 text-green-600">✓</span>}
                                      </h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                      {concept.percentage && (
                                        <Badge className="bg-red-100 text-red-700 text-xs mt-1">{concept.percentage}%</Badge>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(concept, "descuentos")}
                                        className="h-7 w-7 p-0 flex-shrink-0"
                                        disabled={isAdded}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                      {isAdded && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Aportaciones */}
                        <div>
                          <h4 className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-2">
                            <Users className="w-4 h-4" />
                            Aportaciones
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.aportaciones.map((concept, idx) => {
                              const isAdded = generalConcepts.find(c => c.concept_name === concept.name);
                              return (
                                <div key={idx} className={`p-2 border rounded transition-all ${isAdded ? 'bg-green-50 border-green-300' : 'bg-blue-50 border-blue-200 hover:shadow-sm'}`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">
                                        {concept.name}
                                        {isAdded && <span className="ml-1 text-green-600">✓</span>}
                                      </h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                      {concept.percentage && (
                                        <Badge className="bg-blue-100 text-blue-700 text-xs mt-1">{concept.percentage}%</Badge>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(concept, "aportaciones")}
                                        className="h-7 w-7 p-0 flex-shrink-0"
                                        disabled={isAdded}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                      {isAdded && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        {/* Otros */}
                        <div>
                          <h4 className="font-semibold text-sm text-purple-700 mb-2 flex items-center gap-2">
                            <AlertCircle className="w-4 h-4" />
                            Otros
                          </h4>
                          <div className="space-y-2">
                            {PREDEFINED_CONCEPTS.otros.map((concept, idx) => {
                              const isAdded = generalConcepts.find(c => c.concept_name === concept.name);
                              return (
                                <div key={idx} className={`p-2 border rounded transition-all ${isAdded ? 'bg-green-50 border-green-300' : 'bg-white border-slate-200 hover:shadow-sm'}`}>
                                  <div className="flex items-start justify-between gap-1">
                                    <div className="flex-1 min-w-0">
                                      <h5 className="font-medium text-slate-900 text-xs truncate">
                                        {concept.name}
                                        {isAdded && <span className="ml-1 text-green-600">✓</span>}
                                      </h5>
                                      {concept.description && (
                                        <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
                                      )}
                                    </div>
                                    <div className="flex gap-1">
                                      <Button
                                        size="sm"
                                        onClick={() => handleAddPredefined(concept, "ingresos")}
                                        className="h-7 w-7 p-0 flex-shrink-0"
                                        disabled={isAdded}
                                      >
                                        <Plus className="w-3 h-3" />
                                      </Button>
                                      {isAdded && (
                                        <>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleEdit(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Edit2 className="w-3 h-3" />
                                          </Button>
                                          <Button
                                            size="sm"
                                            variant="ghost"
                                            onClick={() => handleCopy(isAdded)}
                                            className="h-7 w-7 p-0"
                                          >
                                            <Copy className="w-3 h-3" />
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            })}
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
                        Conceptos Incorporados (Todos los Empleados)
                      </h3>
                      <p className="text-xs text-slate-600 mb-4">Estos conceptos se aplican a todos los empleados</p>
                      
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
                                    onClick={() => handleEdit(concept)}
                                    className="h-7 w-7 p-0 text-slate-600 hover:text-indigo-600"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                  </Button>
                                  <Button
                                    size="sm"
                                    variant="ghost"
                                    onClick={() => handleCopy(concept)}
                                    className="h-7 w-7 p-0 text-blue-600 hover:text-blue-700"
                                  >
                                    <Copy className="w-3 h-3" />
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
            {/* Employee Search Card */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">Seleccionar Empleado</CardTitle>
                  {selectedEmployee && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setSelectedEmployee(null)}
                    >
                      Cambiar Empleado
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {!selectedEmployee ? (
                  <div>
                    <div className="relative mb-4">
                      <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                      <Input
                        placeholder="Buscar por nombre, código o departamento..."
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                        className="pl-10 h-12 text-base"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-96 overflow-y-auto">
                      {filteredEmployees.map(emp => (
                        <button
                          key={emp.id}
                          onClick={() => setSelectedEmployee(emp.id)}
                          className="p-4 border-2 border-slate-200 rounded-lg hover:border-indigo-500 hover:bg-indigo-50 transition-all text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-indigo-100 rounded-full flex items-center justify-center">
                              <Users className="w-5 h-5 text-indigo-600" />
                            </div>
                            <div className="flex-1">
                              <p className="font-semibold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </p>
                              <p className="text-xs text-slate-600">
                                {emp.employee_code} • {emp.department_name || 'Sin departamento'}
                              </p>
                            </div>
                          </div>
                        </button>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center gap-4 p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <div className="w-12 h-12 bg-indigo-600 rounded-full flex items-center justify-center">
                      <Users className="w-6 h-6 text-white" />
                    </div>
                    <div className="flex-1">
                      <p className="font-bold text-slate-900 text-lg">
                        {allEmployees.find(e => e.id === selectedEmployee)?.first_name} {allEmployees.find(e => e.id === selectedEmployee)?.last_name}
                      </p>
                      <p className="text-sm text-slate-600">
                        {allEmployees.find(e => e.id === selectedEmployee)?.employee_code} • {allEmployees.find(e => e.id === selectedEmployee)?.department_name}
                      </p>
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>

            {/* Concepts Display - Only if employee is selected */}
            {selectedEmployee && (
              <>
                {/* General Concepts Applicable */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-green-50/50">
                    <CardTitle className="text-lg font-bold flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      Conceptos Generales Aplicables
                    </CardTitle>
                    <p className="text-sm text-slate-600 mt-1">
                      Estos conceptos se aplicarán automáticamente a este empleado
                    </p>
                  </CardHeader>
                  <CardContent className="p-6">
                    {generalConcepts.length === 0 ? (
                      <div className="text-center py-8 text-slate-500">
                        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p>No hay conceptos generales configurados</p>
                        <p className="text-xs mt-1">Ve a la pestaña "Configuración General" para agregar conceptos</p>
                      </div>
                    ) : (
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                        {generalConcepts.map(concept => (
                          <div key={concept.id} className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                            <div className="flex items-center gap-2 mb-2">
                              {concept.concept_type === "Ingreso" ? (
                                <TrendingUp className="w-4 h-4 text-green-600" />
                              ) : concept.concept_type === "Aportación" ? (
                                <Users className="w-4 h-4 text-blue-600" />
                              ) : (
                                <TrendingDown className="w-4 h-4 text-red-600" />
                              )}
                              <span className="font-semibold text-slate-900 text-sm">{concept.concept_name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <Badge className={
                                concept.concept_type === "Ingreso" 
                                  ? "bg-green-100 text-green-700 text-xs" 
                                  : concept.concept_type === "Aportación"
                                  ? "bg-blue-100 text-blue-700 text-xs"
                                  : "bg-red-100 text-red-700 text-xs"
                              }>
                                {concept.concept_type}
                              </Badge>
                              {concept.is_dynamic && (
                                <Badge className="bg-purple-100 text-purple-700 text-xs">
                                  Dinámico
                                </Badge>
                              )}
                            </div>
                            {concept.is_dynamic ? (
                              <p className="text-xs text-slate-600 mt-2 font-mono">
                                {concept.calculation_formula}
                              </p>
                            ) : (
                              <p className={`font-bold text-sm mt-2 ${
                                concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                              }`}>
                                S/ {concept.amount.toFixed(2)}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Individual Concepts */}
                <Card className="border-0 shadow-lg">
                  <CardHeader className="border-b bg-blue-50/50">
                    <div className="flex items-center justify-between">
                      <div>
                        <CardTitle className="text-lg font-bold flex items-center gap-2">
                          <User className="w-5 h-5 text-blue-600" />
                          Conceptos Específicos del Empleado
                        </CardTitle>
                        <p className="text-sm text-slate-600 mt-1">
                          Conceptos únicos que solo se aplican a este empleado
                        </p>
                      </div>
                      <Button size="sm" onClick={() => setShowForm(true)} className="bg-blue-600 hover:bg-blue-700">
                        <Plus className="w-4 h-4 mr-2" />
                        Agregar Concepto
                      </Button>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    {individualConcepts.length === 0 ? (
                      <div className="text-center py-12 text-slate-500">
                        <AlertCircle className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                        <p className="font-semibold mb-1">No hay conceptos específicos</p>
                        <p className="text-xs">Este empleado solo tiene los conceptos generales aplicables</p>
                        <Button 
                          size="sm" 
                          onClick={() => setShowForm(true)}
                          className="mt-4"
                          variant="outline"
                        >
                          <Plus className="w-4 h-4 mr-2" />
                          Agregar Primer Concepto
                        </Button>
                      </div>
                    ) : (
                      <div className="space-y-3">
                        {individualConcepts.map(concept => (
                          <div key={concept.id} className="p-4 border-2 border-blue-200 bg-blue-50/30 rounded-lg hover:shadow-md transition-all">
                            <div className="flex items-start justify-between">
                              <div className="flex-1">
                                <div className="flex items-center gap-2 mb-2">
                                  {concept.concept_type === "Ingreso" ? (
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                  ) : concept.concept_type === "Aportación" ? (
                                    <Users className="w-5 h-5 text-blue-600" />
                                  ) : (
                                    <TrendingDown className="w-5 h-5 text-red-600" />
                                  )}
                                  <span className="font-bold text-slate-900 text-base">{concept.concept_name}</span>
                                  <Badge className={
                                    concept.concept_type === "Ingreso" 
                                      ? "bg-green-100 text-green-700" 
                                      : concept.concept_type === "Aportación"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-red-100 text-red-700"
                                  }>
                                    {concept.concept_type}
                                  </Badge>
                                  {concept.is_recurring && (
                                    <Badge className="bg-indigo-100 text-indigo-700">Recurrente</Badge>
                                  )}
                                </div>
                                {concept.is_dynamic ? (
                                  <div className="mt-2">
                                    <Badge className="bg-purple-100 text-purple-700 text-xs">
                                      Cálculo Dinámico
                                    </Badge>
                                    <p className="text-sm text-slate-600 mt-2 font-mono bg-white p-2 rounded border">
                                      {concept.calculation_formula}
                                    </p>
                                  </div>
                                ) : (
                                  <p className={`font-bold text-lg mt-2 ${
                                    concept.concept_type === "Ingreso" ? "text-green-600" : "text-red-600"
                                  }`}>
                                    S/ {concept.amount.toFixed(2)}
                                  </p>
                                )}
                                {concept.notes && (
                                  <p className="text-sm text-slate-600 mt-2 bg-white p-2 rounded border">
                                    {concept.notes}
                                  </p>
                                )}
                              </div>
                              <div className="flex gap-2 ml-4">
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleEdit(concept)}
                                  className="text-blue-600 hover:text-blue-700 hover:bg-blue-50"
                                >
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => handleCopy(concept)}
                                  className="text-indigo-600 hover:text-indigo-700 hover:bg-indigo-50"
                                >
                                  <Copy className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => deleteConceptMutation.mutate(concept.id)}
                                  className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Summary Card */}
                <Card className="border-0 shadow-lg bg-gradient-to-br from-slate-50 to-slate-100">
                  <CardContent className="p-6">
                    <div className="grid grid-cols-3 gap-6 text-center">
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Conceptos Generales</p>
                        <p className="text-2xl font-bold text-slate-900">{generalConcepts.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Conceptos Específicos</p>
                        <p className="text-2xl font-bold text-blue-600">{individualConcepts.length}</p>
                      </div>
                      <div>
                        <p className="text-sm text-slate-600 mb-1">Total Conceptos</p>
                        <p className="text-2xl font-bold text-indigo-600">{generalConcepts.length + individualConcepts.length}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </>
            )}
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
                <CardTitle className="text-xl font-bold">
                  {editingConcept ? "Editar Concepto" : "Agregar Concepto"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Concepto *</Label>
                  <Select value={formData.concept_type} onValueChange={(v) => setFormData({...formData, concept_type: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Ingreso">Ingreso</SelectItem>
                      <SelectItem value="Descuento">Descuento</SelectItem>
                      <SelectItem value="Aportación">Aportación</SelectItem>
                      <SelectItem value="Otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <Label>Categoría</Label>
                  <Select value={formData.concept_category} onValueChange={(v) => setFormData({...formData, concept_category: v})}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Remuneración Base">Remuneración Base</SelectItem>
                      <SelectItem value="Bonificaciones">Bonificaciones</SelectItem>
                      <SelectItem value="Horas Extras">Horas Extras</SelectItem>
                      <SelectItem value="Asignaciones">Asignaciones</SelectItem>
                      <SelectItem value="AFP/ONP">AFP/ONP</SelectItem>
                      <SelectItem value="Impuestos">Impuestos</SelectItem>
                      <SelectItem value="Préstamos">Préstamos</SelectItem>
                      <SelectItem value="Descuentos Varios">Descuentos Varios</SelectItem>
                      <SelectItem value="EsSalud">EsSalud</SelectItem>
                      <SelectItem value="SCTR">SCTR</SelectItem>
                      <SelectItem value="Otros">Otros</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del Concepto *</Label>
                  <Input
                    value={formData.concept_name}
                    onChange={(e) => setFormData({...formData, concept_name: e.target.value})}
                    placeholder="Ej: Bono productividad"
                  />
                </div>

                <div>
                  <Label>Código</Label>
                  <Input
                    value={formData.concept_code}
                    onChange={(e) => setFormData({...formData, concept_code: e.target.value})}
                    placeholder="Ej: ING001"
                  />
                </div>
              </div>

              <div>
                <Label>Descripción</Label>
                <Textarea
                  value={formData.description}
                  onChange={(e) => setFormData({...formData, description: e.target.value})}
                  placeholder="Descripción detallada del concepto..."
                  rows={2}
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

              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="recurring"
                    checked={formData.is_recurring}
                    onChange={(e) => setFormData({...formData, is_recurring: e.target.checked})}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="recurring" className="text-sm text-slate-600">
                    Concepto recurrente (se aplica todos los meses)
                  </label>
                </div>

                <div className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    id="mandatory"
                    checked={formData.is_mandatory}
                    onChange={(e) => setFormData({...formData, is_mandatory: e.target.checked})}
                    className="w-4 h-4 rounded"
                  />
                  <label htmlFor="mandatory" className="text-sm font-semibold text-indigo-700">
                    Concepto obligatorio (debe aplicarse siempre)
                  </label>
                </div>
              </div>

              <div>
                <Label>Aplica a Tipos de Planilla</Label>
                <div className="flex gap-3 mt-2">
                  {["Quincenal", "Mensual", "Adicional"].map(type => (
                    <div key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`type_${type}`}
                        checked={formData.applies_to_payroll_types?.includes(type)}
                        onChange={(e) => {
                          const current = formData.applies_to_payroll_types || [];
                          if (e.target.checked) {
                            setFormData({...formData, applies_to_payroll_types: [...current, type]});
                          } else {
                            setFormData({...formData, applies_to_payroll_types: current.filter(t => t !== type)});
                          }
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor={`type_${type}`} className="text-sm">
                        {type}
                      </label>
                    </div>
                  ))}
                </div>
              </div>

              <div>
                <Label>Notas Adicionales</Label>
                <Textarea
                  value={formData.notes}
                  onChange={(e) => setFormData({...formData, notes: e.target.value})}
                  placeholder="Información adicional sobre este concepto..."
                  rows={2}
                />
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
                  {createConceptMutation.isPending ? "Guardando..." : editingConcept ? "Actualizar" : "Guardar Concepto"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}