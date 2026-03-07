import { useState, useEffect } from 'react'
import * as adminApi from '../../services/adminApi'

type FilterStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'ALL'

export default function ApplicationsTab() {
  const [applications, setApplications] = useState<adminApi.Application[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState<FilterStatus>('PENDING')
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [actionLoading, setActionLoading] = useState<string | null>(null)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  const [rejectReason, setRejectReason] = useState('')
  const [previewId, setPreviewId] = useState<string | null>(null)
  const [deletingId, setDeletingId] = useState<string | null>(null)

  useEffect(() => {
    loadApplications()
  }, [filter])

  const loadApplications = async () => {
    try {
      setLoading(true)
      setError('')
      const status = filter === 'ALL' ? undefined : filter
      const data = await adminApi.getApplications(status)
      setApplications(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load applications')
    } finally {
      setLoading(false)
    }
  }

  const handleApprove = async (id: string) => {
    setActionLoading(id)
    try {
      await adminApi.approveApplication(id)
      loadApplications()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to approve application')
    } finally {
      setActionLoading(null)
    }
  }

  const handleRejectConfirm = async () => {
    if (!rejectingId) return
    setActionLoading(rejectingId)
    try {
      await adminApi.rejectApplication(rejectingId, rejectReason || undefined)
      setRejectingId(null)
      setRejectReason('')
      loadApplications()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reject application')
    } finally {
      setActionLoading(null)
    }
  }

  const openRejectModal = (id: string) => {
    setRejectingId(id)
    setRejectReason('')
  }

  const handleDeleteConfirm = async () => {
    if (!deletingId) return
    setActionLoading(deletingId)
    try {
      await adminApi.deleteApplication(deletingId)
      setDeletingId(null)
      loadApplications()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete application')
    } finally {
      setActionLoading(null)
    }
  }

  const pendingCount = applications.filter(a => a.status === 'PENDING').length

  const statusBadge = (status: string) => {
    const styles: Record<string, string> = {
      PENDING: 'bg-yellow-100 text-yellow-800',
      APPROVED: 'bg-green-100 text-green-800',
      REJECTED: 'bg-red-100 text-red-800',
    }
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {status.charAt(0) + status.slice(1).toLowerCase()}
      </span>
    )
  }

  const filterButtons: { key: FilterStatus; label: string }[] = [
    { key: 'PENDING', label: `Pending${filter !== 'PENDING' && pendingCount > 0 ? ` (${pendingCount})` : ''}` },
    { key: 'APPROVED', label: 'Approved' },
    { key: 'REJECTED', label: 'Rejected' },
    { key: 'ALL', label: 'All' },
  ]

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-800">Applications</h2>
          <p className="text-sm text-gray-500 mt-1">Review and approve student team applications</p>
        </div>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border-l-4 border-red-500 text-red-700 text-sm rounded">
          {error}
          <button onClick={() => setError('')} className="ml-2 font-bold">×</button>
        </div>
      )}

      {/* Filter buttons */}
      <div className="flex gap-2 mb-6">
        {filterButtons.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
              filter === key
                ? 'bg-blue-600 text-white'
                : 'bg-white text-gray-600 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {label}
            {key === 'PENDING' && filter !== 'PENDING' && pendingCount > 0 && (
              <span className="ml-1.5 bg-yellow-400 text-yellow-900 text-xs px-1.5 py-0.5 rounded-full font-bold">
                {pendingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-blue-600 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : applications.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
          <p className="text-gray-500">No {filter !== 'ALL' ? filter.toLowerCase() : ''} applications found.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {applications.map((app) => (
            <div key={app.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
              {/* Card header */}
              <div className="p-5">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 flex-wrap">
                      <h3 className="font-semibold text-gray-900">{app.schoolName}</h3>
                      <span className="text-xs text-gray-400 font-mono">WSSP #{app.wsspSchoolNumber}</span>
                      {statusBadge(app.status)}
                    </div>
                    <div className="mt-2 text-sm text-gray-600 space-y-0.5">
                      <p>
                        <span className="text-gray-400">Students:</span>{' '}
                        {app.studentAFirstName} {app.studentALastName} &amp; {app.studentBFirstName} {app.studentBLastName}
                      </p>
                      <p>
                        <span className="text-gray-400">Protein:</span>{' '}
                        <span className="font-medium">{app.proteinName}</span>
                        <span className="ml-2 font-mono text-xs bg-gray-100 px-1.5 py-0.5 rounded">{app.pdbAccessionNumber}</span>
                      </p>
                      <p className="text-xs text-gray-400">
                        Submitted {new Date(app.createdAt).toLocaleString('en-US', {
                          month: 'short', day: 'numeric', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </p>
                    </div>
                    {app.status === 'REJECTED' && app.rejectionReason && (
                      <p className="mt-2 text-sm text-red-600 bg-red-50 px-3 py-1.5 rounded">
                        <span className="font-medium">Rejection reason:</span> {app.rejectionReason}
                      </p>
                    )}
                    {app.status === 'APPROVED' && app.group && (
                      <p className="mt-2 text-sm text-green-600">
                        Group created: <span className="font-medium">{app.group.name}</span>
                      </p>
                    )}
                  </div>

                  {/* Action buttons */}
                  <div className="flex flex-col gap-2 shrink-0">
                    <button
                      onClick={() => setPreviewId(app.id)}
                      className="text-center px-3 py-1.5 text-xs font-medium text-blue-700 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
                    >
                      Preview PDF
                    </button>
                    <button
                      onClick={() => setExpandedId(expandedId === app.id ? null : app.id)}
                      className="px-3 py-1.5 text-xs font-medium text-gray-600 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
                    >
                      {expandedId === app.id ? 'Hide Details' : 'View Details'}
                    </button>
                    {app.status === 'PENDING' && (
                      <>
                        <button
                          onClick={() => handleApprove(app.id)}
                          disabled={actionLoading === app.id}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-green-600 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 flex items-center justify-center gap-1"
                        >
                          {actionLoading === app.id ? (
                            <div className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                          ) : 'Approve'}
                        </button>
                        <button
                          onClick={() => openRejectModal(app.id)}
                          disabled={actionLoading === app.id}
                          className="px-3 py-1.5 text-xs font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors disabled:opacity-50"
                        >
                          Reject
                        </button>
                      </>
                    )}
                    <button
                      onClick={() => setDeletingId(app.id)}
                      disabled={actionLoading === app.id}
                      className="px-3 py-1.5 text-xs font-medium text-gray-500 bg-white border border-gray-300 rounded-lg hover:bg-red-50 hover:text-red-600 hover:border-red-300 transition-colors disabled:opacity-50"
                    >
                      Delete
                    </button>
                  </div>
                </div>

                {/* Expanded details */}
                {expandedId === app.id && (
                  <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Student A</p>
                      <p className="font-medium">{app.studentAFirstName} {app.studentALastName}</p>
                      <p className="text-gray-500">{app.studentAEmail}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Student B</p>
                      <p className="font-medium">{app.studentBFirstName} {app.studentBLastName}</p>
                      <p className="text-gray-500">{app.studentBEmail}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Teacher</p>
                      <p className="font-medium">{app.teacherName}</p>
                      <p className="text-gray-500">{app.teacherEmail}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Clone #</p>
                      <p>{app.cloneNumber}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">% Sequence Identity</p>
                      <p>{app.sequenceIdentity}%</p>
                    </div>
                    <div className="sm:col-span-2">
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">Research Article Citation</p>
                      <p className="text-gray-700">{app.researchArticleCitation}</p>
                    </div>
                    <div>
                      <p className="text-gray-400 text-xs font-medium uppercase tracking-wide mb-1">PDF Description</p>
                      <p className="text-gray-500 text-xs truncate">{app.pdfFileName}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* PDF preview modal */}
      {previewId && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-4xl flex flex-col" style={{ height: '90vh' }}>
            <div className="flex items-center justify-between px-4 py-3 border-b bg-gray-50 rounded-t-xl shrink-0">
              <span className="text-sm font-medium text-gray-700 truncate">
                {applications.find(a => a.id === previewId)?.pdfFileName}
              </span>
              <div className="flex items-center gap-3 shrink-0 ml-4">
                <a
                  href={adminApi.getApplicationFileUrl(previewId)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-blue-600 hover:text-blue-800"
                >
                  Open in new tab
                </a>
                <button onClick={() => setPreviewId(null)} className="text-gray-400 hover:text-gray-600">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
            <iframe
              src={adminApi.getApplicationFileUrl(previewId)}
              className="w-full flex-1 rounded-b-xl"
              title="PDF Preview"
            />
          </div>
        </div>
      )}

      {/* Reject modal */}
      {deletingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-sm w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Delete Application</h3>
            <p className="text-sm text-gray-500 mb-6">
              This will permanently delete the application and its PDF. This cannot be undone.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setDeletingId(null)}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDeleteConfirm}
                disabled={actionLoading === deletingId}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === deletingId ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {rejectingId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold text-gray-900 mb-2">Reject Application</h3>
            <p className="text-sm text-gray-500 mb-4">
              Optionally provide a reason for rejection. This is for your records only.
            </p>
            <textarea
              value={rejectReason}
              onChange={(e) => setRejectReason(e.target.value)}
              placeholder="Reason for rejection (optional)"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-red-500 focus:border-red-500 resize-none"
            />
            <div className="flex gap-3 mt-4 justify-end">
              <button
                onClick={() => { setRejectingId(null); setRejectReason('') }}
                className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50"
              >
                Cancel
              </button>
              <button
                onClick={handleRejectConfirm}
                disabled={actionLoading === rejectingId}
                className="px-4 py-2 text-sm font-medium text-white bg-red-600 rounded-lg hover:bg-red-700 disabled:opacity-50 flex items-center gap-2"
              >
                {actionLoading === rejectingId ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : null}
                Confirm Reject
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
