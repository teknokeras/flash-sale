// OrdersTab.tsx
import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { adminApi, Sale, Order } from '../../lib/api'
import { s } from './adminStyles'

export default function OrdersTab({ selectedSaleId }: { selectedSaleId: string | null }) {
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