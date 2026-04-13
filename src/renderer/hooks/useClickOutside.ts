import { useEffect, type RefObject } from 'react'

/**
 * 监听目标元素外的鼠标点击事件，点击外部时触发 callback。
 * @param ref    目标元素的 ref
 * @param callback 点击外部时的回调
 * @param enabled  是否启用监听（默认 true）
 */
export function useClickOutside<T extends HTMLElement>(
    ref: RefObject<T | null>,
    callback: () => void,
    enabled = true,
): void {
    useEffect(() => {
        if (!enabled) return

        const handler = (e: MouseEvent) => {
            if (ref.current && !ref.current.contains(e.target as Node)) {
                callback()
            }
        }

        document.addEventListener('mousedown', handler)
        return () => document.removeEventListener('mousedown', handler)
    }, [ref, callback, enabled])
}
