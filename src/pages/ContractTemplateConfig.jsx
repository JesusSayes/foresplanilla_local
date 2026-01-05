import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
  FileText, Save, Eye, RotateCcw, Plus, Edit, Trash2, 
  Star, Copy, CheckCircle, AlertCircle
} from "lucide-react";
import { toast } from "sonner";

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
  introduction_text: "Conste por el presente documento el Contrato de Trabajo {contract_type}, que celebran al amparo del Texto Único Ordenado del Decreto Legislativo N° 728, Ley de Productividad y Competitividad Laboral, aprobado por Decreto Supremo N° 003-97-TR, y normas complementarias:",
  contract_object_text: "Por el presente contrato, EL TRABAJADOR se obliga a prestar sus servicios personales a EL EMPLEADOR, desempeñando el cargo de {position} en el área de {department}, bajo subordinación y dependencia de EL EMPLEADOR.",
  functions_intro_text: "El trabajador desempeñará las siguientes funciones y responsabilidades:",
  duration_indeterminate_text: "El presente contrato tiene carácter de INDETERMINADO, iniciando su vigencia el {start_date}.",
  duration_fixed_text: "El presente contrato tendrá una duración determinada, iniciando el {start_date} y finalizando el {end_date}{renewable_clause}.",
  trial_period_text: "El contrato está sujeto a un período de prueba de {trial_period_days} días calendario, durante el cual cualquiera de las partes puede darlo por terminado sin expresión de causa.",
  salary_text: "EL EMPLEADOR pagará a EL TRABAJADOR una remuneración mensual de S/ {salary} ({salary_words} SOLES), pagadera mensualmente, sujeta a los descuentos de ley.",
  schedule_text: "La jornada laboral será de {weekly_hours} horas semanales, distribuidas de la siguiente manera: {work_schedule}.",
  work_location_text: "EL TRABAJADOR prestará sus servicios en: {work_location}.",
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
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [showPreview, setShowPreview] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [templateData, setTemplateData] = useState({ ...DEFAULT_TEMPLATE });

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

  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await base44.entities.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
    enabled: !!employee,
  });

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["contractTemplates"],
    queryFn: async () => {
      return await base44.entities.ContractTemplate.list("-created_date");
    },
    enabled: !!employee,
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      // Si esta plantilla se marca como default, quitar el default de las demás
      if (data.is_default) {
        const currentDefault = templates.find(t => t.is_default);
        if (currentDefault) {
          await base44.entities.ContractTemplate.update(currentDefault.id, { is_default: false });
        }
      }
      return await base44.entities.ContractTemplate.create(data);
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
          await base44.entities.ContractTemplate.update(currentDefault.id, { is_default: false });
        }
      }
      return await base44.entities.ContractTemplate.update(id, data);
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
          base44.entities.ContractTemplate.update(t.id, updatedCompanyData)
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
      return await base44.entities.ContractTemplate.delete(id);
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
        await base44.entities.ContractTemplate.update(t.id, { is_default: false });
      }
      // Establecer el nuevo default
      return await base44.entities.ContractTemplate.update(templateId, { is_default: true });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractTemplates"]);
      toast.success("Plantilla establecida como predeterminada");
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
  };

  const toggleContractType = (type) => {
    const types = templateData.contract_types || [];
    if (types.includes(type)) {
      setTemplateData({ ...templateData, contract_types: types.filter(t => t !== type) });
    } else {
      setTemplateData({ ...templateData, contract_types: [...types, type] });
    }
  };

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
    { key: "{trial_period_days}", desc: "Días de período de prueba" },
    { key: "{renewable_clause}", desc: "Cláusula de renovación" },
  ];

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden configurar plantillas</p>
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
          onClick={resetForm}
        >
          <Card 
            className="max-w-5xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
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
                    <Input
                      value={templateData.functions_intro_text}
                      onChange={(e) => setTemplateData({ ...templateData, functions_intro_text: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </TabsContent>

                {/* Cláusulas */}
                <TabsContent value="clauses" className="space-y-4">
                  <div>
                    <Label>Vigencia - Contrato Indeterminado</Label>
                    <Textarea
                      value={templateData.duration_indeterminate_text}
                      onChange={(e) => setTemplateData({ ...templateData, duration_indeterminate_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Vigencia - Contrato Plazo Fijo</Label>
                    <Textarea
                      value={templateData.duration_fixed_text}
                      onChange={(e) => setTemplateData({ ...templateData, duration_fixed_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Período de Prueba</Label>
                    <Textarea
                      value={templateData.trial_period_text}
                      onChange={(e) => setTemplateData({ ...templateData, trial_period_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Remuneración</Label>
                    <Textarea
                      value={templateData.salary_text}
                      onChange={(e) => setTemplateData({ ...templateData, salary_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Jornada y Horario</Label>
                    <Textarea
                      value={templateData.schedule_text}
                      onChange={(e) => setTemplateData({ ...templateData, schedule_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Lugar de Trabajo</Label>
                    <Input
                      value={templateData.work_location_text}
                      onChange={(e) => setTemplateData({ ...templateData, work_location_text: e.target.value })}
                      className="font-mono text-sm"
                    />
                  </div>
                </TabsContent>

                {/* Textos Finales */}
                <TabsContent value="final" className="space-y-4">
                  <div>
                    <Label>Obligaciones del Trabajador</Label>
                    <Textarea
                      value={templateData.obligations_text}
                      onChange={(e) => setTemplateData({ ...templateData, obligations_text: e.target.value })}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Beneficios Sociales</Label>
                    <Textarea
                      value={templateData.benefits_text}
                      onChange={(e) => setTemplateData({ ...templateData, benefits_text: e.target.value })}
                      rows={6}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Término del Contrato</Label>
                    <Textarea
                      value={templateData.termination_text}
                      onChange={(e) => setTemplateData({ ...templateData, termination_text: e.target.value })}
                      rows={3}
                      className="font-mono text-sm"
                    />
                  </div>

                  <div>
                    <Label>Domicilio</Label>
                    <Textarea
                      value={templateData.domicile_text}
                      onChange={(e) => setTemplateData({ ...templateData, domicile_text: e.target.value })}
                      rows={2}
                      className="font-mono text-sm"
                    />
                  </div>
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
            <CardContent className="p-8 space-y-6">
              <div className="space-y-8">
                {/* Encabezado */}
                <div className="text-center border-b pb-6">
                  <h1 className="text-2xl font-bold text-slate-900 mb-2">CONTRATO DE TRABAJO</h1>
                  <p className="text-slate-600">{templateData.company_name || "[Nombre de la Empresa]"}</p>
                  <p className="text-sm text-slate-500">RUC: {templateData.company_ruc || "[RUC]"}</p>
                </div>

                {/* Texto Introductorio */}
                <div>
                  <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                    {templateData.introduction_text?.replace(/{contract_type}/g, "INDETERMINADO")}
                  </p>
                </div>

                {/* Partes */}
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900 mb-2">EL EMPLEADOR:</p>
                    <p className="text-sm text-slate-700">{templateData.company_name || "[Nombre de la Empresa]"}</p>
                    <p className="text-sm text-slate-700">RUC: {templateData.company_ruc || "[RUC]"}</p>
                    <p className="text-sm text-slate-700">Dirección: {templateData.company_address || "[Dirección]"}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900 mb-2">EL TRABAJADOR:</p>
                    <p className="text-sm text-slate-700">Juan Carlos Pérez García</p>
                    <p className="text-sm text-slate-700">DNI: 12345678</p>
                  </div>
                </div>

                {/* Cláusulas */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">PRIMERA: OBJETO DEL CONTRATO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.contract_object_text
                        ?.replace(/{position}/g, "Analista de Sistemas")
                        ?.replace(/{department}/g, "Tecnología")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">SEGUNDA: VIGENCIA</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.duration_indeterminate_text?.replace(/{start_date}/g, "01 de enero de 2026")}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">TERCERA: REMUNERACIÓN</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.salary_text
                        ?.replace(/{salary}/g, "3,500.00")
                        ?.replace(/{salary_words}/g, "TRES MIL QUINIENTOS")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">CUARTA: OBLIGACIONES</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {templateData.obligations_text}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">QUINTA: BENEFICIOS</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {templateData.benefits_text}
                    </p>
                  </div>
                </div>

                {/* Firmas */}
                <div className="grid grid-cols-2 gap-8 pt-12 mt-8 border-t">
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-2 mt-16">
                      <p className="font-semibold text-slate-900">EL EMPLEADOR</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-2 mt-16">
                      <p className="font-semibold text-slate-900">EL TRABAJADOR</p>
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}