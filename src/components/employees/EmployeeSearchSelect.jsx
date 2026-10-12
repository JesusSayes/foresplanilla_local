import React, { useState } from "react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { Check, ChevronsUpDown, User } from "lucide-react";
import { cn } from "@/lib/utils";

export default function EmployeeSearchSelect({
  employees = [],
  value,
  onValueChange,
  placeholder = "Seleccionar empleado...",
  disabled = false,
  className = "",
}) {
  const [open, setOpen] = useState(false);

  const selected = employees.find((emp) => emp.id === value);
  const label = selected
    ? `${selected.first_name} ${selected.last_name} — ${selected.employee_code || ""}`.trim()
    : "";

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          disabled={disabled}
          className={cn("w-full justify-between font-normal", !selected && "text-muted-foreground", className)}
        >
          <span className="flex items-center gap-2 truncate">
            <User className="h-4 w-4 shrink-0 opacity-50" />
            {selected ? label : placeholder}
          </span>
          <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-[var(--radix-popover-trigger-width)] min-w-[300px] p-0" align="start">
        <Command filter={(_itemValue, search, keywords) => {
          return (keywords || []).join(" ").toLowerCase().includes(search.toLowerCase()) ? 1 : 0;
        }}>
          <CommandInput placeholder="Buscar por nombre o código..." />
          <CommandList>
            <CommandEmpty>No se encontraron empleados.</CommandEmpty>
            <CommandGroup>
              {employees.map((emp) => {
                const empLabel = `${emp.first_name} ${emp.last_name} — ${emp.employee_code || ""}`.trim();
                return (
                  <CommandItem
                    key={emp.id}
                    value={emp.id}
                    keywords={[empLabel]}
                    onSelect={() => {
                      onValueChange(emp.id === value ? "" : emp.id);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-1 h-4 w-4", value === emp.id ? "opacity-100" : "opacity-0")} />
                    {empLabel}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
