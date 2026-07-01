import React, { useState } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, BookOpen, X, Check } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  codigo: "",
  descripcion: "",
  nombre_breve: "",
  apertura: "",
  codigo_sunat: "",
  estado: "A",
};

export default function SubdiarioManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: subdiarios = [], isLoading } = useQuery({
    queryKey: ["subdiarios"],
    queryFn: () => entitiesAPI.Subdiario.list("codigo"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => entitiesAPI.Subdiario.create(data),
    onSuccess: () => { queryClient.invalidateQueries(["subdiarios"]); toast.success("Subdiario creado"); closeForm(); },
    onError: () => toast.error("Error al crear subdiario"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => entitiesAPI.Subdiario.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(["subdiarios"]); toast.success("Subdiario actualizado"); closeForm(); },
    onError: () => toast.error("Error al actualizar subdiario"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => entitiesAPI.Subdiario.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(["subdiarios"]); toast.success("Subdiario eliminado"); },
    onError: () => toast.error("Error al eliminar subdiario"),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (s) => {
    setEditing(s);
    setForm({
      codigo: s.codigo,
      descripcion: s.descripcion,
      nombre_breve: s.nombre_breve || "",
      apertura: s.apertura || "",
      codigo_sunat: s.codigo_sunat || "",
      estado: s.estado || "A",
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = () => {
    if (!form.codigo.trim() || !form.descripcion.trim()) {
      toast.error("Código y descripción son obligatorios");
      return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const handleDelete = (s) => {
    if (confirm(`¿Eliminar el subdiario ${s.codigo} - ${s.descripcion}?`)) deleteMutation.mutate(s.id);
  };

  const filtered = subdiarios.filter(s => {
    const matchSearch = !search ||
      s.codigo?.toLowerCase().includes(search.toLowerCase()) ||
      s.descripcion?.toLowerCase().includes(search.toLowerCase()) ||
      s.nombre_breve?.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === "all" || s.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const activos = subdiarios.filter(s => s.estado !== "I").length;
  const inactivos = subdiarios.filter(s => s.estado === "I").length;

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <BookOpen className="w-8 h-8 text-indigo-600" />
              Subdiarios Contables
            </h1>
            <p className="text-slate-500 mt-1">Gestión de subdiarios para asientos contables</p>
          </div>
          <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Subdiario
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{subdiarios.length}</p>
              <p className="text-xs text-slate-500 mt-1">Total</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-green-600">{activos}</p>
              <p className="text-xs text-slate-500 mt-1">Activos</p>
            </CardContent>
          </Card>
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-400">{inactivos}</p>
              <p className="text-xs text-slate-500 mt-1">Inactivos</p>
            </CardContent>
          </Card>
        </div>

        {/* Filtros */}
        <Card className="border-slate-200 shadow-sm mb-6">
          <CardContent className="p-4">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input
                  placeholder="Buscar por código, descripción o nombre breve..."
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  className="pl-9"
                />
              </div>
              <Select value={filterEstado} onValueChange={setFilterEstado}>
                <SelectTrigger className="w-40">
                  <SelectValue placeholder="Estado" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="A">Activos</SelectItem>
                  <SelectItem value="I">Inactivos</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card className="border-slate-200 shadow-sm">
          <CardHeader className="border-b bg-slate-50/50 py-3 px-6">
            <CardTitle className="text-base font-semibold text-slate-700">
              {filtered.length} subdiario{filtered.length !== 1 ? "s" : ""} encontrado{filtered.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">Cargando subdiarios...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No se encontraron subdiarios</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Código</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Descripción</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Nombre Breve</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Cód. SUNAT</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Estado</th>
                      <th className="text-right px-6 py-3 font-semibold text-slate-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(s => (
                      <tr key={s.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3 font-mono font-semibold text-slate-800">{s.codigo}</td>
                        <td className="px-6 py-3 text-slate-700">{s.descripcion}</td>
                        <td className="px-6 py-3 text-slate-500 text-xs">{s.nombre_breve || "—"}</td>
                        <td className="px-6 py-3">
                          {s.codigo_sunat
                            ? <span className="font-mono text-xs bg-slate-100 px-2 py-0.5 rounded">{s.codigo_sunat}</span>
                            : <span className="text-slate-300">—</span>}
                        </td>
                        <td className="px-6 py-3">
                          {s.estado !== "I"
                            ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><Check className="w-3 h-3" />Activo</span>
                            : <span className="text-slate-400 text-xs">Inactivo</span>}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(s)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(s)}>
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
                <CardTitle className="text-lg font-bold">{editing ? "Editar Subdiario" : "Nuevo Subdiario"}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeForm}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Código *</label>
                  <Input
                    placeholder="Ej: 08"
                    value={form.codigo}
                    onChange={e => setForm({ ...form, codigo: e.target.value })}
                    className="font-mono"
                    maxLength={5}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Nombre Breve</label>
                  <Input
                    placeholder="Ej: PLANILLAS"
                    value={form.nombre_breve}
                    onChange={e => setForm({ ...form, nombre_breve: e.target.value })}
                    maxLength={10}
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción *</label>
                <Input
                  placeholder="Ej: Planillas de Remuneraciones"
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Apertura</label>
                  <Input
                    placeholder="Ej: A"
                    value={form.apertura}
                    onChange={e => setForm({ ...form, apertura: e.target.value })}
                    maxLength={2}
                  />
                </div>
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-1.5">Código SUNAT</label>
                  <Input
                    placeholder="Ej: 080000"
                    value={form.codigo_sunat}
                    onChange={e => setForm({ ...form, codigo_sunat: e.target.value })}
                    className="font-mono"
                  />
                </div>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Estado</label>
                <Select value={form.estado} onValueChange={v => setForm({ ...form, estado: v })}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="A">Activo</SelectItem>
                    <SelectItem value="I">Inactivo</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-3 pt-2">
                <Button variant="outline" className="flex-1" onClick={closeForm}>Cancelar</Button>
                <Button
                  className="flex-1 bg-indigo-600 hover:bg-indigo-700"
                  onClick={handleSubmit}
                  disabled={createMutation.isPending || updateMutation.isPending}
                >
                  {editing ? "Actualizar" : "Crear Subdiario"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
