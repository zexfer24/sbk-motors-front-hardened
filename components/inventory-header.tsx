'use client'

import { Boxes } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DataSource } from '@/lib/api/shared'

interface InventoryHeaderProps {
  totalItems: number
  source: DataSource
}

export function InventoryHeader({ totalItems, source }: InventoryHeaderProps) {
  const usingSupabase = source === 'supabase'

  return (
    <header className="flex flex-col gap-5 border-b border-border px-4 py-6 sm:px-6 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-xs font-medium uppercase tracking-[0.3em] text-primary">
            Inventario digital
          </p>
          <h1 className="heading-stamp mt-1 text-2xl text-foreground sm:text-3xl">
            Repuestos & Accesorios
          </h1>
        </div>
        <span
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
            usingSupabase
              ? 'border-success/40 bg-success/10 text-success'
              : 'border-border bg-card text-muted-foreground',
          )}
          title={usingSupabase ? 'Conectado directo a Supabase' : 'Desconectado — configura SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY'}
        >
          <span className={cn('h-1.5 w-1.5 rounded-full', usingSupabase ? 'bg-success' : 'bg-muted-foreground')} />
          {usingSupabase ? 'Sincronizado con Supabase' : 'Desconectado'}
        </span>
      </div>

      <div className="flex items-center gap-3 rounded-lg border border-border bg-card px-4 py-3 shadow-[0_2px_0_0_oklch(0_0_0/0.4)] sm:w-fit">
        <div className="flex h-10 w-10 items-center justify-center rounded-md bg-metal/40 text-foreground">
          <Boxes className="h-5 w-5" />
        </div>
        <div className="leading-tight">
          <p className="font-mono text-2xl font-bold tabular-nums text-foreground">{totalItems}</p>
          <p className="text-xs text-muted-foreground">Artículos totales</p>
        </div>
      </div>
    </header>
  )
}
