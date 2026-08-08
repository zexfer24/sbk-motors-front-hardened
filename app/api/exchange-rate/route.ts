import { NextResponse } from "next/server"
import { serverError } from "@/lib/api-errors"
import { getRateForDate, getTodayRate } from "@/lib/bcv-rate"
import { caracasToday, isValidDateStr } from "@/lib/caracas-time"

// Único punto de entrada que el navegador conoce para la tasa BCV. Sin
// ?date= devuelve la de hoy (refrescada si el caché está viejo); con
// ?date=YYYY-MM-DD devuelve la de ese día si quedó guardada (para ver el
// historial del Panel).

export async function GET(request: Request) {
  const dateParam = new URL(request.url).searchParams.get("date")

  try {
    if (dateParam && dateParam !== caracasToday()) {
      if (!isValidDateStr(dateParam)) {
        return NextResponse.json({ error: "fecha_invalida" }, { status: 400 })
      }
      const rate = await getRateForDate(dateParam)
      if (!rate) {
        return NextResponse.json({ rate: null, date: dateParam, source: "bcv", available: false })
      }
      return NextResponse.json({ ...rate, available: true })
    }

    const { rate, date, source } = await getTodayRate()
    return NextResponse.json({ rate, date, source, available: true })
  } catch (err) {
    return serverError("error_tasa_bcv", "exchange-rate: tasa BCV", err, 502)
  }
}
