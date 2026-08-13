export type PaymentMethod = "pago_movil" | "zelle" | "efectivo" | "cashea" | "otro" | "transferencia"

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  pago_movil: "Pago Móvil",
  zelle: "Zelle",
  efectivo: "Efectivo",
  cashea: "Cashea",
  otro: "Otro",
  transferencia: "Transferencia",
}

// Métodos elegibles para ventas NUEVAS — "Efectivo" y "Otro" se retiraron
// del selector de Cerrar venta. Se quedan en PaymentMethod/LABELS de arriba
// para que las ventas viejas con esos métodos se sigan mostrando bien en
// Ventas; simplemente ya no son una opción al cerrar una venta nueva.
export const SELECTABLE_PAYMENT_METHODS: PaymentMethod[] = ["pago_movil", "zelle", "cashea", "transferencia"]

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

/** El asesor solicita, el admin ejecuta (ver app/api/orders/[id]/request/route.ts) — null = sin solicitud pendiente. */
export type OrderPendingRequest = "devolucion" | "confirmacion" | null

export type OrderDb = {
  id: string
  conversationId: string
  advisorName: string
  /** Sesión de quien cerró la venta — null en ventas creadas antes de esta columna. Ver db/orders_schema.sql. */
  advisorEmail: string | null
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
  /** Código de rastreo del paquete (opcional) */
  trackingNumber: string | null
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
  pendingRequest: OrderPendingRequest
  pendingRequestBy: string | null
  pendingRequestAt: string | null
  /** Borrado lógico — nunca se elimina la fila físicamente, ver order_events. */
  deletedAt: string | null
  createdAt: string
}

export type NewOrderDb = Omit<
  OrderDb,
  | "id"
  | "createdAt"
  | "totalBs"
  | "exchangeRate"
  | "totalUsd"
  | "status"
  | "advisorEmail"
  | "pendingRequest"
  | "pendingRequestBy"
  | "pendingRequestAt"
  | "deletedAt"
>

export type OrderEventType =
  | "cierre"
  | "solicitud_devolucion"
  | "solicitud_confirmacion"
  | "devolucion_ejecutada"
  | "confirmacion_ejecutada"
  | "eliminada"

export interface OrderEvent {
  id: string
  orderId: string
  eventType: OrderEventType
  actorEmail: string
  actorName: string
  note: string | null
  createdAt: string
}
