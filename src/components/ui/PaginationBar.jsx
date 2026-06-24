import React from "react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

/**
 * Reusable pagination bar.
 * Props: currentPage, totalItems, pageSize, onPageChange, onPageSizeChange (optional)
 */
/**
 * inline=true → sin borde superior ni margen superior, para usar dentro de la fila de filtros (ml-auto)
 */
export default function PaginationBar({ currentPage, totalItems, pageSize = 20, onPageChange, onPageSizeChange, inline = false }) {
  const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
  const from = totalItems === 0 ? 0 : (currentPage - 1) * pageSize + 1;
  const to = Math.min(currentPage * pageSize, totalItems);

  const wrapper = inline
    ? "flex items-center gap-2"
    : "flex items-center justify-between gap-4 mt-4 pt-4 border-t border-slate-100";

  return (
    <div className={wrapper}>
      <span className="text-sm text-slate-500 whitespace-nowrap">
        {totalItems === 0 ? "Sin registros" : `${from}–${to} de ${totalItems}`}
      </span>
      <div className="flex items-center gap-1">
        {onPageSizeChange && (
          <Select value={String(pageSize)} onValueChange={(v) => { onPageSizeChange(Number(v)); onPageChange(1); }}>
            <SelectTrigger className="w-20 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[10, 20, 50, 100].map(n => (
                <SelectItem key={n} value={String(n)}>{n} / pág.</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Button size="sm" variant="outline" className="h-8 px-3" disabled={currentPage === 1} onClick={() => onPageChange(1)}>«</Button>
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={currentPage === 1} onClick={() => onPageChange(currentPage - 1)}>‹</Button>
        <span className="text-sm text-slate-600 px-2 whitespace-nowrap">{currentPage} / {totalPages}</span>
        <Button size="sm" variant="outline" className="h-8 px-2" disabled={currentPage >= totalPages} onClick={() => onPageChange(currentPage + 1)}>›</Button>
        <Button size="sm" variant="outline" className="h-8 px-3" disabled={currentPage >= totalPages} onClick={() => onPageChange(totalPages)}>»</Button>
      </div>
    </div>
  );
}