/** @type {import('next').NextConfig} */

// Cabeceras de seguridad estáticas. Antes no se enviaba ninguna: sin
// frame-ancestors el panel era enmarcable (clickjacking) y sin HSTS quedaba
// expuesto a downgrade a HTTP.
//
// La Content-Security-Policy NO está aquí: vive en proxy.ts, porque lleva un
// nonce distinto en cada petición y un valor fijo en la configuración no
// podría generarlo. Definirla en los dos sitios enviaría dos cabeceras y el
// navegador aplicaría la intersección de ambas, que es una forma fácil de
// romper la app sin darse cuenta.
const securityHeaders = [
  // 2 años + preload: solo válido si el dominio se sirve siempre por HTTPS.
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=(), payment=()",
  },
  { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
]

const nextConfig = {
  output: 'standalone',
  devIndicators: false,
  images: {
    unoptimized: true,
  },
  // Las respuestas de /api/* no deben quedar en ninguna caché intermedia:
  // llevan datos de clientes y dependen de la sesión.
  async headers() {
    return [
      { source: '/:path*', headers: securityHeaders },
      {
        source: '/api/:path*',
        headers: [
          { key: 'Cache-Control', value: 'no-store, no-cache, must-revalidate, private' },
        ],
      },
    ]
  },
}

export default nextConfig
