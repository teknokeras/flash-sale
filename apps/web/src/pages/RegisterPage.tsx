import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { useNavigate, Link } from 'react-router-dom'
import { saleApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'

export default function RegisterPage() {
    const { login } = useAuth()
    const nav = useNavigate()
    const [form, setForm] = useState({ name: '', email: '', password: '' })
    const [err, setErr] = useState<string | null>(null)

    const { mutate, isPending } = useMutation({
        mutationFn: () => saleApi.register(form),
        onSuccess: ({ token }) => {
            login(token, 'buyer')
            nav('/')
        },
        onError: (e: any) => setErr(e.error ?? 'Registration failed'),
    })

    return (
        <div style={s.page}>
            <div style={s.card}>
                <h1 style={s.title}>Create account</h1>
                <input style={s.input} placeholder="Name" value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                <input style={s.input} placeholder="Email" type="email" value={form.email}
                    onChange={e => setForm(f => ({ ...f, email: e.target.value }))} />
                <input style={s.input} placeholder="Password (8+ chars)" type="password" value={form.password}
                    onChange={e => setForm(f => ({ ...f, password: e.target.value }))} />
                {err && <div style={s.err}>{err}</div>}
                <button style={s.btn} onClick={() => { setErr(null); mutate() }} disabled={isPending}>
                    {isPending ? 'Creating...' : 'Register'}
                </button>
                <p style={s.hint}>Already have an account? <Link to="/login">Log in</Link></p>
            </div>
        </div>
    )
}

const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 16 },
    card: { background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    input: { display: 'block', width: '100%', padding: '12px', marginBottom: 12, border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 15, boxSizing: 'border-box' },
    btn: { width: '100%', padding: 14, background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer', marginTop: 4 },
    err: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
    hint: { textAlign: 'center', fontSize: 13, marginTop: 16, color: '#6b7280' },
}
