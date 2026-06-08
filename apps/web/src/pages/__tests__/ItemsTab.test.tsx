// @vitest-environment jsdom
import '@testing-library/jest-dom'
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor } from '@testing-library/react'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import ItemsTab from '../AdminPage/ItemsTab'
import { adminApi } from '../../lib/api'

// ── Module mocks ──────────────────────────────────────────────

vi.mock('../../lib/api', () => ({
    adminApi: {
        getItems: vi.fn(),
        createItem: vi.fn(),
    },
}))

vi.mock('../AdminPage/adminStyles', () => ({
    s: new Proxy({}, { get: () => ({}) }),
}))

// ── Fixtures ──────────────────────────────────────────────────

const mockItems = [
    { id: 'item-1', name: 'Sneakers', description: 'Limited edition', priceCents: 4999 },
    { id: 'item-2', name: 'Headphones', description: 'Noise cancelling', priceCents: 9900 },
]

// ── Helpers ───────────────────────────────────────────────────

function renderTab(qc?: QueryClient) {
    const client = qc ?? new QueryClient({
        defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    })
    return render(
        <QueryClientProvider client={client}>
            <ItemsTab qc={client} />
        </QueryClientProvider>
    )
}

function fillForm({ name = '', description = '', priceCents = '' } = {}) {
    const [nameInput, descInput] = screen.getAllByRole('textbox')
    const priceInput = screen.getByRole('spinbutton') // type="number"
    if (name) fireEvent.change(nameInput, { target: { value: name } })
    if (description) fireEvent.change(descInput, { target: { value: description } })
    if (priceCents) fireEvent.change(priceInput, { target: { value: priceCents } })
}

// ── Suite ─────────────────────────────────────────────────────

