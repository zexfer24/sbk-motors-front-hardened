import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Oswald } from 'next/font/google'
import './globals.css'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
})
const oswald = Oswald({
  variable: '--font-heading',
  subsets: ['latin'],
  weight: ['500', '600', '700'],
})

export const metadata: Metadata = {
  title: 'SBK Motors — Inventario',
  description:
    'Inventario digital del taller SBK Motors: repuestos y accesorios de motocicletas, gestionado por WhatsApp.',
  generator: 'v0.app',
}

// La CSP por nonce (ver proxy.ts) exige render dinámico: el nonce cambia en
// cada petición, así que una página prerenderizada en el build no puede
// llevarlo — sus <script> saldrían sin nonce y el navegador los BLOQUEARÍA
// todos, dejando la app sin hidratar (verificado: el formulario de login no
// enviaba nada).
//
// No se pierde nada: este panel está detrás de login y todos sus datos son
// dinámicos, así que no había prerender útil que aprovechar.
export const dynamic = 'force-dynamic'

export const viewport: Viewport = {
  colorScheme: 'dark',
  themeColor: '#1a0d0d',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} bg-background`}
    >
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
