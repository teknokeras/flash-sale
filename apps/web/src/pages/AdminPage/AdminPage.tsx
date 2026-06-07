// AdminPage.tsx
import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { adminApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { s } from './adminStyles'

// Sub-Tab Section Child Components
import SalesTab from './SalesTab'
import ItemsTab from './ItemsTab'
import OrdersTab from './OrdersTab'

export default function AdminPage() {
    const { isLoggedIn, role, login, logout } = useAuth()
    const qc = useQueryClient()
    const [tab, setTab] = useState<'sales' | 'items' | 'orders'>('sales')
    const [selectedSaleId, setSelectedSaleId] = useState<string | null>(null)

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
                            setTab('orders');
                        }}
                    />
                )}
                {tab === 'items' && <ItemsTab qc={qc} />}
                {tab === 'orders' && <OrdersTab selectedSaleId={selectedSaleId} />}
            </div>
        </div>
    )
}