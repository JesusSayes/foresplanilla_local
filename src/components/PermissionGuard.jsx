import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";

export default function PermissionGuard({ employee, requiredRole, children }) {
  const roleHierarchy = {
    "admin": 3,
    "manager": 2,
    "empleado": 1,
  };

  const userRoleLevel = roleHierarchy[employee?.role] || 0;
  const requiredRoleLevel = roleHierarchy[requiredRole] || 0;

  if (userRoleLevel < requiredRoleLevel) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
        <Card className="max-w-md w-full border-0 shadow-xl">
          <CardContent className="p-12 text-center">
            <div className="w-20 h-20 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <ShieldAlert className="w-10 h-10 text-red-600" />
            </div>
            <h2 className="text-2xl font-bold text-slate-900 mb-3">
              Acceso Denegado
            </h2>
            <p className="text-slate-600 mb-2">
              No tienes permisos para acceder a esta sección.
            </p>
            <p className="text-sm text-slate-500">
              Se requiere rol: <strong>{requiredRole}</strong>
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}