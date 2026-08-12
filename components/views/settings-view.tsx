'use client'

import { Check, Moon, Sun } from 'lucide-react'
import { PageHeader } from '@/components/page-header'
import { useTheme, type ThemeName } from '@/lib/hooks/use-theme'
import { cn } from '@/lib/utils'

// Vista previa en miniatura de cada tema — colores fijos (no las variables
// CSS activas), a propósito: la tarjeta de "Claro" tiene que mostrar claro
// aunque el tema activo ahora mismo sea oscuro, y viceversa. Son los mismos
// valores que app/globals.css define para :root (oscuro) y .light (claro);
// si esos números cambian ahí, hay que actualizar esto también.
const PREVIEWS: Record<ThemeName, { bg: string; panel: string; primary: string; text: string; textMuted: string; border: string }> = {
  dark: {
    bg: 'oklch(0.13 0.008 25)',
    panel: 'oklch(0.18 0.012 25)',
    primary: 'oklch(0.58 0.22 25)',
    text: 'oklch(0.96 0.004 270 / 0.9)',
    textMuted: 'oklch(0.7 0.012 25 / 0.55)',
    border: 'oklch(0.3 0.012 25 / 60%)',
  },
  light: {
    bg: 'oklch(0.97 0.006 25)',
    panel: 'oklch(0.995 0.003 25)',
    primary: 'oklch(0.52 0.2 25)',
    text: 'oklch(0.21 0.014 25 / 0.9)',
    textMuted: 'oklch(0.4 0.014 25 / 0.55)',
    border: 'oklch(0.87 0.012 25 / 70%)',
  },
}

const OPTIONS: { key: ThemeName; label: string; description: string; icon: typeof Sun }[] = [
  {
    key: 'light',
    label: 'Claro',
    description: 'Fondo marfil suave, para ambientes con buena luz.',
    icon: Sun,
  },
  {
    key: 'dark',
    label: 'Oscuro',
    description: 'El de siempre — fondo oscuro, ideal en turnos de noche.',
    icon: Moon,
  },
]

function ThemePreview({ theme }: { theme: ThemeName }) {
  const p = PREVIEWS[theme]
  return (
    <div
      className="flex h-24 w-full overflow-hidden rounded-md border"
      style={{ background: p.bg, borderColor: p.border }}
    >
      <div
        className="flex w-7 shrink-0 flex-col items-center gap-2 border-r py-3"
        style={{ background: p.panel, borderColor: p.border }}
      >
        <span className="h-2.5 w-2.5 rounded-full" style={{ background: p.primary }} />
        <span className="h-1 w-3 rounded-full" style={{ background: p.textMuted }} />
        <span className="h-1 w-3 rounded-full" style={{ background: p.textMuted }} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-3">
        <span className="h-1.5 w-2/3 rounded-full" style={{ background: p.text }} />
        <span className="h-1 w-full rounded-full" style={{ background: p.textMuted }} />
        <span className="h-1 w-4/5 rounded-full" style={{ background: p.textMuted }} />
        <span
          className="mt-auto h-3 w-1/3 rounded"
          style={{ background: p.primary, opacity: 0.9 }}
        />
      </div>
    </div>
  )
}

export function SettingsView() {
  const { theme, setTheme } = useTheme()

  return (
    <>
      <PageHeader eyebrow="Preferencias" title="Ajustes" />

      <main className="flex flex-1 flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
        <section className="max-w-2xl">
          <h2 className="heading-stamp mb-1 text-sm text-muted-foreground">Apariencia</h2>
          <p className="mb-4 text-sm text-muted-foreground">
            Elegí cómo se ve el panel en esta computadora — la preferencia se guarda en este
            navegador.
          </p>

          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {OPTIONS.map((option) => {
              const selected = theme === option.key
              const Icon = option.icon
              return (
                <button
                  key={option.key}
                  type="button"
                  aria-pressed={selected}
                  onClick={() => setTheme(option.key)}
                  className={cn(
                    'group relative flex flex-col gap-3 rounded-lg border bg-card p-3 text-left transition-all',
                    selected
                      ? 'border-primary ring-2 ring-primary/40'
                      : 'border-border hover:border-primary/40',
                  )}
                >
                  {selected && (
                    <span className="absolute right-2.5 top-2.5 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground">
                      <Check className="h-3 w-3" />
                    </span>
                  )}

                  <ThemePreview theme={option.key} />

                  <div className="flex items-center gap-2">
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" strokeWidth={2} />
                    <span className="text-sm font-semibold text-foreground">{option.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground">{option.description}</p>
                </button>
              )
            })}
          </div>
        </section>
      </main>
    </>
  )
}
