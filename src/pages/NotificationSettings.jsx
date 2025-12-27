import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { 
  Bell, Clock, Calendar, FileText, AlertCircle, CheckCircle, 
  XCircle, Mail 
} from "lucide-react";
import { toast } from "sonner";

export default function NotificationSettings() {
  const [currentUser, setCurrentUser] = useState(null);
  const [employee, setEmployee] = useState(null);
  const [preferences, setPreferences] = useState(null);

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

  const { data: existingPreferences, isLoading } = useQuery({
    queryKey: ["notificationPreferences", currentUser?.email],
    queryFn: async () => {
      if (!currentUser?.email) return null;
      const prefs = await base44.entities.NotificationPreference.filter({
        user_email: currentUser.email
      });
      return prefs.length > 0 ? prefs[0] : null;
    },
    enabled: !!currentUser?.email,
  });

  useEffect(() => {
    if (existingPreferences) {
      setPreferences(existingPreferences);
    } else if (currentUser && employee) {
      // Valores por defecto
      setPreferences({
        user_email: currentUser.email,
        employee_id: employee.id,
        incident_pending: true,
        incident_approved: true,
        incident_rejected: true,
        vacation_pending: true,
        vacation_approved: true,
        vacation_rejected: true,
        contract_expiring: true,
        payslip_ready: true,
        attendance_alert: true,
        system: true,
        email_notifications: false,
      });
    }
  }, [existingPreferences, currentUser, employee]);

  const saveMutation = useMutation({
    mutationFn: async (data) => {
      if (existingPreferences) {
        return await base44.entities.NotificationPreference.update(
          existingPreferences.id,
          data
        );
      } else {
        return await base44.entities.NotificationPreference.create(data);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["notificationPreferences"]);
      toast.success("Preferencias guardadas correctamente");
    },
    onError: () => {
      toast.error("Error al guardar las preferencias");
    },
  });

  const handleToggle = (key) => {
    setPreferences(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const handleSave = () => {
    if (!preferences) return;
    saveMutation.mutate(preferences);
  };

  if (isLoading || !preferences) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const notificationTypes = [
    {
      key: "incident_pending",
      icon: Clock,
      title: "Incidencias Pendientes",
      description: "Notificar cuando hay incidencias pendientes de aprobar (solo managers/admins)",
      color: "text-orange-600 bg-orange-100",
    },
    {
      key: "incident_approved",
      icon: CheckCircle,
      title: "Incidencia Aprobada",
      description: "Notificar cuando tu justificación de incidencia es aprobada",
      color: "text-green-600 bg-green-100",
    },
    {
      key: "incident_rejected",
      icon: XCircle,
      title: "Incidencia Rechazada",
      description: "Notificar cuando tu justificación de incidencia es rechazada",
      color: "text-red-600 bg-red-100",
    },
    {
      key: "vacation_pending",
      icon: Calendar,
      title: "Solicitudes de Vacaciones",
      description: "Notificar cuando hay solicitudes de vacaciones pendientes (solo managers/admins)",
      color: "text-blue-600 bg-blue-100",
    },
    {
      key: "vacation_approved",
      icon: CheckCircle,
      title: "Vacaciones Aprobadas",
      description: "Notificar cuando tu solicitud de vacaciones es aprobada",
      color: "text-green-600 bg-green-100",
    },
    {
      key: "vacation_rejected",
      icon: XCircle,
      title: "Vacaciones Rechazadas",
      description: "Notificar cuando tu solicitud de vacaciones es rechazada",
      color: "text-red-600 bg-red-100",
    },
    {
      key: "contract_expiring",
      icon: AlertCircle,
      title: "Contratos por Vencer",
      description: "Notificar cuando un contrato está próximo a vencer (solo admins)",
      color: "text-amber-600 bg-amber-100",
    },
    {
      key: "payslip_ready",
      icon: FileText,
      title: "Boletas Disponibles",
      description: "Notificar cuando hay una nueva boleta de pago disponible",
      color: "text-indigo-600 bg-indigo-100",
    },
    {
      key: "attendance_alert",
      icon: Clock,
      title: "Alertas de Asistencia",
      description: "Notificar sobre tardanzas, faltas o incidencias de asistencia",
      color: "text-orange-600 bg-orange-100",
    },
    {
      key: "system",
      icon: Bell,
      title: "Notificaciones del Sistema",
      description: "Notificaciones generales y anuncios del sistema",
      color: "text-slate-600 bg-slate-100",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-4xl mx-auto px-6 py-8">
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-slate-900 mb-2">
            Configuración de Notificaciones
          </h1>
          <p className="text-slate-600 text-lg">
            Personaliza qué notificaciones deseas recibir
          </p>
        </div>

        <Card className="border-0 shadow-lg mb-6">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Bell className="w-5 h-5" />
              Tipos de Notificaciones
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="space-y-4">
              {notificationTypes.map((type) => {
                const Icon = type.icon;
                return (
                  <div 
                    key={type.key}
                    className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg hover:shadow-md transition-all"
                  >
                    <div className={`p-3 rounded-xl ${type.color}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-semibold text-slate-900 mb-1">
                        {type.title}
                      </h4>
                      <p className="text-sm text-slate-600">
                        {type.description}
                      </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                      <input
                        type="checkbox"
                        checked={preferences[type.key]}
                        onChange={() => handleToggle(type.key)}
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
                    </label>
                  </div>
                );
              })}
            </div>
          </CardContent>
        </Card>

        <Card className="border-0 shadow-lg mb-6">
          <CardHeader className="border-b bg-slate-50/50">
            <CardTitle className="text-xl font-bold flex items-center gap-2">
              <Mail className="w-5 h-5" />
              Notificaciones por Email
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="flex items-start gap-4 p-4 border border-slate-200 rounded-lg">
              <div className="p-3 rounded-xl bg-purple-100 text-purple-600">
                <Mail className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h4 className="font-semibold text-slate-900 mb-1">
                  Recibir Notificaciones por Email
                </h4>
                <p className="text-sm text-slate-600">
                  Además de las notificaciones en la aplicación, también recibir emails para eventos importantes
                </p>
              </div>
              <label className="relative inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={preferences.email_notifications}
                  onChange={() => handleToggle('email_notifications')}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-indigo-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-indigo-600"></div>
              </label>
            </div>
          </CardContent>
        </Card>

        <div className="flex gap-3">
          <Button
            onClick={handleSave}
            disabled={saveMutation.isPending}
            className="flex-1 bg-indigo-600 hover:bg-indigo-700"
          >
            {saveMutation.isPending ? "Guardando..." : "Guardar Preferencias"}
          </Button>
        </div>
      </div>
    </div>
  );
}