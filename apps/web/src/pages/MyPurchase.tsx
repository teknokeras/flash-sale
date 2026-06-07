import { useQuery } from '@tanstack/react-query'
import { purchaseApi } from '../lib/api'

export default function MyPurchase() {
    // Fetch user's purchase history
    const { data: purchases = [], isLoading, error } = useQuery({
        queryKey: ['my-purchases'],
        queryFn: purchaseApi.getMyPurchases,
        refetchInterval: 5000, // Polling updates every 5s to reflect fast async SQS processing
    })

    if (isLoading) return <div style={s.center}>Loading your purchases...</div>
    if (error) return <div style={s.centerError}>Failed to load purchases. Please try again.</div>

    return (
        <div style={s.container}>
            {/* Header Navigation Bar */}
            <div style={s.header}>
                <h1 style={s.h1}>My Purchases</h1>
                <a href="/" style={s.backBtn}>← Back to Sales</a>
            </div>

            {purchases.length === 0 ? (
                <div style={s.emptyState}>
                    <div style={{ fontSize: '48px', marginBottom: '16px' }}>📦</div>
                    <h3>No purchases yet</h3>
                    <p style={{ color: '#6b7280', marginTop: '8px' }}>
                        When you successfully reserve an item from a flash sale, it will appear right here!
                    </p>
                </div>
            ) : (
                <div style={s.list}>
                    {purchases.map((order) => {
                        const price = `$${(order.priceCents / 100).toFixed(2)}`
                        const formattedDate = new Date(order.createdAt).toLocaleString()

                        return (
                            <div key={order.orderId} style={s.orderCard}>
                                <div style={s.cardLeft}>
                                    <span style={s.saleTag}>{order.saleTitle || 'Flash Event'}</span>
                                    <h2 style={s.itemName}>{order.itemName}</h2>
                                    <div style={s.date}>Ordered on: {formattedDate}</div>
                                    <div style={s.orderId}>ID: {order.orderId}</div>
                                </div>
                                <div style={s.cardRight}>
                                    <div style={s.price}>{price}</div>
                                    <span style={{ ...s.badge, background: statusBadgeColor(order.status) }}>
                                        {order.status.toUpperCase()}
                                    </span>
                                </div>
                            </div>
                        )
                    })}
                </div>
            )}
        </div>
    )
}

// Helpers for asynchronous transaction state tracking badges
function statusBadgeColor(status: string) {
    switch (status.toLowerCase()) {
        case 'completed':
        case 'success':
            return '#10b981' // Green
        case 'pending':
        case 'processing':
        case 'reserved':
            return '#3b82f6' // Blue
        case 'failed':
        case 'cancelled':
            return '#ef4444' // Red
        default:
            return '#6b7280' // Gray
    }
}

// Styling Object Dictionary
const s: Record<string, React.CSSProperties> = {
    container: {
        maxWidth: '800px',
        margin: '0 auto',
        padding: '40px 24px',
        minHeight: '100vh',
        fontFamily: 'system-ui, -apple-system, sans-serif'
    },
    header: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        borderBottom: '2px solid #f3f4f6',
        paddingBottom: '20px',
        marginBottom: '32px'
    },
    h1: { fontSize: '28px', fontWeight: 800, color: '#111827', margin: 0 },
    backBtn: {
        textDecoration: 'none',
        color: '#4b5563',
        fontSize: '14px',
        fontWeight: 600,
        padding: '8px 14px',
        borderRadius: '8px',
        border: '1px solid #e5e7eb',
        background: '#ffffff',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    },
    center: { textAlign: 'center', marginTop: '100px', fontSize: '18px', color: '#6b7280' },
    centerError: { textAlign: 'center', marginTop: '100px', fontSize: '18px', color: '#ef4444', fontWeight: 500 },
    emptyState: {
        textAlign: 'center',
        padding: '60px 20px',
        background: '#f9fafb',
        borderRadius: '16px',
        border: '2px dashed #e5e7eb',
        marginTop: '20px'
    },
    list: { display: 'flex', flexDirection: 'column', gap: '16px' },
    orderCard: {
        background: '#ffffff',
        border: '1px solid #e5e7eb',
        borderRadius: '14px',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        boxShadow: '0 2px 8px rgba(0,0,0,0.02)'
    },
    cardLeft: { display: 'flex', flexDirection: 'column', gap: '4px', textAlign: 'left' },
    cardRight: { display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: '12px' },
    saleTag: {
        fontSize: '11px',
        fontWeight: 700,
        color: '#2563eb',
        textTransform: 'uppercase',
        letterSpacing: '0.5px'
    },
    itemName: { fontSize: '18px', fontWeight: 700, color: '#111827', margin: '4px 0' },
    date: { fontSize: '13px', color: '#6b7280' },
    orderId: { fontSize: '11px', color: '#9ca3af', fontFamily: 'monospace' },
    price: { fontSize: '22px', fontWeight: 800, color: '#111827' },
    badge: {
        color: '#ffffff',
        fontSize: '11px',
        fontWeight: 700,
        letterSpacing: '0.5px',
        padding: '4px 10px',
        borderRadius: '999px',
        boxShadow: '0 1px 2px rgba(0,0,0,0.05)'
    }
}