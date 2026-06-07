// ItemsTab.tsx
import { useState } from 'react'
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query'
import { adminApi, Item } from '../../lib/api'
import { s } from './adminStyles'

export default function ItemsTab({ qc }: { qc: QueryClient }) {
    const { data: items = [] } = useQuery({ queryKey: ['admin-items'], queryFn: adminApi.getItems })
    const [form, setForm] = useState({ name: '', description: '', priceCents: '' })
    const [msg, setMsg] = useState<string | null>(null)

    const { mutate: createItem } = useMutation({
        mutationFn: () => adminApi.createItem({
            ...form,
            priceCents: Number(form.priceCents),
        }),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-items'] });
            setMsg('Item created!');
            setForm({ name: '', description: '', priceCents: '' });
        },
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
                        </tr>
                    ))}
                </tbody>
            </table>
        </div>
    )
}