import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, Plus, Edit, Trash2, CheckCircle, XCircle, 
  AlertCircle, Search, Calendar, Users
} from "lucide-react";
import { toast } from "sonner";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import PermissionGuard from "../components/PermissionGuard";

export default function LoanManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [loanFormData, setLoanFormData] = useState({
    employee_id: "",
    loan_type_id: "",
    amount: "",
    total_installments: "",
    start_date: format(new Date(), "yyyy-MM-dd"),
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

  const { data: loanTypes = [] } = useQuery({
    queryKey: ["loanTypes"],
    queryFn: async () => {
      const types = await base44.entities.LoanType.list("name");
      if (types.length === 0) {
        // Crear tipos por defecto
        await base44.entities.LoanType.bulkCreate([
          { name: "Personal", description: "Préstamo personal" },
          { name: "Escolar", description: "Préstamo escolar" },
          { name: "Vacaciones", description: "Préstamo vacacional" }
        ]);
        return await base44.entities.LoanType.list("name");
      }
      return types;
    },
  });

  const { data: loans = [] } = useQuery({
    queryKey: ["loans"],
    queryFn: async () => {
      return await base44.entities.Loan.list("-created_date");
    },
  });

  const { data: installments = [] } = useQuery({
    queryKey: ["loanInstallments"],
    queryFn: async () => {
      return await base44.entities.LoanInstallment.list("-created_date");
    },
  });

  const createLoanMutation = useMutation({
    mutationFn: async (data) => {
      const monthlyAmount = parseFloat(data.amount) / parseInt(data.total_installments);
      const startDate = new Date(data.start_date);
      const endDate = addMonths(startDate, parseInt(data.total_installments) - 1);

      const loanData = {
        ...data,
        amount: parseFloat(data.amount),
        total_installments: parseInt(data.total_installments),
        monthly_amount: monthlyAmount,
        end_date: format(endDate, "yyyy-MM-dd"),
        approved_by: currentUser.email,
        approval_date: format(new Date(), "yyyy-MM-dd"),
        status: "Activo",
      };

      const loan = await base44.entities.Loan.create(loanData);

      // Crear las cuotas mensuales
      const installmentsToCreate = [];
      for (let i = 0; i < parseInt(data.total_installments); i++) {
        const installmentDate = addMonths(startDate, i);
        installmentsToCreate.push({
          loan_id: loan.id,
          month: installmentDate.getMonth() + 1,
          year: installmentDate.getFullYear(),
          amount: monthlyAmount,
          status: "Pendiente",
        });
      }

      await base44.entities.LoanInstallment.bulkCreate(installmentsToCreate);

      return loan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["loans"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      toast.success("Préstamo registrado correctamente");
      // Cerrar modal inmediatamente
      setShowLoanForm(false);
      setEditingLoan(null);
      setLoanFormData({
        employee_id: "",
        loan_type_id: "",
        amount: "",
        total_installments: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
    },
    onError: (error) => {
      console.error("Error al registrar préstamo:", error);
      toast.error("Error al registrar el préstamo");
    },
  });

  const updateLoanMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await base44.entities.Loan.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["loans"]);
      toast.success("Préstamo actualizado correctamente");
      // Cerrar modal inmediatamente
      setShowLoanForm(false);
      setEditingLoan(null);
      setLoanFormData({
        employee_id: "",
        loan_type_id: "",
        amount: "",
        total_installments: "",
        start_date: format(new Date(), "yyyy-MM-dd"),
        notes: "",
      });
    },
    onError: (error) => {
      console.error("Error al actualizar préstamo:", error);
      toast.error("Error al actualizar el préstamo");
    },
  });

  const deleteLoanMutation = useMutation({
    mutationFn: async (id) => {
      // Eliminar cuotas asociadas
      const loanInstallments = installments.filter(i => i.loan_id === id);
      await Promise.all(loanInstallments.map(i => base44.entities.LoanInstallment.delete(i.id)));
      
      return await base44.entities.Loan.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["loans"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      toast.success("Préstamo eliminado correctamente");
    },
    onError: () => {
      toast.error("Error al eliminar el préstamo");
    },
  });

  const handleSubmit = () => {
    // Validaciones específicas con mensajes orientativos
    if (!loanFormData.employee_id) {
      toast.error("⚠️ Debes seleccionar un empleado");
      return;
    }

    if (!loanFormData.loan_type_id) {
      toast.error("⚠️ Debes seleccionar el tipo de préstamo (Personal, Escolar o Vacaciones)");
      return;
    }

    if (!loanFormData.amount) {
      toast.error("⚠️ Debes ingresar el monto total del préstamo");
      return;
    }

    if (parseFloat(loanFormData.amount) <= 0) {
      toast.error("⚠️ El monto del préstamo debe ser mayor a 0");
      return;
    }

    if (!loanFormData.total_installments) {
      toast.error("⚠️ Debes ingresar el número de cuotas mensuales");
      return;
    }

    if (parseInt(loanFormData.total_installments) <= 0) {
      toast.error("⚠️ El número de cuotas debe ser mayor a 0");
      return;
    }

    if (!loanFormData.start_date) {
      toast.error("⚠️ Debes seleccionar la fecha de inicio del descuento");
      return;
    }

    // Validar que no exista un préstamo activo del mismo tipo para el empleado
    if (!editingLoan) {
      const existingActiveLoan = loans.find(loan => 
        loan.employee_id === loanFormData.employee_id && 
        loan.loan_type_id === loanFormData.loan_type_id && 
        loan.status === "Activo"
      );

      if (existingActiveLoan) {
        const empName = getEmployeeName(loanFormData.employee_id);
        const typeName = getLoanTypeName(loanFormData.loan_type_id);
        toast.error(`⚠️ ${empName} ya tiene un préstamo ${typeName} activo. Debe estar pagado o cancelado antes de registrar uno nuevo.`);
        return;
      }
    }

    if (editingLoan) {
      updateLoanMutation.mutate({ id: editingLoan.id, data: loanFormData });
    } else {
      createLoanMutation.mutate(loanFormData);
    }
  };

  const handleEdit = (loan) => {
    setEditingLoan(loan);
    setLoanFormData({
      employee_id: loan.employee_id,
      loan_type_id: loan.loan_type_id,
      amount: loan.amount.toString(),
      total_installments: loan.total_installments.toString(),
      start_date: loan.start_date,
      notes: loan.notes || "",
    });
    setShowLoanForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("¿Estás seguro de eliminar este préstamo?")) {
      deleteLoanMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setLoanFormData({
      employee_id: "",
      loan_type_id: "",
      amount: "",
      total_installments: "",
      start_date: format(new Date(), "yyyy-MM-dd"),
      notes: "",
    });
    setEditingLoan(null);
    setShowLoanForm(false);
  };

  const getEmployeeName = (empId) => {
    const emp = allEmployees.find(e => e.id === empId);
    return emp ? `${emp.first_name} ${emp.last_name}` : "N/A";
  };

  const getLoanTypeName = (typeId) => {
    const type = loanTypes.find(t => t.id === typeId);
    return type ? type.name : "N/A";
  };

  const getLoanInstallments = (loanId) => {
    return installments.filter(i => i.loan_id === loanId);
  };

  const filteredLoans = loans.filter(loan => {
    const emp = allEmployees.find(e => e.id === loan.employee_id);
    const matchesSearch = emp && (
      emp.first_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.last_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp.employee_code.toLowerCase().includes(searchTerm.toLowerCase())
    );
    const matchesStatus = statusFilter === "all" || loan.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  const activeLoans = loans.filter(l => l.status === "Activo");
  const totalActiveAmount = activeLoans.reduce((sum, l) => sum + l.amount, 0);
  const totalPendingInstallments = installments.filter(i => i.status === "Pendiente").length;

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredRole="admin">
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Gestión de Préstamos
            </h1>
            <p className="text-slate-600 text-lg">
              Administra préstamos de empleados y descuentos en planilla
            </p>
          </div>

          <div className="flex flex-wrap gap-4 mb-6">
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
              <DollarSign className="w-5 h-5 text-green-600" />
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{activeLoans.length}</span>
                <span className="text-sm text-slate-600">Préstamos activos</span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
              <DollarSign className="w-5 h-5 text-blue-600" />
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">S/ {totalActiveAmount.toFixed(2)}</span>
                <span className="text-sm text-slate-600">Total activo</span>
              </div>
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
              <Calendar className="w-5 h-5 text-orange-600" />
              <div className="flex items-baseline gap-2">
                <span className="text-xl font-bold text-slate-900">{totalPendingInstallments}</span>
                <span className="text-sm text-slate-600">Cuotas pendientes</span>
              </div>
            </div>
          </div>

          <Card className="border-0 shadow-lg mb-6">
            <CardHeader className="border-b bg-slate-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">Préstamos Registrados</CardTitle>
                <Button
                  onClick={() => setShowLoanForm(true)}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  <Plus className="w-4 h-4 mr-2" />
                  Nuevo Préstamo
                </Button>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="flex gap-3 mb-6">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
                  <Input
                    placeholder="Buscar empleado..."
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="pl-10"
                  />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Estado" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos</SelectItem>
                    <SelectItem value="Activo">Activo</SelectItem>
                    <SelectItem value="Pagado">Pagado</SelectItem>
                    <SelectItem value="Cancelado">Cancelado</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-4">
                {filteredLoans.length === 0 ? (
                  <div className="text-center py-12">
                    <DollarSign className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                    <p className="text-slate-600">No hay préstamos registrados</p>
                  </div>
                ) : (
                  filteredLoans.map(loan => {
                    const loanInstallments = getLoanInstallments(loan.id);
                    const paidInstallments = loanInstallments.filter(i => i.status === "Aplicado").length;
                    const progress = (paidInstallments / loan.total_installments) * 100;

                    return (
                      <div 
                        key={loan.id}
                        className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-2">
                              <h4 className="font-bold text-slate-900 text-lg">
                                {getEmployeeName(loan.employee_id)}
                              </h4>
                              <Badge className={
                                loan.status === "Activo" ? "bg-green-100 text-green-700" :
                                loan.status === "Pagado" ? "bg-blue-100 text-blue-700" :
                                "bg-red-100 text-red-700"
                              }>
                                {loan.status}
                              </Badge>
                              <Badge className="bg-purple-100 text-purple-700">
                                {getLoanTypeName(loan.loan_type_id)}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-4 gap-4 text-sm">
                              <div>
                                <p className="text-slate-600">Monto Total</p>
                                <p className="font-semibold text-slate-900">S/ {loan.amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Cuota Mensual</p>
                                <p className="font-semibold text-slate-900">S/ {loan.monthly_amount.toFixed(2)}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Cuotas</p>
                                <p className="font-semibold text-slate-900">{paidInstallments} / {loan.total_installments}</p>
                              </div>
                              <div>
                                <p className="text-slate-600">Fecha Inicio</p>
                                <p className="font-semibold text-slate-900">
                                  {format(new Date(loan.start_date), "dd MMM yyyy", { locale: es })}
                                </p>
                              </div>
                            </div>
                          </div>
                          <div className="flex gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => handleEdit(loan)}
                            >
                              <Edit className="w-4 h-4" />
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => handleDelete(loan.id)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </div>
                        </div>

                        <div className="mt-3">
                          <div className="flex items-center justify-between text-xs text-slate-600 mb-1">
                            <span>Progreso de pago</span>
                            <span>{progress.toFixed(0)}%</span>
                          </div>
                          <div className="w-full bg-slate-200 rounded-full h-2">
                            <div 
                              className="bg-green-600 h-2 rounded-full transition-all"
                              style={{ width: `${progress}%` }}
                            />
                          </div>
                        </div>

                        {loan.notes && (
                          <p className="text-sm text-slate-600 mt-3 p-2 bg-slate-50 rounded">
                            {loan.notes}
                          </p>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Loan Form Modal */}
        {showLoanForm && (
          <div 
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={resetForm}
          >
            <Card 
              className="max-w-2xl w-full max-h-[90vh] overflow-y-auto"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    {editingLoan ? "Editar Préstamo" : "Nuevo Préstamo"}
                  </CardTitle>
                  <Button 
                    variant="ghost" 
                    size="icon"
                    onClick={resetForm}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Empleado *
                    </label>
                    <Select 
                      value={loanFormData.employee_id}
                      onValueChange={(value) => setLoanFormData({ ...loanFormData, employee_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar empleado" />
                      </SelectTrigger>
                      <SelectContent>
                        {allEmployees.map(emp => (
                          <SelectItem key={emp.id} value={emp.id}>
                            {emp.employee_code} - {emp.first_name} {emp.last_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Tipo de Préstamo *
                    </label>
                    <Select 
                      value={loanFormData.loan_type_id}
                      onValueChange={(value) => setLoanFormData({ ...loanFormData, loan_type_id: value })}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Seleccionar tipo" />
                      </SelectTrigger>
                      <SelectContent>
                        {loanTypes.filter(t => t.is_active).map(type => (
                          <SelectItem key={type.id} value={type.id}>
                            {type.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Monto Total *
                      </label>
                      <Input
                        type="number"
                        step="0.01"
                        placeholder="0.00"
                        value={loanFormData.amount}
                        onChange={(e) => setLoanFormData({ ...loanFormData, amount: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Número de Cuotas *
                      </label>
                      <Input
                        type="number"
                        placeholder="12"
                        value={loanFormData.total_installments}
                        onChange={(e) => setLoanFormData({ ...loanFormData, total_installments: e.target.value })}
                      />
                    </div>
                  </div>

                  {loanFormData.amount && loanFormData.total_installments && (
                    <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
                      <p className="text-sm text-blue-900">
                        <strong>Cuota mensual:</strong> S/ {(parseFloat(loanFormData.amount) / parseInt(loanFormData.total_installments)).toFixed(2)}
                      </p>
                    </div>
                  )}

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Fecha de Inicio del Descuento *
                    </label>
                    <Input
                      type="date"
                      value={loanFormData.start_date}
                      onChange={(e) => setLoanFormData({ ...loanFormData, start_date: e.target.value })}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Notas
                    </label>
                    <Textarea
                      value={loanFormData.notes}
                      onChange={(e) => setLoanFormData({ ...loanFormData, notes: e.target.value })}
                      placeholder="Información adicional del préstamo..."
                      rows={3}
                    />
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={resetForm}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                      onClick={handleSubmit}
                      disabled={createLoanMutation.isPending || updateLoanMutation.isPending}
                    >
                      {createLoanMutation.isPending || updateLoanMutation.isPending 
                        ? "Procesando..." 
                        : editingLoan ? "Actualizar" : "Registrar Préstamo"}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </PermissionGuard>
  );
}