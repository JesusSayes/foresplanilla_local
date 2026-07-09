import React, { useState } from "react";
import { usePermissions } from "@/components/hooks/usePermissions";
import CompensationPanel from "@/components/attendance/CompensationPanel";
import PendingCompensationsApproval from "@/components/attendance/PendingCompensationsApproval";
import CompensationHistory from "@/components/attendance/CompensationHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, History } from "lucide-react";

export default function CompensacionTardanzas() {
  const [activeTab, setActiveTab] = useState("pendientes");
  const { hasPermission, getAccessibleSites, loading: permissionsLoading } =
    usePermissions();

  const { data: allEmployees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => await base44.entities.Employee.list("-created_date"),
  });

  // Calcular empleados accesibles según permisos de sede
  const accessibleSites = permissionsLoading ? undefined : getAccessibleSites();
  const accessibleEmployeeIds = new Set(
    (accessibleSites === undefined
      ? []
      : accessibleSites === null
        ? allEmployees
        : allEmployees.filter((emp) => accessibleSites.includes(emp.site))
    ).map((e) => e.id)
  );

  const canAccess =
    hasPermission("system.admin") ||
    hasPermission("attendance.approve_compensations") ||
    hasPermission("attendance.manage") ||
    hasPermission("attendance.view_all");

  if (permissionsLoading || employeesLoading) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center">
        <div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <p className="text-slate-600">
              No tienes permisos para acceder a este módulo.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-full mx-auto px-4 py-6">
        <div className="mb-8">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Compensación de Tardanzas y Horas en Exceso
          </h1>
          <p className="text-slate-600 text-lg">
            Gestión de compensaciones de tardanzas y horas extras del personal
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="pendientes">
              <Clock className="w-4 h-4 mr-2" />
              Solicitudes
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="w-4 h-4 mr-2" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pendientes" className="mt-6 space-y-6">
            <PendingCompensationsApproval allEmployees={allEmployees} />

            <CompensationPanel
              allEmployees={allEmployees}
              accessibleEmployeeIds={accessibleEmployeeIds}
              hasPermission={hasPermission}
              standalone
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-6">
            <CompensationHistory allEmployees={allEmployees} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}