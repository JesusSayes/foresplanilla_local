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
  CheckCircle2, XCircle, AlertCircle, Send, Edit2, Trash2, Ban, KeyRound
} from "lucide-react";
import { toast } from "sonner";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function UserManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [showInviteModal, setShowInviteModal] = useState(null);
  const [sendingInviteFor, setSendingInviteFor] = useState(null);
  const [inviteEmail, setInviteEmail] = useState("");
  const [showUserModal, setShowUserModal] = useState(false);
  const [editingUser, setEditingUser] = useState(null);
  const [userFormData, setUserFormData] = useState({
    email: "",
    full_name: "",
    role: "user",
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
      return await base44.entities.Employee.list();
    },
    enabled: !!employee && ["admin", "super_admin"].includes(employee.role),
  });

  const { data: allUsers = [] } = useQuery({
    queryKey: ["allUsers"],
    queryFn: async () => {
      return await base44.entities.User.list();
    },
    enabled: !!employee && ["admin", "super_admin"].includes(employee.role),
  });

  const { data: allInvitations = [] } = useQuery({
    queryKey: ["allInvitations"],
    queryFn: async () => {
      return await base44.entities.UserInvitation.list("-invited_at");
    },
    enabled: !!employee && ["admin", "super_admin"].includes(employee.role),
  });

  const sendInviteMutation = useMutation({
    mutationFn: async ({ email, name, role, employeeId }) => {
      // Usar la función oficial de Base44 para invitar usuarios
      await base44.users.inviteUser(email, role || "user");
      
      // Registrar la invitación en la base de datos
      await base44.entities.UserInvitation.create({
        employee_id: employeeId,
        email: email,
        invited_by: currentUser?.email || "Sistema",
        invited_at: new Date().toISOString(),
        status: "Enviada"
      });
      
      // Opcionalmente enviar email adicional con información
      try {
        await base44.integrations.Core.SendEmail({
          to: email,
          subject: "Invitación al Sistema de RRHH",
          body: `
Hola ${name},

Has sido invitado a unirte al Sistema de Recursos Humanos de la empresa.

Por favor, revisa tu correo electrónico para encontrar el enlace de invitación oficial y configurar tu cuenta.

Tu email de acceso será: ${email}

Saludos,
Equipo de Recursos Humanos
          `,
        });
      } catch (emailError) {
        console.log("Email adicional no enviado:", emailError);
      }
      
      return { email, name, employeeId };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries(["allUsers"]);
      queryClient.invalidateQueries(["allInvitations"]);
      toast.success(`✓ Invitación enviada exitosamente a ${data.email}`);
      setSendingInviteFor(null);
      setShowInviteModal(null);
      setInviteEmail("");
    },
    onError: (error) => {
      toast.error(`Error al enviar invitación: ${error.message || "Inténtelo de nuevo"}`);
      setSendingInviteFor(null);
    },
  });

  const createUserMutation = useMutation({
    mutationFn: async (userData) => {
      // Note: User entity creation is handled by Base44 platform
      // This would typically be done through an admin API
      throw new Error("La creación de usuarios se maneja a través del sistema de invitaciones");
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allUsers"]);
      toast.success("Usuario creado correctamente");
      resetUserForm();
    },
    onError: (error) => {
      toast.error(error.message || "Error al crear usuario");
    },
  });

  const updateUserMutation = useMutation({
    mutationFn: async ({ userId, userData }) => {
      return await base44.entities.User.update(userId, userData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allUsers"]);
      toast.success("Usuario actualizado correctamente");
      resetUserForm();
    },
    onError: () => {
      toast.error("Error al actualizar usuario");
    },
  });

  const deleteUserMutation = useMutation({
    mutationFn: async (userId) => {
      return await base44.entities.User.delete(userId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allUsers"]);
      toast.success("Usuario eliminado del sistema");
    },
    onError: () => {
      toast.error("Error al eliminar usuario");
    },
  });

  const updateEmployeeRoleMutation = useMutation({
    mutationFn: async ({ employeeId, role }) => {
      return await base44.entities.Employee.update(employeeId, { role });
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["allEmployees"]);
      toast.success("Rol actualizado correctamente");
    },
    onError: () => {
      toast.error("Error al actualizar rol");
    },
  });

  const handleSendInvite = (emp) => {
    if (!emp.work_email) {
      toast.error("El empleado no tiene email corporativo");
      return;
    }

    setSendingInviteFor(emp.id);

    // Determinar el rol a asignar basado en el rol del empleado
    let inviteRole = "user"; // rol por defecto
    if (emp.role === "admin" || emp.role === "super_admin") {
      inviteRole = "admin";
    }

    sendInviteMutation.mutate({
      email: emp.work_email,
      name: `${emp.first_name} ${emp.last_name}`,
      role: inviteRole,
      employeeId: emp.id,
    });
  };

  const handleManualInvite = () => {
    if (!inviteEmail || !inviteEmail.includes("@")) {
      toast.error("Ingrese un email válido");
      return;
    }

    const emp = allEmployees.find(e => e.work_email === inviteEmail);
    
    if (!emp) {
      toast.error("El email no corresponde a ningún empleado registrado en el sistema");
      return;
    }

    setSendingInviteFor(emp.id);

    // Determinar el rol a asignar
    let inviteRole = "user";
    if (emp.role === "admin" || emp.role === "super_admin") {
      inviteRole = "admin";
    }
    
    sendInviteMutation.mutate({
      email: inviteEmail,
      name: `${emp.first_name} ${emp.last_name}`,
      role: inviteRole,
      employeeId: emp.id,
    });
  };

  const handleEditUser = (user, emp) => {
    setEditingUser({ ...user, employee: emp });
    setUserFormData({
      email: user.email,
      full_name: user.full_name,
      role: emp?.role || "empleado",
    });
    setShowUserModal(true);
  };

  const handleSaveUser = async () => {
    if (!userFormData.email || !userFormData.full_name) {
      toast.error("Complete todos los campos obligatorios");
      return;
    }

    if (editingUser) {
      // Update user info
      await updateUserMutation.mutateAsync({
        userId: editingUser.id,
        userData: {
          full_name: userFormData.full_name,
        },
      });

      // Update employee role if changed
      if (editingUser.employee && editingUser.employee.role !== userFormData.role) {
        await updateEmployeeRoleMutation.mutateAsync({
          employeeId: editingUser.employee.id,
          role: userFormData.role,
        });
      }
    }
  };

  const handleDeleteUser = (userId, userName) => {
    if (confirm(`¿Está seguro de eliminar el acceso de ${userName}? Esta acción no se puede deshacer.`)) {
      deleteUserMutation.mutate(userId);
    }
  };

  const handleSuspendUser = async (emp, currentStatus) => {
    const newStatus = currentStatus === "Activo" ? "Suspendido" : "Activo";
    try {
      await base44.entities.Employee.update(emp.id, { status: newStatus });
      queryClient.invalidateQueries(["allEmployees"]);
      toast.success(`Usuario ${newStatus === "Suspendido" ? "suspendido" : "reactivado"} correctamente`);
    } catch (error) {
      toast.error("Error al cambiar estado del usuario");
    }
  };

  const resetUserForm = () => {
    setUserFormData({
      email: "",
      full_name: "",
      role: "user",
    });
    setEditingUser(null);
    setShowUserModal(false);
  };

  const getUserForEmployee = (workEmail) => {
    return allUsers.find(u => u.email === workEmail);
  };

  const getInvitationForEmployee = (employeeId) => {
    return allInvitations.find(inv => inv.employee_id === employeeId);
  };

  const allCorporateEmployees = allEmployees.filter(emp => emp.work_email);
  
  const applyFilters = (employees) => {
    let filtered = employees;
    
    // Aplicar filtro de búsqueda
    if (searchTerm) {
      filtered = filtered.filter(emp => 
        emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase()) ||
        emp.work_email.toLowerCase().includes(searchTerm.toLowerCase())
      );
    }
    
    // Aplicar filtro de estado
    if (statusFilter !== "all") {
      filtered = filtered.filter(emp => emp.status === statusFilter);
    }
    
    return filtered;
  };

  const employeesWithUsers = applyFilters(
    allCorporateEmployees.filter(emp => getUserForEmployee(emp.work_email))
  );
  
  const employeesWithoutUsers = applyFilters(
    allCorporateEmployees.filter(emp => !getUserForEmployee(emp.work_email))
  );

  const stats = {
    total: allCorporateEmployees.length,
    active: allCorporateEmployees.filter(e => e.status === "Activo").length,
    suspended: allCorporateEmployees.filter(e => e.status === "Suspendido").length,
    ceased: allCorporateEmployees.filter(e => e.status === "Cesado").length,
    withAccess: allCorporateEmployees.filter(e => getUserForEmployee(e.work_email)).length,
    pending: allCorporateEmployees.filter(e => !getUserForEmployee(e.work_email) && e.status === "Activo").length,
  };

  if (!currentUser || !employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!["admin", "super_admin"].includes(employee.role)) {
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
        <div className="grid grid-cols-1 md:grid-cols-5 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Users className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.total}</div>
              <p className="text-slate-600 text-sm">Total Empleados</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle2 className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.active}</div>
              <p className="text-slate-600 text-sm">Activos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-yellow-100 rounded-xl">
                  <Ban className="w-6 h-6 text-yellow-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.suspended}</div>
              <p className="text-slate-600 text-sm">Suspendidos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-red-100 rounded-xl">
                  <XCircle className="w-6 h-6 text-red-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.ceased}</div>
              <p className="text-slate-600 text-sm">Cesados</p>
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
              <p className="text-slate-600 text-sm">Pendientes</p>
            </CardContent>
          </Card>
        </div>

        {/* Search and Filters */}
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
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-48 h-12">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los estados</SelectItem>
                  <SelectItem value="Activo">Activos</SelectItem>
                  <SelectItem value="Suspendido">Suspendidos</SelectItem>
                  <SelectItem value="Cesado">Cesados</SelectItem>
                </SelectContent>
              </Select>
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

        {/* Tabs for better organization */}
        <Tabs defaultValue="with-access" className="space-y-6">
          <TabsList className="grid w-full grid-cols-2 h-12">
            <TabsTrigger value="with-access" className="text-base">
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Con Acceso ({employeesWithUsers.length})
            </TabsTrigger>
            <TabsTrigger value="pending" className="text-base">
              <AlertCircle className="w-4 h-4 mr-2" />
              Pendientes de Invitar ({employeesWithoutUsers.length})
            </TabsTrigger>
          </TabsList>

          {/* Users with Access Tab */}
          <TabsContent value="with-access">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-green-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <CheckCircle2 className="w-6 h-6 text-green-600" />
                    Empleados con Acceso al Sistema
                  </CardTitle>
                  <Badge className="bg-green-100 text-green-700 text-base px-4 py-1">
                    {employeesWithUsers.length} usuarios
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {employeesWithUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <CheckCircle2 className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2">No hay usuarios con acceso</p>
                    <p className="text-sm">
                      Los empleados aparecerán aquí una vez que acepten su invitación
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
                                {emp.employee_code} • {emp.position} • {emp.department_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Mail className="w-3 h-3 text-slate-500" />
                                <p className="text-xs text-slate-600">{emp.work_email}</p>
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge 
                              className={
                                emp.status === "Cesado"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : emp.status === "Suspendido"
                                  ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                  : "bg-green-100 text-green-700 border-green-200"
                              }
                            >
                              {emp.status}
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
                            <div className="flex gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleEditUser(user, emp)}
                                className="h-8"
                              >
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              {emp.status === "Activo" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSuspendUser(emp, emp.status)}
                                  className="h-8 text-orange-600 hover:text-orange-700"
                                  title="Suspender acceso"
                                >
                                  <Ban className="w-4 h-4" />
                                </Button>
                              )}
                              {emp.status === "Suspendido" && (
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => handleSuspendUser(emp, emp.status)}
                                  className="h-8 text-green-600 hover:text-green-700"
                                  title="Reactivar acceso"
                                >
                                  <CheckCircle2 className="w-4 h-4" />
                                </Button>
                              )}
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => handleDeleteUser(user.id, `${emp.first_name} ${emp.last_name}`)}
                                className="h-8 text-red-600 hover:text-red-700"
                                title="Eliminar usuario"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Pending Invitations Tab */}
          <TabsContent value="pending">
            <Card className="border-0 shadow-lg">
              <CardHeader className="border-b bg-orange-50/50">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold flex items-center gap-2">
                    <AlertCircle className="w-6 h-6 text-orange-600" />
                    Empleados Pendientes de Invitar
                  </CardTitle>
                  <Badge className="bg-orange-100 text-orange-700 text-base px-4 py-1">
                    {employeesWithoutUsers.length} pendientes
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                {employeesWithoutUsers.length === 0 ? (
                  <div className="text-center py-12 text-slate-500">
                    <CheckCircle2 className="w-16 h-16 text-green-300 mx-auto mb-4" />
                    <p className="text-lg font-semibold mb-2 text-green-700">
                      ¡Excelente! Todos los empleados han sido invitados
                    </p>
                    <p className="text-sm">
                      No hay empleados pendientes de invitar al sistema
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {employeesWithoutUsers.map(emp => {
                      const invitation = getInvitationForEmployee(emp.id);
                      const hasBeenInvited = !!invitation;
                      const isSending = sendingInviteFor === emp.id;

                      return (
                        <div
                          key={emp.id}
                          className={`flex items-center justify-between p-4 border-2 rounded-lg hover:shadow-md transition-all ${
                            hasBeenInvited 
                              ? 'border-blue-200 bg-blue-50/30'
                              : 'border-orange-200 bg-orange-50/30'
                          }`}
                        >
                          <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${
                              hasBeenInvited ? 'bg-blue-100' : 'bg-orange-100'
                            }`}>
                              {hasBeenInvited ? (
                                <Mail className="w-6 h-6 text-blue-600" />
                              ) : (
                                <AlertCircle className="w-6 h-6 text-orange-600" />
                              )}
                            </div>
                            <div>
                              <p className="font-bold text-slate-900">
                                {emp.first_name} {emp.last_name}
                              </p>
                              <p className="text-sm text-slate-600">
                                {emp.employee_code} • {emp.position} • {emp.department_name}
                              </p>
                              <div className="flex items-center gap-2 mt-1">
                                <Mail className="w-3 h-3 text-slate-500" />
                                <p className="text-xs text-slate-600">{emp.work_email}</p>
                              </div>
                              {hasBeenInvited && invitation.invited_at && (
                                <p className="text-xs text-blue-600 mt-1">
                                  Invitado el {new Date(invitation.invited_at).toLocaleDateString('es-PE')} a las {new Date(invitation.invited_at).toLocaleTimeString('es-PE', {hour: '2-digit', minute: '2-digit'})}
                                </p>
                              )}
                            </div>
                          </div>
                          <div className="flex items-center gap-3">
                            <Badge 
                              className={
                                emp.status === "Cesado"
                                  ? "bg-red-100 text-red-700 border-red-200"
                                  : emp.status === "Suspendido"
                                  ? "bg-yellow-100 text-yellow-700 border-yellow-200"
                                  : hasBeenInvited
                                  ? "bg-blue-100 text-blue-700 border-blue-200"
                                  : "bg-orange-100 text-orange-700 border-orange-200"
                              }
                            >
                              {emp.status}
                            </Badge>
                            {hasBeenInvited ? (
                              <Badge className="bg-blue-100 text-blue-700 border-blue-200">
                                Invitación Enviada
                              </Badge>
                            ) : (
                              <Badge className="bg-orange-100 text-orange-700 border-orange-200">
                                Sin Invitar
                              </Badge>
                            )}
                            {emp.status === "Activo" && (
                              <Button
                                onClick={() => handleSendInvite(emp)}
                                disabled={isSending}
                                className={hasBeenInvited ? "bg-blue-600 hover:bg-blue-700" : "bg-orange-600 hover:bg-orange-700"}
                                size="sm"
                              >
                                {isSending ? (
                                  <>Enviando...</>
                                ) : (
                                  <>
                                    <Send className="w-4 h-4 mr-2" />
                                    {hasBeenInvited ? 'Reenviar Invitación' : 'Enviar Invitación'}
                                  </>
                                )}
                              </Button>
                            )}
                            {emp.status !== "Activo" && (
                              <p className="text-xs text-slate-500 italic">
                                No disponible ({emp.status})
                              </p>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* Edit User Modal */}
      {showUserModal && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
          onClick={() => resetUserForm()}
        >
          <Card 
            className="max-w-lg w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingUser ? "Editar Usuario" : "Nuevo Usuario"}
                </CardTitle>
                <Button 
                  variant="ghost" 
                  size="icon" 
                  onClick={() => resetUserForm()}
                >
                  ✕
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Email Corporativo *</Label>
                <Input
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={userFormData.email}
                  onChange={(e) => setUserFormData({...userFormData, email: e.target.value})}
                  className="mt-2"
                  disabled={!!editingUser}
                />
              </div>

              <div>
                <Label>Nombre Completo *</Label>
                <Input
                  placeholder="Nombre completo del usuario"
                  value={userFormData.full_name}
                  onChange={(e) => setUserFormData({...userFormData, full_name: e.target.value})}
                  className="mt-2"
                />
              </div>

              <div>
                <Label>Rol en el Sistema *</Label>
                <select
                  value={userFormData.role}
                  onChange={(e) => setUserFormData({...userFormData, role: e.target.value})}
                  className="w-full mt-2 h-10 px-3 rounded-md border border-slate-200 bg-white text-slate-900"
                >
                  <option value="empleado">Empleado</option>
                  <option value="manager">Manager</option>
                  <option value="hr_readonly">RRHH (Solo Lectura)</option>
                  <option value="admin">Administrador</option>
                  {employee?.role === "super_admin" && (
                    <option value="super_admin">Super Administrador</option>
                  )}
                </select>
                <p className="text-xs text-slate-500 mt-1">
                  Define el nivel de acceso del usuario en el sistema
                </p>
              </div>

              {editingUser && (
                <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                  <div className="flex items-start gap-2">
                    <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                    <div className="text-sm text-blue-900">
                      <p className="font-semibold mb-1">Información:</p>
                      <p>
                        Los cambios se aplicarán inmediatamente. 
                        El usuario verá reflejado su nuevo rol en el próximo inicio de sesión.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  className="flex-1" 
                  onClick={() => resetUserForm()}
                >
                  Cancelar
                </Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSaveUser}
                  disabled={updateUserMutation.isPending || createUserMutation.isPending}
                >
                  {updateUserMutation.isPending || createUserMutation.isPending ? (
                    "Guardando..."
                  ) : (
                    editingUser ? "Actualizar Usuario" : "Crear Usuario"
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

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
                <Label>Email Corporativo *</Label>
                <Input
                  type="email"
                  placeholder="usuario@empresa.com"
                  value={inviteEmail}
                  onChange={(e) => setInviteEmail(e.target.value)}
                  className="mt-2"
                  autoFocus
                />
                <p className="text-xs text-slate-500 mt-1">
                  El email debe corresponder a un empleado registrado en el sistema
                </p>
                {inviteEmail && !allEmployees.find(e => e.work_email === inviteEmail) && (
                  <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                    <XCircle className="w-3 h-3" />
                    Este email no pertenece a ningún empleado registrado
                  </p>
                )}
                {inviteEmail && allEmployees.find(e => e.work_email === inviteEmail) && (
                  <p className="text-xs text-green-600 mt-1 flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3" />
                    Empleado: {allEmployees.find(e => e.work_email === inviteEmail).first_name} {allEmployees.find(e => e.work_email === inviteEmail).last_name}
                  </p>
                )}
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