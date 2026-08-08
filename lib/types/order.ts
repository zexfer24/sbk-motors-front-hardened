export type PaymentMethod = "pago_movil" | "zelle" | "efectivo" | "cashea" | "otro"

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  efectivo: "Efectivo",
  cashea: "Cashea",
  otro: "Otro",
}

export type OrderItem = {
  sku: string
  name: string
  price: number
  quantity: number
}

export type OrderStatus = "pendiente" | "confirmado" | "devuelto"

export const ORDER_STATUS_LABELS: Record<OrderStatus, string> = {
  pendiente: "Pendiente",
  confirmado: "Confirmado",
  devuelto: "Devolución",
}

export type OrderDb = {
  id: string
  conversationId: string
  advisorName: string
  customerName: string
  customerPhone: string
  /** Solo dígitos, sin "V-"/"E-" ni puntos — ej. "30610150" */
  customerCedula: string | null
  state: string
  city: string
  address: string
  paymentMethod: PaymentMethod
  paymentMethodOther: string | null
  shippingInfo: string
  captureUrl: string | null
  items: OrderItem[]
  /** Solo Cashea: número de orden que da Cashea al procesar la compra */
  casheaOrderNumber: string | null
  /** Solo Cashea: precio real del producto (USD), redondeado hacia arriba a favor del negocio */
  casheaTotalUsd: number | null
  /** Solo Cashea: lo que el cliente pagó de inicial (USD) — es lo mismo que totalUsd de la orden */
  casheaInitialUsd: number | null
  /** Bolívares — precio nativo, tal como se cerró la venta (o el equivalente de la inicial si es Cashea) */
  totalBs: number
  /** tasa BCV vigente el día que se cerró la venta — null en ventas registradas antes de este campo */
  exchangeRate: number | null
  /** congelado con exchangeRate — no cambia si la tasa de hoy es distinta */
  totalUsd: number
  status: OrderStatus
  createdAt: string
}

export type NewOrderDb = Omit<
  OrderDb,
  "id" | "createdAt" | "totalBs" | "exchangeRate" | "totalUsd" | "status"
>
