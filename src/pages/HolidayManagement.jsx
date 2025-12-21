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
  Sun, Building, Briefcase
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
        const year = new Date(h.date).getFullYear();
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
                  <Button
                    onClick={() => setShowForm(true)}
                    className="bg-indigo-600 hover:bg-indigo-700"
                  >
                    <Plus className="w-4 h-4 mr-2" />
                    Nuevo Feriado
                  </Button>
                </div>
              </CardContent>
            </Card>
          </div>

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
                          <SelectItem value="Laboral">Laboral</SelectItem>
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
                      Es un día no laborable (obligatorio)
                    </label>
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