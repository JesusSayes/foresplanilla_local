import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  DollarSign, Plus, Edit, Trash2, CheckCircle, XCircle, 
  AlertCircle, Search, Calendar, Users, Check, ChevronsUpDown
} from "lucide-react";
import { toast } from "sonner";
import { Toaster } from "@/components/ui/sonner";
import { format, addMonths } from "date-fns";
import { es } from "date-fns/locale";
import PermissionGuard from "../components/PermissionGuard";
import LoanInstallmentsEditor from "@/components/loans/LoanInstallmentsEditor";
import { MAX_LOAN_INSTALLMENTS } from "@/lib/loanPayroll";

// Genera cuotas iguales a partir del monto total y el número de cuotas.
// Distribuye el residuo de centavos para que la suma coincida exactamente con el total.
const buildEvenInstallments = (amount, count) => {
  const total = parseFloat(amount);
  const n = parseInt(count);
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(n) || n <= 0) return [];
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / n);
  const remainder = cents - base * n;
  return Array.from({ length: n }, (_, i) =>
    ((base + (i < remainder ? 1 : 0)) / 100).toFixed(2)
  );
};

export default function LoanManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showLoanForm, setShowLoanForm] = useState(false);
  const [editingLoan, setEditingLoan] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [openEmployeeCombobox, setOpenEmployeeCombobox] = useState(false);
  const [installmentAmounts, setInstallmentAmounts] = useState([]);
  const [formError, setFormError] = useState("");
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

      // Crear las cuotas mensuales con el monto definido (editable) de cada cuota
      const installmentsToCreate = [];
      for (let i = 0; i < parseInt(data.total_installments); i++) {
        const installmentDate = addMonths(startDate, i);
        installmentsToCreate.push({
          loan_id: loan.id,
          month: installmentDate.getMonth() + 1,
          year: installmentDate.getFullYear(),
          amount: data.installment_amounts?.[i] ?? monthlyAmount,
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
      setInstallmentAmounts([]);
      setFormError("");
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
      const monthlyAmount = parseFloat(data.amount) / parseInt(data.total_installments);
      const startDate = new Date(data.start_date);
      const endDate = addMonths(startDate, parseInt(data.total_installments) - 1);

      const loanData = {
        ...data,
        amount: parseFloat(data.amount),
        total_installments: parseInt(data.total_installments),
        monthly_amount: monthlyAmount,
        end_date: format(endDate, "yyyy-MM-dd"),
      };

      // Actualizar préstamo
      const loan = await base44.entities.Loan.update(id, loanData);

      // Eliminar cuotas pendientes antiguas
      const existingInstallments = installments.filter(i => i.loan_id === id && i.status === "Pendiente");
      await Promise.all(existingInstallments.map(i => base44.entities.LoanInstallment.delete(i.id)));

      // Crear nuevas cuotas pendientes con el monto definido (editable) de cada cuota
      const installmentsToCreate = [];
      for (let i = 0; i < parseInt(data.total_installments); i++) {
        const installmentDate = addMonths(startDate, i);
        installmentsToCreate.push({
          loan_id: loan.id,
          month: installmentDate.getMonth() + 1,
          year: installmentDate.getFullYear(),
          amount: data.installment_amounts?.[i] ?? monthlyAmount,
          status: "Pendiente",
        });
      }

      await base44.entities.LoanInstallment.bulkCreate(installmentsToCreate);

      return loan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["loans"]);
      queryClient.invalidateQueries(["loanInstallments"]);
      toast.success("Préstamo actualizado correctamente");
      // Cerrar modal inmediatamente
      setShowLoanForm(false);
      setEditingLoan(null);
      setInstallmentAmounts([]);
      setFormError("");
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

  const handleAmountChange = (value) => {
    setFormError("");
    setLoanFormData({ ...loanFormData, amount: value });
    setInstallmentAmounts(buildEvenInstallments(value, loanFormData.total_installments));
  };

  const handleInstallmentsCountChange = (value) => {
    setFormError("");
    // Tope máximo de cuotas: 12 meses. El excedente se recorta automáticamente.
    const digits = String(value).replace(/\D/g, "");
    const capped = digits === "" ? "" : String(Math.min(MAX_LOAN_INSTALLMENTS, parseInt(digits, 10)));
    setLoanFormData({ ...loanFormData, total_installments: capped });
    setInstallmentAmounts(buildEvenInstallments(loanFormData.amount, capped));
  };

  const handleInstallmentAmountChange = (index, value) => {
    setFormError("");
    setInstallmentAmounts(prev => prev.map((v, i) => (i === index ? value : v)));
  };

  // Monto total del préstamo y suma (no editable) de las cuotas definidas
  const totalLoanAmount = parseFloat(loanFormData.amount) || 0;
  const installmentsSum = installmentAmounts.reduce((s, v) => s + (parseFloat(v) || 0), 0);
  const installmentsMatchTotal = Math.abs(installmentsSum - totalLoanAmount) < 0.005;

  const handleSubmit = () => {
    setFormError("");

    // Validaciones específicas con mensajes orientativos (alerta dentro del modal)
    if (!loanFormData.employee_id) {
      return setFormError("Debes seleccionar un empleado.");
    }

    if (!loanFormData.loan_type_id) {
      return setFormError("Debes seleccionar el tipo de préstamo (Personal, Escolar o Vacaciones).");
    }

    if (!loanFormData.amount) {
      return setFormError("Debes ingresar el monto total del préstamo.");
    }

    if (parseFloat(loanFormData.amount) <= 0) {
      return setFormError("El monto del préstamo debe ser mayor a 0.");
    }

    if (!loanFormData.total_installments) {
      return setFormError("Debes ingresar el número de cuotas mensuales.");
    }

    if (parseInt(loanFormData.total_installments) <= 0) {
      return setFormError("El número de cuotas debe ser mayor a 0.");
    }

    if (parseInt(loanFormData.total_installments) > MAX_LOAN_INSTALLMENTS) {
      return setFormError(`El número de cuotas no puede superar ${MAX_LOAN_INSTALLMENTS} (plazo máximo de 12 meses).`);
    }

    if (!loanFormData.start_date) {
      return setFormError("Debes seleccionar la fecha de inicio del descuento.");
    }

    if (installmentAmounts.length !== parseInt(loanFormData.total_installments)) {
      return setFormError("No se pudieron generar las cuotas. Verifica el monto total y el número de cuotas.");
    }

    if (installmentAmounts.some(v => !(parseFloat(v) > 0))) {
      return setFormError("Cada cuota debe tener un monto mayor a 0.");
    }

    if (!installmentsMatchTotal) {
      return setFormError(
        `La suma de las cuotas (S/ ${installmentsSum.toFixed(2)}) no coincide con el monto total del préstamo (S/ ${totalLoanAmount.toFixed(2)}). Diferencia: S/ ${Math.abs(installmentsSum - totalLoanAmount).toFixed(2)}.`
      );
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
        return setFormError(`${empName} ya tiene un préstamo ${typeName} activo. Debe estar pagado o cancelado antes de registrar uno nuevo.`);
      }
    }

    const payload = {
      ...loanFormData,
      installment_amounts: installmentAmounts.map(v => parseFloat(v)),
    };

    if (editingLoan) {
      updateLoanMutation.mutate({ id: editingLoan.id, data: payload });
    } else {
      createLoanMutation.mutate(payload);
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
    // Precargar las cuotas existentes (pendientes) del préstamo; si no coinciden
    // con el número de cuotas, se vuelven a generar en partes iguales.
    const pendingInstallments = installments
      .filter(i => i.loan_id === loan.id && i.status === "Pendiente")
      .sort((a, b) => (a.year - b.year) || (a.month - b.month));
    setInstallmentAmounts(
      pendingInstallments.length === parseInt(loan.total_installments)
        ? pendingInstallments.map(i => (i.amount ?? 0).toFixed(2))
        : buildEvenInstallments(loan.amount, loan.total_installments)
    );
    setFormError("");
    setShowLoanForm(true);
  };

  const handleDelete = (loan) => {
    // Un préstamo con cuotas ya descontadas en planilla no se puede eliminar.
    const paidInstallments = installments.filter(i => i.loan_id === loan.id && i.status === "Aplicado");
    if (paidInstallments.length > 0) {
      toast.error(`No se puede eliminar: el préstamo ya tiene ${paidInstallments.length} cuota(s) pagada(s) en planilla.`);
      return;
    }
    if (confirm("¿Estás seguro de eliminar este préstamo?")) {
      deleteLoanMutation.mutate(loan.id);
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
    setInstallmentAmounts([]);
    setFormError("");
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
      <Toaster />
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
                  onClick={() => { setFormError(""); setShowLoanForm(true); }}
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
                              onClick={() => handleDelete(loan)}
                              disabled={paidInstallments > 0}
                              title={paidInstallments > 0
                                ? "No se puede eliminar: el préstamo ya tiene cuotas pagadas en planilla"
                                : "Eliminar préstamo"}
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

                        {paidInstallments > 0 && (
                          <p className="text-xs text-red-600 mt-3 flex items-center gap-1.5">
                            <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                            Con {paidInstallments} cuota(s) pagada(s): este préstamo ya no se puede eliminar.
                          </p>
                        )}

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
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-40 p-6"
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
                {formError && (
                  <div className="mb-5 flex items-center justify-center gap-2 bg-red-50 border border-red-300 rounded-lg px-4 py-3">
                    <AlertCircle className="w-5 h-5 text-red-600 shrink-0" />
                    <p className="text-sm font-medium text-red-700 text-center">{formError}</p>
                  </div>
                )}
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Empleado *
                    </label>
                    <Popover open={openEmployeeCombobox} onOpenChange={setOpenEmployeeCombobox}>
                      <PopoverTrigger asChild>
                        <Button
                          variant="outline"
                          role="combobox"
                          aria-expanded={openEmployeeCombobox}
                          className="w-full justify-between"
                        >
                          {loanFormData.employee_id ? 
                            (() => {
                              const emp = allEmployees.find(e => e.id === loanFormData.employee_id);
                              return emp ? `${emp.employee_code} - ${emp.first_name} ${emp.last_name}` : "Seleccionar empleado";
                            })()
                            : "Seleccionar empleado"}
                          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
                        </Button>
                      </PopoverTrigger>
                      <PopoverContent className="w-full p-0" align="start">
                        <Command>
                          <CommandInput placeholder="Buscar empleado..." />
                          <CommandList>
                            <CommandEmpty>No se encontraron empleados.</CommandEmpty>
                            <CommandGroup>
                              {allEmployees.map((emp) => (
                                <CommandItem
                                  key={emp.id}
                                  value={`${emp.employee_code} ${emp.first_name} ${emp.last_name}`}
                                  onSelect={() => {
                                    setFormError("");
                                    setLoanFormData({ ...loanFormData, employee_id: emp.id });
                                    setOpenEmployeeCombobox(false);
                                  }}
                                >
                                  <Check
                                    className={cn(
                                      "mr-2 h-4 w-4",
                                      loanFormData.employee_id === emp.id ? "opacity-100" : "opacity-0"
                                    )}
                                  />
                                  {emp.employee_code} - {emp.first_name} {emp.last_name}
                                </CommandItem>
                              ))}
                            </CommandGroup>
                          </CommandList>
                        </Command>
                      </PopoverContent>
                    </Popover>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Tipo de Préstamo *
                    </label>
                    <Select 
                      value={loanFormData.loan_type_id}
                      onValueChange={(value) => { setFormError(""); setLoanFormData({ ...loanFormData, loan_type_id: value }); }}
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
                        onChange={(e) => handleAmountChange(e.target.value)}
                      />
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Número de Cuotas *
                      </label>
                      <Input
                        type="number"
                        min="1"
                        max={MAX_LOAN_INSTALLMENTS}
                        placeholder="12"
                        value={loanFormData.total_installments}
                        onChange={(e) => handleInstallmentsCountChange(e.target.value)}
                      />
                      <p className="text-xs text-slate-500 mt-1">Máximo {MAX_LOAN_INSTALLMENTS} cuotas (12 meses)</p>
                    </div>
                  </div>

                  <LoanInstallmentsEditor
                    amounts={installmentAmounts}
                    startDate={loanFormData.start_date}
                    totalAmount={totalLoanAmount}
                    onChange={handleInstallmentAmountChange}
                  />

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Fecha de Inicio del Descuento *
                    </label>
                    <Input
                      type="date"
                      value={loanFormData.start_date}
                      onChange={(e) => { setFormError(""); setLoanFormData({ ...loanFormData, start_date: e.target.value }); }}
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