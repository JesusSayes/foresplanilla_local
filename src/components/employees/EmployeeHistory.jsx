import React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Clock, User, Edit, UserPlus, UserCog } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";

export default function EmployeeHistory({ changes, isLoading }) {
  const getChangeIcon = (type) => {
    const icons = {
      "Creación": UserPlus,
      "Actualización": Edit,
      "Cambio de Estado": UserCog,
      "Cambio de Rol": User,
    };
    return icons[type] || Edit;
  };

  const getChangeColor = (type) => {
    const colors = {
      "Creación": "bg-green-100 text-green-700 border-green-200",
      "Actualización": "bg-blue-100 text-blue-700 border-blue-200",
      "Cambio de Estado": "bg-amber-100 text-amber-700 border-amber-200",
      "Cambio de Rol": "bg-purple-100 text-purple-700 border-purple-200",
    };
    return colors[type] || "bg-slate-100 text-slate-700 border-slate-200";
  };

  if (isLoading) {
    return (
      <Card className="border-0 shadow-lg">
        <CardContent className="p-8 text-center">
          <div className="w-8 h-8 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-slate-600 mt-4">Cargando historial...</p>
        </CardContent>
      </Card>
    );
  }

  if (!changes || changes.length === 0) {
    return (
      <Card className="border-0 shadow-lg">
        <CardHeader className="border-b">
          <CardTitle className="text-xl font-bold">Historial de Cambios</CardTitle>
        </CardHeader>
        <CardContent className="p-8 text-center">
          <Clock className="w-12 h-12 text-slate-300 mx-auto mb-3" />
          <p className="text-slate-600">No hay historial de cambios registrados</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-0 shadow-lg">
      <CardHeader className="border-b">
        <CardTitle className="text-xl font-bold">Historial de Cambios</CardTitle>
        <p className="text-sm text-slate-600 mt-1">{changes.length} registros</p>
      </CardHeader>
      <CardContent className="p-6">
        <div className="space-y-4 max-h-[600px] overflow-y-auto">
          {changes.map((change) => {
            const ChangeIcon = getChangeIcon(change.change_type);
            
            return (
              <div key={change.id} className="flex gap-4 pb-4 border-b border-slate-100 last:border-0">
                <div className={`p-2 rounded-lg h-fit ${getChangeColor(change.change_type).split(' ')[0]}`}>
                  <ChangeIcon className="w-5 h-5" />
                </div>
                
                <div className="flex-1">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <Badge className={getChangeColor(change.change_type)}>
                        {change.change_type}
                      </Badge>
                      <p className="font-semibold text-slate-900 mt-1">
                        {change.field_changed}
                      </p>
                    </div>
                    <div className="text-right text-xs text-slate-500">
                      <p>{format(new Date(change.created_date), "dd MMM yyyy", { locale: es })}</p>
                      <p>{format(new Date(change.created_date), "HH:mm", { locale: es })}</p>
                    </div>
                  </div>
                  
                  {change.old_value && change.new_value && (
                    <div className="text-sm bg-slate-50 rounded p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Anterior:</span>
                        <span className="text-red-600 font-medium line-through">{change.old_value}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-slate-500">Nuevo:</span>
                        <span className="text-green-600 font-medium">{change.new_value}</span>
                      </div>
                    </div>
                  )}
                  
                  {change.notes && (
                    <p className="text-sm text-slate-600 mt-2 italic">
                      "{change.notes}"
                    </p>
                  )}
                  
                  <p className="text-xs text-slate-500 mt-2">
                    Modificado por: {change.changed_by}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}