describe('ItemsTab', () => {

    beforeEach(() => {
        vi.clearAllMocks()
        vi.mocked(adminApi.getItems).mockResolvedValue([])
    })

    // ── Initial render ────────────────────────────────────────

    describe('Initial render', () => {
        it('renders the Create Item heading', () => {
            renderTab()
            expect(screen.getByRole('heading', { name: /create item/i })).toBeInTheDocument()
        })

        it('renders the All Items heading', () => {
            renderTab()
            expect(screen.getByRole('heading', { name: /all items/i })).toBeInTheDocument()
        })

        it('renders Name, Description, and Price fields', () => {
            renderTab()
            const [nameInput, descInput] = screen.getAllByRole('textbox')
            expect(nameInput).toBeInTheDocument()
            expect(descInput).toBeInTheDocument()
            expect(screen.getByRole('spinbutton')).toBeInTheDocument()
        })

        it('all form fields start empty', () => {
            renderTab()
            const [nameInput, descInput] = screen.getAllByRole('textbox')
            expect(nameInput).toHaveValue('')
            expect(descInput).toHaveValue('')
            expect(screen.getByRole('spinbutton')).toHaveValue(null)
        })

        it('price field has type="number"', () => {
            renderTab()
            expect(screen.getByRole('spinbutton')).toHaveAttribute('type', 'number')
        })

        it('renders the Create Item button', () => {
            renderTab()
            expect(screen.getByRole('button', { name: /create item/i })).toBeInTheDocument()
        })

        it('renders table column headers', () => {
            renderTab()
            expect(screen.getByRole('columnheader', { name: 'Name' })).toBeInTheDocument()
            expect(screen.getByRole('columnheader', { name: 'Description' })).toBeInTheDocument()
            expect(screen.getByRole('columnheader', { name: 'Price' })).toBeInTheDocument()
        })

        it('does not show a status message on first render', () => {
            renderTab()
            expect(screen.queryByText(/item created/i)).not.toBeInTheDocument()
        })
    })

    // ── Form interaction ──────────────────────────────────────

    describe('Form interaction', () => {
        it('updates the Name field as the user types', () => {
            renderTab()
            const nameInput = screen.getAllByRole('textbox')[0]
            fireEvent.change(nameInput, { target: { value: 'Air Max' } })
            expect(nameInput).toHaveValue('Air Max')
        })

        it('updates the Description field as the user types', () => {
            renderTab()
            const descInput = screen.getAllByRole('textbox')[1]
            fireEvent.change(descInput, { target: { value: 'Classic silhouette' } })
            expect(descInput).toHaveValue('Classic silhouette')
        })

        it('updates the Price field as the user types', () => {
            renderTab()
            const priceInput = screen.getByRole('spinbutton')
            fireEvent.change(priceInput, { target: { value: '4999' } })
            expect(priceInput).toHaveValue(4999)
        })
    })

    // ── Items list ────────────────────────────────────────────

    describe('Items list', () => {
        it('renders a row for each item returned by the API', async () => {
            vi.mocked(adminApi.getItems).mockResolvedValue(mockItems)

            renderTab()

            expect(await screen.findByText('Sneakers')).toBeInTheDocument()
            expect(screen.getByText('Headphones')).toBeInTheDocument()
        })

        it('renders item descriptions', async () => {
            vi.mocked(adminApi.getItems).mockResolvedValue(mockItems)

            renderTab()

            expect(await screen.findByText('Limited edition')).toBeInTheDocument()
            expect(screen.getByText('Noise cancelling')).toBeInTheDocument()
        })

        it('formats price correctly from cents to dollars', async () => {
            vi.mocked(adminApi.getItems).mockResolvedValue(mockItems)

            renderTab()

            expect(await screen.findByText('$49.99')).toBeInTheDocument()
            expect(screen.getByText('$99.00')).toBeInTheDocument()
        })

        it('renders an empty table body when there are no items', async () => {
            vi.mocked(adminApi.getItems).mockResolvedValue([])

            renderTab()
            await screen.findByRole('heading', { name: /all items/i })

            expect(screen.queryByRole('cell')).not.toBeInTheDocument()
        })
    })

    // ── Create item mutation ───────────────────────────────────

    describe('Create item mutation', () => {
        it('calls adminApi.createItem with correct payload on submit', async () => {
            vi.mocked(adminApi.createItem).mockResolvedValue({})

            renderTab()
            fillForm({ name: 'Air Max', description: 'Classic', priceCents: '4999' })
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            await waitFor(() => {
                expect(adminApi.createItem).toHaveBeenCalledWith({
                    name: 'Air Max',
                    description: 'Classic',
                    priceCents: 4999,
                })
            })
        })

        it('converts priceCents string to number before calling the API', async () => {
            vi.mocked(adminApi.createItem).mockResolvedValue({})

            renderTab()
            fireEvent.change(screen.getByRole('spinbutton'), { target: { value: '1999' } })
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            await waitFor(() => {
                expect(adminApi.createItem).toHaveBeenCalledWith(
                    expect.objectContaining({ priceCents: 1999 })
                )
            })
        })

        it('shows "Item created!" message on success', async () => {
            vi.mocked(adminApi.createItem).mockResolvedValue({})

            renderTab()
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            expect(await screen.findByText('Item created!')).toBeInTheDocument()
        })

        it('resets all form fields to empty after successful creation', async () => {
            vi.mocked(adminApi.createItem).mockResolvedValue({})
            renderTab()
            const [nameInput, descInput] = screen.getAllByRole('textbox')
            const priceInput = screen.getByRole('spinbutton')
            fireEvent.change(nameInput, { target: { value: 'Air Max' } })
            fireEvent.change(descInput, { target: { value: 'Classic' } })
            fireEvent.change(priceInput, { target: { value: '4999' } })
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))
            await screen.findByText('Item created!')
            expect(nameInput).toHaveValue('')
            expect(descInput).toHaveValue('')
            expect(priceInput).toHaveValue(null)
        })

        it('invalidates admin-items query after successful creation', async () => {
            vi.mocked(adminApi.createItem).mockResolvedValue({})
            const qc = new QueryClient({
                defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
            })
            const invalidateSpy = vi.spyOn(qc, 'invalidateQueries')

            renderTab(qc)
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            await waitFor(() => {
                expect(invalidateSpy).toHaveBeenCalledWith({ queryKey: ['admin-items'] })
            })
        })

        it('shows API error message on failure', async () => {
            vi.mocked(adminApi.createItem).mockRejectedValue({ error: 'Name already exists' })

            renderTab()
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            expect(await screen.findByText('Name already exists')).toBeInTheDocument()
        })

        it('falls back to "Error" when the rejection has no error field', async () => {
            vi.mocked(adminApi.createItem).mockRejectedValue({})

            renderTab()
            fireEvent.click(screen.getByRole('button', { name: /create item/i }))

            expect(await screen.findByText('Error')).toBeInTheDocument()
        })
    })
})
