// @vitest-environment jsdom
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
    getToken, setToken, clearToken, getRole,
    saleApi, purchaseApi, adminApi
} from '../api'; // Adjusted to look for api.ts inside src/lib/

describe('Auth & API Utilities Suite', () => {

    beforeEach(() => {
        localStorage.clear();
        vi.restoreAllMocks();
    });

    describe('LocalStorage State Helpers', () => {
        it('should correctly set and get tokens and roles', () => {
            setToken('mock-jwt-token', 'admin');

            expect(getToken()).toBe('mock-jwt-token');
            expect(getRole()).toBe('admin');
        });

        it('should return null if token or role is absent', () => {
            expect(getToken()).toBeNull();
            expect(getRole()).toBeNull();
        });

        it('should clear stored values completely', () => {
            setToken('mock-jwt-token', 'buyer');
            clearToken();

            expect(getToken()).toBeNull();
            expect(getRole()).toBeNull();
        });
    });

    describe('API Fetch Infrastructure Integration', () => {

        function mockFetchResponse(status: number, data: any, ok = true) {
            const mockResponse = {
                ok,
                status,
                json: async () => data,
            };
            return vi.stubGlobal('fetch', vi.fn().mockResolvedValue(mockResponse));
        }

        it('should implicitly append authorization headers if a token exists', async () => {
            setToken('my-secret-token', 'buyer');
            const fetchSpy = mockFetchResponse(200, []);

            await adminApi.getItems();

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/admin/admin/items',
                expect.objectContaining({
                    headers: expect.objectContaining({
                        Authorization: 'Bearer my-secret-token',
                    }),
                })
            );
        });

        it('should append Content-Type headers when sending JSON request bodies', async () => {
            const fetchSpy = mockFetchResponse(200, { token: 't', user: {} });
            const loginPayload = { email: 'test@example.com', password: 'password123' };

            await saleApi.login(loginPayload);

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/sale/auth/login',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify(loginPayload),
                    headers: expect.objectContaining({
                        'Content-Type': 'application/json',
                    }),
                })
            );
        });

        it('should throw an descriptive error object when response is not ok', async () => {
            mockFetchResponse(400, { message: 'Invalid credentials' }, false);

            await expect(
                saleApi.login({ email: 'bad@email.com', password: '12' })
            ).rejects.toEqual({
                status: 400,
                message: 'Invalid credentials',
            });
        });

        it('should reshape raw payload correctly for active sales structures', async () => {
            const rawActivePayload = {
                active: true,
                sale: { id: 's1', title: 'Big Sale', priceCents: 999, remainingQty: 50 },
                item: { id: 'i1', name: 'Shoes' }
            };
            mockFetchResponse(200, rawActivePayload);

            const result = await saleApi.getActive();

            expect(result.active).toBe(true);
            expect(result.sale).toBeDefined();
            expect(result.sale?.id).toBe('s1');
            expect(result.sale?.specialPrice).toBe(999);
            expect(result.sale?.remainingQuantity).toBe(50);
            expect(result.sale?.item).toEqual({ id: 'i1', name: 'Shoes' });
        });

        it('should shape scheduled structures cleanly when no sale is currently active', async () => {
            const rawScheduledPayload = {
                active: false,
                nextSale: { id: 's2', title: 'Upcoming Sale', status: 'scheduled' }
            };
            mockFetchResponse(200, rawScheduledPayload);

            const result = await saleApi.getActive();

            expect(result.active).toBe(false);
            expect(result.nextSale?.id).toBe('s2');
            expect(result.sale).toBeUndefined();
        });

        it('should execute basic purchase request structures flawlessly', async () => {
            const fetchSpy = mockFetchResponse(200, { status: 'success', message: 'Order created' });

            const result = await purchaseApi.buy('sale-id-123');

            expect(fetchSpy).toHaveBeenCalledWith(
                '/api/purchase',
                expect.objectContaining({
                    method: 'POST',
                    body: JSON.stringify({ saleId: 'sale-id-123' }),
                })
            );
            expect(result.status).toBe('success');
        });
    });
});