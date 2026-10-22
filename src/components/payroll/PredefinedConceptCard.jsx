import React from "react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus } from "lucide-react";

// Tarjeta de un concepto disponible (columna izquierda) con el botón (+) para incorporarlo.
export default function PredefinedConceptCard({ concept, cardClassName, badgeClassName, onAdd }) {
  return (
    <div className={`p-2 border rounded hover:shadow-sm transition-all ${cardClassName}`}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0">
          <h5 className="font-medium text-slate-900 text-xs truncate">{concept.name}</h5>
          {concept.description && (
            <p className="text-xs text-slate-500 mt-0.5 line-clamp-2">{concept.description}</p>
          )}
          {concept.percentage && (
            <Badge className={`text-xs mt-1 ${badgeClassName}`}>{concept.percentage}%</Badge>
          )}
        </div>
        <Button
          size="sm"
          onClick={onAdd}
          className="h-7 w-7 p-0 flex-shrink-0"
        >
          <Plus className="w-3 h-3" />
        </Button>
      </div>
    </div>
  );
}