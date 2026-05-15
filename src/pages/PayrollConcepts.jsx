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
  TrendingDown, Users, AlertCircle, Edit2, CheckCircle, User, Copy, Upload, FileSpreadsheet, Loader2
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
  const [formErrors, setFormErrors] = useState({});
  const [isSaving, setIsSaving] = useState(false);
  const [showBulkUpload, setShowBulkUpload] = useState(false);
  const [uploadedFile, setUploadedFile] = useState(null);
  const [processingFile, setProcessingFile] = useState(false);
  const [uploadPreview, setUploadPreview] = useState([]);

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
      setIsSaving(false);
      resetForm();
    },
    onError: () => {
      toast.error(editingConcept ? "Error al actualizar" : "Error al crear el concepto");
      setIsSaving(false);
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

    const conceptData = {
      employee_id: selectedEmployee || "general",
      concept_type: type === "ingresos" ? "Ingreso" : type === "descuentos" ? "Descuento" : "Aportación",
      concept_name: concept.name,
      amount: concept.is_dynamic ? 0 : "",
      is_dynamic: concept.is_dynamic || false,
      calculation_formula: formula,
      month: selectedMonth,
      year: selectedYear,
      is_recurring: false,
      is_applied: false,
      notes: description,
    };

    setFormData({
      ...conceptData,
      amount: concept.is_dynamic ? "0" : "",
    });
    setShowForm(true);
  };

  const handleSubmit = async () => {
    // Validación con mensajes en el modal
    const errors = {};

    if (!formData.concept_name?.trim()) {
      errors.concept_name = "El nombre del concepto es obligatorio";
    }

    if (!formData.is_dynamic) {
      const amountVal = parseFloat(formData.amount);
      if (formData.amount === "" || formData.amount === null || formData.amount === undefined || isNaN(amountVal)) {
        errors.amount = "Ingresa un monto válido (puede ser 0.00)";
      }
    }

    if (formData.is_dynamic && !formData.calculation_formula?.trim()) {
      errors.calculation_formula = "La fórmula de cálculo es obligatoria";
    }

    if (activeTab === "individual" && !selectedEmployee) {
      errors.employee = "Debes seleccionar un empleado primero";
    }

    if (formData.applies_to_payroll_types?.length === 0) {
      errors.applies_to_payroll_types = "Selecciona al menos un tipo de planilla";
    }

    if (Object.keys(errors).length > 0) {
      setFormErrors(errors);
      return;
    }

    setFormErrors({});
    setIsSaving(true);

    const conceptData = {
      ...formData,
      employee_id: activeTab === "general" ? "general" : selectedEmployee,
      amount: formData.is_dynamic ? 0 : parseFloat(formData.amount),
      month: formData.month || selectedMonth,
      year: formData.year || selectedYear,
    };

    // Si es ONP y es concepto general, sincronizar con empleados que tienen ONP
    if (activeTab === "general" && formData.concept_name === "ONP") {
      try {
        const onpEmployees = allEmployees.filter(emp => emp.pension_system === "ONP");
        
        await base44.entities.PayrollConcept.create(conceptData);
        
        for (const emp of onpEmployees) {
          await base44.entities.PayrollConcept.create({
            ...conceptData,
            employee_id: emp.id,
            notes: `${conceptData.notes || "ONP - 13% sobre remuneración bruta"} (Auto-asignado)`
          });
        }
        
        queryClient.invalidateQueries(["payrollConcepts"]);
        toast.success(`Concepto ONP agregado para ${onpEmployees.length} empleados con ONP`);
        setIsSaving(false);
        resetForm();
      } catch (error) {
        toast.error("Error al guardar el concepto ONP");
        setIsSaving(false);
      }
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

  const handleBulkUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setProcessingFile(true);
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });

      const extractedData = await base44.integrations.Core.ExtractDataFromUploadedFile({
        file_url,
        json_schema: {
          type: "object",
          properties: {
            concepts: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  document_number: { type: "string" },
                  concept_type: { type: "string" },
                  concept_category: { type: "string" },
                  concept_name: { type: "string" },
                  concept_code: { type: "string" },
                  description: { type: "string" },
                  amount: { type: "number" },
                  is_dynamic: { type: "boolean" },
                  calculation_formula: { type: "string" },
                  is_recurring: { type: "boolean" },
                  is_mandatory: { type: "boolean" },
                  applies_to_payroll_types: { type: "string" },
                  notes: { type: "string" },
                }
              }
            }
          }
        }
      });

      if (extractedData.status === "success" && extractedData.output?.concepts) {
        setUploadPreview(extractedData.output.concepts);
        toast.success(`${extractedData.output.concepts.length} conceptos cargados para revisión`);
      } else {
        toast.error("Error al procesar el archivo");
      }
    } catch (error) {
      toast.error("Error al cargar el archivo");
      console.error(error);
    } finally {
      setProcessingFile(false);
    }
  };

  const bulkCreateMutation = useMutation({
    mutationFn: async (concepts) => {
      const results = { success: 0, errors: 0, errorDetails: [] };
      
      for (const concept of concepts) {
        try {
          const emp = allEmployees.find(e => e.document_number === concept.document_number);
          if (!emp) {
            results.errors++;
            results.errorDetails.push(`Documento ${concept.document_number} no encontrado`);
            continue;
          }

          // Parsear applies_to_payroll_types (puede venir como string separado por comas)
          let payrollTypes = ["Mensual"];
          if (concept.applies_to_payroll_types) {
            if (typeof concept.applies_to_payroll_types === 'string') {
              payrollTypes = concept.applies_to_payroll_types.split(',').map(t => t.trim());
            } else if (Array.isArray(concept.applies_to_payroll_types)) {
              payrollTypes = concept.applies_to_payroll_types;
            }
          }

          await base44.entities.PayrollConcept.create({
            employee_id: emp.id,
            concept_type: concept.concept_type || "Ingreso",
            concept_category: concept.concept_category || "",
            concept_name: concept.concept_name,
            concept_code: concept.concept_code || "",
            description: concept.description || "",
            amount: concept.is_dynamic ? 0 : parseFloat(concept.amount || 0),
            is_dynamic: concept.is_dynamic || false,
            calculation_formula: concept.calculation_formula || "",
            is_recurring: concept.is_recurring || false,
            is_mandatory: concept.is_mandatory || false,
            applies_to_payroll_types: payrollTypes,
            month: selectedMonth,
            year: selectedYear,
            is_applied: false,
            notes: concept.notes || "",
          });
          
          results.success++;
        } catch (error) {
          console.error("Error creating concept:", error);
          results.errors++;
          results.errorDetails.push(`Error en documento ${concept.document_number}: ${error.message}`);
        }
      }
      
      return results;
    },
    onSuccess: (results) => {
      queryClient.invalidateQueries(["payrollConcepts"]);
      if (results.errors > 0) {
        toast.error(`${results.success} conceptos creados. ${results.errors} errores. Revisa la consola para detalles.`, { duration: 6000 });
        console.error("Errores en carga masiva:", results.errorDetails);
      } else {
        toast.success(`${results.success} conceptos creados exitosamente`);
      }
      setShowBulkUpload(false);
      setUploadPreview([]);
      setUploadedFile(null);
    },
    onError: () => {
      toast.error("Error en la carga masiva");
    },
  });

  const downloadBulkTemplate = () => {
    const template = `document_number,concept_type,concept_category,concept_name,concept_code,description,amount,is_dynamic,calculation_formula,is_recurring,is_mandatory,applies_to_payroll_types,notes
76549618,Ingreso,Bonificaciones,Bono Productividad,ING001,Bono por metas cumplidas,500,FALSE,,FALSE,FALSE,"Mensual,Quincenal",
76549618,Descuento,Préstamos,Préstamo Personal,DESC001,Cuota mensual préstamo,200,FALSE,,TRUE,FALSE,Mensual,Cuota 1 de 12
08123456,Ingreso,Horas Extras,Comisión Ventas,ING002,Comisión 5% sobre ventas,0,TRUE,ventas_mensuales * 0.05,TRUE,FALSE,Mensual,
08123456,Descuento,Descuentos Varios,Descuento Tardanza,DESC002,Descuento por llegar tarde,50,FALSE,,FALSE,FALSE,Mensual,`;

    const blob = new Blob([template], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla_conceptos_masivos.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast.success("Plantilla descargada");
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
    setFormErrors({});
    setIsSaving(false);
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
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-6 sm:mb-8 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-slate-900 mb-2">
              Gestión de Conceptos de Planilla
            </h1>
            <p className="text-slate-600 text-sm sm:text-base lg:text-lg">
              Configura ingresos, descuentos y aportaciones según legislación peruana
            </p>
          </div>
          <div className="flex flex-wrap gap-2 sm:gap-3">
            <Button
              onClick={() => setShowForm(true)}
              className="bg-indigo-600 hover:bg-indigo-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Concepto
            </Button>
            <Button
              onClick={() => setShowBulkUpload(true)}
              variant="outline"
              className="text-green-600 hover:text-green-700 hover:bg-green-50"
            >
              <Users className="w-4 h-4 mr-2" />
              Carga Masiva
            </Button>
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
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.total}</span>
              <span className="text-sm text-slate-600">Total Conceptos</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingUp className="w-5 h-5 text-green-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.ingresos}</span>
              <span className="text-sm text-slate-600">Ingresos</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <TrendingDown className="w-5 h-5 text-red-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.descuentos}</span>
              <span className="text-sm text-slate-600">Descuentos</span>
            </div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Users className="w-5 h-5 text-blue-600" />
            <div className="flex items-baseline gap-2">
              <span className="text-xl font-bold text-slate-900">{stats.aportaciones}</span>
              <span className="text-sm text-slate-600">Aportaciones</span>
            </div>
          </div>
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
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 lg:gap-6">
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
                                  <div className="flex flex-wrap gap-1 mb-2">
                                    <Badge className={
                                      concept.concept_type === "Ingreso" 
                                        ? "bg-green-100 text-green-700 text-xs" 
                                        : concept.concept_type === "Aportación"
                                        ? "bg-blue-100 text-blue-700 text-xs"
                                        : "bg-red-100 text-red-700 text-xs"
                                    }>
                                      {concept.concept_type}
                                    </Badge>
                                    {concept.concept_category && (
                                      <Badge variant="outline" className="text-xs bg-slate-50">
                                        {concept.concept_category}
                                      </Badge>
                                    )}
                                    {concept.concept_code && (
                                      <Badge variant="outline" className="text-xs">
                                        {concept.concept_code}
                                      </Badge>
                                    )}
                                    {concept.is_recurring && (
                                      <Badge className="bg-indigo-100 text-indigo-700 text-xs">Recurrente</Badge>
                                    )}
                                    {concept.is_mandatory && (
                                      <Badge className="bg-orange-100 text-orange-700 text-xs font-bold">⚠ Obligatorio</Badge>
                                    )}
                                  </div>

                                  {concept.description && (
                                    <p className="text-xs text-slate-600 mb-2 italic">{concept.description}</p>
                                  )}

                                  {concept.applies_to_payroll_types && concept.applies_to_payroll_types.length > 0 && (
                                    <div className="flex gap-1 mb-2">
                                      <span className="text-xs text-slate-500">Aplica a:</span>
                                      {concept.applies_to_payroll_types.map(type => (
                                        <Badge key={type} variant="outline" className="text-xs bg-blue-50">
                                          {type}
                                        </Badge>
                                      ))}
                                    </div>
                                  )}

                                  {concept.is_dynamic ? (
                                    <div className="mt-2">
                                      <Badge className="bg-purple-100 text-purple-700 text-xs">
                                        Dinámico
                                      </Badge>
                                      <p className="text-xs text-slate-600 mt-1 font-mono bg-slate-50 p-1 rounded">
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
                                    <p className="text-xs text-slate-500 mt-1 bg-yellow-50 p-1 rounded border border-yellow-200">
                                      📝 {concept.notes}
                                    </p>
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
                            
                            <div className="flex flex-wrap gap-1 mb-2">
                              <Badge className={
                                concept.concept_type === "Ingreso" 
                                  ? "bg-green-100 text-green-700 text-xs" 
                                  : concept.concept_type === "Aportación"
                                  ? "bg-blue-100 text-blue-700 text-xs"
                                  : "bg-red-100 text-red-700 text-xs"
                              }>
                                {concept.concept_type}
                              </Badge>
                              {concept.concept_category && (
                                <Badge variant="outline" className="text-xs bg-slate-50">
                                  {concept.concept_category}
                                </Badge>
                              )}
                              {concept.concept_code && (
                                <Badge variant="outline" className="text-xs">
                                  {concept.concept_code}
                                </Badge>
                              )}
                              {concept.is_dynamic && (
                                <Badge className="bg-purple-100 text-purple-700 text-xs">
                                  Dinámico
                                </Badge>
                              )}
                              {concept.is_mandatory && (
                                <Badge className="bg-orange-100 text-orange-700 text-xs font-bold">⚠ Obligatorio</Badge>
                              )}
                            </div>
                            
                            {concept.description && (
                              <p className="text-xs text-slate-600 mb-2 italic">{concept.description}</p>
                            )}

                            {concept.applies_to_payroll_types && concept.applies_to_payroll_types.length > 0 && (
                              <div className="flex gap-1 mb-2 flex-wrap">
                                <span className="text-xs text-slate-500">Aplica a:</span>
                                {concept.applies_to_payroll_types.map(type => (
                                  <Badge key={type} variant="outline" className="text-xs bg-blue-50">
                                    {type}
                                  </Badge>
                                ))}
                              </div>
                            )}
                            
                            {concept.is_dynamic ? (
                              <p className="text-xs text-slate-600 mt-2 font-mono bg-slate-50 p-1 rounded">
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
                                <div className="flex items-center gap-2 mb-2 flex-wrap">
                                  {concept.concept_type === "Ingreso" ? (
                                    <TrendingUp className="w-5 h-5 text-green-600" />
                                  ) : concept.concept_type === "Aportación" ? (
                                    <Users className="w-5 h-5 text-blue-600" />
                                  ) : (
                                    <TrendingDown className="w-5 h-5 text-red-600" />
                                  )}
                                  <span className="font-bold text-slate-900 text-base">{concept.concept_name}</span>
                                  {concept.concept_code && (
                                    <Badge variant="outline" className="text-xs">
                                      {concept.concept_code}
                                    </Badge>
                                  )}
                                  <Badge className={
                                    concept.concept_type === "Ingreso" 
                                      ? "bg-green-100 text-green-700" 
                                      : concept.concept_type === "Aportación"
                                      ? "bg-blue-100 text-blue-700"
                                      : "bg-red-100 text-red-700"
                                  }>
                                    {concept.concept_type}
                                  </Badge>
                                  {concept.concept_category && (
                                    <Badge variant="outline" className="bg-slate-50">
                                      {concept.concept_category}
                                    </Badge>
                                  )}
                                  {concept.is_recurring && (
                                    <Badge className="bg-indigo-100 text-indigo-700">Recurrente</Badge>
                                  )}
                                  {concept.is_mandatory && (
                                    <Badge className="bg-orange-100 text-orange-700 font-bold">⚠ Obligatorio</Badge>
                                  )}
                                </div>

                                {concept.description && (
                                  <p className="text-sm text-slate-600 mb-2 italic">{concept.description}</p>
                                )}

                                {concept.applies_to_payroll_types && concept.applies_to_payroll_types.length > 0 && (
                                  <div className="flex gap-1 mb-2 flex-wrap">
                                    <span className="text-xs text-slate-500">Aplica a:</span>
                                    {concept.applies_to_payroll_types.map(type => (
                                      <Badge key={type} variant="outline" className="text-xs bg-blue-50">
                                        {type}
                                      </Badge>
                                    ))}
                                  </div>
                                )}
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
                                  <p className="text-sm text-slate-600 mt-2 bg-yellow-50 p-2 rounded border border-yellow-200">
                                    📝 {concept.notes}
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

      {/* Bulk Upload Modal */}
      {showBulkUpload && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setShowBulkUpload(false)}
        >
          <Card 
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <Upload className="w-5 h-5 text-green-600" />
                  Carga Masiva de Conceptos
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowBulkUpload(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h4 className="font-bold text-blue-900 mb-2">📋 Instrucciones</h4>
                <ul className="text-sm text-blue-800 space-y-1">
                  <li>1. Descarga la plantilla CSV con el formato correcto</li>
                  <li>2. Completa los datos de cada concepto usando <strong>número de documento</strong> (preserva ceros iniciales)</li>
                  <li>3. Para <strong>is_dynamic, is_recurring, is_mandatory</strong> usa: TRUE o FALSE</li>
                  <li>4. Para <strong>applies_to_payroll_types</strong> separa con comas: "Mensual,Quincenal"</li>
                  <li>5. Sube el archivo completado para procesar</li>
                </ul>
                <Button
                  onClick={downloadBulkTemplate}
                  variant="outline"
                  size="sm"
                  className="mt-3"
                >
                  <FileSpreadsheet className="w-4 h-4 mr-2" />
                  Descargar Plantilla CSV
                </Button>
              </div>

              <div>
                <Label>Cargar Archivo CSV</Label>
                <Input
                  type="file"
                  accept=".csv"
                  onChange={handleBulkUpload}
                  disabled={processingFile}
                  className="mt-2"
                />
                {processingFile && (
                  <div className="flex items-center gap-2 mt-2 text-blue-600">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span className="text-sm">Procesando archivo...</span>
                  </div>
                )}
              </div>

              {uploadPreview.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="font-bold text-slate-900">
                      Vista Previa ({uploadPreview.length} conceptos)
                    </h4>
                    <Button
                      onClick={() => bulkCreateMutation.mutate(uploadPreview)}
                      disabled={bulkCreateMutation.isPending}
                      className="bg-green-600 hover:bg-green-700"
                    >
                      {bulkCreateMutation.isPending ? (
                        <>
                          <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                          Importando...
                        </>
                      ) : (
                        <>
                          <CheckCircle className="w-4 h-4 mr-2" />
                          Importar Conceptos
                        </>
                      )}
                    </Button>
                  </div>

                  <div className="border rounded-lg max-h-96 overflow-y-auto">
                    <table className="w-full text-sm">
                      <thead className="bg-slate-100 sticky top-0">
                        <tr>
                          <th className="text-left p-2 text-xs">N° Doc</th>
                          <th className="text-left p-2 text-xs">Empleado</th>
                          <th className="text-left p-2 text-xs">Tipo</th>
                          <th className="text-left p-2 text-xs">Categoría</th>
                          <th className="text-left p-2 text-xs">Concepto</th>
                          <th className="text-left p-2 text-xs">Código</th>
                          <th className="text-right p-2 text-xs">Monto</th>
                          <th className="text-center p-2 text-xs">Recurrente</th>
                          <th className="text-center p-2 text-xs">Obligatorio</th>
                        </tr>
                      </thead>
                      <tbody>
                        {uploadPreview.map((item, idx) => {
                          const emp = allEmployees.find(e => e.document_number === item.document_number);
                          return (
                            <tr key={idx} className={`border-t ${!emp ? 'bg-red-50' : ''}`}>
                              <td className="p-2 font-mono">
                                {item.document_number}
                                {!emp && <span className="text-red-600 text-xs block">⚠ No encontrado</span>}
                              </td>
                              <td className="p-2 text-xs">
                                {emp ? `${emp.first_name} ${emp.last_name}` : "-"}
                              </td>
                              <td className="p-2">
                                <Badge className={
                                  item.concept_type === "Ingreso" 
                                    ? "bg-green-100 text-green-700 text-xs" 
                                    : item.concept_type === "Aportación"
                                    ? "bg-blue-100 text-blue-700 text-xs"
                                    : "bg-red-100 text-red-700 text-xs"
                                }>
                                  {item.concept_type}
                                </Badge>
                              </td>
                              <td className="p-2 text-xs">{item.concept_category || "-"}</td>
                              <td className="p-2 font-medium text-xs">{item.concept_name}</td>
                              <td className="p-2 text-xs font-mono">{item.concept_code || "-"}</td>
                              <td className="p-2 text-right text-xs">
                                {item.is_dynamic ? (
                                  <Badge className="bg-purple-100 text-purple-700 text-xs">Dinámico</Badge>
                                ) : (
                                  `S/ ${parseFloat(item.amount || 0).toFixed(2)}`
                                )}
                              </td>
                              <td className="p-2 text-center text-xs">
                                {item.is_recurring ? "✓" : "-"}
                              </td>
                              <td className="p-2 text-center text-xs">
                                {item.is_mandatory ? "⚠" : "-"}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Form Modal */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4 overflow-y-auto"
          onClick={resetForm}
        >
          <Card 
            className="max-w-lg w-full my-4"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingConcept ? "Editar Concepto" : "Agregar Concepto"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3">
                <p className="text-sm text-amber-800">
                  {activeTab === "general" 
                    ? "Este concepto se aplicará a todos los empleados automáticamente"
                    : "Este concepto se aplicará solo al empleado seleccionado"
                  }
                </p>
              </div>

              {/* Panel de errores central */}
              {Object.keys(formErrors).length > 0 && (
                <div className="bg-red-50 border border-red-300 rounded-lg p-4">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="text-sm font-semibold text-red-800 mb-1">Por favor corrige los siguientes errores:</p>
                      <ul className="space-y-0.5">
                        {Object.values(formErrors).map((err, i) => (
                          <li key={i} className="text-sm text-red-700">• {err}</li>
                        ))}
                      </ul>
                    </div>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Concepto *</Label>
                  <Select value={formData.concept_type} onValueChange={(v) => { setFormData({...formData, concept_type: v}); setFormErrors(e => ({...e, concept_type: undefined})); }}>
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
                    onChange={(e) => { setFormData({...formData, concept_name: e.target.value}); setFormErrors(er => ({...er, concept_name: undefined})); }}
                    placeholder="Ej: Bono productividad"
                    className={formErrors.concept_name ? "border-red-400 focus:ring-red-400" : ""}
                  />
                  {formErrors.concept_name && <p className="text-xs text-red-600 mt-1">{formErrors.concept_name}</p>}
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
                    amount: v === "dynamic" ? "0" : "",
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
                    onChange={(e) => { setFormData({...formData, calculation_formula: e.target.value}); setFormErrors(er => ({...er, calculation_formula: undefined})); }}
                    placeholder="Ej: base_salary * 0.10"
                    className={`font-mono text-sm ${formErrors.calculation_formula ? "border-red-400" : ""}`}
                  />
                  {formErrors.calculation_formula && <p className="text-xs text-red-600 mt-1">{formErrors.calculation_formula}</p>}
                  <p className="text-xs text-slate-500 mt-1">
                    Variables: <span className="font-mono">base_salary, worked_days, rmv, horas_extras_25, horas_extras_35, horas_nocturnas</span>
                  </p>
                </div>
              ) : (
                <div>
                  <Label>Monto (S/) *</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0"
                    value={formData.amount}
                    onChange={(e) => { setFormData({...formData, amount: e.target.value}); setFormErrors(er => ({...er, amount: undefined})); }}
                    placeholder="0.00"
                    className={formErrors.amount ? "border-red-400" : ""}
                  />
                  {formErrors.amount && <p className="text-xs text-red-600 mt-1">{formErrors.amount}</p>}
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
                <div className="flex gap-3 mt-2 flex-wrap">
                  {["Quincenal", "Mensual", "Adicional", "SNP"].map(type => (
                    <div key={type} className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`type_${type}`}
                        checked={formData.applies_to_payroll_types?.includes(type)}
                        onChange={(e) => {
                          const current = formData.applies_to_payroll_types || [];
                          const updated = e.target.checked ? [...current, type] : current.filter(t => t !== type);
                          setFormData({...formData, applies_to_payroll_types: updated});
                          setFormErrors(er => ({...er, applies_to_payroll_types: undefined}));
                        }}
                        className="w-4 h-4 rounded"
                      />
                      <label htmlFor={`type_${type}`} className="text-sm">
                        {type}
                      </label>
                    </div>
                  ))}
                </div>
                {formErrors.applies_to_payroll_types && (
                  <p className="text-xs text-red-600 mt-1">{formErrors.applies_to_payroll_types}</p>
                )}
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
                <Button variant="outline" className="flex-1" onClick={resetForm} disabled={isSaving}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Guardando...
                    </span>
                  ) : editingConcept ? "Actualizar Concepto" : "Guardar Concepto"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}