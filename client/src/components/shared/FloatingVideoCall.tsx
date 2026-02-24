import { useState } from 'react'
import { createPortal } from 'react-dom'
import { useVideoCall } from '../../context/VideoCallContext'

export default function FloatingVideoCall() {
  const videoCall = useVideoCall()
  const [minimized, setMinimized] = useState(false)

  if (!videoCall?.activeCall) return null

  const { activeCall, endCall } = videoCall
  const src = `https://8x8.vc/${activeCall.appId}/${activeCall.roomName}?jwt=${activeCall.token}`

  return createPortal(
    <div
      className={`fixed bottom-4 right-4 shadow-2xl rounded-lg overflow-hidden bg-gray-900 border border-gray-700 transition-all duration-200 ${
        minimized ? 'w-52' : 'w-80'
      }`}
      style={{ zIndex: 300 }}
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
              // Expand icon
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-1V4m0 0h-4m4 0l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
              </svg>
            ) : (
              // Minimize icon
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

      {/* iframe — hidden when minimized but NOT unmounted so the call stays connected */}
      <div style={{ height: minimized ? 0 : '240px', overflow: 'hidden' }}>
        <iframe
          src={src}
          allow="camera; microphone; fullscreen; display-capture; autoplay"
          style={{ width: '100%', height: '240px', border: 'none', display: 'block' }}
          title="Group Video Call"
        />
      </div>
    </div>,
    document.body
  )
}
