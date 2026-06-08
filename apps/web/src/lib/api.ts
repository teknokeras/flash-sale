const localStorageMock = (() => {
    let store: Record<string, string> = {}
    return {
        getItem: (key: string) => store[key] ?? null,
        setItem: (key: string, value: string) => { store[key] = value },
        removeItem: (key: string) => { delete store[key] },
        clear: () => { store = {} },
    }
})()

Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    writable: true,
})

const TOKEN_KEY = 'flash_token'
const ROLE_KEY = 'flash_role'

export function getToken() {
    return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string, role: 'buyer' | 'admin') {
    localStorage.setItem(TOKEN_KEY, token)
    localStorage.setItem(ROLE_KEY, role)
}

export function clearToken() {
    localStorage.removeItem(TOKEN_KEY)
    localStorage.removeItem(ROLE_KEY)
}

export function getRole(): 'buyer' | 'admin' | null {
    return localStorage.getItem(ROLE_KEY) as 'buyer' | 'admin' | null
}

function authHeaders(): HeadersInit {
    const token = getToken()
    return token ? { Authorization: `Bearer ${token}` } : {}
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
    const hasBody = init && init.body;

    const res = await fetch(url, {
        ...init,
        headers: {
            ...(hasBody ? { 'Content-Type': 'application/json' } : {}),
            ...authHeaders(),
            ...init?.headers,
        },
    })

    const data = await res.json()
    if (!res.ok) throw { status: res.status, ...data }
    return data as T
}

// ── Sale Service ─────────────────────────────────────────────

export const saleApi = {
    getActive: async (): Promise<any> => { // Changed to any to support both active and scheduled states
        const raw = await apiFetch<any>('/api/sale/sales/active');

        if (raw.active && raw.sale) {
            return {
                active: true,
                sale: {
                    id: raw.sale.id,
                    title: raw.sale.title || 'Flash Sale Event',
                    specialPrice: raw.sale.priceCents ?? 0,
                    initialQuantity: raw.sale.initialQuantity ?? 0,
                    startsAt: raw.sale.startsAt,
                    endsAt: raw.sale.endsAt,
                    status: 'active',
                    item: raw.item ?? undefined,
                    remainingQuantity: raw.sale.remainingQty ?? 0,
                }
            };
        }

        // Handle the scheduled case
        return {
            active: false,
            nextSale: raw.nextSale ? {
                id: raw.nextSale.id,
                title: raw.nextSale.title,
                startsAt: raw.nextSale.startsAt,
                endsAt: raw.nextSale.endsAt,
                status: raw.nextSale.status
            } : null
        };
    },
    getSale: (id: string) => apiFetch<Sale>(`/api/sale/sales/${id}`),
    register: (body: { email: string; password: string; name: string }) =>
        apiFetch<{ token: string; user: User }>('/api/sale/auth/register', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    login: (body: { email: string; password: string }) =>
        apiFetch<{ token: string; user: User }>('/api/sale/auth/login', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
}

// ── Purchase Service ─────────────────────────────────────────

export const purchaseApi = {
    buy: (saleId: string) => apiFetch<{ status: string; message: string }>('/api/purchase', {
        method: 'POST',
        body: JSON.stringify({ saleId }),
    }),
    getMyPurchases: () => apiFetch<Array<{
        orderId: string;
        status: string;
        createdAt: string;
        saleId: string;
        saleTitle: string | null;
        itemName: string;
        priceCents: number;
    }>>('/api/purchase/mine'),
};

// ── Admin Service ─────────────────────────────────────────────

export const adminApi = {
    login: (body: { email: string; password: string }) =>
        apiFetch<{ token: string }>('/api/admin/auth/login', {
            method: 'POST',
            body: JSON.stringify(body),
        }),
    createItem: (body: { name: string; description: string; priceCents: number; imageUrls?: string[] }) =>
        apiFetch('/api/admin/admin/items', { method: 'POST', body: JSON.stringify(body) }),
    getItems: () => apiFetch<Item[]>('/api/admin/admin/items'),
    getAvailableItems: () => apiFetch<Item[]>('/api/admin/admin/items/available'),
    createSale: (body: { title: string; specialPrice: number; initialQuantity: number; startsAt: string; endsAt: string }) =>
        apiFetch('/api/admin/admin/sales', { method: 'POST', body: JSON.stringify(body) }),
    getSales: () => apiFetch<Sale[]>('/api/admin/admin/sales'),
    updateSale: (id: string, body: object) =>
        apiFetch(`/api/admin/admin/sales/${id}`, { method: 'PUT', body: JSON.stringify(body) }),
    attachItem: (saleId: string, itemId: string) =>
        apiFetch(`/api/admin/admin/sales/${saleId}/item`, {
            method: 'PUT',
            body: JSON.stringify({ itemId }),
        }),
    getOrders: (saleId: string) => apiFetch<Order[]>(`/api/admin/admin/sales/${saleId}/orders`),
    deleteSale: (id: string) =>
        apiFetch<{ success: boolean; message: string }>(`/api/admin/admin/sales/${id}`, {
            method: 'DELETE'
        }),
}

// ── Types ─────────────────────────────────────────────────────

export interface User {
    id: string
    email: string
    name: string
}

export interface Item {
    id: string
    name: string
    description: string
    priceCents: number
    imageUrls?: string[]
}

export interface Sale {
    id: string
    title: string
    specialPrice: number
    initialQuantity: number
    startsAt: string
    endsAt: string
    status: 'draft' | 'scheduled' | 'upcoming' | 'active' | 'ended' | 'cancelled'
    item?: Item
    remainingQuantity?: number
}

// 💡 Fixed: Restructured properties to cleanly match the flat object layout returned from sales.ts
export interface Order {
    orderId: string
    status: string
    createdAt: string
    userId: string
    userName: string
    userEmail: string
    saleId?: string
    saleTitle?: string
}