import React, { useState, useRef, useCallback, useEffect } from 'react'
import { Eye, Code2, ZoomIn, ZoomOut, Download, Maximize2, X, RotateCcw, ImageIcon } from 'lucide-react'
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
    const [baseZoom, setBaseZoom] = useState(1)
    const [pan, setPan] = useState({ x: 0, y: 0 })
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [error, setError] = useState<string | null>(null)
    const containerRef = useRef<HTMLDivElement>(null)
    const previewRef = useRef<HTMLDivElement>(null)
    const isPanning = useRef(false)
    const lastPos = useRef({ x: 0, y: 0 })

    // 清洗 SVG 内容，保留原始尺寸
    const sanitized = React.useMemo(() => {
        try {
            let result = DOMPurify.sanitize(code, PURIFY_CONFIG)
            if (!result.includes('<svg')) {
                setError('无效的 SVG 内容')
                return ''
            }
            // 如果 SVG 没有 viewBox 也没有 width/height，补一个 viewBox
            result = result.replace(
                /<svg([^>]*)>/,
                (_match, attrs: string) => {
                    const hasViewBox = /\bviewBox\s*=/.test(attrs)
                    const hasWidth = /\bwidth\s*=/.test(attrs)
                    const hasHeight = /\bheight\s*=/.test(attrs)
                    if (!hasViewBox && !hasWidth && !hasHeight) {
                        return `<svg${attrs} viewBox="0 0 800 600">`
                    }
                    return `<svg${attrs}>`
                }
            )
            setError(null)
            return result
        } catch (e: any) {
            setError(e.message)
            return ''
        }
    }, [code])

    // Auto-fit SVG to container
    useEffect(() => {
        if (!sanitized || !containerRef.current || !previewRef.current) return

        const svgEl = containerRef.current.querySelector('svg')
        if (!svgEl) return

        const containerWidth = previewRef.current.clientWidth - 48
        const containerHeight = 600
        const { width: svgWidth, height: svgHeight } = svgEl.getBoundingClientRect()

        if (svgWidth > 0 && containerWidth > 0) {
            const fitScale = Math.min(1, containerWidth / svgWidth, containerHeight / svgHeight)
            setBaseZoom(fitScale)
            setZoom(fitScale)
        }
    }, [sanitized])

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
        setZoom(baseZoom)
        setPan({ x: 0, y: 0 })
    }, [baseZoom])

    const handleDownload = useCallback(() => {
        const blob = new Blob([code], { type: 'image/svg+xml' })
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'diagram.svg'
        a.click()
        URL.revokeObjectURL(url)
    }, [code])

    const handleExportPng = useCallback(() => {
        const svgEl = containerRef.current?.querySelector('svg')
        if (!svgEl) return

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
                    a.download = 'diagram.png'
                    a.click()
                    URL.revokeObjectURL(pngUrl)
                }
            }, 'image/png')
        }
        img.onerror = () => {
            console.error('Failed to load SVG image for PNG export')
        }
        img.src = dataUri
    }, [])

    const zoomPercent = Math.round(zoom * 100)

    const toolbar = (
        <div className="flex items-center gap-0.5">
            {mode === 'preview' && (
                <>
                    <button onClick={() => setZoom(z => Math.min(5, z + 0.15))} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="放大"><ZoomIn size={13} /></button>
                    <button onClick={resetView} className="px-1.5 py-0.5 rounded-md hover:bg-black/10 dark:hover:bg-white/10 text-[10px] font-mono text-slate-500 dark:text-zinc-400 min-w-[36px] text-center" title="重置">{zoomPercent}%</button>
                    <button onClick={() => setZoom(z => Math.max(0.1, z - 0.15))} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="缩小"><ZoomOut size={13} /></button>
                    <div className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5" />
                    {!isFullscreen && (
                        <button onClick={() => setIsFullscreen(true)} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-400" title="全屏预览"><Maximize2 size={13} /></button>
                    )}
                    <div className="w-px h-3 bg-slate-200 dark:bg-white/10 mx-0.5" />
                </>
            )}
            <button onClick={() => setMode(mode === 'preview' ? 'code' : 'preview')} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title={mode === 'preview' ? '查看代码' : '查看图表'}>{mode === 'preview' ? <Code2 size={13} /> : <Eye size={13} />}</button>
            <button onClick={handleDownload} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="下载 SVG"><Download size={13} /></button>
            <button onClick={handleExportPng} className="p-1 rounded-md hover:bg-black/5 dark:hover:bg-white/10 text-slate-400 dark:text-zinc-500" title="导出 PNG"><ImageIcon size={13} /></button>
        </div>
    )

    return (
        <div className="not-prose group/svg rounded-xl overflow-hidden my-3 border border-transparent bg-white dark:bg-[#0c0c0e]">
            {/* Content */}
            <div ref={previewRef} className="relative overflow-hidden min-h-[80px]">
                {/* Floating toolbar - top right, visible on hover */}
                <div className="absolute top-2 right-2 z-10 opacity-0 group-hover/svg:opacity-100 transition-opacity duration-200 pointer-events-none group-hover/svg:pointer-events-auto">
                    <div className="flex items-center gap-0.5 px-1.5 py-1 rounded-lg bg-white/90 dark:bg-zinc-900/90 backdrop-blur-sm shadow-sm border border-slate-200/50 dark:border-white/[0.06]">
                        {toolbar}
                    </div>
                </div>

                {mode === 'preview' ? (
                    error ? (
                        <div className="flex flex-col items-center gap-2 text-red-500 dark:text-red-400 py-8">
                            <span className="text-sm">{error}</span>
                        </div>
                    ) : (
                        <div
                            ref={containerRef}
                            className="flex items-center justify-center p-6"
                            onWheel={handleWheel}
                            style={{ transform: `scale(${zoom})`, transformOrigin: 'top center' }}
                            dangerouslySetInnerHTML={{ __html: sanitized }}
                        />
                    )
                ) : (
                    <div className="overflow-auto max-h-[500px]">
                        <pre className="p-5 text-[13px] font-mono text-slate-800 dark:text-zinc-200 whitespace-pre-wrap break-all">{code}</pre>
                    </div>
                )}
            </div>

            {/* Fullscreen overlay */}
            {isFullscreen && createPortal(
                <div
                    className="fixed inset-0 z-[9999] bg-white/95 dark:bg-[#09090b]/98 backdrop-blur-md flex flex-col animate-in fade-in duration-200"
                    onMouseMove={handleMouseMove}
                    onMouseUp={handleMouseUp}
                    onMouseLeave={handleMouseUp}
                >
                    <div className="flex items-center justify-between pl-6 pr-[150px] py-3 border-b border-black/5 dark:border-white/5 bg-slate-50/50 dark:bg-white/[0.02]">
                        <div className="flex items-center gap-3">
                            <span className="text-sm font-semibold text-slate-700 dark:text-zinc-200">SVG 预览</span>
                        </div>
                        <div className="flex items-center gap-2">
                            <button onClick={() => setIsFullscreen(false)} className="px-4 py-2 rounded-lg bg-slate-200 dark:bg-white/10 hover:bg-red-500 hover:text-white text-slate-700 dark:text-zinc-200 text-xs font-semibold transition-all outline-none mr-2">
                                <span className="flex items-center gap-2"><X size={15} />退出预览 (ESC)</span>
                            </button>
                            <div className="w-px h-6 bg-black/10 dark:bg-white/10 mx-1" />
                            <div className="flex items-center border border-black/10 dark:border-white/10 rounded-lg overflow-hidden bg-white dark:bg-zinc-800">
                                <button onClick={() => setZoom(z => Math.min(5, z + 0.15))} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-zinc-400"><ZoomIn size={16} /></button>
                                <button onClick={resetView} className="px-3 py-1 font-mono text-xs text-slate-500 dark:text-zinc-400 hover:bg-black/5 dark:hover:bg-white/5 border-x border-black/5 dark:border-white/5">{zoomPercent}%</button>
                                <button onClick={() => setZoom(z => Math.max(0.1, z - 0.15))} className="p-2 hover:bg-black/5 dark:hover:bg-white/5 text-slate-500 dark:text-zinc-400"><ZoomOut size={16} /></button>
                            </div>
                            <button onClick={resetView} className="p-2 rounded-lg hover:bg-black/5 dark:hover:bg-white/10 text-slate-500 dark:text-zinc-400" title="复位"><RotateCcw size={16} /></button>
                        </div>
                    </div>

                    <div
                        className="flex-1 overflow-hidden relative cursor-grab active:cursor-grabbing"
                        onMouseDown={handleMouseDown}
                        onWheel={handleWheel}
                    >
                        <div
                            className="absolute transition-transform duration-75 select-none"
                            style={{
                                transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
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
                            dangerouslySetInnerHTML={{ __html: sanitized }}
                        />
                    </div>
                </div>,
                document.body
            )}
        </div>
    )
}
