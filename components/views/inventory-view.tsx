'use client'

import { AlertCircle, ChevronLeft, ChevronRight, PackageOpen } from 'lucide-react'
import { useInventory } from '@/lib/hooks/use-inventory'
import { useExchangeRate } from '@/lib/hooks/use-exchange-rate'
import { InventoryHeader } from '@/components/inventory-header'
import { InventoryToolbar } from '@/components/inventory-toolbar'
import { InventoryTable } from '@/components/inventory-table'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

export function InventoryView() {
  const { items, source, loading, error, page, setPage, query, search, totalPages, totalCount } =
    useInventory()
  const { rate } = useExchangeRate()

  const hasResults = items.length > 0

  return (
    <>
      <InventoryHeader totalItems={totalCount} source={source} />

      <InventoryToolbar query={query} onQueryChange={search} />

      <main className="flex flex-1 flex-col gap-6 px-4 pb-16 sm:px-6 lg:px-8">
        {loading && (
          <div className="overflow-hidden rounded-lg border border-border bg-card">
            <div className="flex border-b border-border bg-secondary/40 px-4 py-3 sm:px-6">
              {['w-16', 'w-40', 'w-16', 'w-20'].map((w, i) => (
                <Skeleton key={i} className={cn('mr-6 h-3', w)} />
              ))}
            </div>
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="animate-row-assemble flex items-center gap-6 border-b border-border/60 px-4 py-4 last:border-b-0 sm:px-6"
                style={{ animationDelay: `${i * 40}ms` }}
              >
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-3.5 w-32 flex-1 sm:flex-none" />
                <Skeleton className="ml-auto h-3.5 w-12" />
                <Skeleton className="h-3.5 w-14" />
              </div>
            ))}
          </div>
        )}

        {!loading && error && (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
            <AlertCircle className="h-6 w-6 text-primary" />
            <p className="text-sm text-primary">{error}</p>
          </div>
        )}

        {!loading && !error && !hasResults && (
          <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
            <PackageOpen className="h-12 w-12 text-muted-foreground" />
            <p className="text-sm text-muted-foreground">
              {query
                ? 'No se encontraron artículos para tu búsqueda.'
                : 'Todavía no hay artículos en el inventario.'}
            </p>
          </div>
        )}

        {!loading && !error && hasResults && (
          <>
            <InventoryTable items={items} rate={rate} />

            {totalPages > 1 && (
              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Anterior
                </button>
                <span className="font-mono text-xs text-muted-foreground">
                  Página {page} de {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-3 py-2 text-sm text-foreground transition-colors hover:bg-secondary disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Siguiente
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            )}
          </>
        )}
      </main>
    </>
  )
}
