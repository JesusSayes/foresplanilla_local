import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from "@/api/entitiesClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Fingerprint, Plus, Trash2, Edit2, CheckCircle,
  AlertCircle, Activity, Users, Server, KeyRound
} from "lucide-react";
import { toast } from "sonner";
import DeviceEventMonitor from "../components/attendance/DeviceEventMonitor";
import { updateEmployeeStatuses } from "../components/employees/EmployeeStatusUpdater";

export default function AccessDeviceConfig() {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [showDeviceForm, setShowDeviceForm] = useState(false);
  const [showMappingForm, setShowMappingForm] = useState(false);
  const [editingDevice, setEditingDevice] = useState(null);
  const [editingMapping, setEditingMapping] = useState(null);
  const [selectedDevice, setSelectedDevice] = useState(null);

  const [deviceFormData, setDeviceFormData] = useState({
    device_name: "",
    device_type: "Lector de Huella",
    device_id: "",
    location: "",
    ip_address: "",
    mac_address: "",
    api_endpoint: "",
    api_key: "",
    event_types: ["Ambos"],
    is_active: true,
    configuration: {}
  });

  const [mappingFormData, setMappingFormData] = useState({
    employee_id: "",
    identifier_type: "Badge",
    identifier_value: "",
    device_id: "",
    is_active: true,
    valid_from: "",
    valid_until: "",
    notes: ""
  });

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

  const { data: devices = [] } = useQuery({
    queryKey: ["accessDevices"],
    queryFn: async () => {
      return await entitiesAPI.AccessDevice.list("-created_date");
    },
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ["employeeMappings"],
    queryFn: async () => {
      return await entitiesAPI.EmployeeAccessMapping.list("-created_date");
    },
  });

  const { data: allEmployees = [] } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const createDeviceMutation = useMutation({
    mutationFn: async (data) => {
      if (editingDevice) {
        return await entitiesAPI.AccessDevice.update(editingDevice.id, data);
      }
      return await entitiesAPI.AccessDevice.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["accessDevices"]);
      toast.success(editingDevice ? "Dispositivo actualizado" : "Dispositivo creado correctamente");
      resetDeviceForm();
    },
    onError: () => {
      toast.error("Error al guardar el dispositivo");
    },
  });

  const deleteDeviceMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.AccessDevice.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["accessDevices"]);
      toast.success("Dispositivo eliminado");
    },
  });

  const createMappingMutation = useMutation({
    mutationFn: async (data) => {
      if (editingMapping) {
        return await entitiesAPI.EmployeeAccessMapping.update(editingMapping.id, data);
      }
      return await entitiesAPI.EmployeeAccessMapping.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["employeeMappings"]);
      toast.success(editingMapping ? "Mapeo actualizado" : "Mapeo creado correctamente");
      resetMappingForm();
    },
    onError: () => {
      toast.error("Error al guardar el mapeo");
    },
  });

  const deleteMappingMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.EmployeeAccessMapping.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["employeeMappings"]);
      toast.success("Mapeo eliminado");
    },
  });

  const handleEditDevice = (device) => {
    setEditingDevice(device);
    setDeviceFormData({
      device_name: device.device_name,
      device_type: device.device_type,
      device_id: device.device_id,
      location: device.location || "",
      ip_address: device.ip_address || "",
      mac_address: device.mac_address || "",
      api_endpoint: device.api_endpoint || "",
      api_key: device.api_key || "",
      event_types: device.event_types || ["Ambos"],
      is_active: device.is_active,
      configuration: device.configuration || {}
    });
    setShowDeviceForm(true);
  };

  const handleEditMapping = (mapping) => {
    setEditingMapping(mapping);
    setMappingFormData({
      employee_id: mapping.employee_id,
      identifier_type: mapping.identifier_type,
      identifier_value: mapping.identifier_value,
      device_id: mapping.device_id || "",
      is_active: mapping.is_active,
      valid_from: mapping.valid_from || "",
      valid_until: mapping.valid_until || "",
      notes: mapping.notes || ""
    });
    setShowMappingForm(true);
  };

  const handleSubmitDevice = () => {
    if (!deviceFormData.device_name || !deviceFormData.device_id) {
      toast.error("Complete los campos obligatorios");
      return;
    }
    createDeviceMutation.mutate(deviceFormData);
  };

  const handleSubmitMapping = () => {
    if (!mappingFormData.employee_id || !mappingFormData.identifier_value) {
      toast.error("Complete los campos obligatorios");
      return;
    }
    createMappingMutation.mutate(mappingFormData);
  };

  const resetDeviceForm = () => {
    setDeviceFormData({
      device_name: "",
      device_type: "Lector de Huella",
      device_id: "",
      location: "",
      ip_address: "",
      mac_address: "",
      api_endpoint: "",
      api_key: "",
      event_types: ["Ambos"],
      is_active: true,
      configuration: {}
    });
    setEditingDevice(null);
    setShowDeviceForm(false);
  };

  const resetMappingForm = () => {
    setMappingFormData({
      employee_id: "",
      identifier_type: "Badge",
      identifier_value: "",
      device_id: "",
      is_active: true,
      valid_from: "",
      valid_until: "",
      notes: ""
    });
    setEditingMapping(null);
    setShowMappingForm(false);
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden configurar dispositivos</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const stats = {
    devices: devices.length,
    activeDevices: devices.filter(d => d.is_active).length,
    mappings: mappings.length,
    activeMappings: mappings.filter(m => m.is_active).length
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Control de Acceso Físico
          </h1>
          <p className="text-slate-600 text-lg">
            Integración con dispositivos de marcación de asistencia
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-8">
          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-indigo-100 rounded-xl">
                  <Server className="w-6 h-6 text-indigo-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.devices}</div>
              <p className="text-slate-600 text-sm">Dispositivos Totales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-green-100 rounded-xl">
                  <CheckCircle className="w-6 h-6 text-green-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.activeDevices}</div>
              <p className="text-slate-600 text-sm">Dispositivos Activos</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-blue-100 rounded-xl">
                  <Users className="w-6 h-6 text-blue-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.mappings}</div>
              <p className="text-slate-600 text-sm">Mapeos Totales</p>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg">
            <CardContent className="p-6">
              <div className="flex items-start justify-between mb-3">
                <div className="p-3 bg-purple-100 rounded-xl">
                  <KeyRound className="w-6 h-6 text-purple-600" />
                </div>
              </div>
              <div className="text-2xl font-bold text-slate-900 mb-1">{stats.activeMappings}</div>
              <p className="text-slate-600 text-sm">Mapeos Activos</p>
            </CardContent>
          </Card>
        </div>

        <Tabs defaultValue="devices" className="space-y-6">
          <TabsList className="grid w-full max-w-xl grid-cols-3">
            <TabsTrigger value="devices">Dispositivos</TabsTrigger>
            <TabsTrigger value="mappings">Mapeos</TabsTrigger>
            <TabsTrigger value="events">Eventos en Vivo</TabsTrigger>
          </TabsList>

          {/* Devices Tab */}
          <TabsContent value="devices" className="space-y-6">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowDeviceForm(true)} className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Dispositivo
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {devices.map(device => (
                <Card key={device.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                  <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-indigo-600 rounded-lg">
                          <Fingerprint className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <CardTitle className="text-lg">{device.device_name}</CardTitle>
                          <p className="text-xs text-slate-600 mt-1">{device.device_type}</p>
                        </div>
                      </div>
                      <Badge className={device.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                        {device.is_active ? "Activo" : "Inactivo"}
                      </Badge>
                    </div>
                  </CardHeader>
                  <CardContent className="p-6">
                    <div className="space-y-2 text-sm">
                      <p><strong>ID:</strong> {device.device_id}</p>
                      {device.location && <p><strong>Ubicación:</strong> {device.location}</p>}
                      {device.ip_address && <p><strong>IP:</strong> {device.ip_address}</p>}
                      {device.event_types && (
                        <p><strong>Eventos:</strong> {device.event_types.join(", ")}</p>
                      )}
                    </div>
                    <div className="flex gap-2 mt-4 pt-4 border-t">
                      <Button size="sm" variant="outline" onClick={() => handleEditDevice(device)}>
                        <Edit2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        className="text-red-600"
                        onClick={() => {
                          if (confirm("¿Eliminar este dispositivo?")) {
                            deleteDeviceMutation.mutate(device.id);
                          }
                        }}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        className="ml-auto bg-indigo-600 hover:bg-indigo-700"
                        onClick={() => setSelectedDevice(device.id)}
                      >
                        <Activity className="w-4 h-4 mr-1" />
                        Ver Eventos
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          </TabsContent>

          {/* Mappings Tab */}
          <TabsContent value="mappings" className="space-y-6">
            <div className="flex justify-end mb-4">
              <Button onClick={() => setShowMappingForm(true)} className="bg-blue-600 hover:bg-blue-700">
                <Plus className="w-5 h-5 mr-2" />
                Nuevo Mapeo
              </Button>
            </div>

            <Card className="border-0 shadow-lg">
              <CardContent className="p-6">
                <div className="space-y-3">
                  {mappings.map(mapping => {
                    const emp = allEmployees.find(e => e.id === mapping.employee_id);
                    return (
                      <div key={mapping.id} className="p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 flex-1">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-white font-bold">
                              {emp ? `${emp.first_name[0]}${emp.last_name[0]}` : "?"}
                            </div>
                            <div className="flex-1">
                              <h4 className="font-bold text-slate-900">
                                {emp ? `${emp.first_name} ${emp.last_name}` : "Empleado no encontrado"}
                              </h4>
                              <p className="text-sm text-slate-600">
                                {emp?.employee_code} • {emp?.position}
                              </p>
                            </div>
                            <div className="text-sm">
                              <Badge className="bg-purple-100 text-purple-700">
                                {mapping.identifier_type}
                              </Badge>
                              <p className="text-slate-600 mt-1 font-mono">{mapping.identifier_value}</p>
                            </div>
                            <Badge className={mapping.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                              {mapping.is_active ? "Activo" : "Inactivo"}
                            </Badge>
                            <div className="flex gap-2">
                              <Button size="sm" variant="outline" onClick={() => handleEditMapping(mapping)}>
                                <Edit2 className="w-4 h-4" />
                              </Button>
                              <Button
                                size="sm"
                                variant="outline"
                                className="text-red-600"
                                onClick={() => {
                                  if (confirm("¿Eliminar este mapeo?")) {
                                    deleteMappingMutation.mutate(mapping.id);
                                  }
                                }}
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
              </CardContent>
            </Card>
          </TabsContent>

          {/* Events Tab */}
          <TabsContent value="events" className="space-y-6">
            {selectedDevice ? (
              <DeviceEventMonitor deviceId={selectedDevice} />
            ) : (
              <Card className="border-0 shadow-lg">
                <CardContent className="p-12 text-center">
                  <Activity className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                  <h3 className="text-xl font-bold text-slate-900 mb-2">
                    Selecciona un Dispositivo
                  </h3>
                  <p className="text-slate-600">
                    Ve a la pestaña de dispositivos y haz clic en "Ver Eventos"
                  </p>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Device Form Modal */}
      {showDeviceForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto" onClick={resetDeviceForm}>
          <Card className="max-w-2xl w-full my-8" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>{editingDevice ? "Editar Dispositivo" : "Nuevo Dispositivo"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetDeviceForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Nombre del Dispositivo *</Label>
                  <Input
                    value={deviceFormData.device_name}
                    onChange={(e) => setDeviceFormData({...deviceFormData, device_name: e.target.value})}
                    placeholder="Torniquete Entrada Principal"
                  />
                </div>
                <div>
                  <Label>Tipo de Dispositivo *</Label>
                  <Select value={deviceFormData.device_type} onValueChange={(v) => setDeviceFormData({...deviceFormData, device_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Torniquete">Torniquete</SelectItem>
                      <SelectItem value="Lector de Huella">Lector de Huella</SelectItem>
                      <SelectItem value="Lector de Tarjeta">Lector de Tarjeta</SelectItem>
                      <SelectItem value="Reconocimiento Facial">Reconocimiento Facial</SelectItem>
                      <SelectItem value="Lector QR">Lector QR</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>ID del Dispositivo *</Label>
                  <Input
                    value={deviceFormData.device_id}
                    onChange={(e) => setDeviceFormData({...deviceFormData, device_id: e.target.value})}
                    placeholder="DEV001"
                  />
                </div>
                <div>
                  <Label>Ubicación</Label>
                  <Input
                    value={deviceFormData.location}
                    onChange={(e) => setDeviceFormData({...deviceFormData, location: e.target.value})}
                    placeholder="Entrada principal"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Dirección IP</Label>
                  <Input
                    value={deviceFormData.ip_address}
                    onChange={(e) => setDeviceFormData({...deviceFormData, ip_address: e.target.value})}
                    placeholder="192.168.1.100"
                  />
                </div>
                <div>
                  <Label>MAC Address</Label>
                  <Input
                    value={deviceFormData.mac_address}
                    onChange={(e) => setDeviceFormData({...deviceFormData, mac_address: e.target.value})}
                    placeholder="00:1B:44:11:3A:B7"
                  />
                </div>
              </div>

              <div>
                <Label>Endpoint API</Label>
                <Input
                  value={deviceFormData.api_endpoint}
                  onChange={(e) => setDeviceFormData({...deviceFormData, api_endpoint: e.target.value})}
                  placeholder="http://192.168.1.100:8080/api/events"
                />
              </div>

              <div>
                <Label>API Key</Label>
                <Input
                  type="password"
                  value={deviceFormData.api_key}
                  onChange={(e) => setDeviceFormData({...deviceFormData, api_key: e.target.value})}
                  placeholder="••••••••••••"
                />
              </div>

              <div>
                <Label>Tipos de Eventos</Label>
                <Select value={deviceFormData.event_types[0]} onValueChange={(v) => setDeviceFormData({...deviceFormData, event_types: [v]})}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Entrada">Solo Entrada</SelectItem>
                    <SelectItem value="Salida">Solo Salida</SelectItem>
                    <SelectItem value="Ambos">Ambos</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={deviceFormData.is_active}
                  onChange={(e) => setDeviceFormData({...deviceFormData, is_active: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
                <Label>Dispositivo Activo</Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={resetDeviceForm}>Cancelar</Button>
                <Button onClick={handleSubmitDevice} className="flex-1 bg-indigo-600 hover:bg-indigo-700">
                  {createDeviceMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Mapping Form Modal */}
      {showMappingForm && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6" onClick={resetMappingForm}>
          <Card className="max-w-2xl w-full" onClick={(e) => e.stopPropagation()}>
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle>{editingMapping ? "Editar Mapeo" : "Nuevo Mapeo"}</CardTitle>
                <Button variant="ghost" size="icon" onClick={resetMappingForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-4">
              <div>
                <Label>Empleado *</Label>
                <Select value={mappingFormData.employee_id} onValueChange={(v) => setMappingFormData({...mappingFormData, employee_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Seleccionar empleado" /></SelectTrigger>
                  <SelectContent>
                    {allEmployees.map(emp => (
                      <SelectItem key={emp.id} value={emp.id}>
                        {emp.first_name} {emp.last_name} - {emp.employee_code}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Tipo de Identificador *</Label>
                  <Select value={mappingFormData.identifier_type} onValueChange={(v) => setMappingFormData({...mappingFormData, identifier_type: v})}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Badge">Badge</SelectItem>
                      <SelectItem value="Huella Digital">Huella Digital</SelectItem>
                      <SelectItem value="Tarjeta RFID">Tarjeta RFID</SelectItem>
                      <SelectItem value="Facial">Facial</SelectItem>
                      <SelectItem value="QR Code">QR Code</SelectItem>
                      <SelectItem value="PIN">PIN</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Valor del Identificador *</Label>
                  <Input
                    value={mappingFormData.identifier_value}
                    onChange={(e) => setMappingFormData({...mappingFormData, identifier_value: e.target.value})}
                    placeholder="12345 o BADGE001"
                  />
                </div>
              </div>

              <div>
                <Label>Dispositivo (Opcional)</Label>
                <Select value={mappingFormData.device_id} onValueChange={(v) => setMappingFormData({...mappingFormData, device_id: v})}>
                  <SelectTrigger><SelectValue placeholder="Todos los dispositivos" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value={null}>Todos los dispositivos</SelectItem>
                    {devices.map(dev => (
                      <SelectItem key={dev.id} value={dev.id}>{dev.device_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>Válido Desde</Label>
                  <Input
                    type="date"
                    value={mappingFormData.valid_from}
                    onChange={(e) => setMappingFormData({...mappingFormData, valid_from: e.target.value})}
                  />
                </div>
                <div>
                  <Label>Válido Hasta</Label>
                  <Input
                    type="date"
                    value={mappingFormData.valid_until}
                    onChange={(e) => setMappingFormData({...mappingFormData, valid_until: e.target.value})}
                  />
                </div>
              </div>

              <div>
                <Label>Notas</Label>
                <Textarea
                  value={mappingFormData.notes}
                  onChange={(e) => setMappingFormData({...mappingFormData, notes: e.target.value})}
                  rows={2}
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={mappingFormData.is_active}
                  onChange={(e) => setMappingFormData({...mappingFormData, is_active: e.target.checked})}
                  className="w-4 h-4 rounded"
                />
                <Label>Mapeo Activo</Label>
              </div>

              <div className="flex gap-3 pt-4">
                <Button variant="outline" onClick={resetMappingForm}>Cancelar</Button>
                <Button onClick={handleSubmitMapping} className="flex-1 bg-blue-600 hover:bg-blue-700">
                  {createMappingMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
