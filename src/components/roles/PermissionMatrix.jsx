import React, { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ChevronDown, ChevronRight } from "lucide-react";

// Grupos de permisos sincronizados con AVAILABLE_PERMISSIONS
const PERMISSION_GROUPS = {
  "Empleados": [
    { key: "employees.view", label: "Ver empleados" },
    { key: "employees.view_financials", label: "Ver información financiera (salarios, cuentas, AFP)" },
    { key: "employees.create", label: "Crear empleados" },
    { key: "employees.edit", label: "Editar empleados" },
    { key: "employees.delete", label: "Eliminar empleados" },
    { key: "employees.import", label: "Importar empleados masivamente" },
    { key: "employees.export", label: "Exportar datos de empleados" },
    { key: "employees.change_status", label: "Cambiar estado de empleados" },
  ],
  "Asistencia": [
    { key: "attendance.view_own", label: "Ver propia asistencia" },
    { key: "attendance.view_department", label: "Ver asistencia del departamento" },
    { key: "attendance.view_all", label: "Ver asistencia de todos" },
    { key: "attendance.edit", label: "Editar registros de asistencia" },
    { key: "attendance.approve_edits", label: "Aprobar/rechazar edición de registros de asistencia" },
    { key: "attendance.approve_incidents", label: "Aprobar/rechazar incidencias" },
    { key: "attendance.approve_compensations", label: "Aprobar compensaciones de tardanzas y horas extras" },
    { key: "attendance.manage", label: "Gestión completa de asistencia" },
    { key: "attendance.export", label: "Exportar reportes de asistencia" },
  ],
  "Vacaciones": [
    { key: "vacations.view_own", label: "Ver propias vacaciones" },
    { key: "vacations.view_department", label: "Ver vacaciones del departamento" },
    { key: "vacations.view_all", label: "Ver vacaciones de todos" },
    { key: "vacations.approve", label: "Aprobar solicitudes de vacaciones" },
    { key: "vacations.manage", label: "Gestión completa de vacaciones" },
    { key: "vacations.calendar", label: "Ver calendario de vacaciones" },
  ],
  "Nómina / Planillas": [
    { key: "payroll.view_own", label: "Ver propias boletas" },
    { key: "payroll.view_department", label: "Ver planillas del departamento" },
    { key: "payroll.view_all", label: "Ver todas las boletas" },
    { key: "payroll.view_amounts", label: "Ver montos en planillas" },
    { key: "payroll.edit", label: "Editar boletas" },
    { key: "payroll.create", label: "Crear boletas" },
    { key: "payroll.delete", label: "Eliminar boletas" },
    { key: "payroll.calculate", label: "Calcular nómina" },
    { key: "payroll.approve", label: "Aprobar nómina" },
  ],
  "Contratos": [
    { key: "contracts.view", label: "Ver contratos" },
    { key: "contracts.view_amounts", label: "Ver montos de contratos" },
    { key: "contracts.create", label: "Crear contratos" },
    { key: "contracts.edit", label: "Editar contratos" },
    { key: "contracts.delete", label: "Eliminar contratos" },
    { key: "contracts.sign", label: "Firmar contratos digitalmente" },
  ],
  "Certificados": [
    { key: "certificates.view_own", label: "Ver propios certificados" },
    { key: "certificates.view_all", label: "Ver todos los certificados" },
    { key: "certificates.request", label: "Solicitar certificados" },
    { key: "certificates.create", label: "Crear certificados" },
    { key: "certificates.approve", label: "Aprobar certificados" },
  ],
  "Horarios": [
    { key: "schedules.view", label: "Ver horarios" },
    { key: "schedules.create", label: "Crear horarios" },
    { key: "schedules.edit", label: "Editar horarios" },
    { key: "schedules.assign", label: "Asignar horarios" },
    { key: "schedules.delete", label: "Eliminar horarios" },
  ],
  "Centros de Costo": [
    { key: "cost_centers.view", label: "Ver centros de costo" },
    { key: "cost_centers.view_amounts", label: "Ver montos de centros de costo" },
    { key: "cost_centers.create", label: "Crear centros de costo" },
    { key: "cost_centers.edit", label: "Editar centros de costo" },
    { key: "cost_centers.assign", label: "Asignar centros de costo" },
    { key: "cost_centers.delete", label: "Eliminar centros de costo" },
  ],
  "Reportes": [
    { key: "reports.view", label: "Ver reportes" },
    { key: "reports.export", label: "Exportar reportes" },
    { key: "reports.attendance", label: "Ver reportes de asistencia" },
    { key: "reports.payroll", label: "Ver reportes de nómina" },
    { key: "reports.vacations", label: "Ver reportes de vacaciones" },
    { key: "reports.employees", label: "Ver reportes de empleados" },
  ],
  "Datos Maestros": [
    { key: "sites.view", label: "Ver sedes" },
    { key: "sites.create", label: "Crear sedes" },
    { key: "sites.edit", label: "Editar sedes" },
    { key: "sites.delete", label: "Eliminar sedes" },
    { key: "sites.manage", label: "Gestión completa de sedes" },
    { key: "departments.view", label: "Ver departamentos" },
    { key: "departments.create", label: "Crear departamentos" },
    { key: "departments.edit", label: "Editar departamentos" },
    { key: "departments.delete", label: "Eliminar departamentos" },
    { key: "departments.manage", label: "Gestión completa de departamentos" },
    { key: "positions.view", label: "Ver cargos" },
    { key: "positions.create", label: "Crear cargos" },
    { key: "positions.edit", label: "Editar cargos" },
    { key: "positions.delete", label: "Eliminar cargos" },
    { key: "positions.manage", label: "Gestión completa de cargos" },
    { key: "banks.view", label: "Ver bancos" },
    { key: "banks.create", label: "Crear bancos" },
    { key: "banks.edit", label: "Editar bancos" },
    { key: "banks.delete", label: "Eliminar bancos" },
    { key: "holidays.view", label: "Ver feriados" },
    { key: "holidays.create", label: "Crear feriados" },
    { key: "holidays.edit", label: "Editar feriados" },
    { key: "holidays.delete", label: "Eliminar feriados" },
    { key: "holidays.manage", label: "Gestionar feriados" },
  ],
  "Administración del Sistema": [
    { key: "roles.view", label: "Ver roles" },
    { key: "roles.manage", label: "Gestionar roles y permisos" },
    { key: "roles.assign", label: "Asignar roles a usuarios" },
    { key: "system.settings", label: "Configurar ajustes del sistema" },
    { key: "system.admin", label: "Acceso administrativo completo" },
  ],
};

