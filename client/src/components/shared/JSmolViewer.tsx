import { useEffect, useRef, useState } from 'react'

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
}

type DisplayStyle = 'cartoon' | 'ribbon' | 'trace' | 'wireframe' | 'spacefill' | 'ball+stick';
type ColorScheme = 'structure' | 'chain' | 'cpk' | 'amino' | 'temperature' | 'group';

export default function JSmolViewer({ isOpen, onClose, fileUrl, modelName, proteinPdbId, templateId, onSubmit }: JSmolViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const consoleRef = useRef<HTMLDivElement>(null)
  const appletRef = useRef<JmolApplet | null>(null)
  const originalStateRef = useRef<{ stateCommands: string | null }>({ stateCommands: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isSpinning, setIsSpinning] = useState(false)
  const [displayStyle, setDisplayStyle] = useState<DisplayStyle>('cartoon')
  const [colorScheme, setColorScheme] = useState<ColorScheme>('structure')
  const [showControls, setShowControls] = useState(true)
  const [hasOriginalState, setHasOriginalState] = useState(false)

  // Command console state
  const [command, setCommand] = useState('')
  const [commandHistory, setCommandHistory] = useState<string[]>([])
  const [historyIndex, setHistoryIndex] = useState(-1)
  const [consoleLog, setConsoleLog] = useState<Array<{ type: 'command' | 'output' | 'error', text: string }>>([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [submitProgress, setSubmitProgress] = useState({ percent: 0, status: '' })

  useEffect(() => {
    if (!isOpen || !containerRef.current) return

    // Clear console log when viewer opens
    setConsoleLog([])

    const initJSmol = async () => {
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
          disableJ2SLoadMonitor: true,
          disableInitialConsole: true,
          allowJavaScript: true,
          readyFunction: () => {
            setLoading(false)
          }
        }

        window.Jmol.setDocument(false)

        const appletName = 'jsmolViewer_' + Date.now()
        appletRef.current = window.Jmol.getApplet(appletName, Info)

        if (containerRef.current && appletRef.current) {
          containerRef.current.innerHTML = window.Jmol.getAppletHtml(appletRef.current)

          setTimeout(() => {
            if (appletRef.current && window.Jmol) {
              // Set up base rendering settings
              const baseSettings = `
                set antialiasDisplay ON;
                set antialiastranslucent ON;
                set platformSpeed 3;
              `

              // Load the PNGJ file - URL now has .png extension for JSmol file type detection
              console.log('Loading PNGJ file with JSmol:', fileUrl)
              window.Jmol.script(appletRef.current!, `
                ${baseSettings}
                load "${fileUrl}";
              `)

              // Store that we loaded from a file (for reset functionality)
              setHasOriginalState(true)
              originalStateRef.current = { stateCommands: `load "${fileUrl}";` }
            }
          }, 500)
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
    if (!isOpen && appletRef.current) {
      appletRef.current = null
    }
  }, [isOpen])

  // Auto-scroll console to bottom when new entries are added
  useEffect(() => {
    if (consoleRef.current) {
      consoleRef.current.scrollTop = consoleRef.current.scrollHeight
    }
  }, [consoleLog])

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
      setIsSpinning(false)
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
      'cpk': 'color cpk',
      'amino': 'color amino',
      'temperature': 'color temperature',
      'group': 'color group'
    }
    runScript(colorCommands[scheme])
  }

  const toggleSpin = () => {
    if (isSpinning) {
      runScript('spin off')
    } else {
      runScript('spin on')
    }
    setIsSpinning(!isSpinning)
  }

  const handleReset = () => {
    runScript('reset; zoom 100')
    setIsSpinning(false)
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
      // Run the command
      window.Jmol.script(appletRef.current, cmd)

      // Try to get meaningful output after command executes
      setTimeout(() => {
        if (appletRef.current && window.Jmol) {
          // Try multiple approaches to get output
          let output = ''
          let isError = false

          // Check for script error message first
          try {
            const errorMsg = window.Jmol.evaluateVar(appletRef.current, '_errorMessage')
            if (errorMsg && typeof errorMsg === 'string' && errorMsg.length > 0) {
              output = errorMsg
              isError = true
            }
          } catch {
            // Ignore errors
          }

          // Check for selection count (most common feedback)
          if (!output) {
            try {
              const selectedCount = window.Jmol.evaluateVar(appletRef.current, '{selected}.count')
              if (typeof selectedCount === 'number') {
                output = `${selectedCount} atom${selectedCount !== 1 ? 's' : ''} selected`
              }
            } catch {
              // Ignore errors
            }
          }

          // Check echo buffer
          if (!output) {
            try {
              const echo = window.Jmol.evaluateVar(appletRef.current, 'echo')
              if (echo && typeof echo === 'string' && echo.length > 0) {
                output = echo
              }
            } catch {
              // Ignore errors
            }
          }

          // Add output to console log if we got something
          if (output) {
            setConsoleLog(prev => [...prev, { type: isError ? 'error' : 'output', text: output }])
          }
        }
      }, 200)
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

    // Use JSmol's native write command to create and download PNGJ
    console.log('Exporting PNGJ:', filename)
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
        console.log('Anchor click intercepted:', {
          hrefStart: this.href?.substring(0, 50),
          download: this.download,
          tagName: this.tagName
        })

        // Check for data URL (base64 encoded) - this is what JSmol uses
        if (this.download && this.href && this.href.startsWith('data:image/png;base64,') && !captured) {
          console.log('Found PNGJ data URL, length:', this.href.length)

          // Convert data URL to Blob
          fetch(this.href)
            .then(response => {
              console.log('Fetch response status:', response.status)
              return response.blob()
            })
            .then(fetchedBlob => {
              console.log('Successfully converted data URL to blob:', fetchedBlob.size, 'bytes, type:', fetchedBlob.type)
              captured = true
              clearTimeout(timeoutId)
              HTMLAnchorElement.prototype.click = originalClick
              resolveBlob(fetchedBlob)
            })
            .catch(err => {
              console.error('Failed to convert data URL to blob:', err)
              HTMLAnchorElement.prototype.click = originalClick
              rejectBlob(err)
            })

          // DON'T call originalClick - prevent the download since we captured the data
          // This should also prevent the JSmol error
          return
        }

        // Also check for blob URLs as fallback
        if (this.download && this.href && this.href.startsWith('blob:') && !captured) {
          console.log('Found PNGJ blob URL:', this.href)

          fetch(this.href)
            .then(response => response.blob())
            .then(fetchedBlob => {
              console.log('Successfully fetched blob:', fetchedBlob.size, 'bytes')
              captured = true
              clearTimeout(timeoutId)
              HTMLAnchorElement.prototype.click = originalClick
              resolveBlob(fetchedBlob)
            })
            .catch(err => {
              console.error('Failed to fetch blob:', err)
              HTMLAnchorElement.prototype.click = originalClick
              rejectBlob(err)
            })

          return
        }

        originalClick.call(this)
      }

      // Trigger JSmol to write the PNGJ
      const filename = `export_${Date.now()}.png`
      console.log('About to call JSmol write command...')

      // Intercept window.prompt to auto-respond to JSmol's filename dialog
      const originalPrompt = window.prompt
      window.prompt = (message?: string) => {
        console.log('Intercepted prompt:', message)
        // Return the filename to auto-confirm the dialog
        return filename
      }

      try {
        window.Jmol.script(appletRef.current!, `write "${filename}" as pngj`)
        console.log('JSmol write command executed')
      } catch (scriptErr) {
        console.error('JSmol script error:', scriptErr)
        HTMLAnchorElement.prototype.click = originalClick
        window.prompt = originalPrompt
        throw scriptErr
      } finally {
        // Restore original prompt after a short delay to ensure JSmol has finished
        setTimeout(() => {
          window.prompt = originalPrompt
        }, 100)
      }

      // Wait for the blob to be captured
      console.log('Waiting for blob capture...')
      await animateProgress(15, 35, 400 + Math.random() * 300)

      const blob = await blobPromise
      console.log('Got PNGJ blob:', blob.size, 'bytes')

      setSubmitProgress(prev => ({ ...prev, status: 'Processing image data...' }))
      await animateProgress(35, 55, 300 + Math.random() * 200)

      // Create File from Blob
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const safeName = modelName.replace(/[^a-zA-Z0-9]/g, '_')
      const filename2 = `${safeName}_${timestamp}.png`
      const file = new File([blob], filename2, { type: 'image/png' })

      console.log('Created file:', filename2, 'size:', file.size)

      setSubmitProgress(prev => ({ ...prev, status: 'Uploading to server...' }))
      await animateProgress(55, 85, 500 + Math.random() * 400)

      // Call the onSubmit callback
      await onSubmit(templateId, file)

      setSubmitProgress(prev => ({ ...prev, status: 'Finalizing...' }))
      await animateProgress(85, 100, 200 + Math.random() * 100)

      setSubmitProgress({ percent: 100, status: 'Complete!' })
      await new Promise(resolve => setTimeout(resolve, 300))
    } catch (err) {
      console.error('Error submitting PNGJ:', err)
      alert(err instanceof Error ? err.message : 'Failed to submit model')
    } finally {
      setIsSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-gray-900/50 backdrop-blur-sm flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 overflow-hidden max-h-[95vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gray-50 shrink-0">
          <div>
            <h3 className="text-lg font-semibold text-gray-800">{modelName}</h3>
            <p className="text-sm text-gray-500">3D Molecular Viewer {proteinPdbId && `• ${proteinPdbId}`}</p>
          </div>
          <div className="flex items-center gap-2">
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
                    <option value="cpk">Element (CPK)</option>
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
                      onClick={toggleSpin}
                      className={`px-3 py-2 rounded text-sm font-medium transition-colors ${
                        isSpinning
                          ? 'bg-blue-600 text-white'
                          : 'bg-white border border-gray-300 text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {isSpinning ? 'Stop Spin' : 'Spin'}
                    </button>
                    <button
                      onClick={handleReset}
                      className="px-3 py-2 bg-white border border-gray-300 rounded text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Reset
                    </button>
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
                      onClick={handleResetToStudentView}
                      className="w-full mt-2 px-3 py-2 bg-amber-500 text-white rounded text-sm font-medium hover:bg-amber-600 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                      </svg>
                      Reset to Student View
                    </button>
                  )}
                </div>

                {/* Quick Selections */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Highlight</label>
                  <div className="flex flex-wrap gap-1">
                    <button
                      onClick={() => runScript('select helix; color red')}
                      className="px-2 py-1 bg-red-100 text-red-700 rounded text-xs hover:bg-red-200"
                    >
                      Helix
                    </button>
                    <button
                      onClick={() => runScript('select sheet; color yellow')}
                      className="px-2 py-1 bg-yellow-100 text-yellow-700 rounded text-xs hover:bg-yellow-200"
                    >
                      Sheet
                    </button>
                    <button
                      onClick={() => runScript('select ligand; color green; spacefill')}
                      className="px-2 py-1 bg-green-100 text-green-700 rounded text-xs hover:bg-green-200"
                    >
                      Ligand
                    </button>
                    <button
                      onClick={() => runScript('select all; color structure')}
                      className="px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs hover:bg-gray-200"
                    >
                      Clear
                    </button>
                  </div>
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
            </div>
          </form>
        </div>

        {/* Submit Progress Modal */}
        {isSubmitting && (
          <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-[100]">
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
          </div>
        )}
      </div>
    </div>
  )
}
