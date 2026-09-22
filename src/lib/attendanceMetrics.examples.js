/**
 * Ejemplos validados de cálculo de asistencia.
 *
 * Resultados verificados ejecutando calcEffectiveMetrics y getAdditionalMinutes.
 * Horario base: 09:00–18:00, break 60min, tolerancia 10min.
 * Turno nocturno: 22:00–06:00, break 30min.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  REGLAS DE CÁLCULO (compartidas por tabla, vista previa, Excel e impresión)
 * ════════════════════════════════════════════════════════════════════════
 *
 *  rawWorkedHours      Tiempo real marcado (unión de segmentos COMPLETOS,
 *                      menos refrigerio una vez). No se inventa salida
 *                      para segmentos incompletos (solo entrada → 0h).
 *
 *  ordinaryHours       Tiempo marcado DENTRO del horario (menos refrigerio).
 *
 *  additionalMinutes   Tiempo marcado DESPUÉS de la salida programada
 *                      (post-jornada). Todos los segmentos, cruce de
 *                      medianoche. Independiente de la autorización de HE.
 *                      NO incluye llegada anticipada (pre-shift).
 *
 *  totalWorkedHours    ordinaryHours + horas justificadas aprobadas,
 *                      topado a la jornada neta. Columna "Horas" de la tabla.
 *
 *  remainingLateMinutes  Tardanza neta = entrada real (o justificada, la
 *                         menor) − hora programada de entrada.
 *
 *  HE 25%              Primeras 2h de additionalMinutes (solo si autorizado).
 *  HE 35%              additionalMinutes que excede 2h (solo si autorizado).
 *
 *  Tolerancia          Si remainingLateMinutes ≤ toleranceMinutes → tardanza
 *                      efectiva = 0.
 *
 *  Compensación        Descuenta minutos post-jornada de la tardanza efectiva
 *  de tardanza         y de las HE (primero 25%, luego 35%).
 *
 *  Día libre           Sin horario: horas marcadas = Σ segmentos completos
 *  (sin horario)       menos refrigerio. No se recorta a 09:00–18:00.
 *
 *  Turno nocturno      schedEnd < schedStart: normaliza tiempos al espacio
 *  (cruce medianoche)  del turno [0..fullJornada] para todos los cálculos.
 *
 *  Segmento que cruza   clock_out < clock_in → salida = día siguiente
 *  medianoche          (+1440 min). Aplica a turnos diurnos y nocturnos.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  RESULTADOS VALIDADOS
 * ════════════════════════════════════════════════════════════════════════
 *
 *  Caso                          raw    ord   tot   late   add   just
 *  ──────────────────────────── ───── ───── ───── ────── ────── ─────
 *  1. Jornada normal              8.00  8.00  8.00    0       0     —
 *     09:00–18:00 puntual
 *
 *  2. Llegada anticipada          9.00  8.00  8.00    0       0     —
 *     08:00–18:00 (1h antes)
 *     → El tiempo pre-jornada NO cuenta como HE.
 *
 *  3. Salida tardía sin auth     10.00  8.00  8.00    0     120     —
 *     09:00–20:00 (2h después)
 *     → additionalMinutes=120. HE pagables=0 si no autorizado.
 *
 *  4. Tardanza + salida tardía    9.75  7.75  7.75   15     120     —
 *     09:15–20:00
 *     → Tardanza 15min (>tol 10). HE post-jornada=120min.
 *
 *  5. Varios segmentos            9.00  7.00  7.00    0     120     —
 *     09:00–13:00 + 14:00–20:00
 *     → Unión: 4h+6h=10h menos 1h break = 9h.
 *     → Ordinarias: 4h+4h=8h menos 1h break = 7h.
 *     → Post-jornada: 18:00–20:00 = 120min.
 *
 *  6. Cruce de medianoche          9.00  1.00  2.00  420     480     —
 *     16:00–02:00 (día siguiente)
 *     → Segmento: 10h menos 1h break = 9h.
 *     → Dentro de jornada: 16:00–18:00 = 2h (break no se descuenta
 *       porque coverage < mitad de jornada).
 *     → Tardanza: 16:00−09:00 = 420min.
 *     → Post-jornada: 18:00→02:00 = 480min.
 *
 *  7. Día libre con marcaciones    5.00    —   4.00    0    N/A     —
 *     10:00–15:00 (sin horario)
 *     → 5h marcadas menos 1h break = 4h.
 *
 *  8. Marcación incompleta        0.00  0.00  0.00    0       0     —
 *     Solo entrada 09:00, sin salida
 *     → NO se inventa salida. Horas = 0.
 *     → Tardanza se calcula desde la entrada (0 si es puntual).
 *
 *  9. Justificación aprobada       7.00    —   8.00    0       0   1.00
 *     Entrada 10:00, justificado 09:00–10:00
 *     → 7h marcadas + 1h justificada = 8h. Tardanza cubierta.
 *
 *  10. Compensación de tardanza    8.00  7.67  7.67   20      20     —
 *      09:20–18:20, compensación 20min
 *      → Tardanza base=20min. Compensación=20min → efectiva=0.
 *      → additionalMinutes=20 (post-jornada). Se descuenta de HE.
 *
 *  11. Turno nocturno              7.50  7.50  7.50    0       0     —
 *      22:00–06:00 puntual
 *      → 8h menos 30min break = 7.5h.
 *
 *  12. Nocturno + salida tardía    9.50  7.50  7.50    0     120     —
 *      22:00–08:00 (2h después)
 *      → 10h menos 30min = 9.5h. Post-jornada=120min.
 *
 * ════════════════════════════════════════════════════════════════════════
 *  CONSISTENCIA: tabla, vista previa, Excel e impresión
 * ════════════════════════════════════════════════════════════════════════
 *
 *  - Tabla:        getRowMetrics() → calcEffectiveMetrics() para horas y
 *                  tardanza. HE del registro (con ajustes de compensación).
 *  - Vista previa: calcEditPreview() → calcEffectiveMetrics() +
 *                  getAdditionalMinutes(). Mismas fórmulas que la tabla.
 *  - Excel:        calcEffectiveMetrics() para horas efectivas y marcadas.
 *                  HE del registro con ajustes de compensación.
 *  - Impresión:    getRowMetrics() → calcEffectiveMetrics() para horas y
 *                  tardanza. HE del registro con ajustes de compensación.
 *
 *  Todos usan getSegmentClockTimes() para entrada/salida (todos los
 *  segmentos, primer entrada y última salida).
 */

// Este archivo es documentación de referencia. Los valores fueron verificados
// ejecutando las funciones de src/lib/attendanceMetrics.js.