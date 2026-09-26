/**
 * Construye las filas de datos para la exportación a Excel de asistencia.
 * Extraído de AttendanceManagement.jsx para reducir el tamaño del componente.
 *
 * Devuelve un array de objetos (uno por empleado) listo para XLSX.utils.json_to_sheet.
 */
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { parseDateLima, dateToStringLima } from "@/lib/dateUtils";
import { calcEffectiveMetrics, getSegmentClockTimes } from "@/lib/attendanceMetrics";

const stMap = ["sunday_start","monday_start","tuesday_start","wednesday_start","thursday_start","friday_start","saturday_start"];
const enMap = ["sunday_end","monday_end","tuesday_end","wednesday_end","thursday_end","friday_end","saturday_end"];

export function buildAttendanceExportRows({
  employees,
  selectedDate,
  freshIncidents,
  approvedVacations,
  getEmployeeScheduleForDate,
  getCompensationAdjustments,
  applyLateTolerance,
  timeStrToExcelFraction,
  hoursDecimalToExcelFraction,
  enableTardinessCompensation,
}) {
  return employees.map(emp => {
    const rowDate = emp.displayDate || dateToStringLima(selectedDate);

    // Horario programado para este empleado y fecha
    const schedForRow = getEmployeeScheduleForDate(emp.id, rowDate);
    const dowForRow = new Date(rowDate + "T00:00:00").getDay();
    const schedStRaw = schedForRow?.[stMap[dowForRow]] || null;
    const schedEnRaw = schedForRow?.[enMap[dowForRow]] || null;
    const isDayOff = schedForRow && (!schedStRaw || !schedEnRaw);
    const horarioProg = !schedForRow
      ? 'Sin horario'
      : isDayOff
        ? 'Día libre'
        : `${schedStRaw}–${schedEnRaw}`;
    const condicionDia = !schedForRow
      ? 'Sin horario programado'
      : isDayOff
        ? 'Día libre'
        : 'Día laborable';

    // Buscar TODOS los incidentes para este empleado y fecha
    const incidentsForRow = freshIncidents.filter(
      i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate
    );
    const incident = incidentsForRow.find(i => i.status === 'Aprobada')
      || incidentsForRow.find(i => i.status === 'Pendiente')
      || incidentsForRow[0]
      || null;

    // Estado real de la marcación: vacaciones > incidente aprobado > status del registro
    const estadoMarcacion = (() => {
      if (emp.record?.status === 'Vacaciones') return 'Vacaciones';
      const isOnVacation = approvedVacations.some(
        v => v.employee_id === emp.id && String(v.start_date).slice(0, 10) <= rowDate && String(v.end_date).slice(0, 10) >= rowDate
      );
      if (isOnVacation) return 'Vacaciones';
      if (incident && incident.status === 'Aprobada') return 'Justificado';
      return emp.record?.status || 'Sin marcar';
    })();

    const dowForRow2 = new Date(rowDate + "T00:00:00").getDay();
    const schedStartEx = schedForRow?.[stMap[dowForRow2]] || "09:00";
    const schedEndEx   = schedForRow?.[enMap[dowForRow2]] || "18:00";
    const isDayOffEx = schedForRow && (!schedForRow[stMap[dowForRow2]] || !schedForRow[enMap[dowForRow2]]);
    const isUnscheduledDayEx = !schedForRow || isDayOffEx;
    const breakMinEx = schedForRow?.break_duration_minutes ?? 60;
    const breakStEx  = schedForRow?.break_start || null;

    const approvedIncsEx = freshIncidents.filter(
      i => i.employee_id === emp.id && String(i.incident_date).slice(0, 10) === rowDate && i.status === 'Aprobada'
    );

    let excelHours, excelLate, excelRawHours = 0;
    if (estadoMarcacion === 'Vacaciones') {
      // Días sin horario programado = 0h
      excelHours = (schedForRow && !isDayOffEx) ? Math.max(0, (
        (parseInt(schedEndEx.split(':')[0]) * 60 + parseInt(schedEndEx.split(':')[1])) -
        (parseInt(schedStartEx.split(':')[0]) * 60 + parseInt(schedStartEx.split(':')[1]))
      ) / 60) : 0;
      excelLate = 0;
    } else {
      const excelMetrics = calcEffectiveMetrics({
        record: emp.record,
        approvedIncidents: approvedIncsEx,
        schedStart: schedStartEx,
        schedEnd: schedEndEx,
        breakMinutes: breakMinEx,
        breakStart: breakStEx,
        isUnscheduledDay: isUnscheduledDayEx,
      });
      excelHours = excelMetrics.totalWorkedHours;
      excelRawHours = excelMetrics.rawWorkedHours;
      excelLate = applyLateTolerance(
        excelMetrics.remainingLateMinutes,
        schedForRow?.tolerance_minutes ?? 10
      );
    }

    // Descontar compensaciones de tardanza
    const compAdjEx = getCompensationAdjustments(emp.id, rowDate);
    if (estadoMarcacion !== 'Vacaciones') {
      const totalCompLateEx = compAdjEx.pendingLateMin + compAdjEx.approvedLateMin;
      const newCompMinEx = enableTardinessCompensation && emp.record?.tardiness_compensation_status === "Activa"
        ? (emp.record.tardiness_compensation_minutes || 0) : 0;
      excelLate = Math.max(0, excelLate - totalCompLateEx - newCompMinEx);
    }

    // Descontar HE pendientes de compensar
    let excelHE25 = emp.record?.overtime_hours_25 ?? 0;
    let excelHE35 = emp.record?.overtime_hours_35 ?? 0;
    if (estadoMarcacion !== 'Vacaciones' && enableTardinessCompensation && emp.record?.tardiness_compensation_status === "Activa") {
      const compHoursEx = (emp.record.tardiness_compensation_minutes || 0) / 60;
      if (compHoursEx > 0 && excelHE25 > 0) {
        const d = Math.min(excelHE25, compHoursEx);
        excelHE25 -= d;
        const rem = compHoursEx - d;
        if (rem > 0 && excelHE35 > 0) excelHE35 -= Math.min(excelHE35, rem);
      } else if (compHoursEx > 0 && excelHE35 > 0) {
        excelHE35 -= Math.min(excelHE35, compHoursEx);
      }
    }
    if (estadoMarcacion !== 'Vacaciones' && compAdjEx.pendingOTHours > 0) {
      let remOTEx = compAdjEx.pendingOTHours;
      if (remOTEx > 0 && excelHE25 > 0) {
        const d = Math.min(excelHE25, remOTEx);
        excelHE25 -= d;
        remOTEx -= d;
      }
      if (remOTEx > 0 && excelHE35 > 0) {
        const d = Math.min(excelHE35, remOTEx);
        excelHE35 -= d;
        remOTEx -= d;
      }
    }

    // Horas justificadas
    let tiempoPapeleta = '';
    if (approvedIncsEx.length > 0) {
      const justMetrics = calcEffectiveMetrics({
        record: null,
        approvedIncidents: approvedIncsEx,
        schedStart: schedStartEx,
        schedEnd: schedEndEx,
        breakMinutes: breakMinEx,
        breakStart: breakStEx,
      });
      tiempoPapeleta = `${justMetrics.totalWorkedHours.toFixed(2)} h`;
    }

    // Para vacaciones: mostrar únicamente el horario programado de la fecha
    const { firstClockIn: rowFirstIn, lastClockOut: rowLastOut } = getSegmentClockTimes(emp.record);
    let entradaExcel = timeStrToExcelFraction(rowFirstIn);
    let salidaExcel  = timeStrToExcelFraction(rowLastOut);
    if (estadoMarcacion === 'Vacaciones') {
      entradaExcel = timeStrToExcelFraction(isUnscheduledDayEx ? null : schedStartEx);
      salidaExcel  = timeStrToExcelFraction(isUnscheduledDayEx ? null : schedEndEx);
    }

    const diaSemana = format(parseDateLima(rowDate), "EEEE", { locale: es });
    const diaSemanaCap = diaSemana.charAt(0).toUpperCase() + diaSemana.slice(1);

    return {
      'Horario Programado': horarioProg,
      'Condición del día': condicionDia,
      'Fecha': rowDate,
      'Día': diaSemanaCap,
      'Tipo Doc': emp.document_type,
      'DNI': emp.document_number,
      'Nombres': emp.first_name,
      'Apellidos': emp.last_name,
      'Cargo': emp.position,
      'Departamento': emp.department_name,
      'Sede': emp.site || 'Sin sede',
      'Entrada': entradaExcel,
      'Salida': salidaExcel,
      'Horas Marcadas': hoursDecimalToExcelFraction(
        estadoMarcacion === 'Vacaciones' ? 0 : excelRawHours
      ),
      'Horas Efectivas (marcadas+justificadas)': hoursDecimalToExcelFraction(excelHours),
      'Tardanza Efectiva (min)': excelLate,
      'HE 25%': hoursDecimalToExcelFraction(excelHE25),
      'HE 35%': hoursDecimalToExcelFraction(excelHE35),
      'Estado Marcación': estadoMarcacion,
      'Tiene Justificación': approvedIncsEx.length > 0 ? 'Sí' : 'No',
      'Tipo Incidente': incident ? incident.incident_type : '',
      'Estado Papeleta': incident ? incident.status : '',
      'Período Justificado': incident
        ? (incident.full_day_justification
            ? `Día completo (${incident.justified_time_start || schedStartEx} - ${incident.justified_time_end || schedEndEx})`
            : `${incident.justified_time_start || ''} - ${incident.justified_time_end || ''}`)
        : '',
      'Horas Justificadas': tiempoPapeleta
        ? hoursDecimalToExcelFraction(parseFloat(tiempoPapeleta))
        : '',
      'Detalle Justificación': incident ? incident.justification : '',
      'Documento Adjunto': incident?.supporting_document_url || '',
      'Revisado por': incident?.reviewed_by || '',
      'Fecha Revisión': incident?.review_date || '',
      'Comentarios Revisión': incident?.review_comments || '',
    };
  });
}