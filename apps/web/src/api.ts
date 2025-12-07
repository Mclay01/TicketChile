// apps/web/src/api.ts

export const API_BASE_URL =
  import.meta.env.DEV ? '/api' : import.meta.env.VITE_API_BASE_URL ?? '/api';

// ----------- Tipos -----------

export type UserRole = 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

export interface EventTicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  capacity: number;
  perUserLimit: number | null;
  salesStartDateTime: string | null;
  salesEndDateTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface EventOrganizer {
  id: string;
  name: string;
}

export interface Event {
  id: string;
  organizerId: string;
  organizer: EventOrganizer;
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startDateTime: string;
  endDateTime: string;
  status?: 'DRAFT' | 'PUBLISHED' | 'CANCELLED';
  totalCapacity?: number | null;
  ticketTypes: EventTicketType[];
  createdAt?: string;
  updatedAt?: string;
}

export interface MyTicketOrderEvent {
  id: string;
  title: string;
  startDateTime: string;
  venueName: string;
  venueAddress: string;
}

export interface MyTicketOrder {
  id: string;
  createdAt: string;
  event: MyTicketOrderEvent;
}

export interface MyTicketTicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  capacity: number;
  perUserLimit: number | null;
  salesStartDateTime: string | null;
  salesEndDateTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface MyTicket {
  id: string;
  orderId: string;
  ticketTypeId: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string;
  code: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  usedAt: string | null;
  createdAt: string;
  updatedAt: string;
  order: MyTicketOrder;
  ticketType: MyTicketTicketType;
}

export type CheckInStatus = 'OK' | 'ALREADY_USED' | 'NOT_FOUND' | 'INVALID';

export interface CheckInTicketEvent {
  id: string;
  title: string;
  startDateTime: string;
  venueName: string;
  venueAddress: string;
}

export interface CheckInTicketOrderUser {
  id: string;
  name: string;
  email: string;
}

export interface CheckInTicketOrder {
  id: string;
  createdAt: string;
  user: CheckInTicketOrderUser;
  event: CheckInTicketEvent;
}

export interface CheckInTicketTicketType {
  id: string;
  eventId: string;
  name: string;
  description: string | null;
  priceCents: number;
  currency: string;
  capacity: number;
  perUserLimit: number | null;
  salesStartDateTime: string | null;
  salesEndDateTime: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CheckInTicket {
  id: string;
  orderId: string;
  ticketTypeId: string;
  eventId: string;
  attendeeName: string;
  attendeeEmail: string;
  code: string;
  status: 'VALID' | 'USED' | 'CANCELLED';
  usedAt: string | null;
  createdAt: string;
  updatedAt: string;
  ticketType: CheckInTicketTicketType;
  order: CheckInTicketOrder;
}

export interface CheckInResponse {
  status: CheckInStatus;
  ticket?: CheckInTicket;
}

// ---------- Helpers internos ----------

async function handleJsonResponse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (res.status === 403) throw new Error('FORBIDDEN');

    let body: any = null;
    try {
      body = await res.json();
    } catch {
      // ignoramos error al parsear
    }

    const msg =
      (body && (body.error || body.message)) ||
      `HTTP ${res.status} ${res.statusText}`;
    throw new Error(msg);
  }

  return (await res.json()) as T;
}

// ---------- Helper de fallback (no tocar) ----------

async function fetchWithFallback(urls: string[], init?: RequestInit) {
  let lastErr: any = null;
  for (const url of urls) {
    try {
      const res = await fetch(url, init);
      if (res.ok) {
        return await handleJsonResponse<any>(res);
      }
      if (res.status === 404) {
        lastErr = new Error(`Not found: ${url}`);
        continue;
      }
      return await handleJsonResponse<any>(res);
    } catch (err) {
      lastErr = err;
      continue;
    }
  }
  throw lastErr ?? new Error('All fallback urls failed');
}

// ---------- Endpoints -----------

export async function fetchEvents(): Promise<Event[]> {
  const res = await fetch(`${API_BASE_URL}/events`, { method: 'GET' });
  const data = await handleJsonResponse<{ events: Event[] }>(res);
  return data.events;
}

