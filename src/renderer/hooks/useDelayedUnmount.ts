import { useState, useEffect, useRef } from 'react'

/**
 * 延迟卸载 Hook：让条件渲染的元素在 visible=false 时先播放 exit 动画再移除。
 *
 * @param visible  - 是否应该显示（由外部状态驱动）
 * @param duration - exit 动画持续时间（ms），默认 200ms
 * @returns { shouldRender, animationClass }
 *   - shouldRender: 是否将元素挂载到 DOM
 *   - isExiting: 是否正在执行 exit 动画（用于绑定 CSS 类）
 */
export function useDelayedUnmount(visible: boolean, duration = 200) {
    const [shouldRender, setShouldRender] = useState(visible)
    const [isExiting, setIsExiting] = useState(false)
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        if (visible) {
            // 立即挂载，取消任何待执行的卸载
            if (timerRef.current) window.clearTimeout(timerRef.current)
            setShouldRender(true)
            setIsExiting(false)
        } else if (shouldRender) {
            // 触发 exit 动画，然后延迟卸载
            setIsExiting(true)
            timerRef.current = window.setTimeout(() => {
                setShouldRender(false)
                setIsExiting(false)
            }, duration)
        }

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    }, [visible])

    return { shouldRender, isExiting }
}
