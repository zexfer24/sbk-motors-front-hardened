'use client'

import { useState } from 'react'
import Image from 'next/image'
import {
  Boxes,
  LayoutGrid,
  LogOut,
  MessageCircle,
  Receipt,
  Users,
  type LucideIcon,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { motion } from 'framer-motion'

export type View = 'panel' | 'chat' | 'clientes' | 'inventario' | 'ventas'

interface NavItem {
  id: View
  icon: LucideIcon
  label: string
}

const navItems: NavItem[] = [
  { id: 'panel', icon: LayoutGrid, label: 'Panel' },
  { id: 'chat', icon: MessageCircle, label: 'WhatsApp' },
  { id: 'clientes', icon: Users, label: 'Clientes' },
  { id: 'inventario', icon: Boxes, label: 'Inventario' },
  { id: 'ventas', icon: Receipt, label: 'Ventas' },
]

interface SidebarProps {
  active: View
  onNavigate: (view: View) => void
  /** Pestañas visibles para el rol de quien inició sesión — el resto ni se renderiza. */
  allowedViews: View[]
  userEmail: string
  onSignOut: () => void
}

export function Sidebar({ active, onNavigate, allowedViews, userEmail, onSignOut }: SidebarProps) {
  const [hoveredId, setHoveredId] = useState<View | null>(null)
  const visibleNavItems = navItems.filter((item) => allowedViews.includes(item.id))

  return (
    <aside
      className={cn(
        'sticky top-0 z-30 flex h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar',
        'w-16 lg:w-60',
      )}
    >
      <div className="flex h-20 items-center gap-3 border-b border-sidebar-border px-3 lg:px-5">
        <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded-md ring-1 ring-primary/30">
          <Image
            src="/sbk-logo.png"
            alt="Logo de SBK Motors"
            fill
            className="object-cover"
            sizes="40px"
          />
        </div>
        <div className="hidden flex-col leading-none lg:flex">
          <span className="heading-stamp text-lg text-foreground">SBK</span>
          <span className="text-[0.65rem] font-medium tracking-[0.3em] text-primary">
            MOTORS
          </span>
        </div>
      </div>

      <nav 
        className="flex flex-1 flex-col gap-1 p-2 lg:p-3"
        onMouseLeave={() => setHoveredId(null)}
      >
        {visibleNavItems.map((item) => {
          const Icon = item.icon
          const isActive = item.id === active
          const isHovered = item.id === hoveredId
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => onNavigate(item.id)}
              onMouseEnter={() => setHoveredId(item.id)}
              aria-current={isActive ? 'page' : undefined}
              title={item.label}
              className={cn(
                'group relative flex items-center gap-3 rounded-md px-3 py-3 text-sm font-medium transition-colors outline-none',
                'justify-center lg:justify-start',
                isActive
                  ? 'text-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {/* Hover highlight background (CryptoSea style) */}
              {isHovered && (
                <motion.div
                  layoutId="hoverNavBackground"
                  transition={{ type: 'spring', stiffness: 450, damping: 32 }}
                  className="absolute inset-0 -z-10 rounded-md bg-sidebar-accent/50"
                />
              )}

              {/* Active selection background pill (CryptoSea style) */}
              {isActive && (
                <motion.div
                  layoutId="activeNavBackground"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="absolute inset-0 -z-10 rounded-md bg-primary/10 border border-primary/20 shadow-[inset_0_1px_1px_rgba(255,255,255,0.05)]"
                />
              )}

              {/* Red left-side active indicator */}
              {isActive && (
                <motion.span 
                  layoutId="activeNavIndicator"
                  transition={{ type: 'spring', stiffness: 380, damping: 28 }}
                  className="absolute left-0 top-1/2 h-6 w-1 -translate-y-1/2 rounded-r-full bg-primary shadow-[0_0_12px_oklch(0.58_0.22_25/0.8)]" 
                />
              )}

              <Icon
                className={cn(
                  'h-5 w-5 shrink-0 transition-transform duration-200',
                  isHovered && 'scale-110',
                )}
                strokeWidth={2}
              />
              <span className="hidden lg:inline">{item.label}</span>
            </button>
          )
        })}
      </nav>

      <div className="border-t border-sidebar-border p-2 lg:p-3">
        <div
          title={userEmail}
          className="hidden items-center gap-2 truncate px-3 pb-2 text-xs text-muted-foreground lg:flex"
        >
          <span className="truncate">{userEmail}</span>
        </div>

        <button
          type="button"
          onClick={onSignOut}
          title="Cerrar sesión"
          className="flex w-full items-center justify-center gap-3 rounded-md px-3 py-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-foreground lg:justify-start"
        >
          <LogOut className="h-5 w-5 shrink-0" strokeWidth={2} />
          <span className="hidden lg:inline">Cerrar sesión</span>
        </button>
      </div>
    </aside>
  )
}
