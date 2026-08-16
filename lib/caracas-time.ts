// ============================================================================
// Límites de "día" en horario de Venezuela (America/Caracas), para el Panel
// y la tasa BCV. Caracas es UTC-4 fijo, sin horario de verano — por eso el
// offset se puede resolver a mano en vez de tirar de una librería nueva.
// ============================================================================

const CARACAS_UTC_OFFSET_HOURS = 4

export function caracasDateStr(date: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Caracas",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date)
}

export function shiftDateStr(dateStr: string, days: number): string {
  const d = new Date(`${dateStr}T00:00:00.000Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}

export function caracasToday(): string {
  return caracasDateStr()
}

export function caracasYesterday(): string {
  return shiftDateStr(caracasToday(), -1)
}

/** YYYY-MM-DD, valida contra inyección de formato antes de usarlo en una query. */
export function isValidDateStr(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T00:00:00.000Z`).getTime())
}

/** "jueves, 6 de agosto de 2026" — para mostrar la fecha que el Panel está resumiendo. */
export function caracasFormatLong(dateStr: string): string {
  const formatted = new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T12:00:00.000Z`))
  return formatted.charAt(0).toUpperCase() + formatted.slice(1)
}

/** Rango [startUtc, endUtc) en ISO UTC que cubre el día `dateStr` (YYYY-MM-DD) en Caracas. */
export function caracasDayBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const offset = `${String(CARACAS_UTC_OFFSET_HOURS).padStart(2, "0")}:00:00.000`
  return {
    startUtc: `${dateStr}T${offset}Z`,
    endUtc: `${shiftDateStr(dateStr, 1)}T${offset}Z`,
  }
}

/** "10 de agosto de 2026" — como caracasFormatLong pero sin día de la semana, para separadores de fecha compactos (chat). */
export function caracasFormatShort(dateStr: string): string {
  return new Intl.DateTimeFormat("es-VE", {
    timeZone: "America/Caracas",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(new Date(`${dateStr}T12:00:00.000Z`))
}

/** Hora local (0-23) en Caracas de un timestamp ISO. */
export function caracasHourFromIso(iso: string): number {
  return Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: "America/Caracas",
      hour: "2-digit",
      hour12: false,
    }).format(new Date(iso)),
  ) % 24
}

// Rango de horas que cubre "Actividad por hora" del Panel — las 24h del
// día completo. Antes se acotaba a 9am-9pm (horario de atención) para que
// el gráfico de 12 barras no se desbordara en pantallas medianas; ahora que
// vuelve a ser de 24, BarChartPanel oculta la mitad de las etiquetas del
// eje en pantallas chicas para no amontonarlas (el tooltip por barra sigue
// mostrando la hora exacta igual). Esto NO afecta "Dinero generado hoy" ni
// el resto de las cifras del día del KPI — esas usan caracasDayBoundsUtc
// (el día completo), nunca este rango.
export const OPERATING_HOUR_START = 0
export const OPERATING_HOUR_END = 24 // exclusivo

/** Rango [startUtc, endUtc) en ISO UTC que cubre el horario de atención del día `dateStr` en Caracas. */
export function caracasOperatingHoursBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  const base = new Date(`${dateStr}T00:00:00.000Z`)
  const start = new Date(base)
  start.setUTCHours(OPERATING_HOUR_START + CARACAS_UTC_OFFSET_HOURS)
  const end = new Date(base)
  end.setUTCHours(OPERATING_HOUR_END + CARACAS_UTC_OFFSET_HOURS)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}

/** Índice (0-11) dentro de la ventana de atención para un timestamp ISO, o null si cae fuera de horario. */
export function caracasOperatingHourIndex(iso: string): number | null {
  const hour = caracasHourFromIso(iso)
  if (hour < OPERATING_HOUR_START || hour >= OPERATING_HOUR_END) return null
  return hour - OPERATING_HOUR_START
}

// Horario laboral REAL del negocio (confirmado con el cliente,
// 2026-08-13): lunes a sábado 8:30am-7:30pm, domingo 9:00am-4:30pm.
// Deliberadamente SEPARADO de OPERATING_HOUR_START/END de arriba — esa
// constante cubre las 24h del día completo, para el gráfico "Actividad por
// hora" del Panel, sin relación con cuándo el negocio abre de verdad. Esto
// es para lib/chatwoot-agent-stats.ts (tiempo muerto), que si necesita
// saber cuándo el negocio realmente está operando.
interface WorkHoursWindow {
  startHour: number
  startMinute: number
  endHour: number
  endMinute: number
}

const WORK_HOURS_MON_SAT: WorkHoursWindow = { startHour: 8, startMinute: 30, endHour: 19, endMinute: 30 }
const WORK_HOURS_SUN: WorkHoursWindow = { startHour: 9, startMinute: 0, endHour: 16, endMinute: 30 }

/** Rango [startUtc, endUtc) en ISO UTC del horario laboral real del día `dateStr` (YYYY-MM-DD) en Caracas. */
export function caracasWorkHoursBoundsUtc(dateStr: string): { startUtc: string; endUtc: string } {
  // Día de la semana del propio dateStr (0=domingo..6=sábado) — no depende
  // de zona horaria: dateStr ya es una fecha-calendario de Caracas (sale de
  // caracasDateStr/caracasToday/shiftDateStr), así que parsearla a
  // medianoche UTC no la corre a otro día.
  const dayOfWeek = new Date(`${dateStr}T00:00:00.000Z`).getUTCDay()
  const window = dayOfWeek === 0 ? WORK_HOURS_SUN : WORK_HOURS_MON_SAT

  const start = new Date(`${dateStr}T00:00:00.000Z`)
  start.setUTCHours(window.startHour + CARACAS_UTC_OFFSET_HOURS, window.startMinute)
  const end = new Date(`${dateStr}T00:00:00.000Z`)
  end.setUTCHours(window.endHour + CARACAS_UTC_OFFSET_HOURS, window.endMinute)
  return { startUtc: start.toISOString(), endUtc: end.toISOString() }
}
