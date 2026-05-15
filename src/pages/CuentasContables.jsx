import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, BookOpen, X, Check } from "lucide-react";
import { toast } from "sonner";

const TIPOS = ["Activos", "Pasivos", "Patrimonio", "Ingresos", "Gastos", "Otros"];

const TIPO_COLORS = {
  Activos:    "bg-blue-100 text-blue-700",
  Pasivos:    "bg-red-100 text-red-700",
  Patrimonio: "bg-purple-100 text-purple-700",
  Ingresos:   "bg-green-100 text-green-700",
  Gastos:     "bg-amber-100 text-amber-700",
  Otros:      "bg-slate-100 text-slate-600",
};

const emptyForm = { cuenta: "", descripcion: "", tipo: "Activos", is_active: true };

export default function CuentasContables() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterTipo, setFilterTipo] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: cuentas = [], isLoading } = useQuery({
    queryKey: ["cuentas_contables"],
    queryFn: () => base44.entities.CuentaContable.list("cuenta"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.CuentaContable.create(data),
    onSuccess: () => { queryClient.invalidateQueries(["cuentas_contables"]); toast.success("Cuenta creada"); closeForm(); },
    onError: () => toast.error("Error al crear cuenta"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.CuentaContable.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(["cuentas_contables"]); toast.success("Cuenta actualizada"); closeForm(); },
    onError: () => toast.error("Error al actualizar cuenta"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.CuentaContable.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(["cuentas_contables"]); toast.success("Cuenta eliminada"); },
    onError: () => toast.error("Error al eliminar cuenta"),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (c) => { setEditing(c); setForm({ cuenta: c.cuenta, descripcion: c.descripcion, tipo: c.tipo, is_active: c.is_active ?? true }); setShowForm(true); };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = () => {
    if (!form.cuenta || !form.descripcion || !form.tipo) { toast.error("Complete todos los campos requeridos"); return; }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const handleDelete = (c) => {
    if (confirm(`¿Eliminar la cuenta ${c.cuenta} - ${c.descripcion}?`)) deleteMutation.mutate(c.id);
  };

  const filtered = cuentas.filter(c => {
    const matchSearch = !search ||
      c.cuenta?.toLowerCase().includes(search.toLowerCase()) ||
      c.descripcion?.toLowerCase().includes(search.toLowerCase());
    const matchTipo = filterTipo === "all" || c.tipo === filterTipo;
    return matchSearch && matchTipo;
  });

  // Stats por tipo
  const stats = TIPOS.map(t => ({ tipo: t, count: cuentas.filter(c => c.tipo === t).length })).filter(s => s.count > 0);

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-indigo-600" />
              Cuentas Contables
            </h1>
            <p className="text-slate-500 mt-1">Plan de Cuentas General Empresarial (PCGE)</p>
          </div>
          <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700">
            <Plus className="w-4 h-4 mr-2" /> Nueva Cuenta
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-3 text-center">
              <p className="text-2xl font-bold text-slate-900">{cuentas.length}</p>
              <p className="text-xs text-slate-500">Total cuentas</p>
            </CardContent>
          </Card>
          {stats.map(s => (
            <Card key={s.tipo} className="border-slate-200 shadow-sm">
              <CardContent className="p-3 text-center">
                <p className="text-2xl font-bold text-slate-900">{s.count}</p>
                <p className={`text-xs font-medium px-1 py-0.5 rounded ${TIPO_COLORS[s.tipo]}`}>{s.tipo}</p>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filtros */}
        <Card className="border-slate-200 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por código o descripción..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterTipo} onValueChange={setFilterTipo}>
                <SelectTrigger className="w-44">
                  <SelectValue placeholder="Todos los tipos" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los tipos</SelectItem>
                  {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/50 py-3 px-6">
            <CardTitle className="text-base font-semibold text-slate-700">
              {filtered.length} cuenta{filtered.length !== 1 ? "s" : ""} encontrada{filtered.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">Cargando cuentas...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No se encontraron cuentas</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Código</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Descripción</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Tipo</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Estado</th>
                      <th className="text-right px-6 py-3 font-semibold text-slate-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(c => (
                      <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-mono font-semibold text-slate-800">{c.cuenta}</td>
                        <td className="px-6 py-3 text-slate-700">{c.descripcion}</td>
                        <td className="px-6 py-3">
                          <Badge className={`${TIPO_COLORS[c.tipo]} border-0 text-xs`}>{c.tipo}</Badge>
                        </td>
                        <td className="px-6 py-3">
                          {c.is_active !== false
                            ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><Check className="w-3 h-3" />Activa</span>
                            : <span className="text-slate-400 text-xs">Inactiva</span>}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(c)}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Modal Form */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4" onClick={closeForm}>
          <Card className="w-full max-w-lg" onClick={e => e.stopPropagation()}>
            <CardHeader className="border-b py-4 px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">{editing ? "Editar Cuenta" : "Nueva Cuenta Contable"}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeForm}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Código de Cuenta *</label>
                <Input
                  placeholder="Ej: 2011100"
                  value={form.cuenta}
                  onChange={e => setForm({ ...form, cuenta: e.target.value })}
                  className="font-mono"
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción *</label>
                <Input
                  placeholder="Ej: Mercaderías Costo"
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                />
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Tipo *</label>
                <Select value={form.tipo} onValueChange={v => setForm({ ...form, tipo: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TIPOS.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_active" checked={form.is_active} onChange={e => setForm({ ...form, is_active: e.target.checked })} className="w-4 h-4 rounded" />
                <label htmlFor="is_active" className="text-sm text-slate-700">Cuenta activa</label>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={closeForm}>Cancelar</Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? "Actualizar" : "Crear Cuenta"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}