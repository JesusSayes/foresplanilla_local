import React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldAlert } from "lucide-react";
import { usePermissions } from "./hooks/usePermissions";

/**
 * Componente reutilizable que protege páginas completas.
 * Verifica permisos del usuario autenticado antes de renderizar el contenido.
 *
 * Uso:
 *   <PageGuard requiredPermission="payroll.view_all">
 *     <MyPageContent />
 *   </PageGuard>
 *
 *   <PageGuard requiredAnyPermissions={["payroll.view_all", "cost_centers.view"]}>
 *     ...
 *   </PageGuard>
 */
export default function PageGuard({ requiredPermission, requiredAnyPermissions, children }) {
  const { hasPermission, hasAnyPermission, loading } = usePermissions();

  if (loading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-10 h-10 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (requiredPermission && !hasPermission(requiredPermission)) {
    return <AccessDenied />;
  }

  if (requiredAnyPermissions && !hasAnyPermission(requiredAnyPermissions)) {
    return <AccessDenied />;
  }

  return <>{children}</>;
}

function AccessDenied() {
  return (
    <div className="min-h-[60vh] bg-gradient-to-br from-slate-50 via-white to-slate-50 flex items-center justify-center p-6">
      <Card className="max-w-md w-full border-0 shadow-xl">
        <CardContent className="p-10 text-center">
          <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-5">
            <ShieldAlert className="w-8 h-8 text-red-600" />
          </div>
          <h2 className="text-xl font-bold text-slate-900 mb-2">Acceso Denegado</h2>
          <p className="text-sm text-slate-600">
            No tienes permisos para acceder a esta sección.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}