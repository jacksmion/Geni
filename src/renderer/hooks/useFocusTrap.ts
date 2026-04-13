import { useEffect, useRef } from 'react'

const FOCUSABLE_SELECTORS = [
    'a[href]',
    'button:not([disabled])',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(', ')

/**
 * Focus Trap Hook：将键盘焦点锁定在指定容器内。
 *
 * 功能：
 * - Tab / Shift+Tab 在容器内循环
 * - Escape 键关闭（可选）
 * - 激活时自动 focus 第一个可聚焦元素
 * - 返回时将焦点还给触发元素
 *
 * @param containerRef - 需要锁定焦点的容器 ref
 * @param active       - 是否启用 trap（通常与 modal isOpen 绑定）
 * @param onEscape     - 按下 Escape 时的回调
 */
export function useFocusTrap(
    containerRef: React.RefObject<HTMLElement | null>,
    active: boolean,
    onEscape?: () => void
) {
    // 保存打开 modal 前的焦点元素，关闭时还原
    const previousFocusRef = useRef<HTMLElement | null>(null)

    useEffect(() => {
        if (!active) return

        // 记录当前焦点
        previousFocusRef.current = document.activeElement as HTMLElement

        // 短暂延迟，等待 DOM 渲染后再 focus（动画场景下需要）
        const timer = setTimeout(() => {
            const container = containerRef.current
            if (!container) return
            const focusable = container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
            focusable[0]?.focus()
        }, 50)

        const handleKeyDown = (e: KeyboardEvent) => {
            const container = containerRef.current
            if (!container) return

            if (e.key === 'Escape') {
                e.preventDefault()
                onEscape?.()
                return
            }

            if (e.key !== 'Tab') return

            const focusable = Array.from(
                container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTORS)
            ).filter(el => !el.closest('[hidden]'))

            if (focusable.length === 0) {
                e.preventDefault()
                return
            }

            const first = focusable[0]
            const last = focusable[focusable.length - 1]
            const active = document.activeElement

            if (e.shiftKey) {
                // Shift+Tab: 在第一个元素时跳到最后
                if (active === first) {
                    e.preventDefault()
                    last.focus()
                }
            } else {
                // Tab: 在最后一个元素时跳回第一个
                if (active === last) {
                    e.preventDefault()
                    first.focus()
                }
            }
        }

        document.addEventListener('keydown', handleKeyDown)

        return () => {
            clearTimeout(timer)
            document.removeEventListener('keydown', handleKeyDown)
            // 关闭时将焦点还给触发元素
            previousFocusRef.current?.focus()
        }
    }, [active, onEscape])
}
