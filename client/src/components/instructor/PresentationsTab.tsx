import { useState, useEffect, useMemo } from 'react'
import * as instructorApi from '../../services/instructorApi'
import { useAuth } from '../../context/AuthContext'

type SortCol = 'title' | 'group' | 'uploadedBy' | 'date' | 'size' | 'slides'
type SortDir = 'asc' | 'desc'
type SummarySortCol = 'name' | 'count' | 'latest'

export default function InstructorPresentationsTab() {
  const { user } = useAuth()
  const [presentations, setPresentations] = useState<instructorApi.Presentation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [sortCol, setSortCol] = useState<SortCol>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [summaryOpen, setSummaryOpen] = useState(false)
  const [groups, setGroups] = useState<instructorApi.Group[]>([])
  const [groupsLoading, setGroupsLoading] = useState(false)
  const [summarySortCol, setSummarySortCol] = useState<SummarySortCol>('count')
  const [summarySortDir, setSummarySortDir] = useState<SortDir>('asc')
  const [threshold, setThreshold] = useState(1)
  const [emailLoading, setEmailLoading] = useState(false)

  useEffect(() => {
    loadPresentations()
  }, [])

  const loadPresentations = async () => {
    try {
      setLoading(true)
      setError('')
      const data = await instructorApi.getAllPresentations()
      setPresentations(data)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load presentations')
    } finally {
      setLoading(false)
    }
  }

  const handleSort = (col: SortCol) => {
    if (sortCol === col) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSortCol(col)
      setSortDir(col === 'date' ? 'desc' : 'asc')
    }
  }

  const filtered = useMemo(() => {
    let result = [...presentations]

    if (dateFrom) {
      const from = new Date(dateFrom)
      result = result.filter(p => new Date(p.createdAt) >= from)
    }
    if (dateTo) {
      const to = new Date(dateTo)
      to.setHours(23, 59, 59, 999)
      result = result.filter(p => new Date(p.createdAt) <= to)
    }

    result.sort((a, b) => {
      let cmp = 0
      switch (sortCol) {
        case 'title':
          cmp = a.title.localeCompare(b.title)
          break
        case 'group':
          cmp = a.group.name.localeCompare(b.group.name)
          break
        case 'uploadedBy':
          cmp = `${a.uploadedBy.lastName} ${a.uploadedBy.firstName}`
            .localeCompare(`${b.uploadedBy.lastName} ${b.uploadedBy.firstName}`)
          break
        case 'date':
          cmp = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
        case 'size':
          cmp = (a.fileSize ?? 0) - (b.fileSize ?? 0)
          break
        case 'slides':
          cmp = (a.slideCount ?? 0) - (b.slideCount ?? 0)
          break
      }
      return sortDir === 'asc' ? cmp : -cmp
    })

    return result
  }, [presentations, sortCol, sortDir, dateFrom, dateTo])

  const allVisibleSelected = filtered.length > 0 && filtered.every(p => selected.has(p.id))

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(p => next.delete(p.id))
        return next
      })
    } else {
      setSelected(prev => {
        const next = new Set(prev)
        filtered.forEach(p => next.add(p.id))
        return next
      })
    }
  }

  const toggleOne = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  const downloadSelected = () => {
    const toDownload = filtered.filter(p => selected.has(p.id))
    toDownload.forEach((p, i) => {
      setTimeout(() => {
        const a = document.createElement('a')
        a.href = instructorApi.getPresentationFileUrl(p.id)
        const ext = p.fileName.includes('.') ? p.fileName.slice(p.fileName.lastIndexOf('.')) : ''
        const school = p.group.schoolName ?? p.group.name
        a.download = `${school}-${p.group.proteinPdbId}${ext}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
      }, i * 300)
    })
  }

  const openSummary = async () => {
    setSummaryOpen(true)
    if (groups.length === 0) {
      setGroupsLoading(true)
      try {
        setGroups(await instructorApi.getGroups())
      } finally {
        setGroupsLoading(false)
      }
    }
  }

  const emailMissingGroups = async () => {
    const missingGroups = summaryRows.filter(r => r.count < threshold)
    if (missingGroups.length === 0) return

    setEmailLoading(true)
    try {
      const details = await Promise.all(
        missingGroups.map(r => {
          const group = groups.find(g => g.name === r.name)
          return group ? instructorApi.getGroup(group.id) : null
        })
      )
      const emails = Array.from(new Set(
        details.flatMap(d => d?.members
          .filter(m => m.user.role === 'STUDENT')
          .map(m => m.user.email) ?? []
        )
      ))
      const subject = encodeURIComponent('Presentation submission reminder')
      const body = encodeURIComponent(
        `Hi,\n\nYour group has not uploaded your Protein Modeling presentation yet. Please do so immediately so that we are prepared for our next meeting.\n\nAs a reminder, to upload your presentation, visit the course website and navigate to the presentations section.`
      )
      window.location.href = `mailto:${user?.email ?? ''}?bcc=${emails.join(',')}&subject=${subject}&body=${body}`
    } finally {
      setEmailLoading(false)
    }
  }

  const handleSummarySort = (col: SummarySortCol) => {
    if (summarySortCol === col) {
      setSummarySortDir(d => d === 'asc' ? 'desc' : 'asc')
    } else {
      setSummarySortCol(col)
      setSummarySortDir(col === 'count' ? 'asc' : 'asc')
    }
  }

  const clearFilters = () => {
    setDateFrom('')
    setDateTo('')
  }

  const formatFileSize = (bytes: number | null) => {
    if (!bytes) return '—'
    if (bytes < 1024) return `${bytes} B`
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
  }

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric'
    })
  }

  const SortIcon = ({ col }: { col: SortCol }) => {
    if (sortCol !== col) {
      return (
        <svg className="w-3 h-3 text-gray-300 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return sortDir === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const ColHeader = ({ col, label }: { col: SortCol; label: string }) => (
    <button
      onClick={() => handleSort(col)}
      className={`flex items-center text-xs font-medium uppercase tracking-wider hover:text-gray-800 transition-colors ${
        sortCol === col ? 'text-blue-600' : 'text-gray-500'
      }`}
    >
      {label}
      <SortIcon col={col} />
    </button>
  )

  // Build per-group summary rows, merging all known groups with presentation counts
  const summaryRows = useMemo(() => {
    const countMap = new Map<string, { count: number; latest: string | null; name: string }>()

    // Seed with all known groups (including those with 0 submissions)
    groups.forEach(g => {
      countMap.set(g.id, { count: 0, latest: null, name: g.name })
    })

    // Tally from presentations (may include groups not yet in `groups` if modal never opened)
    presentations.forEach(p => {
      const existing = countMap.get(p.groupId)
      if (existing) {
        existing.count++
        if (!existing.latest || p.createdAt > existing.latest) existing.latest = p.createdAt
      } else {
        countMap.set(p.groupId, { count: 1, latest: p.createdAt, name: p.group.name })
      }
    })

    const rows = Array.from(countMap.values())
    rows.sort((a, b) => {
      let cmp = 0
      if (summarySortCol === 'name') cmp = a.name.localeCompare(b.name)
      else if (summarySortCol === 'count') cmp = a.count - b.count
      else {
        // latest: nulls (never submitted) always sort to top regardless of direction
        if (!a.latest && !b.latest) cmp = 0
        else if (!a.latest) return -1
        else if (!b.latest) return 1
        else cmp = a.latest.localeCompare(b.latest)
      }
      return summarySortDir === 'asc' ? cmp : -cmp
    })
    return rows
  }, [groups, presentations, summarySortCol, summarySortDir])

  const SummarySortIcon = ({ col }: { col: SummarySortCol }) => {
    if (summarySortCol !== col) {
      return (
        <svg className="w-3 h-3 text-gray-300 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16V4m0 0L3 8m4-4l4 4M17 8v12m0 0l4-4m-4 4l-4-4" />
        </svg>
      )
    }
    return summarySortDir === 'asc' ? (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
      </svg>
    ) : (
      <svg className="w-3 h-3 text-blue-600 ml-1 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
      </svg>
    )
  }

  const SummaryColHeader = ({ col, label }: { col: SummarySortCol; label: string }) => (
    <button
      onClick={() => handleSummarySort(col)}
      className={`flex items-center text-xs font-medium uppercase tracking-wider hover:text-gray-800 transition-colors ${
        summarySortCol === col ? 'text-blue-600' : 'text-gray-500'
      }`}
    >
      {label}
      <SummarySortIcon col={col} />
    </button>
  )

  if (loading) {
    return <div className="p-6 text-gray-500">Loading presentations...</div>
  }

  if (error) {
    return (
      <div className="p-6">
        <div className="bg-red-50 text-red-600 p-4 rounded-md">
          {error}
          <button onClick={loadPresentations} className="ml-2 underline">Retry</button>
        </div>
      </div>
    )
  }

  const selectedCount = filtered.filter(p => selected.has(p.id)).length

  return (
    <div className="p-6">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-800">All Presentations</h2>
        <p className="text-sm text-gray-500">
          {presentations.length} {presentations.length === 1 ? 'file' : 'files'} across all groups
        </p>
      </div>

      {/* Toolbar */}
      <div className="bg-white rounded-lg shadow p-4 mb-4 flex flex-wrap items-end gap-4">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">From</label>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-sm font-medium text-gray-700">To</label>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className="px-2 py-1.5 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        {(dateFrom || dateTo) && (
          <button
            onClick={clearFilters}
            className="text-sm text-gray-500 hover:text-gray-700 underline"
          >
            Clear
          </button>
        )}

        <div className="flex-1" />

        <button
          onClick={openSummary}
          className="flex items-center gap-2 border border-gray-300 text-gray-700 px-4 py-1.5 rounded-md hover:bg-gray-50 transition-colors text-sm font-medium"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
          </svg>
          Group summary
        </button>

        {selectedCount > 0 && (
          <button
            onClick={downloadSelected}
            className="flex items-center gap-2 bg-blue-600 text-white px-4 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
            </svg>
            Download selected ({selectedCount})
          </button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
          {presentations.length === 0
            ? 'No presentations have been uploaded yet.'
            : 'No presentations match the selected date range.'}
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          {/* Table header */}
          <div className="grid grid-cols-[2rem_1fr_1fr_8rem_8rem_5rem_6rem_2.5rem] gap-4 px-4 py-3 bg-gray-50 border-b items-center">
            <input
              type="checkbox"
              checked={allVisibleSelected}
              onChange={toggleSelectAll}
              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
            />
            <ColHeader col="title" label="Title" />
            <ColHeader col="group" label="Group" />
            <ColHeader col="uploadedBy" label="Uploaded by" />
            <ColHeader col="date" label="Date" />
            <ColHeader col="size" label="Size" />
            <ColHeader col="slides" label="Slides" />
            <span />
          </div>

          {/* Rows */}
          <div className="divide-y divide-gray-100">
            {filtered.map(item => (
              <div
                key={item.id}
                className={`grid grid-cols-[2rem_1fr_1fr_8rem_8rem_5rem_6rem_2.5rem] gap-4 px-4 py-3 items-center hover:bg-gray-50 transition-colors ${
                  selected.has(item.id) ? 'bg-blue-50' : ''
                }`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(item.id)}
                  onChange={() => toggleOne(item.id)}
                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                />
                <div className="min-w-0">
                  <div className="font-medium text-gray-800 truncate">{item.title}</div>
                  {item.description && (
                    <div className="text-xs text-gray-500 truncate mt-0.5">{item.description}</div>
                  )}
                  <div className="text-xs text-gray-400 truncate mt-0.5">{item.fileName}</div>
                </div>
                <div className="text-sm text-gray-600 truncate">{item.group.name}</div>
                <div className="text-sm text-gray-600 truncate">
                  {item.uploadedBy.firstName} {item.uploadedBy.lastName}
                </div>
                <div className="text-sm text-gray-600">{formatDate(item.createdAt)}</div>
                <div className="text-sm text-gray-500">{formatFileSize(item.fileSize)}</div>
                <div className="text-sm text-gray-500">
                  {item.slideCount != null ? item.slideCount : '—'}
                </div>
                <a
                  href={instructorApi.getPresentationFileUrl(item.id)}
                  download={item.fileName}
                  className="text-gray-400 hover:text-blue-600 transition-colors"
                  title="Download"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </a>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Group Summary Modal */}
      {summaryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div className="absolute inset-0 bg-black/40" onClick={() => setSummaryOpen(false)} />
          <div className="relative bg-white rounded-xl shadow-xl w-full max-w-lg mx-4 max-h-[80vh] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between px-5 py-4 border-b">
              <div>
                <h3 className="text-base font-semibold text-gray-800">Group submission summary</h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  {summaryRows.filter(r => r.count < threshold).length} of {summaryRows.length} groups below threshold
                </p>
              </div>
              <button
                onClick={() => setSummaryOpen(false)}
                className="text-gray-400 hover:text-gray-600 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Threshold + email action bar */}
            <div className="flex items-center gap-3 px-5 py-3 border-b bg-gray-50">
              <label className="text-sm text-gray-600 whitespace-nowrap">Expected submissions:</label>
              <input
                type="number"
                min={1}
                value={threshold}
                onChange={e => setThreshold(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-16 px-2 py-1 border border-gray-300 rounded-md text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <div className="flex-1" />
              <button
                onClick={emailMissingGroups}
                disabled={emailLoading || summaryRows.filter(r => r.count < threshold).length === 0}
                className="flex items-center gap-2 bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {emailLoading ? (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8z" />
                  </svg>
                ) : (
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                  </svg>
                )}
                Email missing ({summaryRows.filter(r => r.count < threshold).length})
              </button>
            </div>

            {/* Table */}
            <div className="overflow-y-auto flex-1">
              {groupsLoading ? (
                <div className="p-6 text-center text-gray-500 text-sm">Loading groups...</div>
              ) : (
                <>
                  <div className="grid grid-cols-[1fr_6rem_9rem] gap-4 px-5 py-2.5 bg-gray-50 border-b sticky top-0">
                    <SummaryColHeader col="name" label="Group" />
                    <SummaryColHeader col="count" label="Submissions" />
                    <SummaryColHeader col="latest" label="Latest upload" />
                  </div>
                  <div className="divide-y divide-gray-100">
                    {summaryRows.map(row => (
                      <div key={row.name} className={`grid grid-cols-[1fr_6rem_9rem] gap-4 px-5 py-2.5 items-center ${row.count < threshold ? 'bg-red-50/40' : ''}`}>
                        <span className="text-sm text-gray-800 truncate">{row.name}</span>
                        <span>
                          {row.count < threshold
                            ? <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-red-100 text-red-700">{row.count === 0 ? 'None' : row.count}</span>
                            : <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-700">{row.count}</span>
                          }
                        </span>
                        <span className="text-sm text-gray-500">
                          {row.latest ? formatDate(row.latest) : '—'}
                        </span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
