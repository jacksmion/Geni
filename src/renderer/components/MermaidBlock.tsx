import React, { useEffect, useRef, useState, useCallback, useId } from 'react'
import { Eye, Code2, ZoomIn, ZoomOut, Copy, Check, Download, AlertTriangle, Maximize2, X, RotateCcw } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'
import { createPortal } from 'react-dom'

// ── Mermaid Singleton & Render Queue ──────────────────────────────────
// Mermaid must be initialized once, and render calls must be serialized
// to avoid concurrent rendering conflicts.

let mermaidInstance: typeof import('mermaid').default | null = null
let mermaidLoadPromise: Promise<typeof import('mermaid').default> | null = null
let currentThemeIsDark: boolean | null = null

// Serial render queue - ensures only one render at a time
let renderQueue: Promise<void> = Promise.resolve()

async function loadMermaid(): Promise<typeof import('mermaid').default> {
    if (mermaidInstance) return mermaidInstance
    if (!mermaidLoadPromise) {
        mermaidLoadPromise = import('mermaid').then(mod => {
            mermaidInstance = mod.default
            return mermaidInstance
        })
    }
    return mermaidLoadPromise
}

function configureMermaid(mermaid: typeof import('mermaid').default, isDark: boolean) {
    if (currentThemeIsDark === isDark) return
    currentThemeIsDark = isDark

    mermaid.initialize({
        startOnLoad: false,
        theme: isDark ? 'dark' : 'default',
        securityLevel: 'loose',
        fontFamily: "'Inter', system-ui, sans-serif",
        darkMode: isDark,
        themeVariables: isDark ? {
            primaryColor: '#6366f1',
            primaryTextColor: '#f4f4f5',
            primaryBorderColor: '#4f46e5',
            lineColor: '#a1a1aa',
            secondaryColor: '#27272a',
            tertiaryColor: '#18181b',
            background: '#09090b',
            mainBkg: '#18181b',
            nodeBorder: '#3f3f46',
            clusterBkg: '#18181b',
            clusterBorder: '#3f3f46',
            titleColor: '#f4f4f5',
            edgeLabelBackground: '#27272a',
        } : {
            primaryColor: '#6366f1',
            primaryTextColor: '#1e1b4b',
            primaryBorderColor: '#a5b4fc',
            lineColor: '#71717a',
            secondaryColor: '#e0e7ff',
            tertiaryColor: '#eef2ff',
        },
    })
}

/**
 * Clean up orphaned mermaid error SVGs from DOM.
 * Mermaid injects temporary SVGs into document.body on render failure.
 */
function cleanupMermaidDOM(diagramId: string) {
    // Remove the temporary render container
    const tempEl = document.getElementById(diagramId)
    if (tempEl) tempEl.remove()
    // Also remove the "d" prefixed container mermaid sometimes uses
    const dEl = document.getElementById('d' + diagramId)
    if (dEl) dEl.remove()
}

/**
 * Serialized mermaid render - queues render calls to avoid concurrency.
 */
function queueMermaidRender(
    diagramId: string,
    code: string,
    isDark: boolean
): Promise<string> {
    return new Promise<string>((resolve, reject) => {
        renderQueue = renderQueue.then(async () => {
            try {
                const mermaid = await loadMermaid()
                configureMermaid(mermaid, isDark)
                const { svg } = await mermaid.render(diagramId, code)

                // Check if the returned SVG is actually an error
                if (svg.includes('Syntax error') || svg.includes('Parse error')) {
                    cleanupMermaidDOM(diagramId)
                    reject(new Error('Syntax error in mermaid diagram'))
                    return
                }

                resolve(svg)
            } catch (err) {
                cleanupMermaidDOM(diagramId)
                reject(err)
            }
        })
    })
}

// ── Component ─────────────────────────────────────────────────────────

interface MermaidBlockProps {
    code: string
}

const ZOOM_STEP = 0.15
const ZOOM_MIN = 0.1
const ZOOM_MAX = 5
const DEBOUNCE_MS = 500

