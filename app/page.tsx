'use client'

import { useEffect, useState } from 'react'
import { Sidebar, type View } from '@/components/sidebar'
import { DashboardView } from '@/components/views/dashboard-view'
import { ChatView } from '@/components/views/chat-view'
import { CrmView } from '@/components/views/crm-view'
import { InventoryView } from '@/components/views/inventory-view'
import { OrdersView } from '@/components/views/orders-view'
import { useAuth } from '@/lib/hooks/use-auth'
import { cn } from '@/lib/utils'

const ALL_VIEWS: View[] = ['panel', 'chat', 'clientes', 'inventario', 'ventas']
// Panel y Ventas son solo para dueños/supervisor — los asesores solo
// necesitan Chats, Clientes e Inventario para trabajar.
const ASESOR_VIEWS: View[] = ['chat', 'clientes', 'inventario']

// Cada pestaña se monta la primera vez que se visita y se queda montada
// (oculta con opacidad + pointer-events, no desmontada) para las
// siguientes veces — así cambiar de pestaña es instantáneo y no repite la
// carga de datos ni el parpadeo de "cargando" cada vez. Solo la pestaña
// activa recibe `active`, para que WhatsApp y el Panel (las que hacen
// polling) pausen sus peticiones en segundo plano mientras no se están
// viendo.
export default function Page() {
  const { user, loading, signOut } = useAuth()
  const allowedViews = user?.role === 'admin' ? ALL_VIEWS : ASESOR_VIEWS
  const defaultView: View = user?.role === 'admin' ? 'panel' : 'chat'

  const [view, setView] = useState<View | null>(null)
  const [visited, setVisited] = useState<Set<View>>(new Set())

  // El rol llega async (/api/auth/me) — hasta entonces no sabemos qué
  // pestaña por defecto le corresponde, así que no se elige ninguna todavía.
  useEffect(() => {
    if (!loading && user && view === null) {
      setView(defaultView)
      setVisited(new Set([defaultView]))
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loading, user])

  function handleNavigate(next: View) {
    if (!allowedViews.includes(next)) return
    setVisited((prev) => (prev.has(next) ? prev : new Set(prev).add(next)))
    setView(next)
  }

  if (loading || !user || view === null) {
    return (
      <div className="flex min-h-dvh items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary border-t-transparent" />
      </div>
    )
  }

  return (
    <div className="flex min-h-dvh">
      <Sidebar
        active={view}
        onNavigate={handleNavigate}
        allowedViews={allowedViews}
        userEmail={user.email}
        onSignOut={signOut}
      />

      <div className="relative flex h-dvh min-w-0 flex-1 flex-col">
        {ALL_VIEWS.filter((v) => visited.has(v)).map((v) => {
          const isActive = v === view
          return (
            <div
              key={v}
              className={cn(
                'absolute inset-0 flex flex-col',
                v === 'chat' ? 'overflow-hidden' : 'overflow-y-auto',
                isActive
                  ? // Solo la pestaña que entra se anima — la que sale se
                    // oculta de una vez (sin transición) para que no queden
                    // las dos superpuestas y transparentándose a la vez
                    // ("ghosting") durante el cambio.
                    'z-10 translate-y-0 opacity-100 transition-[opacity,transform] duration-300 ease-[cubic-bezier(0.22,1,0.36,1)]'
                  : 'pointer-events-none z-0 translate-y-1 opacity-0 transition-none',
              )}
              aria-hidden={!isActive}
            >
              {v === 'panel' && <DashboardView active={isActive} />}
              {v === 'chat' && <ChatView active={isActive} />}
              {v === 'clientes' && <CrmView />}
              {v === 'inventario' && <InventoryView />}
              {v === 'ventas' && <OrdersView />}
            </div>
          )
        })}
      </div>
    </div>
  )
}
