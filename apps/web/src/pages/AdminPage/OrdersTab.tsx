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
            {/* ... select dropdown remains same ... */}

            {isFetching && <p>Loading...</p>}
            {orders.length > 0 ? (
                <table style={s.table}>
                    <thead>
                        <tr>{['Order ID', 'Buyer', 'Email', 'Placed at'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                    </thead>
                    <tbody>
                        {orders.map((o: Order) => (
                            <tr key={o.orderId}> {/* ✅ Fixed: Use orderId */}
                                <td style={s.td}>{o.orderId.slice(0, 8)}…</td>
                                {/* ✅ Fixed: Use direct properties */}
                                <td style={s.td}>{o.userName}</td>
                                <td style={s.td}>{o.userEmail}</td>
                                <td style={s.td}>{new Date(o.createdAt).toLocaleString()}</td>
                            </tr>
                        ))}
                    </tbody>
                </table>
            ) : saleId ? <p style={{ color: '#9ca3af' }}>No orders yet.</p> : null}
        </div>
    )
}