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

// El taller atiende de 9am a 9pm — la "Actividad por hora" del Panel (y
// las cifras del día que se comparan contra ella, como "Dinero generado
// hoy") se acotan a esta ventana en vez de las 24h del día. Con 24 barras
// el gráfico se desbordaba en pantallas medianas; con 12 (una por hora de
// atención) entra bien y además las cifras dejan de incluir actividad
// fuera de horario.
export const OPERATING_HOUR_START = 9
export const OPERATING_HOUR_END = 21 // exclusivo — cierra a las 9pm

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
