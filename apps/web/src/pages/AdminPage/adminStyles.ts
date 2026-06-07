// adminStyles.ts
import React from 'react'

export function badgeColor(status: string) {
    return status === 'active' ? '#10b981' : status === 'upcoming' ? '#f59e0b' : '#6b7280'
}

export const s: Record<string, React.CSSProperties> = {
    page: { minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', padding: 16 },
    card: { background: '#fff', borderRadius: 16, padding: 40, width: '100%', maxWidth: 400, boxShadow: '0 4px 24px rgba(0,0,0,0.08)' },
    title: { fontSize: 24, fontWeight: 700, marginBottom: 24 },
    adminPage: { display: 'flex', minHeight: '100vh' },
    sidebar: { width: 200, background: '#111827', padding: 24, display: 'flex', flexDirection: 'column', gap: 8 },
    logo: { color: '#fff', fontWeight: 800, fontSize: 18, marginBottom: 24 },
    main: { flex: 1, padding: 40, background: '#f9fafb', overflowY: 'auto' },
    navBtn: { background: 'transparent', color: '#9ca3af', border: 'none', textAlign: 'left', padding: '10px 12px', borderRadius: 8, cursor: 'pointer', fontSize: 14, fontWeight: 500 },
    navActive: { background: '#374151', color: '#fff' },
    logoutBtn: { marginTop: 'auto', background: 'transparent', color: '#6b7280', border: 'none', cursor: 'pointer', padding: '10px 12px', textAlign: 'left', fontSize: 14 },
    h2: { fontSize: 18, fontWeight: 700, marginBottom: 16 },
    formRow: { marginBottom: 12 },
    label: { display: 'block', fontSize: 12, color: '#6b7280', marginBottom: 4, textTransform: 'uppercase', letterSpacing: 0.5 },
    input: { width: '100%', padding: '10px 12px', border: '1px solid #e5e7eb', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' },
    btn: { padding: '10px 20px', background: '#111827', color: '#fff', border: 'none', borderRadius: 8, fontWeight: 600, cursor: 'pointer', fontSize: 14 },
    ok: { marginTop: 12, color: '#059669', fontSize: 13 },
    err: { color: '#dc2626', fontSize: 13, marginBottom: 8 },
    table: { width: '100%', borderCollapse: 'collapse', fontSize: 14 },
    th: { textAlign: 'left', padding: '10px 12px', borderBottom: '2px solid #e5e7eb', fontWeight: 600, color: '#374151' },
    td: { padding: '10px 12px', borderBottom: '1px solid #f3f4f6', color: '#111827' },
    badge: { display: 'inline-block', color: '#fff', fontSize: 11, padding: '2px 8px', borderRadius: 999, fontWeight: 600 },
    linkBtn: { background: 'none', border: 'none', color: '#3b82f6', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' },
    deleteBtn: { background: 'none', border: 'none', color: '#ef4444', cursor: 'pointer', fontSize: 14, padding: 0, textDecoration: 'underline' },
    disabledText: { color: '#9ca3af', fontSize: 14, cursor: 'not-allowed', fontStyle: 'italic' },
    hintText: {
        display: 'block',
        fontSize: '11px',
        color: '#6b7280',
        marginTop: '4px',
        fontStyle: 'italic',
        lineHeight: '14px',
        textAlign: 'left'
    }
}