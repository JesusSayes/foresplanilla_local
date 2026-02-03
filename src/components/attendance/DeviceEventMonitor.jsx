import React, { useState, useEffect } from "react";
import { useAuth } from '@/lib/AuthContext';
import { entitiesAPI } from '@/api/entitiesClient';
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  CheckCircle, XCircle, AlertTriangle, Activity,
  Play, Square, Clock
} from "lucide-react";
import { toast } from "sonner";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";

export default function DeviceEventMonitor({ deviceId }) {
  const { user: currentUser } = useAuth();
  const employee = currentUser?.employee || null;
  const [isSimulating, setIsSimulating] = useState(false);
  const [simulationInterval, setSimulationInterval] = useState(null);
  const queryClient = useQueryClient();

  const { data: events = [] } = useQuery({
    queryKey: ["deviceEvents", deviceId],
    queryFn: async () => {
      const allEvents = await entitiesAPI.DeviceEvent.filter(
        { device_id: deviceId },
        "-event_timestamp",
        20
      );
      return allEvents;
    },
    refetchInterval: 5000, // Refrescar cada 5 segundos
  });

  const { data: device } = useQuery({
    queryKey: ["device", deviceId],
    queryFn: async () => {
      const devices = await entitiesAPI.AccessDevice.list();
      return devices.find(d => d.id === deviceId);
    },
  });

  const { data: mappings = [] } = useQuery({
    queryKey: ["mappings"],
    queryFn: async () => {
      return await entitiesAPI.EmployeeAccessMapping.filter({ is_active: true });
    },
  });

  const { data: employees = [] } = useQuery({
    queryKey: ["employees"],
    queryFn: async () => {
      return await entitiesAPI.Employee.filter({ status: "Activo" });
    },
  });

  const processEventMutation = useMutation({
    mutationFn: async (event) => {
      // Buscar mapeo para este identificador
      const mapping = mappings.find(m => m.identifier_value === event.identifier_value);

      if (!mapping) {
        // No se encontró mapeo
        await entitiesAPI.DeviceEvent.update(event.id, {
          processing_status: "No Identificado",
          error_message: "No se encontró mapeo para este identificador"
        });
        throw new Error("Identificador no mapeado");
      }

      const employee = employees.find(e => e.id === mapping.employee_id);
      if (!employee) {
        await entitiesAPI.DeviceEvent.update(event.id, {
          processing_status: "Fallido",
          error_message: "Empleado no encontrado"
        });
        throw new Error("Empleado no encontrado");
      }

      // Buscar o crear registro de asistencia para hoy
      const today = new Date().toISOString().split("T")[0];
      const existingRecords = await entitiesAPI.AttendanceRecord.filter({
        employee_id: employee.id,
        date: today
      });

      let attendanceRecord;

      if (existingRecords.length === 0) {
        // Crear nuevo registro
        attendanceRecord = await entitiesAPI.AttendanceRecord.create({
          employee_id: employee.id,
          date: today,
          clock_in: event.event_type === "Entrada" ? new Date(event.event_timestamp).toTimeString().slice(0, 5) : null,
          clock_out: event.event_type === "Salida" ? new Date(event.event_timestamp).toTimeString().slice(0, 5) : null,
          status: "Incompleto"
        });
      } else {
        // Actualizar registro existente
        attendanceRecord = existingRecords[0];
        const updateData = {};

        if (event.event_type === "Entrada" && !attendanceRecord.clock_in) {
          updateData.clock_in = new Date(event.event_timestamp).toTimeString().slice(0, 5);
        } else if (event.event_type === "Salida") {
          updateData.clock_out = new Date(event.event_timestamp).toTimeString().slice(0, 5);

          // Calcular horas trabajadas si hay entrada y salida
          if (attendanceRecord.clock_in) {
            const [inHour, inMin] = attendanceRecord.clock_in.split(":").map(Number);
            const [outHour, outMin] = updateData.clock_out.split(":").map(Number);
            const totalMinutes = (outHour * 60 + outMin) - (inHour * 60 + inMin) - 60; // 60 min break
            updateData.worked_hours = totalMinutes / 60;
            updateData.status = "Completo";
          }
        }

        await entitiesAPI.AttendanceRecord.update(attendanceRecord.id, updateData);
      }

      // Actualizar evento como procesado
      await entitiesAPI.DeviceEvent.update(event.id, {
        employee_id: employee.id,
        processing_status: "Procesado",
        attendance_record_id: attendanceRecord.id
      });

      return { employee, attendanceRecord };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries(["deviceEvents", deviceId]);
      queryClient.invalidateQueries(["todayAttendance"]);
      toast.success(`✓ Marcación procesada: ${result.employee.first_name} ${result.employee.last_name}`);
    },
    onError: (error) => {
      queryClient.invalidateQueries(["deviceEvents", deviceId]);
      toast.error(`✗ ${error.message}`);
    },
  });

  const simulateEventMutation = useMutation({
    mutationFn: async () => {
      // Simular un evento de dispositivo
      const randomMapping = mappings[Math.floor(Math.random() * mappings.length)];
      const eventType = Math.random() > 0.5 ? "Entrada" : "Salida";

      const event = await entitiesAPI.DeviceEvent.create({
        device_id: deviceId,
        event_timestamp: new Date().toISOString(),
        identifier_value: randomMapping ? randomMapping.identifier_value : `UNKNOWN_${Math.floor(Math.random() * 1000)}`,
        identifier_type: randomMapping ? randomMapping.identifier_type : "Badge",
        event_type: eventType,
        processing_status: "Pendiente",
        raw_data: {
          simulated: true,
          device_name: device?.device_name
        }
      });

      return event;
    },
    onSuccess: (event) => {
      queryClient.invalidateQueries(["deviceEvents", deviceId]);
      // Auto-procesar el evento simulado
      setTimeout(() => {
        processEventMutation.mutate(event);
      }, 500);
    },
  });

  const startSimulation = () => {
    setIsSimulating(true);
    const interval = setInterval(() => {
      simulateEventMutation.mutate();
    }, 3000); // Cada 3 segundos
    setSimulationInterval(interval);
  };

  const stopSimulation = () => {
    setIsSimulating(false);
    if (simulationInterval) {
      clearInterval(simulationInterval);
      setSimulationInterval(null);
    }
  };

  useEffect(() => {
    return () => {
      if (simulationInterval) {
        clearInterval(simulationInterval);
      }
    };
  }, [simulationInterval]);

  const pendingEvents = events.filter(e => e.processing_status === "Pendiente");
  const processedEvents = events.filter(e => e.processing_status === "Procesado");
  const failedEvents = events.filter(e => e.processing_status === "Fallido" || e.processing_status === "No Identificado");

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b bg-gradient-to-r from-green-50 to-teal-50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg font-bold flex items-center gap-2">
            <Activity className="w-5 h-5 text-green-600" />
            Monitor de Eventos: {device?.device_name}
          </CardTitle>
          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() => simulateEventMutation.mutate()}
              disabled={simulateEventMutation.isPending}
            >
              Simular Evento
            </Button>
            {!isSimulating ? (
              <Button
                size="sm"
                onClick={startSimulation}
                className="bg-green-600 hover:bg-green-700"
              >
                <Play className="w-4 h-4 mr-2" />
                Iniciar Simulación
              </Button>
            ) : (
              <Button
                size="sm"
                onClick={stopSimulation}
                className="bg-red-600 hover:bg-red-700"
              >
                <Square className="w-4 h-4 mr-2" />
                Detener Simulación
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="p-6">
        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 mb-6">
          <div className="text-center p-4 bg-yellow-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Pendientes</p>
            <p className="text-2xl font-bold text-yellow-600">{pendingEvents.length}</p>
          </div>
          <div className="text-center p-4 bg-green-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Procesados</p>
            <p className="text-2xl font-bold text-green-600">{processedEvents.length}</p>
          </div>
          <div className="text-center p-4 bg-red-50 rounded-lg">
            <p className="text-xs text-slate-600 mb-1">Fallidos</p>
            <p className="text-2xl font-bold text-red-600">{failedEvents.length}</p>
          </div>
        </div>

        {/* Event List */}
        <div>
          <h4 className="font-semibold text-slate-900 mb-3">Eventos Recientes</h4>
          <div className="space-y-2 max-h-96 overflow-y-auto">
            {events.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-8">
                No hay eventos registrados. Simula eventos para probar el sistema.
              </p>
            ) : (
              events.map((event) => {
                const employee = employees.find(e => e.id === event.employee_id);

                return (
                  <div
                    key={event.id}
                    className={`p-3 rounded-lg border-2 ${
                      event.processing_status === "Procesado"
                        ? "bg-green-50 border-green-200"
                        : event.processing_status === "Pendiente"
                        ? "bg-yellow-50 border-yellow-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        {event.processing_status === "Procesado" ? (
                          <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                        ) : event.processing_status === "Pendiente" ? (
                          <Clock className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                        ) : (
                          <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Badge className={
                              event.processing_status === "Procesado"
                                ? "bg-green-100 text-green-700"
                                : event.processing_status === "Pendiente"
                                ? "bg-yellow-100 text-yellow-700"
                                : "bg-red-100 text-red-700"
                            }>
                              {event.processing_status}
                            </Badge>
                            <Badge variant="outline">{event.event_type}</Badge>
                            <Badge className="bg-purple-100 text-purple-700">
                              {event.identifier_type}
                            </Badge>
                            <span className="text-xs text-slate-600">
                              {formatDistanceToNow(new Date(event.event_timestamp), { addSuffix: true, locale: es })}
                            </span>
                          </div>
                          <div className="text-sm text-slate-700">
                            <span className="font-mono">{event.identifier_value}</span>
                            {employee && (
                              <span className="ml-2">→ {employee.first_name} {employee.last_name}</span>
                            )}
                          </div>
                          {event.error_message && (
                            <p className="text-xs text-red-700 mt-1 font-mono bg-red-100 p-1 rounded">
                              {event.error_message}
                            </p>
                          )}
                        </div>
                      </div>
                      {event.processing_status === "Pendiente" && (
                        <Button
                          size="sm"
                          onClick={() => processEventMutation.mutate(event)}
                          disabled={processEventMutation.isPending}
                          className="ml-2"
                        >
                          Procesar
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {isSimulating && (
          <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded-lg">
            <p className="text-sm text-green-700 flex items-center gap-2">
              <Activity className="w-4 h-4 animate-pulse" />
              Simulación activa - Generando eventos cada 3 segundos
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
