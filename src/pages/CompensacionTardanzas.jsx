import React, { useState, useMemo, useEffect } from "react";
import { usePermissions } from "@/components/hooks/usePermissions";
import CompensationPanel from "@/components/attendance/CompensationPanel";
import PendingCompensationsApproval from "@/components/attendance/PendingCompensationsApproval";
import CompensationHistory from "@/components/attendance/CompensationHistory";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Clock, History, MapPin, AlertCircle } from "lucide-react";

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

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50">
      <div className="max-w-full mx-auto px-4 py-6">
        <div className="mb-6">
          <h1 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-2">
            Compensación de Tardanzas y Horas en Exceso
          </h1>
          <p className="text-slate-600 text-lg">
            Gestión de compensaciones de tardanzas y horas extras del personal
          </p>
        </div>

        {/* Selector de sede */}
        <div className="mb-6 flex items-center gap-3">
          <div className="flex items-center gap-2">
            <MapPin className="w-5 h-5 text-indigo-600" />
            <span className="text-sm font-semibold text-slate-700">Sede:</span>
          </div>
          <Select
            value={selectedSite}
            onValueChange={(v) => setSelectedSite(v)}
            disabled={isSingleSite}
          >
            <SelectTrigger className="w-64">
              <SelectValue placeholder="Seleccionar sede" />
            </SelectTrigger>
            <SelectContent>
              {accessibleSites === null && (
                <SelectItem value="all">Todas las sedes</SelectItem>
              )}
              {accessibleSites !== null &&
                accessibleSites.length > 1 && (
                  <SelectItem value="all">Todas las sedes autorizadas</SelectItem>
                )}
              {availableSites.map((site) => (
                <SelectItem key={site.id} value={site.name}>
                  {site.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
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
            />
          </TabsContent>

          <TabsContent value="historico" className="mt-6">
            <CompensationHistory
              allEmployees={allEmployees}
              siteEmployeeIds={siteEmployeeIds}
            />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}