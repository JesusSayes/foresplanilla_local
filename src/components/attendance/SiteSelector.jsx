import React from "react";
import { MapPin } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/**
 * Selector compacto de sede. Se ubica inline dentro del header del módulo.
 * Props:
 * - value: sede seleccionada ("all" | nombre de sede)
 * - onChange: (value) => void
 * - availableSites: array de sites disponibles (filtrados por permisos)
 * - accessibleSites: null (todas) | [] (ninguna) | string[] (específicas)
 * - isSingleSite: boolean (deshabilita el selector si solo hay una sede)
 * - compact: boolean (versión aún más compacta para headers ajustados)
 */
export default function SiteSelector({
  value,
  onChange,
  availableSites = [],
  accessibleSites = null,
  isSingleSite = false,
  compact = false,
}) {
  return (
    <div className={`flex items-center gap-2 ${compact ? "" : "shrink-0"}`}>
      <div className="flex items-center gap-1.5">
        <MapPin className={`${compact ? "w-4 h-4" : "w-5 h-5"} text-indigo-600`} />
        {!compact && (
          <span className="text-sm font-semibold text-slate-700 whitespace-nowrap">
            Sede:
          </span>
        )}
      </div>
      <Select
        value={value}
        onValueChange={onChange}
        disabled={isSingleSite}
      >
        <SelectTrigger className={`${compact ? "w-52 h-9 text-sm" : "w-64"}`}>
          <SelectValue placeholder="Seleccionar sede" />
        </SelectTrigger>
        <SelectContent>
          {accessibleSites === null && (
            <SelectItem value="all">Todas las sedes</SelectItem>
          )}
          {accessibleSites !== null && accessibleSites.length > 1 && (
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
  );
}