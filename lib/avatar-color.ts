const PALETTE = [
  { bg: "oklch(0.55 0.16 250)", fg: "oklch(0.97 0.01 250)" },
  { bg: "oklch(0.6 0.15 200)", fg: "oklch(0.97 0.01 200)" },
  { bg: "oklch(0.62 0.16 150)", fg: "oklch(0.97 0.01 150)" },
  { bg: "oklch(0.68 0.15 95)", fg: "oklch(0.15 0.02 95)" },
  { bg: "oklch(0.62 0.18 330)", fg: "oklch(0.97 0.01 330)" },
  { bg: "oklch(0.58 0.18 300)", fg: "oklch(0.97 0.01 300)" },
  { bg: "oklch(0.6 0.14 170)", fg: "oklch(0.97 0.01 170)" },
  { bg: "oklch(0.65 0.16 60)", fg: "oklch(0.15 0.02 60)" },
] as const

// Simple, stable string hash (djb2) — same seed always maps to the same color.
function hash(seed: string): number {
  let h = 5381
  for (let i = 0; i < seed.length; i++) {
    h = (h * 33) ^ seed.charCodeAt(i)
  }
  return Math.abs(h)
}

export function avatarColor(seed: string): { bg: string; fg: string } {
  return PALETTE[hash(seed) % PALETTE.length]
}
