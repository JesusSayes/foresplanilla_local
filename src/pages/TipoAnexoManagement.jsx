import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, Search, Edit, Trash2, Tag, X, Check } from "lucide-react";
import { toast } from "sonner";

const emptyForm = {
  codigo_tipo_anexo: "",
  descripcion: "",
  estado: "A",
};

export default function TipoAnexoManagement() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [filterEstado, setFilterEstado] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);

  const { data: tiposAnexo = [], isLoading } = useQuery({
    queryKey: ["tipos_anexo"],
    queryFn: () => base44.entities.TipoAnexo.list("codigo_tipo_anexo"),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.TipoAnexo.create(data),
    onSuccess: () => { queryClient.invalidateQueries(["tipos_anexo"]); toast.success("Tipo de anexo creado"); closeForm(); },
    onError: () => toast.error("Error al crear tipo de anexo"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.TipoAnexo.update(id, data),
    onSuccess: () => { queryClient.invalidateQueries(["tipos_anexo"]); toast.success("Tipo de anexo actualizado"); closeForm(); },
    onError: () => toast.error("Error al actualizar tipo de anexo"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.TipoAnexo.delete(id),
    onSuccess: () => { queryClient.invalidateQueries(["tipos_anexo"]); toast.success("Tipo de anexo eliminado"); },
    onError: () => toast.error("Error al eliminar tipo de anexo"),
  });

  const openCreate = () => { setEditing(null); setForm(emptyForm); setShowForm(true); };
  const openEdit = (t) => {
    setEditing(t);
    setForm({
      codigo_tipo_anexo: t.codigo_tipo_anexo,
      descripcion: t.descripcion,
      estado: t.estado || "A",
    });
    setShowForm(true);
  };
  const closeForm = () => { setShowForm(false); setEditing(null); setForm(emptyForm); };

  const handleSubmit = () => {
    if (!form.codigo_tipo_anexo.trim() || !form.descripcion.trim()) {
      toast.error("Código y descripción son obligatorios");
      return;
    }
    if (editing) updateMutation.mutate({ id: editing.id, data: form });
    else createMutation.mutate(form);
  };

  const handleDelete = (t) => {
    if (confirm(`¿Eliminar el tipo de anexo ${t.codigo_tipo_anexo} - ${t.descripcion}?`)) deleteMutation.mutate(t.id);
  };

  const filtered = tiposAnexo.filter(t => {
    const matchSearch = !search ||
      t.codigo_tipo_anexo?.toLowerCase().includes(search.toLowerCase()) ||
      t.descripcion?.toLowerCase().includes(search.toLowerCase());
    const matchEstado = filterEstado === "all" || t.estado === filterEstado;
    return matchSearch && matchEstado;
  });

  const activos = tiposAnexo.filter(t => t.estado !== "I").length;
  const inactivos = tiposAnexo.filter(t => t.estado === "I").length;

  // Colores por código de tipo (P, C, T, O)
  const codigoColor = (codigo) => {
    const map = { P: "bg-blue-100 text-blue-700", C: "bg-green-100 text-green-700", T: "bg-purple-100 text-purple-700", O: "bg-amber-100 text-amber-700" };
    return map[codigo?.toUpperCase()] || "bg-slate-100 text-slate-600";
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-8">
          <div>
            <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-3">
              <Tag className="w-8 h-8 text-indigo-600" />
              Tipos de Anexo
            </h1>
            <p className="text-slate-500 mt-1">Clasificación de anexos para asientos contables (P=Proveedor, C=Cliente, T=Trabajador, O=Otros)</p>
          </div>
          <Button onClick={openCreate} className="bg-indigo-600 hover:bg-indigo-700 shrink-0">
            <Plus className="w-4 h-4 mr-2" /> Nuevo Tipo Anexo
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-4 text-center">
              <p className="text-2xl font-bold text-slate-900">{tiposAnexo.length}</p>
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
                  placeholder="Buscar por código o descripción..."
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
              {filtered.length} tipo{filtered.length !== 1 ? "s" : ""} de anexo encontrado{filtered.length !== 1 ? "s" : ""}
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-12 text-center text-slate-400">Cargando tipos de anexo...</div>
            ) : filtered.length === 0 ? (
              <div className="p-12 text-center text-slate-400">No se encontraron tipos de anexo</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Código</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Descripción</th>
                      <th className="text-left px-6 py-3 font-semibold text-slate-600">Estado</th>
                      <th className="text-right px-6 py-3 font-semibold text-slate-600">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filtered.map(t => (
                      <tr key={t.id} className="hover:bg-slate-50 transition-colors">
                        <td className="px-6 py-3">
                          <span className={`inline-flex items-center px-2.5 py-0.5 rounded font-mono font-bold text-sm ${codigoColor(t.codigo_tipo_anexo)}`}>
                            {t.codigo_tipo_anexo}
                          </span>
                        </td>
                        <td className="px-6 py-3 text-slate-700">{t.descripcion}</td>
                        <td className="px-6 py-3">
                          {t.estado !== "I"
                            ? <span className="flex items-center gap-1 text-green-600 text-xs font-medium"><Check className="w-3 h-3" />Activo</span>
                            : <span className="text-slate-400 text-xs">Inactivo</span>}
                        </td>
                        <td className="px-6 py-3 text-right">
                          <div className="flex justify-end gap-2">
                            <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                              <Edit className="w-3 h-3" />
                            </Button>
                            <Button size="sm" variant="outline" className="text-red-600 hover:bg-red-50" onClick={() => handleDelete(t)}>
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
          <Card className="w-full max-w-md" onClick={e => e.stopPropagation()}>
            <CardHeader className="border-b py-4 px-6">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">{editing ? "Editar Tipo Anexo" : "Nuevo Tipo de Anexo"}</CardTitle>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={closeForm}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Código *</label>
                <Input
                  placeholder="Ej: P, C, T, O"
                  value={form.codigo_tipo_anexo}
                  onChange={e => setForm({ ...form, codigo_tipo_anexo: e.target.value.toUpperCase() })}
                  className="font-mono"
                  maxLength={5}
                />
                <p className="text-xs text-slate-400 mt-1">P=Proveedor · C=Cliente · T=Trabajador · O=Otros</p>
              </div>
              <div>
                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Descripción *</label>
                <Input
                  placeholder="Ej: Proveedor"
                  value={form.descripcion}
                  onChange={e => setForm({ ...form, descripcion: e.target.value })}
                />
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
                  {editing ? "Actualizar" : "Crear Tipo Anexo"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}