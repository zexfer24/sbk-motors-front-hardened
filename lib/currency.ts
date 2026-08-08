// Conversión Bs -> USD para mostrar en pantalla. Los montos siguen
// guardándose en Bolívares (es lo útil para pasarlos al sistema de
// facturación real, que trabaja en Bs) — esto es solo para visualización.

export function bsToUsd(bs: number, rate: number): number {
  if (!rate) return 0
  return bs / rate
}

// Cashea redondea el monto en divisas a favor del negocio, al décimo de
// dólar más cercano hacia arriba: $99,71 -> $99,80, $76,41 -> $76,50.
export function roundUpToDime(usd: number): number {
  return Math.ceil(usd * 10) / 10
}

export function formatUsd(usd: number): string {
  return `US$ ${usd.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}

export function formatBs(bs: number): string {
  return `Bs ${bs.toLocaleString("es-VE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
}
