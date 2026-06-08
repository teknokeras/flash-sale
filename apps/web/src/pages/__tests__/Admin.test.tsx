// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import AdminPage from '../AdminPage'
import { adminApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
    adminApi: {
        login: vi.fn(),
    },
}))

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}))

// Sub-tab children — too heavy to render for AdminPage unit tests
vi.mock('../AdminPage/SalesTab', () => ({
    default: ({ onSelectSale }: { onSelectSale: (id: string) => void }) => (
        <div data-testid="sales-tab">
            <button onClick={() => onSelectSale('sale-123')}>Select Sale</button>
        </div>
    ),
}))

vi.mock('../AdminPage/ItemsTab', () => ({
    default: () => <div data-testid="items-tab" />,
}))

vi.mock('../AdminPage/OrdersTab', () => ({
    default: ({ selectedSaleId }: { selectedSaleId: string | null }) => (
        <div data-testid="orders-tab" data-sale-id={selectedSaleId ?? ''} />
    ),
}))

vi.mock('../AdminPage/adminStyles', () => ({
    s: new Proxy({}, { get: () => ({}) }),
}))

// ── Auth fixtures ─────────────────────────────────────────────

const guestAuth = { isLoggedIn: false, role: null, login: vi.fn(), logout: vi.fn() }
const adminAuth = { isLoggedIn: true, role: 'admin', login: vi.fn(), logout: vi.fn() }
const buyerAuth = { isLoggedIn: true, role: 'buyer', login: vi.fn(), logout: vi.fn() }

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
    const qc = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={qc}>
            <AdminPage />
        </QueryClientProvider>
    )
}

// ── Suite ─────────────────────────────────────────────────────