export async function login(email: string, password: string): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });

  const data = await handleJsonResponse<{ token: string }>(res);
  return data.token;
}

export interface CreateOrderItemInput {
  ticketTypeId: string;
  quantity: number;
}

export interface CreateOrderInput {
  eventId: string;
  items: CreateOrderItemInput[];
}

export async function createOrder(
  token: string,
  input: CreateOrderInput,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/orders`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  await handleJsonResponse<{ order: unknown }>(res);
}

/* ---- COMPRA PÚBLICA ---- */

export interface PublicCreateOrderItemInput {
  ticketTypeId: string;
  quantity: number;
}

export interface PublicCreateOrderInput {
  eventId: string;
  buyerName: string;
  buyerEmail: string;
  items: PublicCreateOrderItemInput[];
}

export async function createPublicOrder(
  input: PublicCreateOrderInput,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/public/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });

  await handleJsonResponse<{ orderId: string }>(res);
}

export async function fetchMyTickets(token: string): Promise<MyTicket[]> {
  const urls = [
    `${API_BASE_URL}/orders/my-tickets`,
    `${API_BASE_URL}/orders/my`,
    `${API_BASE_URL}/orders/mine`,
  ];

  const data = await fetchWithFallback(urls, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (data.tickets) return data.tickets as MyTicket[];
  if (Array.isArray(data)) return data as MyTicket[];
  return [];
}

export async function scanTicket(
  token: string,
  code: string,
): Promise<CheckInResponse> {
  const res = await fetch(`${API_BASE_URL}/checkins/scan`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ code }),
  });

  return await handleJsonResponse<CheckInResponse>(res);
}

export interface CreateEventTicketTypeInput {
  name: string;
  description?: string;
  priceCents: number;
  currency: string;
  capacity: number;
}

export interface CreateEventInput {
  title: string;
  description: string;
  venueName: string;
  venueAddress: string;
  startDateTime: string;
  endDateTime: string;
  totalCapacity: number;
  ticketTypes: CreateEventTicketTypeInput[];
}

export async function createEvent(
  token: string,
  input: CreateEventInput,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/events`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(input),
  });

  await handleJsonResponse<{ event: Event }>(res);
}

export async function fetchOrganizerTickets(token: string): Promise<any[]> {
  const urls = [
    `${API_BASE_URL}/orders/organizer-tickets`,
    `${API_BASE_URL}/orders/organizer`,
    `${API_BASE_URL}/orders/organizer/tickets`,
  ];

  const data = await fetchWithFallback(urls, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (data.tickets) return data.tickets as any[];
  if (Array.isArray(data)) return data;
  return [];
}

export async function deleteEventApi(
  token: string,
  eventId: string,
): Promise<void> {
  const res = await fetch(`${API_BASE_URL}/events/${eventId}`, {
    method: 'DELETE',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!res.ok) {
    if (res.status === 401) throw new Error('UNAUTHORIZED');
    if (res.status === 403) throw new Error('FORBIDDEN');

    let body: any = null;
    try {
      body = await res.json();
    } catch {}

    const msg =
      (body && (body.error || body.message)) ||
      `HTTP ${res.status} ${res.statusText}`;

    throw new Error(msg);
  }
}

/* ============================================================
   ✅ NUEVO: CREAR SESIÓN DE PAGO (Flow/Stripe)
   ============================================================ */

/* ============================================================
   ✅ CREAR SESIÓN DE PAGO
   ============================================================ */

export interface CreateCheckoutSessionInput {
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: {
    buyerName?: string;
    buyerEmail?: string;
    mode?: 'PUBLIC' | 'PRIVATE';
    eventId?: string;
    ticketTypeId?: string;
    quantity?: string;
  };
}

export interface CreateCheckoutSessionResponse {
  checkoutUrl: string;
}

export async function createCheckoutSession(
  input: CreateCheckoutSessionInput,
): Promise<string> {
  const res = await fetch(`${API_BASE_URL}/payments/checkout-session`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(input),
  });

  const data = await handleJsonResponse<CreateCheckoutSessionResponse>(res);
  return data.checkoutUrl;
}