export default function MermaidBlock({ code }: MermaidBlockProps) {
    const uniqueId = useId().replace(/:/g, '_')
    const svgContainerRef = useRef<HTMLDivElement>(null)
    const overlaySvgRef = useRef<HTMLDivElement>(null)

    const [mode, setMode] = useState<'preview' | 'code'>('preview')
    const [zoom, setZoom] = useState(1)
    const [svgContent, setSvgContent] = useState<string>('')
    const [error, setError] = useState<string>('')
    const [rendering, setRendering] = useState(true)
    const [copied, setCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)

    // Pan state
    const [offset, setOffset] = useState({ x: 0, y: 0 })
    const [isDragging, setIsDragging] = useState(false)
    const dragStartRef = useRef({ x: 0, y: 0 })

    const { settings } = useSettingsStore()
    const isDark = settings.theme === 'dark'

    // Track render version to discard stale results
    const renderVersionRef = useRef(0)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // Render mermaid diagram (debounced + serialized)
    const renderDiagram = useCallback((source: string) => {
        if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)

        const trimmed = source.trim()
        if (!trimmed) {
            setTimeout(() => {
                setSvgContent('')
                setError('')
                setRendering(false)
            }, 0)
            return
        }

        debounceTimerRef.current = setTimeout(async () => {
            setRendering(true)
            const version = ++renderVersionRef.current
            const diagramId = `mermaid_${uniqueId}_${version}`

            try {
                const svg = await queueMermaidRender(diagramId, trimmed, isDark)
                if (version === renderVersionRef.current) {
                    setSvgContent(svg)
                    setError('')
                    setRendering(false)
                }
            } catch (err: any) {
                if (version === renderVersionRef.current) {
                    const message = err?.message || err?.str || String(err)
                    setError(message || 'Failed to render diagram')
                    setSvgContent('')
                    setRendering(false)
                }
            }
        }, DEBOUNCE_MS)
    }, [isDark, uniqueId])

    useEffect(() => {
        renderDiagram(code)
        return () => {
            if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current)
        }
    }, [code, isDark, renderDiagram])

    // Interaction handlers for nodes
    useEffect(() => {
        const container = isExpanded ? overlaySvgRef.current : svgContainerRef.current
        if (!container || !svgContent) return

        const handleSvgClick = (e: MouseEvent) => {
            const target = e.target as SVGElement
            const node = target.closest('.node, .task, .cluster')
            if (node) {
                const id = node.id
                setSelectedNodeId(id === selectedNodeId ? null : id)

                // Highlight logic via CSS injection
                const allNodes = container.querySelectorAll('.node, .task, .cluster')
                allNodes.forEach((n: any) => {
                    const el = n as HTMLElement
                    if (n.id === id && id !== selectedNodeId) {
                        el.style.filter = 'drop-shadow(0 0 8px rgba(99, 102, 241, 0.8))'
                        el.style.stroke = '#6366f1'
                        el.style.strokeWidth = '3px'
                    } else {
                        el.style.filter = ''
                        el.style.stroke = ''
                        el.style.strokeWidth = ''
                    }
                })
                e.stopPropagation()
            } else {
                setSelectedNodeId(null)
                const allNodes = container.querySelectorAll('.node, .task, .cluster')
                allNodes.forEach((n: any) => {
                    const el = n as HTMLElement
                    el.style.filter = ''
                    el.style.stroke = ''
                    el.style.strokeWidth = ''
                })
            }
        }

        const svgElement = container.querySelector('svg')
        if (svgElement) {
            svgElement.addEventListener('click', handleSvgClick)
            return () => svgElement.removeEventListener('click', handleSvgClick)
        }
    }, [svgContent, isExpanded, selectedNodeId])

    // Zoom & Pan Logic
    const handleZoomIn = () => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))
    const handleZoomOut = () => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))
    const handleReset = () => {
        setZoom(1)
        setOffset({ x: 0, y: 0 })
        setSelectedNodeId(null)
    }

    // Keyboard support
    useEffect(() => {
        if (!isExpanded) return

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') setIsExpanded(false)
        }
        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isExpanded])

    const handleWheel = (e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey || isExpanded) {
            e.preventDefault()
            const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
            setZoom(z => Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX))
        }
    }

    const onMouseDown = (e: React.MouseEvent) => {
        if (!isExpanded) return
        setIsDragging(true)
        dragStartRef.current = { x: e.clientX - offset.x, y: e.clientY - offset.y }
    }

    const onMouseMove = (e: React.MouseEvent) => {
        if (!isDragging || !isExpanded) return
        setOffset({
            x: e.clientX - dragStartRef.current.x,
            y: e.clientY - dragStartRef.current.y
        })
    }

    const onMouseUp = () => setIsDragging(false)

    const handleCopy = () => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    const handleExportSvg = () => {
        if (!svgContent) return
        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `mermaid-${Date.now()}.svg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    const zoomPercent = Math.round(zoom * 100)

    const Toolbar = () => (
        <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5">
            <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/5 rounded-lg p-0.5">
                <button
                    onClick={() => setMode('preview')}
                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${mode === 'preview' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
                >
                    图表
                </button>
                <button
                    onClick={() => setMode('code')}
                    className={`px-3 py-1 rounded-md text-[11px] font-medium transition-all ${mode === 'code' ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm' : 'text-slate-500 hover:text-slate-700 dark:text-zinc-500 dark:hover:text-zinc-300'}`}
                >
                    代码
                </button>
            </div>

            <div className="flex items-center gap-1">
                {mode === 'preview' && (
                    <div className="flex items-center gap-0.5 mr-1">
                        <button onClick={handleZoomOut} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="缩小"><ZoomOut size={13} /></button>
                        <button onClick={handleReset} className="px-1.5 py-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-[10px] font-mono text-slate-500 dark:text-zinc-400 min-w-[36px] text-center" title="重置">{zoomPercent}%</button>
                        <button onClick={handleZoomIn} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="放大"><ZoomIn size={13} /></button>
                        <div className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-1" />
                        {!isExpanded && (
                            <button onClick={() => { setIsExpanded(true); setZoom(1.2); }} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400" title="扩大显示区域"><Maximize2 size={13} /></button>
                        )}
                    </div>
                )}
                <button onClick={handleCopy} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="复制代码">{copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}</button>
                <button onClick={handleExportSvg} disabled={!svgContent} className="p-1.5 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500 disabled:opacity-30" title="导出 SVG"><Download size={13} /></button>
            </div>
        </div>
    )

    return (
        <div className="not-prose group/mermaid rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-[#0c0c0e]">
            <Toolbar />

            <div className="relative">
                {mode === 'preview' && (
                    <div
                        className="overflow-auto min-h-[80px]"
                        onWheel={handleWheel}
                        style={{ maxHeight: '600px' }}
                    >
                        {rendering && !svgContent && (
                            <div className="flex items-center justify-center py-12 text-xs text-slate-400"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mr-2" />渲染中...</div>
                        )}
                        {error && (
                            <div className="p-4 flex items-start gap-2 bg-red-50 dark:bg-red-500/5 text-red-600 text-xs font-mono"><AlertTriangle size={14} className="mt-0.5" />{error}</div>
                        )}
                        {svgContent && !error && (
                            <div
                                ref={svgContainerRef}
                                className="flex items-center justify-center p-6 transition-transform duration-150"
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'center top' }}
                                dangerouslySetInnerHTML={{ __html: svgContent }}
                            />
                        )}
                    </div>
                )}

                {mode === 'code' && (
                    <div className="overflow-auto max-h-[500px]">
                        <pre className="p-5 text-[13px] font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-all">{code}</pre>
                    </div>
                )}
            </div>

            {/* Full Window Overlay */}
            {isExpanded && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-white/95 dark:bg-[#09090b]/98 backdrop-blur-md flex flex-col animate-in fade-in duration-200"
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                    onMouseLeave={onMouseUp}
                >
                    <div className="flex items-center justify-between pl-6 pr-[150px] py-3 border-b border-black/5 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">图表预览</span>
                            {selectedNodeId && (
                                <div className="px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-500 text-[10px] font-medium border border-indigo-500/20">
                                    已选中: {selectedNodeId}
                                </div>
                            )}
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsExpanded(false)} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-red-500 hover:text-white text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-all outline-none mr-2">
                                <span className="flex items-center gap-2"><X size={15} />退出预览 (ESC)</span>
                            </button>
                            <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1" />
                            <div className="flex items-center border border-black/10 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-zinc-800">
                                <button onClick={handleZoomOut} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-zinc-400"><ZoomOut size={16} /></button>
                                <button onClick={handleReset} className="px-3 py-1 font-mono text-xs text-slate-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 border-x border-black/5 dark:border-white/5">{zoomPercent}%</button>
                                <button onClick={handleZoomIn} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-zinc-400"><ZoomIn size={16} /></button>
                            </div>
                            <button onClick={handleReset} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400" title="复位"><RotateCcw size={16} /></button>
                        </div>
                    </div>

                    <div
                        className={`flex-1 overflow-hidden relative ${isDragging ? 'cursor-grabbing' : 'cursor-grab'}`}
                        onMouseDown={onMouseDown}
                        onWheel={handleWheel}
                    >
                        <div
                            ref={overlaySvgRef}
                            className="absolute transition-transform duration-75 select-none"
                            style={{
                                transform: `translate(${offset.x}px, ${offset.y}px) scale(${zoom})`,
                                transformOrigin: 'center center',
                                left: '50%',
                                top: '50%',
                                marginLeft: '-50%',
                                marginTop: '-50%',
                                width: '100%',
                                height: '100%',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center'
                            }}
                            dangerouslySetInnerHTML={{ __html: svgContent }}
                        />

                        {/* Help Text */}
                        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 px-4 py-2 rounded-full bg-black/60 dark:bg-white/10 text-white/80 text-[11px] font-medium backdrop-blur-md pointer-events-none border border-white/10">
                            滚轮缩放 · 拖拽平移 · 点击节点选择
                        </div>
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
