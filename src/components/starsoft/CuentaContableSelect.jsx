import React, { useState } from "react";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Button } from "@/components/ui/button";
import { ChevronsUpDown, Check } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Selector de cuenta contable con búsqueda por código o descripción.
 * Usa el patrón Combobox (Popover + Command).
 */
export default function CuentaContableSelect({ value, onValueChange, cuentas = [], placeholder = "Seleccione la cuenta contable" }) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");

  const selected = cuentas.find(c => c.cuenta === value);

  const filtered = cuentas.filter(c => {
    const q = search.toLowerCase();
    return !q || String(c.cuenta).toLowerCase().includes(q) || (c.descripcion || "").toLowerCase().includes(q);
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
            {selected ? `${selected.cuenta} — ${selected.descripcion}` : placeholder}
          </span>
          <ChevronsUpDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[340px] p-0" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar por código o descripción..." value={search} onValueChange={setSearch} />
          <CommandList>
            <CommandEmpty>No se encontraron cuentas.</CommandEmpty>
            <CommandGroup>
              {filtered.map(c => (
                <CommandItem
                  key={c.id || c.cuenta}
                  value={c.cuenta}
                  onSelect={() => { onValueChange(c.cuenta); setOpen(false); setSearch(""); }}
                >
                  <Check className={cn("mr-2 h-4 w-4", value === c.cuenta ? "opacity-100" : "opacity-0")} />
                  <span className="font-mono text-xs">{c.cuenta}</span>
                  <span className="ml-2 truncate text-sm">{c.descripcion}</span>
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}