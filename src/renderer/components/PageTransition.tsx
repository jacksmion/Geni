import React, { useEffect, useRef, useState } from 'react'

interface PageTransitionProps {
    /** 用于触发重新动画的 key，通常是 activeTab 的值 */
    pageKey: string
    children: React.ReactNode
    className?: string
}

/**
 * Tab 切换过渡包装组件。
 * 当 pageKey 变化时，先播放 exit 动画，再切换内容，最后播放 enter 动画。
 * 纯 CSS 实现，无需第三方动画库。
 */
export function PageTransition({ pageKey, children, className }: PageTransitionProps) {
    const [displayKey, setDisplayKey] = useState(pageKey)
    const [displayChildren, setDisplayChildren] = useState(children)
    const [phase, setPhase] = useState<'enter' | 'exit' | 'idle'>('idle')
    const pendingRef = useRef<{ key: string; children: React.ReactNode } | null>(null)
    const timerRef = useRef<number | null>(null)

    useEffect(() => {
        if (pageKey === displayKey) return

        // 新目标入队
        pendingRef.current = { key: pageKey, children }

        // 如果已经在 exit 中，让计时器到期后自然切换
        if (phase === 'exit') return

        // 开始 exit
        setPhase('exit')

        timerRef.current = window.setTimeout(() => {
            const pending = pendingRef.current
            if (!pending) return
            pendingRef.current = null
            setDisplayKey(pending.key)
            setDisplayChildren(pending.children)
            setPhase('enter')

            // enter 动画结束后回到 idle
            timerRef.current = window.setTimeout(() => {
                setPhase('idle')
            }, 300)
        }, 150)  // exit duration

        return () => {
            if (timerRef.current) window.clearTimeout(timerRef.current)
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [pageKey])

    // 同步更新当前页的 children（同 tab 内内容刷新）
    useEffect(() => {
        if (pageKey === displayKey && phase === 'idle') {
            setDisplayChildren(children)
        }
    }, [children, pageKey, displayKey, phase])

    const animClass =
        phase === 'enter' ? 'page-enter' :
        phase === 'exit'  ? 'page-exit'  : ''

    return (
        <div className={`${className ?? 'flex-1 h-full overflow-hidden bg-[var(--bg-color)]'} ${animClass}`}>
            {displayChildren}
        </div>
    )
}
