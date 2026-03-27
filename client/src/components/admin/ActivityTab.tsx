import { useState, useEffect, useCallback } from 'react'
import * as adminApi from '../../services/adminApi'

type ActiveTable = 'logins' | 'sessions'

function Pagination({
  page,
  totalPages,
  onPageChange,
}: {
  page: number
  totalPages: number
  onPageChange: (p: number) => void
}) {
  if (totalPages <= 1) return null
  return (
    <div className="flex items-center justify-end gap-2 mt-3">
      <button
        onClick={() => onPageChange(page - 1)}
        disabled={page <= 1}
        className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >
        Previous
      </button>
      <span className="text-sm text-gray-600">
        Page {page} of {totalPages}
      </span>
      <button
        onClick={() => onPageChange(page + 1)}
        disabled={page >= totalPages}
        className="px-3 py-1 text-sm rounded border border-gray-300 disabled:opacity-40 hover:bg-gray-50"
      >
        Next
      </button>
    </div>
  )
}

function LoginEventsTable() {
  const [data, setData] = useState<adminApi.PaginatedResponse<adminApi.LoginEvent> | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminApi.getLoginEvents(p)
      setData(result)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(1) }, [load])

  if (loading && !data) return <div className="text-gray-500 py-8 text-center">Loading...</div>
  if (error) return <div className="text-red-500 py-4">{error}</div>
  if (!data) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{data.total} total events</span>
        {loading && <span className="text-xs text-gray-400">Loading...</span>}
      </div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Role</th>
              <th className="px-4 py-2 text-left">Time</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.data.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-6 text-center text-gray-400">No login events</td>
              </tr>
            )}
            {data.data.map((event) => (
              <tr key={event.id} className="hover:bg-gray-50">
                <td className="px-4 py-2 whitespace-nowrap">
                  {event.user.firstName} {event.user.lastName}
                </td>
                <td className="px-4 py-2 text-gray-600">{event.user.email}</td>
                <td className="px-4 py-2">
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                    event.user.role === 'ADMIN' ? 'bg-purple-100 text-purple-700' :
                    event.user.role === 'INSTRUCTOR' ? 'bg-blue-100 text-blue-700' :
                    'bg-green-100 text-green-700'
                  }`}>
                    {event.user.role}
                  </span>
                </td>
                <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(event.createdAt).toLocaleString()}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={data.totalPages} onPageChange={load} />
    </div>
  )
}

function ViewerSessionsTable() {
  const [data, setData] = useState<adminApi.PaginatedResponse<adminApi.ViewerSession> | null>(null)
  const [page, setPage] = useState(1)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async (p: number) => {
    setLoading(true)
    setError(null)
    try {
      const result = await adminApi.getViewerSessions(p)
      setData(result)
      setPage(p)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => { load(1) }, [load])

  if (loading && !data) return <div className="text-gray-500 py-8 text-center">Loading...</div>
  if (error) return <div className="text-red-500 py-4">{error}</div>
  if (!data) return null

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm text-gray-500">{data.total} total sessions</span>
        {loading && <span className="text-xs text-gray-400">Loading...</span>}
      </div>
      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 uppercase text-xs">
            <tr>
              <th className="px-4 py-2 text-left">User</th>
              <th className="px-4 py-2 text-left">Email</th>
              <th className="px-4 py-2 text-left">Group</th>
              <th className="px-4 py-2 text-left">Started</th>
              <th className="px-4 py-2 text-left">Ended</th>
              <th className="px-4 py-2 text-left">Duration</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {data.data.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-gray-400">No viewer sessions</td>
              </tr>
            )}
            {data.data.map((session) => {
              const duration = session.endedAt
                ? Math.round((new Date(session.endedAt).getTime() - new Date(session.startedAt).getTime()) / 1000)
                : null
              const durationStr = duration === null
                ? <span className="text-yellow-600">active</span>
                : duration < 60
                  ? `${duration}s`
                  : `${Math.floor(duration / 60)}m ${duration % 60}s`

              return (
                <tr key={session.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 whitespace-nowrap">
                    {session.user.firstName} {session.user.lastName}
                  </td>
                  <td className="px-4 py-2 text-gray-600">{session.user.email}</td>
                  <td className="px-4 py-2">{session.group.name}</td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {new Date(session.startedAt).toLocaleString()}
                  </td>
                  <td className="px-4 py-2 text-gray-500 whitespace-nowrap">
                    {session.endedAt ? new Date(session.endedAt).toLocaleString() : '—'}
                  </td>
                  <td className="px-4 py-2 whitespace-nowrap">{durationStr}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <Pagination page={page} totalPages={data.totalPages} onPageChange={load} />
    </div>
  )
}

export default function ActivityTab() {
  const [activeTable, setActiveTable] = useState<ActiveTable>('logins')

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <h2 className="text-lg font-semibold text-gray-800 mb-4">Activity Logs</h2>

      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTable('logins')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            activeTable === 'logins'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Login Events
        </button>
        <button
          onClick={() => setActiveTable('sessions')}
          className={`px-4 py-2 rounded text-sm font-medium transition-colors ${
            activeTable === 'sessions'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Viewer Sessions
        </button>
      </div>

      {activeTable === 'logins' ? <LoginEventsTable /> : <ViewerSessionsTable />}
    </div>
  )
}
