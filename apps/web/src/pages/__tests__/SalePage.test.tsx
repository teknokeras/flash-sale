// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalePage from '../SalePage'
import { saleApi, purchaseApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'
import { useCountdown } from '../../hooks/useCountdown'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
    saleApi: { getActive: vi.fn() },
    purchaseApi: { buy: vi.fn() },
}))

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}))

vi.mock('../../hooks/useCountdown', () => ({
    useCountdown: vi.fn(),
}))

// ── Fixtures ──────────────────────────────────────────────────

const baseSale = {
    id: 'sale-1',
    title: 'Summer Flash Sale',
    specialPrice: 4999,
    initialQuantity: 100,
    startsAt: '2024-01-15T10:00:00.000Z',
    endsAt: '2024-01-15T11:00:00.000Z',
    status: 'active' as const,
    remainingQuantity: 42,
    item: { id: 'item-1', name: 'Premium Sneakers', description: 'Limited edition kicks', priceCents: 4999 },
}

const activeSaleResponse = { active: true, sale: baseSale }

const upcomingSaleResponse = {
    active: false,
    nextSale: { ...baseSale, id: 'sale-2', status: 'scheduled' as const },
}

const noSaleResponse = { active: false, nextSale: null }

const countdownActive = { days: 0, hours: 0, minutes: 14, seconds: 59, isOver: false }
const countdownOver = { days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true }

const guestAuth = { isLoggedIn: false, role: null, logout: vi.fn() }
const buyerAuth = { isLoggedIn: true, role: 'buyer', logout: vi.fn() }
const adminAuth = { isLoggedIn: true, role: 'admin', logout: vi.fn() }

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
    const qc = new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={qc}>
            <SalePage />
        </QueryClientProvider>
    )
}

// ── Suite ─────────────────────────────────────────────────────

