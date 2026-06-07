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
    const { data: items = [] } = useQuery({ queryKey: ['admin-items'], queryFn: adminApi.getItems })

    const [form, setForm] = useState({ title: '', startsAt: '', endsAt: '', itemId: '' })
    // Tracks specific field errors independently
    const [errors, setErrors] = useState({ title: '', startsAt: '', endsAt: '', itemId: '' })
    const [msg, setMsg] = useState<string | null>(null)
    const [isProcessing, setIsProcessing] = useState(false)

    // Filter available stock quantities bigger than 0
    const validItems = items.filter((item: Item) => item.initialQuantity > 0)

    const handleChange = (field: keyof typeof form, value: string) => {
        setForm(f => ({ ...f, [field]: value }))
        // Instantly clean up the field validation text once input is registered
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
            startsAt: new Date(form.startsAt).toISOString(),
            endsAt: new Date(form.endsAt).toISOString()
        } as any),
        onSuccess: async (newSale: any) => {
            try {
                if (form.itemId && newSale?.id) {
                    await attachItem({ saleId: newSale.id, itemId: form.itemId })
                    setMsg('Flash sale created and item attached successfully!')
                } else {
                    setMsg('Flash sale created successfully!')
                }

                setForm({ title: '', startsAt: '', endsAt: '', itemId: '' })
                setErrors({ title: '', startsAt: '', endsAt: '', itemId: '' })
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
        const newErrors = { title: '', startsAt: '', endsAt: '', itemId: '' }
        let hasEmptyFields = false

        // Evaluate all properties dynamically
        if (!form.title.trim()) { newErrors.title = 'Flash Sale Title is mandatory.'; hasEmptyFields = true; }
        if (!form.itemId.trim()) { newErrors.itemId = 'Selecting an item is mandatory.'; hasEmptyFields = true; }
        if (!form.startsAt.trim()) { newErrors.startsAt = 'Start time is mandatory.'; hasEmptyFields = true; }
        if (!form.endsAt.trim()) { newErrors.endsAt = 'End time is mandatory.'; hasEmptyFields = true; }

        if (hasEmptyFields) {
            setErrors(newErrors)
            setMsg(null)
            return
        }

        const startTimestamp = new Date(form.startsAt).getTime()
        const endTimestamp = new Date(form.endsAt).getTime()
        const minAllowedStart = Date.now() + 15 * 60 * 1000

        if (startTimestamp < minAllowedStart) {
            setMsg('Error: Sale start time must be at least 15 minutes from now.')
            return
        }

        if (endTimestamp < startTimestamp + 1 * 60 * 1000) {
            setMsg('Error: Sale must end at least 1 minute after it starts.')
            return
        }

        setMsg(null)
        setErrors({ title: '', startsAt: '', endsAt: '', itemId: '' })
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

    // Inline field validation label styling layout schema
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
                    {validItems.map((item: Item) => (
                        <option key={item.id} value={item.id}>
                            {item.name} ({item.initialQuantity} units available)
                        </option>
                    ))}
                </select>
                {errors.itemId && <span style={fieldErrorStyle}>{errors.itemId}</span>}
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
                    <tr>{['Title', 'Status', 'Starts', 'Ends', 'Item', 'Actions'].map(h => <th key={h} style={s.th}>{h}</th>)}</tr>
                </thead>
                <tbody>
                    {sales.map((sale: Sale) => {
                        const now = new Date().getTime()
                        const start = new Date(sale.startsAt).getTime()
                        const end = new Date(sale.endsAt).getTime()
                        const isDeletable = now < start || now > end;
                        const saleTitle = (sale as any).title || sale.id.slice(0, 8);

                        return (
                            <tr key={sale.id}>
                                <td style={s.td}>{saleTitle}</td>
                                <td style={s.td}><span style={{ ...s.badge, background: badgeColor(sale.status) }}>{sale.status}</span></td>
                                <td style={s.td}>{new Date(sale.startsAt).toLocaleString()}</td>
                                <td style={s.td}>{new Date(sale.endsAt).toLocaleString()}</td>
                                <td style={s.td}>{(sale as any).item?.name ?? '—'}</td>
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