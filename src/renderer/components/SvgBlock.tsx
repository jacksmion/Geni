import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Eye, Code2, ZoomIn, ZoomOut, Download, Maximize2, X, RotateCcw } from 'lucide-react'
import DOMPurify from 'dompurify'
import { createPortal } from 'react-dom'

const PURIFY_CONFIG = {
    FORBID_TAGS: ['script', 'foreignObject', 'iframe', 'embed', 'object', 'applet'],
    FORBID_ATTR: ['onerror', 'onload', 'onclick', 'onmouseover', 'onfocus', 'onblur'],
}

interface SvgBlockProps {
    code: string
}

export function SvgBlock({ code }: SvgBlockProps) {
    const [mode, setMode] = useState<'preview' | 'code'>('preview')
    const [zoom, setZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const isPanning = useRef(false)
    const lastPos = useRef({ x: 0, y: 0 })

    const sanitized = React.useMemo(() => {
        try {
            const result = DOMPurify.sanitize(code, PURIFY_CONFIG)
            // 验证结果是合法 SVG
            if (!result.includes('<svg')) {
                setError('无效的 SVG 内容')
                return ''
            }
            setError(null)
            return result
        } catch (e: any) {
            setError(e.message)
            return ''
        }
    }, [code])

    const handleWheel = useCallback((e: React.WheelEvent) => {
        e.preventDefault()
        setZoom(z => Math.max(0.1, Math.min(5, z - e.deltaY * 0.001)))
    }, [])

    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        if (e.button !== 0) return
        isPanning.current = true
        lastPos.current = { x: e.clientX, y: e.clientY }
        e.preventDefault()
    }, [])

    const handleMouseMove = useCallback((e: React.MouseEvent) => {
        if (!isPanning.current) return
        setPan(p => ({
            x: p.x + e.clientX - lastPos.current.x,
            y: p.y + e.clientY - lastPos.current.y,
        }))
        lastPos.current = { x: e.clientX, y: e.clientY }
    }, [])

    const handleMouseUp = useCallback(() => {
        isPanning.current = false
    }, [])

    const resetView = useCallback(() => {
        setZoom(1)
        setPan({ x: 0, y: 0 })
    }, [])

    const handleDownload = useCallback(() => {
        const blob = new Blob([code], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'diagram.svg'
        a.click()
        URL.revokeObjectURL(url)
    }, [code])

    // 渲染区
    const renderArea = (
        <div
            ref={containerRef}
            className="w-full h-full flex items-center justify-center overflow-hidden cursor-grab active:cursor-grabbing select-none"
            onWheel={handleWheel}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
        >
            {error ? (
                <div className="flex flex-col items-center gap-2 text-red-500 dark:text-red-400 py-8">
                    <span className="text-sm">{error}</span>
                </div>
            ) : (
                <div
                    className="svg-content"
                    style={{
                        transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                        transformOrigin: 'center center',
                        transition: isPanning.current ? 'none' : 'transform 0.1s ease-out',
                        maxWidth: '100%',
                    }}
                    dangerouslySetInnerHTML={{ __html: sanitized }}
                />
            )}
        </div>
    )

    // 工具栏
    const toolbar = (
        <div className="flex items-center gap-1 px-2">
            <button
                onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                title={mode === 'preview' ? '查看代码' : '查看预览'}
            >
                {mode === 'preview' ? <Code2 size={14} /> : <Eye size={14} />}
            </button>
            {mode === 'preview' && (
                <>
                    <button
                        onClick={() => setZoom(z => Math.min(5, z * 1.2))}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="放大"
                    >
                        <ZoomIn size={14} />
                    </button>
                    <button
                        onClick={() => setZoom(z => Math.max(0.1, z / 1.2))}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="缩小"
                    >
                        <ZoomOut size={14} />
                    </button>
                    <button
                        onClick={resetView}
                        className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                        title="重置视图"
                    >
                        <RotateCcw size={14} />
                    </button>
                </>
            )}
            <button
                onClick={handleDownload}
                className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                title="下载 SVG"
            >
                <Download size={14} />
            </button>
            {!isFullscreen && (
                <button
                    onClick={() => setIsFullscreen(true)}
                    className="p-1.5 rounded-md text-slate-400 hover:text-slate-600 dark:hover:text-zinc-200 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                    title="全屏预览"
                >
                    <Maximize2 size={14} />
                </button>
            )}
        </div>
    )

    return (
        <div className="not-prose rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 bg-white dark:bg-[#0d1117]">
            {/* Header */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50 dark:bg-zinc-900/50 border-b border-slate-200 dark:border-zinc-800">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">SVG</span>
                {toolbar}
            </div>

            {/* Content */}
            <div className="min-h-[120px] max-h-[400px] overflow-auto">
                {mode === 'preview' ? (
                    renderArea
                ) : (
                    <pre className="p-4 text-xs text-slate-700 dark:text-zinc-300 font-mono whitespace-pre-wrap break-all overflow-auto">
                        <code>{code}</code>
                    </pre>
                )}
            </div>

            {/* Zoom indicator */}
            {mode === 'preview' && zoom !== 1 && (
                <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 dark:text-zinc-500 bg-white/80 dark:bg-zinc-900/80 px-1.5 py-0.5 rounded backdrop-blur-sm">
                    {Math.round(zoom * 100)}%
                </div>
            )}

            {/* Fullscreen overlay */}
            {isFullscreen && createPortal(
                <div className="fixed inset-0 z-[100] bg-white/95 dark:bg-[#0a0a0c]/95 backdrop-blur-xl flex flex-col">
                    <div className="flex items-center justify-between pl-4 pr-[140px] py-3 border-b border-slate-200 dark:border-zinc-800 drag-region">
                        <span className="text-xs font-bold uppercase tracking-wider text-slate-400 dark:text-zinc-500">SVG 全屏预览</span>
                        <div className="flex items-center gap-2 no-drag">
                            {toolbar}
                            <div className="w-px h-4 bg-slate-200 dark:bg-zinc-800 mx-1"></div>
                            <button
                                onClick={() => setIsFullscreen(false)}
                                className="px-3 py-1.5 rounded-lg flex items-center gap-1.5 bg-slate-100 hover:bg-red-500 hover:text-white dark:bg-white/10 dark:hover:bg-red-500 text-slate-600 dark:text-zinc-300 transition-all text-xs font-medium"
                                title="退出预览 (ESC)"
                            >
                                <X size={14} />
                                退出预览
                            </button>
                        </div>
                    </div>
                    <div className="flex-1 overflow-hidden">
                        {renderArea}
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
