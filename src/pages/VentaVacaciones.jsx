import { authAPI } from "@/api/localClient";
import React, { useState, useEffect } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, CheckCircle, XCircle, DollarSign, RotateCcw, AlertCircle, Edit2, Calendar } from "lucide-react";
import { toast } from "sonner";
import { formatMoney } from "@/lib/payrollUtils";
import VentaForm from "@/components/venta/VentaForm";

export default function VentaVacaciones() {
  const [currentUser, setCurrentUser] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingVenta, setEditingVenta] = useState(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

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
    queryKey: ["supplementEmployees", "VentaVacaciones"],
    queryFn: async () => await entitiesAPI.Employee.accessible(["payroll.view_all", "vacations.view_all", "vacations.manage"]),
  });

  const { data: ventas = [] } = useQuery({
    queryKey: ["ventasVacaciones"],
    queryFn: async () => await entitiesAPI.VentaVacaciones.list("-created_date"),
  });

  const createMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.VentaVacaciones.create({
        ...data,
        status: "Pendiente",
        created_by: currentUser?.email,
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta de vacaciones registrada");
      setShowForm(false);
      setEditingVenta(null);
    },
    onError: () => toast.error("Error al registrar venta"),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }) => await entitiesAPI.VentaVacaciones.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta actualizada");
      setShowForm(false);
      setEditingVenta(null);
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const approveMutation = useMutation({
    mutationFn: async (id) => await entitiesAPI.VentaVacaciones.update(id, {
      status: "Aprobada",
      approved_by: currentUser?.email,
      approved_date: new Date().toISOString(),
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta aprobada");
    },
    onError: () => toast.error("Error al aprobar"),
  });

  const rejectMutation = useMutation({
    mutationFn: async ({ venta, reason }) => await entitiesAPI.VentaVacaciones.update(venta.id, {
      status: "Rechazada",
      rejected_by: currentUser?.email,
      rejected_date: new Date().toISOString(),
      rejection_reason: reason || "Sin motivo",
    }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta rechazada");
    },
    onError: () => toast.error("Error al rechazar"),
  });

  const applyMutation = useMutation({
    mutationFn: async (venta) => {
      return await entitiesAPI.VentaVacaciones.update(venta.id, {
        status: "Aplicada",
        applied_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta marcada como aplicada; verifique la planilla manualmente");
    },
    onError: () => toast.error("Error al aplicar"),
  });

  const markPaidMutation = useMutation({
    mutationFn: async (venta) => {
      return await entitiesAPI.VentaVacaciones.update(venta.id, {
        status: "Pagada",
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta marcada como pagada");
    },
    onError: () => toast.error("Error al marcar como pagada"),
  });

  const revertMutation = useMutation({
    mutationFn: async (venta) => {
      return await entitiesAPI.VentaVacaciones.update(venta.id, {
        status: "Revertida",
        reverted_by: currentUser?.email,
        reverted_date: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["ventasVacaciones"] });
      toast.success("Venta revertida");
    },
    onError: () => toast.error("Error al revertir"),
  });

  const getEmployeeName = (id) => {
    const emp = allEmployees.find((e) => e.id === id);
    return emp ? `${emp.first_name} ${emp.last_name}` : "N/A";
  };

  const filteredVentas = ventas.filter((v) => {
    if (statusFilter !== "all" && v.status !== statusFilter) return false;
    if (searchTerm) {
      const name = getEmployeeName(v.employee_id).toLowerCase();
      if (!name.includes(searchTerm.toLowerCase())) return false;
    }
    return true;
  });

  const stats = {
    total: ventas.length,
    pendientes: ventas.filter((v) => v.status === "Pendiente").length,
    aprobadas: ventas.filter((v) => v.status === "Aprobada").length,
    aplicadas: ventas.filter((v) => v.status === "Aplicada").length,
    montoTotal: ventas.filter((v) => v.status === "Aplicada" || v.status === "Pagada").reduce((s, v) => s + (v.amount || 0), 0),
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-4 sm:py-8">
        <div className="mb-6 flex flex-col sm:flex-row justify-between items-start gap-4">
          <div>
            <h1 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-2">Venta de Vacaciones</h1>
            <p className="text-slate-600 text-sm">Registro manual de venta de días de vacaciones, con aprobación y trazabilidad</p>
          </div>
          <Button onClick={() => { setEditingVenta(null); setShowForm(true); }} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Nueva Venta
          </Button>
        </div>

        {/* Stats */}
        <div className="flex flex-wrap gap-4 mb-6">
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <Calendar className="w-5 h-5 text-indigo-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.total}</span><span className="text-sm text-slate-600 ml-2">Total</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <AlertCircle className="w-5 h-5 text-amber-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.pendientes}</span><span className="text-sm text-slate-600 ml-2">Pendientes</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <CheckCircle className="w-5 h-5 text-green-600" />
            <div><span className="text-xl font-bold text-slate-900">{stats.aplicadas}</span><span className="text-sm text-slate-600 ml-2">Aplicadas</span></div>
          </div>
          <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
            <DollarSign className="w-5 h-5 text-blue-600" />
            <div><span className="text-xl font-bold text-slate-900">{formatMoney(stats.montoTotal)}</span><span className="text-sm text-slate-600 ml-2">Monto Aplicado</span></div>
          </div>
        </div>

        <Card className="border-0 shadow-lg">
          <CardHeader className="border-b">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <CardTitle className="text-lg font-bold">Ventas Registradas</CardTitle>
              <div className="flex gap-2">
                <div className="relative w-56">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                  <Input placeholder="Buscar empleado..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="pl-9 h-9" />
                </div>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todos los estados</SelectItem>
                    <SelectItem value="Pendiente">Pendiente</SelectItem>
                    <SelectItem value="Aprobada">Aprobada</SelectItem>
                    <SelectItem value="Aplicada">Aplicada</SelectItem>
                    <SelectItem value="Pagada">Pagada</SelectItem>
                    <SelectItem value="Rechazada">Rechazada</SelectItem>
                    <SelectItem value="Revertida">Revertida</SelectItem>
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
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Días</th>
                    <th className="text-right p-3 text-xs font-semibold text-slate-600">Importe</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Fecha</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Período Origen</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Pago en</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Estado</th>
                    <th className="text-center p-3 text-xs font-semibold text-slate-600">Acciones</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredVentas.length === 0 ? (
                    <tr><td colSpan={8} className="text-center py-12 text-slate-500">
                      <AlertCircle className="w-10 h-10 text-slate-300 mx-auto mb-2" />
                      No hay ventas registradas
                    </td></tr>
                  ) : (
                    filteredVentas.map((v) => (
                      <tr key={v.id} className="border-t hover:bg-slate-50">
                        <td className="p-3 font-medium">{getEmployeeName(v.employee_id)}</td>
                        <td className="p-3 text-center font-mono">{v.days_sold}</td>
                        <td className="p-3 text-right font-mono font-semibold">{formatMoney(v.amount)}</td>
                        <td className="p-3 text-center text-xs">{v.sale_date?.split("T")[0]}</td>
                        <td className="p-3 text-center text-xs">{v.vacation_period_origin}</td>
                        <td className="p-3 text-center text-xs">{v.payment_period_month}/{v.payment_period_year}</td>
                        <td className="p-3 text-center">
                          <Badge className={
                            v.status === "Aplicada" ? "bg-green-100 text-green-700" :
                            v.status === "Aprobada" ? "bg-blue-100 text-blue-700" :
                            v.status === "Pagada" ? "bg-teal-100 text-teal-700" :
                            v.status === "Rechazada" ? "bg-red-100 text-red-700" :
                            v.status === "Revertida" ? "bg-slate-200 text-slate-700" :
                            "bg-amber-100 text-amber-700"
                          }>{v.status}</Badge>
                        </td>
                        <td className="p-3">
                          <div className="flex gap-1 justify-center">
                            {v.status === "Pendiente" && (
                              <>
                                <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50" onClick={() => approveMutation.mutate(v.id)} title="Aprobar">
                                  <CheckCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => {
                                  const reason = prompt("Motivo del rechazo:");
                                  if (reason !== null) rejectMutation.mutate({ venta: v, reason });
                                }} title="Rechazar">
                                  <XCircle className="w-4 h-4" />
                                </Button>
                                <Button size="sm" variant="ghost" onClick={() => { setEditingVenta(v); setShowForm(true); }} title="Editar">
                                  <Edit2 className="w-4 h-4" />
                                </Button>
                              </>
                            )}
                            {v.status === "Aprobada" && (
                              <Button size="sm" variant="ghost" className="text-green-600 hover:bg-green-50" onClick={() => applyMutation.mutate(v)} title="Registrar aplicación manual a planilla">
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
                            {v.status === "Aplicada" && (
                              <Button size="sm" variant="ghost" className="text-teal-600 hover:bg-teal-50" onClick={() => markPaidMutation.mutate(v)} title="Marcar como pagada">
                                <DollarSign className="w-4 h-4" />
                              </Button>
                            )}
                            {(v.status === "Aprobada" || v.status === "Aplicada" || v.status === "Pagada") && (
                              <Button size="sm" variant="ghost" className="text-red-600 hover:bg-red-50" onClick={() => {
                                if (confirm("¿Revertir esta venta?")) revertMutation.mutate(v);
                              }} title="Revertir">
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
        <VentaForm
          initialData={editingVenta}
          employees={allEmployees}
          onSave={(data) => {
            if (editingVenta) {
              updateMutation.mutate({ id: editingVenta.id, data });
            } else {
              createMutation.mutate(data);
            }
          }}
          onCancel={() => { setShowForm(false); setEditingVenta(null); }}
        />
      )}
    </div>
  );
}