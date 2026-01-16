import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  FileText, Save, Eye, Plus, Trash2, CheckSquare,
  Square, Settings, Palette, User, Building2
} from "lucide-react";
import { toast } from "sonner";

const AVAILABLE_FIELDS = {
  header: [
    { id: "company_name", label: "Nombre Empresa" },
    { id: "company_ruc", label: "RUC Empresa" },
    { id: "period", label: "Período" },
    { id: "employee_code", label: "Código Empleado" },
    { id: "generation_date", label: "Fecha Generación" },
  ],
  employee: [
    { id: "full_name", label: "Nombres y Apellidos" },
    { id: "document", label: "Documento Identidad" },
    { id: "position", label: "Cargo" },
    { id: "department", label: "Departamento" },
    { id: "hire_date", label: "Fecha Ingreso" },
    { id: "worker_type", label: "Tipo Trabajador" },
    { id: "pension_system", label: "Régimen Pensionario" },
    { id: "cuspp", label: "CUSPP" },
    { id: "tax_residence", label: "Condición Tributaria" },
    { id: "bank_account", label: "Cuenta Bancaria" },
  ],
  workPeriod: [
    { id: "worked_days", label: "Días Laborados" },
    { id: "non_worked_days", label: "Días No Laborados" },
    { id: "subsidized_days", label: "Días Subsidiados" },
    { id: "regular_hours", label: "Horas Ordinarias" },
    { id: "overtime_hours", label: "Horas Extras" },
  ],
  footer: [
    { id: "net_pay", label: "Neto a Pagar" },
    { id: "payment_date", label: "Fecha de Pago" },
    { id: "payment_method", label: "Método de Pago" },
    { id: "observations", label: "Observaciones" },
  ]
};

