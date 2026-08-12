import type { Metadata, Viewport } from 'next'
import { Geist, Geist_Mono, Oswald } from 'next/font/google'
import { headers } from 'next/headers'
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

// Aplica el tema guardado ANTES del primer paint — si esto corriera después
// (p. ej. en un useEffect de un componente cliente), habría un parpadeo
// visible: un frame en oscuro (el único que existe en el CSS servido) y
// recién después el cambio a claro. Misma clave que lib/hooks/use-theme.ts
// (THEME_KEY = 'sbk:theme') — si se cambia una hay que cambiar la otra.
const THEME_INIT_SCRIPT = `(function(){try{if(localStorage.getItem('sbk:theme')==='light'){document.documentElement.classList.add('light')}}catch(e){}})()`

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  // El nonce no llega en un header propio — proxy.ts lo mete dentro del
  // valor de Content-Security-Policy (ver ese archivo) y confía en que
  // Next.js lo lea de ahí para sus propios <script> de hidratación. Este
  // script SÍ es nuestro, así que hay que sacarle el nonce a mano de la
  // misma cabecera para que la CSP (sin 'unsafe-inline' en script-src) no
  // lo bloquee.
  const cspHeader = (await headers()).get('content-security-policy') ?? ''
  const nonce = cspHeader.match(/'nonce-([a-z0-9]+)'/i)?.[1] ?? ''

  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} ${oswald.variable} bg-background`}
    >
      <head>
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: THEME_INIT_SCRIPT }} />
      </head>
      <body className="font-sans antialiased">
        {children}
      </body>
    </html>
  )
}
