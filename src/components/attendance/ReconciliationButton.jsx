import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ClipboardCheck } from "lucide-react";
import ReconciliationModal from "@/components/attendance/ReconciliationModal";

/**
 * Acceso a la vista previa de regularización de asistencia (tardanzas
 * inconsistentes e inasistencias detectadas).
 */
export default function ReconciliationButton({ accessibleEmployeeIds = null }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button variant="outline" className="whitespace-nowrap" onClick={() => setOpen(true)}>
        <ClipboardCheck className="w-4 h-4 mr-2" />
        Regularizar asistencia
      </Button>
      {open && (
        <ReconciliationModal
          onClose={() => setOpen(false)}
          accessibleEmployeeIds={accessibleEmployeeIds}
        />
      )}
    </>
  );
}