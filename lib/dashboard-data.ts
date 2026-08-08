// Mock data for the SBK Motors chat and CRM views.
//
// Nota: los KPIs y la actividad por hora del Panel ("Panel del día") ahora
// salen de datos reales — ver lib/hooks/use-dashboard.ts,
// app/api/dashboard/kpis/route.ts y app/api/dashboard/hourly/route.ts.

// ---------------------------------------------------------------------------
// Live chat
// ---------------------------------------------------------------------------

export type Sender = 'customer' | 'ai' | 'human'

export interface ChatMessage {
  id: string
  sender: Sender
  text: string
  time: string
  status?: 'sent' | 'delivered' | 'read'
}

export interface Conversation {
  id: string
  name: string
  phone: string
  lastMessage: string
  time: string
  unread: number
  handledBy: 'ai' | 'human'
  online?: boolean
  typing?: boolean
  messages: ChatMessage[]
}

export const conversations: Conversation[] = [
  {
    id: 'c1',
    name: 'Marco Salinas',
    phone: '+58 412 555 1023',
    lastMessage: '¿Tienen pastillas para una Pulsar NS200?',
    time: '14:32',
    unread: 2,
    handledBy: 'ai',
    online: true,
    typing: true,
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        text: 'Hola, buenas tardes. Necesito repuestos para mi moto.',
        time: '14:28',
      },
      {
        id: 'm2',
        sender: 'ai',
        text: '¡Hola Marco! Bienvenido a SBK Motors. Con gusto te ayudo. ¿Qué modelo de moto tienes y qué repuesto buscas?',
        time: '14:29',
        status: 'read',
      },
      {
        id: 'm3',
        sender: 'customer',
        text: 'Es una Bajaj Pulsar NS200.',
        time: '14:30',
      },
      {
        id: 'm4',
        sender: 'customer',
        text: '¿Tienen pastillas para una Pulsar NS200?',
        time: '14:32',
      },
      {
        id: 'm5',
        sender: 'ai',
        text: 'Sí, tenemos pastillas sinterizadas compatibles (SKU FRN-PST-SNT) a US$ 28.90. Quedan 3 en stock. ¿Deseas reservarlas?',
        time: '14:32',
        status: 'delivered',
      },
    ],
  },
  {
    id: 'c2',
    name: 'Lucía Fernández',
    phone: '+58 414 778 2210',
    lastMessage: 'Perfecto, paso mañana a recoger el casco.',
    time: '13:54',
    unread: 0,
    handledBy: 'human',
    online: false,
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        text: 'Quería confirmar si llegó el casco integral que pedí.',
        time: '13:40',
      },
      {
        id: 'm2',
        sender: 'ai',
        text: 'Déjame verificar con el equipo del taller, un momento por favor.',
        time: '13:41',
        status: 'read',
      },
      {
        id: 'm3',
        sender: 'human',
        text: 'Hola Lucía, soy Diego del taller. Tu casco fibra talla M ya está disponible para recojo.',
        time: '13:50',
        status: 'read',
      },
      {
        id: 'm4',
        sender: 'customer',
        text: 'Perfecto, paso mañana a recoger el casco.',
        time: '13:54',
      },
    ],
  },
  {
    id: 'c3',
    name: 'Renzo Quispe',
    phone: '+58 424 331 8890',
    lastMessage: 'Gracias por la cotización 🙌',
    time: '12:10',
    unread: 0,
    handledBy: 'ai',
    online: true,
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        text: 'Buenas, cuánto cuesta una cadena DID 520?',
        time: '12:05',
      },
      {
        id: 'm2',
        sender: 'ai',
        text: 'La cadena DID 520 X-Ring cuesta US$ 64.00 e incluye garantía de 6 meses.',
        time: '12:06',
        status: 'read',
      },
      {
        id: 'm3',
        sender: 'customer',
        text: 'Gracias por la cotización 🙌',
        time: '12:10',
      },
    ],
  },
  {
    id: 'c4',
    name: 'Andrea Ríos',
    phone: '+58 416 220 4471',
    lastMessage: '¿Hacen envíos a Maracaibo?',
    time: '11:47',
    unread: 1,
    handledBy: 'ai',
    online: false,
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        text: '¿Hacen envíos a Maracaibo?',
        time: '11:47',
      },
      {
        id: 'm2',
        sender: 'ai',
        text: 'Sí, enviamos a todo el país por Zoom y MRW. El costo depende del destino y peso.',
        time: '11:47',
        status: 'delivered',
      },
    ],
  },
  {
    id: 'c5',
    name: 'Taller El Rápido',
    phone: '+58 426 909 1188',
    lastMessage: 'Necesito 10 kits de juntas al por mayor.',
    time: '10:22',
    unread: 0,
    handledBy: 'human',
    online: true,
    messages: [
      {
        id: 'm1',
        sender: 'customer',
        text: 'Necesito 10 kits de juntas al por mayor.',
        time: '10:22',
      },
      {
        id: 'm2',
        sender: 'human',
        text: 'Claro, te preparo una cotización mayorista con descuento por volumen.',
        time: '10:25',
        status: 'read',
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// ---------------------------------------------------------------------------
// Nota: los clientes de ejemplo (CRM) que vivían aquí ahora están en
// db/contacts_schema.sql (Supabase real) y en
// lib/api/contacts-demo-store.ts (modo demo). CrmView ya no usa datos mock
// locales — lee de Supabase directo o del store demo, a través de
// useContacts().
// ---------------------------------------------------------------------------
