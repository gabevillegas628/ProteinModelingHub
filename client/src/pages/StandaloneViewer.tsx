import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { Link } from 'react-router-dom'

interface JmolInfo {
  width: number | string
  height: number | string
  color: string
  use: string
  j2sPath: string
  serverURL?: string
  script?: string
  disableJ2SLoadMonitor?: boolean
  disableInitialConsole?: boolean
  allowJavaScript?: boolean
  readyFunction?: (applet: JmolApplet) => void
  console?: string
}

interface JmolApplet {
  _id: string
}

type DisplayStyle = 'cartoon' | 'ribbon' | 'trace' | 'wireframe' | 'spacefill' | 'ball+stick'
type ColorScheme = 'structure' | 'chain' | 'amino' | 'temperature' | 'group'

export default function StandaloneViewer() {
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const consolePopoutRef = useRef<HTMLDivElement>(null)
  const appletRef = useRef<JmolApplet | null>(null)
  const consoleDivIdRef = useRef(`jsmolInfoDiv_${Math.random().toString(36).slice(2)}`)
  const consoleObserverRef = useRef<MutationObserver | null>(null)
  const suppressConsoleRef = useRef(true)
  const consoleDragRef = useRef({ active: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 })
  const appletReadyRef = useRef(false)
  const uploadedObjectUrlRef = useRef<string | null>(null)

  const [dark, setDark] = useState(() => localStorage.getItem('viewer-theme') !== 'light')
  const [appletLoading, setAppletLoading] = useState(true)
  const [appletError, setAppletError] = useState<string | null>(null)
  const [hasModel, setHasModel] = useState(false)
  const [modelLabel, setModelLabel] = useState('')

  // Load controls
  const [pdbInput, setPdbInput] = useState('')
  const [modelLoading, setModelLoading] = useState(false)

  // Display controls
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('cartoon')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('structure')
  const [showControls, setShowControls] = useState(true)

  // Console
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [consoleLog, setConsoleLog] = useState<Array<{ type: 'command' | 'output' | 'error'; text: string }>>([])
  const [consolePopout, setConsolePopout] = useState(false)
  const [consolePos, setConsolePos] = useState({ x: 0, y: 0 })

  // Help
  const [helpOpen, setHelpOpen] = useState(false)

  // ─── Theme ────────────────────────────────────────────────────────────────
  const t = {
    page:              dark ? 'bg-gray-900'                                      : 'bg-gray-100',
    // Header
    header:            dark ? 'bg-gray-800 border-gray-700'                      : 'bg-white border-gray-200',
    headerLink:        dark ? 'text-gray-400 hover:text-white'                   : 'text-gray-500 hover:text-gray-900',
    headerDivider:     dark ? 'bg-gray-700'                                      : 'bg-gray-300',
    headerTitle:       dark ? 'text-white'                                       : 'text-gray-900',
    headerSubtitle:    dark ? 'text-gray-500'                                    : 'text-gray-400',
    headerModelLabel:  dark ? 'text-gray-300'                                    : 'text-gray-600',
    headerModelSep:    dark ? 'text-gray-600'                                    : 'text-gray-300',
    logo:              dark ? '/modeling/images/RSUNJ_H_RED_WHITE_RGB.png'       : '/modeling/images/RSUNJ_H_RED_BLACK_RGB.png',
    btnIdle:           dark ? 'bg-gray-700 text-gray-300 hover:bg-gray-600'      : 'bg-gray-100 text-gray-600 hover:bg-gray-200',
    btnIconIdle:       dark ? 'text-gray-400 hover:text-white hover:bg-gray-700' : 'text-gray-500 hover:text-gray-900 hover:bg-gray-100',
    // Viewer
    viewerBg:          dark ? 'bg-[#111827]'                                     : 'bg-white',
    overlayBg:         dark ? 'bg-gray-900'                                      : 'bg-gray-100',
    overlayText:       dark ? 'text-gray-300'                                    : 'text-gray-600',
    overlayModelBg:    dark ? 'bg-gray-900/60'                                   : 'bg-gray-100/80',
    emptyText:         dark ? 'text-gray-500'                                    : 'text-gray-400',
    // Control panel
    panel:             dark ? 'bg-gray-800 border-gray-700'                      : 'bg-white border-gray-200',
    panelLabel:        dark ? 'text-gray-400'                                    : 'text-gray-500',
    panelDivider:      dark ? 'bg-gray-700'                                      : 'bg-gray-200',
    panelDividerText:  dark ? 'text-gray-500'                                    : 'text-gray-400',
    panelHint:         dark ? 'text-gray-600'                                    : 'text-gray-400',
    input:             dark ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-500'  : 'bg-white border-gray-300 text-gray-900 placeholder-gray-400',
    select:            dark ? 'bg-gray-700 border-gray-600 text-white'           : 'bg-white border-gray-300 text-gray-900',
    uploadEnabled:     dark ? 'border-gray-600 text-gray-400 hover:border-blue-500 hover:text-blue-400' : 'border-gray-300 text-gray-500 hover:border-blue-500 hover:text-blue-500',
    uploadDisabled:    dark ? 'border-gray-600 text-gray-600 cursor-not-allowed' : 'border-gray-200 text-gray-300 cursor-not-allowed',
    zoomBtn:           dark ? 'bg-gray-700 border-gray-600 text-gray-300 hover:bg-gray-600' : 'bg-white border-gray-300 text-gray-700 hover:bg-gray-50',
    // Console
    consoleBg:         dark ? 'bg-gray-900 border-gray-700'                      : 'bg-gray-50 border-gray-200',
    consoleLogBg:      dark ? 'bg-gray-800 border-gray-700'                      : 'bg-gray-100 border-gray-200',
    consolePrompt:     dark ? 'text-green-400'                                   : 'text-green-600',
    consoleCmd:        dark ? 'text-white'                                       : 'text-gray-900',
    consoleOut:        dark ? 'text-green-400'                                   : 'text-green-700',
    consolePlaceholder:dark ? 'placeholder-gray-600'                             : 'placeholder-gray-400',
    consoleInputText:  dark ? 'text-white'                                       : 'text-gray-900',
    consoleMeta:       dark ? 'text-gray-600'                                    : 'text-gray-400',
    consoleMetaBtn:    dark ? 'text-gray-500 hover:text-gray-300'                : 'text-gray-400 hover:text-gray-600',
    // Floating panels (help, console popout)
    floatPanel:        dark ? 'bg-gray-900/95 border-gray-700'                   : 'bg-white/95 border-gray-200',
    floatHeader:       dark ? 'bg-gray-800'                                      : 'bg-gray-50 border-b border-gray-200',
    floatHeaderText:   dark ? 'text-white'                                       : 'text-gray-900',
    floatHeaderBtn:    dark ? 'text-gray-400 hover:text-white'                   : 'text-gray-400 hover:text-gray-700',
    floatBody:         dark ? 'text-gray-200'                                    : 'text-gray-700',
    floatSection:      dark ? 'text-purple-400'                                  : 'text-purple-600',
    floatMono:         dark ? 'text-gray-300'                                    : 'text-gray-700',
    floatMuted:        dark ? 'text-gray-400'                                    : 'text-gray-500',
    floatDimmer:       dark ? 'text-gray-500'                                    : 'text-gray-400',
    codeSpan:          dark ? 'text-green-400 bg-gray-800'                       : 'text-green-700 bg-gray-100',
    // JSmol canvas background (RGB array string for Jmol script)
    jmolBg:            dark ? '[17,24,39]'                                       : '[255,255,255]',
  }
  // ──────────────────────────────────────────────────────────────────────────

  // Initialize JSmol applet once on mount
  useEffect(() => {
    if (!containerRef.current) return

    const initJSmol = () => {
      if (!window.Jmol) {
        setAppletError('JSmol library not loaded. Please refresh the page.')
        setAppletLoading(false)
        return
      }

      try {
        if (containerRef.current) containerRef.current.innerHTML = ''

        const Info: JmolInfo = {
          width: '100%',
          height: '100%',
          color: '0x111827',
          use: 'HTML5',
          j2sPath: '/modeling/jsmol/j2s',
          console: consoleDivIdRef.current,
          disableJ2SLoadMonitor: true,
          disableInitialConsole: true,
          allowJavaScript: true,
          readyFunction: () => {
            appletReadyRef.current = true

            const consoleEl = document.getElementById(consoleDivIdRef.current)
            if (consoleEl) {
              consoleEl.innerHTML = ''
              if (consoleObserverRef.current) consoleObserverRef.current.disconnect()
              suppressConsoleRef.current = true
              consoleObserverRef.current = new MutationObserver((mutations) => {
                let lastWasScriptError = false
                for (const mutation of mutations) {
                  for (const node of Array.from(mutation.addedNodes)) {
                    if (node.nodeType !== Node.ELEMENT_NODE) continue
                    const el = node as HTMLElement
                    const text = el.textContent?.replace(/[\n\r]/g, '').trim()
                    if (!text) continue
                    if (suppressConsoleRef.current) {
                      if (text === '__init_done__') suppressConsoleRef.current = false
                      continue
                    }
                    if (/^script \d+ started$/i.test(text)) continue
                    if (/^script completed$/i.test(text)) continue
                    if (/^jmol script terminated$/i.test(text)) continue
                    if (/^[A-Z][a-z]+[A-Z]/.test(text)) continue
                    if (/^setStatus/.test(text)) continue
                    if (/^loadScript /i.test(text)) continue
                    if (/^Time for /.test(text)) continue
                    if (/^The Resolver/.test(text)) continue
                    if (/^eval ERROR:/i.test(text)) continue
                    if (/^----$/.test(text)) continue
                    if (/^Token\[/.test(text)) continue
                    if (/^(Eval|END)$/.test(text)) continue
                    if (/^pc:\d+$/.test(text)) continue
                    if (/^\d+ statement/.test(text)) continue
                    if (lastWasScriptError) { lastWasScriptError = false; continue }

                    const color = el.style?.color ?? ''
                    const type = /^script ERROR:/i.test(text) || color.includes('red') ? 'error' : 'output'
                    lastWasScriptError = /^script ERROR:/i.test(text)
                    setConsoleLog(prev => [...prev, { type, text }])
                  }
                }
              })
              consoleObserverRef.current.observe(consoleEl, { childList: true })
            }

            if (appletRef.current && window.Jmol) {
              window.Jmol.script(appletRef.current, `
                set antialiasDisplay ON;
                set antialiastranslucent ON;
                set platformSpeed 3;
                unitcell off;
                set displaycellparameters false;
                background ${dark ? '[17,24,39]' : '[255,255,255]'};
                print "__init_done__";
              `)
            }
            setAppletLoading(false)
          },
        }

        window.Jmol.setDocument(false)
        const appletName = 'jsmolStandalone_' + Date.now()
        appletRef.current = window.Jmol.getApplet(appletName, Info)

        if (containerRef.current && appletRef.current) {
          containerRef.current.innerHTML = window.Jmol.getAppletHtml(appletRef.current)
        }
      } catch (err) {
        console.error('Error initializing JSmol:', err)
        setAppletError('Failed to initialize 3D viewer')
        setAppletLoading(false)
      }
    }

    if (window.Jmol) {
      initJSmol()
    } else {
      const checkInterval = setInterval(() => {
        if (window.Jmol) { clearInterval(checkInterval); initJSmol() }
      }, 100)
      const timeout = setTimeout(() => {
        clearInterval(checkInterval)
        if (!window.Jmol) { setAppletError('JSmol library failed to load'); setAppletLoading(false) }
      }, 10000)
      return () => { clearInterval(checkInterval); clearTimeout(timeout) }
    }
  }, [])

  // Update JSmol canvas background when theme changes
  useEffect(() => {
    if (!appletReadyRef.current || !appletRef.current || !window.Jmol) return
    window.Jmol.script(appletRef.current, `background ${dark ? '[17,24,39]' : '[255,255,255]'}`)
  }, [dark])

  // Cleanup object URL on unmount
  useEffect(() => {
    return () => { if (uploadedObjectUrlRef.current) URL.revokeObjectURL(uploadedObjectUrlRef.current) }
  }, [])

  // Drag the popout console
  useEffect(() => {
    if (!consolePopout) return
    const onMove = (e: MouseEvent) => {
      if (!consoleDragRef.current.active) return
      setConsolePos({
        x: consoleDragRef.current.startPosX + (e.clientX - consoleDragRef.current.startX),
        y: consoleDragRef.current.startPosY + (e.clientY - consoleDragRef.current.startY),
      })
    }
    const onUp = () => { consoleDragRef.current.active = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp) }
  }, [consolePopout])

  // Notify JSmol of canvas resize when console pops out
  useEffect(() => { window.dispatchEvent(new Event('resize')) }, [consolePopout])

  // Auto-scroll console
  useEffect(() => {
    if (consoleRef.current) consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    if (consolePopoutRef.current) consolePopoutRef.current.scrollTop = consolePopoutRef.current.scrollHeight
  }, [consoleLog])

  const runScript = (script: string) => {
    if (appletRef.current && window.Jmol) window.Jmol.script(appletRef.current, script)
  }

  const loadFromPdb = () => {
    const id = pdbInput.trim().toUpperCase()
    if (!id || !appletReadyRef.current) return
    setModelLoading(true)
    setHasModel(false)
    runScript(`load =${id}; cartoon only; color structure; unitcell off; set displaycellparameters false;`)
    setDisplayStyle('cartoon')
    setColorScheme('structure')
    setModelLabel(id)
    setTimeout(() => { setHasModel(true); setModelLoading(false) }, 3000)
  }

  const handleFileUpload = (file: File) => {
    if (!appletReadyRef.current) return

    setModelLoading(true)
    setHasModel(false)
    setModelLabel(file.name.replace(/\.(png|pngj|pdb)$/i, ''))
    setDisplayStyle('cartoon')
    setColorScheme('structure')

    if (/\.pdb$/i.test(file.name)) {
      // JSmol can't fetch blob: URLs (tries to proxy through jsmol.php).
      // Read the PDB text and pass it inline via the DATA syntax instead.
      const reader = new FileReader()
      reader.onload = e => {
        const content = e.target?.result as string
        runScript(`load DATA "pdb"\n${content}\nEND "pdb"\nunitcell off; set displaycellparameters false;`)
        setTimeout(() => { setHasModel(true); setModelLoading(false) }, 3000)
      }
      reader.onerror = () => setModelLoading(false)
      reader.readAsText(file)
    } else {
      // PNGJ/PNG — blob URLs work fine for these since JSmol reads them as binary state files
      if (uploadedObjectUrlRef.current) URL.revokeObjectURL(uploadedObjectUrlRef.current)
      const url = URL.createObjectURL(file)
      uploadedObjectUrlRef.current = url
      runScript(`load "${url}"; unitcell off; set displaycellparameters false;`)
      setTimeout(() => { setHasModel(true); setModelLoading(false) }, 3000)
    }
  }

  const handleDisplayStyleChange = (style: DisplayStyle) => {
    setDisplayStyle(style)
    const cmds: Record<DisplayStyle, string> = {
      cartoon: 'cartoon only', ribbon: 'ribbon only', trace: 'trace only',
      wireframe: 'wireframe only', spacefill: 'spacefill only', 'ball+stick': 'wireframe 0.15; spacefill 23%',
    }
    runScript(cmds[style])
  }

  const handleColorSchemeChange = (scheme: ColorScheme) => {
    setColorScheme(scheme)
    const cmds: Record<ColorScheme, string> = {
      structure: 'color structure', chain: 'color chain', amino: 'color amino',
      temperature: 'color temperature', group: 'color group',
    }
    runScript(cmds[scheme])
  }

  const handleZoom = (direction: 'in' | 'out') => {
    runScript(direction === 'in' ? 'zoom *1.2' : 'zoom /1.2')
  }

  const handleExportPngj = () => {
    if (!appletRef.current || !window.Jmol) return
    const safeName = (modelLabel || 'protein').replace(/[^a-zA-Z0-9]/g, '_')
    window.Jmol.script(appletRef.current, `write "${safeName}_${new Date().toISOString().slice(0, 10)}.png" as pngj`)
  }

  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return
    const cmd = command.trim()
    setCommandHistory(prev => [...prev, cmd])
    setCommand('')
    setHistoryIndex(-1)
    setConsoleLog(prev => [...prev, { type: 'command', text: cmd }])
    if (appletRef.current && window.Jmol) window.Jmol.script(appletRef.current, cmd)
  }

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (!commandHistory.length) return
      const idx = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(idx); setCommand(commandHistory[idx])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const idx = historyIndex + 1
      if (idx >= commandHistory.length) { setHistoryIndex(-1); setCommand('') }
      else { setHistoryIndex(idx); setCommand(commandHistory[idx]) }
    }
  }

  // Shared console log renderer (used in both docked and popout)
  const renderConsoleLog = () => consoleLog.map((entry, i) => (
    <div key={i} className={
      entry.type === 'command' ? t.consoleCmd :
      entry.type === 'error'   ? 'text-red-500' : t.consoleOut
    }>
      {entry.type === 'command' ? `> ${entry.text}` : `  ${entry.text}`}
    </div>
  ))

  return (
    <div className={`h-screen flex flex-col ${t.page} overflow-hidden`}>

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className={`shrink-0 flex items-center justify-between px-4 py-2 border-b ${t.header}`}>

        {/* Left: back link + Rutgers logo */}
        <div className="flex items-center gap-4">
          <Link to="/login" className={`flex items-center gap-1.5 text-sm transition-colors whitespace-nowrap ${t.headerLink}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to login
          </Link>
          <div className={`h-5 w-px ${t.headerDivider}`} />
          <img src={t.logo} alt="Rutgers University" className="h-7 object-contain" />
        </div>

        {/* Center: title + model label */}
        <div className="flex items-center gap-2">
          <svg className="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <div>
            <span className={`font-semibold text-sm ${t.headerTitle}`}>WSSP Protein Viewer</span>
            <span className={`text-xs ml-2 hidden sm:inline ${t.headerSubtitle}`}>Waksman Student Scholars Program</span>
          </div>
          {modelLabel && (
            <>
              <span className={t.headerModelSep}>·</span>
              <span className={`text-sm truncate max-w-48 ${t.headerModelLabel}`}>{modelLabel}</span>
            </>
          )}
        </div>

        {/* Right: theme toggle + help + controls */}
        <div className="flex items-center gap-2">
          {/* Theme toggle */}
          <button
            onClick={() => setDark(d => { const next = !d; localStorage.setItem('viewer-theme', next ? 'dark' : 'light'); return next })}
            className={`p-1.5 rounded transition-colors ${t.btnIconIdle}`}
            title={dark ? 'Switch to light mode' : 'Switch to dark mode'}
          >
            {dark ? (
              // Sun icon
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364-6.364l-.707.707M6.343 17.657l-.707.707M17.657 17.657l-.707-.707M6.343 6.343l-.707-.707M12 8a4 4 0 100 8 4 4 0 000-8z" />
              </svg>
            ) : (
              // Moon icon
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
              </svg>
            )}
          </button>

          <button
            onClick={() => setHelpOpen(o => !o)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
              helpOpen ? 'bg-purple-600 text-white' : t.btnIdle
            }`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Help
          </button>

          <button
            onClick={() => setShowControls(v => !v)}
            className={`p-1.5 rounded transition-colors ${t.btnIconIdle}`}
            title={showControls ? 'Hide controls' : 'Show controls'}
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
            </svg>
          </button>
        </div>
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Viewer */}
        <div className={`flex-1 relative ${t.viewerBg}`}>
          {appletLoading && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${t.overlayBg}`}>
              <div className="text-center">
                <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4" />
                <p className={t.overlayText}>Initializing 3D viewer…</p>
              </div>
            </div>
          )}
          {appletError && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${t.overlayBg}`}>
              <div className={`text-center p-4 ${t.headerTitle}`}>
                <svg className="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <p className="text-lg font-medium mb-2">Error</p>
                <p className={t.overlayText}>{appletError}</p>
              </div>
            </div>
          )}
          {modelLoading && !appletLoading && (
            <div className={`absolute inset-0 flex items-center justify-center z-10 ${t.overlayModelBg}`}>
              <div className="text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-500 mx-auto mb-3" />
                <p className={`text-sm ${t.overlayText}`}>Loading structure…</p>
              </div>
            </div>
          )}
          {!appletLoading && !appletError && !hasModel && !modelLoading && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-10">
              <div className={`text-center max-w-xs ${t.emptyText}`}>
                <svg className="w-14 h-14 mx-auto mb-3 opacity-30" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
                </svg>
                <p className="text-sm opacity-60">Enter a PDB ID or upload a PNGJ file to get started</p>
              </div>
            </div>
          )}
          <div ref={containerRef} className="absolute inset-0" />
          <div id={consoleDivIdRef.current} style={{ display: 'none' }} />
        </div>

        {/* Control panel */}
        {showControls && (
          <div className={`w-64 border-l overflow-y-auto shrink-0 ${t.panel}`}>
            <div className="p-4 space-y-5">

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Load from RCSB PDB</label>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={pdbInput}
                    onChange={e => setPdbInput(e.target.value)}
                    onKeyDown={e => { if (e.key === 'Enter') loadFromPdb() }}
                    placeholder="e.g. 1ABC"
                    maxLength={6}
                    className={`flex-1 min-w-0 px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 font-mono uppercase ${t.input}`}
                  />
                  <button
                    onClick={loadFromPdb}
                    disabled={!pdbInput.trim() || modelLoading || appletLoading}
                    className="px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
                  >
                    Load
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className={`flex-1 h-px ${t.panelDivider}`} />
                <span className={`text-xs ${t.panelDividerText}`}>or</span>
                <div className={`flex-1 h-px ${t.panelDivider}`} />
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Upload PNGJ File</label>
                <label className={`flex items-center justify-center gap-2 w-full px-3 py-2.5 border-2 border-dashed rounded text-sm transition-colors cursor-pointer ${
                  appletLoading || modelLoading ? t.uploadDisabled : t.uploadEnabled
                }`}>
                  <svg className="w-4 h-4 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                  </svg>
                  Choose file…
                  <input
                    type="file"
                    accept=".png,.pngj,.pdb"
                    className="sr-only"
                    disabled={appletLoading || modelLoading}
                    onChange={e => { const f = e.target.files?.[0]; if (f) handleFileUpload(f); e.target.value = '' }}
                  />
                </label>
                <p className={`text-xs mt-1 ${t.panelHint}`}>Accepts .pdb, .png, or .pngj files.</p>
              </div>

              <div className={`h-px ${t.panelDivider}`} />

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Display Style</label>
                <select
                  value={displayStyle}
                  onChange={e => handleDisplayStyleChange(e.target.value as DisplayStyle)}
                  disabled={!hasModel}
                  className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 ${t.select}`}
                >
                  <option value="cartoon">Cartoon</option>
                  <option value="ribbon">Ribbon</option>
                  <option value="trace">Trace</option>
                  <option value="wireframe">Wireframe</option>
                  <option value="spacefill">Spacefill</option>
                  <option value="ball+stick">Ball &amp; Stick</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Color Scheme</label>
                <select
                  value={colorScheme}
                  onChange={e => handleColorSchemeChange(e.target.value as ColorScheme)}
                  disabled={!hasModel}
                  className={`w-full px-3 py-2 border rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40 ${t.select}`}
                >
                  <option value="structure">Secondary Structure</option>
                  <option value="chain">Chain</option>
                  <option value="amino">Amino Acid</option>
                  <option value="temperature">Temperature</option>
                  <option value="group">Group</option>
                </select>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Zoom</label>
                <div className="grid grid-cols-2 gap-2">
                  <button onClick={() => handleZoom('in')}  disabled={!hasModel} className={`px-3 py-2 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed ${t.zoomBtn}`}>Zoom In</button>
                  <button onClick={() => handleZoom('out')} disabled={!hasModel} className={`px-3 py-2 border rounded text-sm disabled:opacity-40 disabled:cursor-not-allowed ${t.zoomBtn}`}>Zoom Out</button>
                </div>
              </div>

              <div>
                <label className={`block text-xs font-semibold uppercase tracking-wider mb-2 ${t.panelLabel}`}>Export</label>
                <button
                  onClick={handleExportPngj}
                  disabled={!hasModel}
                  className="w-full px-3 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-700 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition-colors"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                  Download PNGJ
                </button>
                <p className={`text-xs mt-1 ${t.panelHint}`}>Saves current view as a PNGJ file.</p>
              </div>

            </div>
          </div>
        )}
      </div>

      {/* ── Script Console (docked) ────────────────────────────────────────── */}
      {!consolePopout && (
        <div className={`border-t shrink-0 ${t.consoleBg}`}>
          {consoleLog.length > 0 && (
            <div ref={consoleRef} className={`px-4 py-2 font-mono text-sm border-b max-h-32 overflow-y-auto ${t.consoleLogBg}`}>
              {renderConsoleLog()}
            </div>
          )}
          <form onSubmit={handleCommandSubmit} className="flex items-center gap-3 px-4 py-3">
            <span className={`font-mono text-base ${t.consolePrompt}`}>{'>'}</span>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={handleCommandKeyDown}
              placeholder="Enter Jmol command (e.g., select helix; color red)"
              className={`flex-1 bg-transparent font-mono text-base focus:outline-none ${t.consoleInputText} ${t.consolePlaceholder}`}
            />
            <div className="flex items-center gap-3">
              <span className={`text-xs ${t.consoleMeta}`}>↑↓ history</span>
              {consoleLog.length > 0 && (
                <button type="button" onClick={() => setConsoleLog([])} className={`text-xs ${t.consoleMetaBtn}`}>clear</button>
              )}
              <button
                type="button"
                onClick={() => { setConsolePos({ x: window.innerWidth - 630, y: 20 }); setConsolePopout(true) }}
                className={t.consoleMetaBtn}
                title="Pop out console"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Help panel (portal) ────────────────────────────────────────────── */}
      {helpOpen && createPortal(
        <div className={`fixed bottom-6 left-6 w-105 rounded-lg border shadow-2xl flex flex-col overflow-hidden ${t.floatPanel}`} style={{ zIndex: 9999, maxHeight: '560px' }}>
          <div className={`flex items-center justify-between px-3 py-2.5 shrink-0 ${t.floatHeader}`}>
            <span className={`text-sm font-medium ${t.floatHeaderText}`}>JSmol Help</span>
            <button onClick={() => setHelpOpen(false)} className={t.floatHeaderBtn}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
          <div className={`overflow-y-auto p-4 space-y-5 text-sm ${t.floatBody}`}>

            <section>
              <h3 className={`font-semibold uppercase text-xs tracking-wider mb-2 ${t.floatSection}`}>Mouse Controls</h3>
              <table className="w-full text-xs border-separate" style={{ borderSpacing: '0 4px' }}>
                <tbody>
                  {[['Left-drag','Rotate'],['Right-drag / Shift+drag','Translate (pan)'],['Scroll wheel / pinch','Zoom'],['Double-click','Centre on atom'],['Ctrl+drag','Rotate Z-axis']].map(([a, d]) => (
                    <tr key={a}>
                      <td className={`pr-3 font-mono whitespace-nowrap ${t.floatMono}`}>{a}</td>
                      <td className={t.floatMuted}>{d}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>

            <section>
              <h3 className={`font-semibold uppercase text-xs tracking-wider mb-2 ${t.floatSection}`}>Script Console</h3>
              <p className={`text-xs mb-2 ${t.floatMuted}`}>Type Jmol commands in the bar at the bottom. Use ↑ / ↓ to recall previous commands.</p>
              <div className="space-y-1.5">
                {[['select <type>','Select atoms, e.g. select helix'],['label %n','Label atoms with residue number'],['label off','Remove all labels'],['zoom 200','Zoom to 200%'],['reset','Reset view to default'],['background white','Set background colour']].map(([cmd, desc]) => (
                  <div key={cmd} className="flex items-start gap-2">
                    <span className={`font-mono text-xs shrink-0 px-1.5 py-0.5 rounded ${t.codeSpan}`}>{cmd}</span>
                    <span className={`text-xs leading-5 ${t.floatMuted}`}>{desc}</span>
                  </div>
                ))}
              </div>
              <p className={`text-xs mt-3 mb-2 ${t.floatMuted}`}>Selection keywords:</p>
              <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[['protein','All protein atoms'],['backbone','Cα to Cα'],['sidechain','Side-chain atoms'],['helix','α-helices'],['sheet','β-strands'],['hydrophobic','NP residues'],['charged','Charged residues'],['nucleic','Nucleic acid'],['water','Solvent / water'],['hetero','Ligands / non-protein']].map(([kw, desc]) => (
                  <div key={kw} className="flex items-start gap-1.5 min-w-0">
                    <span className={`font-mono text-xs shrink-0 px-1.5 py-0.5 rounded ${t.codeSpan}`}>{kw}</span>
                    <span className={`text-xs leading-5 ${t.floatDimmer}`}>{desc}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className={`font-semibold uppercase text-xs tracking-wider mb-2 ${t.floatSection}`}>Display Style Commands</h3>
              <div className="space-y-1.5">
                {[['cartoon only','Helices as ribbons, strands as arrows'],['ribbon only','Smooth ribbon through Cα atoms'],['trace only','Simple Cα backbone trace'],['wireframe only','All bonds as lines — full atomic detail'],['spacefill only','Atoms as van der Waals spheres'],['wireframe 0.15; spacefill 23%','Ball & stick style']].map(([cmd, desc]) => (
                  <div key={cmd} className="flex items-start gap-2">
                    <span className={`font-mono text-xs shrink-0 px-1.5 py-0.5 rounded ${t.codeSpan}`}>{cmd}</span>
                    <span className={`text-xs leading-5 ${t.floatMuted}`}>{desc}</span>
                  </div>
                ))}
              </div>
            </section>

            <section>
              <h3 className={`font-semibold uppercase text-xs tracking-wider mb-2 ${t.floatSection}`}>Color Commands</h3>
              <div className="space-y-1.5">
                {[['color structure','Secondary structure colouring'],['color chain','Colour by chain'],['color amino','Colour by residue type'],['color temperature','B-factor colouring'],['color group','Rainbow N→C terminus'],['color red','Solid colour (any named colour)']].map(([cmd, desc]) => (
                  <div key={cmd} className="flex items-start gap-2">
                    <span className={`font-mono text-xs shrink-0 px-1.5 py-0.5 rounded ${t.codeSpan}`}>{cmd}</span>
                    <span className={`text-xs leading-5 ${t.floatMuted}`}>{desc}</span>
                  </div>
                ))}
              </div>
            </section>

          </div>
        </div>,
        document.body
      )}

      {/* ── Console popout (portal) ────────────────────────────────────────── */}
      {consolePopout && createPortal(
        <div
          style={{ position: 'fixed', left: consolePos.x, top: consolePos.y, zIndex: 9999, width: 620, height: 420, resize: 'both', overflow: 'hidden', minWidth: 320, minHeight: 200 }}
          className={`rounded-lg border shadow-2xl flex flex-col ${t.floatPanel}`}
        >
          <div
            className={`flex items-center justify-between px-3 py-2 rounded-t-lg cursor-move select-none shrink-0 ${t.floatHeader}`}
            onMouseDown={e => {
              consoleDragRef.current = { active: true, startX: e.clientX, startY: e.clientY, startPosX: consolePos.x, startPosY: consolePos.y }
            }}
          >
            <span className={`text-sm font-mono font-medium ${t.floatHeaderText}`}>Console</span>
            <div className="flex items-center gap-3">
              {consoleLog.length > 0 && (
                <button type="button" onClick={() => setConsoleLog([])} className={`text-xs ${t.consoleMetaBtn}`}>clear</button>
              )}
              <button type="button" onClick={() => setConsolePopout(false)} className={t.floatHeaderBtn} title="Dock console">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5M15 15l5 5m0 0v-5m0 5h-5" />
                </svg>
              </button>
            </div>
          </div>
          <div ref={consolePopoutRef} className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm min-h-0">
            {consoleLog.length === 0 && <p className={`text-xs mt-2 ${t.floatDimmer}`}>No output yet. Run a command below.</p>}
            {renderConsoleLog()}
          </div>
          <form onSubmit={handleCommandSubmit} className={`flex items-center gap-3 px-4 py-3 border-t shrink-0 ${dark ? 'border-gray-700' : 'border-gray-200'}`}>
            <span className={`font-mono text-base ${t.consolePrompt}`}>{'>'}</span>
            <input
              type="text"
              value={command}
              onChange={e => setCommand(e.target.value)}
              onKeyDown={handleCommandKeyDown}
              placeholder="Enter Jmol command…"
              className={`flex-1 bg-transparent font-mono text-base focus:outline-none ${t.consoleInputText} ${t.consolePlaceholder}`}
            />
            <span className={`text-xs ${t.consoleMeta}`}>↑↓ history</span>
          </form>
        </div>,
        document.body
      )}

    </div>
  )
}
