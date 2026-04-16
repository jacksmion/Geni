import React, { useEffect, useRef, useState, useCallback, useId } from 'react'
import { Eye, Code2, ZoomIn, ZoomOut, Copy, Check, Download, AlertTriangle, Maximize2, X, RotateCcw, ImageIcon } from 'lucide-react'
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
    const [baseZoom, setBaseZoom] = useState(1) // auto-fitted zoom level
    const [svgContent, setSvgContent] = useState<string>('')
    const [error, setError] = useState<string>('')
    const [rendering, setRendering] = useState(true)
    const [copied, setCopied] = useState(false)
    const [isExpanded, setIsExpanded] = useState(false)
    const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null)
    const previewContainerRef = useRef<HTMLDivElement>(null)

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

    // Auto-fit SVG to container width
    useEffect(() => {
        if (!svgContent || !svgContainerRef.current || !previewContainerRef.current) return

        const svgEl = svgContainerRef.current.querySelector('svg')
        if (!svgEl) return

        const containerWidth = previewContainerRef.current.clientWidth - 48 // minus padding
        const svgWidth = svgEl.getBoundingClientRect().width

        if (svgWidth > 0 && containerWidth > 0) {
            const fitScale = Math.min(1, containerWidth / svgWidth)
            setBaseZoom(fitScale)
            setZoom(fitScale)
        }
    }, [svgContent])

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
        setZoom(baseZoom)
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

    const handleExportPng = () => {
        const svgEl = svgContainerRef.current?.querySelector('svg')
        if (!svgEl) return

        // Inline computed styles
        const clone = svgEl.cloneNode(true) as SVGSVGElement
        const sourceNodes = svgEl.querySelectorAll('*')
        const cloneNodes = clone.querySelectorAll('*')
        sourceNodes.forEach((src, i) => {
            const cs = getComputedStyle(src)
            const target = cloneNodes[i] as HTMLElement | undefined
            if (!target) return
            let style = ''
            for (let j = 0; j < cs.length; j++) {
                const prop = cs[j]
                style += `${prop}:${cs.getPropertyValue(prop)};`
            }
            target.setAttribute('style', style)
        })

        const vb = svgEl.viewBox?.baseVal
        const w = (vb?.width || svgEl.getBoundingClientRect().width || 800)
        const h = (vb?.height || svgEl.getBoundingClientRect().height || 600)
        clone.setAttribute('width', String(w))
        clone.setAttribute('height', String(h))

        const serializer = new XMLSerializer()
        const svgStr = serializer.serializeToString(clone)
        const encoded = encodeURIComponent(svgStr)
        const dataUri = `data:image/svg+xml;charset=utf-8,${encoded}`

        const img = new window.Image()
        img.onload = () => {
            const scale = 2
            const canvas = document.createElement('canvas')
            canvas.width = w * scale
            canvas.height = h * scale
            const ctx = canvas.getContext('2d')
            if (!ctx) return
            ctx.drawImage(img, 0, 0, w * scale, h * scale)
            canvas.toBlob(pngBlob => {
                if (pngBlob) {
                    const pngUrl = URL.createObjectURL(pngBlob)
                    const a = document.createElement('a')
                    a.href = pngUrl
                    a.download = `mermaid-${Date.now()}.png`
                    a.click()
                    URL.revokeObjectURL(pngUrl)
                }
            }, 'image/png')
        }
        img.onerror = () => {
            console.error('Failed to load SVG image for PNG export')
        }
        img.src = dataUri
    }

    const zoomPercent = Math.round(zoom * 100)

    const toolbar = (
        <div className="flex items-center gap-0.5">
            {mode === 'preview' && (
                <>
                    <button onClick={handleZoomOut} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="缩小"><ZoomOut size={13} /></button>
                    <button onClick={handleReset} className="px-1.5 py-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-[10px] font-mono text-slate-500 dark:text-zinc-400 min-w-[36px] text-center" title="重置">{zoomPercent}%</button>
                    <button onClick={handleZoomIn} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="放大"><ZoomIn size={13} /></button>
                    <div className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5" />
                    {!isExpanded && (
                        <button onClick={() => { setIsExpanded(true); setZoom(1.2); }} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400" title="扩大显示"><Maximize2 size={13} /></button>
                    )}
                    <div className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5" />
                </>
            )}
            <button onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title={mode === 'preview' ? '查看代码' : '查看图表'}>{mode === 'preview' ? <Code2 size={13} /> : <Eye size={13} />}</button>
            <button onClick={handleCopy} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="复制代码">{copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}</button>
            <button onClick={handleExportSvg} disabled={!svgContent} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500 disabled:opacity-30" title="导出 SVG"><Download size={13} /></button>
            <button onClick={handleExportPng} disabled={!svgContent} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500 disabled:opacity-30" title="导出 PNG"><ImageIcon size={13} /></button>
        </div>
    )

    return (
        <div className="not-prose group/mermaid rounded-xl overflow-hidden my-3 border border-transparent bg-white dark:bg-[#0c0c0e]">
            <div className="relative">
                {/* Floating toolbar - top right, visible on hover */}
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/mermaid:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/mermaid:pointer-events-auto">
                    <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-sm border border-slate-200/50 dark:border-white/[0.06]">
                        {toolbar}
                    </div>
                </div>

                {mode === 'preview' && (
                    <div
                        ref={previewContainerRef}
                        className="overflow-hidden min-h-[80px]"
                        onWheel={handleWheel}
                    >
                        {rendering && !svgContent && (
                            <div className="flex items-center justify-center py-12 text-xs text-slate-400"><div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin mr-2" />渲染中...</div>
                        )}
                        {error && (
                            <div className="flex items-center justify-center gap-2 py-5 text-center">
                                <AlertTriangle size={14} className="text-slate-400 dark:text-zinc-500 shrink-0" />
                                <span className="text-xs text-slate-400 dark:text-zinc-500">图表渲染失败，语法存在错误</span>
                            </div>
                        )}
                        {svgContent && !error && (
                            <div
                                ref={svgContainerRef}
                                className="flex items-center justify-center p-6"
                                style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
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