describe('AdminPage', () => {

    beforeEach(() => {
        vi.clearAllMocks()
    })

    // ── Login form (unauthenticated) ──────────────────────────

    describe('Login form — unauthenticated', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
        })

        it('renders the Admin Login heading', () => {
            renderPage()
            expect(screen.getByRole('heading', { name: /admin login/i })).toBeInTheDocument()
        })

        it('pre-fills the email field with default value', () => {
            renderPage()
            expect(screen.getByPlaceholderText('Email')).toHaveValue('admin@local.dev')
        })

        it('renders an empty password field', () => {
            renderPage()
            expect(screen.getByPlaceholderText('Password')).toHaveValue('')
        })

        it('password input is masked', () => {
            renderPage()
            expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password')
        })

        it('renders the Log in button in idle state', () => {
            renderPage()
            const btn = screen.getByRole('button', { name: /log in/i })
            expect(btn).toBeInTheDocument()
            expect(btn).not.toBeDisabled()
        })

        it('does not show an error on initial render', () => {
            renderPage()
            expect(screen.queryByText(/login failed/i)).not.toBeInTheDocument()
        })

        it('updates the email field when typed into', () => {
            renderPage()
            const emailInput = screen.getByPlaceholderText('Email')
            fireEvent.change(emailInput, { target: { value: 'other@example.com' } })
            expect(emailInput).toHaveValue('other@example.com')
        })

        it('updates the password field when typed into', () => {
            renderPage()
            const passwordInput = screen.getByPlaceholderText('Password')
            fireEvent.change(passwordInput, { target: { value: 'secret' } })
            expect(passwordInput).toHaveValue('secret')
        })

        it('shows the admin dashboard when role is buyer (not admin)', () => {
            // Buyer is also treated as unauthenticated for admin purposes
            vi.mocked(useAuth).mockReturnValue(buyerAuth)
            renderPage()
            expect(screen.getByRole('heading', { name: /admin login/i })).toBeInTheDocument()
        })
    })

    // ── Login mutation ────────────────────────────────────────

    describe('Login mutation', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(guestAuth)
        })

        it('calls adminApi.login with current credentials on submit', async () => {
            vi.mocked(adminApi.login).mockResolvedValue({ token: 'admin-jwt' })

            renderPage()
            fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw123' } })
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(adminApi.login).toHaveBeenCalledWith({
                    email: 'admin@local.dev',
                    password: 'pw123',
                })
            })
        })

        it('calls auth context login() with token and admin role on success', async () => {
            const mockLogin = vi.fn()
            vi.mocked(useAuth).mockReturnValue({ ...guestAuth, login: mockLogin })
            vi.mocked(adminApi.login).mockResolvedValue({ token: 'admin-jwt' })

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(mockLogin).toHaveBeenCalledWith('admin-jwt', 'admin')
            })
        })

        it('shows Logging in... and disables button while pending', async () => {
            vi.mocked(adminApi.login).mockReturnValue(new Promise(() => { }))

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled()
            })
        })

        it('shows API error message on failure', async () => {
            vi.mocked(adminApi.login).mockRejectedValue({ error: 'Invalid credentials' })

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            expect(await screen.findByText('Invalid credentials')).toBeInTheDocument()
        })

        it('falls back to "Login failed" when error has no message', async () => {
            vi.mocked(adminApi.login).mockRejectedValue({})

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            expect(await screen.findByText('Login failed')).toBeInTheDocument()
        })
    })

    // ── Authenticated dashboard ───────────────────────────────

    describe('Authenticated dashboard', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(adminAuth)
        })

        it('renders the Flash Admin logo in the sidebar', () => {
            renderPage()
            expect(screen.getByText(/flash admin/i)).toBeInTheDocument()
        })

        it('renders all three nav buttons', () => {
            renderPage()
            expect(screen.getByRole('button', { name: /sales/i })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /items/i })).toBeInTheDocument()
            expect(screen.getByRole('button', { name: /orders/i })).toBeInTheDocument()
        })

        it('renders the logout button', () => {
            renderPage()
            expect(screen.getByRole('button', { name: /logout/i })).toBeInTheDocument()
        })

        it('calls auth logout when logout button is clicked', () => {
            const mockLogout = vi.fn()
            vi.mocked(useAuth).mockReturnValue({ ...adminAuth, logout: mockLogout })
            renderPage()

            fireEvent.click(screen.getByRole('button', { name: /logout/i }))

            expect(mockLogout).toHaveBeenCalledOnce()
        })

        it('does not render the login form when authenticated as admin', () => {
            renderPage()
            expect(screen.queryByRole('heading', { name: /admin login/i })).not.toBeInTheDocument()
        })
    })

    // ── Tab navigation ────────────────────────────────────────

    describe('Tab navigation', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(adminAuth)
        })

        it('shows SalesTab by default', () => {
            renderPage()
            expect(screen.getByTestId('sales-tab')).toBeInTheDocument()
            expect(screen.queryByTestId('items-tab')).not.toBeInTheDocument()
            expect(screen.queryByTestId('orders-tab')).not.toBeInTheDocument()
        })

        it('switches to ItemsTab when Items nav button is clicked', () => {
            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /items/i }))

            expect(screen.getByTestId('items-tab')).toBeInTheDocument()
            expect(screen.queryByTestId('sales-tab')).not.toBeInTheDocument()
        })

        it('switches to OrdersTab when Orders nav button is clicked', () => {
            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /orders/i }))

            expect(screen.getByTestId('orders-tab')).toBeInTheDocument()
            expect(screen.queryByTestId('sales-tab')).not.toBeInTheDocument()
        })

        it('switches back to SalesTab from another tab', () => {
            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /items/i }))
            fireEvent.click(screen.getByRole('button', { name: /sales/i }))

            expect(screen.getByTestId('sales-tab')).toBeInTheDocument()
            expect(screen.queryByTestId('items-tab')).not.toBeInTheDocument()
        })
    })

    // ── Sale selection (SalesTab → OrdersTab) ─────────────────

    describe('Sale selection cross-tab navigation', () => {
        beforeEach(() => {
            vi.mocked(useAuth).mockReturnValue(adminAuth)
        })

        it('switches to OrdersTab when a sale is selected from SalesTab', () => {
            renderPage()

            // SalesTab mock exposes a "Select Sale" button that calls onSelectSale
            fireEvent.click(screen.getByRole('button', { name: /select sale/i }))

            expect(screen.getByTestId('orders-tab')).toBeInTheDocument()
            expect(screen.queryByTestId('sales-tab')).not.toBeInTheDocument()
        })

        it('passes the selected sale ID to OrdersTab', () => {
            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /select sale/i }))

            expect(screen.getByTestId('orders-tab')).toHaveAttribute('data-sale-id', 'sale-123')
        })

        it('passes null sale ID to OrdersTab before any sale is selected', () => {
            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /orders/i }))

            expect(screen.getByTestId('orders-tab')).toHaveAttribute('data-sale-id', '')
        })
    })
})
