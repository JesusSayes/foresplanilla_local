import React, { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selector de subdiario contable con búsqueda por código o descripción.
 * Usa el patrón Combobox (Popover + Command). Análogo a CuentaContableSelect.
 */
export default function SubdiarioSelect({ value, onValueChange, subdiarios = [], placeholder = "Seleccione el subdiario" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = subdiarios.find(s => s.codigo === value);

  const filtered = subdiarios.filter(s => {
    const q = search.toLowerCase();
    return !q || String(s.codigo).toLowerCase().includes(q) || (s.descripcion || "").toLowerCase().includes(q) || (s.nombre_breve || "").toLowerCase().includes(q);
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="h-9 w-full justify-between text-sm font-normal"
        >
          <span className={cn("truncate", !selected && "text-muted-foreground")}>
            {selected ? `${selected.codigo} — ${selected.nombre_breve || selected.descripcion}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar por código o descripción..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No se encontraron subdiarios.</CommandEmpty>
            <CommandGroup>
              {filtered.map(s => (
                <CommandItem
                  key={s.id || s.codigo}
                  value={s.codigo}
                  onSelect={() => { onValueChange(s.codigo); setOpen(false); setSearch(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === s.codigo ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs">{s.codigo}</span>
                  <span className="ml-2 truncate text-sm">{s.nombre_breve || s.descripcion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}