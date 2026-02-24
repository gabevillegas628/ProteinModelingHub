import { createContext, useContext, useState, ReactNode } from 'react'
import { getVideoToken, VideoTokenResponse } from '../services/studentApi'

interface VideoCallContextValue {
  activeCall: VideoTokenResponse | null
  callLoading: boolean
  callError: string
  isFirefox: boolean
  startCall: (groupId: string) => Promise<void>
  endCall: () => void
}

const VideoCallContext = createContext<VideoCallContextValue | null>(null)

export function VideoCallProvider({ children }: { children: ReactNode }) {
  const [activeCall, setActiveCall] = useState<VideoTokenResponse | null>(null)
  const [callLoading, setCallLoading] = useState(false)
  const [callError, setCallError] = useState('')

  const isFirefox = navigator.userAgent.toLowerCase().includes('firefox')

  const startCall = async (groupId: string) => {
    if (callLoading || activeCall) return
    try {
      setCallLoading(true)
      setCallError('')
      const tokenData = await getVideoToken(groupId)
      setActiveCall(tokenData)
    } catch (err) {
      setCallError(err instanceof Error ? err.message : 'Failed to start video call')
    } finally {
      setCallLoading(false)
    }
  }

  const endCall = () => {
    setActiveCall(null)
    setCallError('')
  }

  return (
    <VideoCallContext.Provider value={{ activeCall, callLoading, callError, isFirefox, startCall, endCall }}>
      {children}
    </VideoCallContext.Provider>
  )
}

// Returns null when used outside the provider (e.g. instructor context) — callers must check
export function useVideoCall() {
  return useContext(VideoCallContext)
}