export default function PermissionMatrix({ permissions, onChange }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [collapsedGroups, setCollapsedGroups] = useState({});

  const handleToggle = (key) => {
    const newPerms = permissions.includes(key)
      ? permissions.filter(p => p !== key)
      : [...permissions, key];
    onChange(newPerms);
  };

  const handleGroupToggle = (groupPerms) => {
    const allSelected = groupPerms.every(p => permissions.includes(p.key));
    if (allSelected) {
      onChange(permissions.filter(p => !groupPerms.some(gp => gp.key === p)));
    } else {
      const toAdd = groupPerms.map(p => p.key).filter(k => !permissions.includes(k));
      onChange([...permissions, ...toAdd]);
    }
  };

  const toggleCollapse = (groupName) => {
    setCollapsedGroups(prev => ({ ...prev, [groupName]: !prev[groupName] }));
  };

  const filteredGroups = Object.entries(PERMISSION_GROUPS).reduce((acc, [name, perms]) => {
    const filtered = perms.filter(p =>
      !searchTerm ||
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.key.toLowerCase().includes(searchTerm.toLowerCase()) ||
      name.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length > 0) acc[name] = filtered;
    return acc;
  }, {});

  return (
    <div className="space-y-3">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
        <Input
          placeholder="Buscar permisos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-9 h-9 text-sm"
        />
      </div>

      <div className="text-xs text-slate-500 text-right">
        {permissions.length} permisos seleccionados de {Object.values(PERMISSION_GROUPS).flat().length} disponibles
      </div>

      {Object.entries(filteredGroups).map(([groupName, groupPerms]) => {
        const allSelected = groupPerms.every(p => permissions.includes(p.key));
        const someSelected = groupPerms.some(p => permissions.includes(p.key));
        const isCollapsed = collapsedGroups[groupName];
        const selectedCount = groupPerms.filter(p => permissions.includes(p.key)).length;

        return (
          <div key={groupName} className="border border-slate-200 rounded-lg overflow-hidden">
            {/* Group Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-slate-50 border-b border-slate-200">
              <button
                onClick={() => toggleCollapse(groupName)}
                className="flex items-center gap-2 flex-1 text-left"
              >
                {isCollapsed
                  ? <ChevronRight className="w-4 h-4 text-slate-500" />
                  : <ChevronDown className="w-4 h-4 text-slate-500" />
                }
                <span className="font-semibold text-slate-800 text-sm">{groupName}</span>
                <Badge className={`text-xs px-2 py-0 ${
                  allSelected ? "bg-indigo-100 text-indigo-700" :
                  someSelected ? "bg-amber-100 text-amber-700" :
                  "bg-slate-100 text-slate-500"
                }`}>
                  {selectedCount}/{groupPerms.length}
                </Badge>
              </button>
              <button
                onClick={() => handleGroupToggle(groupPerms)}
                className={`ml-3 px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                  allSelected
                    ? "bg-indigo-600 text-white hover:bg-indigo-700"
                    : someSelected
                    ? "bg-indigo-100 text-indigo-700 hover:bg-indigo-200"
                    : "bg-slate-200 text-slate-700 hover:bg-slate-300"
                }`}
              >
                {allSelected ? "Quitar todos" : "Seleccionar todos"}
              </button>
            </div>

            {/* Group Permissions */}
            {!isCollapsed && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-px bg-slate-100">
                {groupPerms.map((perm) => {
                  const isSelected = permissions.includes(perm.key);
                  return (
                    <label
                      key={perm.key}
                      className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                        isSelected ? "bg-indigo-50" : "bg-white hover:bg-slate-50"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggle(perm.key)}
                        className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500 shrink-0"
                      />
                      <div className="min-w-0">
                        <p className={`text-sm font-medium leading-tight ${isSelected ? "text-indigo-900" : "text-slate-800"}`}>
                          {perm.label}
                        </p>
                        <p className="text-xs text-slate-400 font-mono">{perm.key}</p>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}