import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { saleApi, purchaseApi, Sale } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCountdown } from '../hooks/useCountdown'
import { useState } from 'react'

export default function SalePage() {
    const userData = useAuth();
    const { isLoggedIn, role, logout } = userData;
    const qc = useQueryClient()

    // 1. Fetch data
    const { data: response, isLoading, error } = useQuery({
        queryKey: ['active-sale'],
        queryFn: saleApi.getActive,
        refetchInterval: 3000,
        retry: false,
    })

    // 2. Normalize: response is { active: boolean, sale?: Sale, nextSale?: Sale }
    const isActive = response?.active;
    const sale: Sale | undefined = response?.active ? response.sale : response?.nextSale;
    const status = isActive ? 'active' : (sale ? 'upcoming' : 'ended');

    // 3. Countdown targets
    const targetDate = sale ? (isActive ? sale.endsAt : sale.startsAt) : null;
    const countdown = useCountdown(targetDate);

    const [purchaseMsg, setPurchaseMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null)

    const { mutate: buy, isPending } = useMutation({
        mutationFn: () => purchaseApi.buy(sale!.id),
        onSuccess: () => {
            setPurchaseMsg({ type: 'ok', text: '🎉 Reserved! Processing your order...' })
            qc.invalidateQueries({ queryKey: ['active-sale'] })
        },
        onError: (err: any) => {
            const map: Record<string, string> = {
                SaleNotActive: '⏱ Sale is not active.',
                AlreadyPurchased: '✅ You already bought this.',
                SoldOut: '😢 Sold out!',
            }
            setPurchaseMsg({ type: 'err', text: map[err.code] ?? err.error ?? 'Something went wrong.' })
        },
    })

    const showTopPanel = !isLoggedIn || role === 'buyer'
    const buttonText = isLoggedIn ? 'My Purchase' : 'Login'
    const buttonHref = isLoggedIn ? '/my-purchase' : '/login'
    const statusText = isLoggedIn ? 'Shopping Mode Active' : 'Guest Mode'

    if (isLoading) return <div style={s.center}>Loading sale...</div>

    if (error || !sale) {
        return (
            <div style={s.layout}>
                {showTopPanel && <TopPanel {...{ showTopPanel, buttonHref, buttonText, isLoggedIn, logout, statusText }} />}
                <div style={s.center}>No sales scheduled. Check back soon!</div>
            </div>
        )
    }

    const price = sale.specialPrice ? `$${(sale.specialPrice / 100).toFixed(2)}` : null
    const displayStatus = status.toUpperCase()

    return (
        <div style={s.layout}>
            {showTopPanel && <TopPanel {...{ showTopPanel, buttonHref, buttonText, isLoggedIn, logout, statusText }} />}

            <div style={s.mainBody}>
                <div style={s.card}>
                    <div style={{ ...s.badge, background: status === 'active' ? '#10b981' : '#f59e0b' }}>
                        {displayStatus}
                    </div>

                    <h1 style={s.title}>{sale.title}</h1>
                    {sale.item && <p style={s.desc}>{sale.item.description}</p>}
                    {price && <div style={s.price}>{price}</div>}

                    {!countdown.isOver && targetDate && (
                        <div style={s.countdownBox}>
                            <div style={s.countdownLabel}>{isActive ? 'Ends in' : 'Starts in'}</div>
                            <div style={s.countdown}>
                                {countdown.days > 0 && <Unit n={countdown.days} label="d" />}
                                <Unit n={countdown.hours} label="h" />
                                <Unit n={countdown.minutes} label="m" />
                                <Unit n={countdown.seconds} label="s" />
                            </div>
                        </div>
                    )}

                    {isActive && (
                        <div style={s.qty}>
                            {sale.remainingQuantity ?? 0} units left!
                        </div>
                    )}

                    {/* Purchase Logic: Only show button if status is active */}
                    {isActive ? (
                        !isLoggedIn || role !== 'buyer' ? (
                            <p style={s.hint}><a href="/login" style={s.link}>Log in</a> to buy</p>
                        ) : (
                            <button style={s.buyBtn} onClick={() => { setPurchaseMsg(null); buy() }} disabled={isPending}>
                                {isPending ? 'Processing...' : 'Buy Now'}
                            </button>
                        )
                    ) : (
                        <p style={s.hint}>{status === 'upcoming' ? 'Sale starts soon!' : 'Sale has ended.'}</p>
                    )}

                    {purchaseMsg && <div style={{ ...s.msg, background: purchaseMsg.type === 'ok' ? '#d1fae5' : '#fee2e2' }}>{purchaseMsg.text}</div>}
                </div>
            </div>
        </div>
    )
}
function Unit({ n, label }: { n: number; label: string }) {
    return (
        <div style={{ textAlign: 'center', margin: '0 6px' }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {String(n ?? 0).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
        </div>
    )
}

function TopPanel({ showTopPanel, buttonHref, buttonText, isLoggedIn, logout, statusText }: any) {
    return (
        <div style={s.topPanel}>
            <span style={s.panelWelcome}>{statusText}</span>
            <div style={s.rightActions}>
                <a href={buttonHref} style={s.myPurchaseBtn}>{buttonText}</a>
                {isLoggedIn && <button onClick={logout} style={s.logoutBtn}>Logout</button>}
            </div>
        </div>
    )
}

function badgeColor(status?: string) {
    return status === 'active' ? '#10b981' : (status === 'upcoming' || status === 'scheduled') ? '#f59e0b' : '#10b981'
}

const s: Record<string, React.CSSProperties> = {
    topPanel: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        background: '#ffffff',
        padding: '14px 24px',
        boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
        borderBottom: '1px solid #e5e7eb'
    },
    panelWelcome: { fontSize: '14px', fontWeight: 600, color: '#374151' },
    rightActions: {
        display: 'flex',
        alignItems: 'center',
        gap: '12px'
    },
    myPurchaseBtn: {
        display: 'inline-block',
        padding: '8px 16px',
        background: '#111827',
        color: '#ffffff',
        textDecoration: 'none',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    logoutBtn: {
        display: 'inline-block',
        padding: '8px 16px',
        background: '#ffffff',
        color: '#dc2626',
        border: '1px solid #fca5a5',
        borderRadius: '8px',
        fontSize: '13px',
        fontWeight: 600,
        cursor: 'pointer',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)',
    },
    mainBody: { flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 },
    center: { textAlign: 'center', marginTop: 80, fontSize: 18, color: '#6b7280', width: '100%' },
    card: { background: '#fff', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
    badge: { display: 'inline-block', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, padding: '4px 12px', borderRadius: 999, marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
    desc: { color: '#6b7280', margin: '0 0 16px' },
    price: { fontSize: 40, fontWeight: 800, color: '#111827', margin: '16px 0' },
    countdownBox: { margin: '24px 0', padding: '16px', background: '#f9fafb', borderRadius: 12 },
    countdownLabel: { fontSize: 13, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    countdown: { display: 'flex', justifyContent: 'center' },
    qty: { fontSize: 14, color: '#6b7280', fontWeight: 600, margin: '8px 0 20px' }, // Tweaked style properties for micro-copy readability
    buyBtn: { width: '100%', padding: '14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
    hint: { fontSize: 14, color: '#6b7280' },
    link: { color: '#111827', fontWeight: 600 },
    msg: { marginTop: 16, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 500 },
}