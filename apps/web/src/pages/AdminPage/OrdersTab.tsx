// OrdersTab.tsx
import { useState, useEffect } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi, Sale, Order } from '../../lib/api'
import { s } from './adminStyles'

export default function OrdersTab({ selectedSaleId }: { selectedSaleId: string | null }) {
    const { data: sales = [] } = useQuery({ queryKey: ['admin-sales'], queryFn: adminApi.getSales })
    const [saleId, setSaleId] = useState<string>(selectedSaleId ?? '')

    // Keep state in sync if an admin clicks "View orders" from the Flash Sales list tab
    useEffect(() => {
        if (selectedSaleId) {
            setSaleId(selectedSaleId)
        }
    }, [selectedSaleId])

    const { data: orders = [], isFetching } = useQuery({
        queryKey: ['admin-orders', saleId],
        queryFn: () => adminApi.getOrders(saleId),
        enabled: !!saleId,
    })

    return (
        <div>
            <h2 style={s.h2}>Orders by Sale</h2>

            {/* ── Dropdown to choose a prior created Flash Sale ── */}
            <div style={s.formRow}>
                <label style={s.label}>Select Flash Sale Campaign</label>
                <select
                    style={s.input}
                    value={saleId}
                    onChange={e => setSaleId(e.target.value)}
                >
                    <option value="">— choose a flash sale campaign —</option>
                    {sales.map((sale: Sale) => {
                        const saleTitle = sale.title || `Sale #${sale.id.slice(0, 8)}`
                        const itemContext = sale.item?.name ? ` (${sale.item.name})` : ''
                        return (
                            <option key={sale.id} value={sale.id}>
                                {saleTitle}{itemContext} — {sale.status}
                            </option>
                        )
                    })}
                </select>
            </div>

            {isFetching && <p style={{ color: '#4b5563', fontSize: '14px', margin: '12px 0' }}>Loading orders...</p>}

            {!isFetching && orders.length > 0 && (
                <table style={s.table}>
                    <thead>
                        <tr>{['Order ID', 'Buyer', 'Email', 'Placed at'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {orders.map((o: Order) => (
                            <tr key={o.orderId}>
                                <td style={s.td} title={o.orderId}>{o.orderId.slice(0, 8)}…</td>
                                <td style={s.td}>{o.userName || '—'}</td>
                                <td style={s.td}>{o.userEmail || '—'}</td>
                                <td style={s.td}>{new Date(o.createdAt).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            )}

            {!isFetching && saleId && orders.length === 0 && (
                <p style={{ color: '#9ca3af', marginTop: '16px', fontSize: '14px', fontStyle: 'italic' }}>
                    No orders have been recorded for this flash sale yet.
                </p>
            )}

            {!saleId && (
                <p style={{ color: '#6b7280', marginTop: '16px', fontSize: '14px' }}>
                    Please select a campaign from the list above to view transaction metrics.
                </p>
            )}
        </div>
    )
}