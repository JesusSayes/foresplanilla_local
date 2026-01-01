import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
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
import { toast } from "sonner";
import PermissionGuard from "../components/PermissionGuard";

export default function HolidayManagement() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingHoliday, setEditingHoliday] = useState(null);
  const [formData, setFormData] = useState({
    name: "",
    date: new Date(),
    type: "Nacional",
    is_mandatory: true,
    description: "",
  });
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

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

  const { data: holidays = [] } = useQuery({
    queryKey: ["holidays", selectedYear],
    queryFn: async () => {
      const allHolidays = await base44.entities.Holiday.list("-date");
      return allHolidays.filter(h => {
        const year = parseInt(h.date.split('-')[0]);
        return year === selectedYear;
      });
    },
  });

  const createHolidayMutation = useMutation({
    mutationFn: async (data) => {
      return await base44.entities.Holiday.create(data);
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
      return await base44.entities.Holiday.update(id, data);
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
      return await base44.entities.Holiday.delete(id);
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
      return await base44.entities.Holiday.bulkCreate(holidaysData);
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
      date: format(formData.date, "yyyy-MM-dd"),
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
      date: new Date(holiday.date),
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
      date: new Date(),
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

    const holidaysToLoad = peruHolidays[year];
    if (!holidaysToLoad) {
      toast.error(`No hay feriados predefinidos para el año ${year}`);
      return;
    }

    try {
      // Verificar si ya existen para no duplicar
      const existingHolidays = await base44.entities.Holiday.list();
      const existingForYear = existingHolidays.filter(h => parseInt(h.date.split('-')[0]) === year);
      
      if (existingForYear.length > 0) {
        if (!confirm(`Ya existen ${existingForYear.length} feriados del ${year}. ¿Desea reemplazarlos?`)) {
          return;
        }
        // Eliminar existentes
        for (const holiday of existingForYear) {
          await base44.entities.Holiday.delete(holiday.id);
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
    const month = format(new Date(holiday.date), "MMMM", { locale: es });
    if (!acc[month]) acc[month] = [];
    acc[month].push(holiday);
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
    <PermissionGuard employee={employee} requiredRole="admin">
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-indigo-100 rounded-xl">
                    <CalendarIcon className="w-6 h-6 text-indigo-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {holidays.length}
                </div>
                <p className="text-slate-600 text-sm">Feriados en {selectedYear}</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-start justify-between mb-3">
                  <div className="p-3 bg-blue-100 rounded-xl">
                    <Sun className="w-6 h-6 text-blue-600" />
                  </div>
                </div>
                <div className="text-2xl font-bold text-slate-900 mb-1">
                  {holidays.filter(h => h.type === "Nacional").length}
                </div>
                <p className="text-slate-600 text-sm">Feriados Nacionales</p>
              </CardContent>
            </Card>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="flex items-center justify-between h-full">
                  <div>
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
                  </div>
                  <div className="flex gap-2">
                    <Button
                      onClick={() => setShowForm(true)}
                      className="bg-indigo-600 hover:bg-indigo-700"
                    >
                      <Plus className="w-4 h-4 mr-2" />
                      Nuevo
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Import/Export Actions */}
          <Card className="border-0 shadow-lg mb-6">
            <CardContent className="p-6">
              <div className="flex flex-wrap items-center gap-3">
                <Button
                  onClick={() => loadPeruHolidays(2026)}
                  variant="outline"
                  className="bg-blue-600 text-white hover:bg-blue-700"
                  disabled={importHolidaysMutation.isPending}
                >
                  <Download className="w-4 h-4 mr-2" />
                  Cargar Feriados Perú 2026
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

                          return (
                            <div 
                              key={holiday.id}
                              className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                            >
                              <div className="flex items-start justify-between">
                                <div className="flex items-start gap-4 flex-1">
                                  <div className="p-3 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl text-white text-center min-w-16">
                                    <div className="text-2xl font-bold">
                                      {format(new Date(holiday.date), "dd")}
                                    </div>
                                    <div className="text-xs uppercase">
                                      {format(new Date(holiday.date), "MMM", { locale: es })}
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
                                        {format(new Date(holiday.date), "EEEE", { locale: es })}
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
      </div>
    </PermissionGuard>
  );
}