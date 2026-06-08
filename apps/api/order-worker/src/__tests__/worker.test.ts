import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

// ── Hoist mocks ───────────────────────────────────────────────

const { mockSqsSend, mockDbSelect, mockDbInsert, mockDbQuery } = vi.hoisted(() => ({
    mockSqsSend: vi.fn(),
    mockDbSelect: vi.fn(),
    mockDbInsert: vi.fn(),
    mockDbQuery: vi.fn(),
}))

vi.mock('@aws-sdk/client-sqs', () => ({
    SQSClient: vi.fn().mockImplementation(() => ({ send: mockSqsSend })),
    ReceiveMessageCommand: vi.fn().mockImplementation((input) => ({ input })),
    DeleteMessageCommand: vi.fn().mockImplementation((input) => ({ input })),
}))

// Chainable DB mock
vi.mock('@flash-sale/db', () => {
    const selectChain = {
        select: vi.fn(),
        from: vi.fn(),
        where: vi.fn(),
        limit: mockDbSelect,
    }
    selectChain.select.mockReturnValue(selectChain)
    selectChain.from.mockReturnValue(selectChain)
    selectChain.where.mockReturnValue(selectChain)

    const insertChain = {
        insert: vi.fn(),
        values: vi.fn(),
        onConflictDoNothing: mockDbInsert,
    }
    insertChain.insert.mockReturnValue(insertChain)
    insertChain.values.mockReturnValue(insertChain)

    return {
        db: {
            select: selectChain.select,
            insert: insertChain.insert,
            query: { items: { findFirst: mockDbQuery } },
        },
        orders: { userId: 'orders.userId', saleId: 'orders.saleId' },
        flashSales: { id: 'flashSales.id' },
        eq: vi.fn(),
    }
})

vi.mock('pino', () => ({
    default: vi.fn().mockReturnValue({
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
    }),
}))

// Set required env var before module loads
process.env['SQS_PURCHASE_QUEUE_URL'] = 'https://sqs.us-east-1.amazonaws.com/123/test.fifo'

const { processMessage, poll } = await import('../index.js')

// ── Fixtures ──────────────────────────────────────────────────

const RECEIPT = 'receipt-handle-abc'
const VALID_BODY = JSON.stringify({
    userId: 'user-123',
    saleId: 'sale-456',
    requestId: 'req-789',
})

const MOCK_SALE = {
    id: 'sale-456',
    itemId: 'item-111',
}

const MOCK_ITEM = {
    id: 'item-111',
    priceCents: 9900,
}

beforeEach(() => {
    vi.clearAllMocks()
})

// ── processMessage ────────────────────────────────────────────