describe('SalePage', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(useCountdown).mockReturnValue(countdownActive)
        vi.mocked(useAuth).mockReturnValue(guestAuth)
    })

    // ── Loading ───────────────────────────────────────────────

    describe('Loading state', () => {
        it('shows loading text while fetching', () => {
            vi.mocked(saleApi.getActive).mockReturnValue(new Promise(() => { }))

            renderPage()

            expect(screen.getByText(/loading sale/i)).toBeInTheDocument()
        })
    })

    // ── No sale ───────────────────────────────────────────────

    describe('No sale scheduled', () => {
        it('shows fallback message when no sale exists', async () => {
            vi.mocked(saleApi.getActive).mockResolvedValue(noSaleResponse)

            renderPage()

            expect(await screen.findByText(/no sales scheduled/i)).toBeInTheDocument()
        })

        it('shows fallback on query error', async () => {
            vi.mocked(saleApi.getActive).mockRejectedValue(new Error('Network error'))

            renderPage()

            expect(await screen.findByText(/no sales scheduled/i)).toBeInTheDocument()
        })
    })

    // ── Active sale ───────────────────────────────────────────

    describe('Active sale', () => {
        beforeEach(() => {
            vi.mocked(saleApi.getActive).mockResolvedValue(activeSaleResponse)
        })

        it('renders the sale title', async () => {
            renderPage()
            expect(await screen.findByRole('heading', { name: /summer flash sale/i })).toBeInTheDocument()
        })

        it('renders the item description', async () => {
            renderPage()
            expect(await screen.findByText('Limited edition kicks')).toBeInTheDocument()
        })

        it('formats the price correctly from cents', async () => {
            renderPage()
            expect(await screen.findByText('$49.99')).toBeInTheDocument()
        })

        it('shows ACTIVE badge', async () => {
            renderPage()
            expect(await screen.findByText('ACTIVE')).toBeInTheDocument()
        })

        it('shows remaining quantity', async () => {
            renderPage()
            expect(await screen.findByText(/42 units left/i)).toBeInTheDocument()
        })

        it('shows "Ends in" countdown label for active sale', async () => {
            renderPage()
            expect(await screen.findByText(/ends in/i)).toBeInTheDocument()
        })

        it('does not show countdown when isOver is true', async () => {
            vi.mocked(useCountdown).mockReturnValue(countdownOver)

            renderPage()
            await screen.findByText('ACTIVE')

            expect(screen.queryByText(/ends in/i)).not.toBeInTheDocument()
        })
    })

    // ── Upcoming sale ─────────────────────────────────────────

    describe('Upcoming sale', () => {
        beforeEach(() => {
            vi.mocked(saleApi.getActive).mockResolvedValue(upcomingSaleResponse)
        })

        it('shows UPCOMING badge', async () => {
            renderPage()
            expect(await screen.findByText('UPCOMING')).toBeInTheDocument()
        })

        it('shows "Starts in" countdown label', async () => {
            renderPage()
            expect(await screen.findByText(/starts in/i)).toBeInTheDocument()
        })

        it('shows "Sale starts soon!" hint instead of buy button', async () => {
            renderPage()
            expect(await screen.findByText(/sale starts soon/i)).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
        })
    })

    // ── Top panel (guest vs buyer) ────────────────────────────

    describe('Top panel', () => {
        beforeEach(() => {
            vi.mocked(saleApi.getActive).mockResolvedValue(activeSaleResponse)
        })

        it('shows "Guest Mode" status for unauthenticated users', async () => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
            renderPage()
            expect(await screen.findByText('Guest Mode')).toBeInTheDocument()
        })

        it('shows "Shopping Mode Active" for logged-in buyers', async () => {
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
            renderPage()
            expect(await screen.findByText('Shopping Mode Active')).toBeInTheDocument()
        })

        it('shows Login link for guests', async () => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
            renderPage()
            const link = await screen.findByRole('link', { name: /login/i })
            expect(link).toHaveAttribute('href', '/login')
        })

        it('shows My Purchase link for logged-in buyers', async () => {
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
            renderPage()
            const link = await screen.findByRole('link', { name: /my purchase/i })
            expect(link).toHaveAttribute('href', '/my-purchase')
        })

        it('shows logout button for logged-in users', async () => {
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
            renderPage()
            expect(await screen.findByRole('button', { name: /logout/i })).toBeInTheDocument()
        })

        it('calls logout when logout button is clicked', async () => {
            const mockLogout = vi.fn()
            vi.mocked(useAuth).mockReturnValue({ ...buyerAuth, logout: mockLogout })
            renderPage()

            const logoutBtn = await screen.findByRole('button', { name: /logout/i })
            fireEvent.click(logoutBtn)

            expect(mockLogout).toHaveBeenCalledOnce()
        })

        it('does not show logout button for guests', async () => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
            renderPage()
            await screen.findByText('Guest Mode')
            expect(screen.queryByRole('button', { name: /logout/i })).not.toBeInTheDocument()
        })

        it('hides the top panel entirely for admin role', async () => {
            vi.mocked(useAuth).mockReturnValue(adminAuth)
            renderPage()
            await screen.findByText('ACTIVE')
            expect(screen.queryByText('Shopping Mode Active')).not.toBeInTheDocument()
        })
    })

    // ── Purchase button visibility ────────────────────────────

    describe('Purchase button visibility', () => {
        beforeEach(() => {
            vi.mocked(saleApi.getActive).mockResolvedValue(activeSaleResponse)
        })

        it('shows "Log in to buy" prompt for guests on active sale', async () => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
            renderPage()
            expect(await screen.findByText(/log in/i)).toBeInTheDocument()
            expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
        })

        it('shows Buy Now button for authenticated buyers', async () => {
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
            renderPage()
            expect(await screen.findByRole('button', { name: /buy now/i })).toBeInTheDocument()
        })

        it('does not show Buy Now button for admin role', async () => {
            vi.mocked(useAuth).mockReturnValue(adminAuth)
            renderPage()
            await screen.findByText('ACTIVE')
            expect(screen.queryByRole('button', { name: /buy now/i })).not.toBeInTheDocument()
        })
    })

    // ── Purchase mutation ─────────────────────────────────────

    describe('Purchase mutation', () => {
        beforeEach(() => {
            vi.mocked(saleApi.getActive).mockResolvedValue(activeSaleResponse)
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
        })

        it('shows Processing... and disables button while pending', async () => {
            vi.mocked(purchaseApi.buy).mockReturnValue(new Promise(() => { }))

            renderPage()
            const buyBtn = await screen.findByRole('button', { name: /buy now/i })
            fireEvent.click(buyBtn)

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /processing/i })).toBeDisabled()
            })
        })

        it('shows success message on successful purchase', async () => {
            vi.mocked(purchaseApi.buy).mockResolvedValue({ status: 'ok', message: 'reserved' })

            renderPage()
            const buyBtn = await screen.findByRole('button', { name: /buy now/i })
            fireEvent.click(buyBtn)

            expect(await screen.findByText(/reserved! processing your order/i)).toBeInTheDocument()
        })

        it('shows SaleNotActive error message correctly', async () => {
            vi.mocked(purchaseApi.buy).mockRejectedValue({ code: 'SaleNotActive' })

            renderPage()
            fireEvent.click(await screen.findByRole('button', { name: /buy now/i }))

            expect(await screen.findByText(/sale is not active/i)).toBeInTheDocument()
        })

        it('shows AlreadyPurchased error message correctly', async () => {
            vi.mocked(purchaseApi.buy).mockRejectedValue({ code: 'AlreadyPurchased' })

            renderPage()
            fireEvent.click(await screen.findByRole('button', { name: /buy now/i }))

            expect(await screen.findByText(/you already bought this/i)).toBeInTheDocument()
        })

        it('shows SoldOut error message correctly', async () => {
            vi.mocked(purchaseApi.buy).mockRejectedValue({ code: 'SoldOut' })

            renderPage()
            fireEvent.click(await screen.findByRole('button', { name: /buy now/i }))

            expect(await screen.findByText(/sold out/i)).toBeInTheDocument()
        })

        it('falls back to err.error for unknown error codes', async () => {
            vi.mocked(purchaseApi.buy).mockRejectedValue({ code: 'Unknown', error: 'Custom error message' })

            renderPage()
            fireEvent.click(await screen.findByRole('button', { name: /buy now/i }))

            expect(await screen.findByText('Custom error message')).toBeInTheDocument()
        })

        it('falls back to generic message when no code or error field', async () => {
            vi.mocked(purchaseApi.buy).mockRejectedValue({})

            renderPage()
            fireEvent.click(await screen.findByRole('button', { name: /buy now/i }))

            expect(await screen.findByText(/something went wrong/i)).toBeInTheDocument()
        })

        it('clears purchase message when Buy Now is clicked again', async () => {
            vi.mocked(purchaseApi.buy)
                .mockRejectedValueOnce({ code: 'SoldOut' })
                .mockReturnValueOnce(new Promise(() => { }))

            renderPage()
            const buyBtn = await screen.findByRole('button', { name: /buy now/i })

            fireEvent.click(buyBtn)
            await screen.findByText(/sold out/i)

            fireEvent.click(screen.getByRole('button', { name: /buy now/i }))
            expect(screen.queryByText(/sold out/i)).not.toBeInTheDocument()
        })
    })
})
