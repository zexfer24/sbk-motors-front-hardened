"use client"

import { useCallback, useEffect, useState } from "react"

export type Role = "admin" | "asesor"

export interface AuthUser {
  email: string
  role: Role
  chatwootAgentId: number | null
}

// Quién está logueado, según /api/auth/me — el middleware ya garantiza que
// solo se llega a esta página con sesión válida, así que esto solo existe
// para que el front sepa el rol (qué pestañas mostrar).
export function useAuth() {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let cancelled = false
    fetch("/api/auth/me", { cache: "no-store" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        if (!cancelled) setUser(data)
      })
      .catch(() => {
        if (!cancelled) setUser(null)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const signOut = useCallback(async () => {
    await fetch("/api/auth/logout", { method: "POST" }).catch(() => {})
    window.location.href = "/login"
  }, [])

  return { user, loading, signOut }
}
