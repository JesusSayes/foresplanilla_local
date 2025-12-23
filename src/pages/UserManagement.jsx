import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { 
  Users, Mail, UserPlus, Search, Shield, 
  CheckCircle2, XCircle, AlertCircle, Send
} from "lucide-react";
import { toast } from "sonner";

export default function UserManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [showInviteModal, setShowInviteModal] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");

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

  const { data: allUsers = [] } = useQuery({
    queryKey: ["allUsers"],
    queryFn: async () => {
      return await base44.entities.User.list();
    },
  });

  const sendInviteMutation = useMutation({
    mutationFn: async ({ email, name }) => {
      return await base44.integrations.Core.SendEmail({
        to: email,
        subject: "Invitación al Sistema de RRHH",
        body: `
          Hola ${name},
          
          Has sido invitado a unirte al Sistema de Recursos Humanos de la empresa.
          
          Por favor, accede al sistema con tu correo corporativo: ${email}
          
          Si es tu primera vez, el sistema te pedirá crear una contraseña.
          
          Saludos,
          Equipo de Recursos Humanos
        `,
      });
    },
    onSuccess: (_, variables) => {
      toast.success(`Invitación enviada a ${variables.email}`);
      setShowInviteModal(null);
      setInviteEmail("");
    },
    onError: () => {
      toast.error("Error al enviar la invitación");
    },
  });

  const handleSendInvite = (emp) => {
    if (!emp.work_email) {
      toast.error("El empleado no tiene email corporativo");
      return;
    }

    sendInviteMutation.mutate({
      email: emp.work_email,
      name: `${emp.first_name} ${emp.last_name}`,
    });
  };

  const handleManualInvite = () => {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("Ingrese un email válido");
      return;
    }

    const emp = allEmployees.find(e => e.work_email === inviteEmail);
    
    sendInviteMutation.mutate({
      email: inviteEmail,
      name: emp ? `${emp.first_name} ${emp.last_name}` : "Usuario",
    });
  };

  const getUserForEmployee = (workEmail) => {
    return allUsers.find(u => u.email === workEmail);
  };

  const filteredEmployees = allEmployees.filter(emp => 
    emp.work_email && (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.work_email.toLowerCase().includes(searchTerm.toLowerCase())
    )
  );

  const employeesWithUsers = filteredEmployees.filter(emp => getUserForEmployee(emp.work_email));
  const employeesWithoutUsers = filteredEmployees.filter(emp => !getUserForEmployee(emp.work_email));

  const stats = {
    total: allEmployees.filter(e => e.work_email).length,
    withAccess: allEmployees.filter(e => e.work_email && getUserForEmployee(e.work_email)).length,
    pending: allEmployees.filter(e => e.work_email && !getUserForEmployee(e.work_email)).length,
  };

  if (!employee || !["admin", "super_admin"].includes(employee.role)) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <Shield className="w-16 h-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">
              Solo administradores pueden gestionar usuarios corporativos
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Gestión de Usuarios Corporativos
          </h1>
          <p className="text-slate-600 text-lg">
            Administra el acceso al sistema de empleados con email corporativo
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.total}</div>
              <p className="text-slate-600 text-sm">Total Empleados Corporativos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.withAccess}</div>
              <p className="text-slate-600 text-sm">Con Acceso al Sistema</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-orange-100 rounded-xl">
                  <AlertCircle className="w-6 h-6 text-orange-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.pending}</div>
              <p className="text-slate-600 text-sm">Pendientes de Invitar</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Manual Invite */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-6">
            <div className="flex flex-col md:flex-row gap-4">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                <Input
                  placeholder="Buscar por nombre, código o email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10 h-12"
                />
              </div>
              <Button
                onClick={() => setShowInviteModal(true)}
                className="bg-indigo-600 hover:bg-indigo-700 h-12"
              >
                <UserPlus className="w-5 h-5 mr-2" />
                Invitar Manualmente
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Pending Invitations */}
        {employeesWithoutUsers.length > 0 && (
          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="border-b bg-orange-50/50">
              <CardTitle className="text-xl font-bold flex items-center gap-2">
                <AlertCircle className="w-6 h-6 text-orange-600" />
                Empleados Pendientes de Invitar ({employeesWithoutUsers.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="space-y-3">
                {employeesWithoutUsers.map(emp => (
                  <div
                    key={emp.id}
                    className="flex items-center justify-between p-4 border-2 border-orange-200 bg-orange-50/30 rounded-lg hover:shadow-md transition-all"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                        <Users className="w-6 h-6 text-orange-600" />
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">
                          {emp.first_name} {emp.last_name}
                        </p>
                        <p className="text-sm text-slate-600">
                          {emp.employee_code} • {emp.position}
                        </p>
                        <div className="flex items-center gap-2 mt-1">
                          <Mail className="w-3 h-3 text-slate-500" />
                          <p className="text-xs text-slate-600">{emp.work_email}</p>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className="bg-orange-100 text-orange-700">
                        Sin Acceso
                      </Badge>
                      <Button
                        onClick={() => handleSendInvite(emp)}
                        disabled={sendInviteMutation.isPending}
                        className="bg-orange-600 hover:bg-orange-700"
                      >
                        <Send className="w-4 h-4 mr-2" />
                        Enviar Invitación
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Users with Access */}
        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b bg-green-50/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <CheckCircle2 className="w-6 h-6 text-green-600" />
              Empleados con Acceso al Sistema ({employeesWithUsers.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            {employeesWithUsers.length === 0 ? (
              <div className="text-center py-12 text-slate-500">
                <Users className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <p className="text-lg font-semibold mb-2">No hay usuarios registrados</p>
                <p className="text-sm">
                  Los empleados con email corporativo aparecerán aquí una vez que acepten su invitación
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {employeesWithUsers.map(emp => {
                  const user = getUserForEmployee(emp.work_email);
                  return (
                    <div
                      key={emp.id}
                      className="flex items-center justify-between p-4 border border-slate-200 bg-white rounded-lg hover:shadow-md transition-all"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-12 h-12 bg-green-100 rounded-full flex items-center justify-center">
                          <CheckCircle2 className="w-6 h-6 text-green-600" />
                        </div>
                        <div>
                          <p className="font-bold text-slate-900">
                            {emp.first_name} {emp.last_name}
                          </p>
                          <p className="text-sm text-slate-600">
                            {emp.employee_code} • {emp.position}
                          </p>
                          <div className="flex items-center gap-2 mt-1">
                            <Mail className="w-3 h-3 text-slate-500" />
                            <p className="text-xs text-slate-600">{emp.work_email}</p>
                          </div>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge className="bg-green-100 text-green-700">
                          Acceso Activo
                        </Badge>
                        <Badge 
                          className={
                            emp.role === "admin" || emp.role === "super_admin"
                              ? "bg-purple-100 text-purple-700"
                              : emp.role === "manager"
                              ? "bg-blue-100 text-blue-700"
                              : "bg-slate-100 text-slate-700"
                          }
                        >
                          {emp.role === "super_admin" ? "Super Admin" :
                           emp.role === "admin" ? "Admin" :
                           emp.role === "manager" ? "Manager" :
                           emp.role === "hr_readonly" ? "RRHH" :
                           "Empleado"}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Manual Invite Modal */}
      {showInviteModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => setShowInviteModal(false)}
        >
          <Card 
            className="max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">Invitar Usuario Manualmente</CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => setShowInviteModal(false)}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Email Corporativo</Label>
                <Input
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-2"
                />
                <p className="text-xs text-slate-500 mt-1">
                  El email debe corresponder a un empleado registrado en el sistema
                </p>
              </div>

              <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                <div className="flex items-start gap-2">
                  <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                  <div className="text-sm text-blue-900">
                    <p className="font-semibold mb-1">Importante:</p>
                    <p>
                      Se enviará un email de invitación a esta dirección. 
                      El usuario podrá acceder al sistema con su email corporativo.
                    </p>
                  </div>
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => setShowInviteModal(false)}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleManualInvite}
                  disabled={sendInviteMutation.isPending}
                >
                  {sendInviteMutation.isPending ? (
                    "Enviando..."
                  ) : (
                    <>
                      <Send className="w-4 h-4 mr-2" />
                      Enviar Invitación
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}