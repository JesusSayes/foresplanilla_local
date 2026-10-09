import React from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Edit, CheckCircle, XCircle, Layers } from "lucide-react";

/**
 * Modal de ejecución masiva para Alertas de Horas Extras.
 * Presenta las tres opciones de procesamiento masivo:
 * Corregir, Aceptar Horas Extras y Descartar.
 */
export default function BulkOvertimeModal({
  open,
  onClose,
  selectedCount,
  onCorregir,
  onAceptarHE,
  onDescartar,
  processing,
}) {
  return (
    <Dialog open={open} onOpenChange={(v) => !processing && onClose(v)}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Layers className="w-5 h-5 text-indigo-600" />
            Ejecución Masiva
          </DialogTitle>
          <DialogDescription>
            Seleccione una acción para aplicar a los{" "}
            <span className="font-semibold text-slate-900">{selectedCount}</span>{" "}
            registro(s) seleccionado(s).
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-3 py-2">
          <Button
            variant="outline"
            onClick={onCorregir}
            disabled={processing}
            className="justify-start h-auto py-3 px-4"
          >
            <Edit className="w-5 h-5 mr-3 shrink-0 text-slate-600" />
            <div className="text-left">
              <div className="font-semibold text-sm">Corregir</div>
              <div className="text-xs text-slate-500 font-normal">
                Abrir edición del primer registro seleccionado
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            onClick={onAceptarHE}
            disabled={processing}
            className="justify-start h-auto py-3 px-4 text-blue-700 border-blue-300 hover:bg-blue-50"
          >
            <CheckCircle className="w-5 h-5 mr-3 shrink-0" />
            <div className="text-left">
              <div className="font-semibold text-sm">Aceptar Horas Extras</div>
              <div className="text-xs text-slate-500 font-normal">
                Autorizar HE en todos los registros seleccionados
              </div>
            </div>
          </Button>

          <Button
            variant="outline"
            onClick={onDescartar}
            disabled={processing}
            className="justify-start h-auto py-3 px-4 text-slate-600"
          >
            <XCircle className="w-5 h-5 mr-3 shrink-0" />
            <div className="text-left">
              <div className="font-semibold text-sm">Descartar</div>
              <div className="text-xs text-slate-500 font-normal">
                Descartar todas las alertas seleccionadas
              </div>
            </div>
          </Button>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onClose(false)} disabled={processing}>
            Cancelar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}