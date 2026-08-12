'use client'

import { useEffect, useState } from 'react'

export type ThemeName = 'light' | 'dark'

// Misma clave que THEME_INIT_SCRIPT en app/layout.tsx — si se cambia acá
// hay que cambiar la de allá también.
const THEME_KEY = 'sbk:theme'

// El tema real ya lo aplicó el script anti-flash de layout.tsx antes de
// hidratar (agrega o no la clase `.light` al <html>) — este hook lee esa
// clase para arrancar el estado ya sincronizado, en vez de volver a leer
// localStorage por su cuenta y arriesgarse a una fuente de verdad distinta.
export function useTheme() {
  const [theme, setThemeState] = useState<ThemeName>('dark')

  useEffect(() => {
    setThemeState(document.documentElement.classList.contains('light') ? 'light' : 'dark')
  }, [])

  function setTheme(next: ThemeName) {
    setThemeState(next)
    document.documentElement.classList.toggle('light', next === 'light')
    try {
      localStorage.setItem(THEME_KEY, next)
    } catch {
      // localStorage deshabilitado — el cambio de tema aplica igual, solo que no persiste entre sesiones.
    }
  }

  return { theme, setTheme }
}
