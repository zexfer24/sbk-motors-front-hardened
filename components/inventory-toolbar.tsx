'use client'

import { Search } from 'lucide-react'

interface InventoryToolbarProps {
  query: string
  onQueryChange: (value: string) => void
}

export function InventoryToolbar({ query, onQueryChange }: InventoryToolbarProps) {
  return (
    <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
      <div className="relative">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="search"
          value={query}
          onChange={(e) => onQueryChange(e.target.value)}
          placeholder="Buscar por descripción o código…"
          aria-label="Buscar artículos"
          className="h-11 w-full rounded-lg border border-input bg-card pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
        />
      </div>
    </div>
  )
}
