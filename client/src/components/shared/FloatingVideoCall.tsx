import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useVideoCall } from '../../context/VideoCallContext'

// Minimal type for the JitsiMeetExternalAPI instance
interface JaaSApiInstance {
  dispose: () => void
}

declare global {
  interface Window {
    JitsiMeetExternalAPI: new (domain: string, options: {
      roomName: string
      parentNode: Element
      jwt: string
      width: number | string
      height: number | string
      configOverwrite?: Record<string, unknown>
    }) => JaaSApiInstance
  }
}

const CALL_HEIGHT = 420
const CALL_WIDTH = 480

export default function FloatingVideoCall() {
  const videoCall = useVideoCall()
  const [minimized, setMinimized] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const apiRef = useRef<JaaSApiInstance | null>(null)

  const activeCall = videoCall?.activeCall ?? null
  const endCall = videoCall?.endCall

  useEffect(() => {
    if (!activeCall || !containerRef.current) return

    // JaaS roomName for the External API must include the appId prefix
    const fullRoomName = `${activeCall.appId}/${activeCall.roomName}`

    const initApi = () => {
      if (!containerRef.current || apiRef.current) return
      apiRef.current = new window.JitsiMeetExternalAPI('8x8.vc', {
        roomName: fullRoomName,
        parentNode: containerRef.current,
        jwt: activeCall.token,
        width: '100%',
        height: CALL_HEIGHT,
        configOverwrite: {
          startWithAudioMuted: false,
          startWithVideoMuted: false,
        },
      })
    }

    if (window.JitsiMeetExternalAPI) {
      initApi()
    } else {
      // Load the External API script for this JaaS app, then init
      const script = document.createElement('script')
      script.src = `https://8x8.vc/${activeCall.appId}/external_api.js`
      script.onload = initApi
      document.head.appendChild(script)
    }

    return () => {
      apiRef.current?.dispose()
      apiRef.current = null
    }
  }, [activeCall])

  if (!activeCall) return null

  return createPortal(
    <div
      className="fixed bottom-4 right-4 shadow-2xl rounded-lg overflow-hidden bg-gray-900 border border-gray-700"
      style={{ zIndex: 300, width: CALL_WIDTH }}
    >
      {/* Header bar */}
      <div className="flex items-center justify-between px-3 py-2 bg-gray-800">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse shrink-0" />
          <span className="text-white text-sm font-medium">Group Call</span>
        </div>
        <div className="flex items-center gap-0.5">
          <button
            onClick={() => setMinimized(!minimized)}
            className="text-gray-400 hover:text-white p-1.5 rounded transition-colors"
            title={minimized ? 'Expand' : 'Minimize'}
          >
            {minimized ? (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            ) : (
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
              </svg>
            )}
          </button>
          <button
            onClick={endCall}
            className="text-gray-400 hover:text-red-400 p-1.5 rounded transition-colors"
            title="End call"
          >
            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      </div>

      {/* JaaS container — kept in DOM when minimized so the call stays alive */}
      <div style={{ height: minimized ? 0 : CALL_HEIGHT, overflow: 'hidden' }}>
        <div ref={containerRef} style={{ width: '100%', height: CALL_HEIGHT }} />
      </div>
    </div>,
    document.body
  )
}
