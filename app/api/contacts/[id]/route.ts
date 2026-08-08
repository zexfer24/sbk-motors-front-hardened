import { NextResponse } from 'next/server'
import { updateContact, deleteContact } from '@/lib/api/contacts-demo-store'

type RouteContext = { params: Promise<{ id: string }> }

// ── PATCH /api/contacts/[id] ─────────────────────────────────────────────────
export async function PATCH(request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id_requerido' }, { status: 400 })

  const body = await request.json().catch(() => null)
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'cuerpo_invalido' }, { status: 400 })
  }

  const { name, phone, tag } = body as Record<string, unknown>

  const patch: Record<string, unknown> = {}

  if (name !== undefined) {
    if (typeof name !== 'string' || name.trim().length === 0)
      return NextResponse.json({ error: 'nombre_invalido' }, { status: 400 })
    patch.name = name.trim()
  }
  if (phone !== undefined) {
    if (typeof phone !== 'string' || phone.trim().length === 0)
      return NextResponse.json({ error: 'telefono_invalido' }, { status: 400 })
    patch.phone = phone.trim()
  }
  if (tag !== undefined) {
    if (typeof tag !== 'string' || tag.trim().length === 0)
      return NextResponse.json({ error: 'etiqueta_invalida' }, { status: 400 })
    patch.tag = tag.trim()
  }

  const result = updateContact(id, patch as Parameters<typeof updateContact>[1])
  if ('error' in result) {
    const status = result.error === 'no_encontrado' ? 404 : 409
    return NextResponse.json({ error: result.error }, { status })
  }
  return NextResponse.json(result.contact)
}

// ── DELETE /api/contacts/[id] ────────────────────────────────────────────────
export async function DELETE(_request: Request, { params }: RouteContext) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'id_requerido' }, { status: 400 })

  const result = deleteContact(id)
  if ('error' in result)
    return NextResponse.json({ error: result.error }, { status: 404 })
  return NextResponse.json(result)
}
