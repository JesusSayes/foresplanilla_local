import React, { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search } from "lucide-react";

export default function PermissionMatrix({ permissions, onChange }) {
  const [searchTerm, setSearchTerm] = useState("");

  const permissionGroups = {
    "Empleados": [
      { key: "employees.view", label: "Ver empleados", actions: ["view"] },
      { key: "employees.create", label: "Crear empleados", actions: ["create"] },
      { key: "employees.edit", label: "Editar empleados", actions: ["edit"] },
      { key: "employees.delete", label: "Eliminar empleados", actions: ["delete"] },
      { key: "employees.manage", label: "Gestión completa de empleados", actions: ["all"] },
    ],
    "Asistencia": [
      { key: "attendance.view", label: "Ver asistencia", actions: ["view"] },
      { key: "attendance.edit", label: "Editar registros de asistencia", actions: ["edit"] },
      { key: "attendance.manage", label: "Gestión completa de asistencia", actions: ["all"] },
      { key: "attendance.approve_incidents", label: "Aprobar/rechazar incidencias", actions: ["approve"] },
    ],
    "Planilla": [
      { key: "payroll.view", label: "Ver planillas", actions: ["view"] },
      { key: "payroll.create", label: "Generar planillas", actions: ["create"] },
      { key: "payroll.edit", label: "Editar planillas", actions: ["edit"] },
      { key: "payroll.delete", label: "Eliminar planillas", actions: ["delete"] },
      { key: "payroll.approve", label: "Aprobar planillas", actions: ["approve"] },
      { key: "payroll.manage", label: "Gestión completa de planillas", actions: ["all"] },
    ],
    "Contratos": [
      { key: "contracts.view", label: "Ver contratos", actions: ["view"] },
      { key: "contracts.create", label: "Crear contratos", actions: ["create"] },
      { key: "contracts.edit", label: "Editar contratos", actions: ["edit"] },
      { key: "contracts.delete", label: "Eliminar contratos", actions: ["delete"] },
      { key: "contracts.manage", label: "Gestión completa de contratos", actions: ["all"] },
    ],
    "Vacaciones": [
      { key: "vacations.view", label: "Ver solicitudes de vacaciones", actions: ["view"] },
      { key: "vacations.create", label: "Crear solicitudes", actions: ["create"] },
      { key: "vacations.edit", label: "Editar solicitudes", actions: ["edit"] },
      { key: "vacations.delete", label: "Eliminar solicitudes", actions: ["delete"] },
      { key: "vacations.approve", label: "Aprobar/rechazar solicitudes", actions: ["approve"] },
      { key: "vacations.manage", label: "Gestión completa de vacaciones", actions: ["all"] },
    ],
    "Datos Maestros": [
      { key: "sites.view", label: "Ver sedes", actions: ["view"] },
      { key: "sites.create", label: "Crear sedes", actions: ["create"] },
      { key: "sites.edit", label: "Editar sedes", actions: ["edit"] },
      { key: "sites.delete", label: "Eliminar sedes", actions: ["delete"] },
      { key: "sites.manage", label: "Gestión completa de sedes", actions: ["all"] },
      { key: "positions.view", label: "Ver cargos", actions: ["view"] },
      { key: "positions.create", label: "Crear cargos", actions: ["create"] },
      { key: "positions.edit", label: "Editar cargos", actions: ["edit"] },
      { key: "positions.delete", label: "Eliminar cargos", actions: ["delete"] },
      { key: "positions.manage", label: "Gestión completa de cargos", actions: ["all"] },
      { key: "departments.view", label: "Ver departamentos", actions: ["view"] },
      { key: "departments.create", label: "Crear departamentos", actions: ["create"] },
      { key: "departments.edit", label: "Editar departamentos", actions: ["edit"] },
      { key: "departments.delete", label: "Eliminar departamentos", actions: ["delete"] },
      { key: "banks.view", label: "Ver bancos", actions: ["view"] },
      { key: "banks.create", label: "Crear bancos", actions: ["create"] },
      { key: "banks.edit", label: "Editar bancos", actions: ["edit"] },
      { key: "banks.delete", label: "Eliminar bancos", actions: ["delete"] },
    ],
    "Reportes": [
      { key: "reports.view", label: "Ver reportes", actions: ["view"] },
      { key: "reports.export", label: "Exportar reportes", actions: ["export"] },
      { key: "reports.create", label: "Crear reportes personalizados", actions: ["create"] },
    ],
    "Sistema": [
      { key: "system.admin", label: "Administrador del sistema", actions: ["all"] },
      { key: "users.view", label: "Ver usuarios", actions: ["view"] },
      { key: "users.create", label: "Crear usuarios", actions: ["create"] },
      { key: "users.edit", label: "Editar usuarios", actions: ["edit"] },
      { key: "users.delete", label: "Eliminar usuarios", actions: ["delete"] },
      { key: "roles.view", label: "Ver roles", actions: ["view"] },
      { key: "roles.create", label: "Crear roles", actions: ["create"] },
      { key: "roles.edit", label: "Editar roles", actions: ["edit"] },
      { key: "roles.delete", label: "Eliminar roles", actions: ["delete"] },
    ],
  };

  const handleToggle = (permissionKey) => {
    const newPermissions = permissions.includes(permissionKey)
      ? permissions.filter(p => p !== permissionKey)
      : [...permissions, permissionKey];
    onChange(newPermissions);
  };

  const handleGroupToggle = (groupPermissions) => {
    const allSelected = groupPermissions.every(p => permissions.includes(p.key));
    let newPermissions;
    
    if (allSelected) {
      // Deseleccionar todos del grupo
      newPermissions = permissions.filter(p => !groupPermissions.some(gp => gp.key === p));
    } else {
      // Seleccionar todos del grupo
      const keysToAdd = groupPermissions.map(p => p.key).filter(k => !permissions.includes(k));
      newPermissions = [...permissions, ...keysToAdd];
    }
    
    onChange(newPermissions);
  };

  const filteredGroups = Object.entries(permissionGroups).reduce((acc, [groupName, perms]) => {
    const filtered = perms.filter(p => 
      p.label.toLowerCase().includes(searchTerm.toLowerCase()) ||
      groupName.toLowerCase().includes(searchTerm.toLowerCase())
    );
    if (filtered.length > 0) {
      acc[groupName] = filtered;
    }
    return acc;
  }, {});

  return (
    <div className="space-y-6">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
        <Input
          placeholder="Buscar permisos..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="pl-10"
        />
      </div>

      {Object.entries(filteredGroups).map(([groupName, groupPermissions]) => {
        const allSelected = groupPermissions.every(p => permissions.includes(p.key));
        const someSelected = groupPermissions.some(p => permissions.includes(p.key));

        return (
          <Card key={groupName} className="border-0 shadow-md">
            <CardHeader className="border-b bg-slate-50/50 pb-4">
              <div className="flex items-center justify-between">
                <CardTitle className="text-lg font-bold">{groupName}</CardTitle>
                <button
                  onClick={() => handleGroupToggle(groupPermissions)}
                  className={`px-3 py-1 text-xs font-semibold rounded-full transition-colors ${
                    allSelected 
                      ? 'bg-indigo-600 text-white hover:bg-indigo-700'
                      : someSelected
                      ? 'bg-indigo-100 text-indigo-700 hover:bg-indigo-200'
                      : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
                  }`}
                >
                  {allSelected ? 'Deseleccionar todo' : 'Seleccionar todo'}
                </button>
              </div>
            </CardHeader>
            <CardContent className="p-4">
              <div className="grid grid-cols-1 gap-3">
                {groupPermissions.map((permission) => {
                  const isSelected = permissions.includes(permission.key);
                  
                  return (
                    <label
                      key={permission.key}
                      className={`flex items-center justify-between p-3 border rounded-lg cursor-pointer transition-all ${
                        isSelected 
                          ? 'border-indigo-300 bg-indigo-50' 
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggle(permission.key)}
                          className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                        />
                        <div>
                          <p className={`text-sm font-medium ${isSelected ? 'text-indigo-900' : 'text-slate-900'}`}>
                            {permission.label}
                          </p>
                          <p className="text-xs text-slate-500">{permission.key}</p>
                        </div>
                      </div>
                      <div className="flex gap-1">
                        {permission.actions.map(action => (
                          <Badge 
                            key={action}
                            className={`text-xs ${
                              isSelected 
                                ? 'bg-indigo-200 text-indigo-800' 
                                : 'bg-slate-200 text-slate-700'
                            }`}
                          >
                            {action}
                          </Badge>
                        ))}
                      </div>
                    </label>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}