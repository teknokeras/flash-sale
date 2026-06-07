import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi, Sale, Item, Order } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function AdminPage() {
    const { isLoggedIn, role, login, logout } = useAuth()
    const qc = useQueryClient()
    const [tab, setTab] = useState<'sales' | 'items' | 'orders'>('sales')
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

    // ── Admin login ──────────────────────────────────────────────
    const [creds, setCreds] = useState({ email: 'admin@local.dev', password: '' })
    const [loginErr, setLoginErr] = useState<string | null>(null)

    const { mutate: doLogin, isPending: loginPending } = useMutation({
        mutationFn: () => adminApi.login(creds),
        onSuccess: ({ token }) => { login(token, 'admin'); setLoginErr(null) },
        onError: (e: any) => setLoginErr(e.error ?? 'Login failed'),
    })

    if (!isLoggedIn || role !== 'admin') {
        return (
            <div style={s.page}>
                <div style={s.card}>
                    <h1 style={s.title}>Admin Login</h1>
                    <input style={s.input} placeholder="Email" value={creds.email}
                        onChange={e => setCreds(c => ({ ...c, email: e.target.value }))} />
                    <input style={s.input} placeholder="Password" type="password" value={creds.password}
                        onChange={e => setCreds(c => ({ ...c, password: e.target.value }))} />
                    {loginErr && <div style={s.err}>{loginErr}</div>}
                    <button style={s.btn} onClick={() => doLogin()} disabled={loginPending}>
                        {loginPending ? 'Logging in...' : 'Log in'}
                    </button>
                </div>
            </div>
        )
    }

    return (
        <div style={s.adminPage}>
            <div style={s.sidebar}>
                <div style={s.logo}>⚡ Flash Admin</div>
                {(['sales', 'items', 'orders'] as const).map(t => (
                    <button key={t} style={{ ...s.navBtn, ...(tab === t ? s.navActive : {}) }}
                        onClick={() => setTab(t)}>
                        {t.charAt(0).toUpperCase() + t.slice(1)}
                    </button>
                ))}
                <button style={s.logoutBtn} onClick={logout}>Logout</button>
            </div>
            <div style={s.main}>
                {tab === 'sales' && (
                    <SalesTab
                        qc={qc}
                        onSelectSale={(id) => {
                            setSelectedSaleId(id);
                            setTab('orders'); // Jump right to the tab layout seamlessly
                        }}
                    />
                )}
                {tab === 'items' && <ItemsTab qc={qc} />}
                {tab === 'orders' && <OrdersTab selectedSaleId={selectedSaleId} />}
            </div>
        </div>
    )
}

// ── Sales Tab ─────────────────────────────────────────────────

