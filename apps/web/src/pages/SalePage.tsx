import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { saleApi, purchaseApi } from '../lib/api'
import { useAuth } from '../context/AuthContext'
import { useCountdown } from '../hooks/useCountdown'
import { useState } from 'react'

export default function SalePage() {
    const { isLoggedIn, role } = useAuth()
    const qc = useQueryClient()

    const { data: sale, isLoading, error } = useQuery({
        queryKey: ['active-sale'],
        queryFn: saleApi.getActive,
        refetchInterval: 3000,
        retry: false,
    })

    const countdown = useCountdown(
        sale?.status === 'upcoming' ? sale.startsAt :
            sale?.status === 'active' ? sale.endsAt : null
    )

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

    if (isLoading) return <div style={s.center}>Loading sale...</div>
    if (error || !sale) return <div style={s.center}>No active sale right now. Check back soon!</div>

    const fmt = (n: number) => String(n).padStart(2, '0')
    const price = sale.item ? `$${(sale.item.priceCents / 100).toFixed(2)}` : '—'

    return (
        <div style={s.page}>
            <div style={s.card}>
                {/* Status badge */}
                <div style={{ ...s.badge, background: badgeColor(sale.status) }}>
                    {sale.status.toUpperCase()}
                </div>

                {/* Item info */}
                {sale.item ? (
                    <>
                        <h1 style={s.title}>{sale.item.name}</h1>
                        <p style={s.desc}>{sale.item.description}</p>
                        <div style={s.price}>{price}</div>
                    </>
                ) : (
                    <h1 style={s.title}>Flash Sale</h1>
                )}

                {/* Countdown */}
                {!countdown.isOver && (
                    <div style={s.countdownBox}>
                        <div style={s.countdownLabel}>
                            {sale.status === 'upcoming' ? 'Starts in' : 'Ends in'}
                        </div>
                        <div style={s.countdown}>
                            {countdown.days > 0 && <Unit n={countdown.days} label="d" />}
                            <Unit n={countdown.hours} label="h" />
                            <Unit n={countdown.minutes} label="m" />
                            <Unit n={countdown.seconds} label="s" />
                        </div>
                    </div>
                )}

                {/* Inventory */}
                {sale.remainingQuantity !== undefined && (
                    <div style={s.qty}>
                        {sale.remainingQuantity} left
                    </div>
                )}

                {/* Buy button */}
                {sale.status === 'active' && (
                    <>
                        {!isLoggedIn || role !== 'buyer' ? (
                            <p style={s.hint}>
                                <a href="/login" style={s.link}>Log in</a> or{' '}
                                <a href="/register" style={s.link}>register</a> to buy
                            </p>
                        ) : (
                            <button
                                style={s.buyBtn}
                                onClick={() => { setPurchaseMsg(null); buy() }}
                                disabled={isPending}
                            >
                                {isPending ? 'Processing...' : 'Buy Now'}
                            </button>
                        )}
                    </>
                )}

                {purchaseMsg && (
                    <div style={{ ...s.msg, background: purchaseMsg.type === 'ok' ? '#d1fae5' : '#fee2e2' }}>
                        {purchaseMsg.text}
                    </div>
                )}
            </div>
        </div>
    )
}

function Unit({ n, label }: { n: number; label: string }) {
    return (
        <div style={{ textAlign: 'center', margin: '0 6px' }}>
            <div style={{ fontSize: 36, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>
                {String(n).padStart(2, '0')}
            </div>
            <div style={{ fontSize: 12, color: '#6b7280' }}>{label}</div>
        </div>
    )
}

function badgeColor(status: string) {
    return status === 'active' ? '#10b981' : status === 'upcoming' ? '#f59e0b' : '#6b7280'
}

const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 16 },
    center: { textAlign: 'center', marginTop: 80, fontSize: 18, color: '#6b7280' },
    card: { background: '#fff', borderRadius: 16, padding: 40, maxWidth: 480, width: '100%', boxShadow: '0 4px 24px rgba(0,0,0,0.08)', textAlign: 'center' },
    badge: { display: 'inline-block', color: '#fff', fontSize: 12, fontWeight: 700, letterSpacing: 1, padding: '4px 12px', borderRadius: 999, marginBottom: 20 },
    title: { fontSize: 28, fontWeight: 700, margin: '0 0 8px' },
    desc: { color: '#6b7280', margin: '0 0 16px' },
    price: { fontSize: 40, fontWeight: 800, color: '#111827', margin: '16px 0' },
    countdownBox: { margin: '24px 0', padding: '16px', background: '#f9fafb', borderRadius: 12 },
    countdownLabel: { fontSize: 13, color: '#9ca3af', marginBottom: 8, textTransform: 'uppercase', letterSpacing: 1 },
    countdown: { display: 'flex', justifyContent: 'center' },
    qty: { fontSize: 14, color: '#9ca3af', margin: '8px 0 20px' },
    buyBtn: { width: '100%', padding: '14px', background: '#111827', color: '#fff', border: 'none', borderRadius: 10, fontSize: 16, fontWeight: 700, cursor: 'pointer' },
    hint: { fontSize: 14, color: '#6b7280' },
    link: { color: '#111827', fontWeight: 600 },
    msg: { marginTop: 16, padding: '12px', borderRadius: 8, fontSize: 14, fontWeight: 500 },
}