describe('processMessage', () => {

    describe('invalid message body', () => {
        it('skips processing when body is invalid JSON', async () => {
            await processMessage('not-json', RECEIPT)

            expect(mockDbSelect).not.toHaveBeenCalled()
            expect(mockSqsSend).not.toHaveBeenCalled()
        })

        it('skips processing when body is empty string', async () => {
            await processMessage('', RECEIPT)

            expect(mockDbSelect).not.toHaveBeenCalled()
            expect(mockSqsSend).not.toHaveBeenCalled()
        })
    })

    describe('sale not found', () => {
        it('skips when sale does not exist in DB', async () => {
            mockDbSelect.mockResolvedValueOnce([]) // empty result

            await processMessage(VALID_BODY, RECEIPT)

            expect(mockDbInsert).not.toHaveBeenCalled()
            expect(mockSqsSend).not.toHaveBeenCalled()
        })

        it('skips when sale has no itemId', async () => {
            mockDbSelect.mockResolvedValueOnce([{ id: 'sale-456', itemId: null }])

            await processMessage(VALID_BODY, RECEIPT)

            expect(mockDbInsert).not.toHaveBeenCalled()
            expect(mockSqsSend).not.toHaveBeenCalled()
        })
    })

    describe('item not found', () => {
        it('skips when item does not exist in DB', async () => {
            mockDbSelect.mockResolvedValueOnce([MOCK_SALE])
            mockDbQuery.mockResolvedValueOnce(undefined) // item not found

            await processMessage(VALID_BODY, RECEIPT)

            expect(mockDbInsert).not.toHaveBeenCalled()
            expect(mockSqsSend).not.toHaveBeenCalled()
        })
    })

    describe('happy path', () => {
        beforeEach(() => {
            mockDbSelect.mockResolvedValue([MOCK_SALE])
            mockDbQuery.mockResolvedValue(MOCK_ITEM)
            mockDbInsert.mockResolvedValue([])
            mockSqsSend.mockResolvedValue({})
        })

        it('inserts order with correct fields', async () => {
            await processMessage(VALID_BODY, RECEIPT)

            expect(mockDbInsert).toHaveBeenCalled()
        })

        it('deletes message from SQS after successful DB write', async () => {
            await processMessage(VALID_BODY, RECEIPT)

            expect(mockSqsSend).toHaveBeenCalledTimes(1)
            const cmd = mockSqsSend.mock.calls[0][0]
            expect(cmd.input.ReceiptHandle).toBe(RECEIPT)
        })

        it('deletes message from correct queue URL', async () => {
            await processMessage(VALID_BODY, RECEIPT)

            const cmd = mockSqsSend.mock.calls[0][0]
            expect(cmd.input.QueueUrl).toBe(process.env['SQS_PURCHASE_QUEUE_URL'])
        })

        it('does not throw on success', async () => {
            await expect(processMessage(VALID_BODY, RECEIPT)).resolves.toBeUndefined()
        })
    })

    describe('DB failure', () => {
        it('does not delete SQS message when DB insert throws', async () => {
            mockDbSelect.mockResolvedValueOnce([MOCK_SALE])
            mockDbQuery.mockResolvedValueOnce(MOCK_ITEM)
            mockDbInsert.mockRejectedValueOnce(new Error('DB connection lost'))

            await processMessage(VALID_BODY, RECEIPT)

            // Message NOT deleted — SQS will redeliver after visibility timeout
            expect(mockSqsSend).not.toHaveBeenCalled()
        })

        it('does not throw when DB insert fails (error is caught)', async () => {
            mockDbSelect.mockResolvedValueOnce([MOCK_SALE])
            mockDbQuery.mockResolvedValueOnce(MOCK_ITEM)
            mockDbInsert.mockRejectedValueOnce(new Error('DB connection lost'))

            await expect(processMessage(VALID_BODY, RECEIPT)).resolves.toBeUndefined()
        })
    })
})

// ── poll ──────────────────────────────────────────────────────

describe('poll', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    it('calls SQS ReceiveMessage with correct params', async () => {
        mockSqsSend.mockResolvedValueOnce({ Messages: [] })

        await poll()

        const cmd = mockSqsSend.mock.calls[0][0]
        expect(cmd.input).toMatchObject({
            QueueUrl: process.env['SQS_PURCHASE_QUEUE_URL'],
            MaxNumberOfMessages: 10,
            WaitTimeSeconds: 5,
            VisibilityTimeout: 30,
        })
    })

    it('does not crash when queue is empty', async () => {
        mockSqsSend.mockResolvedValueOnce({ Messages: [] })

        await expect(poll()).resolves.toBeUndefined()
    })

    it('does not crash when Messages is undefined', async () => {
        mockSqsSend.mockResolvedValueOnce({})

        await expect(poll()).resolves.toBeUndefined()
    })

    it('processes all messages in a batch', async () => {
        mockSqsSend
            .mockResolvedValueOnce({
                Messages: [
                    { Body: VALID_BODY, ReceiptHandle: 'r1' },
                    { Body: VALID_BODY, ReceiptHandle: 'r2' },
                    { Body: VALID_BODY, ReceiptHandle: 'r3' },
                ],
            })
            // processMessage will call SQS again for each delete — mock those too
            .mockResolvedValue({})

        mockDbSelect.mockResolvedValue([MOCK_SALE])
        mockDbQuery.mockResolvedValue(MOCK_ITEM)
        mockDbInsert.mockResolvedValue([])

        await poll()

        // 1 ReceiveMessage + 3 DeleteMessage = 4 total SQS calls
        expect(mockSqsSend).toHaveBeenCalledTimes(4)
    })

    it('does not crash when SQS receive throws', async () => {
        mockSqsSend.mockRejectedValueOnce(new Error('SQS unavailable'))

        await expect(poll()).resolves.toBeUndefined()
    })

    it('schedules next poll via setTimeout', async () => {
        const setTimeoutSpy = vi.spyOn(global, 'setTimeout')
        mockSqsSend.mockResolvedValueOnce({ Messages: [] })

        await poll()

        expect(setTimeoutSpy).toHaveBeenCalledWith(expect.any(Function), expect.any(Number))
    })
})