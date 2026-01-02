import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { FileText, Save, Eye, RotateCcw } from "lucide-react";
import { toast } from "sonner";

export default function ContractTemplateConfig() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showPreview, setShowPreview] = useState(false);
  const [templateData, setTemplateData] = useState({
    // Datos de la empresa
    company_name: "",
    company_ruc: "",
    company_address: "",
    company_representative: "",
    company_representative_doc: "",
    
    // Textos del contrato
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

  // Crear entidad para plantillas si no existe
  const { data: companyInfo } = useQuery({
    queryKey: ["companyInfo"],
    queryFn: async () => {
      const info = await base44.entities.CompanyInfo.list("-created_date");
      return info.length > 0 ? info[0] : null;
    },
    enabled: !!employee,
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    const loadTemplate = async () => {
      try {
        const templates = await base44.entities.ContractTemplate?.list();
        if (templates && templates.length > 0) {
          setTemplateData({ ...templateData, ...templates[0] });
        }
      } catch (error) {
        console.log("No se encontró plantilla previa");
      }
    };

    if (employee) {
      loadTemplate();
    }
  }, [employee]);

  // Sincronizar datos de empresa automáticamente
  useEffect(() => {
    if (companyInfo) {
      setTemplateData(prev => ({
        ...prev,
        company_name: companyInfo.company_name || "",
        company_ruc: companyInfo.ruc || "",
        company_address: companyInfo.address || "",
        company_representative: companyInfo.legal_representative || "",
        company_representative_doc: companyInfo.legal_representative_dni ? `DNI ${companyInfo.legal_representative_dni}` : "",
      }));
    }
  }, [companyInfo]);

  const saveTemplateMutation = useMutation({
    mutationFn: async (data) => {
      const templates = await base44.entities.ContractTemplate?.list();
      if (templates && templates.length > 0) {
        return await base44.entities.ContractTemplate.update(templates[0].id, data);
      } else {
        return await base44.entities.ContractTemplate.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["contractTemplate"]);
      toast.success("Plantilla guardada correctamente");
    },
    onError: () => {
      toast.error("Error al guardar la plantilla");
    },
  });

  const handleSave = () => {
    saveTemplateMutation.mutate(templateData);
  };

  const handleReset = () => {
    if (confirm("¿Estás seguro de restablecer la plantilla a los valores por defecto?")) {
      setTemplateData({
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
        obligations_text: "1. Cumplir con el horario de trabajo establecido y registrar su asistencia.\n2. Desempeñar sus funciones con diligencia, eficiencia y lealtad.\n3. Cumplir con el Reglamento Interno de Trabajo y las políticas de la empresa.\n4. Guardar confidencialidad sobre la información de la empresa.\n5. Cuidar los bienes y recursos de la empresa.",
        benefits_text: "EL TRABAJADOR tiene derecho a los siguientes beneficios de acuerdo a la legislación laboral peruana:\n- Gratificaciones legales (Fiestas Patrias y Navidad)\n- Compensación por Tiempo de Servicios (CTS)\n- Vacaciones (30 días calendario por año de servicios)\n- Asignación familiar (si corresponde)\n- Seguro social de salud (EsSalud)",
        termination_text: "El presente contrato podrá darse por terminado por las causas previstas en la legislación laboral vigente, especialmente las establecidas en el Decreto Supremo N° 003-97-TR.",
        domicile_text: "Para efectos del presente contrato, las partes señalan como sus domicilios los indicados en la introducción del presente documento.",
      });
      toast.success("Plantilla restablecida");
    }
  };

  const availableVariables = [
    { key: "{contract_type}", desc: "Tipo de contrato" },
    { key: "{employee_name}", desc: "Nombre completo del empleado" },
    { key: "{employee_doc_type}", desc: "Tipo de documento del empleado" },
    { key: "{employee_doc_number}", desc: "Número de documento del empleado" },
    { key: "{employee_birth_date}", desc: "Fecha de nacimiento del empleado" },
    { key: "{employee_address}", desc: "Dirección del empleado" },
    { key: "{position}", desc: "Cargo" },
    { key: "{department}", desc: "Departamento/Área" },
    { key: "{start_date}", desc: "Fecha de inicio del contrato" },
    { key: "{end_date}", desc: "Fecha de fin del contrato" },
    { key: "{salary}", desc: "Remuneración mensual (numérica)" },
    { key: "{salary_words}", desc: "Remuneración en palabras" },
    { key: "{weekly_hours}", desc: "Horas semanales" },
    { key: "{work_schedule}", desc: "Horario de trabajo" },
    { key: "{work_location}", desc: "Lugar de trabajo" },
    { key: "{trial_period_days}", desc: "Días de período de prueba" },
    { key: "{functions}", desc: "Funciones del cargo" },
    { key: "{benefits}", desc: "Beneficios adicionales" },
    { key: "{renewable_clause}", desc: "Cláusula de renovación" },
    { key: "{signed_date}", desc: "Fecha de firma" },
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
              Configuración de Plantilla de Contratos
            </h1>
            <p className="text-slate-600 text-lg">
              Personaliza el formato y contenido de los contratos generados
            </p>
          </div>
          <div className="flex gap-3">
            <Button
              variant="outline"
              onClick={() => setShowPreview(true)}
            >
              <Eye className="w-4 h-4 mr-2" />
              Vista Previa
            </Button>
            <Button
              variant="outline"
              onClick={handleReset}
            >
              <RotateCcw className="w-4 h-4 mr-2" />
              Restablecer
            </Button>
            <Button
              onClick={handleSave}
              className="bg-indigo-600 hover:bg-indigo-700"
              disabled={saveTemplateMutation.isPending}
            >
              <Save className="w-4 h-4 mr-2" />
              {saveTemplateMutation.isPending ? "Guardando..." : "Guardar Plantilla"}
            </Button>
          </div>
        </div>

        {/* Variables Disponibles */}
        <Card className="border-0 shadow-lg mb-8">
          <CardHeader className="border-b bg-blue-50/50">
            <CardTitle className="text-lg font-bold text-blue-900">
              📝 Variables Dinámicas Disponibles
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <p className="text-sm text-slate-600 mb-4">
              Utiliza estas variables en tus textos. Se reemplazarán automáticamente con los datos del contrato:
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
              {availableVariables.map(v => (
                <div key={v.key} className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                  <code className="text-xs font-mono text-indigo-600 font-semibold block mb-1">
                    {v.key}
                  </code>
                  <p className="text-xs text-slate-600">{v.desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Formulario de Configuración */}
        <Tabs defaultValue="company" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="company">Datos Empresa</TabsTrigger>
            <TabsTrigger value="intro">Introducción</TabsTrigger>
            <TabsTrigger value="clauses">Cláusulas</TabsTrigger>
            <TabsTrigger value="final">Textos Finales</TabsTrigger>
          </TabsList>

          {/* Datos de la Empresa */}
          <TabsContent value="company" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Información de la Empresa</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-4">
                <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg mb-4">
                  <p className="text-sm text-blue-900">
                    ℹ️ Estos datos se sincronizan automáticamente desde <strong>Información de la Empresa</strong>. 
                    Para modificarlos, dirígete a Configuración → Información Empresa.
                  </p>
                </div>

                <div>
                  <Label>Razón Social *</Label>
                  <Input
                    value={templateData.company_name}
                    disabled
                    className="bg-slate-50 cursor-not-allowed"
                    placeholder="Configurar en Información Empresa"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>RUC *</Label>
                    <Input
                      value={templateData.company_ruc}
                      disabled
                      className="bg-slate-50 cursor-not-allowed"
                      placeholder="Configurar en Información Empresa"
                    />
                  </div>
                  <div>
                    <Label>Dirección *</Label>
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
                    <Label>Representante Legal *</Label>
                    <Input
                      value={templateData.company_representative}
                      disabled
                      className="bg-slate-50 cursor-not-allowed"
                      placeholder="Configurar en Información Empresa"
                    />
                  </div>
                  <div>
                    <Label>Documento del Representante *</Label>
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
          </TabsContent>

          {/* Introducción y Objeto */}
          <TabsContent value="intro" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Textos de Introducción</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div>
                  <Label>Texto Introductorio</Label>
                  <Textarea
                    value={templateData.introduction_text}
                    onChange={(e) => setTemplateData({ ...templateData, introduction_text: e.target.value })}
                    rows={4}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables disponibles: {"{contract_type}"}
                  </p>
                </div>

                <div>
                  <Label>Objeto del Contrato</Label>
                  <Textarea
                    value={templateData.contract_object_text}
                    onChange={(e) => setTemplateData({ ...templateData, contract_object_text: e.target.value })}
                    rows={3}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables disponibles: {"{position}"}, {"{department}"}
                  </p>
                </div>

                <div>
                  <Label>Introducción a Funciones</Label>
                  <Input
                    value={templateData.functions_intro_text}
                    onChange={(e) => setTemplateData({ ...templateData, functions_intro_text: e.target.value })}
                    className="font-mono text-sm"
                  />
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Cláusulas Principales */}
          <TabsContent value="clauses" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Cláusulas del Contrato</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
                <div>
                  <Label>Vigencia - Contrato Indeterminado</Label>
                  <Textarea
                    value={templateData.duration_indeterminate_text}
                    onChange={(e) => setTemplateData({ ...templateData, duration_indeterminate_text: e.target.value })}
                    rows={2}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{start_date}"}
                  </p>
                </div>

                <div>
                  <Label>Vigencia - Contrato Plazo Fijo</Label>
                  <Textarea
                    value={templateData.duration_fixed_text}
                    onChange={(e) => setTemplateData({ ...templateData, duration_fixed_text: e.target.value })}
                    rows={2}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{start_date}"}, {"{end_date}"}, {"{renewable_clause}"}
                  </p>
                </div>

                <div>
                  <Label>Período de Prueba</Label>
                  <Textarea
                    value={templateData.trial_period_text}
                    onChange={(e) => setTemplateData({ ...templateData, trial_period_text: e.target.value })}
                    rows={2}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{trial_period_days}"}
                  </p>
                </div>

                <div>
                  <Label>Remuneración</Label>
                  <Textarea
                    value={templateData.salary_text}
                    onChange={(e) => setTemplateData({ ...templateData, salary_text: e.target.value })}
                    rows={2}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{salary}"}, {"{salary_words}"}
                  </p>
                </div>

                <div>
                  <Label>Jornada y Horario</Label>
                  <Textarea
                    value={templateData.schedule_text}
                    onChange={(e) => setTemplateData({ ...templateData, schedule_text: e.target.value })}
                    rows={2}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{weekly_hours}"}, {"{work_schedule}"}
                  </p>
                </div>

                <div>
                  <Label>Lugar de Trabajo</Label>
                  <Input
                    value={templateData.work_location_text}
                    onChange={(e) => setTemplateData({ ...templateData, work_location_text: e.target.value })}
                    className="font-mono text-sm"
                  />
                  <p className="text-xs text-slate-500 mt-2">
                    Variables: {"{work_location}"}
                  </p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Textos Finales */}
          <TabsContent value="final" className="space-y-6">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold">Cláusulas Finales</CardTitle>
              </CardHeader>
              <CardContent className="p-6 space-y-6">
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
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Modal de Vista Previa */}
      {showPreview && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setShowPreview(false)}
        >
          <Card 
            className="max-w-4xl w-full max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b sticky top-0 bg-white z-10">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">Vista Previa del Contrato</CardTitle>
                <Button variant="ghost" size="icon" onClick={() => setShowPreview(false)}>✕</Button>
              </div>
              <p className="text-sm text-slate-600 mt-1">
                Ejemplo con datos ficticios
              </p>
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
                    {templateData.introduction_text
                      .replace(/{contract_type}/g, "INDETERMINADO")
                    }
                  </p>
                </div>

                {/* Partes del Contrato */}
                <div className="space-y-4">
                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900 mb-2">EL EMPLEADOR:</p>
                    <p className="text-sm text-slate-700">{templateData.company_name || "[Nombre de la Empresa]"}</p>
                    <p className="text-sm text-slate-700">RUC: {templateData.company_ruc || "[RUC]"}</p>
                    <p className="text-sm text-slate-700">Dirección: {templateData.company_address || "[Dirección]"}</p>
                    <p className="text-sm text-slate-700">Representante: {templateData.company_representative || "[Representante Legal]"}</p>
                    <p className="text-sm text-slate-700">{templateData.company_representative_doc || "[Documento]"}</p>
                  </div>

                  <div className="p-4 bg-slate-50 rounded-lg">
                    <p className="font-semibold text-slate-900 mb-2">EL TRABAJADOR:</p>
                    <p className="text-sm text-slate-700">Juan Carlos Pérez García</p>
                    <p className="text-sm text-slate-700">DNI: 12345678</p>
                    <p className="text-sm text-slate-700">Fecha de Nacimiento: 15/03/1990</p>
                    <p className="text-sm text-slate-700">Dirección: Av. Los Olivos 456, Lima</p>
                  </div>
                </div>

                {/* Cláusulas */}
                <div className="space-y-6">
                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">PRIMERA: OBJETO DEL CONTRATO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.contract_object_text
                        .replace(/{position}/g, "Analista de Sistemas")
                        .replace(/{department}/g, "Tecnología de la Información")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">SEGUNDA: FUNCIONES</h3>
                    <p className="text-sm text-slate-700 mb-2">{templateData.functions_intro_text}</p>
                    <ul className="list-disc list-inside text-sm text-slate-700 space-y-1 ml-4">
                      <li>Desarrollar y mantener aplicaciones web</li>
                      <li>Analizar requerimientos del negocio</li>
                      <li>Brindar soporte técnico a usuarios</li>
                      <li>Documentar procesos y procedimientos</li>
                    </ul>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">TERCERA: VIGENCIA</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.duration_indeterminate_text
                        .replace(/{start_date}/g, "01 de enero de 2026")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">CUARTA: PERÍODO DE PRUEBA</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.trial_period_text
                        .replace(/{trial_period_days}/g, "90")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">QUINTA: REMUNERACIÓN</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.salary_text
                        .replace(/{salary}/g, "3,500.00")
                        .replace(/{salary_words}/g, "TRES MIL QUINIENTOS Y 00/100")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">SEXTA: JORNADA Y HORARIO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.schedule_text
                        .replace(/{weekly_hours}/g, "48")
                        .replace(/{work_schedule}/g, "Lunes a Viernes de 9:00 AM a 6:00 PM, con 1 hora de refrigerio")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">SÉPTIMA: LUGAR DE TRABAJO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.work_location_text
                        .replace(/{work_location}/g, "Av. Javier Prado 1234, San Isidro, Lima")
                      }
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">OCTAVA: OBLIGACIONES DEL TRABAJADOR</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {templateData.obligations_text}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">NOVENA: BENEFICIOS SOCIALES</h3>
                    <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-wrap">
                      {templateData.benefits_text}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">DÉCIMA: TÉRMINO DEL CONTRATO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.termination_text}
                    </p>
                  </div>

                  <div>
                    <h3 className="font-bold text-slate-900 mb-2">DÉCIMA PRIMERA: DOMICILIO</h3>
                    <p className="text-sm text-slate-700 leading-relaxed">
                      {templateData.domicile_text}
                    </p>
                  </div>
                </div>

                {/* Firmas */}
                <div className="grid grid-cols-2 gap-8 pt-12 mt-8 border-t">
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-2 mt-16">
                      <p className="font-semibold text-slate-900">EL EMPLEADOR</p>
                      <p className="text-sm text-slate-600">{templateData.company_representative || "[Representante]"}</p>
                    </div>
                  </div>
                  <div className="text-center">
                    <div className="border-t border-slate-400 pt-2 mt-16">
                      <p className="font-semibold text-slate-900">EL TRABAJADOR</p>
                      <p className="text-sm text-slate-600">Juan Carlos Pérez García</p>
                    </div>
                  </div>
                </div>

                <div className="text-center text-sm text-slate-500 pt-4">
                  Lima, 02 de enero de 2026
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}