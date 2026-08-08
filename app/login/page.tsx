'use client'

import { useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Image from 'next/image'
import { Loader2, LogIn } from 'lucide-react'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(false)

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError(null)
    setLoading(true)
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        setError('Correo o contraseña incorrectos.')
        setLoading(false)
        return
      }
      router.push('/')
      router.refresh()
    } catch {
      setError('No se pudo iniciar sesión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-card p-8 shadow-[0_8px_32px_-8px_oklch(0_0_0/0.5)]">
        <div className="mb-7 flex flex-col items-center gap-3 text-center">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-md ring-1 ring-primary/30">
            <Image src="/sbk-logo.png" alt="Logo de SBK Motors" fill className="object-cover" sizes="48px" />
          </div>
          <div>
            <h1 className="heading-stamp text-xl text-foreground">SBK MOTORS</h1>
            <p className="mt-1 text-xs font-medium uppercase tracking-[0.3em] text-primary">
              Acceso interno
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-semibold text-muted-foreground">
              Correo
            </label>
            <input
              id="email"
              type="email"
              required
              autoComplete="username"
              autoFocus
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="asesor1@sbk.motorcycles"
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-semibold text-muted-foreground">
              Contraseña
            </label>
            <input
              id="password"
              type="password"
              required
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="rounded-lg border border-input bg-background px-3.5 py-2.5 text-sm text-foreground outline-none transition-shadow focus:border-primary/60 focus:ring-2 focus:ring-primary/30"
            />
          </div>

          {error && (
            <p role="alert" className="text-xs text-primary">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="power-glow mt-2 inline-flex items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-transform active:scale-95 disabled:opacity-60"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <LogIn className="h-4 w-4" />}
            {loading ? 'Entrando…' : 'Entrar'}
          </button>
        </form>
      </div>
    </div>
  )
}
