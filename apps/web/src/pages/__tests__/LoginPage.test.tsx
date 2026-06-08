// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { MemoryRouter } from 'react-router-dom'
import LoginPage from '../LoginPage'
import { saleApi } from '../../lib/api'
import { useAuth } from '../../context/AuthContext'

// ── Module mocks (hoisted) ────────────────────────────────────

vi.mock('../../lib/api', () => ({
    saleApi: {
        login: vi.fn(),
    },
}))

vi.mock('../../context/AuthContext', () => ({
    useAuth: vi.fn(),
}))

// react-router-dom: keep Link/MemoryRouter real, mock only useNavigate
const mockNavigate = vi.fn()
vi.mock('react-router-dom', async () => {
    const actual = await vi.importActual<typeof import('react-router-dom')>('react-router-dom')
    return { ...actual, useNavigate: () => mockNavigate }
})

// ── Helpers ───────────────────────────────────────────────────

function renderPage() {
    const qc = new QueryClient({
        defaultOptions: { mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={qc}>
            <MemoryRouter>
                <LoginPage />
            </MemoryRouter>
        </QueryClientProvider>
    )
}

const mockLogin = vi.fn()

// ── Suite ─────────────────────────────────────────────────────

describe('LoginPage', () => {

    beforeEach(() => {
        vi.clearAllMocks()
            ; (vi.mocked(useAuth)).mockReturnValue({ login: mockLogin })
    })

    // ── Render ────────────────────────────────────────────────

    describe('Initial render', () => {
        it('renders the heading', () => {
            renderPage()
            expect(screen.getByRole('heading', { name: /log in/i })).toBeInTheDocument()
        })

        it('renders email and password inputs', () => {
            renderPage()
            expect(screen.getByPlaceholderText('Email')).toBeInTheDocument()
            expect(screen.getByPlaceholderText('Password')).toBeInTheDocument()
        })

        it('renders the submit button in idle state', () => {
            renderPage()
            const btn = screen.getByRole('button', { name: /log in/i })
            expect(btn).toBeInTheDocument()
            expect(btn).not.toBeDisabled()
        })

        it('renders register and admin links', () => {
            renderPage()
            expect(screen.getByRole('link', { name: /register/i })).toHaveAttribute('href', '/register')
            expect(screen.getByRole('link', { name: /admin login/i })).toHaveAttribute('href', '/admin')
        })

        it('does not show an error message on first render', () => {
            renderPage()
            expect(screen.queryByRole('alert')).not.toBeInTheDocument()
        })
    })

    // ── Form interaction ──────────────────────────────────────

    describe('Form interaction', () => {
        it('updates email field value as user types', () => {
            renderPage()
            const emailInput = screen.getByPlaceholderText('Email')
            fireEvent.change(emailInput, { target: { value: 'user@example.com' } })
            expect(emailInput).toHaveValue('user@example.com')
        })

        it('updates password field value as user types', () => {
            renderPage()
            const passwordInput = screen.getByPlaceholderText('Password')
            fireEvent.change(passwordInput, { target: { value: 'secret123' } })
            expect(passwordInput).toHaveValue('secret123')
        })

        it('password input has type="password" (masked)', () => {
            renderPage()
            expect(screen.getByPlaceholderText('Password')).toHaveAttribute('type', 'password')
        })
    })

    // ── Successful login ──────────────────────────────────────

    describe('Successful login', () => {
        it('calls saleApi.login with the entered credentials', async () => {
            ; vi.mocked(saleApi.login).mockResolvedValue({
                token: 'jwt-token',
                user: { id: '1', email: 'user@example.com', name: 'User' },
            })

            renderPage()
            fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'user@example.com' } })
            fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret123' } })
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(saleApi.login).toHaveBeenCalledWith({
                    email: 'user@example.com',
                    password: 'secret123',
                })
            })
        })

        it('calls auth context login() with the returned token and buyer role', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
                token: 'jwt-token',
                user: { id: '1', email: 'user@example.com', name: 'User' },
            })

            renderPage()
            fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'user@example.com' } })
            fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'secret123' } })
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(mockLogin).toHaveBeenCalledWith('jwt-token', 'buyer')
            })
        })

        it('navigates to / after successful login', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockResolvedValue({
                token: 'jwt-token',
                user: { id: '1', email: 'user@example.com', name: 'User' },
            })

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(mockNavigate).toHaveBeenCalledWith('/')
            })
        })
    })

    // ── Pending state ─────────────────────────────────────────

    describe('Pending / loading state', () => {
        it('disables the button while the mutation is in-flight', async () => {
            // Never resolves during this test
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => { }))

            renderPage()
            fireEvent.change(screen.getByPlaceholderText('Email'), { target: { value: 'a@b.com' } })
            fireEvent.change(screen.getByPlaceholderText('Password'), { target: { value: 'pw' } })
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(screen.getByRole('button', { name: /logging in/i })).toBeDisabled()
            })
        })

        it('shows "Logging in…" text while pending', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockReturnValue(new Promise(() => { }))

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(screen.getByRole('button')).toHaveTextContent(/logging in/i)
            })
        })
    })

    // ── Error state ───────────────────────────────────────────

    describe('Error handling', () => {
        it('displays the error message returned by the API', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockRejectedValue({
                error: 'Invalid credentials',
            })

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(screen.getByText('Invalid credentials')).toBeInTheDocument()
            })
        })

        it('falls back to "Login failed" when error has no message', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>).mockRejectedValue({})

            renderPage()
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))

            await waitFor(() => {
                expect(screen.getByText('Login failed')).toBeInTheDocument()
            })
        })

        it('clears a previous error message when submit is clicked again', async () => {
            ; (saleApi.login as ReturnType<typeof vi.fn>)
                .mockRejectedValueOnce({ error: 'Invalid credentials' })
                .mockResolvedValueOnce({ token: 't', user: {} })

            renderPage()

            // First click — trigger error
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))
            await waitFor(() => screen.getByText('Invalid credentials'))

            // Second click — error should disappear immediately (setErr(null) fires synchronously)
            fireEvent.click(screen.getByRole('button', { name: /log in/i }))
            expect(screen.queryByText('Invalid credentials')).not.toBeInTheDocument()
        })
    })
})
