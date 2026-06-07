import { useState, useEffect } from 'react'

export function useCountdown(targetDate: string | null) {
    const [timeLeft, setTimeLeft] = useState<number>(0)

    useEffect(() => {
        if (!targetDate) return
        const target = new Date(targetDate).getTime()

        function tick() {
            const diff = target - Date.now()
            setTimeLeft(Math.max(0, diff))
        }

        tick()
        const id = setInterval(tick, 1000)
        return () => clearInterval(id)
    }, [targetDate])

    const seconds = Math.floor((timeLeft / 1000) % 60)
    const minutes = Math.floor((timeLeft / 1000 / 60) % 60)
    const hours = Math.floor((timeLeft / 1000 / 60 / 60) % 24)
    const days = Math.floor(timeLeft / 1000 / 60 / 60 / 24)

    return { days, hours, minutes, seconds, isOver: timeLeft === 0 }
}
