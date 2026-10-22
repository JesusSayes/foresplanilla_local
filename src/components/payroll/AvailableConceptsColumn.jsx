import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search, TrendingUp, TrendingDown, Users, AlertCircle } from "lucide-react";
import PredefinedConceptCard from "@/components/payroll/PredefinedConceptCard";

// Columna "Conceptos Disponibles": búsqueda sobre todos los conceptos predefinidos
// (ingresos, descuentos AFP, otros descuentos, aportaciones y otros) que aún no
// se han incorporado. Los conceptos ya incorporados no se listan.
export default function AvailableConceptsColumn({ predefined = {}, afps = [], configuredNames = [], onAdd }) {
  const [search, setSearch] = useState("");

  const term = search.trim().toLowerCase();
  const matches = (name, extra = "") =>
    !term || `${name || ""} ${extra || ""}`.toLowerCase().includes(term);
  const isIncorporated = (name) => configuredNames.includes(name);

  const available = (category) =>
    (predefined[category] || []).filter(concept =>
      !isIncorporated(concept.name) && matches(concept.name, concept.description)
    );

  const ingresos = available("ingresos");
  const descuentos = available("descuentos");
  const aportaciones = available("aportaciones");
  const otros = available("otros");

  // Filas de AFP: se puede buscar por nombre de AFP o por componente (comisión, aporte, seguro)
  const afpRows = afps
    .map(afp => ({
      afp,
      items: [
        { label: "Comisión", conceptName: "AFP - Comisión", percentage: afp.commission_percentage },
        { label: "Aporte Obligatorio", conceptName: "AFP - Aporte Obligatorio", percentage: afp.obligatory_contribution_percentage },
        { label: "Seguro", conceptName: "AFP - Seguro", percentage: afp.insurance_percentage },
      ].filter(item => matches(item.conceptName, `${afp.name} ${item.label}`)),
    }))
    .filter(entry => entry.items.length > 0);

  const total =
    ingresos.length + descuentos.length + aportaciones.length + otros.length +
    afpRows.reduce((sum, entry) => sum + entry.items.length, 0);

  return (
    <div className="space-y-4">
      <div className="bg-slate-50 p-4 rounded-lg border border-slate-200">
        <h3 className="font-bold text-slate-900 mb-1 flex items-center gap-2">
          <Plus className="w-5 h-5 text-slate-600" />
          Conceptos Disponibles
        </h3>
        <p className="text-xs text-slate-600 mb-4">Haz clic en (+) para incorporar</p>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 w-4 h-4" />
          <Input
            placeholder="Buscar concepto disponible..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 bg-white"
          />
        </div>

        <div className="space-y-4 max-h-[600px] overflow-y-auto pr-2">
          {term && total === 0 && (
            <div className="text-center py-12 text-slate-500">
              <Search className="w-12 h-12 text-slate-300 mx-auto mb-3" />
              <p className="text-sm">No se encontraron conceptos disponibles</p>
              <p className="text-xs mt-1">Revisa los conceptos ya incorporados en la columna derecha</p>
            </div>
          )}

          {/* Ingresos */}
          {ingresos.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-green-700 mb-2 flex items-center gap-2">
                <TrendingUp className="w-4 h-4" />
                Ingresos
              </h4>
              <div className="space-y-2">
                {ingresos.map((concept, idx) => (
                  <PredefinedConceptCard
                    key={idx}
                    concept={concept}
                    cardClassName="bg-white border-slate-200"
                    onAdd={() => onAdd(concept, "ingresos")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Descuentos - AFPs */}
          {(afps.length === 0 || afpRows.length > 0) && (
            <div>
              <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Descuentos AFP
              </h4>
              {afps.length === 0 ? (
                <p className="text-xs text-slate-500 italic p-2">
                  No hay AFPs registradas. Configúralas en Datos Maestros.
                </p>
              ) : (
                <div className="space-y-3">
                  {afpRows.map(({ afp, items }) => (
                    <div key={afp.id} className="p-2 bg-red-50 border border-red-200 rounded">
                      <h5 className="font-semibold text-xs text-slate-900 mb-2">{afp.name}</h5>
                      <div className="space-y-1">
                        {items.map(item => (
                          <div key={item.conceptName} className="flex items-center justify-between p-1 bg-white rounded hover:shadow-sm transition-all">
                            <div className="flex-1">
                              <p className="text-xs font-medium text-slate-800">{item.label}</p>
                              <p className="text-xs text-slate-500">{item.percentage}%</p>
                            </div>
                            <Button
                              size="sm"
                              onClick={() => onAdd({ name: item.conceptName, is_dynamic: true }, "descuentos", afp)}
                              className="h-6 w-6 p-0"
                            >
                              <Plus className="w-3 h-3" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Otros Descuentos */}
          {descuentos.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-red-700 mb-2 flex items-center gap-2">
                <TrendingDown className="w-4 h-4" />
                Otros Descuentos
              </h4>
              <div className="space-y-2">
                {descuentos.map((concept, idx) => (
                  <PredefinedConceptCard
                    key={idx}
                    concept={concept}
                    cardClassName="bg-white border-slate-200"
                    badgeClassName="bg-red-100 text-red-700"
                    onAdd={() => onAdd(concept, "descuentos")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Aportaciones */}
          {aportaciones.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-blue-700 mb-2 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Aportaciones
              </h4>
              <div className="space-y-2">
                {aportaciones.map((concept, idx) => (
                  <PredefinedConceptCard
                    key={idx}
                    concept={concept}
                    cardClassName="bg-blue-50 border-blue-200"
                    badgeClassName="bg-blue-100 text-blue-700"
                    onAdd={() => onAdd(concept, "aportaciones")}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Otros */}
          {otros.length > 0 && (
            <div>
              <h4 className="font-semibold text-sm text-purple-700 mb-2 flex items-center gap-2">
                <AlertCircle className="w-4 h-4" />
                Otros
              </h4>
              <div className="space-y-2">
                {otros.map((concept, idx) => (
                  <PredefinedConceptCard
                    key={idx}
                    concept={concept}
                    cardClassName="bg-white border-slate-200"
                    onAdd={() => onAdd(concept, "ingresos")}
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}