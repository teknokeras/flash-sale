import { describe, it, expect, vi, beforeEach } from 'vitest'

// ── Mock AWS SDK before anything imports it ───────────────────
const { mockSend } = vi.hoisted(() => ({ mockSend: vi.fn() }))

vi.mock('@aws-sdk/client-dynamodb', () => ({
    DynamoDBClient: vi.fn().mockImplementation(() => ({})),
}))

vi.mock('@aws-sdk/lib-dynamodb', () => ({
    DynamoDBDocumentClient: {
        from: vi.fn().mockReturnValue({ send: mockSend }),
    },
    PutCommand: vi.fn().mockImplementation((input) => ({ input })),
    DeleteCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

// Import AFTER mocks are set up
const { claimPurchaseSlot, releasePurchaseSlot } = await import('../dynamo')

const USER_ID = 'user-abc-123'
const SALE_ID = 'sale-xyz-456'
const REQUEST_ID = 'req-789'
const PK = `${USER_ID}#${SALE_ID}`

beforeEach(() => {
    mockSend.mockReset()
})

// ── claimPurchaseSlot ─────────────────────────────────────────

describe('claimPurchaseSlot', () => {
    it('returns true when DynamoDB write succeeds (slot not yet taken)', async () => {
        mockSend.mockResolvedValueOnce({})
        const result = await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        expect(result).toBe(true)
    })

    it('calls PutCommand with the correct pk composite key', async () => {
        mockSend.mockResolvedValueOnce({})
        await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        const sentCommand = mockSend.mock.calls[0][0]
        expect(sentCommand.input.Item.pk).toBe(PK)
    })

    it('calls PutCommand with all required item fields', async () => {
        mockSend.mockResolvedValueOnce({})
        await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        const item = mockSend.mock.calls[0][0].input.Item
        expect(item).toMatchObject({
            pk: PK,
            userId: USER_ID,
            saleId: SALE_ID,
            requestId: REQUEST_ID,
            status: 'reserved',
        })
        expect(item.createdAt).toBeDefined()
        expect(new Date(item.createdAt).toISOString()).toBe(item.createdAt)
    })

    it('calls PutCommand with attribute_not_exists condition', async () => {
        mockSend.mockResolvedValueOnce({})
        await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        const sentCommand = mockSend.mock.calls[0][0]
        expect(sentCommand.input.ConditionExpression).toBe('attribute_not_exists(pk)')
    })

    it('returns false on ConditionalCheckFailedException (already purchased)', async () => {
        const err = new Error('The conditional request failed')
        err.name = 'ConditionalCheckFailedException'
        mockSend.mockRejectedValueOnce(err)
        const result = await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        expect(result).toBe(false)
    })

    it('re-throws unexpected errors', async () => {
        const err = new Error('Network timeout')
        err.name = 'NetworkError'
        mockSend.mockRejectedValueOnce(err)
        await expect(claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID))
            .rejects.toThrow('Network timeout')
    })

    it('re-throws non-Error exceptions', async () => {
        mockSend.mockRejectedValueOnce('something went wrong')
        await expect(claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID))
            .rejects.toBe('something went wrong')
    })

    it('sends exactly one command', async () => {
        mockSend.mockResolvedValueOnce({})
        await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        expect(mockSend).toHaveBeenCalledTimes(1)
    })
})

// ── releasePurchaseSlot ───────────────────────────────────────

describe('releasePurchaseSlot', () => {
    it('calls DeleteCommand with the correct pk', async () => {
        mockSend.mockResolvedValueOnce({})
        await releasePurchaseSlot(USER_ID, SALE_ID)
        const sentCommand = mockSend.mock.calls[0][0]
        expect(sentCommand.input.Key).toEqual({ pk: PK })
    })

    it('calls DeleteCommand with the correct table name', async () => {
        mockSend.mockResolvedValueOnce({})
        await releasePurchaseSlot(USER_ID, SALE_ID)
        const sentCommand = mockSend.mock.calls[0][0]
        expect(sentCommand.input.TableName).toBe('purchases')
    })

    it('resolves without error on success', async () => {
        mockSend.mockResolvedValueOnce({})
        await expect(releasePurchaseSlot(USER_ID, SALE_ID)).resolves.toBeUndefined()
    })

    it('re-throws if DeleteCommand fails', async () => {
        mockSend.mockRejectedValueOnce(new Error('DynamoDB unavailable'))
        await expect(releasePurchaseSlot(USER_ID, SALE_ID))
            .rejects.toThrow('DynamoDB unavailable')
    })

    it('sends exactly one command', async () => {
        mockSend.mockResolvedValueOnce({})
        await releasePurchaseSlot(USER_ID, SALE_ID)
        expect(mockSend).toHaveBeenCalledTimes(1)
    })
})

// ── Rollback scenario ─────────────────────────────────────────

describe('rollback scenario: claim then release', () => {
    it('claim succeeds then release deletes the same pk', async () => {
        mockSend
            .mockResolvedValueOnce({}) // PutCommand
            .mockResolvedValueOnce({}) // DeleteCommand

        const claimed = await claimPurchaseSlot(USER_ID, SALE_ID, REQUEST_ID)
        expect(claimed).toBe(true)

        await releasePurchaseSlot(USER_ID, SALE_ID)

        expect(mockSend).toHaveBeenCalledTimes(2)
        const putKey = mockSend.mock.calls[0][0].input.Item.pk
        const deleteKey = mockSend.mock.calls[1][0].input.Key.pk
        expect(putKey).toBe(deleteKey)
    })

    it('both operations use the same composite pk format', async () => {
        mockSend.mockResolvedValue({})

        await claimPurchaseSlot('user-1', 'sale-1', 'req-1')
        await releasePurchaseSlot('user-1', 'sale-1')

        const putPk = mockSend.mock.calls[0][0].input.Item.pk
        const deletePk = mockSend.mock.calls[1][0].input.Key.pk
        expect(putPk).toBe('user-1#sale-1')
        expect(deletePk).toBe('user-1#sale-1')
    })
})