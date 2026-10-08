import React, { useState, useMemo, useEffect } from "react";
import { usePermissions } from "@/components/hooks/usePermissions";
import CompensationPanel from "@/components/attendance/CompensationPanel";
import PendingCompensationsApproval from "@/components/attendance/PendingCompensationsApproval";
import CompensationHistory from "@/components/attendance/CompensationHistory";
import SiteSelector from "@/components/attendance/SiteSelector";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, History, AlertCircle } from "lucide-react";

export default function CompensacionTardanzas() {
  const [activeTab, setActiveTab] = useState("pendientes");
  const [selectedSite, setSelectedSite] = useState("all");
  const { hasPermission, getAccessibleSites, loading: permissionsLoading } =
    usePermissions();

  const { data: allEmployees = [], isLoading: employeesLoading } = useQuery({
    queryKey: ["allEmployees"],
    queryFn: async () => await base44.entities.Employee.list("-created_date"),
  });

  const { data: sites = [] } = useQuery({
    queryKey: ["sites"],
    queryFn: async () => {
      const all = await base44.entities.Site.list("name");
      return all.filter((s) => s.is_active);
    },
  });

  // Calcular sedes accesibles según permisos
  // null = todas, [] = ninguna, ["site1", ...] = específicas
  const accessibleSites = permissionsLoading ? undefined : getAccessibleSites();

  // Sedes disponibles para el selector (filtradas por permisos)
  const availableSites = useMemo(() => {
    if (accessibleSites === undefined) return [];
    if (accessibleSites === null) return sites;
    return sites.filter((s) => accessibleSites.includes(s.name));
  }, [accessibleSites, sites]);

  const hasNoSites =
    accessibleSites !== undefined &&
    accessibleSites !== null &&
    accessibleSites.length === 0;

  const isSingleSite =
    accessibleSites !== null && accessibleSites !== undefined && accessibleSites.length === 1;

  // Auto-seleccionar sede por defecto
  useEffect(() => {
    if (accessibleSites === undefined) return;
    if (accessibleSites === null) {
      setSelectedSite("all");
    } else if (accessibleSites.length === 1) {
      setSelectedSite(accessibleSites[0]);
    } else if (accessibleSites.length === 0) {
      setSelectedSite("__none__");
    } else {
      setSelectedSite("all");
    }
  }, [accessibleSites]);

  // IDs de empleados filtrados por sede seleccionada y permisos
  const siteEmployeeIds = useMemo(() => {
    if (accessibleSites === undefined) return new Set();
    const baseEmployees =
      accessibleSites === null
        ? allEmployees
        : allEmployees.filter((emp) => accessibleSites.includes(emp.site));

    if (selectedSite === "all" || selectedSite === "__none__") {
      return new Set(baseEmployees.map((e) => e.id));
    }
    return new Set(
      baseEmployees.filter((e) => e.site === selectedSite).map((e) => e.id)
    );
  }, [allEmployees, accessibleSites, selectedSite]);

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

  if (hasNoSites) {
    return (
      <div className="min-h-screen bg-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <AlertCircle className="w-12 h-12 text-amber-500 mx-auto mb-4" />
            <p className="text-slate-700 font-semibold mb-1">
              No tienes sedes autorizadas
            </p>
            <p className="text-slate-500 text-sm">
              No se pueden consultar ni aprobar compensaciones sin una sede
              asignada. Contacta al administrador del sistema.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Selector de sede reutilizable, ubicado inline en el header de cada módulo
  const siteSelector = (
    <SiteSelector
      value={selectedSite}
      onChange={setSelectedSite}
      availableSites={availableSites}
      accessibleSites={accessibleSites}
      isSingleSite={isSingleSite}
      compact
    />
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-full mx-auto px-4 py-4">
        <div className="mb-4">
          <h1 className="text-2xl sm:text-3xl font-bold text-slate-900">
            Compensación de Tardanzas y Horas en Exceso
          </h1>
          <p className="text-slate-600 text-sm sm:text-base">
            Gestión de compensaciones de tardanzas y horas extras del personal
          </p>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
          <TabsList className="grid w-full max-w-xs grid-cols-2 h-9">
            <TabsTrigger value="pendientes">
              <Clock className="w-4 h-4 mr-1.5" />
              Solicitudes
            </TabsTrigger>
            <TabsTrigger value="historico">
              <History className="w-4 h-4 mr-1.5" />
              Histórico
            </TabsTrigger>
          </TabsList>

          <TabsContent value="pendientes" className="mt-4 space-y-4">
            <PendingCompensationsApproval
              allEmployees={allEmployees}
              siteEmployeeIds={siteEmployeeIds}
              selectedSite={selectedSite}
            />

            <CompensationPanel
              allEmployees={allEmployees}
              accessibleEmployeeIds={siteEmployeeIds}
              hasPermission={hasPermission}
              selectedSite={selectedSite}
              standalone
              headerExtra={siteSelector}
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-4">
            <CompensationHistory
              allEmployees={allEmployees}
              siteEmployeeIds={siteEmployeeIds}
              headerExtra={siteSelector}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}