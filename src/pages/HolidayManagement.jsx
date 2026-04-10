import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Calendar as CalendarIcon, Plus, Edit, Trash2,
  Sun, Building, Briefcase, Download, Upload
} from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { todayDateLima, dateToStringLima, parseDateLima } from "@/lib/dateUtils";
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function HolidayManagement() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    date: todayDateLima(),
    type: "Nacional",
    is_mandatory: true,
    description: "",
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [showLoadHolidaysModal, setShowLoadHolidaysModal] = useState(false);
  const [yearToLoad, setYearToLoad] = useState(new Date().getFullYear());

  const queryClient = useQueryClient();

  useEffect(() => {
    if (currentUser?.employee?.role === "admin" || currentUser?.employee?.role === "super_admin") {
      updateEmployeeStatuses().then(result => {
        if (result.success && result.updatedCount > 0) {
          console.log(`${result.updatedCount} empleado(s) actualizado(s) a estado Cesado automáticamente`);
        }
      });
    }
  }, [currentUser]);

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays", selectedYear],
    queryFn: async () => {
      const allHolidays = await entitiesAPI.Holiday.list("-date");
      return allHolidays.filter(h => {
        const year = parseInt(h.date.split('-')[0]);
        return year === selectedYear;
      });
    },
  });

  const createHolidayMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.Holiday.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["holidays"]);
      toast.success("Feriado creado correctamente");
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al crear el feriado");
      console.error(error);
    },
  });

  const updateHolidayMutation = useMutation({
    mutationFn: async ({ id, data }) => {
      return await entitiesAPI.Holiday.update(id, data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["holidays"]);
      toast.success("Feriado actualizado correctamente");
      resetForm();
    },
    onError: (error) => {
      toast.error("Error al actualizar el feriado");
      console.error(error);
    },
  });

  const deleteHolidayMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.Holiday.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["holidays"]);
      toast.success("Feriado eliminado correctamente");
    },
    onError: (error) => {
      toast.error("Error al eliminar el feriado");
      console.error(error);
    },
  });

  const importHolidaysMutation = useMutation({
    mutationFn: async (holidaysData) => {
      return await entitiesAPI.Holiday.bulkCreate(holidaysData);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["holidays"]);
      toast.success("Feriados importados correctamente");
    },
    onError: (error) => {
      toast.error("Error al importar feriados");
      console.error(error);
    },
  });

  const handleSubmit = () => {
    if (!formData.name || !formData.date) {
      toast.error("Completa todos los campos requeridos");
      return;
    }

    const holidayData = {
      name: formData.name,
      date: dateToStringLima(formData.date),
      type: formData.type,
      is_mandatory: formData.is_mandatory,
      description: formData.description,
    };

    if (editingHoliday) {
      updateHolidayMutation.mutate({ id: editingHoliday.id, data: holidayData });
    } else {
      createHolidayMutation.mutate(holidayData);
    }
  };

  const handleEdit = (holiday) => {
    setEditingHoliday(holiday);
    setFormData({
      name: holiday.name,
      date: parseDateLima(holiday.date),
      type: holiday.type,
      is_mandatory: holiday.is_mandatory,
      description: holiday.description || "",
    });
    setShowForm(true);
  };

  const handleDelete = (id) => {
    if (confirm("¿Estás seguro de eliminar este feriado?")) {
      deleteHolidayMutation.mutate(id);
    }
  };

  const resetForm = () => {
    setFormData({
      name: "",
      date: todayDateLima(),
      type: "Nacional",
      is_mandatory: true,
      description: "",
    });
    setEditingHoliday(null);
    setShowForm(false);
  };

  const loadPeruHolidays = async (year = 2025) => {
    const peruHolidays = {
      2025: [
        { name: "Año Nuevo", date: "2025-01-01", type: "Nacional", is_mandatory: true, description: "Celebración del Año Nuevo" },
        { name: "Jueves Santo", date: "2025-04-17", type: "Nacional", is_mandatory: true, description: "Semana Santa" },
        { name: "Viernes Santo", date: "2025-04-18", type: "Nacional", is_mandatory: true, description: "Semana Santa" },
        { name: "Sábado Santo", date: "2025-04-19", type: "Nacional", is_mandatory: true, description: "Semana Santa" },
        { name: "Día del Trabajo", date: "2025-05-01", type: "Nacional", is_mandatory: true, description: "Día Internacional del Trabajo" },
        { name: "San Pedro y San Pablo", date: "2025-06-29", type: "Nacional", is_mandatory: true, description: "Feriado religioso" },
        { name: "Día de la Independencia", date: "2025-07-28", type: "Nacional", is_mandatory: true, description: "Fiestas Patrias" },
        { name: "Día de las Fuerzas Armadas", date: "2025-07-29", type: "Nacional", is_mandatory: true, description: "Fiestas Patrias" },
        { name: "Santa Rosa de Lima", date: "2025-08-30", type: "Nacional", is_mandatory: true, description: "Patrona de la Policía Nacional" },
        { name: "Combate de Angamos", date: "2025-10-08", type: "Nacional", is_mandatory: true, description: "Homenaje a Miguel Grau" },
        { name: "Todos los Santos", date: "2025-11-01", type: "Nacional", is_mandatory: true, description: "Día de Todos los Santos" },
        { name: "Inmaculada Concepción", date: "2025-12-08", type: "Nacional", is_mandatory: true, description: "Feriado religioso" },
        { name: "Navidad", date: "2025-12-25", type: "Nacional", is_mandatory: true, description: "Celebración de Navidad" },
      ],
      2026: [
        { name: "Año Nuevo", date: "2026-01-01", type: "Nacional", is_mandatory: true, description: "Celebración de Año Nuevo" },
        { name: "Jueves Santo", date: "2026-04-02", type: "Nacional", is_mandatory: true, description: "Semana Santa - Jueves Santo" },
        { name: "Viernes Santo", date: "2026-04-03", type: "Nacional", is_mandatory: true, description: "Semana Santa - Viernes Santo" },
        { name: "Día del Trabajo", date: "2026-05-01", type: "Nacional", is_mandatory: true, description: "Día Internacional del Trabajo" },
        { name: "San Pedro y San Pablo", date: "2026-06-29", type: "Nacional", is_mandatory: false, description: "Festividad de San Pedro y San Pablo (laborable)" },
        { name: "Día de la Independencia", date: "2026-07-28", type: "Nacional", is_mandatory: true, description: "Fiestas Patrias - Proclamación de la Independencia" },
        { name: "Día de las Fuerzas Armadas", date: "2026-07-29", type: "Nacional", is_mandatory: true, description: "Fiestas Patrias - Día de las Fuerzas Armadas" },
        { name: "Santa Rosa de Lima", date: "2026-08-30", type: "Nacional", is_mandatory: false, description: "Patrona de la Policía Nacional del Perú y de América (laborable)" },
        { name: "Combate de Angamos", date: "2026-10-08", type: "Nacional", is_mandatory: true, description: "Aniversario del Combate de Angamos" },
        { name: "Día de Todos los Santos", date: "2026-11-01", type: "Nacional", is_mandatory: false, description: "Día de Todos los Santos (laborable)" },
        { name: "Inmaculada Concepción", date: "2026-12-08", type: "Nacional", is_mandatory: true, description: "Día de la Inmaculada Concepción" },
        { name: "Navidad", date: "2026-12-25", type: "Nacional", is_mandatory: true, description: "Celebración del nacimiento de Jesucristo" },
      ]
    };

    // Generar feriados para años futuros basados en template
    const generateHolidaysForYear = (targetYear) => {
      if (peruHolidays[targetYear]) {
        return peruHolidays[targetYear];
      }

      // Template de feriados fijos (usar 2026 como base)
      const baseTemplate = [
        { name: "Año Nuevo", month: 1, day: 1, type: "Nacional", is_mandatory: true, description: "Celebración de Año Nuevo" },
        { name: "Día del Trabajo", month: 5, day: 1, type: "Nacional", is_mandatory: true, description: "Día Internacional del Trabajo" },
        { name: "San Pedro y San Pablo", month: 6, day: 29, type: "Nacional", is_mandatory: false, description: "Festividad de San Pedro y San Pablo (laborable)" },
        { name: "Día de la Independencia", month: 7, day: 28, type: "Nacional", is_mandatory: true, description: "Fiestas Patrias - Proclamación de la Independencia" },
        { name: "Día de las Fuerzas Armadas", month: 7, day: 29, type: "Nacional", is_mandatory: true, description: "Fiestas Patrias - Día de las Fuerzas Armadas" },
        { name: "Santa Rosa de Lima", month: 8, day: 30, type: "Nacional", is_mandatory: false, description: "Patrona de la Policía Nacional del Perú y de América (laborable)" },
        { name: "Combate de Angamos", month: 10, day: 8, type: "Nacional", is_mandatory: true, description: "Aniversario del Combate de Angamos" },
        { name: "Día de Todos los Santos", month: 11, day: 1, type: "Nacional", is_mandatory: false, description: "Día de Todos los Santos (laborable)" },
        { name: "Inmaculada Concepción", month: 12, day: 8, type: "Nacional", is_mandatory: true, description: "Día de la Inmaculada Concepción" },
        { name: "Navidad", month: 12, day: 25, type: "Nacional", is_mandatory: true, description: "Celebración del nacimiento de Jesucristo" },
      ];

      // Nota: Semana Santa es móvil, requeriría cálculo especial
      return baseTemplate.map(h => ({
        name: h.name,
        date: `${targetYear}-${String(h.month).padStart(2, '0')}-${String(h.day).padStart(2, '0')}`,
        type: h.type,
        is_mandatory: h.is_mandatory,
        description: h.description
      }));
    };

    const holidaysToLoad = generateHolidaysForYear(year);

    if (!holidaysToLoad || holidaysToLoad.length === 0) {
      toast.error(`No se pudieron generar feriados para el año ${year}`);
      return;
    }

    try {
      // Verificar si ya existen para no duplicar
      const existingHolidays = await entitiesAPI.Holiday.list();
      const existingForYear = existingHolidays.filter(h => parseInt(h.date.split('-')[0]) === year);

      if (existingForYear.length > 0) {
        if (!confirm(`Ya existen ${existingForYear.length} feriados del ${year}. ¿Desea reemplazarlos?`)) {
          return;
        }
        // Eliminar existentes
        for (const holiday of existingForYear) {
          await entitiesAPI.Holiday.delete(holiday.id);
        }
      }

      await importHolidaysMutation.mutateAsync(holidaysToLoad);
      setSelectedYear(year);
    } catch (error) {
      console.error("Error loading Peru holidays:", error);
    }
  };

  const exportHolidaysTemplate = () => {
    const headers = ['Nombre', 'Fecha (YYYY-MM-DD)', 'Tipo', 'Es Obligatorio', 'Descripción'];
    const example = [
      'Día de la Independencia', '2025-07-28', 'Nacional', 'SI', 'Fiestas Patrias',
      'Día no laborable', '2025-12-24', 'Laboral', 'SI', 'Cierre de fin de año'
    ];

    const csv = [headers, example].map(row => row.join(',')).join('\n');
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'plantilla_feriados.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
    toast.success('✓ Plantilla descargada');
  };

  const handleImportCSV = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());

      // Saltar header
      const dataLines = lines.slice(1);

      const holidaysToImport = dataLines.map(line => {
        const [name, date, type, isMandatory, description] = line.split(',').map(s => s.trim());
        return {
          name,
          date,
          type: type || "Nacional",
          is_mandatory: (isMandatory?.toLowerCase() === 'si' || isMandatory?.toLowerCase() === 'yes' || isMandatory === '1'),
          description: description || ""
        };
      }).filter(h => h.name && h.date);

      if (holidaysToImport.length === 0) {
        toast.error("No se encontraron feriados válidos en el archivo");
        return;
      }

      await importHolidaysMutation.mutateAsync(holidaysToImport);
      toast.success(`✓ ${holidaysToImport.length} feriados importados`);
    } catch (error) {
      toast.error("Error al procesar el archivo CSV");
      console.error(error);
    }

    // Limpiar input
    event.target.value = '';
  };

  const getTypeConfig = (type) => {
    const configs = {
      "Nacional": { icon: Sun, color: "bg-blue-100 text-blue-700 border-blue-200" },
      "Regional": { icon: Building, color: "bg-purple-100 text-purple-700 border-purple-200" },
      "Laboral": { icon: Briefcase, color: "bg-green-100 text-green-700 border-green-200" },
    };
    return configs[type] || configs["Nacional"];
  };

  const holidaysByMonth = holidays.reduce((acc, holiday) => {
    try {
      const dateStr = holiday.date.split('T')[0];
      const d = parseDateLima(dateStr);
      const month = format(d, "MMMM", { locale: es });
      if (!acc[month]) acc[month] = [];
      acc[month].push(holiday);
    } catch (error) {
      console.warn("Error parsing holiday date:", holiday.date, error);
    }
    return acc;
  }, {});

  if (!employee) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <Card><CardContent className="p-8"><p>Cargando...</p></CardContent></Card>
      </div>
    );
  }

  return (
    <PermissionGuard employee={employee} requiredAnyPermissions={["holidays.view", "holidays.manage", "holidays.create", "system.admin"]}>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
        <div className="max-w-7xl mx-auto px-6 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Gestión de Feriados
            </h1>
            <p className="text-slate-600 text-lg">
              Administra los días festivos y feriados del año
            </p>
          </div>

          {/* Stats and Actions */}
          <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
            <div className="flex flex-wrap gap-4">
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                <CalendarIcon className="w-5 h-5 text-indigo-600" />
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900">{holidays.length}</span>
                  <span className="text-sm text-slate-600">Feriados en {selectedYear}</span>
                </div>
              </div>
              <div className="flex items-center gap-3 px-4 py-2.5 bg-white rounded-lg border border-slate-200 shadow-sm">
                <Sun className="w-5 h-5 text-blue-600" />
                <div className="flex items-baseline gap-2">
                  <span className="text-xl font-bold text-slate-900">{holidays.filter(h => h.type === "Nacional").length}</span>
                  <span className="text-sm text-slate-600">Feriados Nacionales</span>
                </div>
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Select
                value={selectedYear.toString()}
                onValueChange={(val) => setSelectedYear(parseInt(val))}
              >
                <SelectTrigger className="w-32">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="2024">2024</SelectItem>
                  <SelectItem value="2025">2025</SelectItem>
                  <SelectItem value="2026">2026</SelectItem>
                </SelectContent>
              </Select>
              <Button
                onClick={() => setShowForm(true)}
                className="bg-indigo-600 hover:bg-indigo-700"
              >
                <Plus className="w-4 h-4 mr-2" />
                Nuevo
              </Button>
            </div>
          </div>

          {/* Import/Export Actions */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => setShowLoadHolidaysModal(true)}
                  variant="outline"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={importHolidaysMutation.isPending}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Cargar Feriados Nacionales
                </Button>

                <Button
                  onClick={exportHolidaysTemplate}
                  variant="outline"
                >
                  <Download className="w-4 h-4 mr-2" />
                  Descargar Plantilla CSV
                </Button>

                <Button
                  variant="outline"
                  onClick={() => document.getElementById('csv-upload').click()}
                  disabled={importHolidaysMutation.isPending}
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Importar desde CSV
                </Button>
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={handleImportCSV}
                />

                <div className="ml-auto text-sm text-slate-600">
                  💡 Importa múltiples feriados desde un archivo CSV
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Holidays List */}
          <Card className="border-0 shadow-lg">
            <CardHeader className="border-b bg-slate-50/50">
              <CardTitle className="text-xl font-bold">
                Feriados de {selectedYear}
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              {holidays.length === 0 ? (
                <div className="text-center py-12">
                  <CalendarIcon className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <p className="text-slate-600">No hay feriados registrados para este año</p>
                </div>
              ) : (
                <div className="space-y-8">
                  {Object.entries(holidaysByMonth).map(([month, monthHolidays]) => (
                    <div key={month}>
                      <h3 className="text-lg font-bold text-slate-900 mb-4 capitalize">
                        {month}
                      </h3>
                      <div className="space-y-3">
                        {monthHolidays.map(holiday => {
                          const typeConfig = getTypeConfig(holiday.type);
                          const TypeIcon = typeConfig.icon;
                          const dateStr = holiday.date.split('T')[0];
                          const holidayDate = parseDateLima(dateStr);

                          return (
                            <div
                              key={holiday.id}
                              className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4 flex-1">
                                  <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white text-center min-w-16">
                                    <div className="text-2xl font-bold">
                                      {format(holidayDate, "dd")}
                                    </div>
                                    <div className="text-xs uppercase">
                                      {format(holidayDate, "MMM", { locale: es })}
                                    </div>
                                  </div>

                                  <div className="flex-1">
                                    <h4 className="font-bold text-slate-900 text-lg mb-1">
                                      {holiday.name}
                                    </h4>
                                    <div className="flex items-center gap-3 mb-2">
                                      <Badge className={typeConfig.color}>
                                        <TypeIcon className="w-3 h-3 mr-1" />
                                        {holiday.type}
                                      </Badge>
                                      {holiday.is_mandatory && (
                                        <Badge className="bg-orange-100 text-orange-700">
                                          Obligatorio
                                        </Badge>
                                      )}
                                      <span className="text-sm text-slate-600">
                                        {format(holidayDate, "EEEE", { locale: es })}
                                      </span>
                                    </div>
                                    {holiday.description && (
                                      <p className="text-sm text-slate-600">
                                        {holiday.description}
                                      </p>
                                    )}
                                  </div>

                                  <div className="flex gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      onClick={() => handleEdit(holiday)}
                                    >
                                      <Edit className="w-4 h-4" />
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-red-600 hover:bg-red-50"
                                      onClick={() => handleDelete(holiday.id)}
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </Button>
                                  </div>
                                </div>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Create/Edit Modal */}
        {showForm && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={resetForm}
          >
            <Card
              className="max-w-2xl w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    {editingHoliday ? "Editar Feriado" : "Nuevo Feriado"}
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
                      Nombre del Feriado *
                    </label>
                    <Input
                      placeholder="Ej: Día de la Independencia"
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Fecha *
                      </label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button variant="outline" className="w-full justify-start">
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {format(formData.date, "dd/MM/yyyy")}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={formData.date}
                            onSelect={(date) => date && setFormData({ ...formData, date })}
                            locale={es}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>

                    <div>
                      <label className="block text-sm font-semibold text-slate-900 mb-2">
                        Tipo de Feriado *
                      </label>
                      <Select
                        value={formData.type}
                        onValueChange={(value) => setFormData({ ...formData, type: value })}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="Nacional">Nacional</SelectItem>
                          <SelectItem value="Regional">Regional</SelectItem>
                          <SelectItem value="Laboral">Laboral (día no laborable personalizado)</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </div>

                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      id="is_mandatory"
                      checked={formData.is_mandatory}
                      onChange={(e) => setFormData({ ...formData, is_mandatory: e.target.checked })}
                      className="w-4 h-4 rounded border-slate-300"
                    />
                    <label htmlFor="is_mandatory" className="text-sm text-slate-700">
                      Es un día no laborable (no se trabaja)
                    </label>
                    <p className="text-xs text-slate-500 mt-1">
                      Marcar si este día no se debe contar como día laboral en los reportes
                    </p>
                  </div>

                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Descripción
                    </label>
                    <Textarea
                      placeholder="Información adicional sobre el feriado..."
                      value={formData.description}
                      onChange={(e) => setFormData({ ...formData, description: e.target.value })}
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
                      disabled={createHolidayMutation.isPending || updateHolidayMutation.isPending}
                    >
                      {(createHolidayMutation.isPending || updateHolidayMutation.isPending)
                        ? "Guardando..."
                        : (editingHoliday ? "Actualizar" : "Crear Feriado")}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Load Holidays Modal */}
        {showLoadHolidaysModal && (
          <div
            className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6"
            onClick={() => setShowLoadHolidaysModal(false)}
          >
            <Card
              className="max-w-md w-full"
              onClick={(e) => e.stopPropagation()}
            >
              <CardHeader className="border-b">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold">
                    Cargar Feriados Nacionales
                  </CardTitle>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => setShowLoadHolidaysModal(false)}
                  >
                    ✕
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <div className="space-y-6">
                  <div>
                    <label className="block text-sm font-semibold text-slate-900 mb-2">
                      Seleccione el año
                    </label>
                    <Select
                      value={yearToLoad.toString()}
                      onValueChange={(val) => setYearToLoad(parseInt(val))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="2024">2024</SelectItem>
                        <SelectItem value="2025">2025</SelectItem>
                        <SelectItem value="2026">2026</SelectItem>
                        <SelectItem value="2027">2027</SelectItem>
                        <SelectItem value="2028">2028</SelectItem>
                        <SelectItem value="2029">2029</SelectItem>
                        <SelectItem value="2030">2030</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
                    <p className="text-sm text-blue-900">
                      Se cargarán los feriados oficiales del Perú para el año {yearToLoad}.
                      {yearToLoad > 2026 && (
                        <span className="block mt-2 text-xs text-blue-700">
                          ⚠️ Los feriados móviles como Semana Santa no se incluyen para años futuros sin fecha definida.
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="flex gap-3">
                    <Button
                      variant="outline"
                      className="flex-1"
                      onClick={() => setShowLoadHolidaysModal(false)}
                    >
                      Cancelar
                    </Button>
                    <Button
                      className="flex-1 bg-blue-600 hover:bg-blue-700"
                      onClick={() => {
                        loadPeruHolidays(yearToLoad);
                        setShowLoadHolidaysModal(false);
                      }}
                      disabled={importHolidaysMutation.isPending}
                    >
                      {importHolidaysMutation.isPending ? "Cargando..." : "Cargar Feriados"}
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
