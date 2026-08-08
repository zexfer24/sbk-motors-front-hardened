// ============================================================================
// Tipos de dominio · Contactos (CRM)
// Ver db/contacts_schema.sql + db/contacts_crm_fields_migration.sql.
// ============================================================================

export type Contact = {
  id: string
  phone: string
  name: string
  lastMessage: string | null
  lastMessageAt: string | null
  unreadCount: number
  totalSpent: number
  ordersCount: number
  tag: string
  createdAt: string
  updatedAt: string
}

export type NewContact = {
  phone: string
  name: string
  tag: string
}
