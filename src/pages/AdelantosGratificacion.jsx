import { authAPI } from "@/api/localClient";
import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, CheckCircle, DollarSign, RotateCcw, AlertCircle, Edit2 } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/payrollUtils";
import AdelantoForm from "@/components/adelantos/AdelantoForm";

export default function AdelantosGratificacion() {
  const [currentUser, setCurrentUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingAdelanto, setEditingAdelanto] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState("all");

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadUser = async () => {
      try {
        const user = await authAPI.me();
        setCurrentUser(user);
      } catch (e) { console.error(e); }
    };
    loadUser();
  }, []);

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["supplementEmployees", "AdelantosGratificacion"],
    queryFn: async () => await entitiesAPI.Employee.accessible(["payroll.view_all", "payroll.create", "payroll.calculate"]),
  });

  const { data: adelantos = [] } = useQuery({
    queryKey: ["adelantosGratificacion"],
    queryFn: async () => await entitiesAPI.AdelantoGratificacion.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.AdelantoGratificacion.create({
        ...data,
        remaining_balance: Number(data.amount),
        applied_amount: 0,
        status: "Pendiente",
        created_by: currentUser?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto registrado");
      setShowForm(false);
      setEditingAdelanto(null);
    },
    onError: () => toast.error("Error al registrar adelanto"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => await entitiesAPI.AdelantoGratificacion.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto actualizado");
      setShowForm(false);
      setEditingAdelanto(null);
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const approveMutation = useMutation({
    mutationFn: async (id) => await entitiesAPI.AdelantoGratificacion.update(id, {
      status: "Aprobado",
      approved_by: currentUser?.email,
      approved_date: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto aprobado");
    },
    onError: () => toast.error("Error al aprobar"),
  });

  const applyMutation = useMutation({
    mutationFn: async (adelanto) => {
      return await entitiesAPI.AdelantoGratificacion.update(adelanto.id, {
        status: "Aplicado",
        applied_amount: adelanto.amount,
        remaining_balance: 0,
        applied_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto marcado como aplicado; verifique la gratificación manualmente");
    },
    onError: () => toast.error("Error al aplicar"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (adelanto) => {
      return await entitiesAPI.AdelantoGratificacion.update(adelanto.id, {
        status: "Pagado",
        payment_date: new Date().toISOString().split("T")[0],
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto marcado como pagado");
    },
    onError: () => toast.error("Error al marcar como pagado"),
  });

  const revertMutation = useMutation({
    mutationFn: async (adelanto) => {
      return await entitiesAPI.AdelantoGratificacion.update(adelanto.id, {
        status: "Revertido",
        reverted_by: currentUser?.email,
        reverted_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["adelantosGratificacion"] });
      toast.success("Adelanto revertido");
    },
    onError: () => toast.error("Error al revertir"),
  });

  const getEmployeeName = (id) => {
    const emp = allEmployees.find((e) => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "N/A";
  };

  const filteredAdelantos = adelantos.filter((a) => {
    if (statusFilter !== "all" && a.status !== statusFilter) return false;
    if (periodFilter !== "all" && a.gratification_period !== periodFilter) return false;
    if (searchTerm) {
      const name = getEmployeeName(a.employee_id).toLowerCase();
      if (!name.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  const stats = {
    total: adelantos.length,
    pendientes: adelantos.filter((a) => a.status === "Pendiente").length,
    aprobados: adelantos.filter((a) => a.status === "Aprobado").length,
    aplicados: adelantos.filter((a) => a.status === "Aplicado").length,
    montoTotal: adelantos.filter((a) => a.status !== "Revertido").reduce((s, a) => s + (a.amount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Adelantos de Gratificación</h1>
            <p className="text-slate-600 text-sm">Registro y control de adelantos sobre gratificaciones de Julio y Diciembre</p>
          </div>
          <Button onClick={() => { setEditingAdelanto(null); setShowForm(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Adelanto
          </Button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <DollarSign className="w-5 h-5 text-indigo-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.total}</span><span className="text-sm text-slate-600 ml-2">Total</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.pendientes}</span><span className="text-sm text-slate-600 ml-2">Pendientes</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.aplicados}</span><span className="text-sm text-slate-600 ml-2">Aplicados</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <div><span className="text-xl font-bold text-slate-900">{formatMoney(stats.montoTotal)}</span><span className="text-sm text-slate-600 ml-2">Monto Total</span></div>
          </div>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg font-bold">Adelantos Registrados</CardTitle>
              <div className="flex gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Aprobado">Aprobado</SelectItem>
                    <SelectItem value="Aplicado">Aplicado</SelectItem>
                    <SelectItem value="Pagado">Pagado</SelectItem>
                    <SelectItem value="Revertido">Revertido</SelectItem>
                  </SelectContent>
                </Select>
                <Select value={periodFilter} onValueChange={setPeriodFilter}>
                  <SelectTrigger className="w-36 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los períodos</SelectItem>
                    <SelectItem value="Julio">Julio</SelectItem>
                    <SelectItem value="Diciembre">Diciembre</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 border-b">
                  <tr>
                    <th className="text-left p-3 text-xs font-semibold text-slate-600">Empleado</th>
                    <th className="text-right p-3 text-xs font-semibold text-slate-600">Monto</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Fecha</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Gratif. Destino</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Descuento</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Saldo</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Estado</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAdelantos.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      No hay adelantos registrados
                    </td></tr>
                  ) : (
                    filteredAdelantos.map((a) => (
                      <tr key={a.id} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">{getEmployeeName(a.employee_id)}</td>
                        <td className="p-3 text-right font-mono font-semibold">{formatMoney(a.amount)}</td>
                        <td className="p-3 text-center text-xs">{a.advance_date?.split("T")[0]}</td>
                        <td className="p-3 text-center">{a.gratification_period} {a.gratification_year}</td>
                        <td className="p-3 text-center">
                          {a.apply_to_gratification
                            ? <Badge className="bg-blue-100 text-blue-700">Sí</Badge>
                            : <Badge variant="outline">No (control)</Badge>}
                        </td>
                        <td className="p-3 text-right font-mono">{formatMoney(a.remaining_balance)}</td>
                        <td className="p-3 text-center">
                          <Badge className={
                            a.status === "Aplicado" ? "bg-green-100 text-green-700" :
                            a.status === "Aprobado" ? "bg-blue-100 text-blue-700" :
                            a.status === "Pagado" ? "bg-teal-100 text-teal-700" :
                            a.status === "Revertido" ? "bg-red-100 text-red-700" :
                            "bg-amber-100 text-amber-700"
                          }>{a.status}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center">
                            {a.status === "Pendiente" && (
                              <>
                                <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50" onClick={() => approveMutation.mutate(a.id)}>
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingAdelanto(a); setShowForm(true); }}>
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {a.status === "Aprobado" && a.apply_to_gratification && (
                              <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50" onClick={() => applyMutation.mutate(a)} title="Registrar aplicación manual a gratificación">
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
                            {a.status === "Aprobado" && !a.apply_to_gratification && (
                              <Button size="sm" variant="ghost" className="text-teal-600 hover:bg-teal-50" onClick={() => markPaidMutation.mutate(a)} title="Marcar como pagado">
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
                            {(a.status === "Aprobado" || a.status === "Aplicado" || a.status === "Pagado") && (
                              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => {
                                if (confirm("¿Revertir este adelanto?")) revertMutation.mutate(a);
                              }}>
                                <RotateCcw className="w-4 h-4" />
                              </Button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      </div>

      {showForm && (
        <AdelantoForm
          initialData={editingAdelanto}
          employees={allEmployees}
          onSave={(data) => {
            if (editingAdelanto) {
              updateMutation.mutate({ id: editingAdelanto.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          onCancel={() => { setShowForm(false); setEditingAdelanto(null); }}
        />
      )}
    </div>
  );
}