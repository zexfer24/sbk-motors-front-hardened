'use client'

// Set fijo de emojis frecuentes en vez de una librería completa (búsqueda,
// categorías, todo el set Unicode) — el proyecto evita sumar dependencias
// nuevas cuando el caso de uso no lo justifica, y para un chat de atención
// al cliente este set cubre lo que se usa de verdad. Mismo patrón visual
// de popover que "Respuestas rápidas" en chat-panel.tsx.
const FREQUENT_EMOJIS = [
  '😀', '😁', '😂', '🤣', '😊', '🙂', '😉', '😍',
  '😘', '😎', '🤔', '😅', '😢', '😭', '😡', '😱',
  '👍', '👎', '👌', '🙏', '👋', '💪', '🤝', '✍️',
  '❤️', '🔥', '⭐', '✅', '❌', '⚠️', '🎉', '💰',
  '🏍️', '🛵', '🔧', '🚚', '📦', '📞', '📸', '⏰',
] as const

export function EmojiPicker({ onSelect }: { onSelect: (emoji: string) => void }) {
  return (
    <div className="grid grid-cols-8 gap-1 p-2" role="menu">
      {FREQUENT_EMOJIS.map((emoji) => (
        <button
          key={emoji}
          type="button"
          role="menuitem"
          onClick={() => onSelect(emoji)}
          className="flex h-8 w-8 items-center justify-center rounded-md text-lg transition-colors hover:bg-secondary"
        >
          {emoji}
        </button>
      ))}
    </div>
  )
}
