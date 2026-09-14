import React, { useState, useEffect, useMemo } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Save, Eye, Plus, Edit, Trash2,
  Star, Copy, CheckCircle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";
import { usePermissions } from "@/components/hooks/usePermissions";
import {
  STANDARD_SECTIONS,
  FINAL_SECTIONS,
  DEFAULT_STANDARD_ORDER,
  DEFAULT_FINAL_ORDER,
  buildOrderedSections,
  moveItem,
} from "@/lib/contractSections";
import { ArrowUp, ArrowDown, GripVertical } from "lucide-react";

const DEFAULT_TEMPLATE = {
  template_name: "",
  description: "",
  is_default: false,
  is_active: true,
  contract_types: [],
  company_name: "",
  company_ruc: "",
  company_address: "",
  company_representative: "",
  company_representative_doc: "",
  // Título y encabezado
  contract_title: "CONTRATO DE TRABAJO",
  contract_subtitle: "{contract_type}",
  // Sección Empleador (sin numeral — es bloque de datos)
  employer_section_title: "DATOS DEL EMPLEADOR:",
  employer_section_text: "Empresa: {company_name}\nRUC: {company_ruc}\nDomicilio: {company_address}\nRepresentante Legal: {company_representative}\nDocumento: {company_representative_doc}",
  // Sección Trabajador (sin numeral — es bloque de datos)
  worker_section_title: "DATOS DEL TRABAJADOR:",
  worker_section_text: "Nombres y Apellidos: {employee_name}\n{employee_doc_type}: {employee_doc_number}\nDomicilio: {employee_address}",
  introduction_text: "Conste por el presente documento el Contrato de Trabajo {contract_type}, que celebran al amparo del Texto Único Ordenado del Decreto Legislativo N° 728, Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N° 003-97-TR, y normas complementarias:",
  // Cláusulas estándar (numerales automáticos 1-5, orden configurable)
  section_object_title: "OBJETO DEL CONTRATO:",
  contract_object_text: "Por el presente contrato, EL TRABAJADOR se obliga a prestar sus servicios personales a EL EMPLEADOR, desempeñando el cargo de {position} en el área de {department}, bajo subordinación y dependencia de EL EMPLEADOR.",
  section_functions_title: "FUNCIONES Y RESPONSABILIDADES:",
  functions_intro_text: "El trabajador desempeñará las siguientes funciones y responsabilidades:",
  section_duration_title: "VIGENCIA DEL CONTRATO:",
  duration_indeterminate_text: "El presente contrato tiene carácter de INDETERMINADO, iniciando su vigencia el {start_date}.",
  duration_fixed_text: "El presente contrato tendrá una duración determinada, iniciando el {start_date} y finalizando el {end_date}{renewable_clause}.",
  trial_period_text: "El contrato está sujeto a un período de prueba de {trial_period_days} días calendario, durante el cual cualquiera de las partes puede darlo por terminado sin expresión de causa.",
  section_salary_title: "REMUNERACIÓN:",
  salary_text: "EL EMPLEADOR pagará a EL TRABAJADOR una remuneración mensual de S/ {salary} ({salary_words} SOLES), pagadera mensualmente, sujeta a los descuentos de ley.",
  section_schedule_title: "JORNADA Y HORARIO DE TRABAJO:",
  schedule_text: "La jornada laboral será de {weekly_hours} horas semanales, distribuidas de la siguiente manera: {work_schedule}.",
  work_location_text: "EL TRABAJADOR prestará sus servicios en: {work_location}.",
  // Textos finales (numerales automáticos continuos, orden configurable)
  section_obligations_title: "OBLIGACIONES DEL TRABAJADOR:",
  section_benefits_title: "BENEFICIOS SOCIALES:",
  section_termination_title: "TÉRMINO DEL CONTRATO:",
  section_domicile_title: "DOMICILIO:",
  obligations_text: `1. Cumplir con el horario de trabajo establecido y registrar su asistencia.
2. Desempeñar sus funciones con diligencia, eficiencia y lealtad.
3. Cumplir con el Reglamento Interno de Trabajo y las políticas de la empresa.
4. Guardar confidencialidad sobre la información de la empresa.
5. Cuidar los bienes y recursos de la empresa.`,
  benefits_text: `EL TRABAJADOR tiene derecho a los siguientes beneficios de acuerdo a la legislación laboral peruana:
- Gratificaciones legales (Fiestas Patrias y Navidad)
- Compensación por Tiempo de Servicios (CTS)
- Vacaciones (30 días calendario por año de servicios)
- Asignación familiar (si corresponde)
- Seguro social de salud (EsSalud)`,
  termination_text: "El presente contrato podrá darse por terminado por las causas previstas en la legislación laboral vigente, especialmente las establecidas en el Decreto Supremo N° 003-97-TR.",
  domicile_text: "Para efectos del presente contrato, las partes señalan como sus domicilios los indicados en la introducción del presente documento.",
  // Órdenes de cláusulas (numeración automática)
  unified_clause_order: [],
  standard_clause_order: [...DEFAULT_STANDARD_ORDER],
  final_text_order: [...DEFAULT_FINAL_ORDER],
};

const CONTRACT_TYPES = [
  "Indeterminado",
  "Plazo Fijo",
  "Part-Time",
  "Prácticas",
  "Obra o Servicio",
  "Intermitente",
  "Temporal"
];

