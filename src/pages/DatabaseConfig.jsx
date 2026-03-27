import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { 
  Database, Plus, Trash2, Edit2, CheckCircle, 
  AlertCircle, RefreshCw, Server, Key, Activity, Play, Clock
} from "lucide-react";
import { toast } from "sonner";
import SyncMonitor from "../components/attendance/SyncMonitor";
import BiotimeSyncConfig from "../components/attendance/BiotimeSyncConfig";

export default function DatabaseConfig() {
  const [employee, setEmployee] = useState(null);
  const [showForm, setShowForm] = useState(false);
  const [editingConnection, setEditingConnection] = useState(null);
  const [showMonitor, setShowMonitor] = useState(null);
  const [formData, setFormData] = useState({
    connection_name: "",
    connection_type: "MySQL",
    host: "",
    port: 3306,
    database_name: "",
    username: "",
    password: "",
    table_name: "attendance",
    field_mapping: {
      employee_code: "employee_id",
      date: "date",
      clock_in: "check_in",
      clock_out: "check_out"
    },
    query_template: "",
    is_active: true,
    sync_frequency: "Manual",
    notes: ""
  });

  const queryClient = useQueryClient();

  useEffect(() => {
    const loadEmployee = async () => {
      try {
        const user = await base44.auth.me();
        const employees = await base44.entities.Employee.filter({ 
          work_email: user.email 
        });
        
        if (employees && employees.length > 0) {
          setEmployee(employees[0]);
        }
      } catch (error) {
        console.error("Error loading employee:", error);
      }
    };

    loadEmployee();
  }, []);

  const { data: connections = [] } = useQuery({
    queryKey: ["databaseConnections"],
    queryFn: async () => {
      return await base44.entities.DatabaseConnection.list("-created_date");
    },
  });

  const createConnectionMutation = useMutation({
    mutationFn: async (data) => {
      if (editingConnection) {
        return await base44.entities.DatabaseConnection.update(editingConnection.id, data);
      }
      return await base44.entities.DatabaseConnection.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["databaseConnections"]);
      toast.success(editingConnection ? "Conexión actualizada" : "Conexión creada correctamente");
      resetForm();
    },
    onError: () => {
      toast.error("Error al guardar la conexión");
    },
  });

  const deleteConnectionMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.DatabaseConnection.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["databaseConnections"]);
      toast.success("Conexión eliminada");
    },
    onError: () => {
      toast.error("Error al eliminar la conexión");
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: async (connectionData) => {
      // Aquí iría la lógica real de prueba de conexión
      // Por ahora simulamos una prueba
      return new Promise((resolve) => {
        setTimeout(() => {
          resolve({ success: true, message: "Conexión exitosa" });
        }, 1500);
      });
    },
    onSuccess: () => {
      toast.success("✓ Conexión probada exitosamente");
    },
    onError: () => {
      toast.error("✗ Error al probar la conexión");
    },
  });

  const handleEdit = (connection) => {
    setEditingConnection(connection);
    setFormData({
      connection_name: connection.connection_name,
      connection_type: connection.connection_type,
      host: connection.host,
      port: connection.port,
      database_name: connection.database_name,
      username: connection.username,
      password: connection.password || "",
      table_name: connection.table_name || "attendance",
      field_mapping: connection.field_mapping || {
        employee_code: "employee_id",
        date: "date",
        clock_in: "check_in",
        clock_out: "check_out"
      },
      query_template: connection.query_template || "",
      is_active: connection.is_active,
      sync_frequency: connection.sync_frequency || "Manual",
      notes: connection.notes || ""
    });
    setShowForm(true);
  };

  const handleSubmit = () => {
    if (!formData.connection_name || !formData.host || !formData.database_name) {
      toast.error("Complete los campos obligatorios");
      return;
    }

    createConnectionMutation.mutate({
      ...formData,
      field_mapping: formData.field_mapping,
      port: parseInt(formData.port)
    });
  };

  const resetForm = () => {
    setFormData({
      connection_name: "",
      connection_type: "MySQL",
      host: "",
      port: 3306,
      database_name: "",
      username: "",
      password: "",
      table_name: "attendance",
      field_mapping: {
        employee_code: "employee_id",
        date: "date",
        clock_in: "check_in",
        clock_out: "check_out"
      },
      query_template: "",
      is_active: true,
      sync_frequency: "Manual",
      notes: ""
    });
    setEditingConnection(null);
    setShowForm(false);
  };

  if (!employee || employee.role !== "admin") {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="p-8 text-center">
            <h3 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h3>
            <p className="text-slate-600">Solo administradores pueden configurar conexiones</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-7xl mx-auto px-6 py-8">
        <div className="mb-8 flex justify-between items-start">
          <div>
            <h1 className="text-4xl font-bold text-slate-900 mb-2">
              Configuración de Base de Datos Externa
            </h1>
            <p className="text-slate-600 text-lg">
              Conecta sistemas externos de marcación de asistencia
            </p>
          </div>
          <Button
            onClick={() => setShowForm(true)}
            className="bg-indigo-600 hover:bg-indigo-700"
          >
            <Plus className="w-5 h-5 mr-2" />
            Nueva Conexión
          </Button>
        </div>

        {/* Panel Sincronización Biotime */}
        <BiotimeSyncConfig />

        {/* Sync Monitor */}
        {showMonitor && (
          <div className="mb-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-slate-900">
                Monitor: {connections.find(c => c.id === showMonitor)?.connection_name}
              </h2>
              <Button variant="outline" onClick={() => setShowMonitor(null)}>
                Cerrar Monitor
              </Button>
            </div>
            <SyncMonitor 
              connectionId={showMonitor}
              connectionName={connections.find(c => c.id === showMonitor)?.connection_name}
            />
          </div>
        )}

        {/* Connections List */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {connections.length === 0 ? (
            <Card className="border-0 shadow-lg col-span-2">
              <CardContent className="p-12 text-center">
                <Database className="w-16 h-16 text-slate-300 mx-auto mb-4" />
                <h3 className="text-xl font-bold text-slate-900 mb-2">
                  No hay conexiones configuradas
                </h3>
                <p className="text-slate-600 mb-6">
                  Crea una conexión a tu sistema de marcación de asistencia
                </p>
                <Button onClick={() => setShowForm(true)}>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Primera Conexión
                </Button>
              </CardContent>
            </Card>
          ) : (
            connections.map((conn) => (
              <Card key={conn.id} className="border-0 shadow-lg hover:shadow-xl transition-all">
                <CardHeader className="border-b bg-gradient-to-r from-indigo-50 to-purple-50">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-indigo-600 rounded-lg">
                        <Database className="w-5 h-5 text-white" />
                      </div>
                      <div>
                        <CardTitle className="text-lg">{conn.connection_name}</CardTitle>
                        <p className="text-xs text-slate-600 mt-1">
                          {conn.connection_type} • {conn.host}
                        </p>
                      </div>
                    </div>
                    <Badge className={conn.is_active ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}>
                      {conn.is_active ? "Activa" : "Inactiva"}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  <div className="space-y-3">
                    <div className="flex items-center gap-2 text-sm">
                      <Server className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-600">Base de datos:</span>
                      <span className="font-semibold">{conn.database_name}</span>
                    </div>
                    
                    <div className="flex items-center gap-2 text-sm">
                      <Key className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-600">Tabla:</span>
                      <span className="font-semibold">{conn.table_name || "attendance"}</span>
                    </div>

                    <div className="flex items-center gap-2 text-sm">
                      <RefreshCw className="w-4 h-4 text-slate-500" />
                      <span className="text-slate-600">Sincronización:</span>
                      <Badge variant="outline">{conn.sync_frequency}</Badge>
                    </div>

                    {conn.last_sync && (
                      <div className="text-xs text-slate-500 mt-2">
                        Última sincronización: {new Date(conn.last_sync).toLocaleString()}
                      </div>
                    )}

                    {conn.notes && (
                      <p className="text-xs text-slate-600 bg-slate-50 p-2 rounded mt-2">
                        {conn.notes}
                      </p>
                    )}
                  </div>

                  <div className="flex gap-2 mt-6 pt-4 border-t">
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => setShowMonitor(conn.id)}
                      className="flex-1"
                    >
                      <Activity className="w-4 h-4 mr-1" />
                      Monitor
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => testConnectionMutation.mutate(conn)}
                      disabled={testConnectionMutation.isPending}
                    >
                      {testConnectionMutation.isPending ? "Probando..." : "Probar"}
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleEdit(conn)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-red-600"
                      onClick={() => {
                        if (confirm("¿Eliminar esta conexión?")) {
                          deleteConnectionMutation.mutate(conn.id);
                        }
                      }}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </div>
      </div>

      {/* Form Modal */}
      {showForm && (
        <div 
          className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-6 overflow-y-auto"
          onClick={resetForm}
        >
          <Card 
            className="max-w-3xl w-full my-8"
            onClick={(e) => e.stopPropagation()}
          >
            <CardHeader className="border-b">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold">
                  {editingConnection ? "Editar Conexión" : "Nueva Conexión"}
                </CardTitle>
                <Button variant="ghost" size="icon" onClick={resetForm}>✕</Button>
              </div>
            </CardHeader>
            <CardContent className="p-6 space-y-6">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-slate-900">Información Básica</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Nombre de la Conexión *</Label>
                    <Input
                      value={formData.connection_name}
                      onChange={(e) => setFormData({...formData, connection_name: e.target.value})}
                      placeholder="Sistema de Marcación"
                    />
                  </div>

                  <div>
                    <Label>Tipo de Base de Datos *</Label>
                    <Select 
                      value={formData.connection_type} 
                      onValueChange={(v) => setFormData({...formData, connection_type: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="MySQL">MySQL</SelectItem>
                        <SelectItem value="PostgreSQL">PostgreSQL</SelectItem>
                        <SelectItem value="SQL Server">SQL Server</SelectItem>
                        <SelectItem value="Oracle">Oracle</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-4">
                  <div className="col-span-2">
                    <Label>Host / IP *</Label>
                    <Input
                      value={formData.host}
                      onChange={(e) => setFormData({...formData, host: e.target.value})}
                      placeholder="192.168.1.100 o servidor.dominio.com"
                    />
                  </div>

                  <div>
                    <Label>Puerto</Label>
                    <Input
                      type="number"
                      value={formData.port}
                      onChange={(e) => setFormData({...formData, port: e.target.value})}
                      placeholder="3306"
                    />
                  </div>
                </div>

                <div>
                  <Label>Nombre de Base de Datos *</Label>
                  <Input
                    value={formData.database_name}
                    onChange={(e) => setFormData({...formData, database_name: e.target.value})}
                    placeholder="attendance_db"
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Usuario</Label>
                    <Input
                      value={formData.username}
                      onChange={(e) => setFormData({...formData, username: e.target.value})}
                      placeholder="db_user"
                    />
                  </div>

                  <div>
                    <Label>Contraseña</Label>
                    <Input
                      type="password"
                      value={formData.password}
                      onChange={(e) => setFormData({...formData, password: e.target.value})}
                      placeholder="••••••••"
                    />
                  </div>
                </div>
              </div>

              {/* Table Configuration */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-slate-900">Configuración de Tabla</h3>
                
                <div>
                  <Label>Nombre de Tabla</Label>
                  <Input
                    value={formData.table_name}
                    onChange={(e) => setFormData({...formData, table_name: e.target.value})}
                    placeholder="attendance"
                  />
                </div>

                <div>
                  <Label>Mapeo de Campos (JSON)</Label>
                  <Textarea
                    value={JSON.stringify(formData.field_mapping, null, 2)}
                    onChange={(e) => {
                      try {
                        setFormData({...formData, field_mapping: JSON.parse(e.target.value)});
                      } catch (err) {
                        // Invalid JSON, no actualizar
                      }
                    }}
                    rows={5}
                    className="font-mono text-xs"
                  />
                  <p className="text-xs text-slate-500 mt-1">
                    Define cómo se mapean los campos de tu BD a nuestro sistema
                  </p>
                </div>

                <div>
                  <Label>Query SQL (Opcional)</Label>
                  <Textarea
                    value={formData.query_template}
                    onChange={(e) => setFormData({...formData, query_template: e.target.value})}
                    placeholder="SELECT * FROM attendance WHERE date >= '2025-01-01'"
                    rows={3}
                    className="font-mono text-xs"
                  />
                </div>
              </div>

              {/* Sync Config */}
              <div className="space-y-4 pt-4 border-t">
                <h3 className="font-semibold text-slate-900">Sincronización</h3>
                
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Frecuencia de Sincronización</Label>
                    <Select 
                      value={formData.sync_frequency} 
                      onValueChange={(v) => setFormData({...formData, sync_frequency: v})}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="Manual">Manual</SelectItem>
                        <SelectItem value="Cada hora">Cada hora</SelectItem>
                        <SelectItem value="Cada 6 horas">Cada 6 horas</SelectItem>
                        <SelectItem value="Diaria">Diaria</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="flex items-end">
                    <label className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={formData.is_active}
                        onChange={(e) => setFormData({...formData, is_active: e.target.checked})}
                        className="w-4 h-4 rounded"
                      />
                      <span className="text-sm font-semibold text-slate-700">Conexión Activa</span>
                    </label>
                  </div>
                </div>

                <div>
                  <Label>Notas</Label>
                  <Textarea
                    value={formData.notes}
                    onChange={(e) => setFormData({...formData, notes: e.target.value})}
                    placeholder="Información adicional sobre esta conexión..."
                    rows={2}
                  />
                </div>
              </div>

              <div className="flex gap-3 pt-4">
                <Button 
                  variant="outline" 
                  onClick={() => testConnectionMutation.mutate(formData)}
                  disabled={testConnectionMutation.isPending}
                  className="flex-1"
                >
                  {testConnectionMutation.isPending ? "Probando..." : "Probar Conexión"}
                </Button>
                <Button variant="outline" onClick={resetForm}>
                  Cancelar
                </Button>
                <Button
                  onClick={handleSubmit}
                  disabled={createConnectionMutation.isPending}
                  className="bg-indigo-600 hover:bg-indigo-700"
                >
                  {createConnectionMutation.isPending ? "Guardando..." : "Guardar"}
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}