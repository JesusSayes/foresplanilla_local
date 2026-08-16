import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Button } from "@/components/ui/button";
import { Plus, Trash2, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function ConfiguracionContableTable({ empresaCodigo, tipoMapeo, cuentas, subdiarios }) {
  const queryClient = useQueryClient();
  const [newRow, setNewRow] = useState({
    clave: "",
    descripcion: "",
    cuenta: "",
    debe_haber: "D",
    subdiario: "",
    orden: 0,
  });

  const { data: configs = [], isLoading } = useQuery({
    queryKey: ["configuracionContable", empresaCodigo, tipoMapeo],
    queryFn: () =>
      base44.entities.ConfiguracionContable.filter(
        { empresa_codigo: empresaCodigo, tipo_mapeo: tipoMapeo },
        "orden"
      ),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.ConfiguracionContable.update(id, data),
    onSuccess: () => queryClient.invalidateQueries(["configuracionContable"]),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.ConfiguracionContable.create(data),
    onSuccess: () => queryClient.invalidateQueries(["configuracionContable"]),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.ConfiguracionContable.delete(id),
    onSuccess: () => queryClient.invalidateQueries(["configuracionContable"]),
  });

  const handleAdd = async () => {
    if (!newRow.clave || !newRow.cuenta) {
      toast.error("Clave y cuenta son obligatorios");
      return;
    }
    try {
      await createMutation.mutateAsync({
        ...newRow,
        empresa_codigo: empresaCodigo,
        tipo_mapeo: tipoMapeo,
        activo: true,
      });
      setNewRow({ clave: "", descripcion: "", cuenta: "", debe_haber: "D", subdiario: "", orden: 0 });
      toast.success("Mapeo creado");
    } catch {
      toast.error("Error al crear el mapeo");
    }
  };

  const handleDelete = async (config) => {
    if (!confirm(`¿Eliminar el mapeo "${config.descripcion || config.clave}"?`)) return;
    try {
      await deleteMutation.mutateAsync(config.id);
      toast.success("Mapeo eliminado");
    } catch {
      toast.error("Error al eliminar");
    }
  };

  const cuentaValida = (codigo) => !codigo || (cuentas || []).some((c) => c.cuenta === codigo);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin text-indigo-600" />
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="border-b bg-slate-50">
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Clave</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Descripción</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Cuenta</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">D/H</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Subdiario</th>
            <th className="px-2 py-2 text-left text-xs font-semibold text-slate-600">Orden</th>
            <th className="px-2 py-2 text-center text-xs font-semibold text-slate-600">Activo</th>
            <th className="px-2 py-2"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {configs.map((c) => (
            <EditableRow
              key={c.id}
              config={c}
              cuentaValida={cuentaValida}
              cuentas={cuentas}
              subdiarios={subdiarios}
              updateMutation={updateMutation}
              onDelete={() => handleDelete(c)}
            />
          ))}
          {/* New row */}
          <tr className="bg-amber-50/50">
            <td className="px-2 py-1.5">
              <Input
                value={newRow.clave}
                onChange={(e) => setNewRow({ ...newRow, clave: e.target.value })}
                placeholder="Nueva clave"
                className="h-8 text-xs"
              />
            </td>
            <td className="px-2 py-1.5">
              <Input
                value={newRow.descripcion}
                onChange={(e) => setNewRow({ ...newRow, descripcion: e.target.value })}
                placeholder="Descripción"
                className="h-8 text-xs"
              />
            </td>
            <td className="px-2 py-1.5">
              <Input
                value={newRow.cuenta}
                onChange={(e) => setNewRow({ ...newRow, cuenta: e.target.value })}
                placeholder="Cuenta PCGE"
                className="h-8 text-xs font-mono"
              />
            </td>
            <td className="px-2 py-1.5">
              <Select
                value={newRow.debe_haber}
                onValueChange={(v) => setNewRow({ ...newRow, debe_haber: v })}
              >
                <SelectTrigger className="h-8 w-16 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="D">Debe</SelectItem>
                  <SelectItem value="H">Haber</SelectItem>
                </SelectContent>
              </Select>
            </td>
            <td className="px-2 py-1.5">
              <Input
                value={newRow.subdiario}
                onChange={(e) => setNewRow({ ...newRow, subdiario: e.target.value })}
                placeholder="08"
                className="h-8 text-xs w-16"
              />
            </td>
            <td className="px-2 py-1.5">
              <Input
                type="number"
                value={newRow.orden}
                onChange={(e) => setNewRow({ ...newRow, orden: parseInt(e.target.value) || 0 })}
                className="h-8 text-xs w-14"
              />
            </td>
            <td className="px-2 py-1.5"></td>
            <td className="px-2 py-1.5">
              <Button size="sm" variant="outline" className="h-7 px-2 text-xs" onClick={handleAdd}>
                <Plus className="w-3.5 h-3.5 mr-1" />Agregar
              </Button>
            </td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

function EditableRow({ config, cuentaValida, cuentas, subdiarios, updateMutation, onDelete }) {
  const [local, setLocal] = useState(config);

  useEffect(() => {
    setLocal(config);
  }, [config]);

  const handleBlur = (field, value) => {
    if (value !== config[field]) {
      updateMutation.mutate({ id: config.id, data: { [field]: value } });
    }
  };

  const cuentaInfo = (cuentas || []).find((ct) => ct.cuenta === local.cuenta);
  const isValid = cuentaValida(local.cuenta);

  return (
    <tr className="hover:bg-slate-50">
      <td className="px-2 py-1.5">
        <Input
          value={local.clave || ""}
          onChange={(e) => setLocal({ ...local, clave: e.target.value })}
          onBlur={(e) => handleBlur("clave", e.target.value)}
          className="h-8 text-xs"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          value={local.descripcion || ""}
          onChange={(e) => setLocal({ ...local, descripcion: e.target.value })}
          onBlur={(e) => handleBlur("descripcion", e.target.value)}
          className="h-8 text-xs"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          value={local.cuenta || ""}
          onChange={(e) => setLocal({ ...local, cuenta: e.target.value })}
          onBlur={(e) => handleBlur("cuenta", e.target.value)}
          className={`h-8 text-xs font-mono ${!isValid ? "border-red-400" : ""}`}
        />
        {cuentaInfo && (
          <p className="text-xs text-slate-400 truncate max-w-[160px]" title={cuentaInfo.descripcion}>
            {cuentaInfo.descripcion}
          </p>
        )}
        {!isValid && <p className="text-xs text-red-500">No encontrada</p>}
      </td>
      <td className="px-2 py-1.5">
        <Select
          value={local.debe_haber}
          onValueChange={(v) => {
            setLocal({ ...local, debe_haber: v });
            handleBlur("debe_haber", v);
          }}
        >
          <SelectTrigger className="h-8 w-16 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="D">Debe</SelectItem>
            <SelectItem value="H">Haber</SelectItem>
          </SelectContent>
        </Select>
      </td>
      <td className="px-2 py-1.5">
        <Input
          value={local.subdiario || ""}
          onChange={(e) => setLocal({ ...local, subdiario: e.target.value })}
          onBlur={(e) => handleBlur("subdiario", e.target.value)}
          className="h-8 text-xs w-16"
        />
      </td>
      <td className="px-2 py-1.5">
        <Input
          type="number"
          value={local.orden || 0}
          onChange={(e) => setLocal({ ...local, orden: parseInt(e.target.value) || 0 })}
          onBlur={(e) => handleBlur("orden", parseInt(e.target.value) || 0)}
          className="h-8 text-xs w-14"
        />
      </td>
      <td className="px-2 py-1.5 text-center">
        <Switch
          checked={local.activo !== false}
          onCheckedChange={(v) => {
            setLocal({ ...local, activo: v });
            handleBlur("activo", v);
          }}
        />
      </td>
      <td className="px-2 py-1.5">
        <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-red-500 hover:bg-red-50" onClick={onDelete}>
          <Trash2 className="w-3.5 h-3.5" />
        </Button>
      </td>
    </tr>
  );
}