import React, { useState, useRef, useEffect } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Search, X, ChevronDown } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { entitiesAPI } from "@/api/entitiesClient";

export default function UbigeoSelect({ value, onChange, label, placeholder = "Buscar ubigeo..." }) {
  const [open, setOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const ref = useRef(null);

  const { data: ubigeos = [] } = useQuery({
    queryKey: ["ubigeos"],
    queryFn: () => entitiesAPI.Ubigeo.list("departamento"),
  });

  useEffect(() => {
    const handleClick = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  // Formato SUNAT: "DEPARTAMENTO-PROVINCIA-DISTRITO"
  const getDisplayLabel = (ubigeo) => {
    if (!ubigeo) return "";
    return `${ubigeo.departamento}-${ubigeo.provincia}-${ubigeo.distrito}`;
  };

  const selectedUbigeo = ubigeos.find(u => {
    const label = getDisplayLabel(u);
    return label === value || u.codigo_ubigeo === value;
  });

  const displayValue = selectedUbigeo ? getDisplayLabel(selectedUbigeo) : value || "";

  const filtered = ubigeos.filter(u => {
    if (!searchTerm) return true;
    const s = searchTerm.toLowerCase();
    const label = getDisplayLabel(u).toLowerCase();
    const code = (u.codigo_ubigeo || "").toLowerCase();
    return label.includes(s) || code.includes(s);
  }).slice(0, 100); // limit results for performance

  const handleSelect = (ubigeo) => {
    onChange(getDisplayLabel(ubigeo));
    setSearchTerm("");
    setOpen(false);
  };

  const handleClear = (e) => {
    e.stopPropagation();
    onChange("");
    setSearchTerm("");
  };

  return (
    <div>
      {label && <Label className="text-sm font-medium">{label}</Label>}
      <div className="relative mt-1" ref={ref}>
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          className="w-full flex items-center justify-between px-3 py-2 border border-input bg-white rounded-md text-sm shadow-sm hover:bg-slate-50 focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <span className={displayValue ? "text-slate-900" : "text-slate-400"}>
            {displayValue || placeholder}
          </span>
          <div className="flex items-center gap-1 shrink-0">
            {displayValue && (
              <span
                role="button"
                tabIndex={0}
                className="p-0.5 rounded hover:bg-slate-200 text-slate-400 hover:text-red-500"
                onClick={handleClear}
              >
                <X className="w-3.5 h-3.5" />
              </span>
            )}
            <ChevronDown className="w-4 h-4 text-slate-400" />
          </div>
        </button>

        {open && (
          <div className="absolute z-[200] w-full mt-1 bg-white border border-slate-200 rounded-md shadow-lg flex flex-col max-h-72">
            <div className="p-2 border-b shrink-0">
              <div className="relative">
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                <Input
                  autoFocus
                  placeholder="Buscar por departamento, provincia, distrito o código..."
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                  className="pl-8 h-8 text-sm"
                  onClick={e => e.stopPropagation()}
                  onKeyDown={e => e.stopPropagation()}
                />
              </div>
            </div>
            <div className="overflow-y-auto flex-1">
              {filtered.length === 0 ? (
                <p className="text-sm text-slate-400 text-center py-4">Sin resultados</p>
              ) : (
                filtered.map((u, i) => {
                  const label = getDisplayLabel(u);
                  const code = u.codigo_ubigeo || "";
                  const isSelected = label === displayValue;
                  return (
                    <button
                      key={`${code}-${i}`}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-indigo-50 transition-colors flex items-center justify-between gap-2 ${isSelected ? "bg-indigo-50 font-semibold text-indigo-800" : "text-slate-800"}`}
                      onClick={() => handleSelect(u)}
                    >
                      <span>{label}</span>
                      {code && <span className="text-xs text-slate-400 font-mono shrink-0">{code}</span>}
                    </button>
                  );
                })
              )}
              {!searchTerm && ubigeos.length > 100 && (
                <p className="text-xs text-slate-400 text-center py-2">Escribe para buscar entre {ubigeos.length} ubigeos</p>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
