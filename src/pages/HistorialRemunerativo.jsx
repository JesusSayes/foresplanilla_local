import React, { useState, useRef } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Database, Plus, Upload, Search, Edit, Trash2, Save, X,
  ArrowLeft, Download, AlertCircle, CheckCircle, Loader2
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";
import { safePayrollNumber, formatMoney } from "@/lib/payrollUtils";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import * as XLSX from "xlsx";

const MONTHS = Array.from({ length: 12 }, (_, i) => ({
  value: i + 1,
  label: format(new Date(2024, i), "MMMM", { locale: es }),
}));

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

function calcTotal(form) {
  return (
    safePayrollNumber(form.base_salary) +
    safePayrollNumber(form.family_allowance) +
    safePayrollNumber(form.other_regular_income)
  );
}

const emptyForm = {
  employee_id: "",
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  base_salary: "",
  family_allowance: "",
  other_regular_income: "",
  total_remuneration: "",
  worked_days: 30,
  notes: "",
  source: "Manual",
};

export default function HistorialRemunerativo() {
  const [searchTerm, setSearchTerm] = useState("");
  const [filterEmp, setFilterEmp] = useState("all");
  const [filterYear, setFilterYear] = useState("all");
  const [showForm, setShowForm] = useState(false);
  const [editingRecord, setEditingRecord] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [importErrors, setImportErrors] = useState([]);
  const [importing, setImporting] = useState(false);
  const fileRef = useRef();
  const queryClient = useQueryClient();

  const { data: employees = [] } = useQuery({
    queryKey: ["empHistorial"],
    queryFn: () => base44.entities.Employee.list("-created_date"),
  });

  const { data: records = [], isLoading } = useQuery({
    queryKey: ["historialRemunerativo"],
    queryFn: () => base44.entities.HistorialRemunerativo.list("-year", 5000),
  });

  const createMutation = useMutation({
    mutationFn: (data) => base44.entities.HistorialRemunerativo.create(data),
    onSuccess: () => {
      queryClient.invalidateQueries(["historialRemunerativo"]);
      toast.success("Registro creado");
      resetForm();
    },
    onError: () => toast.error("Error al crear el registro"),
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }) => base44.entities.HistorialRemunerativo.update(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries(["historialRemunerativo"]);
      toast.success("Registro actualizado");
      resetForm();
    },
    onError: () => toast.error("Error al actualizar"),
  });

  const deleteMutation = useMutation({
    mutationFn: (id) => base44.entities.HistorialRemunerativo.delete(id),
    onSuccess: () => {
      queryClient.invalidateQueries(["historialRemunerativo"]);
      toast.success("Registro eliminado");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  const resetForm = () => {
    setForm(emptyForm);
    setShowForm(false);
    setEditingRecord(null);
  };

  const handleEdit = (r) => {
    setForm({
      employee_id: r.employee_id,
      year: r.year,
      month: r.month,
      base_salary: r.base_salary || "",
      family_allowance: r.family_allowance || "",
      other_regular_income: r.other_regular_income || "",
      total_remuneration: r.total_remuneration || "",
      worked_days: r.worked_days || 30,
      notes: r.notes || "",
      source: r.source || "Manual",
    });
    setEditingRecord(r);
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!form.employee_id || !form.year || !form.month) {
      toast.error("Completa empleado, año y mes");
      return;
    }
    const total = calcTotal(form);
    const payload = {
      employee_id: form.employee_id,
      year: parseInt(form.year),
      month: parseInt(form.month),
      base_salary: safePayrollNumber(form.base_salary),
      family_allowance: safePayrollNumber(form.family_allowance),
      other_regular_income: safePayrollNumber(form.other_regular_income),
      total_remuneration: total || safePayrollNumber(form.total_remuneration),
      worked_days: parseInt(form.worked_days) || 30,
      notes: form.notes,
      source: form.source || "Manual",
      period_label: format(new Date(parseInt(form.year), parseInt(form.month) - 1), "MMMM yyyy", { locale: es }),
    };
    if (editingRecord) {
      updateMutation.mutate({ id: editingRecord.id, data: payload });
    } else {
      createMutation.mutate(payload);
    }
  };

  // ── Carga masiva desde Excel/CSV ──────────────────────────────────────────
  const downloadTemplate = () => {
    const data = [
      {
        "DNI": "12345678",
        "Año": 2024,
        "Mes": 1,
        "Salario_Base": 2500,
        "Asig_Familiar": 102.5,
        "Otros_Ingresos": 0,
        "Dias_Trabajados": 30,
        "Notas": "Ene 2024",
      },
    ];
    const ws = XLSX.utils.json_to_sheet(data);
    ws["!cols"] = Object.keys(data[0]).map(k => ({ wch: Math.max(k.length, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Historial");
    XLSX.writeFile(wb, "Plantilla_HistorialRemunerativo.xlsx");
    toast.success("Plantilla descargada");
  };

  const handleImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true);
    setImportErrors([]);
    try {
      const ab = await file.arrayBuffer();
      const wb = XLSX.read(ab, { type: "array" });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });

      const errors = [];
      const toCreate = [];

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        const dni = String(row["DNI"] || "").trim();
        const year = parseInt(row["Año"] || row["Year"] || row["año"]);
        const month = parseInt(row["Mes"] || row["Month"] || row["mes"]);

        if (!dni) { errors.push(`Fila ${i + 2}: DNI vacío`); continue; }
        if (!year || year < 2000) { errors.push(`Fila ${i + 2}: Año inválido`); continue; }
        if (!month || month < 1 || month > 12) { errors.push(`Fila ${i + 2}: Mes inválido`); continue; }

        const emp = employees.find(e => e.document_number === dni);
        if (!emp) { errors.push(`Fila ${i + 2}: No se encontró empleado con DNI ${dni}`); continue; }

        const base_salary = safePayrollNumber(row["Salario_Base"] || row["Salario Base"] || 0);
        const family_allowance = safePayrollNumber(row["Asig_Familiar"] || row["Asignacion Familiar"] || 0);
        const other_regular_income = safePayrollNumber(row["Otros_Ingresos"] || row["Otros Ingresos"] || 0);
        const total_remuneration = base_salary + family_allowance + other_regular_income;
        const worked_days = parseInt(row["Dias_Trabajados"] || row["Dias Trabajados"] || 30);

        toCreate.push({
          employee_id: emp.id,
          year,
          month,
          base_salary,
          family_allowance,
          other_regular_income,
          total_remuneration,
          worked_days,
          notes: String(row["Notas"] || ""),
          source: "Importado",
          period_label: format(new Date(year, month - 1), "MMMM yyyy", { locale: es }),
        });
      }

      setImportErrors(errors);

      if (toCreate.length > 0) {
        await base44.entities.HistorialRemunerativo.bulkCreate(toCreate);
        queryClient.invalidateQueries(["historialRemunerativo"]);
        toast.success(`${toCreate.length} registros importados correctamente${errors.length > 0 ? ` (${errors.length} con errores)` : ""}`);
      } else {
        toast.error("No se importó ningún registro. Revisa los errores.");
      }
    } catch (err) {
      toast.error("Error al leer el archivo");
      console.error(err);
    } finally {
      setImporting(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // ── Filtros ───────────────────────────────────────────────────────────────
  const filteredRecords = records.filter(r => {
    const emp = employees.find(e => e.id === r.employee_id);
    const empName = emp ? `${emp.first_name} ${emp.last_name}` : "";
    const matchSearch = !searchTerm || empName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      emp?.document_number?.includes(searchTerm);
    const matchEmp = filterEmp === "all" || r.employee_id === filterEmp;
    const matchYear = filterYear === "all" || r.year === parseInt(filterYear);
    return matchSearch && matchEmp && matchYear;
  }).sort((a, b) => b.year - a.year || b.month - a.month);

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between flex-wrap gap-4">
          <div className="flex items-center gap-4">
            <Link to={createPageUrl("BeneficiosSociales")}>
              <Button variant="outline"><ArrowLeft className="w-4 h-4 mr-2" />Beneficios Sociales</Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-slate-900 flex items-center gap-2">
                <Database className="w-7 h-7 text-indigo-600" />Historial Remunerativo
              </h1>
              <p className="text-slate-500 text-sm mt-1">Registra remuneraciones de períodos anteriores al sistema para calcular beneficios sociales</p>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={downloadTemplate}>
              <Download className="w-4 h-4 mr-2" />Plantilla Excel
            </Button>
            <label className="cursor-pointer">
              <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={handleImport} />
              <Button variant="outline" className="border-green-300 text-green-700 hover:bg-green-50" asChild>
                <span>
                  {importing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Upload className="w-4 h-4 mr-2" />}
                  Carga Masiva
                </span>
              </Button>
            </label>
            <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={() => { setEditingRecord(null); setForm(emptyForm); setShowForm(true); }}>
              <Plus className="w-4 h-4 mr-2" />Nuevo Registro
            </Button>
          </div>
        </div>

        {/* Errores de importación */}
        {importErrors.length > 0 && (
          <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-xl">
            <div className="flex items-center gap-2 mb-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <p className="font-semibold text-red-800">{importErrors.length} errores en la importación:</p>
            </div>
            <ul className="space-y-0.5 max-h-32 overflow-y-auto">
              {importErrors.map((e, i) => <li key={i} className="text-xs text-red-700">• {e}</li>)}
            </ul>
          </div>
        )}

        {/* Formulario */}
        {showForm && (
          <Card className="border-0 shadow-lg mb-6 border-l-4 border-indigo-500">
            <CardHeader className="border-b bg-indigo-50/50">
              <div className="flex items-center justify-between">
                <CardTitle className="text-base font-bold">{editingRecord ? "Editar Registro" : "Nuevo Registro"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}><X className="w-4 h-4" /></Button>
              </div>
            </CardHeader>
            <CardContent className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label className="text-xs font-semibold">Empleado *</Label>
                  <Select value={form.employee_id} onValueChange={v => setForm({ ...form, employee_id: v })}>
                    <SelectTrigger><SelectValue placeholder="Seleccionar..." /></SelectTrigger>
                    <SelectContent>
                      {employees.map(e => (
                        <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name} ({e.document_number})</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Año *</Label>
                  <Select value={String(form.year)} onValueChange={v => setForm({ ...form, year: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Mes *</Label>
                  <Select value={String(form.month)} onValueChange={v => setForm({ ...form, month: parseInt(v) })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>{MONTHS.map(m => <SelectItem key={m.value} value={String(m.value)}>{m.label}</SelectItem>)}</SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs font-semibold">Días trabajados</Label>
                  <Input type="number" min={1} max={31} value={form.worked_days} onChange={e => setForm({ ...form, worked_days: e.target.value })} />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Salario Base (S/)</Label>
                  <Input type="number" step="0.01" value={form.base_salary} onChange={e => setForm({ ...form, base_salary: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Asig. Familiar (S/)</Label>
                  <Input type="number" step="0.01" value={form.family_allowance} onChange={e => setForm({ ...form, family_allowance: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Otros Ingresos Regulares (S/)</Label>
                  <Input type="number" step="0.01" value={form.other_regular_income} onChange={e => setForm({ ...form, other_regular_income: e.target.value })} placeholder="0.00" />
                </div>
                <div>
                  <Label className="text-xs font-semibold">Total Computable (auto)</Label>
                  <div className="h-9 flex items-center px-3 bg-indigo-50 border border-indigo-200 rounded-md font-bold text-indigo-700">
                    {formatMoney(calcTotal(form))}
                  </div>
                </div>
              </div>
              <div className="mt-3">
                <Label className="text-xs font-semibold">Notas</Label>
                <Input value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} placeholder="Observaciones opcionales..." />
              </div>
              <div className="flex gap-3 mt-4 justify-end">
                <Button variant="outline" onClick={resetForm}>Cancelar</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700" onClick={handleSubmit} disabled={isPending}>
                  {isPending ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : <Save className="w-4 h-4 mr-2" />}
                  {editingRecord ? "Actualizar" : "Guardar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filtros */}
        <Card className="border-0 shadow-lg mb-6">
          <CardContent className="p-4">
            <div className="flex flex-wrap gap-3 items-center">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
                <Input placeholder="Buscar empleado o DNI..." value={searchTerm} onChange={e => setSearchTerm(e.target.value)} className="pl-9" />
              </div>
              <Select value={filterEmp} onValueChange={setFilterEmp}>
                <SelectTrigger className="w-56"><SelectValue placeholder="Todos los empleados" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos los empleados</SelectItem>
                  {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.first_name} {e.last_name}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={filterYear} onValueChange={setFilterYear}>
                <SelectTrigger className="w-28"><SelectValue placeholder="Año" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  {YEARS.map(y => <SelectItem key={y} value={String(y)}>{y}</SelectItem>)}
                </SelectContent>
              </Select>
              <span className="text-sm text-slate-500 ml-auto">{filteredRecords.length} registros</span>
            </div>
          </CardContent>
        </Card>

        {/* Tabla */}
        <Card className="border-0 shadow-lg">
          <CardContent className="p-0">
            {isLoading ? (
              <div className="flex justify-center py-16"><Loader2 className="w-8 h-8 animate-spin text-indigo-600" /></div>
            ) : filteredRecords.length === 0 ? (
              <div className="py-16 text-center">
                <Database className="w-16 h-16 text-slate-200 mx-auto mb-4" />
                <p className="text-slate-500">No hay registros. Agrega manualmente o importa desde Excel.</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 border-b">
                    <tr>
                      {["Empleado", "DNI", "Período", "Sueldo Base", "Asig. Fam.", "Otros", "Total Comp.", "Días", "Fuente", ""].map(h => (
                        <th key={h} className="px-4 py-3 text-left text-xs font-semibold text-slate-600 whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredRecords.map(r => {
                      const emp = employees.find(e => e.id === r.employee_id);
                      return (
                        <tr key={r.id} className="hover:bg-indigo-50/20">
                          <td className="px-4 py-2 font-medium text-slate-900 whitespace-nowrap">
                            {emp ? `${emp.first_name} ${emp.last_name}` : "—"}
                          </td>
                          <td className="px-4 py-2 font-mono text-xs text-slate-500">{emp?.document_number || "—"}</td>
                          <td className="px-4 py-2 capitalize text-slate-700">
                            {r.period_label || format(new Date(r.year, r.month - 1), "MMMM yyyy", { locale: es })}
                          </td>
                          <td className="px-4 py-2">{formatMoney(r.base_salary || 0)}</td>
                          <td className="px-4 py-2">{formatMoney(r.family_allowance || 0)}</td>
                          <td className="px-4 py-2">{formatMoney(r.other_regular_income || 0)}</td>
                          <td className="px-4 py-2 font-bold text-indigo-700">{formatMoney(r.total_remuneration || 0)}</td>
                          <td className="px-4 py-2 text-center">{r.worked_days || 30}</td>
                          <td className="px-4 py-2">
                            <Badge className={
                              r.source === "Sistema" ? "bg-blue-100 text-blue-700" :
                              r.source === "Importado" ? "bg-green-100 text-green-700" :
                              "bg-slate-100 text-slate-700"
                            }>{r.source || "Manual"}</Badge>
                          </td>
                          <td className="px-4 py-2">
                            <div className="flex gap-1">
                              <Button size="sm" variant="outline" onClick={() => handleEdit(r)}>
                                <Edit className="w-3.5 h-3.5" />
                              </Button>
                              <Button size="sm" variant="outline" className="text-red-600 border-red-200 hover:bg-red-50"
                                onClick={() => { if (window.confirm("¿Eliminar este registro?")) deleteMutation.mutate(r.id); }}>
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Guía de importación */}
        <Card className="border-0 shadow-lg mt-6 bg-slate-50">
          <CardContent className="p-5">
            <p className="font-semibold text-slate-700 mb-2 flex items-center gap-2">
              <Upload className="w-4 h-4" />Guía de carga masiva (Excel/CSV)
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs text-slate-600">
              {[
                { col: "DNI", desc: "Número de documento del empleado (obligatorio)" },
                { col: "Año", desc: "Año del período, ej: 2024 (obligatorio)" },
                { col: "Mes", desc: "Número de mes, ej: 1=Enero (obligatorio)" },
                { col: "Salario_Base", desc: "Remuneración básica del mes" },
                { col: "Asig_Familiar", desc: "Asignación familiar del mes" },
                { col: "Otros_Ingresos", desc: "Bonificaciones fijas, movilidad, alimento, etc." },
                { col: "Dias_Trabajados", desc: "Días efectivos (máx 30). Por defecto: 30" },
                { col: "Notas", desc: "Observaciones opcionales" },
              ].map(({ col, desc }) => (
                <div key={col} className="p-2 bg-white rounded border border-slate-200">
                  <p className="font-mono font-bold text-indigo-700">{col}</p>
                  <p className="text-slate-500">{desc}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}