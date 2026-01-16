import React, { useState, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { 
  Bell, X, CheckCircle, XCircle, Calendar, FileText, 
  AlertCircle, Clock, Settings 
} from "lucide-react";
import { createPageUrl } from "../../utils";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { toast } from "sonner";

export default function NotificationCenter({ userEmail }) {
  const [isOpen, setIsOpen] = useState(false);
  const queryClient = useQueryClient();

  // Temporalmente deshabilitado hasta migrar a API local
  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ["notifications", userEmail],
    queryFn: async () => {
      return []; // Retornar array vacío por ahora
    },
    enabled: false, // Deshabilitar consultas
    refetchInterval: false, // Deshabilitar refetch automático
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  const markAsReadMutation = useMutation({
    mutationFn: async (id) => {
      return null; // Deshabilitado temporalmente
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllAsReadMutation = useMutation({
    mutationFn: async () => {
      return null; // Deshabilitado temporalmente
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
      toast.success("Todas las notificaciones marcadas como leídas");
    },
  });

  const deleteNotificationMutation = useMutation({
    mutationFn: async (id) => {
      return await base44.entities.Notification.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries(["notifications"]);
    },
  });

  const getNotificationIcon = (type) => {
    const icons = {
      incident_pending: <Clock className="w-5 h-5 text-orange-600" />,
      incident_approved: <CheckCircle className="w-5 h-5 text-green-600" />,
      incident_rejected: <XCircle className="w-5 h-5 text-red-600" />,
      vacation_pending: <Calendar className="w-5 h-5 text-blue-600" />,
      vacation_approved: <CheckCircle className="w-5 h-5 text-green-600" />,
      vacation_rejected: <XCircle className="w-5 h-5 text-red-600" />,
      contract_expiring: <AlertCircle className="w-5 h-5 text-amber-600" />,
      payslip_ready: <FileText className="w-5 h-5 text-indigo-600" />,
      attendance_alert: <Clock className="w-5 h-5 text-orange-600" />,
      system: <Bell className="w-5 h-5 text-slate-600" />,
    };
    return icons[type] || <Bell className="w-5 h-5 text-slate-600" />;
  };

  const handleNotificationClick = (notification) => {
    if (!notification.is_read) {
      markAsReadMutation.mutate(notification.id);
    }
    if (notification.link_page) {
      window.location.href = createPageUrl(notification.link_page);
      setIsOpen(false);
    }
  };

  return (
    <div className="relative">
      {/* Bell Icon Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="relative p-2 rounded-lg hover:bg-slate-100 transition-colors"
      >
        <Bell className="w-5 h-5 text-slate-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Notification Dropdown */}
      {isOpen && (
        <>
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          <Card className="absolute right-0 top-full mt-2 w-96 max-h-[600px] overflow-hidden shadow-2xl z-50 border-0">
            <div className="p-4 border-b bg-slate-50/50 flex items-center justify-between sticky top-0">
              <div className="flex items-center gap-2">
                <Bell className="w-5 h-5 text-indigo-600" />
                <h3 className="font-bold text-slate-900">Notificaciones</h3>
                {unreadCount > 0 && (
                  <Badge className="bg-red-500 text-white">
                    {unreadCount} nuevas
                  </Badge>
                )}
              </div>
              <div className="flex items-center gap-2">
                {unreadCount > 0 && (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => markAllAsReadMutation.mutate()}
                    className="text-xs"
                  >
                    Marcar todas
                  </Button>
                )}
                <a href={createPageUrl("NotificationSettings")}>
                  <Button size="sm" variant="ghost">
                    <Settings className="w-4 h-4" />
                  </Button>
                </a>
              </div>
            </div>

            <div className="overflow-y-auto max-h-[500px]">
              {isLoading ? (
                <div className="p-8 text-center">
                  <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center">
                  <Bell className="w-12 h-12 text-slate-300 mx-auto mb-3" />
                  <p className="text-slate-600 text-sm">No hay notificaciones</p>
                </div>
              ) : (
                <div className="divide-y">
                  {notifications.map((notification) => (
                    <div
                      key={notification.id}
                      className={`p-4 transition-colors cursor-pointer ${
                        notification.is_read 
                          ? 'bg-white hover:bg-slate-50' 
                          : 'bg-blue-50 hover:bg-blue-100'
                      }`}
                      onClick={() => handleNotificationClick(notification)}
                    >
                      <div className="flex gap-3">
                        <div className="mt-1">
                          {getNotificationIcon(notification.type)}
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-start justify-between gap-2 mb-1">
                            <h4 className={`text-sm font-semibold ${
                              notification.is_read ? 'text-slate-900' : 'text-slate-900'
                            }`}>
                              {notification.title}
                            </h4>
                            {notification.priority === "high" && (
                              <Badge className="bg-red-100 text-red-700 text-xs">
                                Urgente
                              </Badge>
                            )}
                          </div>
                          <p className="text-xs text-slate-600 mb-2">
                            {notification.message}
                          </p>
                          <div className="flex items-center justify-between">
                            <span className="text-xs text-slate-500">
                              {format(new Date(notification.created_date), "dd MMM, HH:mm", { locale: es })}
                            </span>
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteNotificationMutation.mutate(notification.id);
                              }}
                              className="h-6 w-6 p-0"
                            >
                              <X className="w-3 h-3" />
                            </Button>
                          </div>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </Card>
        </>
      )}
    </div>
  );
}