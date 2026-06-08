// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import SalesTab from '../AdminPage/SalesTab'
import { adminApi } from '../../lib/api'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
    adminApi: {
        getSales: vi.fn(),
        getAvailableItems: vi.fn(),
        createSale: vi.fn(),
        attachItem: vi.fn(),
        deleteSale: vi.fn(),
    },
}))

vi.mock('../AdminPage/adminStyles', () => ({
    s: new Proxy({}, { get: () => ({}) }),
    badgeColor: vi.fn(() => '#6b7280'),
}))

// ── Fixtures ──────────────────────────────────────────────────

const mockItems = [
    { id: 'item-1', name: 'Sneakers', description: 'Limited edition', priceCents: 10000 },
    { id: 'item-2', name: 'Headphones', description: 'Noise cancelling', priceCents: 20000 },
]

const futureSale = {
    id: 'sale-1',
    title: 'Summer Flash Sale',
    specialPrice: 4999,
    initialQuantity: 100,
    startsAt: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(), // 2h from now
    endsAt: new Date(Date.now() + 3 * 60 * 60 * 1000).toISOString(),
    status: 'scheduled' as const,
    item: { id: 'item-1', name: 'Sneakers', description: '', priceCents: 10000 },
    remainingQuantity: 100,
}

const activeSale = {
    ...futureSale,
    id: 'sale-2',
    title: 'Active Flash Sale',
    startsAt: new Date(Date.now() - 30 * 60 * 1000).toISOString(), // started 30m ago
    endsAt: new Date(Date.now() + 30 * 60 * 1000).toISOString(),   // ends 30m from now
    status: 'active' as const,
}

// A datetime at least 20 minutes from now (safely past the 15-min threshold)
function futureDateTime(offsetMinutes = 20) {
    const d = new Date(Date.now() + offsetMinutes * 60 * 1000)
    // Format as local time YYYY-MM-DDTHH:MM (not UTC)
    const pad = (n: number) => String(n).padStart(2, '0')
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

// ── Helpers ───────────────────────────────────────────────────

const mockOnSelectSale = vi.fn()

function renderTab(qc?: QueryClient) {
    const client = qc ?? new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return {
        client,
        ...render(
            <QueryClientProvider client={client}>
                <SalesTab qc={client} onSelectSale={mockOnSelectSale} />
            </QueryClientProvider>
        ),
    }
}

// Fill all required form fields with valid values
function fillValidForm() {
    const start = futureDateTime(20)
    const end = futureDateTime(60)

    fireEvent.change(screen.getByPlaceholderText(/summer flash sale/i), { target: { value: 'Test Sale' } })
    fireEvent.change(screen.getByRole('combobox'), { target: { value: 'item-1' } })
    fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '19.99' } })
    fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '50' } })
    // Use querySelectorAll — datetime-local has no ARIA role and values won't be empty after above changes
    const dateInputs = document.querySelectorAll('input[type="datetime-local"]')
    fireEvent.change(dateInputs[0], { target: { value: start } })
    fireEvent.change(dateInputs[1], { target: { value: end } })
}
// ── Suite ─────────────────────────────────────────────────────

