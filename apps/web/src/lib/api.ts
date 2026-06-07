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
    // Determine if we should send the Content-Type header based on whether there's a body
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
    getActive: async (): Promise<Sale> => {
        const raw = await apiFetch<any>('/api/sale/sales/active')
        // Normalize backend shape { active, sale, item } → Sale
        if (raw && raw.sale) {
            return {
                id: raw.sale.id,
                startsAt: raw.sale.startsAt,
                endsAt: raw.sale.endsAt,
                status: raw.active ? 'active' : 'ended',
                item: raw.item ?? undefined,
                remainingQuantity: raw.sale.remainingQty ?? raw.sale.remainingQuantity,
            }
        }
        return raw as Sale
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

    // ── NEW METHOD ──
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
    createItem: (body: { name: string; description: string; priceCents: number; initialQuantity: number }) =>
        apiFetch('/api/admin/admin/items', { method: 'POST', body: JSON.stringify(body) }),
    getItems: () => apiFetch<Item[]>('/api/admin/admin/items'),
    getAvailableItems: () => apiFetch<Item[]>('/api/admin/admin/items/available'),
    createSale: (body: { startsAt: string; endsAt: string }) =>
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
    initialQuantity: number
}

export interface Sale {
    id: string
    startsAt: string
    endsAt: string
    status: 'upcoming' | 'active' | 'ended'
    item?: Item
    remainingQuantity?: number
}

export interface Order {
    id: string
    userId: string
    saleId: string
    createdAt: string
    user?: User
}