function SalesTab({ qc, onSelectSale }: { qc: any; onSelectSale: (id: string) => void }) {
    const { data: sales = [] } = useQuery({ queryKey: ['admin-sales'], queryFn: adminApi.getSales })
    const { data: items = [] } = useQuery({ queryKey: ['admin-items'], queryFn: adminApi.getItems })

    const [form, setForm] = useState({ title: '', startsAt: '', endsAt: '' })
    const [attachForm, setAttachForm] = useState<{ saleId: string; itemId: string }>({ saleId: '', itemId: '' })
    const [msg, setMsg] = useState<string | null>(null)

    const { mutate: createSale } = useMutation({
        mutationFn: () => adminApi.createSale({
            title: form.title,
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString()
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-sales'] });
            setMsg('Sale created!');
            setForm({ title: '', startsAt: '', endsAt: '' });
        },
        onError: (e: any) => setMsg(e.response?.data?.message ?? e.error ?? 'Error creating sale'),
    })

    const { mutate: attachItem } = useMutation({
        mutationFn: () => adminApi.attachItem(attachForm.saleId, attachForm.itemId),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-sales'] });
            setMsg('Item attached!');
            setAttachForm({ saleId: '', itemId: '' });
        },
        onError: (e: any) => setMsg(e.response?.data?.message ?? e.error ?? 'Error attaching item'),
    })

    // ── Added Deletion Mutation Hook ──
    const { mutate: deleteSale } = useMutation({
        mutationFn: (id: string) => adminApi.deleteSale(id), // Assumes adminApi.deleteSale(id) is wired up
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-sales'] });
            setMsg('Sale deleted successfully.');
        },
        onError: (e: any) => setMsg(e.response?.data?.message ?? e.error ?? 'Error deleting sale'),
    })

    return (
        <div>
            <h2 style={s.h2}>Create Sale</h2>
            <div style={s.formRow}>
                <label style={s.label}>Sale Title</label>
                <input style={s.input} type="text" placeholder="e.g., Summer Flash Sale 2026" value={form.title}
                    onChange={e => setForm(f => ({ ...f, title: e.target.value }))} />
            </div>
            <div style={s.formRow}>
                <label style={s.label}>Start</label>
                <input style={s.input} type="datetime-local" value={form.startsAt}
                    onChange={e => setForm(f => ({ ...f, startsAt: e.target.value }))} />
            </div>
            <div style={s.formRow}>
                <label style={s.label}>End</label>
                <input style={s.input} type="datetime-local" value={form.endsAt}
                    onChange={e => setForm(f => ({ ...f, endsAt: e.target.value }))} />
            </div>
            <button style={s.btn} onClick={() => createSale()}>Create Sale</button>

            <h2 style={{ ...s.h2, marginTop: 32 }}>Attach Item to Sale</h2>
            <div style={s.formRow}>
                <label style={s.label}>Sale</label>
                <select style={s.input} value={attachForm.saleId}
                    onChange={e => setAttachForm(f => ({ ...f, saleId: e.target.value }))}>
                    <option value="">— pick sale —</option>
                    {sales.map((sale: Sale) => (
                        <option key={sale.id} value={sale.id}>
                            {sale.title || sale.id.slice(0, 8)}… ({sale.status})
                        </option>
                    ))}
                </select>
            </div>
            <div style={s.formRow}>
                <label style={s.label}>Item</label>
                <select style={s.input} value={attachForm.itemId}
                    onChange={e => setAttachForm(f => ({ ...f, itemId: e.target.value }))}>
                    <option value="">— pick item —</option>
                    {items.map((item: Item) => (
                        <option key={item.id} value={item.id}>{item.name}</option>
                    ))}
                </select>
            </div>
            <button style={s.btn} onClick={() => attachItem()}>Attach</button>

            {msg && <div style={s.ok}>{msg}</div>}

            <h2 style={{ ...s.h2, marginTop: 32 }}>All Sales</h2>
            <table style={s.table}>
                <thead>
                    <tr>{['Title', 'Status', 'Starts', 'Ends', 'Item', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                    {sales.map((sale: Sale) => {
                        const now = new Date().getTime()
                        const start = new Date(sale.startsAt).getTime()
                        const end = new Date(sale.endsAt).getTime()

                        // Rule: Allowed to delete if it hasn't started yet OR if it has completely ended
                        const isDeletable = now < start || now > end;

                        return (
                            <tr key={sale.id}>
                                <td style={s.td}>{sale.title || sale.id.slice(0, 8)}</td>
                                <td style={s.td}><span style={{ ...s.badge, background: badgeColor(sale.status) }}>{sale.status}</span></td>
                                <td style={s.td}>{new Date(sale.startsAt).toLocaleString()}</td>
                                <td style={s.td}>{new Date(sale.endsAt).toLocaleString()}</td>
                                <td style={s.td}>{(sale as any).item?.name ?? '—'}</td>
                                <td style={{ ...s.td, display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button style={s.linkBtn} onClick={() => onSelectSale(sale.id)}>View orders</button>

                                    {isDeletable ? (
                                        <button
                                            style={s.deleteBtn}
                                            onClick={() => {
                                                if (confirm(`Are you sure you want to delete "${sale.title || sale.id.slice(0, 8)}"?`)) {
                                                    deleteSale(sale.id)
                                                }
                                            }}
                                        >
                                            Delete
                                        </button>
                                    ) : (
                                        <span style={s.disabledText} title="Active sales cannot be deleted">Locked</span>
                                    )}
                                </td>
                            </tr>
                        )
                    })}
                </tbody>
            </table>
        </div>
    )
}

// ── Items Tab ─────────────────────────────────────────────────

function ItemsTab({ qc }: { qc: any }) {
    const { data: items = [] } = useQuery({ queryKey: ['admin-items'], queryFn: adminApi.getItems })
    const [form, setForm] = useState({ name: '', description: '', priceCents: '', initialQuantity: '' })
    const [msg, setMsg] = useState<string | null>(null)

    const { mutate: createItem } = useMutation({
        mutationFn: () => adminApi.createItem({
            ...form,
            priceCents: Number(form.priceCents),
            initialQuantity: Number(form.initialQuantity),
        }),
        onSuccess: () => { qc.invalidateQueries({ queryKey: ['admin-items'] }); setMsg('Item created!') },
        onError: (e: any) => setMsg(e.error ?? 'Error'),
    })

    const field = (key: keyof typeof form, label: string, type = 'text') => (
        <div style={s.formRow} key={key}>
            <label style={s.label}>{label}</label>
            <input style={s.input} type={type} value={form[key]}
                onChange={e => setForm(f => ({ ...f, [key]: e.target.value }))} />
        </div>
    )

    return (
        <div>
            <h2 style={s.h2}>Create Item</h2>
            {field('name', 'Name')}
            {field('description', 'Description')}
            {field('priceCents', 'Price (cents)', 'number')}
            {field('initialQuantity', 'Quantity', 'number')}
            <button style={s.btn} onClick={() => createItem()}>Create Item</button>
            {msg && <div style={s.ok}>{msg}</div>}

            <h2 style={{ ...s.h2, marginTop: 32 }}>All Items</h2>
            <table style={s.table}>
                <thead>
                    <tr>{['Name', 'Description', 'Price', 'Qty'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                    {items.map((item: Item) => (
                        <tr key={item.id}>
                            <td style={s.td}>{item.name}</td>
                            <td style={s.td}>{item.description}</td>
                            <td style={s.td}>${(item.priceCents / 100).toFixed(2)}</td>
                            <td style={s.td}>{item.initialQuantity}</td>
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}

// ── Orders Tab ────────────────────────────────────────────────

function OrdersTab({ selectedSaleId }: { selectedSaleId: string | null }) {
    const { data: sales = [] } = useQuery({ queryKey: ['admin-sales'], queryFn: adminApi.getSales })
    const [saleId, setSaleId] = useState<string>(selectedSaleId ?? '')

    const { data: orders = [], isFetching } = useQuery({
        queryKey: ['admin-orders', saleId],
        queryFn: () => adminApi.getOrders(saleId),
        enabled: !!saleId,
    })

    return (
        <div>
            <h2 style={s.h2}>Orders by Sale</h2>
            <div style={s.formRow}>
                <label style={s.label}>Sale</label>
                <select style={s.input} value={saleId} onChange={e => setSaleId(e.target.value)}>
                    <option value="">— pick sale —</option>
                    {sales.map((sale: Sale) => (
                        <option key={sale.id} value={sale.id}>
                            {sale.title || sale.id.slice(0, 8)}… ({sale.status})
                        </option>
                    ))}
                </select>
            </div>
            {isFetching && <p>Loading...</p>}
            {orders.length > 0 ? (
                <table style={s.table}>
                    <thead>
                        <tr>{['Order ID', 'Buyer', 'Email', 'Placed at'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {orders.map((o: Order) => (
                            <tr key={o.id}>
                                <td style={s.td}>{o.id.slice(0, 8)}…</td>
                                <td style={s.td}>{(o as any).user?.name ?? o.userId.slice(0, 8)}</td>
                                <td style={s.td}>{(o as any).user?.email ?? '—'}</td>
                                <td style={s.td}>{new Date(o.createdAt).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : saleId ? <p style={{ color: '#9ca3af' }}>No orders yet.</p> : null}
        </div>
    )
}

function badgeColor(status: string) {
    return status === 'active' ? '#10b981' : status === 'upcoming' ? '#f59e0b' : '#6b7280'
}

const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 16 },
    card: { background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    adminPage: { display: 'flex', minHeight: '100vh' },
    sidebar: { width: 200, background: '#111827', padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
    logo: { color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 24 },
    main: { flex: 1, padding: 40, background: '#f9fafb', overflowY: 'auto' },
    navBtn: { background: 'transparent', color: '#9ca3af', border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
    navActive: { background: '#374151', color: '#fff' },
    logoutBtn: { marginTop: 'auto', background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', padding: '10px 12px', textAlign: 'left', fontSize: 14 },
    h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
    formRow: { marginBottom: 12 },
    label: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' as const },
    btn: { padding: '10px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 },
    ok: { marginTop: 12, color: '#059669', fontSize: 13 },
    err: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#374151' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111827' },
    badge: { display: 'inline-block', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600 },
    linkBtn: { background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' },
    // ── Added style elements ──
    deleteBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' },
    disabledText: { color: '#9ca3af', fontSize: 14, cursor: 'not-allowed', fontStyle: 'italic' }
}