// Normaliza texto para comparaciones que no deben distinguir tildes/diacríticos
// (p. ej. "Jose" debe encontrar "José" en el buscador de conversaciones, ver
// components/chat/conversation-list.tsx). NFD descompone cada carácter
// acentuado en su letra base + un diacrítico combinante aparte (é → e + ´),
// y el rango ̀-ͯ cubre esos diacríticos combinantes en Unicode —
// quitarlos deja solo la letra base.
export function normalizarTexto(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
}
