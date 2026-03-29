import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { createPortal } from 'react-dom'
import { io } from 'socket.io-client'
import { useAuth } from '../../context/AuthContext'
import * as viewerChatApi from '../../services/viewerChatApi'

// Declare Jmol as a global variable (loaded from local files)
declare global {
  interface Window {
    Jmol: {
      getApplet: (name: string, info: JmolInfo) => JmolApplet;
      script: (applet: JmolApplet, script: string) => void;
      getAppletHtml: (applet: JmolApplet) => string;
      setDocument: (doc: boolean) => void;
      evaluateVar: (applet: JmolApplet, variable: string) => unknown;
      getPropertyAsString: (applet: JmolApplet, property: string, params?: string) => string;
      getPropertyAsArray: (applet: JmolApplet, property: string, params?: string) => number[];
      setCallback: (applet: JmolApplet, name: string, callbackName: string) => void;
    };
  }
}

interface JmolInfo {
  width: number | string;
  height: number | string;
  color: string;
  use: string;
  j2sPath: string;
  serverURL?: string;
  script?: string;
  disableJ2SLoadMonitor?: boolean;
  disableInitialConsole?: boolean;
  allowJavaScript?: boolean;
  readyFunction?: (applet: JmolApplet) => void;
  console?: string;
}

interface JmolApplet {
  _id: string;
}

interface JSmolViewerProps {
  isOpen: boolean;
  onClose: () => void;
  fileUrl: string;
  modelName: string;
  proteinPdbId?: string;
  templateId?: string;
  onSubmit?: (templateId: string, file: File) => Promise<void>;
  groupId?: string;
  dialogClassName?: string;
}

type DisplayStyle = 'cartoon' | 'ribbon' | 'trace' | 'wireframe' | 'spacefill' | 'ball+stick';
type ColorScheme = 'structure' | 'chain' | 'amino' | 'temperature' | 'group';

// Strip Jmol 'load ...' lines from a stateInfo script before broadcasting or applying it.
// Jmol's stateInfo always includes the original load command; if a receiver re-runs it,
// Jmol fires a fresh XHR for the file which blanks the viewport while it re-fetches.
// The receiver already has the model in memory, so the load line is safe to drop.
function stripLoadCommands(state: string): string {
  return state
    .split('\n')
    .filter(line => !line.trim().toLowerCase().startsWith('load '))
    .join('\n')
}

