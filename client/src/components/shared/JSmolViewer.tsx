import { useEffect, useRef, useState } from 'react'
import JSZip from 'jszip'

// Declare Jmol as a global variable (loaded from local files)
declare global {
  interface Window {
    Jmol: {
      getApplet: (name: string, info: JmolInfo) => JmolApplet;
      script: (applet: JmolApplet, script: string) => void;
      getAppletHtml: (applet: JmolApplet) => string;
      setDocument: (doc: boolean) => void;
      evaluateVar: (applet: JmolApplet, variable: string) => unknown;
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
  submissionId?: string;
  onSubmissionReplaced?: () => void;
}

type DisplayStyle = 'cartoon' | 'ribbon' | 'trace' | 'wireframe' | 'spacefill' | 'ball+stick';
type ColorScheme = 'structure' | 'chain' | 'cpk' | 'amino' | 'temperature' | 'group';

export default function JSmolViewer({ isOpen, onClose, fileUrl, modelName, proteinPdbId, submissionId, onSubmissionReplaced }: JSmolViewerProps) {
  const containerRef = useRef<HTMLDivElement>(null)
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
  const [commandOutput, setCommandOutput] = useState<string>('')
  const [isReplacing, setIsReplacing] = useState(false)

  // Result from PNGJ extraction - now returns both PDB data and styling commands
  interface PngjResult {
    pdbData: string | null;           // The molecular structure data
    stateCommands: string | null;     // Styling commands (colors, display, etc.) - load command stripped
    pdbId: string | null;             // PDB ID if referenced in state script
  }

  // Extract molecular data AND styling from PNGJ file
  const extractPngjData = async (url: string): Promise<PngjResult | null> => {
    try {
      const response = await fetch(url)
      const arrayBuffer = await response.arrayBuffer()
      const bytes = new Uint8Array(arrayBuffer)

      // Find the ZIP signature (PK\x03\x04) after PNG data
      let zipStart = -1
      for (let i = 0; i < bytes.length - 4; i++) {
        if (bytes[i] === 0x50 && bytes[i + 1] === 0x4B &&
            bytes[i + 2] === 0x03 && bytes[i + 3] === 0x04) {
          zipStart = i
          break
        }
      }

      if (zipStart === -1) {
        console.log('No ZIP data found in file - not a PNGJ file')
        return null
      }

      console.log('Found ZIP data at offset:', zipStart)

      const zipData = bytes.slice(zipStart)
      const zip = await JSZip.loadAsync(zipData)

      // List all files for debugging
      const fileList = Object.keys(zip.files)
      console.log('Files in PNGJ ZIP:', fileList)

      let pdbData: string | null = null
      let stateScript: string | null = null
      let pdbId: string | null = null
      const zipFileContents: Map<string, string> = new Map()

      // First pass: read all files
      for (const [filename, file] of Object.entries(zip.files)) {
        if (file.dir) continue
        const content = await (file as JSZip.JSZipObject).async('string')
        zipFileContents.set(filename, content)

        // Look for state script
        if (filename.includes('state.spt') || filename.endsWith('.spt')) {
          stateScript = content
          console.log('Found state script:', filename, 'length:', content.length)
        }
      }

      // Second pass: find molecular data
      for (const [filename, content] of zipFileContents) {
        // Skip state scripts and manifest files
        if (filename.endsWith('.spt') || filename.includes('Manifest') || filename.includes('version')) {
          continue
        }

        // Check for molecular structure files by extension
        const lowerName = filename.toLowerCase()
        if (lowerName.endsWith('.pdb') || lowerName.endsWith('.cif') || lowerName.endsWith('.mmcif')) {
          pdbData = content
          console.log('Found molecular data in:', filename)

          // Try to extract PDB ID from filename (e.g., "4X57.pdb" -> "4X57")
          const pdbIdFromFile = filename.match(/([A-Za-z0-9]{4})\.(?:pdb|cif|mmcif)$/i)
          if (pdbIdFromFile) {
            pdbId = pdbIdFromFile[1].toUpperCase()
            console.log('Extracted PDB ID from filename:', pdbId)
          }
          break
        }

        // Check any file for ATOM/HETATM content (handles .txt and other extensions)
        if (!pdbData && (content.includes('ATOM  ') || content.includes('HETATM'))) {
          pdbData = content
          console.log('Found PDB data (by content) in:', filename)

          // Try to extract PDB ID from filename (e.g., "4X57 edit.txt" -> "4X57")
          const pdbIdFromFile = filename.match(/([A-Za-z0-9]{4})[\s._-]/i)
          if (pdbIdFromFile) {
            pdbId = pdbIdFromFile[1].toUpperCase()
            console.log('Extracted PDB ID from filename:', pdbId)
          }
          break
        }

        // Some PNGJ files store model data in numbered files like "0.symmetry" or just "1"
        if (!pdbData && /^\d+$/.test(filename.split('/').pop() || '')) {
          if (content.includes('ATOM') || content.includes('HETATM')) {
            pdbData = content
            console.log('Found PDB data in numbered file:', filename)
            break
          }
        }
      }

      // If we have a state script, try to extract PDB data and styling
      let stateCommands: string | null = null
      if (stateScript) {
        console.log('State script preview (first 500 chars):', stateScript.substring(0, 500))

        // Look for PDB ID in load command - multiple formats:
        // 1. load =1ABC or load :1ABC (direct PDB fetch)
        // 2. load /*file*/"Pdb::$SCRIPT_PATH$4X57 edit.txt" (PNGJ internal reference)
        // 3. load "4X57.pdb" (file reference)
        if (!pdbId) {
          const pdbIdMatch = stateScript.match(/load\s+[=:]([A-Za-z0-9]{4})/i)
          if (pdbIdMatch) {
            pdbId = pdbIdMatch[1].toUpperCase()
            console.log('Found PDB ID in state script (=/:):', pdbId)
          }
        }

        // Look for $SCRIPT_PATH$ references which contain the filename
        if (!pdbId) {
          const scriptPathMatch = stateScript.match(/\$SCRIPT_PATH\$([^"]+)/i)
          if (scriptPathMatch) {
            const refFilename = scriptPathMatch[1]
            console.log('Found $SCRIPT_PATH$ reference:', refFilename)
            // Extract PDB ID from the filename (e.g., "4X57 edit.txt" -> "4X57")
            const pdbIdFromRef = refFilename.match(/([A-Za-z0-9]{4})[\s._-]/i)
            if (pdbIdFromRef) {
              pdbId = pdbIdFromRef[1].toUpperCase()
              console.log('Extracted PDB ID from $SCRIPT_PATH$ ref:', pdbId)
            }
          }
        }

        // Look for file load references like load "filename.pdb"
        if (!pdbId) {
          const fileLoadMatch = stateScript.match(/load\s+(?:\/\*file\*\/\s*)?["']?(?:Pdb::)?([^"'\s;]+\.(?:pdb|cif|txt))/i)
          if (fileLoadMatch) {
            const refFilename = fileLoadMatch[1]
            console.log('Found file load reference:', refFilename)
            const pdbIdFromRef = refFilename.match(/([A-Za-z0-9]{4})[\s._-]/i)
            if (pdbIdFromRef) {
              pdbId = pdbIdFromRef[1].toUpperCase()
              console.log('Extracted PDB ID from file load ref:', pdbId)
            }
          }
        }

        // Look for inline DATA blocks - this is how PNGJ often stores molecular data
        // Format: load DATA "modelname" ... END "modelname"
        const dataBlockMatch = stateScript.match(/load\s+DATA\s+"([^"]+)"\s*([\s\S]*?)\s*END\s+"\1"/i)
        if (dataBlockMatch && !pdbData) {
          const blockContent = dataBlockMatch[2].trim()
          if (blockContent.includes('ATOM') || blockContent.includes('HETATM') || blockContent.includes('HEADER')) {
            pdbData = blockContent
            console.log('Found inline PDB data in state script DATA block, length:', pdbData.length)
          }
        }

        // Also check for the alternate format: data "model" ... end "model" (lowercase)
        if (!pdbData) {
          const dataBlockMatch2 = stateScript.match(/data\s+"([^"]+)"\s*([\s\S]*?)\s*end\s+"\1"/i)
          if (dataBlockMatch2) {
            const blockContent = dataBlockMatch2[2].trim()
            if (blockContent.includes('ATOM') || blockContent.includes('HETATM') || blockContent.includes('HEADER')) {
              pdbData = blockContent
              console.log('Found inline PDB data (alt format), length:', pdbData.length)
            }
          }
        }

        // Extract styling commands by removing load-related lines and DATA blocks
        // Split on newlines first to preserve structure
        const lines = stateScript.split('\n')
        const stylingLines: string[] = []
        let inDataBlock = false

        for (const line of lines) {
          const trimmed = line.trim()

          // Track if we're inside a DATA block
          if (/^(load\s+)?data\s+"/i.test(trimmed)) {
            inDataBlock = true
            continue
          }
          if (/^end\s+"/i.test(trimmed)) {
            inDataBlock = false
            continue
          }
          if (inDataBlock) continue

          // Skip empty lines and initialization commands
          if (!trimmed) continue
          if (trimmed.toLowerCase().startsWith('load ')) continue
          if (trimmed.toLowerCase().startsWith('zap')) continue
          if (trimmed.toLowerCase().startsWith('initialize')) continue
          if (trimmed.toLowerCase().startsWith('set defaultdirectory')) continue
          if (trimmed.toLowerCase().startsWith('cd ')) continue
          if (trimmed.toLowerCase().startsWith('set currentlocalpath')) continue
          if (trimmed.toLowerCase().startsWith('set logfile')) continue

          // Keep everything else (colors, select, display styles, etc.)
          stylingLines.push(trimmed)
        }

        stateCommands = stylingLines.join(';\n')
        console.log('Extracted styling commands, length:', stateCommands.length)
        console.log('Styling commands preview:', stateCommands.substring(0, 300))
      }

      if (!pdbData && !pdbId) {
        console.log('No molecular data found in PNGJ')
        return null
      }

      return { pdbData, stateCommands, pdbId }
    } catch (err) {
      console.error('Error extracting PNGJ data:', err)
      return null
    }
  }

  useEffect(() => {
    if (!isOpen || !containerRef.current) return

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

        // Try to extract PNGJ data first
        console.log('Attempting to extract PNGJ data from:', fileUrl)
        const extractedData = await extractPngjData(fileUrl)

        // Configure JSmol with local paths
        // Use larger dimensions to fill more of the available space
        const Info: JmolInfo = {
          width: '100%',
          height: '100%',
          color: '0x111827',  // Match Tailwind's gray-900
          use: 'HTML5',
          j2sPath: '/jsmol/j2s',  // Local path
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

              let loadCommand: string = ''
              let styleCommands: string = ''

              if (extractedData) {
                // We have extracted PNGJ data
                if (extractedData.pdbData) {
                  // Load PDB data inline
                  console.log('Loading inline PDB data from PNGJ')
                  loadCommand = `load DATA "model"\n${extractedData.pdbData}\nEND "model";`
                } else if (extractedData.pdbId) {
                  // Load from PDB ID found in state script
                  console.log('Loading from PDB ID found in state:', extractedData.pdbId)
                  loadCommand = `load =${extractedData.pdbId};`
                } else if (proteinPdbId) {
                  // Fallback to group's PDB ID
                  console.log('No PDB data in PNGJ, falling back to group PDB:', proteinPdbId)
                  loadCommand = `load =${proteinPdbId};`
                }

                // Apply styling commands from state script if available
                if (extractedData.stateCommands) {
                  console.log('Applying styling commands from state script')
                  styleCommands = extractedData.stateCommands
                  // Store for reset functionality
                  originalStateRef.current = { stateCommands: extractedData.stateCommands }
                  setHasOriginalState(true)
                } else {
                  // No styling commands, use defaults
                  styleCommands = 'cartoon only; color structure;'
                  setHasOriginalState(false)
                }
              } else {
                // No PNGJ data extracted, try fallback
                if (proteinPdbId) {
                  console.log('No extractable data, loading from PDB:', proteinPdbId)
                  loadCommand = `load =${proteinPdbId};`
                  styleCommands = 'cartoon only; color structure;'
                } else {
                  setError('Could not extract molecular data from file. Try loading from PDB.')
                  setLoading(false)
                  return
                }
              }

              // Execute the full script: base settings, load, then styling
              window.Jmol.script(appletRef.current!, `
                ${baseSettings}
                ${loadCommand}
                ${styleCommands}
              `)
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

  const handleSaveImage = () => {
    if (appletRef.current && window.Jmol) {
      // Generate timestamp for filename
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const filename = `${modelName.replace(/\s+/g, '_')}_${timestamp}.png`

      // Use JSmol's write command to create and download image
      runScript(`write IMAGE PNG "${filename}"`)
    }
  }

  const handleSaveState = () => {
    if (appletRef.current && window.Jmol) {
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const filename = `${modelName.replace(/\s+/g, '_')}_${timestamp}.jpg`

      // PNGJ saves the image with embedded Jmol state
      runScript(`write PNGJ "${filename}"`)
    }
  }

  // Command console handlers
  const handleCommandSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!command.trim()) return

    runScript(command.trim())
    setCommandHistory(prev => [...prev, command.trim()])
    setCommand('')
    setHistoryIndex(-1)

    // Capture the response message after a short delay
    setTimeout(() => {
      if (appletRef.current && window.Jmol) {
        const msg = window.Jmol.evaluateVar(appletRef.current, 'message') as string
        if (msg) {
          setCommandOutput(msg)
        }
      }
    }, 100)
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

  // Replace submission with current view as PNGJ
  const handleReplaceSubmission = async () => {
    if (!appletRef.current || !window.Jmol || !submissionId) return

    setIsReplacing(true)
    try {
      // Get the PNGJ data as base64
      const pngjData = window.Jmol.evaluateVar(appletRef.current, 'write("PNGJ")') as string

      if (!pngjData) {
        throw new Error('Failed to capture PNGJ data')
      }

      // Convert base64 to blob
      const byteCharacters = atob(pngjData)
      const byteNumbers = new Array(byteCharacters.length)
      for (let i = 0; i < byteCharacters.length; i++) {
        byteNumbers[i] = byteCharacters.charCodeAt(i)
      }
      const byteArray = new Uint8Array(byteNumbers)
      const blob = new Blob([byteArray], { type: 'image/png' })

      // Create form data
      const formData = new FormData()
      const timestamp = new Date().toISOString().slice(0, 19).replace(/[:-]/g, '')
      const filename = `${modelName.replace(/\s+/g, '_')}_${timestamp}.pngj`
      formData.append('file', blob, filename)

      // Upload to replace endpoint
      const token = localStorage.getItem('token')
      const response = await fetch(`/api/student/models/${submissionId}/replace`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      })

      if (!response.ok) {
        const error = await response.json()
        throw new Error(error.error || 'Failed to replace submission')
      }

      // Notify parent component
      if (onSubmissionReplaced) {
        onSubmissionReplaced()
      }

      alert('Submission replaced successfully!')
    } catch (err) {
      console.error('Error replacing submission:', err)
      alert(err instanceof Error ? err.message : 'Failed to replace submission')
    } finally {
      setIsReplacing(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50">
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

                {/* Script Console */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Script Console</label>
                  <form onSubmit={handleCommandSubmit}>
                    <input
                      type="text"
                      value={command}
                      onChange={(e) => setCommand(e.target.value)}
                      onKeyDown={handleCommandKeyDown}
                      placeholder="e.g., select helix; color red"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </form>
                  {commandOutput && (
                    <div className="mt-2 p-2 bg-gray-800 text-green-400 text-xs font-mono rounded max-h-20 overflow-y-auto">
                      {commandOutput}
                    </div>
                  )}
                  <p className="text-xs text-gray-500 mt-1">
                    Press Enter to run. Use arrow keys for history.
                  </p>
                </div>

                {/* Save Options */}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Save</label>
                  <div className="space-y-2">
                    <button
                      onClick={handleSaveImage}
                      className="w-full px-3 py-2 bg-green-600 text-white rounded text-sm font-medium hover:bg-green-700 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      Save as PNG
                    </button>
                    <button
                      onClick={handleSaveState}
                      className="w-full px-3 py-2 bg-purple-600 text-white rounded text-sm font-medium hover:bg-purple-700 flex items-center justify-center gap-2"
                    >
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7H5a2 2 0 00-2 2v9a2 2 0 002 2h14a2 2 0 002-2V9a2 2 0 00-2-2h-3m-1 4l-3 3m0 0l-3-3m3 3V4" />
                      </svg>
                      Save with 3D State
                    </button>
                    {submissionId && (
                      <button
                        onClick={handleReplaceSubmission}
                        disabled={isReplacing}
                        className="w-full px-3 py-2 bg-orange-600 text-white rounded text-sm font-medium hover:bg-orange-700 disabled:bg-orange-400 flex items-center justify-center gap-2"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                        </svg>
                        {isReplacing ? 'Replacing...' : 'Replace Submission'}
                      </button>
                    )}
                    <p className="text-xs text-gray-500">
                      "Save with 3D State" creates a file that can be reopened in JSmol with all settings preserved.
                    </p>
                  </div>
                </div>

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

        {/* Footer */}
        <div className="p-3 border-t bg-gray-50 shrink-0">
          <p className="text-xs text-gray-500 text-center">
            Drag to rotate • Scroll to zoom • Shift+drag to pan • Right-click for more options
          </p>
        </div>
      </div>
    </div>
  )
}
