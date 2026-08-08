'use client'

import { useMemo, useState } from 'react'
import { Clock, Phone, Receipt, Wallet, AlertCircle, Users, UserPlus, Pencil } from 'lucide-react'
import type { Contact } from '@/lib/types/contact'
import { useContacts } from '@/lib/hooks/use-contacts'
import { timeAgo } from '@/lib/time-ago'
import { PageHeader } from '@/components/page-header'
import { AddContactModal } from '@/components/add-contact-modal'
import { EditContactModal } from '@/components/edit-contact-modal'
import { Skeleton } from '@/components/ui/skeleton'
import { cn } from '@/lib/utils'

function CustomerCard({
  contact,
  index,
  onEdit,
}: {
  contact: Contact
  index: number
  onEdit: (c: Contact) => void
}) {
  return (
    <article
      className={cn(
        'animate-assemble group relative flex flex-col gap-3 overflow-hidden rounded-lg border border-border bg-card p-4',
        'transition-all duration-200 hover:-translate-y-1 hover:border-primary/50',
        'hover:shadow-[0_0_0_1px_oklch(0.58_0.22_25/0.4),0_8px_24px_-8px_oklch(0.58_0.22_25/0.5)]',
      )}
      style={{ animationDelay: `${Math.min(index, 20) * 60}ms` }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-metal/50 text-base font-semibold text-foreground ring-1 ring-border">
            {contact.name.charAt(0)}
          </div>
          <div className="min-w-0">
            <h3 className="truncate text-sm font-semibold text-foreground">{contact.name}</h3>
            <p className="flex items-center gap-1 font-mono text-xs text-muted-foreground">
              <Phone className="h-3 w-3" />
              {contact.phone}
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Clock className="h-3.5 w-3.5" />
        Última interacción · {timeAgo(contact.lastMessageAt)}
      </div>

      <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-primary" />
          <div className="leading-tight">
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">
              US$ {contact.totalSpent.toLocaleString('en-US')}
            </p>
            <p className="text-[0.65rem] text-muted-foreground">Gastado</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Receipt className="h-4 w-4 text-foreground/70" />
          <div className="leading-tight">
            <p className="font-mono text-sm font-bold tabular-nums text-foreground">{contact.ordersCount}</p>
            <p className="text-[0.65rem] text-muted-foreground">Pedidos</p>
          </div>
        </div>
      </div>

      <span className="absolute right-3 top-3 rounded-full border border-border bg-secondary px-2 py-0.5 text-[0.6rem] font-medium uppercase tracking-wider text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100">
        {contact.tag}
      </span>

      {/* Edit button — appears on hover */}
      <button
        type="button"
        onClick={() => onEdit(contact)}
        aria-label={`Editar ${contact.name}`}
        className="absolute bottom-3 right-3 flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground opacity-0 transition-all hover:bg-primary/15 hover:text-primary group-hover:opacity-100"
      >
        <Pencil className="h-3.5 w-3.5" />
      </button>
    </article>
  )
}

export function CrmView() {
  const { contacts, source, loading, error, create, update, remove } = useContacts()
  const [query, setQuery] = useState('')
  const [addModalOpen, setAddModalOpen] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (q === '') return contacts
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.phone.includes(q))
  }, [contacts, query])

  return (
    <>
      <PageHeader eyebrow="Libreta de clientes" title="CRM del taller">
        <div className="flex flex-wrap items-center gap-2">
          <span
            className={cn(
              'inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs',
              source === 'chatwoot'
                ? 'border-success/40 bg-success/10 text-success'
                : 'border-border bg-card text-muted-foreground',
            )}
            title={
              source === 'chatwoot'
                ? 'Contactos sincronizados automáticamente desde la API de WhatsApp'
                : 'Esperando por API — configura CHATWOOT_URL, CHATWOOT_API_TOKEN y CHATWOOT_ACCOUNT_ID'
            }
          >
            <span className={cn('h-1.5 w-1.5 rounded-full', source === 'chatwoot' ? 'bg-success' : 'bg-muted-foreground')} />
            {source === 'chatwoot' ? 'Sincronizado con API WhatsApp' : 'Esperando por API'}
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5" />
            {contacts.length} clientes
          </span>
          <button
            type="button"
            onClick={() => setAddModalOpen(true)}
            className="power-glow inline-flex items-center gap-2 rounded-lg bg-primary px-3.5 py-1.5 text-xs font-semibold text-primary-foreground transition-transform active:scale-95"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Agregar contacto
          </button>
        </div>
      </PageHeader>

      <div className="flex flex-col gap-4 px-4 py-5 sm:px-6 lg:px-8">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente por nombre o teléfono…"
          aria-label="Buscar clientes"
          className="h-11 w-full rounded-lg border border-input bg-card px-4 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
        />
      </div>

      {loading && (
        <main className="grid flex-1 auto-rows-min grid-cols-1 content-start gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={i}
              className="count-in flex flex-col gap-3 rounded-lg border border-border bg-card p-4"
              style={{ animationDelay: `${i * 60}ms` }}
            >
              <div className="flex items-center gap-3">
                <Skeleton className="h-12 w-12 rounded-full" />
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3.5 w-2/3" />
                  <Skeleton className="h-3 w-1/2" />
                </div>
              </div>
              <Skeleton className="h-3 w-3/4" />
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                <Skeleton className="h-8 w-full" />
                <Skeleton className="h-8 w-full" />
              </div>
            </div>
          ))}
        </main>
      )}

      {!loading && error && (
        <div className="flex flex-1 flex-col items-center justify-center gap-2 py-24 text-center">
          <AlertCircle className="h-6 w-6 text-primary" />
          <p className="text-sm text-primary">{error}</p>
        </div>
      )}

      {!loading && !error && filtered.length === 0 && (
        <div className="flex flex-1 flex-col items-center justify-center gap-3 py-24 text-center">
          <Users className="h-12 w-12 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {contacts.length === 0
              ? 'Todavía no hay clientes registrados. Agrega el primero para empezar.'
              : 'No se encontraron clientes para tu búsqueda.'}
          </p>
        </div>
      )}

      {!loading && !error && filtered.length > 0 && (
        <main className="grid flex-1 auto-rows-min grid-cols-1 content-start gap-4 px-4 pb-16 sm:grid-cols-2 sm:px-6 lg:grid-cols-3 lg:px-8 xl:grid-cols-4">
          {filtered.map((c, i) => (
            <CustomerCard key={c.id} contact={c} index={i} onEdit={setEditingContact} />
          ))}
        </main>
      )}

      <AddContactModal open={addModalOpen} onClose={() => setAddModalOpen(false)} onSubmit={create} />

      <EditContactModal
        key={editingContact?.id}
        contact={editingContact}
        onClose={() => setEditingContact(null)}
        onUpdate={update}
        onDelete={remove}
      />
    </>
  )
}