export default function ContractTemplateConfig() {
  const { hasPermission, loading: permissionsLoading } = usePermissions();
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateData, setTemplateData] = useState({ ...DEFAULT_TEMPLATE });
  const [showClauseForm, setShowClauseForm] = useState(false);
  const [editingClause, setEditingClause] = useState(null);
  const [clauseData, setClauseData] = useState({
    title: "",
    content: "",
    type: "opcional",
    contract_types: [],
    order: 0,
    is_active: true,
    category: "general",
  });
  const [selectedClauses, setSelectedClauses] = useState([]);

  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const queryClient = useQueryClient();

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await entitiesAPI.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
    enabled: !!employee,
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["contractTemplates"],
    queryFn: async () => {
      return await entitiesAPI.ContractTemplate.list("-created_date");
    },
    enabled: !!employee,
  });

  const { data: clauses = [] } = useQuery({
    queryKey: ["contractClauses"],
    queryFn: async () => {
      return await entitiesAPI.ContractClause.list("order");
    },
    enabled: !!employee,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      if (data.is_default) {
        const currentDefault = templates.find(t => t.is_default);
        if (currentDefault) {
          await entitiesAPI.ContractTemplate.update(currentDefault.id, { is_default: false });
        }
      }
      return await entitiesAPI.ContractTemplate.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractTemplates"]);
      toast.success("Plantilla creada correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al crear la plantilla");
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      // Si esta plantilla se marca como default, quitar el default de las demás
      if (data.is_default) {
        const currentDefault = templates.find(t => t.is_default && t.id !== id);
        if (currentDefault) {
          await entitiesAPI.ContractTemplate.update(currentDefault.id, { is_default: false });
        }
      }
      return await entitiesAPI.ContractTemplate.update(id, data);
    },
    onSuccess: async () => {
      // Actualizar todas las plantillas existentes con los nuevos datos de empresa
      if (companyInfo) {
        const updatedCompanyData = {
          company_name: companyInfo.company_name || "",
          company_ruc: companyInfo.ruc || "",
          company_address: companyInfo.address || "",
          company_representative: companyInfo.legal_representative || "",
          company_representative_doc: companyInfo.legal_representative_dni
            ? `DNI ${companyInfo.legal_representative_dni}` : "",
        };

        // Actualizar todas las plantillas en paralelo
        const updatePromises = templates.map(t =>
          entitiesAPI.ContractTemplate.update(t.id, updatedCompanyData)
        );
        await Promise.all(updatePromises);
      }

      queryClient.invalidateQueries(["contractTemplates"]);
      toast.success("Plantilla actualizada correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al actualizar la plantilla");
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.ContractTemplate.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractTemplates"]);
      toast.success("Plantilla eliminada correctamente");
    },
    onError: () => {
      toast.error("Error al eliminar la plantilla");
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: async (templateId) => {
      // Quitar el default de todas
      for (const t of templates.filter(t => t.is_default)) {
        await entitiesAPI.ContractTemplate.update(t.id, { is_default: false });
      }
      // Establecer el nuevo default
      return await entitiesAPI.ContractTemplate.update(templateId, { is_default: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractTemplates"]);
      toast.success("Plantilla establecida como predeterminada");
    },
  });

  const createClauseMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.ContractClause.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractClauses"]);
      toast.success("Cláusula creada correctamente");
      resetClauseForm();
    },
  });

  const updateClauseMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.ContractClause.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractClauses"]);
      toast.success("Cláusula actualizada correctamente");
      resetClauseForm();
    },
  });

  const deleteClauseMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.ContractClause.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractClauses"]);
      toast.success("Cláusula eliminada correctamente");
    },
  });

  // Sincronizar con CompanyInfo automáticamente
  useEffect(() => {
    if (companyInfo && (showForm || templates.length > 0)) {
      const updatedData = {
        company_name: companyInfo.company_name || "",
        company_ruc: companyInfo.ruc || "",
        company_address: companyInfo.address || "",
        company_representative: companyInfo.legal_representative || "",
        company_representative_doc: companyInfo.legal_representative_dni
          ? `DNI ${companyInfo.legal_representative_dni}` : "",
      };

      setTemplateData(prev => ({
        ...prev,
        ...updatedData
      }));
    }
  }, [companyInfo, showForm]);

  const handleCreate = () => {
    setEditingTemplate(null);
    const newTemplate = { ...DEFAULT_TEMPLATE };

    // Cargar datos de empresa si existen
    if (companyInfo) {
      newTemplate.company_name = companyInfo.company_name || "";
      newTemplate.company_ruc = companyInfo.ruc || "";
      newTemplate.company_address = companyInfo.address || "";
      newTemplate.company_representative = companyInfo.legal_representative || "";
      newTemplate.company_representative_doc = companyInfo.legal_representative_dni
        ? `DNI ${companyInfo.legal_representative_dni}` : "";
    }

    setTemplateData(newTemplate);
    setShowForm(true);
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setTemplateData({ ...DEFAULT_TEMPLATE, ...template });
    setShowForm(true);
  };

  const handleDuplicate = (template) => {
    setEditingTemplate(null);
    setTemplateData({
      ...DEFAULT_TEMPLATE,
      ...template,
      template_name: `${template.template_name} (Copia)`,
      is_default: false
    });
    setShowForm(true);
  };

  const handleDelete = (template) => {
    if (template.is_default) {
      toast.error("No puedes eliminar la plantilla predeterminada");
      return;
    }
    if (confirm(`¿Eliminar la plantilla "${template.template_name}"?`)) {
      deleteMutation.mutate(template.id);
    }
  };

  const handleSubmit = () => {
    if (!templateData.template_name) {
      toast.error("Ingresa un nombre para la plantilla");
      return;
    }

    // Asegurar que siempre tenga los datos más recientes de la empresa
    const dataToSave = { ...templateData };
    if (companyInfo) {
      dataToSave.company_name = companyInfo.company_name || "";
      dataToSave.company_ruc = companyInfo.ruc || "";
      dataToSave.company_address = companyInfo.address || "";
      dataToSave.company_representative = companyInfo.legal_representative || "";
      dataToSave.company_representative_doc = companyInfo.legal_representative_dni
        ? `DNI ${companyInfo.legal_representative_dni}` : "";
    }

    if (editingTemplate) {
      updateMutation.mutate({ id: editingTemplate.id, data: dataToSave });
    } else {
      createMutation.mutate(dataToSave);
    }
  };

  const resetForm = () => {
    setTemplateData({ ...DEFAULT_TEMPLATE });
    setEditingTemplate(null);
    setShowForm(false);
    setSelectedClauses([]);
  };

  const resetClauseForm = () => {
    setClauseData({
      title: "",
      content: "",
      type: "opcional",
      contract_types: [],
      order: 0,
      is_active: true,
      category: "general",
    });
    setEditingClause(null);
    setShowClauseForm(false);
  };

  const handleCreateClause = () => {
    setEditingClause(null);
    setClauseData({
      title: "",
      content: "",
      type: "opcional",
      contract_types: [],
      order: clauses.length,
      is_active: true,
      category: "general",
    });
    setShowClauseForm(true);
  };

  const handleEditClause = (clause) => {
    setEditingClause(clause);
    setClauseData(clause);
    setShowClauseForm(true);
  };

  const handleDeleteClause = (clauseId) => {
    if (confirm("¿Eliminar esta cláusula?")) {
      deleteClauseMutation.mutate(clauseId);
    }
  };

  const handleSubmitClause = () => {
    if (!clauseData.title || !clauseData.content) {
      toast.error("Completa título y contenido");
      return;
    }

    if (editingClause) {
      updateClauseMutation.mutate({ id: editingClause.id, data: clauseData });
    } else {
      createClauseMutation.mutate(clauseData);
    }
  };

  const toggleClauseContractType = (type) => {
    const types = clauseData.contract_types || [];
    if (types.includes(type)) {
      setClauseData({ ...clauseData, contract_types: types.filter(t => t !== type) });
    } else {
      setClauseData({ ...clauseData, contract_types: [...types, type] });
    }
  };

  const toggleContractType = (type) => {
    const types = templateData.contract_types || [];
    if (types.includes(type)) {
      setTemplateData({ ...templateData, contract_types: types.filter(t => t !== type) });
    } else {
      setTemplateData({ ...templateData, contract_types: [...types, type] });
    }
  };

  // ── Orden unificado de cláusulas (estándar + personalizadas en una sola lista) ──
  const activeClauses = useMemo(
    () => (clauses || []).filter(c => c.is_active),
    [clauses]
  );

  const unifiedOrder = useMemo(() => {
    return buildOrderedSections(templateData, activeClauses)
      .filter(section => section.type === "standard" || section.type === "custom")
      .map(section => section.id);
  }, [templateData, activeClauses]);

  const moveUnifiedClause = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= unifiedOrder.length) return;
    const newOrder = moveItem(unifiedOrder, index, newIndex);
    setTemplateData({ ...templateData, unified_clause_order: newOrder });
  };

  // Cláusulas personalizadas activas filtradas por tipo de contrato (igual que el PDF)
  // y ordenadas según el orden unificado. Para la vista previa se usa el primer tipo
  // de contrato de la plantilla, o todas si la plantilla aplica a todos los tipos.
  const sortedClauses = useMemo(() => {
    const templateTypes = templateData.contract_types || [];
    const filterType = templateTypes.length > 0 ? templateTypes[0] : null;
    return activeClauses.filter(c =>
      c.type === "obligatoria" ||
      !c.contract_types?.length ||
      (filterType && c.contract_types.includes(filterType))
    );
  }, [activeClauses, templateData.contract_types]);

  // ── Reordenamiento de textos finales ──
  const finalOrder = templateData.final_text_order?.length > 0
    ? templateData.final_text_order
    : [...DEFAULT_FINAL_ORDER];

  const moveFinalText = (index, direction) => {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= finalOrder.length) return;
    const newOrder = moveItem(finalOrder, index, newIndex);
    setTemplateData({ ...templateData, final_text_order: newOrder });
  };

  // Numeración: textos finales empiezan después de todas las cláusulas unificadas
  const finalTextStartNumber = unifiedOrder.length + 1;

  const availableVariables = [
    { key: "{contract_type}", desc: "Tipo de contrato" },
    { key: "{employee_name}", desc: "Nombre completo del empleado" },
    { key: "{employee_doc_type}", desc: "Tipo de documento del empleado" },
    { key: "{employee_doc_number}", desc: "Número de documento del empleado" },
    { key: "{position}", desc: "Cargo" },
    { key: "{department}", desc: "Departamento/Área" },
    { key: "{start_date}", desc: "Fecha de inicio" },
    { key: "{end_date}", desc: "Fecha de fin" },
    { key: "{salary}", desc: "Remuneración (numérica)" },
    { key: "{salary_words}", desc: "Remuneración en palabras" },
    { key: "{weekly_hours}", desc: "Horas semanales" },
    { key: "{work_schedule}", desc: "Horario de trabajo" },
    { key: "{work_location}", desc: "Lugar de trabajo" },
    { key: "{sede}", desc: "Dirección de la sede del empleado" },
    { key: "{sede_name}", desc: "Nombre de la sede del empleado" },
    { key: "{trial_period_days}", desc: "Días de período de prueba" },
    { key: "{renewable_clause}", desc: "Cláusula de renovación" },
    { key: "{activity_cost}", desc: "Costo de actividad (S/)" },
    { key: "{food_cost}", desc: "Costo de alimento (S/)" },
    { key: "{transport_cost}", desc: "Costo de movilidad (S/)" },
    { key: "{functions}", desc: "Funciones y responsabilidades" },
    { key: "{benefits_additional}", desc: "Beneficios adicionales del contrato" },
    { key: "{notes}", desc: "Notas del contrato" },
    { key: "{company_representative}", desc: "Nombre del representante legal" },
    { key: "{company_representative_doc}", desc: "Documento del representante legal" },
    { key: "{company_name}", desc: "Razón social de la empresa" },
    { key: "{company_ruc}", desc: "RUC de la empresa" },
    { key: "{company_address}", desc: "Dirección de la empresa" },
    { key: "{employee_address}", desc: "Domicilio del trabajador" },
    { key: "{contract_number}", desc: "Número de contrato" },
    { key: "{signed_date}", desc: "Fecha de firma del contrato" },
  ];

  if (permissionsLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!hasPermission("contracts.templates")) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">No tienes permisos para configurar plantillas de contratos</p>
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
              Plantillas de Contratos
            </h1>
            <p className="text-slate-600 text-lg">
              Gestiona múltiples plantillas para diferentes tipos de contratos
            </p>
          </div>
          <Button
            onClick={handleCreate}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>

        {/* Lista de Plantillas */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <FileText className="w-5 h-5" />
              Plantillas Configuradas
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {isLoading ? (
              <div className="flex justify-center py-12">
                <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : templates.length === 0 ? (
              <div className="text-center py-12">
                <FileText className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-slate-600 mb-4">No hay plantillas configuradas</p>
                <Button onClick={handleCreate} className="bg-indigo-600 hover:bg-indigo-700">
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primera Plantilla
                </Button>
              </div>
            ) : (
              <div className="space-y-4">
                {templates.map(template => (
                  <div
                    key={template.id}
                    className={`p-4 border rounded-lg transition-all hover:shadow-md ${
                      template.is_default ? 'border-indigo-300 bg-indigo-50/50' : 'border-slate-200'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 mb-2">
                          <h4 className="font-bold text-slate-900 text-lg">
                            {template.template_name}
                          </h4>
                          {template.is_default && (
                            <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                              <Star className="w-3 h-3 mr-1 fill-current" />
                              Predeterminada
                            </Badge>
                          )}
                          <Badge className={template.is_active ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-700"}>
                            {template.is_active ? "Activa" : "Inactiva"}
                          </Badge>
                        </div>

                        {template.description && (
                          <p className="text-sm text-slate-600 mb-3">{template.description}</p>
                        )}

                        <div className="flex flex-wrap gap-2">
                          {template.contract_types?.length > 0 ? (
                            template.contract_types.map(type => (
                              <Badge key={type} variant="outline" className="text-xs">
                                {type}
                              </Badge>
                            ))
                          ) : (
                            <Badge variant="outline" className="text-xs text-slate-500">
                              Todos los tipos
                            </Badge>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-2 ml-4">
                        {!template.is_default && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setDefaultMutation.mutate(template.id)}
                            title="Establecer como predeterminada"
                            className="text-indigo-600 hover:bg-indigo-50"
                          >
                            <Star className="w-4 h-4" />
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setTemplateData({ ...DEFAULT_TEMPLATE, ...template });
                            setShowPreview(true);
                          }}
                          title="Vista previa"
                        >
                          <Eye className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDuplicate(template)}
                          title="Duplicar"
                        >
                          <Copy className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEdit(template)}
                          title="Editar"
                        >
                          <Edit className="w-4 h-4" />
                        </Button>
                        {!template.is_default && (
                          <Button
                            size="sm"
                            variant="outline"
                            className="text-red-600 hover:bg-red-50"
                            onClick={() => handleDelete(template)}
                            title="Eliminar"
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Info sobre plantilla predeterminada */}
        <Card className="border-0 shadow-lg bg-blue-50/50 border-blue-200">
          <CardContent className="p-6">
            <div className="flex items-start gap-4">
              <div className="p-3 bg-blue-100 rounded-xl">
                <AlertCircle className="w-6 h-6 text-blue-600" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 mb-2">
                  ¿Cómo funcionan las plantillas?
                </h3>
                <ul className="text-sm text-slate-600 space-y-1">
                  <li>• La plantilla <strong>predeterminada</strong> se selecciona automáticamente al crear nuevos contratos</li>
                  <li>• Puedes configurar plantillas específicas para ciertos <strong>tipos de contrato</strong></li>
                  <li>• Al generar el PDF, se usará la plantilla seleccionada para ese contrato</li>
                  <li>• Las plantillas inactivas no aparecerán como opción al crear contratos</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
        >
          <Card
            className="max-w-5xl w-full my-8"
          >
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
                </CardTitle>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    onClick={() => setShowPreview(true)}
                  >
                    <Eye className="w-4 h-4 mr-2" />
                    Vista Previa
                  </Button>
                  <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6 max-h-[70vh] overflow-y-auto">
              <Tabs defaultValue="config" className="space-y-6">
                <TabsList className="grid w-full grid-cols-4">
                  <TabsTrigger value="config">Configuración</TabsTrigger>
                  <TabsTrigger value="intro">Introducción</TabsTrigger>
                  <TabsTrigger value="clauses">Cláusulas</TabsTrigger>
                  <TabsTrigger value="final">Textos Finales</TabsTrigger>
                </TabsList>

                {/* Configuración General */}
                <TabsContent value="config" className="space-y-6">
                  <Card className="border-slate-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">Información de la Plantilla</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Nombre de la Plantilla *</Label>
                          <Input
                            value={templateData.template_name}
                            onChange={(e) => setTemplateData({ ...templateData, template_name: e.target.value })}
                            placeholder="Ej: Contrato Estándar, Contrato Prácticas"
                          />
                        </div>
                        <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                          <div>
                            <Label>Plantilla Predeterminada</Label>
                            <p className="text-xs text-slate-500">Se usará por defecto al crear contratos</p>
                          </div>
                          <Switch
                            checked={templateData.is_default}
                            onCheckedChange={(checked) => setTemplateData({ ...templateData, is_default: checked })}
                          />
                        </div>
                      </div>

                      <div>
                        <Label>Descripción</Label>
                        <Textarea
                          value={templateData.description}
                          onChange={(e) => setTemplateData({ ...templateData, description: e.target.value })}
                          placeholder="Descripción breve de cuándo usar esta plantilla..."
                          rows={2}
                        />
                      </div>

                      <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                        <div>
                          <Label>Plantilla Activa</Label>
                          <p className="text-xs text-slate-500">Las plantillas inactivas no se pueden seleccionar</p>
                        </div>
                        <Switch
                          checked={templateData.is_active}
                          onCheckedChange={(checked) => setTemplateData({ ...templateData, is_active: checked })}
                        />
                      </div>

                      <div>
                        <Label>Tipos de Contrato Aplicables</Label>
                        <p className="text-xs text-slate-500 mb-2">
                          Deja vacío para aplicar a todos los tipos
                        </p>
                        <div className="flex flex-wrap gap-2">
                          {CONTRACT_TYPES.map(type => (
                            <Badge
                              key={type}
                              className={`cursor-pointer transition-all ${
                                templateData.contract_types?.includes(type)
                                  ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                              }`}
                              onClick={() => toggleContractType(type)}
                            >
                              {templateData.contract_types?.includes(type) && (
                                <CheckCircle className="w-3 h-3 mr-1" />
                              )}
                              {type}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  <Card className="border-slate-200">
                    <CardHeader className="pb-4">
                      <CardTitle className="text-lg">Datos de la Empresa</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                        <p className="text-sm text-blue-900">
                          ℹ️ Estos datos se cargan automáticamente desde <strong>Información de la Empresa</strong>.
                        </p>
                      </div>

                      <div>
                        <Label>Razón Social</Label>
                        <Input
                          value={templateData.company_name}
                          disabled
                          className="bg-slate-50 cursor-not-allowed"
                          placeholder="Configurar en Información Empresa"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>RUC</Label>
                          <Input
                            value={templateData.company_ruc}
                            disabled
                            className="bg-slate-50 cursor-not-allowed"
                            placeholder="Configurar en Información Empresa"
                          />
                        </div>
                        <div>
                          <Label>Dirección</Label>
                          <Input
                            value={templateData.company_address}
                            disabled
                            className="bg-slate-50 cursor-not-allowed"
                            placeholder="Configurar en Información Empresa"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4">
                        <div>
                          <Label>Representante Legal</Label>
                          <Input
                            value={templateData.company_representative}
                            disabled
                            className="bg-slate-50 cursor-not-allowed"
                            placeholder="Configurar en Información Empresa"
                          />
                        </div>
                        <div>
                          <Label>Documento del Representante</Label>
                          <Input
                            value={templateData.company_representative_doc}
                            disabled
                            className="bg-slate-50 cursor-not-allowed"
                            placeholder="Configurar en Información Empresa"
                          />
                        </div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Variables Disponibles */}
                  <Card className="border-blue-200 bg-blue-50/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-blue-900">
                        📝 Variables Dinámicas Disponibles
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                        {availableVariables.map(v => (
                          <div key={v.key} className="p-2 bg-white rounded border border-blue-200">
                            <code className="text-xs font-mono text-indigo-600 font-semibold">
                              {v.key}
                            </code>
                            <p className="text-xs text-slate-600">{v.desc}</p>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                </TabsContent>

                {/* Introducción */}
                <TabsContent value="intro" className="space-y-4">

                  {/* Título y encabezado */}
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-slate-700">🏷️ Título del Contrato</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Título Principal <span className="text-xs text-slate-400">(puede ser 2 o 3 líneas, una por renglón)</span></Label>
                        <Textarea
                          value={templateData.contract_title || "CONTRATO DE TRABAJO"}
                          onChange={(e) => setTemplateData({ ...templateData, contract_title: e.target.value })}
                          className="font-mono text-sm"
                          placeholder={"CONTRATO DE TRABAJO\nMODALIDAD ESPECIAL"}
                          rows={3}
                        />
                      </div>
                      <div>
                        <Label>Subtítulo <span className="text-xs text-slate-400">(puede usar variables)</span></Label>
                        <Textarea
                          value={templateData.contract_subtitle || "{contract_type}"}
                          onChange={(e) => setTemplateData({ ...templateData, contract_subtitle: e.target.value })}
                          className="font-mono text-sm"
                          placeholder="{contract_type}"
                          rows={2}
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sección Empleador */}
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-slate-700">🏢 Sección del Empleador</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Título de la sección</Label>
                        <Textarea
                          value={templateData.employer_section_title || "I. DATOS DEL EMPLEADOR:"}
                          onChange={(e) => setTemplateData({ ...templateData, employer_section_title: e.target.value })}
                          className="font-mono text-sm"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>Contenido <span className="text-xs text-slate-400">(usa variables, una línea por campo)</span></Label>
                        <Textarea
                          value={templateData.employer_section_text || "Empresa: {company_name}\nRUC: {company_ruc}\nDomicilio: {company_address}\nRepresentante Legal: {company_representative}\nDocumento: {company_representative_doc}"}
                          onChange={(e) => setTemplateData({ ...templateData, employer_section_text: e.target.value })}
                          rows={5}
                          className="font-mono text-sm"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  {/* Sección Trabajador */}
                  <Card className="border-slate-200">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-semibold text-slate-700">👤 Sección del Trabajador</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div>
                        <Label>Título de la sección</Label>
                        <Textarea
                          value={templateData.worker_section_title || "II. DATOS DEL TRABAJADOR:"}
                          onChange={(e) => setTemplateData({ ...templateData, worker_section_title: e.target.value })}
                          className="font-mono text-sm"
                          rows={2}
                        />
                      </div>
                      <div>
                        <Label>Contenido <span className="text-xs text-slate-400">(usa variables, una línea por campo)</span></Label>
                        <Textarea
                          value={templateData.worker_section_text || "Nombres y Apellidos: {employee_name}\n{employee_doc_type}: {employee_doc_number}\nDomicilio: {employee_address}"}
                          onChange={(e) => setTemplateData({ ...templateData, worker_section_text: e.target.value })}
                          rows={4}
                          className="font-mono text-sm"
                        />
                      </div>
                    </CardContent>
                  </Card>

                  <div>
                    <Label>Texto Introductorio</Label>
                    <Textarea
                      value={templateData.introduction_text}
                      onChange={(e) => setTemplateData({ ...templateData, introduction_text: e.target.value })}
                      rows={4}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Objeto del Contrato</Label>
                    <Textarea
                      value={templateData.contract_object_text}
                      onChange={(e) => setTemplateData({ ...templateData, contract_object_text: e.target.value })}
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Introducción a Funciones</Label>
                    <Textarea
                      value={templateData.functions_intro_text}
                      onChange={(e) => setTemplateData({ ...templateData, functions_intro_text: e.target.value })}
                      className="font-mono text-sm"
                      rows={2}
                    />
                  </div>
                </TabsContent>

                {/* Cláusulas (unificadas: estándar + personalizadas en una sola lista) */}
                <TabsContent value="clauses" className="space-y-4">
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-sm text-indigo-900 flex items-center gap-2">
                      <GripVertical className="w-4 h-4" />
                      La numeración es <strong>automática</strong>. Usa las flechas <ArrowUp className="w-3 h-3 inline" /> <ArrowDown className="w-3 h-3 inline" /> para reordenar. Puedes insertar cláusulas personalizadas en cualquier posición, incluso antes de las estándar.
                    </p>
                  </div>

                  <div className="flex justify-end">
                    <Button onClick={handleCreateClause} size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                      <Plus className="w-4 h-4 mr-2" />
                      Nueva Cláusula
                    </Button>
                  </div>

                  {unifiedOrder.map((clauseId, index) => {
                    const stdSec = STANDARD_SECTIONS.find(s => s.id === clauseId);
                    const customClause = !stdSec ? activeClauses.find(c => c.id === clauseId) : null;
                    return (
                      <Card key={clauseId} className={stdSec ? "border-slate-200" : "border-indigo-200 bg-indigo-50/30"}>
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={index === 0}
                                onClick={() => moveUnifiedClause(index, -1)}
                                title="Subir"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={index === unifiedOrder.length - 1}
                                onClick={() => moveUnifiedClause(index, 1)}
                                title="Bajar"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </Button>
                            </div>
                            <Badge className="bg-indigo-600 text-white text-sm font-bold min-w-[2rem] justify-center">
                              {index + 1}
                            </Badge>
                            {stdSec ? (
                              <Textarea
                                value={templateData[stdSec.titleField] || stdSec.defaultTitle}
                                onChange={(e) => setTemplateData({ ...templateData, [stdSec.titleField]: e.target.value })}
                                className="font-mono text-sm flex-1"
                                placeholder={stdSec.defaultTitle}
                                rows={2}
                              />
                            ) : (
                              <>
                                <Textarea
                                  value={customClause?.title || ""}
                                  readOnly
                                  className="font-mono text-sm flex-1 bg-slate-50 cursor-default"
                                  rows={2}
                                />
                                <Badge variant="outline" className="text-xs text-indigo-600 border-indigo-300 whitespace-nowrap">Personalizada</Badge>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleEditClause(customClause)}
                                  title="Editar"
                                >
                                  <Edit className="w-4 h-4" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  className="text-red-600"
                                  onClick={() => handleDeleteClause(customClause.id)}
                                  title="Eliminar"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                          </div>
                        </CardHeader>
                        <CardContent className="space-y-3">
                          {stdSec ? (
                            <>
                              {clauseId === "object" && (
                                <Textarea
                                  value={templateData.contract_object_text}
                                  onChange={(e) => setTemplateData({ ...templateData, contract_object_text: e.target.value })}
                                  rows={3}
                                  className="font-mono text-sm"
                                />
                              )}
                              {clauseId === "functions" && (
                                <Textarea
                                  value={templateData.functions_intro_text}
                                  onChange={(e) => setTemplateData({ ...templateData, functions_intro_text: e.target.value })}
                                  className="font-mono text-sm"
                                  rows={2}
                                />
                              )}
                              {clauseId === "duration" && (
                                <>
                                  <div>
                                    <Label className="text-xs text-slate-500">Contrato Indeterminado</Label>
                                    <Textarea
                                      value={templateData.duration_indeterminate_text}
                                      onChange={(e) => setTemplateData({ ...templateData, duration_indeterminate_text: e.target.value })}
                                      rows={2}
                                      className="font-mono text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500">Contrato Plazo Fijo</Label>
                                    <Textarea
                                      value={templateData.duration_fixed_text}
                                      onChange={(e) => setTemplateData({ ...templateData, duration_fixed_text: e.target.value })}
                                      rows={2}
                                      className="font-mono text-sm"
                                    />
                                  </div>
                                  <div>
                                    <Label className="text-xs text-slate-500">Período de Prueba</Label>
                                    <Textarea
                                      value={templateData.trial_period_text}
                                      onChange={(e) => setTemplateData({ ...templateData, trial_period_text: e.target.value })}
                                      rows={2}
                                      className="font-mono text-sm"
                                    />
                                  </div>
                                </>
                              )}
                              {clauseId === "salary" && (
                                <Textarea
                                  value={templateData.salary_text}
                                  onChange={(e) => setTemplateData({ ...templateData, salary_text: e.target.value })}
                                  rows={2}
                                  className="font-mono text-sm"
                                />
                              )}
                              {clauseId === "schedule" && (
                                <>
                                  <Textarea
                                    value={templateData.schedule_text}
                                    onChange={(e) => setTemplateData({ ...templateData, schedule_text: e.target.value })}
                                    rows={2}
                                    className="font-mono text-sm"
                                  />
                                  <div>
                                    <Label className="text-xs text-slate-500">Lugar de Trabajo</Label>
                                    <Textarea
                                      value={templateData.work_location_text}
                                      onChange={(e) => setTemplateData({ ...templateData, work_location_text: e.target.value })}
                                      className="font-mono text-sm"
                                      rows={2}
                                    />
                                  </div>
                                </>
                              )}
                            </>
                          ) : (
                            <Textarea
                              value={customClause?.content || ""}
                              readOnly
                              rows={3}
                              className="font-mono text-sm bg-slate-50 cursor-default"
                            />
                          )}
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>

                {/* Textos Finales */}
                <TabsContent value="final" className="space-y-4">
                  <div className="p-4 bg-indigo-50 border border-indigo-200 rounded-lg">
                    <p className="text-sm text-indigo-900 flex items-center gap-2">
                      <GripVertical className="w-4 h-4" />
                      Los textos finales continúan la numeración automáticamente después de todas las cláusulas (inician en {finalTextStartNumber}). Usa las flechas para reordenar.
                    </p>
                  </div>

                  {finalOrder.map((fid, index) => {
                    const sec = FINAL_SECTIONS.find(s => s.id === fid);
                    if (!sec) return null;
                    const contentField = {
                      obligations: "obligations_text",
                      benefits: "benefits_text",
                      termination: "termination_text",
                      domicile: "domicile_text",
                    }[fid];
                    return (
                      <Card key={fid} className="border-slate-200">
                        <CardHeader className="pb-3">
                          <div className="flex items-center gap-3">
                            <div className="flex flex-col gap-0.5">
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={index === 0}
                                onClick={() => moveFinalText(index, -1)}
                                title="Subir"
                              >
                                <ArrowUp className="w-4 h-4" />
                              </Button>
                              <Button
                                size="icon"
                                variant="ghost"
                                className="h-6 w-6"
                                disabled={index === finalOrder.length - 1}
                                onClick={() => moveFinalText(index, 1)}
                                title="Bajar"
                              >
                                <ArrowDown className="w-4 h-4" />
                              </Button>
                            </div>
                            <Badge className="bg-indigo-600 text-white text-sm font-bold min-w-[2rem] justify-center">
                              {finalTextStartNumber + index}
                            </Badge>
                            <Textarea
                              value={templateData[sec.titleField] || sec.defaultTitle}
                              onChange={(e) => setTemplateData({ ...templateData, [sec.titleField]: e.target.value })}
                              className="font-mono text-sm flex-1"
                              placeholder={sec.defaultTitle}
                              rows={2}
                            />
                          </div>
                        </CardHeader>
                        <CardContent>
                          <Textarea
                            value={templateData[contentField]}
                            onChange={(e) => setTemplateData({ ...templateData, [contentField]: e.target.value })}
                            rows={fid === "domicile" ? 2 : fid === "termination" ? 3 : 6}
                            className="font-mono text-sm"
                          />
                        </CardContent>
                      </Card>
                    );
                  })}
                </TabsContent>
              </Tabs>

              <div className="flex gap-3 mt-6 pt-6 border-t">
                <Button variant="outline" className="flex-1" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  <Save className="w-4 h-4 mr-2" />
                  {editingTemplate ? "Actualizar" : "Crear"} Plantilla
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Preview Modal */}
      {showPreview && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[60] p-6"
          onClick={() => setShowPreview(false)}
        >
          <Card
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">Vista Previa: {templateData.template_name || "Nueva Plantilla"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-8 space-y-6 text-sm text-slate-700">
              {(() => {
                // Variables de muestra para la vista previa
                const sampleVars = {
                  "{contract_type}": "PLAZO FIJO",
                  "{contract_number}": "001-2026",
                  "{employee_name}": "Juan Carlos Pérez García",
                  "{employee_doc_type}": "DNI",
                  "{employee_doc_number}": "12345678",
                  "{employee_address}": "Av. Los Jardines 123, Miraflores, Lima",
                  "{position}": "Analista de Sistemas",
                  "{department}": "Tecnología",
                  "{start_date}": "01 de enero de 2026",
                  "{end_date}": "31 de diciembre de 2026",
                  "{salary}": "3,500.00",
                  "{salary_words}": "TRES MIL QUINIENTOS",
                  "{weekly_hours}": "48",
                  "{work_schedule}": "Lunes a Viernes 9:00 AM - 6:00 PM",
                  "{work_location}": "Sede Principal",
                  "{sede}": "Av. Principal 123, Lima",
                  "{sede_name}": "Sede Principal",
                  "{trial_period_days}": "90",
                  "{functions}": "[Funciones del trabajador]",
                  "{benefits}": "[Beneficios adicionales]",
                  "{benefits_additional}": "[Beneficios adicionales]",
                  "{notes}": "[Notas del contrato]",
                  "{activity_cost}": "0.00",
                  "{food_cost}": "0.00",
                  "{transport_cost}": "0.00",
                  "{renewable_clause}": "",
                  "{signed_date}": "01 de enero de 2026",
                  "{company_name}": templateData.company_name || "[Razón Social]",
                  "{company_ruc}": templateData.company_ruc || "[RUC]",
                  "{company_address}": templateData.company_address || "[Dirección]",
                  "{company_representative}": templateData.company_representative || "[Representante Legal]",
                  "{company_representative_doc}": templateData.company_representative_doc || "[Documento]",
                };
                const rv = (text) => {
                  if (!text) return "";
                  let r = text;
                  Object.keys(sampleVars).forEach(k => {
                    r = r.replace(new RegExp(k.replace(/[{}]/g, '\\$&'), 'g'), sampleVars[k]);
                  });
                  return r;
                };
                const orderedSections = buildOrderedSections(templateData, sortedClauses);
                const getSectionContent = (section) => {
                  if (section.type === "employer") {
                    return rv(templateData.employer_section_text || "Empresa: {company_name}\nRUC: {company_ruc}\nDomicilio: {company_address}\nRepresentante Legal: {company_representative}\nDocumento: {company_representative_doc}");
                  }
                  if (section.type === "worker") {
                    return rv(templateData.worker_section_text || "Nombres y Apellidos: {employee_name}\n{employee_doc_type}: {employee_doc_number}\nDomicilio: {employee_address}");
                  }
                  if (section.type === "custom") {
                    return rv(section.content);
                  }
                  const contentMap = {
                    object: rv(templateData.contract_object_text),
                    functions: rv(templateData.functions_intro_text),
                    duration: rv(templateData.duration_fixed_text) + "\n\n" + rv(templateData.trial_period_text),
                    salary: rv(templateData.salary_text),
                    schedule: rv(templateData.schedule_text) + "\n" + rv(templateData.work_location_text),
                    obligations: rv(templateData.obligations_text),
                    benefits: rv(templateData.benefits_text),
                    termination: rv(templateData.termination_text),
                    domicile: rv(templateData.domicile_text),
                  };
                  return contentMap[section.id] || "";
                };
                return (
                  <div className="space-y-6" style={{ fontFamily: '"Times New Roman", Times, serif' }}>
                    {/* Título */}
                    <div className="text-center border-b pb-6">
                      <div className="text-xl font-bold text-slate-900 mb-1">
                        {(rv(templateData.contract_title || "CONTRATO DE TRABAJO")).split("\n").map((line, i) => (
                          <div key={i}>{line.toUpperCase()}</div>
                        ))}
                      </div>
                      <p className="text-base font-semibold text-slate-700">
                        {rv(templateData.contract_subtitle || "{contract_type}")}
                      </p>
                      <p className="text-xs text-slate-500 mt-1">Contrato N° 001-2026 | Fecha de Firma: 01/01/2026</p>
                    </div>

                    {/* Introducción */}
                    <p className="leading-relaxed whitespace-pre-wrap text-justify">
                      {rv(templateData.introduction_text)}
                    </p>

                    {/* Secciones auto-numeradas (empleador, trabajador, cláusulas, personalizadas, finales) */}
                    {orderedSections.map((section) => {
                      const content = getSectionContent(section);
                      if (section.type === "employer" || section.type === "worker") {
                        return (
                          <div key={section.id} className="p-4 bg-slate-50 rounded-lg border border-slate-200">
                            <p className="font-bold text-slate-900 mb-2">{rv(section.title)}</p>
                            <p className="whitespace-pre-wrap leading-relaxed text-justify">{content}</p>
                          </div>
                        );
                      }
                      return (
                        <div key={section.id}>
                          <p className="font-bold text-slate-900 mb-1">
                            {section.number}. {rv(section.title)}
                          </p>
                          <p className="whitespace-pre-wrap leading-relaxed text-justify">{content}</p>
                          {section.id === "functions" && (
                            <p className="text-slate-400 italic text-xs mt-1">[Se completará con las funciones del contrato]</p>
                          )}
                        </div>
                      );
                    })}

                    {/* Firmas */}
                    <div className="grid grid-cols-2 gap-8 pt-12 mt-8 border-t border-slate-300">
                      <div className="text-center">
                        <div className="border-t border-slate-400 pt-2 mt-16">
                          <p className="font-bold text-slate-900">EL EMPLEADOR</p>
                          <p className="text-xs text-slate-500">{templateData.company_representative || "[Representante Legal]"}</p>
                          <p className="text-xs text-slate-500">{templateData.company_representative_doc || "[Documento]"}</p>
                        </div>
                      </div>
                      <div className="text-center">
                        <div className="border-t border-slate-400 pt-2 mt-16">
                          <p className="font-bold text-slate-900">EL TRABAJADOR</p>
                          <p className="text-xs text-slate-500">Juan Carlos Pérez García</p>
                          <p className="text-xs text-slate-500">DNI: 12345678</p>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </div>
      )}

      {/* Clause Form Modal */}
      {showClauseForm && (
        <div
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-[70] p-6"
          onClick={resetClauseForm}
        >
          <Card
            className="max-w-2xl w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingClause ? "Editar Cláusula" : "Nueva Cláusula"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetClauseForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Título de la Cláusula *</Label>
                <Input
                  value={clauseData.title}
                  onChange={(e) => setClauseData({ ...clauseData, title: e.target.value })}
                  placeholder="Ej: Confidencialidad, No Competencia"
                />
              </div>

              <div>
                <Label>Contenido *</Label>
                <Textarea
                  value={clauseData.content}
                  onChange={(e) => setClauseData({ ...clauseData, content: e.target.value })}
                  placeholder="Texto completo de la cláusula..."
                  rows={6}
                  className="font-mono text-sm"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo</Label>
                  <select
                    value={clauseData.type}
                    onChange={(e) => setClauseData({ ...clauseData, type: e.target.value })}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="obligatoria">Obligatoria</option>
                    <option value="opcional">Opcional</option>
                  </select>
                </div>

                <div>
                  <Label>Categoría</Label>
                  <select
                    value={clauseData.category}
                    onChange={(e) => setClauseData({ ...clauseData, category: e.target.value })}
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="general">General</option>
                    <option value="derechos">Derechos</option>
                    <option value="obligaciones">Obligaciones</option>
                    <option value="confidencialidad">Confidencialidad</option>
                    <option value="terminacion">Terminación</option>
                    <option value="otros">Otros</option>
                  </select>
                </div>
              </div>

              <div className="p-3 bg-indigo-50 border border-indigo-200 rounded-lg">
                <p className="text-xs text-indigo-800">
                  ℹ️ El orden de aparición se ajusta automáticamente con los botones de flechas (↑ ↓) en la lista de cláusulas. La numeración es automática y continua.
                </p>
              </div>

              <div>
                <Label>Aplicable a tipos de contrato</Label>
                <p className="text-xs text-slate-500 mb-2">Deja vacío para todos los tipos</p>
                <div className="flex flex-wrap gap-2">
                  {CONTRACT_TYPES.map(type => (
                    <Badge
                      key={type}
                      className={`cursor-pointer ${
                        clauseData.contract_types?.includes(type)
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                      onClick={() => toggleClauseContractType(type)}
                    >
                      {type}
                    </Badge>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg">
                <Label>Cláusula Activa</Label>
                <Switch
                  checked={clauseData.is_active}
                  onCheckedChange={(checked) => setClauseData({ ...clauseData, is_active: checked })}
                />
              </div>

              <div className="flex gap-3 pt-4 border-t">
                <Button variant="outline" className="flex-1" onClick={resetClauseForm}>
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmitClause}
                  disabled={createClauseMutation.isPending || updateClauseMutation.isPending}
                >
                  {editingClause ? "Actualizar" : "Crear"} Cláusula
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
