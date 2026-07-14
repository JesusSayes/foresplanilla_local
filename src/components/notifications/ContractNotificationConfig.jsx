import React, { useState } from "react";
import { entitiesAPI } from "@/api/entitiesClient";
import { contractNotificationsAPI } from "@/api/localClient";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Mail, Plus, Trash2, Send, Users, ExternalLink, AlertCircle } from "lucide-react";
import { toast } from "sonner";

export default function ContractNotificationConfig({ currentUser }) {
  const [newEmail, setNewEmail] = useState("");
  const [newName, setNewName] = useState("");
  const [sending, setSending] = useState(false);
  const queryClient = useQueryClient();

  // Destinatarios adicionales
  const { data: recipients = [], isLoading } = useQuery({
    queryKey: ["notificationRecipients", "contract_expiring"],
    queryFn: async () => {
      return await entitiesAPI.NotificationRecipient.filter(
        { notification_type: "contract_expiring" },
        "-created_date"
      );
    },
  });

  // Usuarios del sistema que reciben la notificación
  const { data: systemUsers = [] } = useQuery({
    queryKey: ["systemUsersForNotif"],
    queryFn: async () => {
      return await contractNotificationsAPI.recipients();
    },
  });

  const addRecipientMutation = useMutation({
    mutationFn: async (data) => {
      return await entitiesAPI.NotificationRecipient.create(data);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationRecipients"] });
      toast.success("Destinatario agregado correctamente");
      setNewEmail("");
      setNewName("");
    },
    onError: (error) => {
      toast.error(`Error: ${error?.message || "No se pudo agregar"}`);
    },
  });

  const deleteRecipientMutation = useMutation({
    mutationFn: async (id) => {
      return await entitiesAPI.NotificationRecipient.delete(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationRecipients"] });
      toast.success("Destinatario eliminado");
    },
    onError: () => toast.error("Error al eliminar"),
  });

  const toggleRecipientMutation = useMutation({
    mutationFn: async ({ id, is_active }) => {
      return await entitiesAPI.NotificationRecipient.update(id, { is_active });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notificationRecipients"] });
    },
  });

  const handleAdd = () => {
    if (!newEmail || !newEmail.includes("@")) {
      toast.error("Ingrese un correo electrónico válido");
      return;
    }
    addRecipientMutation.mutate({
      email: newEmail,
      recipient_name: newName,
      notification_type: "contract_expiring",
      is_active: true,
      added_by: currentUser?.email || "",
    });
  };

  const handleTestNotification = async () => {
    setSending(true);
    try {
      const data = await contractNotificationsAPI.run();
      if (data?.success) {
        toast.success(`Notificación enviada: ${data.emails_sent} correo(s), ${data.contracts_expiring} contrato(s) por vencer`);
      } else {
        toast.error("Error al enviar notificación");
      }
    } catch (error) {
      toast.error(`Error: ${error?.message || "No se pudo enviar"}`);
    } finally {
      setSending(false);
    }
  };

  const activeRecipients = recipients.filter(r => r.is_active !== false);
  const systemEmailUsers = systemUsers.filter(user => user.email_notifications === true);
  return (
    <Card className="border-0 shadow-lg mb-6">
      <CardHeader className="border-b bg-slate-50/50">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xl font-bold flex items-center gap-2">
            <Mail className="w-5 h-5 text-indigo-600" />
            Configuración de Correos — Vencimiento de Contratos
          </CardTitle>
          <Button
            size="sm"
            variant="outline"
            onClick={handleTestNotification}
            disabled={sending}
          >
            <Send className="w-4 h-4 mr-1" />
            {sending ? "Enviando..." : "Ejecutar Ahora"}
          </Button>
        </div>
        <p className="text-sm text-slate-500 mt-1">
          Define qué correos reciben la alerta de contratos por vencer (≤ 30 días) con tabla resumen y niveles de urgencia.
        </p>
      </CardHeader>
      <CardContent className="p-6 space-y-6">

        {/* Vista previa del formato de correo */}
        <div className="p-4 border border-indigo-200 rounded-lg bg-indigo-50/30">
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-indigo-600" />
            Formato del Correo (Vista Previa)
          </p>
          <div className="bg-white rounded-lg p-3 border border-slate-200">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-slate-100 text-slate-600">
                  <th className="p-2 text-left"></th>
                  <th className="p-2 text-left">Empleado</th>
                  <th className="p-2 text-left">Código</th>
                  <th className="p-2 text-left">Cargo</th>
                  <th className="p-2 text-left">Tipo</th>
                  <th className="p-2 text-left">Vence</th>
                  <th className="p-2 text-left">Días</th>
                </tr>
              </thead>
              <tbody>
                <tr className="border-b border-slate-100">
                  <td className="p-2">🔴</td>
                  <td className="p-2 font-medium">Ejemplo Urgente</td>
                  <td className="p-2">001</td>
                  <td className="p-2">Analista</td>
                  <td className="p-2">Plazo Fijo</td>
                  <td className="p-2">2026-07-18</td>
                  <td className="p-2 font-bold text-red-600">5 días</td>
                </tr>
                <tr className="border-b border-slate-100">
                  <td className="p-2">🟡</td>
                  <td className="p-2 font-medium">Ejemplo Medio</td>
                  <td className="p-2">002</td>
                  <td className="p-2">Coordinador</td>
                  <td className="p-2">Plazo Fijo</td>
                  <td className="p-2">2026-07-28</td>
                  <td className="p-2 font-bold text-amber-600">15 días</td>
                </tr>
                <tr>
                  <td className="p-2">🟢</td>
                  <td className="p-2 font-medium">Ejemplo Normal</td>
                  <td className="p-2">003</td>
                  <td className="p-2">Asistente</td>
                  <td className="p-2">Prácticas</td>
                  <td className="p-2">2026-08-10</td>
                  <td className="p-2 font-bold text-green-600">28 días</td>
                </tr>
              </tbody>
            </table>
          </div>
          <div className="flex gap-4 mt-2 text-xs text-slate-500">
            <span>🔴 ≤ 7 días (urgente)</span>
            <span>🟡 ≤ 15 días (medio)</span>
            <span>🟢 16-30 días (normal)</span>
          </div>
        </div>

        {/* Usuarios del sistema que reciben */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <Users className="w-4 h-4 text-blue-600" />
            Usuarios del Sistema Autorizados ({systemUsers.length})
          </p>
          <p className="text-xs text-slate-500 mb-2">
            Solo reciben correo quienes tienen activada la opción "Recibir Notificaciones por Email"; los demás reciben únicamente la alerta dentro del sistema.
          </p>
          <div className="flex flex-wrap gap-2">
            {systemUsers.map(u => (
              <Badge key={u.email} className="bg-blue-50 text-blue-700 border-blue-200">
                {u.name || u.email}{u.email_notifications === true ? "" : " (solo app)"}
              </Badge>
            ))}
            {systemUsers.length === 0 && (
              <span className="text-xs text-slate-400">No hay usuarios configurados</span>
            )}
          </div>
        </div>

        {/* Destinatarios adicionales */}
        <div>
          <p className="text-sm font-semibold text-slate-700 mb-2 flex items-center gap-2">
            <ExternalLink className="w-4 h-4 text-purple-600" />
            Destinatarios Adicionales ({activeRecipients.length} activos)
          </p>
          <p className="text-xs text-slate-500 mb-3">
            Agregue correos externos (proveedores, gerentes externos, etc.) que también deben recibir la alerta de vencimiento.
          </p>

          {/* Lista de destinatarios */}
          {isLoading ? (
            <div className="text-sm text-slate-400">Cargando...</div>
          ) : recipients.length === 0 ? (
            <div className="text-sm text-slate-400 p-3 border border-dashed border-slate-200 rounded-lg text-center">
              No hay destinatarios adicionales configurados
            </div>
          ) : (
            <div className="space-y-2 mb-3">
              {recipients.map(r => (
                <div key={r.id} className="flex items-center gap-3 p-3 border border-slate-200 rounded-lg">
                  <div className="flex-1">
                    <p className="text-sm font-medium text-slate-800">{r.email}</p>
                    {r.recipient_name && <p className="text-xs text-slate-500">{r.recipient_name}</p>}
                  </div>
                  <Badge className={r.is_active !== false ? "bg-green-100 text-green-700 border-green-200" : "bg-slate-100 text-slate-500 border-slate-200"}>
                    {r.is_active !== false ? "Activo" : "Inactivo"}
                  </Badge>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => toggleRecipientMutation.mutate({ id: r.id, is_active: r.is_active === false })}
                  >
                    {r.is_active !== false ? "Desactivar" : "Activar"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-red-600 hover:bg-red-50"
                    onClick={() => deleteRecipientMutation.mutate(r.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              ))}
            </div>
          )}

          {/* Formulario para agregar */}
          <div className="flex items-end gap-3 p-3 border border-indigo-200 rounded-lg bg-indigo-50/30">
            <div className="flex-1">
              <Label className="text-xs">Correo Electrónico *</Label>
              <Input
                type="email"
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                placeholder="ejemplo@empresa.com"
                className="h-9 text-sm"
              />
            </div>
            <div className="flex-1">
              <Label className="text-xs">Nombre (opcional)</Label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Nombre del destinatario"
                className="h-9 text-sm"
              />
            </div>
            <Button
              size="sm"
              className="bg-indigo-600 hover:bg-indigo-700"
              onClick={handleAdd}
              disabled={addRecipientMutation.isPending}
            >
              <Plus className="w-4 h-4 mr-1" />
              Agregar
            </Button>
          </div>
        </div>

        {/* Resumen */}
        <div className="p-4 bg-slate-50 rounded-lg border border-slate-200">
          <p className="text-sm text-slate-600">
            <strong>Total de destinatarios de correo:</strong> {systemEmailUsers.length + activeRecipients.length}
            <span className="mx-2">•</span>
            <strong>Frecuencia:</strong> Diaria a las 9:00 AM
            <span className="mx-2">•</span>
            <strong>Umbral:</strong> Contratos que vencen en ≤ 30 días
          </p>
        </div>
      </CardContent>
    </Card>
  );
}
