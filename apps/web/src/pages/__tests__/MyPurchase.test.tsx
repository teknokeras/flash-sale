// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import MyPurchase from '../MyPurchase'
import { purchaseApi } from '../../lib/api'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
    purchaseApi: {
        getMyPurchases: vi.fn(),
    },
}))

// ── Fixtures ──────────────────────────────────────────────────

const mockOrders = [
    {
        orderId: 'ord-001',
        status: 'completed',
        createdAt: '2024-01-15T10:30:00.000Z',
        saleId: 'sale-1',
        saleTitle: 'Summer Flash Sale',
        itemName: 'Premium Sneakers',
        priceCents: 4999,
    },
    {
        orderId: 'ord-002',
        status: 'pending',
        createdAt: '2024-01-16T14:00:00.000Z',
        saleId: 'sale-2',
        saleTitle: null,
        itemName: 'Wireless Headphones',
        priceCents: 9900,
    },
    {
        orderId: 'ord-003',
        status: 'failed',
        createdAt: '2024-01-17T08:00:00.000Z',
        saleId: 'sale-3',
        saleTitle: 'Winter Deals',
        itemName: 'Smart Watch',
        priceCents: 19999,
    },
]

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
    const qc = new QueryClient({
        defaultOptions: {
            queries: { retry: false },
        },
    })
    return render(
        <QueryClientProvider client={qc}>
            <MyPurchase />
        </QueryClientProvider>
    )
}

// ── Suite ─────────────────────────────────────────────────────

describe('MyPurchase', () => {

    beforeEach(() => {
        vi.clearAllMocks()
    })

    // ── Loading state ─────────────────────────────────────────

    describe('Loading state', () => {
        it('shows loading message while fetching', () => {
            // Never resolves — keeps component in loading state
            vi.mocked(purchaseApi.getMyPurchases).mockReturnValue(new Promise(() => { }))

            renderPage()

            expect(screen.getByText(/loading your purchases/i)).toBeInTheDocument()
        })
    })

    // ── Error state ───────────────────────────────────────────

    describe('Error state', () => {
        it('shows error message when fetch fails', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockRejectedValue(new Error('Network error'))

            renderPage()

            expect(await screen.findByText(/failed to load purchases/i)).toBeInTheDocument()
        })
    })

    // ── Empty state ───────────────────────────────────────────

    describe('Empty state', () => {
        it('shows empty state UI when there are no purchases', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([])

            renderPage()

            expect(await screen.findByText(/no purchases yet/i)).toBeInTheDocument()
        })

        it('shows descriptive hint text in empty state', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([])

            renderPage()

            expect(await screen.findByText(/when you successfully reserve/i)).toBeInTheDocument()
        })

        it('shows the package emoji in empty state', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([])

            renderPage()

            expect(await screen.findByText('📦')).toBeInTheDocument()
        })
    })

    // ── Populated state ───────────────────────────────────────

    describe('Populated state', () => {
        beforeEach(() => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue(mockOrders)
        })

        it('renders the page heading', async () => {
            renderPage()
            expect(await screen.findByRole('heading', { name: /my purchases/i })).toBeInTheDocument()
        })

        it('renders a back-to-sales navigation link', async () => {
            renderPage()
            const link = await screen.findByRole('link', { name: /back to sales/i })
            expect(link).toHaveAttribute('href', '/')
        })

        it('renders one card per order', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            // Each order shows its item name
            expect(screen.getByText('Premium Sneakers')).toBeInTheDocument()
            expect(screen.getByText('Wireless Headphones')).toBeInTheDocument()
            expect(screen.getByText('Smart Watch')).toBeInTheDocument()
        })

        it('formats price correctly from cents to dollars', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            expect(screen.getByText('$49.99')).toBeInTheDocument()
            expect(screen.getByText('$99.00')).toBeInTheDocument()
            expect(screen.getByText('$199.99')).toBeInTheDocument()
        })

        it('shows the sale title when present', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            expect(screen.getByText('Summer Flash Sale')).toBeInTheDocument()
            expect(screen.getByText('Winter Deals')).toBeInTheDocument()
        })

        it('falls back to "Flash Event" when saleTitle is null', async () => {
            renderPage()
            await screen.findByText('Wireless Headphones')

            expect(screen.getByText('Flash Event')).toBeInTheDocument()
        })

        it('shows order IDs', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            expect(screen.getByText('ID: ord-001')).toBeInTheDocument()
            expect(screen.getByText('ID: ord-002')).toBeInTheDocument()
            expect(screen.getByText('ID: ord-003')).toBeInTheDocument()
        })

        it('renders status badges in uppercase', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            expect(screen.getByText('COMPLETED')).toBeInTheDocument()
            expect(screen.getByText('PENDING')).toBeInTheDocument()
            expect(screen.getByText('FAILED')).toBeInTheDocument()
        })

        it('shows "Ordered on:" prefix for each order date', async () => {
            renderPage()
            await screen.findByText('Premium Sneakers')

            const dateLabels = screen.getAllByText(/ordered on:/i)
            expect(dateLabels).toHaveLength(3)
        })
    })

    // ── Status badge colors ───────────────────────────────────

    describe('Status badge colors', () => {
        it('applies green badge for completed status', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([mockOrders[0]]) // completed

            renderPage()
            const badge = await screen.findByText('COMPLETED')
            expect(badge).toHaveStyle({ background: '#10b981' })
        })

        it('applies blue badge for pending status', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([mockOrders[1]]) // pending

            renderPage()
            const badge = await screen.findByText('PENDING')
            expect(badge).toHaveStyle({ background: '#3b82f6' })
        })

        it('applies red badge for failed status', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([mockOrders[2]]) // failed

            renderPage()
            const badge = await screen.findByText('FAILED')
            expect(badge).toHaveStyle({ background: '#ef4444' })
        })

        it('applies blue badge for "reserved" status', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([
                { ...mockOrders[0], status: 'reserved', orderId: 'ord-r' },
            ])

            renderPage()
            const badge = await screen.findByText('RESERVED')
            expect(badge).toHaveStyle({ background: '#3b82f6' })
        })

        it('applies gray badge for unknown status', async () => {
            vi.mocked(purchaseApi.getMyPurchases).mockResolvedValue([
                { ...mockOrders[0], status: 'unknown', orderId: 'ord-u' },
            ])

            renderPage()
            const badge = await screen.findByText('UNKNOWN')
            expect(badge).toHaveStyle({ background: '#6b7280' })
        })
    })
})