export default function PayslipTemplateConfig() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [editingTemplate, setEditingTemplate] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState({
    template_name: "",
    is_active: true,
    show_company_logo: true,
    show_employee_photo: false,
    header_fields: ["company_name", "company_ruc", "period"],
    employee_info_fields: ["full_name", "document", "position", "hire_date", "pension_system"],
    work_period_fields: ["worked_days"],
    income_section: { show: true, title: "Ingresos", show_codes: true },
    discount_section: { show: true, title: "Descuentos", show_codes: true, group_by_type: true },
    employer_contribution_section: { show: true, title: "Aportes del Empleador", show_codes: true },
    footer_fields: ["net_pay", "payment_date"],
    show_signatures: true,
    custom_notes: "",
    color_scheme: "blue",
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUserData = async () => {
      try {
        const user = await base44.auth.me();
        setCurrentUser(user);
        // const employees = await base44.entities.Employee.filter({ work_email: user.email });
        const employees = await entitiesAPI.Employee.filter({ work_email: user.email });
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading user:", error);
      }
    };
    loadUserData();
  }, []);

  const { data: templates = [] } = useQuery({
    queryKey: ["payslipTemplates"],
    // queryFn: async () => await base44.entities.PayslipTemplate.list("-created_date"),
    queryFn: async () => await entitiesAPI.PayslipTemplate.list("-created_date"),
  });

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (editingTemplate) {
        // return await base44.entities.PayslipTemplate.update(editingTemplate.id, data);
        return await entitiesAPI.PayslipTemplate.update(editingTemplate.id, data);
      } else {
        // return await base44.entities.PayslipTemplate.create(data);
        return await entitiesAPI.PayslipTemplate.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["payslipTemplates"]);
      toast.success("Plantilla guardada correctamente");
      resetForm();
    },
    onError: () => toast.error("Error al guardar la plantilla"),
  });

  const deleteMutation = useMutation({
    // mutationFn: async (id) => await base44.entities.PayslipTemplate.delete(id),
    mutationFn: async (id) => await entitiesAPI.PayslipTemplate.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["payslipTemplates"]);
      toast.success("Plantilla eliminada");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  const toggleField = (section, fieldId) => {
    const currentFields = formData[section] || [];
    if (currentFields.includes(fieldId)) {
      setFormData({
        ...formData,
        [section]: currentFields.filter(f => f !== fieldId)
      });
    } else {
      setFormData({
        ...formData,
        [section]: [...currentFields, fieldId]
      });
    }
  };

  const handleEdit = (template) => {
    setEditingTemplate(template);
    setFormData({
      template_name: template.template_name,
      is_active: template.is_active,
      show_company_logo: template.show_company_logo,
      show_employee_photo: template.show_employee_photo,
      header_fields: template.header_fields || [],
      employee_info_fields: template.employee_info_fields || [],
      work_period_fields: template.work_period_fields || [],
      income_section: template.income_section || { show: true, title: "Ingresos", show_codes: true },
      discount_section: template.discount_section || { show: true, title: "Descuentos", show_codes: true, group_by_type: true },
      employer_contribution_section: template.employer_contribution_section || { show: true, title: "Aportes del Empleador", show_codes: true },
      footer_fields: template.footer_fields || [],
      show_signatures: template.show_signatures !== false,
      custom_notes: template.custom_notes || "",
      color_scheme: template.color_scheme || "blue",
    });
    setShowForm(true);
  };

  const resetForm = () => {
    setFormData({
      template_name: "",
      is_active: true,
      show_company_logo: true,
      show_employee_photo: false,
      header_fields: ["company_name", "company_ruc", "period"],
      employee_info_fields: ["full_name", "document", "position", "hire_date", "pension_system"],
      work_period_fields: ["worked_days"],
      income_section: { show: true, title: "Ingresos", show_codes: true },
      discount_section: { show: true, title: "Descuentos", show_codes: true, group_by_type: true },
      employer_contribution_section: { show: true, title: "Aportes del Empleador", show_codes: true },
      footer_fields: ["net_pay", "payment_date"],
      show_signatures: true,
      custom_notes: "",
      color_scheme: "blue",
    });
    setEditingTemplate(null);
    setShowForm(false);
  };

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
              Plantillas de Boletas de Pago
            </h1>
            <p className="text-slate-600 text-lg">
              Configura campos y diseño de las boletas según PLAME
            </p>
          </div>
          <Button onClick={() => setShowForm(true)} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" />
            Nueva Plantilla
          </Button>
        </div>

        {/* Templates List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {templates.map(template => (
            <Card key={template.id} className="border-0 shadow-lg">
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-100 rounded-lg">
                      <FileText className="w-5 h-5 text-indigo-600" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{template.template_name}</CardTitle>
                      {template.is_active && (
                        <Badge className="bg-green-100 text-green-700 mt-1">Activa</Badge>
                      )}
                    </div>
                  </div>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-2 text-sm text-slate-600 mb-4">
                  <p>• {template.header_fields?.length || 0} campos de encabezado</p>
                  <p>• {template.employee_info_fields?.length || 0} campos de empleado</p>
                  <p>• {template.work_period_fields?.length || 0} campos de período laboral</p>
                  <p>• Esquema: <Badge className="bg-slate-100 text-slate-700">{template.color_scheme}</Badge></p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => handleEdit(template)}
                    className="flex-1"
                  >
                    <Settings className="w-4 h-4 mr-2" />
                    Configurar
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => deleteMutation.mutate(template.id)}
                    className="text-red-600 hover:text-red-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
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
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    {editingTemplate ? "Editar Plantilla" : "Nueva Plantilla"}
                  </CardTitle>
                  <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Tabs defaultValue="basic" className="space-y-6">
                  <TabsList className="grid w-full grid-cols-4">
                    <TabsTrigger value="basic">Básico</TabsTrigger>
                    <TabsTrigger value="fields">Campos</TabsTrigger>
                    <TabsTrigger value="sections">Secciones</TabsTrigger>
                    <TabsTrigger value="style">Estilo</TabsTrigger>
                  </TabsList>

                  <TabsContent value="basic" className="space-y-4">
                    <div>
                      <Label>Nombre de la Plantilla *</Label>
                      <Input
                        value={formData.template_name}
                        onChange={(e) => setFormData({...formData, template_name: e.target.value})}
                        placeholder="Boleta Estándar PLAME"
                      />
                    </div>

                    <div className="flex items-center gap-4">
                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="active"
                          checked={formData.is_active}
                          onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="active">Plantilla Activa</Label>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="logo"
                          checked={formData.show_company_logo}
                          onChange={(e) => setFormData({...formData, show_company_logo: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="logo">Mostrar Logo Empresa</Label>
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          id="photo"
                          checked={formData.show_employee_photo}
                          onChange={(e) => setFormData({...formData, show_employee_photo: e.target.checked})}
                          className="w-4 h-4"
                        />
                        <Label htmlFor="photo">Mostrar Foto Empleado</Label>
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="fields" className="space-y-6">
                    <div>
                      <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <Building2 className="w-4 h-4" />
                        Campos del Encabezado
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_FIELDS.header.map(field => (
                          <button
                            key={field.id}
                            onClick={() => toggleField("header_fields", field.id)}
                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                              formData.header_fields.includes(field.id)
                                ? "bg-indigo-50 border-indigo-500"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {formData.header_fields.includes(field.id) ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-sm">{field.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 mb-3 flex items-center gap-2">
                        <User className="w-4 h-4" />
                        Información del Empleado
                      </h3>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_FIELDS.employee.map(field => (
                          <button
                            key={field.id}
                            onClick={() => toggleField("employee_info_fields", field.id)}
                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                              formData.employee_info_fields.includes(field.id)
                                ? "bg-indigo-50 border-indigo-500"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {formData.employee_info_fields.includes(field.id) ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-sm">{field.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 mb-3">Período Laboral</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_FIELDS.workPeriod.map(field => (
                          <button
                            key={field.id}
                            onClick={() => toggleField("work_period_fields", field.id)}
                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                              formData.work_period_fields.includes(field.id)
                                ? "bg-indigo-50 border-indigo-500"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {formData.work_period_fields.includes(field.id) ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-sm">{field.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div>
                      <h3 className="font-bold text-slate-900 mb-3">Pie de Página</h3>
                      <div className="grid grid-cols-2 gap-2">
                        {AVAILABLE_FIELDS.footer.map(field => (
                          <button
                            key={field.id}
                            onClick={() => toggleField("footer_fields", field.id)}
                            className={`flex items-center gap-2 p-2 rounded border transition-colors ${
                              formData.footer_fields.includes(field.id)
                                ? "bg-indigo-50 border-indigo-500"
                                : "bg-white border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            {formData.footer_fields.includes(field.id) ? (
                              <CheckSquare className="w-4 h-4 text-indigo-600" />
                            ) : (
                              <Square className="w-4 h-4 text-slate-400" />
                            )}
                            <span className="text-sm">{field.label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </TabsContent>

                  <TabsContent value="sections" className="space-y-4">
                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.income_section.show}
                            onChange={(e) => setFormData({
                              ...formData,
                              income_section: {...formData.income_section, show: e.target.checked}
                            })}
                            className="w-4 h-4"
                          />
                          <Label>Mostrar Sección de Ingresos</Label>
                        </div>
                        <Input
                          placeholder="Título de la sección"
                          value={formData.income_section.title}
                          onChange={(e) => setFormData({
                            ...formData,
                            income_section: {...formData.income_section, title: e.target.value}
                          })}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.income_section.show_codes}
                            onChange={(e) => setFormData({
                              ...formData,
                              income_section: {...formData.income_section, show_codes: e.target.checked}
                            })}
                            className="w-4 h-4"
                          />
                          <Label>Mostrar códigos de concepto</Label>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.discount_section.show}
                            onChange={(e) => setFormData({
                              ...formData,
                              discount_section: {...formData.discount_section, show: e.target.checked}
                            })}
                            className="w-4 h-4"
                          />
                          <Label>Mostrar Sección de Descuentos</Label>
                        </div>
                        <Input
                          placeholder="Título de la sección"
                          value={formData.discount_section.title}
                          onChange={(e) => setFormData({
                            ...formData,
                            discount_section: {...formData.discount_section, title: e.target.value}
                          })}
                        />
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.discount_section.group_by_type}
                            onChange={(e) => setFormData({
                              ...formData,
                              discount_section: {...formData.discount_section, group_by_type: e.target.checked}
                            })}
                            className="w-4 h-4"
                          />
                          <Label>Agrupar por tipo (General, AFP, Impuestos)</Label>
                        </div>
                      </CardContent>
                    </Card>

                    <Card>
                      <CardContent className="p-4 space-y-3">
                        <div className="flex items-center gap-2">
                          <input
                            type="checkbox"
                            checked={formData.employer_contribution_section.show}
                            onChange={(e) => setFormData({
                              ...formData,
                              employer_contribution_section: {...formData.employer_contribution_section, show: e.target.checked}
                            })}
                            className="w-4 h-4"
                          />
                          <Label>Mostrar Aportes del Empleador</Label>
                        </div>
                        <Input
                          placeholder="Título de la sección"
                          value={formData.employer_contribution_section.title}
                          onChange={(e) => setFormData({
                            ...formData,
                            employer_contribution_section: {...formData.employer_contribution_section, title: e.target.value}
                          })}
                        />
                      </CardContent>
                    </Card>
                  </TabsContent>

                  <TabsContent value="style" className="space-y-4">
                    <div>
                      <Label>Esquema de Colores</Label>
                      <div className="grid grid-cols-4 gap-3 mt-2">
                        {["blue", "green", "gray", "purple"].map(color => (
                          <button
                            key={color}
                            onClick={() => setFormData({...formData, color_scheme: color})}
                            className={`p-4 rounded-lg border-2 transition-all ${
                              formData.color_scheme === color
                                ? "border-indigo-600 bg-indigo-50"
                                : "border-slate-200 hover:border-slate-300"
                            }`}
                          >
                            <div className={`w-full h-8 rounded mb-2 bg-${color}-500`} />
                            <p className="text-sm font-medium capitalize">{color}</p>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="signatures"
                        checked={formData.show_signatures}
                        onChange={(e) => setFormData({...formData, show_signatures: e.target.checked})}
                        className="w-4 h-4"
                      />
                      <Label htmlFor="signatures">Mostrar líneas de firma</Label>
                    </div>

                    <div>
                      <Label>Notas Personalizadas (Pie de Página)</Label>
                      <Input
                        value={formData.custom_notes}
                        onChange={(e) => setFormData({...formData, custom_notes: e.target.value})}
                        placeholder="Ej: Esta boleta es un documento oficial..."
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
                    onClick={() => saveMutation.mutate(formData)}
                    disabled={saveMutation.isPending || !formData.template_name}
                  >
                    <Save className="w-4 h-4 mr-2" />
                    {saveMutation.isPending ? "Guardando..." : "Guardar Plantilla"}
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
