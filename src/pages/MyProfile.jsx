import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  User, Mail, Phone, MapPin, Calendar, 
  Briefcase, Save, Edit, X, Check, AlertCircle
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import TipoCambioWidget from "@/components/tipoCambio/TipoCambioWidget";

export default function MyProfile() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState({});
  const [loading, setLoading] = useState(true);

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
          setFormData({
            personal_email: employees[0].personal_email || "",
            phone: employees[0].phone || "",
            mobile: employees[0].mobile || "",
            address: employees[0].address || "",
            district: employees[0].district || "",
            province: employees[0].province || "",
            department: employees[0].department || "",
            emergency_contact_name: employees[0].emergency_contact_name || "",
            emergency_contact_phone: employees[0].emergency_contact_phone || "",
            emergency_contact_relationship: employees[0].emergency_contact_relationship || "",
          });
        }
      } catch (error) {
        console.error("Error loading user:", error);
      } finally {
        setLoading(false);
      }
    };

    loadUserData();
  }, []);

  const updateMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Employee.update(employee.id, data);
    },
    onSuccess: (updatedEmployee) => {
      setEmployee(updatedEmployee);
      setIsEditing(false);
      toast.success("Información actualizada exitosamente");
      queryClient.invalidateQueries(["employee"]);
    },
    onError: (error) => {
      toast.error("Error al actualizar la información");
      console.error(error);
    },
  });

  const handleSave = () => {
    // Validate required fields
    if (!formData.mobile) {
      toast.error("El número de celular es requerido");
      return;
    }

    updateMutation.mutate(formData);
  };

  const handleCancel = () => {
    // Reset form to original employee data
    setFormData({
      personal_email: employee.personal_email || "",
      phone: employee.phone || "",
      mobile: employee.mobile || "",
      address: employee.address || "",
      district: employee.district || "",
      province: employee.province || "",
      department: employee.department || "",
      emergency_contact_name: employee.emergency_contact_name || "",
      emergency_contact_phone: employee.emergency_contact_phone || "",
      emergency_contact_relationship: employee.emergency_contact_relationship || "",
    });
    setIsEditing(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <AlertCircle className="w-16 h-16 text-red-500 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">No autorizado</h3>
            <p className="text-slate-600">No se encontró información del empleado</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const yearsOfService = employee.hire_date 
    ? Math.floor((new Date() - new Date(employee.hire_date)) / (365.25 * 24 * 60 * 60 * 1000))
    : 0;

  const nonEditableFields = [
    {
      label: "Código de Empleado",
      value: employee.employee_code,
      icon: Briefcase,
    },
    {
      label: "Tipo de Documento",
      value: employee.document_type,
      icon: User,
    },
    {
      label: "Número de Documento",
      value: employee.document_number,
      icon: User,
    },
    {
      label: "Nombres Completos",
      value: `${employee.first_name} ${employee.last_name}`,
      icon: User,
    },
    {
      label: "Fecha de Nacimiento",
      value: employee.birth_date ? format(new Date(employee.birth_date), "dd 'de' MMMM, yyyy", { locale: es }) : "N/A",
      icon: Calendar,
    },
    {
      label: "Email Corporativo",
      value: employee.work_email,
      icon: Mail,
    },
    {
      label: "Cargo",
      value: employee.position,
      icon: Briefcase,
    },
    {
      label: "Departamento",
      value: employee.department_name,
      icon: Briefcase,
    },
    {
      label: "Fecha de Ingreso",
      value: employee.hire_date ? format(new Date(employee.hire_date), "dd 'de' MMMM, yyyy", { locale: es }) : "N/A",
      icon: Calendar,
    },
    {
      label: "Tipo de Contrato",
      value: employee.contract_type,
      icon: Briefcase,
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-5xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Mi Perfil</h1>
          <p className="text-slate-600 text-lg">
            Administra tu información personal y laboral
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Profile Card */}
          <div className="lg:col-span-1">
            <Card className="border-0 shadow-lg sticky top-8">
              <CardContent className="p-8 text-center">
                <div className="w-32 h-32 mx-auto mb-6 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white shadow-xl">
                  {employee.photo_url ? (
                    <img 
                      src={employee.photo_url} 
                      alt={employee.first_name}
                      className="w-full h-full rounded-full object-cover"
                    />
                  ) : (
                    <User className="w-16 h-16" />
                  )}
                </div>
                
                <h2 className="text-2xl font-bold text-slate-900 mb-2">
                  {employee.first_name} {employee.last_name}
                </h2>
                
                <p className="text-slate-600 mb-4">{employee.position}</p>
                
                <div className="flex flex-wrap gap-2 justify-center mb-6">
                  <Badge className="bg-indigo-100 text-indigo-700 border-indigo-200">
                    {employee.employee_code}
                  </Badge>
                  <Badge className="bg-green-100 text-green-700 border-green-200">
                    {employee.status}
                  </Badge>
                </div>

                <div className="space-y-3 text-left bg-slate-50 rounded-lg p-4">
                  <div className="flex items-center gap-3 text-sm">
                    <Briefcase className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-700">{employee.department_name}</span>
                  </div>
                  <div className="flex items-center gap-3 text-sm">
                    <Calendar className="w-4 h-4 text-slate-500" />
                    <span className="text-slate-700">
                      {yearsOfService} {yearsOfService === 1 ? 'año' : 'años'} de servicio
                    </span>
                  </div>
                  {employee.supervisor_name && (
                    <div className="flex items-center gap-3 text-sm">
                      <User className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-700">
                        Supervisor: {employee.supervisor_name}
                      </span>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Tipo de Cambio del día */}
            <TipoCambioWidget employee={employee} />
          </div>

          {/* Information Cards */}
          <div className="lg:col-span-2 space-y-6">
            {/* Non-Editable Information */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <User className="w-5 h-5" />
                  Información Personal
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {nonEditableFields.map((field, index) => {
                    const Icon = field.icon;
                    return (
                      <div key={index} className="space-y-2">
                        <Label className="text-sm text-slate-600 flex items-center gap-2">
                          <Icon className="w-4 h-4" />
                          {field.label}
                        </Label>
                        <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg">
                          <p className="font-semibold text-slate-900">{field.value || "N/A"}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Editable Contact Information */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <Phone className="w-5 h-5" />
                    Información de Contacto
                  </CardTitle>
                  {!isEditing && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setIsEditing(true)}
                    >
                      <Edit className="w-4 h-4 mr-2" />
                      Editar
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="personal_email">Email Personal *</Label>
                      <Input
                        id="personal_email"
                        type="email"
                        value={formData.personal_email}
                        onChange={(e) => setFormData({ ...formData, personal_email: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="mobile">Celular *</Label>
                      <Input
                        id="mobile"
                        value={formData.mobile}
                        onChange={(e) => setFormData({ ...formData, mobile: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                        placeholder="999 999 999"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="phone">Teléfono Fijo</Label>
                      <Input
                        id="phone"
                        value={formData.phone}
                        onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                        placeholder="01 234 5678"
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="address">Dirección</Label>
                    <Input
                      id="address"
                      value={formData.address}
                      onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                      disabled={!isEditing}
                      className={!isEditing ? "bg-slate-50" : ""}
                      placeholder="Av. / Jr. / Calle..."
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="space-y-2">
                      <Label htmlFor="district">Distrito</Label>
                      <Input
                        id="district"
                        value={formData.district}
                        onChange={(e) => setFormData({ ...formData, district: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="province">Provincia</Label>
                      <Input
                        id="province"
                        value={formData.province}
                        onChange={(e) => setFormData({ ...formData, province: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="department">Departamento</Label>
                      <Input
                        id="department"
                        value={formData.department}
                        onChange={(e) => setFormData({ ...formData, department: e.target.value })}
                        disabled={!isEditing}
                        className={!isEditing ? "bg-slate-50" : ""}
                      />
                    </div>
                  </div>

                  {isEditing && (
                    <div className="flex gap-3 pt-4 border-t">
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={handleCancel}
                      >
                        <X className="w-4 h-4 mr-2" />
                        Cancelar
                      </Button>
                      <Button
                        className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                        onClick={handleSave}
                        disabled={updateMutation.isPending}
                      >
                        <Check className="w-4 h-4 mr-2" />
                        {updateMutation.isPending ? "Guardando..." : "Guardar Cambios"}
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* Emergency Contact */}
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-slate-50/50">
                <CardTitle className="text-xl font-bold flex items-center gap-2">
                  <AlertCircle className="w-5 h-5" />
                  Contacto de Emergencia
                </CardTitle>
              </CardHeader>
              <CardContent className="p-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact_name">Nombre Completo</Label>
                    <Input
                      id="emergency_contact_name"
                      value={formData.emergency_contact_name}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_name: e.target.value })}
                      disabled={!isEditing}
                      className={!isEditing ? "bg-slate-50" : ""}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact_phone">Teléfono</Label>
                    <Input
                      id="emergency_contact_phone"
                      value={formData.emergency_contact_phone}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_phone: e.target.value })}
                      disabled={!isEditing}
                      className={!isEditing ? "bg-slate-50" : ""}
                    />
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="emergency_contact_relationship">Relación</Label>
                    <Input
                      id="emergency_contact_relationship"
                      value={formData.emergency_contact_relationship}
                      onChange={(e) => setFormData({ ...formData, emergency_contact_relationship: e.target.value })}
                      disabled={!isEditing}
                      className={!isEditing ? "bg-slate-50" : ""}
                      placeholder="Ej: Madre, Esposo/a, Hermano/a"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            {/* Info Alert */}
            <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-900">
                <p className="font-semibold mb-1">Información importante</p>
                <p>
                  Los campos marcados con asterisco (*) son obligatorios. 
                  Si necesitas actualizar información personal como nombres, documento de identidad o datos laborales, 
                  contacta al área de Recursos Humanos.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}