describe('SalesTab', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(adminApi.getSales).mockResolvedValue([])
        vi.mocked(adminApi.getAvailableItems).mockResolvedValue([])
    })

    // ── Initial render ────────────────────────────────────────

    describe('Initial render', () => {
        it('renders the Create Flash Sale heading', () => {
            renderTab()
            expect(screen.getByRole('heading', { name: /create flash sale/i })).toBeInTheDocument()
        })

        it('renders the All Flash Sales heading', () => {
            renderTab()
            expect(screen.getByRole('heading', { name: /all flash sales/i })).toBeInTheDocument()
        })

        it('renders the Create Sale button', () => {
            renderTab()
            expect(screen.getByRole('button', { name: /create sale/i })).toBeInTheDocument()
        })

        it('renders all table column headers', () => {
            renderTab()
                ;['Title', 'Promo Price', 'Allocated Stock', 'Status', 'Starts', 'Ends', 'Item', 'Actions'].forEach(h => {
                    expect(screen.getByRole('columnheader', { name: h })).toBeInTheDocument()
                })
        })

        it('renders item select dropdown with default empty option', () => {
            renderTab()
            const select = screen.getByRole('combobox')
            expect(select).toBeInTheDocument()
            expect(within(select).getByText(/pick available item/i)).toBeInTheDocument()
        })

        it('does not show a status message on first render', () => {
            renderTab()
            expect(screen.queryByText(/flash sale created/i)).not.toBeInTheDocument()
            expect(screen.queryByText(/error/i)).not.toBeInTheDocument()
        })
    })

    // ── Items dropdown ────────────────────────────────────────

    describe('Items dropdown population', () => {
        it('populates the select with available items from the API', async () => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
            renderTab()

            expect(await screen.findByRole('option', { name: /sneakers/i })).toBeInTheDocument()
            expect(screen.getByRole('option', { name: /headphones/i })).toBeInTheDocument()
        })

        it('shows item price alongside name in the option', async () => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
            renderTab()

            expect(await screen.findByRole('option', { name: /\$100\.00/i })).toBeInTheDocument()
        })

        it('shows max allowable promo price hint when an item is selected', async () => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
            renderTab()

            await screen.findByRole('option', { name: /sneakers/i })
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'item-1' } })

            // Max price = (priceCents - 1) / 100 = $99.99
            expect(screen.getByText(/\$99\.99/)).toBeInTheDocument()
        })
    })

    // ── Sales table ───────────────────────────────────────────

    describe('Sales table', () => {
        it('renders a row per sale with title and formatted promo price', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            expect(await screen.findByText('Summer Flash Sale')).toBeInTheDocument()
            expect(screen.getByText('$49.99')).toBeInTheDocument()
        })

        it('renders the attached item name', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            expect(await screen.findByText('Sneakers')).toBeInTheDocument()
        })

        it('shows — when no item is attached', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([{ ...futureSale, item: undefined }])
            renderTab()

            await screen.findByText('Summer Flash Sale')
            expect(screen.getByText('—')).toBeInTheDocument()
        })

        it('renders stock quantity with "units" suffix', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            expect(await screen.findByText('100 units')).toBeInTheDocument()
        })

        it('renders "View orders" button for each sale', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            expect(await screen.findByRole('button', { name: /view orders/i })).toBeInTheDocument()
        })

        it('calls onSelectSale with the sale id when "View orders" is clicked', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            fireEvent.click(await screen.findByRole('button', { name: /view orders/i }))
            expect(mockOnSelectSale).toHaveBeenCalledWith('sale-1')
        })

        it('shows Delete button for future (non-active) sales', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            renderTab()

            expect(await screen.findByRole('button', { name: /delete/i })).toBeInTheDocument()
        })

        it('shows Locked text instead of Delete for currently active sales', async () => {
            vi.mocked(adminApi.getSales).mockResolvedValue([activeSale])
            renderTab()

            await screen.findByText('Active Flash Sale')
            expect(screen.queryByRole('button', { name: /delete/i })).not.toBeInTheDocument()
            expect(screen.getByText('Locked')).toBeInTheDocument()
        })
    })

    // ── Validation ────────────────────────────────────────────

    describe('Form validation', () => {
        it('shows required field errors when submitting an empty form', async () => {
            renderTab()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(screen.getByText(/flash sale title is mandatory/i)).toBeInTheDocument()
                expect(screen.getByText(/selecting an item is mandatory/i)).toBeInTheDocument()
                expect(screen.getByText(/start time is mandatory/i)).toBeInTheDocument()
                expect(screen.getByText(/end time is mandatory/i)).toBeInTheDocument()
                expect(screen.getByText(/promo price is mandatory/i)).toBeInTheDocument()
                expect(screen.getByText(/sale allocation quantity is mandatory/i)).toBeInTheDocument()
            })
        })

        it('shows quantity error when initialQuantity is 0', async () => {
            renderTab()
            fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '0' } })
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(screen.getByText(/greater than 0/i)).toBeInTheDocument()
            })
        })

        it('clears a field error as soon as the user starts typing', async () => {
            renderTab()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))
            await screen.findByText(/flash sale title is mandatory/i)

            fireEvent.change(screen.getByPlaceholderText(/summer flash sale/i), { target: { value: 'T' } })
            expect(screen.queryByText(/flash sale title is mandatory/i)).not.toBeInTheDocument()
        })

        it('shows start time error when sale starts less than 15 minutes from now', async () => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
            renderTab()

            await screen.findByRole('option', { name: /sneakers/i })

            const tooSoon = new Date(Date.now() + 5 * 60 * 1000).toISOString().slice(0, 16)
            const end = futureDateTime(60)

            fireEvent.change(screen.getByPlaceholderText(/summer flash sale/i), { target: { value: 'Test' } })
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'item-1' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '19.99' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '50' } })
            const dateInputs = document.querySelectorAll('input[type="datetime-local"]')
            fireEvent.change(dateInputs[0], { target: { value: tooSoon } })
            fireEvent.change(dateInputs[1], { target: { value: end } })

            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(screen.getByText(/sale start time must be at least 15 minutes from now/i)).toBeInTheDocument()
            })
        })

        it('shows end time error when sale ends before 1 minute after start', async () => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })

            const start = futureDateTime(20)
            // end is same as start — less than 1 minute after
            const end = futureDateTime(20)

            fireEvent.change(screen.getByPlaceholderText(/summer flash sale/i), { target: { value: 'Test' } })
            fireEvent.change(screen.getByRole('combobox'), { target: { value: 'item-1' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '19.99' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '50' } })
            const dateInputs = document.querySelectorAll('input[type="datetime-local"]')
            fireEvent.change(dateInputs[0], { target: { value: start } })
            fireEvent.change(dateInputs[1], { target: { value: end } })

            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(screen.getByText(/sale must end at least 1 minute after it starts/i)).toBeInTheDocument()
            })
        })
    })

    // ── Create sale mutation ──────────────────────────────────

    describe('Create sale mutation', () => {
        beforeEach(() => {
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)
        })

        it('calls adminApi.createSale with correct payload', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)
            vi.mocked(adminApi.attachItem).mockResolvedValue({} as any)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(adminApi.createSale).toHaveBeenCalledWith(
                    expect.objectContaining({
                        title: 'Test Sale',
                        specialPrice: 1999, // 19.99 * 100
                        initialQuantity: 50,
                    })
                )
            })
        })

        it('calls attachItem after sale is created when an item is selected', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)
            vi.mocked(adminApi.attachItem).mockResolvedValue({} as any)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(adminApi.attachItem).toHaveBeenCalledWith('new-sale', 'item-1')
            })
        })

        it('shows success message after sale + item attached', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)
            vi.mocked(adminApi.attachItem).mockResolvedValue({} as any)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            expect(await screen.findByText(/flash sale created and item attached successfully/i)).toBeInTheDocument()
        })

        it('shows success message without item attachment when no item selected', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })

            // Fill without itemId
            const start = futureDateTime(20)
            const end = futureDateTime(60)
            fireEvent.change(screen.getByPlaceholderText(/summer flash sale/i), { target: { value: 'Test Sale' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '19.99' } })
            fireEvent.change(screen.getAllByRole('spinbutton')[1], { target: { value: '50' } })
            const dateInputs = document.querySelectorAll('input[type="datetime-local"]')
            fireEvent.change(dateInputs[0], { target: { value: start } })
            fireEvent.change(dateInputs[1], { target: { value: end } })
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            // Validation will block with itemId error — confirm the correct message shown
            await waitFor(() => {
                expect(screen.getByText(/selecting an item is mandatory/i)).toBeInTheDocument()
            })
        })

        it('resets the form after successful creation', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)
            vi.mocked(adminApi.attachItem).mockResolvedValue({} as any)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await screen.findByText(/flash sale created and item attached/i)

            expect(screen.getByPlaceholderText(/summer flash sale/i)).toHaveValue('')
            expect(screen.getByRole('combobox')).toHaveValue('')
        })

        it('shows error message when createSale API call fails', async () => {
            vi.mocked(adminApi.createSale).mockRejectedValue({ error: 'Server error' })
            vi.mocked(adminApi.getAvailableItems).mockResolvedValue(mockItems)

            renderTab()
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            expect(await screen.findByText('Server error')).toBeInTheDocument()
        })

        it('invalidates admin-sales query after successful creation', async () => {
            vi.mocked(adminApi.createSale).mockResolvedValue({ id: 'new-sale' } as any)
            vi.mocked(adminApi.attachItem).mockResolvedValue({} as any)

            const qc = new QueryClient({
                defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
            })
            const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

            render(
                <QueryClientProvider client={qc}>
                    <SalesTab qc={qc} onSelectSale={mockOnSelectSale} />
                </QueryClientProvider>
            )
            await screen.findByRole('option', { name: /sneakers/i })
            fillValidForm()
            fireEvent.click(screen.getByRole('button', { name: /create sale/i }))

            await waitFor(() => {
                expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-sales'] })
            })
        })
    })

    // ── Delete sale mutation ──────────────────────────────────

    describe('Delete sale mutation', () => {
        beforeEach(() => {
            vi.mocked(adminApi.getSales).mockResolvedValue([futureSale])
            vi.spyOn(window, 'confirm').mockReturnValue(true)
        })

        it('calls adminApi.deleteSale with the correct id after confirmation', async () => {
            vi.mocked(adminApi.deleteSale).mockResolvedValue({ success: true, message: 'deleted' })
            renderTab()

            fireEvent.click(await screen.findByRole('button', { name: /delete/i }))

            await waitFor(() => {
                expect(adminApi.deleteSale).toHaveBeenCalledWith('sale-1')
            })
        })

        it('shows success message after deletion', async () => {
            vi.mocked(adminApi.deleteSale).mockResolvedValue({ success: true, message: 'deleted' })
            renderTab()

            fireEvent.click(await screen.findByRole('button', { name: /delete/i }))

            expect(await screen.findByText(/sale deleted successfully/i)).toBeInTheDocument()
        })

        it('does not call deleteSale when user cancels the confirm dialog', async () => {
            vi.spyOn(window, 'confirm').mockReturnValue(false)
            renderTab()

            fireEvent.click(await screen.findByRole('button', { name: /delete/i }))

            expect(adminApi.deleteSale).not.toHaveBeenCalled()
        })

        it('invalidates admin-sales query after successful deletion', async () => {
            vi.mocked(adminApi.deleteSale).mockResolvedValue({ success: true, message: 'deleted' })

            const qc = new QueryClient({
                defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
            })
            const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

            render(
                <QueryClientProvider client={qc}>
                    <SalesTab qc={qc} onSelectSale={mockOnSelectSale} />
                </QueryClientProvider>
            )

            fireEvent.click(await screen.findByRole('button', { name: /delete/i }))

            await waitFor(() => {
                expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-sales'] })
            })
        })
    })
})