export default function JSmolViewer({ isOpen, onClose, fileUrl, modelName, proteinPdbId, templateId, onSubmit, groupId, dialogClassName }: JSmolViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const consolePopoutRef = useRef<HTMLDivElement>(null)
  const appletRef = useRef<JmolApplet | null>(null)
  const consoleDivIdRef = useRef(`jsmolInfoDiv_${Math.random().toString(36).slice(2)}`)
  const consoleObserverRef = useRef<MutationObserver | null>(null)
  const consoleDragRef = useRef({ active: false, startX: 0, startY: 0, startPosX: 0, startPosY: 0 })

  const originalStateRef = useRef<{ stateCommands: string | null }>({ stateCommands: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('cartoon')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('structure')
  const [showControls, setShowControls] = useState(true)
  const [hasOriginalState, setHasOriginalState] = useState(false)

  // Command console state
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [consoleLog, setConsoleLog] = useState<Array<{ type: 'command' | 'output' | 'error', text: string }>>([])
  const [consolePopout, setConsolePopout] = useState(false)
  const [consolePos, setConsolePos] = useState({ x: 0, y: 0 })
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitProgress, setSubmitProgress] = useState({ percent: 0, status: '' })
  const [showResetConfirm, setShowResetConfirm] = useState(false)

  // Collaborative sync state
  const socketRef = useRef<ReturnType<typeof io> | null>(null)
  const isApplyingRemoteRef = useRef(false)
  const lastEmittedStateRef = useRef<string>('')
  const lastReceivedAtRef = useRef(0)          // timestamp of last received remote update
  const pendingStateTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingStateApplyRef = useRef<string | null>(null)
  // True once the JSmol applet's readyFunction has fired (engine fully initialised).
  // Calling getPropertyAsString / script before this causes "this.sc is null" errors.
  const appletReadyRef = useRef(false)
  // True once Jmol has a model loaded and is ready to emit/receive sync state.
  // Prevents broadcasting a blank canvas during applet initialisation (Bug 2).
  const modelLoadedRef = useRef(false)
  // Passive-period refs: new joiners don't emit for 3s (or until they receive initial
  // sync from a peer), preventing their fresh default state from clobbering existing
  // users' orientation/colour changes before the peer-joined re-emit arrives.
  const joinedAtRef = useRef(0)
  const hasReceivedInitialSyncRef = useRef(false)
  const [peerCount, setPeerCount] = useState(1)
  const [syncEnabled, setSyncEnabled] = useState(true)
  const syncEnabledRef = useRef(true)

  // Viewer chat state
  const { user } = useAuth()
  const [helpOpen, setHelpOpen] = useState(false)
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<viewerChatApi.ViewerChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatPosting, setChatPosting] = useState(false)
  const [chatUnread, setChatUnread] = useState(0)
  const chatBottomRef = useRef<HTMLDivElement>(null)
  const chatInputRef = useRef<HTMLTextAreaElement>(null)
  const chatOpenRef = useRef(false)
  const latestMessageTimeRef = useRef<string | null>(null)
  const messagesContainerRef = useRef<HTMLDivElement>(null)
  const isNearBottomRef = useRef(true)
  const prevChatOpenRef = useRef(false)
  const prevMessageCountRef = useRef(0)
  const [newMsgCount, setNewMsgCount] = useState(0)

  const CHAT_GROUP_THRESHOLD_MS = 5 * 60 * 1000

  const groupedChatMessages = useMemo(() => {
    const groups: { senderId: string; senderName: string; isOwn: boolean; firstTime: Date; messages: viewerChatApi.ViewerChatMessage[] }[] = []
    for (const msg of chatMessages) {
      const isOwn = msg.user.id === user?.id
      const msgTime = new Date(msg.createdAt)
      const last = groups[groups.length - 1]
      if (last && last.senderId === msg.user.id && msgTime.getTime() - last.firstTime.getTime() < CHAT_GROUP_THRESHOLD_MS) {
        last.messages.push(msg)
      } else {
        groups.push({
          senderId: msg.user.id,
          senderName: isOwn ? 'You' : `${msg.user.firstName} ${msg.user.lastName}`,
          isOwn,
          firstTime: msgTime,
          messages: [msg],
        })
      }
    }
    return groups
  }, [chatMessages, user?.id])

  // Keep syncEnabledRef in sync with state
  useEffect(() => {
    syncEnabledRef.current = syncEnabled
  }, [syncEnabled])

  // Connect socket and join group room when viewer opens.
  // The room is scoped to group + file so that users in the same group
  // working on different models don't bleed state into each other (Bug 1).
  useEffect(() => {
    if (!isOpen || !groupId) return

    // Use just the file ID (last path segment, no extension) as the room key so that
    // students (/models/file/<id>.png) and instructors (/submissions/file/<id>.png)
    // resolve to the same room when viewing the same submission.
    const fileId = fileUrl
      ? fileUrl.split('?')[0].split('/').pop()?.replace(/\.png$/, '') ?? fileUrl
      : `new::${templateId}`
    const syncRoomId = `${groupId}::${fileId}`

    // Reset passive-period state on every (re-)connect.
    joinedAtRef.current = Date.now()
    hasReceivedInitialSyncRef.current = false
    setPeerCount(1)

    const socket = io({ path: '/modeling/socket.io/', auth: { token: localStorage.getItem('token') ?? '' } })
    socketRef.current = socket
    socket.emit('join-group', syncRoomId)

    socket.on('peer-count', (count: number) => {
      setPeerCount(count)
    })

    // When a new peer joins our room, wait 2s (giving them time to load their model)
    // then re-broadcast our last known state so they immediately see the current view.
    socket.on('peer-joined', () => {
      setTimeout(() => {
        const state = lastEmittedStateRef.current
        if (state && socketRef.current && syncEnabledRef.current) {
          socketRef.current.emit('viewer-state', { groupId: syncRoomId, state })
        }
      }, 2000)
    })

    socket.on('viewer-state', (state: string) => {
      // Gate on appletReady (engine initialised) rather than modelLoaded — the re-emit
      // from existing peers arrives ~2s after join, by which point the model is loaded.
      // Using modelLoaded here would block reception on slow-loading models.
      if (!syncEnabledRef.current || !appletReadyRef.current || !appletRef.current || !window.Jmol) return

      // Receiving any state from a peer means initial sync is complete; the passive
      // period can end early so we start contributing our own updates sooner.
      hasReceivedInitialSyncRef.current = true
      lastReceivedAtRef.current = Date.now()
      isApplyingRemoteRef.current = true

      // Strip load commands before applying so Jmol doesn't re-fetch the file
      // (which would blank the viewport for the duration of the XHR).
      const cleanState = stripLoadCommands(state)

      // Debounce application: if multiple states arrive in a burst, apply only the latest.
      // This prevents flooding Jmol with rapid intermediate states during a drag.
      if (pendingStateTimerRef.current !== null) clearTimeout(pendingStateTimerRef.current)
      pendingStateApplyRef.current = cleanState
      pendingStateTimerRef.current = setTimeout(() => {
        if (pendingStateApplyRef.current && appletRef.current && window.Jmol) {
          window.Jmol.script(appletRef.current, pendingStateApplyRef.current)
          pendingStateApplyRef.current = null
        }
        pendingStateTimerRef.current = null
        // Hold the lock long enough to cover the next poll cycle, preventing
        // the receiver from immediately re-emitting the state it just applied.
        setTimeout(() => { isApplyingRemoteRef.current = false }, 300)
      }, 50)
    })

    return () => {
      socket.emit('leave-group', syncRoomId)
      socket.disconnect()
      socketRef.current = null
    }
  }, [isOpen, groupId, fileUrl])

  // Poll Jmol state and emit to group when it changes
  useEffect(() => {
    if (!isOpen || !groupId || !syncEnabled) return

    const fileId = fileUrl
      ? fileUrl.split('?')[0].split('/').pop()?.replace(/\.png$/, '') ?? fileUrl
      : `new::${templateId}`
    const syncRoomId = `${groupId}::${fileId}`

    const interval = setInterval(() => {
      if (isApplyingRemoteRef.current || !appletRef.current || !appletReadyRef.current || !window.Jmol || !socketRef.current) return

      // Passive period: don't emit until we've received initial state from a peer
      // (hasReceivedInitialSyncRef) OR 3s have elapsed since joining. This prevents
      // a newly-opened viewer from broadcasting its default loaded state and clobbering
      // another user's orientation before the peer-joined re-emit (at ~2s) arrives.
      if (!hasReceivedInitialSyncRef.current && Date.now() - joinedAtRef.current < 3000) return

      // Wait until Jmol has a model loaded before emitting anything.
      // We detect this via stateInfo length: a blank/initialising applet produces
      // a very short state script (<200 chars), whereas a loaded structure is much longer.
      const rawState = window.Jmol.getPropertyAsString(appletRef.current, 'stateInfo')
      if (!rawState) return
      if (!modelLoadedRef.current) {
        if (rawState.length > 200) modelLoadedRef.current = true
        return // Always skip this cycle; emit starts on the next tick after detection
      }

      // Strip load commands so receivers don't re-fetch the model file on every apply.
      const state = stripLoadCommands(rawState)

      // Quiet period: don't emit for 500ms after receiving a remote update.
      // This breaks the feedback loop where both clients continuously echo each other's state —
      // the user who received a state update becomes a pure follower temporarily.
      if (Date.now() - lastReceivedAtRef.current < 500) return

      if (state !== lastEmittedStateRef.current) {
        lastEmittedStateRef.current = state
        socketRef.current.emit('viewer-state', { groupId: syncRoomId, state })
      }
    }, 100) // Reduced from 250ms → faster propagation of the active user's changes

    return () => clearInterval(interval)
  }, [isOpen, groupId, syncEnabled, fileUrl])

  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    // Clear console log when viewer opens
    setConsoleLog([])

    const initJSmol = async () => {
      // Reset both flags whenever we reinitialise so the poll doesn't call JSmol
      // APIs before the engine is ready.
      appletReadyRef.current = false
      modelLoadedRef.current = false

      if (!window.Jmol) {
        setError('JSmol library not loaded. Please refresh the page.')
        setLoading(false)
        return
      }

      try {
        setLoading(true)
        setError(null)

        if (containerRef.current) {
          containerRef.current.innerHTML = ''
        }

        // Configure JSmol with local paths
        const Info: JmolInfo = {
          width: '100%',
          height: '100%',
          color: '0x111827',  // Match Tailwind's gray-900
          use: 'HTML5',
          j2sPath: '/modeling/jsmol/j2s',  // Local path (includes subdirectory prefix)
          console: consoleDivIdRef.current,
          disableJ2SLoadMonitor: true,
          disableInitialConsole: true,
          allowJavaScript: true,
          readyFunction: () => {
            appletReadyRef.current = true
            if (appletRef.current && window.Jmol) {

              // Wire up MutationObserver on the hidden JSmol infodiv so we get
              // accurate console output (print, errors, etc.) directly from JSmol.
              const consoleEl = document.getElementById(consoleDivIdRef.current)
              if (consoleEl) {
                consoleEl.innerHTML = ''
                if (consoleObserverRef.current) consoleObserverRef.current.disconnect()
                consoleObserverRef.current = new MutationObserver((mutations) => {
                  let lastWasScriptError = false
                  for (const mutation of mutations) {
                    for (const node of Array.from(mutation.addedNodes)) {
                      if (node.nodeType !== Node.ELEMENT_NODE) continue
                      const el = node as HTMLElement
                      const text = el.textContent?.replace(/[\n\r]/g, '').trim()
                      if (!text) continue
                      // Filter script lifecycle noise
                      if (/^script \d+ started$/i.test(text)) continue
                      if (/^script completed$/i.test(text)) continue
                      if (/^jmol script terminated$/i.test(text)) continue
                      // Filter internal subsystem messages — CamelCase names (FileManager, ActionManager, ModelSet, etc.)
                      if (/^[A-Z][a-z]+[A-Z]/.test(text)) continue
                      // Filter other internal patterns not caught by the CamelCase rule
                      if (/^setStatus/.test(text)) continue
                      if (/^loadScript /i.test(text)) continue
                      if (/^Time for /.test(text)) continue
                      if (/^The Resolver/.test(text)) continue
                      // Filter eval ERROR debug dump — keep only the script ERROR: line
                      if (/^eval ERROR:/i.test(text)) continue
                      if (/^----$/.test(text)) continue
                      if (/^Token\[/.test(text)) continue
                      if (/^(Eval|END)$/.test(text)) continue
                      if (/^pc:\d+$/.test(text)) continue
                      if (/^\d+ statement/.test(text)) continue
                      // Drop the offending command line that follows a script ERROR
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

              // Set up base rendering settings
              const baseSettings = `
                set antialiasDisplay ON;
                set antialiastranslucent ON;
                set platformSpeed 3;
              `

              // Load the model - either from a saved PNGJ file or fresh from RCSB PDB
              const loadCommand = fileUrl
                ? `load "${fileUrl}";`
                : proteinPdbId
                  ? `load =${proteinPdbId}; cartoon only; color structure;`
                  : ''

              window.Jmol.script(appletRef.current!, `
                ${baseSettings}
                ${loadCommand}
              `)

              // Store original state for reset functionality
              if (fileUrl) {
                setHasOriginalState(true)
                originalStateRef.current = { stateCommands: `load "${fileUrl}";` }
              } else if (proteinPdbId) {
                setHasOriginalState(true)
                originalStateRef.current = { stateCommands: `load =${proteinPdbId}; cartoon only; color structure;` }
              }
            }
            setLoading(false)
          }
        }

        window.Jmol.setDocument(false)

        const appletName = 'jsmolViewer_' + Date.now()

        appletRef.current = window.Jmol.getApplet(appletName, Info)

        if (containerRef.current && appletRef.current) {
          containerRef.current.innerHTML = window.Jmol.getAppletHtml(appletRef.current)
        }
      } catch (err) {
        console.error('Error initializing JSmol:', err)
        setError('Failed to initialize 3D viewer')
        setLoading(false)
      }
    }

    if (window.Jmol) {
      initJSmol()
    } else {
      const checkInterval = setInterval(() => {
        if (window.Jmol) {
          clearInterval(checkInterval)
          initJSmol()
        }
      }, 100)

      setTimeout(() => {
        clearInterval(checkInterval)
        if (!window.Jmol) {
          setError('JSmol library failed to load')
          setLoading(false)
        }
      }, 10000)

      return () => clearInterval(checkInterval)
    }
  }, [isOpen, fileUrl, proteinPdbId])

  useEffect(() => {
    if (!isOpen) {
      appletRef.current = null
      consoleObserverRef.current?.disconnect()
      consoleObserverRef.current = null
    }
  }, [isOpen])

  // Lock body scroll while the modal is open so the page behind doesn't scroll
  useEffect(() => {
    if (!isOpen) return
    document.body.style.overflow = 'hidden'
    return () => { document.body.style.overflow = '' }
  }, [isOpen])

  // Notify JSmol of its new canvas size after the console pops out or back in
  useEffect(() => {
    window.dispatchEvent(new Event('resize'))
  }, [consolePopout])

  // Auto-scroll console to bottom when new entries are added
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
    if (consolePopoutRef.current) {
      consolePopoutRef.current.scrollTop = consolePopoutRef.current.scrollHeight
    }
  }, [consoleLog])

  // Drag the popout console
  useEffect(() => {
    if (!consolePopout) return
    const onMove = (e: MouseEvent) => {
      if (!consoleDragRef.current.active) return
      const dx = e.clientX - consoleDragRef.current.startX
      const dy = e.clientY - consoleDragRef.current.startY
      setConsolePos({
        x: consoleDragRef.current.startPosX + dx,
        y: consoleDragRef.current.startPosY + dy,
      })
    }
    const onUp = () => { consoleDragRef.current.active = false }
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
    }
  }, [consolePopout])

  const runScript = (script: string) => {
    if (appletRef.current && window.Jmol) {
      window.Jmol.script(appletRef.current, script)
    }
  }

  const handleLoadFromPDB = () => {
    if (proteinPdbId) {
      setLoading(true)
      runScript(`
        load =${proteinPdbId};
        cartoon only;
        color structure;
      `)
      setDisplayStyle('cartoon')
      setColorScheme('structure')
      setTimeout(() => setLoading(false), 2000)
    }
  }

  const handleResetToStudentView = () => {
    if (originalStateRef.current.stateCommands && appletRef.current && window.Jmol) {
      console.log('Resetting to student view')
      runScript(originalStateRef.current.stateCommands)
    }
  }

  const handleDisplayStyleChange = (style: DisplayStyle) => {
    setDisplayStyle(style)
    const styleCommands: Record<DisplayStyle, string> = {
      'cartoon': 'cartoon only',
      'ribbon': 'ribbon only',
      'trace': 'trace only',
      'wireframe': 'wireframe only',
      'spacefill': 'spacefill only',
      'ball+stick': 'wireframe 0.15; spacefill 23%'
    }
    runScript(styleCommands[style])
  }

  const handleColorSchemeChange = (scheme: ColorScheme) => {
    setColorScheme(scheme)
    const colorCommands: Record<ColorScheme, string> = {
      'structure': 'color structure',
      'chain': 'color chain',
      'amino': 'color amino',
      'temperature': 'color temperature',
      'group': 'color group'
    }
    runScript(colorCommands[scheme])
  }

  const handleZoom = (direction: 'in' | 'out') => {
    runScript(direction === 'in' ? 'zoom *1.2' : 'zoom /1.2')
  }


  // Command console handlers
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    const cmd = command.trim()
    setCommandHistory(prev => [...prev, cmd])
    setCommand('')
    setHistoryIndex(-1)

    // Add command to console log
    setConsoleLog(prev => [...prev, { type: 'command', text: cmd }])

    if (appletRef.current && window.Jmol) {
      window.Jmol.script(appletRef.current, cmd)
    }
  }

  const handleCommandKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      if (commandHistory.length === 0) return
      const newIndex = historyIndex === -1 ? commandHistory.length - 1 : Math.max(0, historyIndex - 1)
      setHistoryIndex(newIndex)
      setCommand(commandHistory[newIndex])
    } else if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (historyIndex === -1) return
      const newIndex = historyIndex + 1
      if (newIndex >= commandHistory.length) {
        setHistoryIndex(-1)
        setCommand('')
      } else {
        setHistoryIndex(newIndex)
        setCommand(commandHistory[newIndex])
      }
    }
  }

  // Export current view as PNGJ file (triggers download)
  const handleExportPngj = () => {
    if (!appletRef.current || !window.Jmol) return

    // Generate filename with model name and timestamp
    const timestamp = new Date().toISOString().slice(0, 10)
    const safeName = modelName.replace(/[^a-zA-Z0-9]/g, '_')
    const filename = `${safeName}_${timestamp}.png`

    window.Jmol.script(appletRef.current, `write "${filename}" as pngj`)
  }

  // Helper to animate progress with variable speed
  const animateProgress = (from: number, to: number, duration: number): Promise<void> => {
    return new Promise((resolve) => {
      const startTime = Date.now()
      const animate = () => {
        const elapsed = Date.now() - startTime
        const progress = Math.min(elapsed / duration, 1)
        // Ease out cubic for natural feel
        const eased = 1 - Math.pow(1 - progress, 3)
        const current = from + (to - from) * eased
        setSubmitProgress(prev => ({ ...prev, percent: Math.round(current) }))

        if (progress < 1) {
          requestAnimationFrame(animate)
        } else {
          resolve()
        }
      }
      animate()
    })
  }

  // Submit current view as PNGJ to the server by intercepting the download
  const handleSubmitPngj = async () => {
    if (!appletRef.current || !window.Jmol || !templateId || !onSubmit) return

    setIsSubmitting(true)
    setSubmitProgress({ percent: 0, status: 'Preparing export...' })

    try {
      // Animate initial progress
      await animateProgress(0, 15, 300 + Math.random() * 200)
      setSubmitProgress(prev => ({ ...prev, status: 'Generating PNGJ image...' }))

      // Set up interception BEFORE triggering the write
      const originalClick = HTMLAnchorElement.prototype.click
      let captured = false
      let resolveBlob: (blob: Blob) => void
      let rejectBlob: (err: Error) => void

      const blobPromise = new Promise<Blob>((resolve, reject) => {
        resolveBlob = resolve
        rejectBlob = reject
      })

      const timeoutId = setTimeout(() => {
        HTMLAnchorElement.prototype.click = originalClick
        if (!captured) {
          rejectBlob(new Error('Timeout waiting for PNGJ download from JSmol'))
        }
      }, 5000)

      HTMLAnchorElement.prototype.click = function(this: HTMLAnchorElement) {
        // Check for data URL (base64 encoded) - this is what JSmol uses
        if (this.download && this.href && this.href.startsWith('data:image/png;base64,') && !captured) {
          // Convert data URL to Blob
          fetch(this.href)
            .then(response => response.blob())
            .then(fetchedBlob => {
              captured = true
              clearTimeout(timeoutId)
              HTMLAnchorElement.prototype.click = originalClick
              resolveBlob(fetchedBlob)
            })
            .catch(err => {
              HTMLAnchorElement.prototype.click = originalClick
              rejectBlob(err)
            })

          // DON'T call originalClick - prevent the download since we captured the data
          // This should also prevent the JSmol error
          return
        }

        // Also check for blob URLs as fallback
        if (this.download && this.href && this.href.startsWith('blob:') && !captured) {
          fetch(this.href)
            .then(response => response.blob())
            .then(fetchedBlob => {
              captured = true
              clearTimeout(timeoutId)
              HTMLAnchorElement.prototype.click = originalClick
              resolveBlob(fetchedBlob)
            })
            .catch(err => {
              HTMLAnchorElement.prototype.click = originalClick
              rejectBlob(err)
            })

          return
        }

        originalClick.call(this)
      }

      // Trigger JSmol to write the PNGJ
      const filename = `export_${Date.now()}.png`

      // Intercept window.prompt to auto-respond to JSmol's filename dialog
      const originalPrompt = window.prompt
      window.prompt = () => {
        return filename
      }

      try {
        window.Jmol.script(appletRef.current!, `write "${filename}" as pngj`)
      } catch (scriptErr) {
        HTMLAnchorElement.prototype.click = originalClick
        window.prompt = originalPrompt
        throw scriptErr
      } finally {
        // Restore original prompt after a short delay to ensure JSmol has finished
        setTimeout(() => {
          window.prompt = originalPrompt
        }, 100)
      }

      await animateProgress(15, 35, 400 + Math.random() * 300)

      const blob = await blobPromise

      setSubmitProgress(prev => ({ ...prev, status: 'Processing image data...' }))
      await animateProgress(35, 55, 300 + Math.random() * 200)

      // Create File from Blob
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const safeName = modelName.replace(/[^a-zA-Z0-9]/g, '_')
      const filename2 = `${safeName}_${timestamp}.png`
      const file = new File([blob], filename2, { type: 'image/png' })

      setSubmitProgress(prev => ({ ...prev, status: 'Uploading to server...' }))
      await animateProgress(55, 85, 500 + Math.random() * 400)

      // Call the onSubmit callback
      await onSubmit(templateId, file)

      setSubmitProgress(prev => ({ ...prev, status: 'Finalizing...' }))
      await animateProgress(85, 100, 200 + Math.random() * 100)

      setSubmitProgress({ percent: 100, status: 'Complete!' })
      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to submit model')
    } finally {
      setIsSubmitting(false)
    }
  }

  // Chat: load messages and sync server-computed unread count
  const loadChat = useCallback(async () => {
    if (!groupId || !templateId) return
    try {
      const { messages, unreadCount } = await viewerChatApi.getViewerChat(groupId, templateId)
      if (messages.length > 0) {
        latestMessageTimeRef.current = messages[messages.length - 1].createdAt
      }
      setChatMessages(prev => {
        // Return the same reference when no new messages have arrived so
        // dependent effects (auto-scroll) don't fire on every poll cycle.
        if (
          prev.length === messages.length &&
          prev[prev.length - 1]?.id === messages[messages.length - 1]?.id
        ) return prev
        return messages
      })
      // Only update the badge from the server when the chat panel is closed;
      // while open, we immediately mark as read so the count stays 0.
      if (!chatOpenRef.current) {
        setChatUnread(unreadCount)
      }
    } catch {
      // silent — don't disrupt the viewer for chat errors
    }
  }, [groupId, templateId])

  // Chat: poll every 5s when viewer is open
  useEffect(() => {
    if (!groupId || !templateId || !isOpen) return
    loadChat()
    const interval = setInterval(loadChat, 5000)
    return () => clearInterval(interval)
  }, [groupId, templateId, isOpen, loadChat])

  // Chat: auto-scroll to bottom when panel opens or new messages arrive while open
  useEffect(() => {
    if (chatOpen) {
      const arrivedCount = chatMessages.length - prevMessageCountRef.current
      if (!prevChatOpenRef.current) {
        // Panel just opened — always scroll, reset any stale pill count
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        setNewMsgCount(0)
      } else if (isNearBottomRef.current) {
        // Already at the bottom — scroll to keep up, no pill needed
        chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
        setNewMsgCount(0)
      } else if (arrivedCount > 0) {
        // Scrolled up and new messages arrived — show pill instead of scrolling
        setNewMsgCount(prev => prev + arrivedCount)
      }
    }
    prevChatOpenRef.current = chatOpen
    prevMessageCountRef.current = chatMessages.length
  }, [chatMessages, chatOpen])

  // Chat: mark as read on the server whenever the panel is open and messages exist
  useEffect(() => {
    if (!chatOpen || !groupId || !templateId || !latestMessageTimeRef.current) return
    setChatUnread(0)
    viewerChatApi.markViewerChatRead(groupId, templateId, latestMessageTimeRef.current).catch(() => {})
  }, [chatOpen, chatMessages, groupId, templateId])

  // Chat: keep ref in sync for unread counting
  useEffect(() => { chatOpenRef.current = chatOpen }, [chatOpen])

  const handleChatPost = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!groupId || !templateId || !chatInput.trim() || chatPosting) return
    try {
      setChatPosting(true)
      const msg = await viewerChatApi.postViewerChat(groupId, templateId, chatInput.trim())
      isNearBottomRef.current = true  // always scroll to own sent message
      setNewMsgCount(0)
      setChatMessages(prev => [...prev, msg])
      setChatInput('')
    } catch {
      // silent
    } finally {
      setChatPosting(false)
      // Defer focus until after React re-renders with disabled=false,
      // otherwise focus is called while the textarea is still disabled.
      setTimeout(() => {
        if (chatInputRef.current) {
          chatInputRef.current.style.height = 'auto'
          chatInputRef.current.focus()
        }
      }, 0)
    }
  }

  if (!isOpen) return null

  return (
    <>
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className={`bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 overflow-hidden max-h-[95vh] flex flex-col isolate${dialogClassName ? ` ${dialogClassName}` : ''}`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{modelName}</h3>
            <p className="text-sm text-gray-500">3D Molecular Viewer {proteinPdbId && `• ${proteinPdbId}`}</p>
          </div>
          <div className="flex items-center gap-2">
            {groupId && (
              <div
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium select-none ${
                  peerCount > 1
                    ? 'bg-green-100 text-green-700'
                    : 'bg-gray-100 text-gray-500'
                }`}
                title={peerCount > 1 ? `${peerCount} people have this model open` : 'Only you have this model open'}
              >
                <span className={`w-2 h-2 rounded-full ${peerCount > 1 ? 'bg-green-500' : 'bg-gray-400'}`} />
                {peerCount > 1 ? `${peerCount} viewing` : 'Solo'}
              </div>
            )}
            {groupId && (
              <button
                onClick={() => setSyncEnabled(!syncEnabled)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  syncEnabled
                    ? 'bg-green-100 text-green-700 hover:bg-green-200'
                    : 'bg-gray-100 text-gray-500 hover:bg-gray-200'
                }`}
                title={syncEnabled ? 'View sync ON — your group sees this view' : 'View sync OFF — click to share your view'}
              >
                <span className={`w-2 h-2 rounded-full ${syncEnabled ? 'bg-green-500' : 'bg-gray-400'}`} />
                {syncEnabled ? 'Synced' : 'Sync Off'}
              </button>
            )}
            {groupId && templateId && (
              <button
                onClick={() => setChatOpen(o => !o)}
                className={`relative flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  chatOpen
                    ? 'bg-blue-100 text-blue-700 hover:bg-blue-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={chatOpen ? 'Close chat' : 'Open model chat'}
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                </svg>
                Team Chat
                {chatUnread > 0 && !chatOpen && (
                  <span className="absolute -top-1 -right-1 bg-red-500 text-white text-[10px] font-bold rounded-full w-4 h-4 flex items-center justify-center">
                    {chatUnread > 9 ? '9+' : chatUnread}
                  </span>
                )}
              </button>
            )}
            <button
              onClick={() => setHelpOpen(o => !o)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                helpOpen
                  ? 'bg-purple-100 text-purple-700 hover:bg-purple-200'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
              title={helpOpen ? 'Close help' : 'Open JSmol help'}
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              Help
            </button>
            <button
              onClick={() => setShowControls(!showControls)}
              className="text-gray-500 hover:text-gray-700 p-2"
              title={showControls ? 'Hide controls' : 'Show controls'}
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" />
              </svg>
            </button>
            <button onClick={onClose} className="text-gray-400 hover:text-gray-600 p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>
        </div>

        {/* Main content */}
        <div className="flex flex-1 overflow-hidden">
          {/* Viewer */}
          <div className="flex-1 relative bg-[#111827]">
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 bg-opacity-75 z-10">
                <div className="text-center">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-white mx-auto mb-4"></div>
                  <p className="text-white">Loading 3D viewer...</p>
                </div>
              </div>
            )}
            {error && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-900 z-10">
                <div className="text-center text-white p-4">
                  <svg className="w-12 h-12 mx-auto mb-4 text-red-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                  </svg>
                  <p className="text-lg font-medium mb-2">Error</p>
                  <p className="text-gray-300">{error}</p>
                </div>
              </div>
            )}
            <div ref={containerRef} className="absolute inset-0" />
            {/* Hidden div that JSmol routes all console output into */}
            <div id={consoleDivIdRef.current} style={{ display: 'none' }} />

          </div>

          {/* Control Panel */}
          {showControls && (
            <div className="w-64 bg-gray-50 border-l overflow-y-auto shrink-0">
              <div className="p-4 space-y-5">
                {/* Display Style */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Display Style</label>
                  <select
                    value={displayStyle}
                    onChange={(e) => handleDisplayStyleChange(e.target.value as DisplayStyle)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="cartoon">Cartoon</option>
                    <option value="ribbon">Ribbon</option>
                    <option value="trace">Trace</option>
                    <option value="wireframe">Wireframe</option>
                    <option value="spacefill">Spacefill</option>
                    <option value="ball+stick">Ball & Stick</option>
                  </select>
                </div>

                {/* Color Scheme */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Color Scheme</label>
                  <select
                    value={colorScheme}
                    onChange={(e) => handleColorSchemeChange(e.target.value as ColorScheme)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="structure">Secondary Structure</option>
                    <option value="chain">Chain</option>
                    <option value="amino">Amino Acid</option>
                    <option value="temperature">Temperature</option>
                    <option value="group">Group</option>
                  </select>
                </div>

                {/* View Controls */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">View Controls</label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => handleZoom('in')}
                      className="px-3 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Zoom In
                    </button>
                    <button
                      onClick={() => handleZoom('out')}
                      className="px-3 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Zoom Out
                    </button>
                  </div>
                  {/* Reset to Student View - only show if we have original state */}
                  {hasOriginalState && (
                    <button
                      onClick={() => setShowResetConfirm(true)}
                      className="w-full mt-2 px-3 py-2 bg-amber-500 text-white rounded text-sm font-medium hover:bg-amber-600 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      {fileUrl ? 'Reset to Student View' : `Reset to PDB`}
                    </button>
                  )}
                </div>

                {/* Export PNGJ */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Export View</label>
                  <button
                    onClick={handleExportPngj}
                    className="w-full px-3 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-700 flex items-center justify-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                    </svg>
                    Download PNGJ
                  </button>
                  <p className="text-xs text-gray-500 mt-1">
                    Download current view as a PNGJ file to re-upload.
                  </p>
                </div>

                {/* Submit to Server */}
                {templateId && onSubmit && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Submit Model</label>
                    <button
                      onClick={handleSubmitPngj}
                      disabled={isSubmitting}
                      className="w-full px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 disabled:bg-gray-400 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                      </svg>
                      {isSubmitting ? 'Submitting...' : 'Submit'}
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      Submit current view directly to replace your model.
                    </p>
                  </div>
                )}

                {/* Load from PDB */}
                {proteinPdbId && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">Load Structure</label>
                    <button
                      onClick={handleLoadFromPDB}
                      className="w-full px-3 py-2 bg-blue-600 text-white rounded text-sm font-medium hover:bg-blue-700"
                    >
                      Load {proteinPdbId} from PDB
                    </button>
                    <p className="text-xs text-gray-500 mt-1">
                      Fetch the original structure from RCSB PDB.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Script Console Footer */}
        {!consolePopout && (
          <div className="border-t bg-gray-900 shrink-0">
            {consoleLog.length > 0 && (
              <div
                ref={consoleRef}
                className="px-4 py-2 font-mono text-sm bg-gray-800 border-b border-gray-700 max-h-32 overflow-y-auto"
              >
                {consoleLog.map((entry, index) => (
                  <div key={index} className={`${
                    entry.type === 'command'
                      ? 'text-white'
                      : entry.type === 'error'
                        ? 'text-red-400'
                        : 'text-green-400'
                  }`}>
                    {entry.type === 'command' ? `> ${entry.text}` : `  ${entry.text}`}
                  </div>
                ))}
              </div>
            )}
            <form onSubmit={handleCommandSubmit} className="flex items-center gap-3 px-4 py-3">
              <span className="text-green-400 font-mono text-base">{">"}</span>
              <input
                type="text"
                value={command}
                onChange={(e) => setCommand(e.target.value)}
                onKeyDown={handleCommandKeyDown}
                placeholder="Enter Jmol command (e.g., select helix; color red)"
                className="flex-1 bg-transparent text-white font-mono text-base focus:outline-none placeholder-gray-500"
              />
              <div className="flex items-center gap-3">
                <span className="text-xs text-gray-500">↑↓ history</span>
                {consoleLog.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setConsoleLog([])}
                    className="text-xs text-gray-500 hover:text-gray-300"
                  >
                    clear
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setConsolePos({ x: window.innerWidth - 630, y: 20 })
                    setConsolePopout(true)
                  }}
                  className="text-gray-500 hover:text-gray-300"
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

      </div>

    </div>

    {/* Chat panel - rendered via portal to escape JSmol's z-index stacking */}
    {isOpen && groupId && templateId && chatOpen && createPortal(
      <div className="fixed bottom-6 right-6 w-96 bg-gray-900/95 rounded-lg border border-gray-700 shadow-2xl flex flex-col overflow-hidden" style={{ zIndex: 9999, height: '480px' }}>
        {/* Chat header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 shrink-0">
          <span className="text-white text-sm font-medium">Model Chat</span>
          <button onClick={() => setChatOpen(false)} className="text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Messages */}
        <div className="flex-1 relative min-h-0">
          <div
            ref={messagesContainerRef}
            className="absolute inset-0 overflow-y-auto p-3 space-y-2"
            onScroll={() => {
              const el = messagesContainerRef.current
              if (!el) return
              const near = el.scrollHeight - el.scrollTop - el.clientHeight < 80
              isNearBottomRef.current = near
              if (near) setNewMsgCount(0)
            }}
          >
            {chatMessages.length === 0 && (
              <p className="text-gray-500 text-sm text-center mt-6">No messages yet. Say something!</p>
            )}
            {groupedChatMessages.map((group, gi) => {
              const label = group.firstTime.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })
              return (
                <div key={gi} className={`flex flex-col gap-1 ${gi > 0 ? 'mt-3' : ''} ${group.isOwn ? 'items-end' : 'items-start'}`}>
                  <span className="text-gray-400 text-xs px-1">
                    {group.senderName} &middot; {label}
                  </span>
                  {group.messages.map(msg => (
                    <div key={msg.id} className={`max-w-[85%] px-3 py-2 rounded-lg text-sm wrap-break-word ${
                      group.isOwn ? 'bg-blue-600 text-white' : 'bg-gray-700 text-gray-100'
                    }`}>
                      {msg.content}
                    </div>
                  ))}
                </div>
              )
            })}
            <div ref={chatBottomRef} />
          </div>
          {newMsgCount > 0 && (
            <button
              onClick={() => {
                isNearBottomRef.current = true
                setNewMsgCount(0)
                chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
              }}
              className="absolute bottom-2 left-1/2 -translate-x-1/2 flex items-center gap-1.5 px-3 py-1.5 bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium rounded-full shadow-lg transition-colors whitespace-nowrap"
            >
              <svg className="w-3 h-3 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" />
              </svg>
              {newMsgCount} new {newMsgCount === 1 ? 'message' : 'messages'}
            </button>
          )}
        </div>

        {/* Input */}
        <form onSubmit={handleChatPost} className="flex gap-2 p-2.5 border-t border-gray-700 shrink-0 items-end">
          <textarea
            ref={chatInputRef}
            value={chatInput}
            onChange={e => {
              setChatInput(e.target.value)
              e.target.style.height = 'auto'
              e.target.style.height = Math.min(e.target.scrollHeight, 120) + 'px'
            }}
            onKeyDown={e => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                handleChatPost(e as unknown as React.FormEvent)
              }
            }}
            placeholder="Message… (Shift+Enter for new line)"
            rows={1}
            className="flex-1 bg-gray-800 text-white text-sm rounded px-2.5 py-2 placeholder-gray-500 focus:outline-none focus:ring-inset focus:ring-1 focus:ring-blue-500 resize-none overflow-y-auto"
            style={{ minHeight: '36px', maxHeight: '120px' }}
          />
          <button
            type="submit"
            disabled={!chatInput.trim() || chatPosting}
            className="bg-blue-600 text-white px-3 py-2 rounded text-sm font-medium hover:bg-blue-700 disabled:opacity-40 transition-colors shrink-0"
          >
            Send
          </button>
        </form>
      </div>,
      document.body
    )}

    {/* Reset Confirmation Modal - portal to escape JSmol's z-index stacking */}
    {showResetConfirm && createPortal(
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-10000">
        <div className="bg-white rounded-lg shadow-2xl p-6 w-80">
          <div className="flex items-start gap-3 mb-4">
            <svg className="w-6 h-6 text-red-500 shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div>
              <h4 className="font-semibold text-gray-800 mb-1">Reset viewer?</h4>
              <p className="text-sm text-gray-600">This will undo any changes you haven't submitted yet. This action cannot be undone.</p>
            </div>
          </div>
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => setShowResetConfirm(false)}
              className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-md hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              onClick={() => { handleResetToStudentView(); setShowResetConfirm(false) }}
              className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-md hover:bg-red-700"
            >
              Reset
            </button>
          </div>
        </div>
      </div>,
      document.body
    )}

    {/* Submit Progress Modal - rendered via portal to escape JSmol's z-index stacking */}
    {isSubmitting && createPortal(
      <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-10000">
        <div className="bg-white rounded-lg shadow-2xl p-6 w-80">
          <div className="flex items-center gap-3 mb-4">
            <div className="relative">
              <svg className="w-8 h-8 text-green-500 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
            </div>
            <div>
              <h4 className="font-semibold text-gray-800">Submitting Model</h4>
              <p className="text-sm text-gray-500">{submitProgress.status}</p>
            </div>
          </div>

          {/* Progress bar */}
          <div className="relative h-3 bg-gray-200 rounded-full overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 bg-green-500 rounded-full transition-all duration-150 ease-out"
              style={{ width: `${submitProgress.percent}%` }}
            >
              {/* Animated pulse overlay for visual interest */}
              <div className="absolute inset-0 bg-green-400 animate-pulse opacity-50 rounded-full" />
            </div>
          </div>

          <div className="mt-2 flex justify-between text-xs text-gray-500">
            <span>{submitProgress.percent}%</span>
            <span>{submitProgress.percent < 100 ? 'Please wait...' : 'Done!'}</span>
          </div>
        </div>
      </div>,
      document.body
    )}
    {/* Help panel - rendered via portal to escape JSmol's z-index stacking */}
    {isOpen && helpOpen && createPortal(
      <div className="fixed bottom-6 left-6 w-105 bg-gray-900/95 rounded-lg border border-gray-700 shadow-2xl flex flex-col overflow-hidden" style={{ zIndex: 9999, maxHeight: '560px' }}>
        {/* Header */}
        <div className="flex items-center justify-between px-3 py-2.5 bg-gray-800 shrink-0">
          <span className="text-white text-sm font-medium">JSmol Help</span>
          <button onClick={() => setHelpOpen(false)} className="text-gray-400 hover:text-white">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Scrollable content */}
        <div className="overflow-y-auto p-4 space-y-5 text-sm text-gray-200">

          {/* Mouse controls */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Mouse Controls</h3>
            <table className="w-full text-xs border-separate" style={{ borderSpacing: '0 4px' }}>
              <tbody>
                {[
                  ['Left-drag', 'Rotate'],
                  ['Right-drag / Shift+drag', 'Translate (pan)'],
                  ['Scroll wheel / pinch', 'Zoom'],
                  ['Double-click', 'Centre on atom'],
                  ['Ctrl+drag', 'Rotate Z-axis'],
                ].map(([action, desc]) => (
                  <tr key={action}>
                    <td className="pr-3 font-mono text-gray-300 whitespace-nowrap">{action}</td>
                    <td className="text-gray-400">{desc}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Script console */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Script Console</h3>
            <p className="text-gray-400 text-xs mb-2">Type Jmol commands in the bar at the bottom of the viewer. Use ↑ / ↓ to recall previous commands.</p>
            <div className="space-y-1.5">
              {[
                ['select <type>', 'Select atoms by type — use a keyword from the list below, e.g. select helix'],
                ['label %n', 'Label atoms with residue number'],
                ['label off', 'Remove all labels'],
                ['zoom 200', 'Zoom to 200 %'],
                ['reset', 'Reset view to default'],
                ['background white', 'Set background colour'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-3 mb-2">Selection keywords:</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
              {[
                ['protein',     'All protein atoms'],
                ['backbone',    'Cα to Cα'],
                ['sidechain',   'Side-chain atoms'],
                ['alpha',       'Cα atoms only'],
                ['helix',       'α-helices'],
                ['sheet',       'β-strands'],
                ['hydrophobic', 'NP residues'],
                ['hydrophilic', 'Polar residues'],
                ['charged',     'Charged residues'],
                ['nucleic',     'Nucleic acid'],
                ['water',       'Solvent / water'],
                ['hetero',      'Non-protein, non-water (ligands)'],
              ].map(([kw, desc]) => (
                <div key={kw} className="flex items-start gap-1.5 min-w-0">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{kw}</span>
                  <span className="text-gray-500 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Display Style Commands */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Display Style Commands</h3>
            <p className="text-gray-400 text-xs mb-2">These commands switch the rendering style for the current selection (or all atoms if nothing is selected). Append <span className="font-mono text-yellow-400">only</span> to hide everything else.</p>
            <div className="space-y-1.5">
              {[
                ['cartoon only', 'Helices as ribbons, strands as arrows'],
                ['ribbon only', 'Smooth ribbon through Cα atoms'],
                ['trace only', 'Simple Cα backbone trace'],
                ['backbone only', 'Backbone tube (hides all other atoms)'],
                ['wireframe only', 'All bonds as lines — full atomic detail'],
                ['spacefill only', 'Atoms as van der Waals spheres'],
                ['wireframe 0.15; spacefill 23%', 'Ball & stick style'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mt-3 mb-2">Most styles accept a size argument instead of <span className="font-mono text-yellow-400">only</span>:</p>
            <div className="space-y-1.5">
              {[
                ['backbone 1.5', 'Backbone tube thickness (try 0.3–2.0)'],
                ['wireframe 0.3', 'Bond cylinders — 0.0 = lines, higher = thicker'],
                ['trace 0.5', 'Trace tube radius'],
                ['spacefill 75%', 'Spacefill at 75 % of van der Waals radius'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Backbone */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Backbone</h3>
            <p className="text-gray-400 text-xs mb-2">Most models here show only the backbone — the chain of Cα atoms connecting residues, without side chains.</p>
            <div className="space-y-1.5">
              {[
                ['backbone only', 'Show backbone as a tube (hides all other atoms)'],
                ['backbone 1.5', 'Backbone tube — number controls thickness (try 0.3–2.0; 1.5 is a good default)'],
                ['select backbone', 'Select all backbone atoms'],
                ['select sidechain', 'Select all side-chain atoms'],
                ['select alpha', 'Select only Cα atoms'],
                ['color backbone red', 'Colour backbone a specific colour'],
                ['select 45 and (sidechain or alpha)', 'Select residue 45 including side chain and Cα, but not backbone atoms'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Struts */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Struts</h3>
            <p className="text-gray-400 text-xs mb-2">Struts are cylindrical connectors drawn between nearby backbone atoms to visualise the 3-D scaffold of the protein.</p>
            <div className="space-y-1.5">
              {[
                ['struts on',        'Show struts (uses last calculated set)'],
                ['struts off',       'Hide struts'],
                ['struts 0.3',       'Show struts at given width (try 0.1–0.5)'],
                ['calculate struts', 'Recalculate struts for the current model'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Boolean selection logic */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Selection Logic</h3>
            <p className="text-gray-400 text-xs mb-2">Combine selectors with <span className="font-mono text-yellow-400">and</span>, <span className="font-mono text-yellow-400">or</span>, <span className="font-mono text-yellow-400">not</span> to target exactly the atoms you want.</p>
            <div className="space-y-1.5">
              {[
                ['select helix and chain A',        'Helices in chain A only'],
                ['select not backbone',              'Everything except the backbone'],
                ['select protein and not backbone',  'Side chains only'],
                ['select backbone or ligand',        'Backbone plus any ligands'],
                ['select resno < 50',                'First 50 residues'],
                ['select resno > 100 and resno < 200', 'Residues 101–199'],
                ['select chain A and backbone',      'Chain A backbone atoms'],
                ['select not (helix or sheet)',       'Loop / coil regions only'],
                ['select protein and not helix and not sheet', 'Loops with backbone context'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-500 text-xs mt-2">After selecting, apply any <span className="font-mono text-green-400">color</span> or display command to affect only the selection.</p>
          </section>

          {/* Display styles */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Display Styles</h3>
            <div className="space-y-1 text-xs text-gray-400">
              {[
                ['Cartoon', 'Helices as ribbons, strands as arrows. Best for overall fold.'],
                ['Ribbon', 'Smooth ribbon through Cα atoms. Good for topology.'],
                ['Trace', 'Simple Cα backbone trace.'],
                ['Wireframe', 'All bonds as lines. Shows full atomic detail.'],
                ['Spacefill', 'Atoms as van der Waals spheres. Shows shape/surface.'],
                ['Ball & Stick', 'Spheres for atoms, cylinders for bonds.'],
              ].map(([style, desc]) => (
                <div key={style} className="flex gap-2">
                  <span className="text-gray-300 font-medium shrink-0 w-20">{style}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Colour schemes */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Colour Schemes</h3>
            <div className="space-y-1 text-xs text-gray-400">
              {[
                ['Secondary Structure', 'Helices red, sheets yellow, loops white.'],
                ['Chain', 'Each chain gets a distinct colour.'],
                ['Amino Acid', 'Colour by residue type (Rasmol convention).'],
                ['Temperature', 'Blue (low B-factor) → red (high B-factor).'],
                ['Group', 'Rainbow from N-terminus (blue) to C-terminus (red).'],
              ].map(([scheme, desc]) => (
                <div key={scheme} className="flex gap-2">
                  <span className="text-gray-300 font-medium shrink-0 w-36">{scheme}</span>
                  <span>{desc}</span>
                </div>
              ))}
            </div>
          </section>

          {/* Available colors */}
          <section>
            <h3 className="text-purple-400 font-semibold uppercase text-xs tracking-wider mb-2">Colors</h3>
            <div className="space-y-1.5 mb-3">
              {[
                ['color red', 'Colour selection red (or any named colour below)'],
                ['color cpk', 'CPK / element colouring'],
                ['color temperature', 'B-factor (temperature) colouring'],
                ['color structure', 'Secondary structure colouring'],
                ['color chain', 'Colour by chain'],
                ['color group', 'Rainbow N→C terminus'],
              ].map(([cmd, desc]) => (
                <div key={cmd} className="flex items-start gap-2">
                  <span className="font-mono text-xs text-green-400 shrink-0 bg-gray-800 px-1.5 py-0.5 rounded">{cmd}</span>
                  <span className="text-gray-400 text-xs leading-5">{desc}</span>
                </div>
              ))}
            </div>
            <p className="text-gray-400 text-xs mb-2">Named colours — use with <span className="font-mono text-green-400 bg-gray-800 px-1 rounded">color &lt;name&gt;</span>, e.g. <span className="font-mono text-green-400 bg-gray-800 px-1 rounded">color salmon</span></p>
            <div className="flex flex-wrap gap-1.5">
              {[
                ['red',       '#ef4444'],
                ['orange',    '#f97316'],
                ['yellow',    '#eab308'],
                ['green',     '#22c55e'],
                ['cyan',      '#06b6d4'],
                ['blue',      '#3b82f6'],
                ['violet',    '#8b5cf6'],
                ['magenta',   '#d946ef'],
                ['pink',      '#ec4899'],
                ['white',     '#f1f5f9'],
                ['lightgrey', '#94a3b8'],
                ['grey',      '#6b7280'],
                ['darkgrey',  '#374151'],
                ['black',     '#1e293b'],
                ['salmon',    '#fa8072'],
                ['coral',     '#ff7f50'],
                ['gold',      '#ffd700'],
                ['wheat',     '#f5deb3'],
                ['tan',       '#d2b48c'],
                ['brown',     '#92400e'],
                ['olive',     '#84cc16'],
                ['teal',      '#14b8a6'],
                ['navy',      '#1e3a8a'],
                ['purple',    '#9333ea'],
              ].map(([name, hex]) => (
                <div
                  key={name}
                  className="flex items-center gap-1 text-xs text-gray-300 font-mono bg-gray-800 px-1.5 py-0.5 rounded cursor-default"
                  title={hex}
                >
                  <span className="w-2.5 h-2.5 rounded-sm shrink-0 border border-gray-600" style={{ backgroundColor: hex }} />
                  {name}
                </div>
              ))}
            </div>
          </section>

        </div>
      </div>,
      document.body
    )}

    {/* Console popout - draggable, resizable floating window */}
    {isOpen && consolePopout && createPortal(
      <div
        style={{
          position: 'fixed',
          left: consolePos.x,
          top: consolePos.y,
          zIndex: 9999,
          width: 620,
          height: 420,
          resize: 'both',
          overflow: 'hidden',
          minWidth: 320,
          minHeight: 200,
        }}
        className="bg-gray-900 rounded-lg border border-gray-700 shadow-2xl flex flex-col"
      >
        {/* Draggable header */}
        <div
          className="flex items-center justify-between px-3 py-2 bg-gray-800 rounded-t-lg cursor-move select-none shrink-0"
          onMouseDown={(e) => {
            consoleDragRef.current = {
              active: true,
              startX: e.clientX,
              startY: e.clientY,
              startPosX: consolePos.x,
              startPosY: consolePos.y,
            }
          }}
        >
          <span className="text-white text-sm font-mono font-medium">Console</span>
          <div className="flex items-center gap-3">
            {consoleLog.length > 0 && (
              <button
                type="button"
                onClick={() => setConsoleLog([])}
                className="text-xs text-gray-400 hover:text-gray-200"
              >
                clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setConsolePopout(false)}
              className="text-gray-400 hover:text-white"
              title="Dock console"
            >
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5M15 9l5-5m0 0v5m0-5h-5M9 15l-5 5m0 0v-5m0 5h5M15 15l5 5m0 0v-5m0 5h-5" />
              </svg>
            </button>
          </div>
        </div>

        {/* Log area */}
        <div
          ref={consolePopoutRef}
          className="flex-1 overflow-y-auto px-4 py-2 font-mono text-sm min-h-0"
        >
          {consoleLog.length === 0 && (
            <p className="text-gray-600 text-xs mt-2">No output yet. Run a command below.</p>
          )}
          {consoleLog.map((entry, index) => (
            <div key={index} className={`${
              entry.type === 'command'
                ? 'text-white'
                : entry.type === 'error'
                  ? 'text-red-400'
                  : 'text-green-400'
            }`}>
              {entry.type === 'command' ? `> ${entry.text}` : `  ${entry.text}`}
            </div>
          ))}
        </div>

        {/* Input */}
        <form onSubmit={handleCommandSubmit} className="flex items-center gap-3 px-4 py-3 border-t border-gray-700 shrink-0">
          <span className="text-green-400 font-mono text-base">{">"}</span>
          <input
            type="text"
            value={command}
            onChange={(e) => setCommand(e.target.value)}
            onKeyDown={handleCommandKeyDown}
            placeholder="Enter Jmol command…"
            className="flex-1 bg-transparent text-white font-mono text-base focus:outline-none placeholder-gray-500"
          />
          <span className="text-xs text-gray-500">↑↓ history</span>
        </form>
      </div>,
      document.body
    )}

    </>
  )
}
