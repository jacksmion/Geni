import React, { useEffect, useRef, useState, useCallback, useId } from 'react'
import { Eye, Code2, ZoomIn, ZoomOut, Copy, Check, Download, AlertTriangle } from 'lucide-react'
import { useSettingsStore } from '../store/useSettingsStore'

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
const ZOOM_MIN = 0.25
const ZOOM_MAX = 3
const DEBOUNCE_MS = 500

export default function MermaidBlock({ code }: MermaidBlockProps) {
    const uniqueId = useId().replace(/:/g, '_')
    const containerRef = useRef<HTMLDivElement>(null)
    const svgContainerRef = useRef<HTMLDivElement>(null)

    const [mode, setMode] = useState<'preview' | 'code'>('preview')
    const [zoom, setZoom] = useState(1)
    const [svgContent, setSvgContent] = useState<string>('')
    const [error, setError] = useState<string>('')
    const [rendering, setRendering] = useState(true)
    const [copied, setCopied] = useState(false)

    const { settings } = useSettingsStore()
    const isDark = settings.theme === 'dark'

    // Track render version to discard stale results
    const renderVersionRef = useRef(0)
    const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

    // Render mermaid diagram (debounced + serialized)
    const renderDiagram = useCallback((source: string) => {
        // Clear pending debounce
        if (debounceTimerRef.current) {
            clearTimeout(debounceTimerRef.current)
        }

        // Don't render empty or likely-incomplete code
        const trimmed = source.trim()
        if (!trimmed) {
            setSvgContent('')
            setError('')
            setRendering(false)
            return
        }

        setRendering(true)

        // Debounce: wait for code to stabilize (handles streaming)
        debounceTimerRef.current = setTimeout(async () => {
            const version = ++renderVersionRef.current
            const diagramId = `mermaid_${uniqueId}_${version}`

            try {
                const svg = await queueMermaidRender(diagramId, trimmed, isDark)

                // Only apply if this is still the latest render
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

    // Trigger render on code or theme change
    useEffect(() => {
        renderDiagram(code)
        return () => {
            if (debounceTimerRef.current) {
                clearTimeout(debounceTimerRef.current)
            }
        }
    }, [code, isDark, renderDiagram])

    // Zoom controls
    const handleZoomIn = () => setZoom(z => Math.min(z + ZOOM_STEP, ZOOM_MAX))
    const handleZoomOut = () => setZoom(z => Math.max(z - ZOOM_STEP, ZOOM_MIN))
    const handleZoomReset = () => setZoom(1)

    // Copy mermaid source
    const handleCopy = () => {
        navigator.clipboard.writeText(code)
        setCopied(true)
        setTimeout(() => setCopied(false), 2000)
    }

    // Export SVG
    const handleExportSvg = () => {
        if (!svgContent) return

        const blob = new Blob([svgContent], { type: 'image/svg+xml;charset=utf-8' })
        const url = URL.createObjectURL(blob)
        const link = document.createElement('a')
        link.href = url
        link.download = `mermaid-diagram-${Date.now()}.svg`
        document.body.appendChild(link)
        link.click()
        document.body.removeChild(link)
        URL.revokeObjectURL(url)
    }

    // Mouse wheel zoom (Ctrl + Scroll)
    const handleWheel = useCallback((e: React.WheelEvent) => {
        if (e.ctrlKey || e.metaKey) {
            e.preventDefault()
            e.stopPropagation()
            const delta = e.deltaY > 0 ? -ZOOM_STEP : ZOOM_STEP
            setZoom(z => Math.min(Math.max(z + delta, ZOOM_MIN), ZOOM_MAX))
        }
    }, [])

    const zoomPercent = Math.round(zoom * 100)

    return (
        <div
            ref={containerRef}
            className="not-prose group/mermaid rounded-xl overflow-hidden my-3 border border-slate-200 dark:border-zinc-800 shadow-sm bg-white dark:bg-[#0c0c0e]"
        >
            {/* Toolbar */}
            <div className="flex items-center justify-between px-3 py-1.5 bg-slate-50/80 dark:bg-white/[0.03] border-b border-slate-200 dark:border-white/5">
                {/* Left: Mode Toggle */}
                <div className="flex items-center gap-0.5 bg-slate-100 dark:bg-white/5 rounded-lg p-0.5">
                    <button
                        onClick={() => setMode('preview')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${mode === 'preview'
                            ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
                            }`}
                        title="Preview"
                    >
                        <Eye size={12} />
                        <span>Preview</span>
                    </button>
                    <button
                        onClick={() => setMode('code')}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-medium transition-all duration-200 ${mode === 'code'
                            ? 'bg-white dark:bg-zinc-700 text-indigo-600 dark:text-indigo-400 shadow-sm'
                            : 'text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300'
                            }`}
                        title="Source Code"
                    >
                        <Code2 size={12} />
                        <span>Code</span>
                    </button>
                </div>

                {/* Right: Actions */}
                <div className="flex items-center gap-1">
                    {/* Zoom Controls - only in preview mode */}
                    {mode === 'preview' && (
                        <div className="flex items-center gap-0.5 mr-1">
                            <button
                                onClick={handleZoomOut}
                                className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                                title="Zoom Out"
                            >
                                <ZoomOut size={13} />
                            </button>
                            <button
                                onClick={handleZoomReset}
                                className="px-1.5 py-0.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-[10px] font-mono font-medium text-slate-500 dark:text-zinc-500 hover:text-slate-700 dark:hover:text-zinc-300 transition-colors min-w-[36px] text-center"
                                title="Reset Zoom"
                            >
                                {zoomPercent}%
                            </button>
                            <button
                                onClick={handleZoomIn}
                                className="p-1 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                                title="Zoom In"
                            >
                                <ZoomIn size={13} />
                            </button>
                        </div>
                    )}

                    {/* Divider */}
                    {mode === 'preview' && (
                        <div className="w-px h-4 bg-slate-200 dark:bg-white/10 mx-0.5" />
                    )}

                    {/* Copy */}
                    <button
                        onClick={handleCopy}
                        className="p-1.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors"
                        title="Copy Code"
                    >
                        {copied ? <Check size={13} className="text-emerald-500" /> : <Copy size={13} />}
                    </button>

                    {/* Export SVG */}
                    <button
                        onClick={handleExportSvg}
                        disabled={!svgContent}
                        className="p-1.5 rounded-md hover:bg-slate-200/60 dark:hover:bg-white/10 text-slate-400 hover:text-slate-600 dark:text-zinc-500 dark:hover:text-zinc-300 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
                        title="Export SVG"
                    >
                        <Download size={13} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            <div className="relative">
                {/* Preview Mode */}
                {mode === 'preview' && (
                    <div
                        className="overflow-auto"
                        onWheel={handleWheel}
                        style={{ maxHeight: '600px', minHeight: '80px' }}
                    >
                        {rendering && !svgContent && (
                            <div className="flex items-center justify-center py-12">
                                <div className="flex items-center gap-2 text-xs text-slate-400 dark:text-zinc-500">
                                    <div className="w-4 h-4 border-2 border-indigo-500/30 border-t-indigo-500 rounded-full animate-spin" />
                                    <span>Rendering diagram...</span>
                                </div>
                            </div>
                        )}

                        {error && (
                            <div className="p-4">
                                <div className="flex items-start gap-2 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-200 dark:border-red-500/20">
                                    <AlertTriangle size={14} className="text-red-500 shrink-0 mt-0.5" />
                                    <div className="text-xs text-red-600 dark:text-red-400 font-mono leading-relaxed break-all">
                                        {error}
                                    </div>
                                </div>
                            </div>
                        )}

                        {svgContent && !error && (
                            <div
                                ref={svgContainerRef}
                                className="flex items-center justify-center p-6 transition-transform duration-150 ease-out"
                                style={{
                                    transform: `scale(${zoom})`,
                                    transformOrigin: 'center top',
                                    minHeight: zoom > 1 ? `${80 * zoom}px` : undefined,
                                }}
                                dangerouslySetInnerHTML={{ __html: svgContent }}
                            />
                        )}
                    </div>
                )}

                {/* Code Mode */}
                {mode === 'code' && (
                    <div className="overflow-auto" style={{ maxHeight: '500px' }}>
                        <pre className="p-5 text-[13px] leading-relaxed font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-all">
                            {code}
                        </pre>
                    </div>
                )}
            </div>
        </div>
    )
}
