import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { renderHook, act } from '@testing-library/react'
import { useCountdown } from '../useCountdown'

describe('useCountdown', () => {
    beforeEach(() => {
        vi.useFakeTimers()
    })

    afterEach(() => {
        vi.useRealTimers()
    })

    // ── Initial state ─────────────────────────────────────────

    describe('initial state', () => {
        it('returns all zeros when targetDate is null', () => {
            const { result } = renderHook(() => useCountdown(null))

            expect(result.current).toEqual({ days: 0, hours: 0, minutes: 0, seconds: 0, isOver: true })
        })

        it('returns isOver: true when targetDate is null', () => {
            const { result } = renderHook(() => useCountdown(null))
            expect(result.current.isOver).toBe(true)
        })

        it('returns isOver: false for a future date', () => {
            const future = new Date(Date.now() + 60 * 60 * 1000).toISOString()
            const { result } = renderHook(() => useCountdown(future))
            expect(result.current.isOver).toBe(false)
        })

        it('returns isOver: true for a past date', () => {
            const past = new Date(Date.now() - 1000).toISOString()
            const { result } = renderHook(() => useCountdown(past))
            expect(result.current.isOver).toBe(true)
        })
    })

    // ── Time decomposition ────────────────────────────────────

    describe('time decomposition', () => {
        it('correctly calculates seconds', () => {
            const target = new Date(Date.now() + 30 * 1000).toISOString() // 30s
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.seconds).toBe(30)
            expect(result.current.minutes).toBe(0)
            expect(result.current.hours).toBe(0)
            expect(result.current.days).toBe(0)
        })

        it('correctly calculates minutes and seconds', () => {
            const target = new Date(Date.now() + 2 * 60 * 1000 + 45 * 1000).toISOString() // 2m 45s
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.minutes).toBe(2)
            expect(result.current.seconds).toBe(45)
        })

        it('correctly calculates hours, minutes, seconds', () => {
            const target = new Date(Date.now() + 3 * 60 * 60 * 1000 + 15 * 60 * 1000 + 10 * 1000).toISOString() // 3h 15m 10s
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.hours).toBe(3)
            expect(result.current.minutes).toBe(15)
            expect(result.current.seconds).toBe(10)
        })

        it('correctly calculates days', () => {
            const target = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString() // 2 days
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.days).toBe(2)
        })

        it('seconds wraps at 60', () => {
            const target = new Date(Date.now() + 90 * 1000).toISOString() // 1m 30s
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.seconds).toBe(30) // not 90
            expect(result.current.minutes).toBe(1)
        })

        it('hours wraps at 24', () => {
            const target = new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString() // 25h
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.hours).toBe(1) // not 25
            expect(result.current.days).toBe(1)
        })
    })

    // ── Tick behaviour ────────────────────────────────────────

    describe('tick behaviour', () => {
        it('decrements by 1 second after 1s', () => {
            const target = new Date(Date.now() + 10 * 1000).toISOString()
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.seconds).toBe(10)

            act(() => { vi.advanceTimersByTime(1000) })
            expect(result.current.seconds).toBe(9)
        })

        it('decrements correctly after multiple seconds', () => {
            const target = new Date(Date.now() + 10 * 1000).toISOString()
            const { result } = renderHook(() => useCountdown(target))

            act(() => { vi.advanceTimersByTime(5000) })
            expect(result.current.seconds).toBe(5)
        })

        it('sets isOver: true when countdown reaches zero', () => {
            const target = new Date(Date.now() + 3 * 1000).toISOString()
            const { result } = renderHook(() => useCountdown(target))

            expect(result.current.isOver).toBe(false)

            act(() => { vi.advanceTimersByTime(3000) })
            expect(result.current.isOver).toBe(true)
        })

        it('does not go below zero', () => {
            const target = new Date(Date.now() + 2 * 1000).toISOString()
            const { result } = renderHook(() => useCountdown(target))

            act(() => { vi.advanceTimersByTime(10000) }) // advance well past target
            expect(result.current.seconds).toBe(0)
            expect(result.current.minutes).toBe(0)
        })
    })

    // ── targetDate changes ────────────────────────────────────

    describe('targetDate changes', () => {
        it('resets when targetDate changes to null', () => {
            const target = new Date(Date.now() + 60 * 1000).toISOString()
            const { result, rerender } = renderHook(
                ({ date }: { date: string | null }) => useCountdown(date),
                { initialProps: { date: target } }
            )

            expect(result.current.isOver).toBe(false)

            rerender({ date: null })
            expect(result.current.isOver).toBe(false)
        })

        it('updates when targetDate changes to a new future date', () => {
            const target1 = new Date(Date.now() + 30 * 1000).toISOString()
            const target2 = new Date(Date.now() + 2 * 60 * 1000).toISOString()

            const { result, rerender } = renderHook(
                ({ date }: { date: string | null }) => useCountdown(date),
                { initialProps: { date: target1 } }
            )

            expect(result.current.seconds).toBe(30)

            rerender({ date: target2 })
            expect(result.current.minutes).toBe(2)
        })
    })

    // ── Cleanup ───────────────────────────────────────────────

    describe('cleanup', () => {
        it('clears interval on unmount', () => {
            const clearIntervalSpy = vi.spyOn(global, 'clearInterval')
            const target = new Date(Date.now() + 60 * 1000).toISOString()
            const { unmount } = renderHook(() => useCountdown(target))

            unmount()
            expect(clearIntervalSpy).toHaveBeenCalled()
        })

        it('does not set state after unmount', () => {
            const target = new Date(Date.now() + 5 * 1000).toISOString()
            const { unmount } = renderHook(() => useCountdown(target))

            unmount()
            // Advancing timers after unmount should not throw
            expect(() => act(() => { vi.advanceTimersByTime(5000) })).not.toThrow()
        })
    })
})