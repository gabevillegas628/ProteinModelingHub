import { useState, useEffect, useRef } from 'react'
import * as instructorApi from '../../services/instructorApi'
import JSmolViewer from '../shared/JSmolViewer'

// window.Jmol is declared globally in JSmolViewer.tsx
type JmolApplet = Parameters<(typeof window.Jmol)['script']>[0]

interface ViewerState {
  submissionId: string;
  templateName: string;
  groupName: string;
}

export default function ThreeDPrintPanel() {
  const [groups, setGroups] = useState<instructorApi.PrintGroup[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [exportingId, setExportingId] = useState<string | null>(null)
  const [exportError, setExportError] = useState<string | null>(null)
  const [viewer, setViewer] = useState<ViewerState | null>(null)
  const [selectedTemplateId, setSelectedTemplateId] = useState<Record<string, string>>({})
  const exportContainerRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    instructorApi.getPrintGroups()
      .then(setGroups)
      .catch(e => setError(e instanceof Error ? e.message : 'Failed to load'))
      .finally(() => setLoading(false))
  }, [])

  const waitForModelLoad = (applet: JmolApplet): Promise<void> => {
    return new Promise((resolve, reject) => {
      const start = Date.now()
      const poll = () => {
        if (Date.now() - start > 30000) {
          reject(new Error('Timed out waiting for model to load'))
          return
        }
        try {
          const state = window.Jmol.getPropertyAsString(applet, 'stateInfo')
          if (state && state.length > 200) {
            resolve()
          } else {
            setTimeout(poll, 500)
          }
        } catch {
          setTimeout(poll, 500)
        }
      }
      setTimeout(poll, 1000)
    })
  }

  const captureX3d = (applet: JmolApplet): string => {
    // evaluateVar('write("x3d")') returns the X3D content as a string directly,
    // avoiding the need to intercept a download anchor (which behaves differently for text vs binary).
    const result = window.Jmol.evaluateVar(applet, 'write("x3d")')
    if (typeof result !== 'string' || result.trim().length === 0) {
      throw new Error('JSmol returned empty X3D content — model may not have finished loading')
    }
    return result
  }

  const handleExport = async (submission: instructorApi.Submission, schoolName: string | null | undefined, proteinPdbId: string) => {
    if (!window.Jmol) {
      setExportError('JSmol is not loaded. Open the 3D Viewer first to initialize it.')
      return
    }

    setExportingId(submission.id)
    setExportError(null)

    const container = document.createElement('div')
    container.style.cssText = 'position:fixed;left:-9999px;top:-9999px;width:600px;height:500px;overflow:hidden'
    document.body.appendChild(container)
    exportContainerRef.current = container

    try {
      const fileUrl = instructorApi.getSubmissionFileUrl(submission.id)
      const appletId = `jmol_export_${Date.now()}`

      window.Jmol.setDocument(false)
      const applet = window.Jmol.getApplet(appletId, {
        width: 600,
        height: 500,
        color: '0x000000',
        use: 'HTML5',
        j2sPath: '/modeling/jsmol/j2s',
        script: `load "${fileUrl}"`,
        disableJ2SLoadMonitor: true,
        disableInitialConsole: true,
        allowJavaScript: true,
      })

      container.innerHTML = window.Jmol.getAppletHtml(applet)

      await waitForModelLoad(applet)

      const x3dContent = captureX3d(applet)

      const baseName = `${schoolName ?? 'group'}-${proteinPdbId}`.replace(/[^a-zA-Z0-9-]/g, '_')
      const x3dFile = new File([x3dContent], `${baseName}.x3d`, { type: 'model/x3d+xml' })
      const blob = await instructorApi.convertX3dTo3mf(x3dFile, `${baseName}.3mf`)

      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `${baseName}.3mf`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    } catch (err) {
      setExportError(err instanceof Error ? err.message : String(err) || 'Export failed')
    } finally {
      if (exportContainerRef.current) {
        document.body.removeChild(exportContainerRef.current)
        exportContainerRef.current = null
      }
      setExportingId(null)
    }
  }

  if (loading) {
    return (
      <div className="flex-1 p-8 text-gray-500 text-sm">Loading print-ready groups...</div>
    )
  }

  if (error) {
    return (
      <div className="flex-1 p-8 text-red-500 text-sm">{error}</div>
    )
  }

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <div className="max-w-3xl mx-auto">
        <div className="mb-6">
          <h2 className="text-lg font-semibold text-gray-800">3D Printing</h2>
          <p className="text-sm text-gray-500 mt-1">
            Groups marked ready for printing. View each model to verify colors, then export as 3MF for BambuStudio.
          </p>
        </div>

        {exportError && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {exportError}
          </div>
        )}

        {groups.length === 0 ? (
          <div className="text-center py-16 text-gray-400">
            <svg className="w-12 h-12 mx-auto mb-3 opacity-40" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
            </svg>
            <p className="text-sm font-medium">No groups are marked ready for printing.</p>
            <p className="text-xs mt-1">Open a group and click "Mark Ready to Print" to add it here.</p>
          </div>
        ) : (
          <div className="space-y-4">
            {groups.map(group => (
              <div key={group.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div className="px-5 py-4 border-b border-gray-100 bg-violet-50">
                  <div className="flex items-center gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 bg-violet-100 px-2 py-0.5 rounded-full">
                      <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
                      </svg>
                      Ready to Print
                    </span>
                    <h3 className="text-sm font-semibold text-gray-800">{group.name}</h3>
                    <span className="text-xs text-gray-400">{group.proteinName} ({group.proteinPdbId})</span>
                  </div>
                </div>

                {group.templates.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">No submitted models.</div>
                ) : (() => {
                  const selectedId = selectedTemplateId[group.id] ?? group.templates[group.templates.length - 1].id
                  const selected = group.templates.find(t => t.id === selectedId) ?? group.templates[group.templates.length - 1]
                  const isExporting = exportingId === selected.submission.id
                  return (
                    <div className="px-5 py-4 flex items-center gap-3">
                      <select
                        value={selectedId}
                        onChange={e => setSelectedTemplateId(prev => ({ ...prev, [group.id]: e.target.value }))}
                        className="flex-1 text-sm border border-gray-200 rounded-lg px-3 py-1.5 text-gray-700 bg-white focus:outline-none focus:ring-2 focus:ring-violet-300"
                      >
                        {group.templates.map(t => (
                          <option key={t.id} value={t.id}>{t.name}</option>
                        ))}
                      </select>
                      <button
                        onClick={() => setViewer({
                          submissionId: selected.submission.id,
                          templateName: selected.name,
                          groupName: group.name,
                        })}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-gray-200 text-gray-600 hover:bg-gray-50 transition-colors shrink-0"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                        </svg>
                        View
                      </button>
                      <button
                        onClick={() => handleExport(selected.submission, group.schoolName, group.proteinPdbId)}
                        disabled={exportingId !== null}
                        className={`flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg font-medium transition-colors shrink-0 ${
                          isExporting
                            ? 'bg-violet-100 text-violet-500 cursor-wait'
                            : exportingId !== null
                            ? 'bg-gray-100 text-gray-400 cursor-not-allowed'
                            : 'bg-violet-600 text-white hover:bg-violet-700'
                        }`}
                      >
                        {isExporting ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                            </svg>
                            Exporting...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                            </svg>
                            Export 3MF
                          </>
                        )}
                      </button>
                    </div>
                  )
                })()}
              </div>
            ))}
          </div>
        )}
      </div>

      {viewer && (
        <JSmolViewer
          isOpen={true}
          onClose={() => setViewer(null)}
          fileUrl={instructorApi.getSubmissionFileUrl(viewer.submissionId)}
          modelName={`${viewer.groupName} — ${viewer.templateName}`}
          dialogClassName="min-h-[85vh]"
        />
      )}
    </div>
  )
}
