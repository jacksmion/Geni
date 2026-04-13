import React from 'react'
import { cn } from '../../utils/cn'

interface SkeletonProps {
    className?: string
}

/** 通用骨架屏组件，用于数据加载态的占位显示 */
export function Skeleton({ className }: SkeletonProps) {
    return <div className={cn('skeleton', className)} />
}

/** 会话列表骨架屏 */
export function SessionSkeleton() {
    return (
        <div className="space-y-1 px-2 pt-2">
            {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-3 py-2.5 rounded-lg">
                    <Skeleton className="w-3.5 h-3.5 rounded shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-3/4 rounded" />
                        <Skeleton className="h-2 w-1/3 rounded" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/** 模型列表骨架屏 */
export function ModelListSkeleton() {
    return (
        <div className="space-y-1 p-2">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="flex items-center gap-3 px-4 py-2.5 rounded-lg">
                    <Skeleton className="w-5 h-5 rounded-full shrink-0" />
                    <div className="flex-1 space-y-1.5">
                        <Skeleton className="h-3 w-2/3 rounded" />
                        <Skeleton className="h-2 w-1/4 rounded" />
                    </div>
                </div>
            ))}
        </div>
    )
}

/** Skills 列表骨架屏 */
export function SkillListSkeleton() {
    return (
        <div className="grid grid-cols-2 gap-3 p-4">
            {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="p-4 rounded-2xl border border-white/5 space-y-3">
                    <Skeleton className="w-10 h-10 rounded-xl" />
                    <Skeleton className="h-3.5 w-3/4 rounded" />
                    <Skeleton className="h-2.5 w-full rounded" />
                    <Skeleton className="h-2.5 w-2/3 rounded" />
                </div>
            ))}
        </div>
    )
}
