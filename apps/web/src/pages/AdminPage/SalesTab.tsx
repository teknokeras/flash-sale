import { useState } from 'react'
import { useQuery, useMutation, QueryClient } from '@tanstack/react-query'
import { adminApi, Sale, Item } from '../../lib/api'
import { s, badgeColor } from './adminStyles'

interface SalesTabProps {
    qc: QueryClient;
    onSelectSale: (id: string) => void;
}

export default function SalesTab({ qc, onSelectSale }: SalesTabProps) {
    const { data: sales = [] } = useQuery({ queryKey: ['admin-sales'], queryFn: adminApi.getSales })
    const { data: items = [] } = useQuery({ queryKey: ['admin-items'], queryFn: adminApi.getAvailableItems }) // 👈 OPTIMIZATION: Switched to fetch available items directly

    const [form, setForm] = useState({ title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' })
    const [errors, setErrors] = useState({ title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' })
    const [msg, setMsg] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    const handleChange = (field: keyof typeof form, value: string) => {
        setForm(f => ({ ...f, [field]: value }))
        if (value.trim() !== '') {
            setErrors(e => ({ ...e, [field]: '' }))
        }
    }

    const { mutateAsync: attachItem } = useMutation({
        mutationFn: ({ saleId, itemId }: { saleId: string; itemId: string }) =>
            adminApi.attachItem(saleId, itemId),
        onError: (e: any) => setMsg(e.response?.data?.message ?? e.error ?? 'Sale created, but item attachment failed.'),
    })

    const { mutate: handleCreateSale } = useMutation({
        mutationFn: () => adminApi.createSale({
            title: form.title,
            specialPrice: Math.round(parseFloat(form.specialPrice) * 100),
            initialQuantity: parseInt(form.initialQuantity, 10),
            startsAt: new Date(form.startsAt).toISOString(), // 👈 Safely matches the ISO structure
            endsAt: new Date(form.endsAt).toISOString()
        }),
        onSuccess: async (newSale: any) => {
            try {
                if (form.itemId && newSale?.id) {
                    await attachItem({ saleId: newSale.id, itemId: form.itemId })
                    setMsg('Flash sale created and item attached successfully!')
                } else {
                    setMsg('Flash sale created successfully!')
                }

                setForm({ title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' })
                setErrors({ title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' })
                qc.invalidateQueries({ queryKey: ['admin-sales'] })
            } catch (err) {
                console.error(err)
            } finally {
                setIsProcessing(false)
            }
        },
        onError: (e: any) => {
            setMsg(e.response?.data?.message ?? e.error ?? 'Error creating sale')
            setIsProcessing(false)
        },
    })

    const submitUnifiedForm = () => {
        const newErrors = { title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' }
        let hasEmptyFields = false

        if (!form.title.trim()) { newErrors.title = 'Flash Sale Title is mandatory.'; hasEmptyFields = true; }
        if (!form.itemId.trim()) { newErrors.itemId = 'Selecting an item is mandatory.'; hasEmptyFields = true; }
        if (!form.startsAt.trim()) { newErrors.startsAt = 'Start time is mandatory.'; hasEmptyFields = true; }
        if (!form.endsAt.trim()) { newErrors.endsAt = 'End time is mandatory.'; hasEmptyFields = true; }
        if (!form.specialPrice.trim()) { newErrors.specialPrice = 'Promo price is mandatory.'; hasEmptyFields = true; }

        if (!form.initialQuantity.trim()) {
            newErrors.initialQuantity = 'Sale allocation quantity is mandatory.';
            hasEmptyFields = true;
        } else if (isNaN(Number(form.initialQuantity)) || Number(form.initialQuantity) <= 0) {
            newErrors.initialQuantity = 'Please specify a target value greater than 0.';
            hasEmptyFields = true;
        }

        if (hasEmptyFields) {
            setErrors(newErrors)
            return
        }

        // ── FIX: Explicit parsing guarantees timezone alignment ──
        const startTimestamp = new Date(form.startsAt).getTime()
        const endTimestamp = new Date(form.endsAt).getTime()
        const nowTimestamp = Date.now()

        const minAllowedStart = nowTimestamp + 14 * 60 * 1000 // Added 1-minute buffer to accommodate client submission latency

        if (startTimestamp < minAllowedStart) {
            setMsg('Error: Sale start time must be at least 15 minutes from now.')
            return
        }

        if (endTimestamp < startTimestamp + 1 * 60 * 1000) {
            setMsg('Error: Sale must end at least 1 minute after it starts.')
            return
        }

        setMsg(null)
        setErrors({ title: '', specialPrice: '', initialQuantity: '', startsAt: '', endsAt: '', itemId: '' })
        setIsProcessing(true)
        handleCreateSale()
    }

    const { mutate: deleteSale } = useMutation({
        mutationFn: (id: string) => adminApi.deleteSale(id),
        onSuccess: () => {
            qc.invalidateQueries({ queryKey: ['admin-sales'] })
            setMsg('Sale deleted successfully.')
        },
        onError: (e: any) => setMsg(e.response?.data?.message ?? e.error ?? 'Error deleting sale'),
    })

    const fieldErrorStyle: React.CSSProperties = { display: 'block', color: '#dc2626', fontSize: '12px', marginTop: '4px', fontWeight: 500 }

    return (
        <div>
            <h2 style={s.h2}>Create Flash Sale</h2>

            <div style={s.formRow}>
                <label style={s.label}>Flash Sale Title</label>
                <input style={{ ...s.input, borderColor: errors.title ? '#dc2626' : '#e5e7eb' }} type="text" placeholder="e.g., Summer Flash Sale 2026" value={form.title}
                    onChange={e => handleChange('title', e.target.value)} />
                {errors.title && <span style={fieldErrorStyle}>{errors.title}</span>}
            </div>

            <div style={s.formRow}>
                <label style={s.label}>Item with Available Stock</label>
                <select style={{ ...s.input, borderColor: errors.itemId ? '#dc2626' : '#e5e7eb' }} value={form.itemId}
                    onChange={e => handleChange('itemId', e.target.value)}>
                    <option value="">— pick available item —</option>
                    {items.map((item: Item) => (
                        <option key={item.id} value={item.id}>
                            {item.name} (${(item.priceCents / 100).toFixed(2)})
                        </option>
                    ))}
                </select>
                {errors.itemId && <span style={fieldErrorStyle}>{errors.itemId}</span>}
            </div>

            <div style={s.formRow}>
                <label style={s.label}>Promo Sale Price ($)</label>
                <input
                    style={{ ...s.input, borderColor: errors.specialPrice ? '#dc2626' : '#e5e7eb' }}
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder="e.g., 19.99"
                    value={form.specialPrice}
                    onChange={e => handleChange('specialPrice', e.target.value)}
                />
                {errors.specialPrice && <span style={fieldErrorStyle}>{errors.specialPrice}</span>}
            </div>

            <div style={s.formRow}>
                <label style={s.label}>Sale Allocation Stock Quantity</label>
                <input
                    style={{ ...s.input, borderColor: errors.initialQuantity ? '#dc2626' : '#e5e7eb' }}
                    type="number"
                    min="1"
                    placeholder="e.g., 100"
                    value={form.initialQuantity}
                    onChange={e => handleChange('initialQuantity', e.target.value)}
                />
                {errors.initialQuantity && <span style={fieldErrorStyle}>{errors.initialQuantity}</span>}
            </div>

            <div style={s.formRow}>
                <label style={s.label}>Start</label>
                <input style={{ ...s.input, borderColor: errors.startsAt ? '#dc2626' : '#e5e7eb' }} type="datetime-local" value={form.startsAt}
                    onChange={e => handleChange('startsAt', e.target.value)} />
                {errors.startsAt && <span style={fieldErrorStyle}>{errors.startsAt}</span>}
                <span style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>
                    * Notice: The sale scheduling engine requires the start window to begin at least 15 minutes from now.
                </span>
            </div>

            <div style={s.formRow}>
                <label style={s.label}>End</label>
                <input style={{ ...s.input, borderColor: errors.endsAt ? '#dc2626' : '#e5e7eb' }} type="datetime-local" value={form.endsAt}
                    onChange={e => handleChange('endsAt', e.target.value)} />
                {errors.endsAt && <span style={fieldErrorStyle}>{errors.endsAt}</span>}
                <span style={{ display: 'block', fontSize: '11px', color: '#6b7280', marginTop: '4px', fontStyle: 'italic' }}>
                    * Notice: The sale must remain active for a minimum duration of at least 1 minute after it starts.
                </span>
            </div>

            <button style={{ ...s.btn, marginTop: 12 }} onClick={submitUnifiedForm} disabled={isProcessing}>
                {isProcessing ? 'Processing...' : 'Create Sale'}
            </button>

            {msg && (
                <div style={{ color: msg.startsWith('Error') ? '#dc2626' : '#059669', marginTop: 12, fontSize: 13, fontWeight: 500 }}>
                    {msg}
                </div>
            )}

            <h2 style={{ ...s.h2, marginTop: 32 }}>All Flash Sales</h2>
            <table style={s.table}>
                <thead>
                    <tr>{['Title', 'Promo Price', 'Allocated Stock', 'Status', 'Starts', 'Ends', 'Item', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                    {sales.map((sale: Sale) => {
                        const now = new Date().getTime()
                        const start = new Date(sale.startsAt).getTime()
                        const end = new Date(sale.endsAt).getTime()
                        const isDeletable = now < start || now > end;
                        const saleTitle = sale.title || sale.id.slice(0, 8);

                        const displayPromoPrice = sale.specialPrice !== undefined
                            ? `$${(sale.specialPrice / 100).toFixed(2)}`
                            : '—';

                        return (
                            <tr key={sale.id}>
                                <td style={s.td}>{saleTitle}</td>
                                <td style={{ ...s.td, fontWeight: 600, color: '#111827' }}>{displayPromoPrice}</td>
                                <td style={s.td}>{sale.initialQuantity ?? '—'} units</td>
                                <td style={s.td}><span style={{ ...s.badge, background: badgeColor(sale.status) }}>{sale.status}</span></td>
                                <td style={s.td}>{new Date(sale.startsAt).toLocaleString()}</td>
                                <td style={s.td}>{new Date(sale.endsAt).toLocaleString()}</td>
                                <td style={s.td}>{sale.item?.name ?? '—'}</td>
                                <td style={{ ...s.td, display: 'flex', gap: '12px', alignItems: 'center' }}>
                                    <button style={s.linkBtn} onClick={() => onSelectSale(sale.id)}>View orders</button>
                                    {isDeletable ? (
                                        <button
                                            style={s.deleteBtn}
                                            onClick={() => {
                                                if (confirm(`Are you sure you want to delete "${saleTitle}"?`)) {
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