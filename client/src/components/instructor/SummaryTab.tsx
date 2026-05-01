import { useState, useEffect } from 'react'
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip, Legend,
} from 'recharts'
import * as instructorApi from '../../services/instructorApi'

interface Props {
  groups: instructorApi.Group[]
  onSelectGroup: (groupId: string) => void
}

function timeAgo(dateStr: string): string {
  const days = Math.floor((Date.now() - new Date(dateStr).getTime()) / 86400000)
  if (days === 0) return 'today'
  if (days === 1) return '1 day ago'
  return `${days} days ago`
}

function formatViewerTime(minutes: number): string {
  if (minutes === 0) return '0m'
  if (minutes < 60) return `${minutes}m`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m > 0 ? `${h}h ${m}m` : `${h}h`
}

function buildMailto(to: string, cc: string[], subject: string, body: string): string {
  const parts = [
    `subject=${encodeURIComponent(subject)}`,
    `body=${encodeURIComponent(body)}`,
  ]
  if (cc.length) parts.push(`cc=${cc.map(encodeURIComponent).join(',')}`)
  return `mailto:${to}?${parts.join('&')}`
}

const MEMBER_COLORS = ['#3b82f6', '#f97316']

interface SparkChartProps {
  data: Record<string, string | number>[]
  memberIds: string[]
  title: string
  valueFormatter?: (v: number) => string
  memberNames: Record<string, string>
}

function SparkChart({ data, memberIds, title, valueFormatter, memberNames }: SparkChartProps) {
  // ~1 label per week regardless of total days
  const tickInterval = Math.max(1, Math.round(data.length / 7) - 1)

  return (
    <div>
      <p className="text-xl font-medium text-gray-600 mb-1">{title}</p>
      <ResponsiveContainer width="100%" height={135}>
        <LineChart data={data} margin={{ top: 4, right: 8, bottom: 0, left: 4 }}>
          <XAxis
            dataKey="date"
            tick={{ fontSize: 11, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={{ stroke: '#4b5563' }}
            interval={tickInterval}
            angle={-45}
            textAnchor="end"
            height={36}
          />
          <YAxis
            tick={{ fontSize: 13, fill: '#9ca3af' }}
            tickLine={false}
            axisLine={{ stroke: '#4b5563' }}
            allowDecimals={false}
            width={32}
          />
          <Tooltip
            contentStyle={{ fontSize: 12, padding: '4px 8px' }}
            formatter={(value) => [valueFormatter ? valueFormatter(Number(value)) : value]}
            labelFormatter={(label) => String(label)}
          />
          <Legend
            iconType="plainline"
            wrapperStyle={{ fontSize: 12, paddingTop: 4 }}
            formatter={(value) => memberNames[value] ?? value}
          />
          {memberIds.map((id, idx) => (
            <Line
              key={id}
              type="monotone"
              dataKey={id}
              stroke={MEMBER_COLORS[idx % MEMBER_COLORS.length]}
              strokeWidth={1.5}
              dot={false}
              activeDot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}

function GroupEffortPanel({ activity }: { activity: instructorApi.GroupActivity }) {
  const memberIds = activity.members.map(m => m.userId)
  const memberNames = Object.fromEntries(
    activity.members.map(m => [m.userId, `${m.firstName} ${m.lastName}`])
  )

  const makeRows = (series: (m: instructorApi.MemberActivity) => number[]) =>
    activity.days.map((day, i) => {
      const row: Record<string, string | number> = { date: day.slice(5).replace('-', '/') }
      activity.members.forEach(m => { row[m.userId] = series(m)[i] })
      return row
    })

  return (
    <div className="mt-3 space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <SparkChart
          data={makeRows(m => m.logins)}
          memberIds={memberIds}
          memberNames={memberNames}
          title="Logins"
        />
        <SparkChart
          data={makeRows(m => m.viewerMinutes)}
          memberIds={memberIds}
          memberNames={memberNames}
          title="Viewer time (min)"
          valueFormatter={formatViewerTime}
        />
        <SparkChart
          data={makeRows(m => m.messages)}
          memberIds={memberIds}
          memberNames={memberNames}
          title="Messages"
        />
      </div>
      <table className="text-sm border rounded overflow-hidden">
        <thead>
          <tr className="text-left text-xs text-gray-500 bg-gray-50">
            <th className="px-3 py-1.5 font-medium">Student</th>
            <th className="px-3 py-1.5 font-medium" title="PDFs uploaded to the group's research library">Papers uploaded</th>
            <th className="px-3 py-1.5 font-medium" title="Model files submitted via JSmol (includes revisions)">Model submissions</th>
          </tr>
        </thead>
        <tbody>
          {activity.members.map((m, idx) => (
            <tr key={m.userId} className="border-t">
              <td className="px-3 py-1.5 font-medium" style={{ color: MEMBER_COLORS[idx % MEMBER_COLORS.length] }}>
                {m.firstName} {m.lastName}
              </td>
              <td className="px-3 py-1.5 text-gray-600">{m.literatureCount}</td>
              <td className="px-3 py-1.5 text-gray-600">{m.submissionCount}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

const STATUS_STYLES: Record<string, string> = {
  SUBMITTED: 'bg-blue-100 text-blue-700',
  APPROVED: 'bg-green-100 text-green-700',
  NEEDS_REVISION: 'bg-amber-100 text-amber-700',
  DRAFT: 'bg-gray-100 text-gray-600',
}
const STATUS_LABELS: Record<string, string> = {
  SUBMITTED: 'Submitted',
  APPROVED: 'Approved',
  NEEDS_REVISION: 'Needs Revision',
  DRAFT: 'Draft',
}

export default function SummaryTab({ groups, onSelectGroup }: Props) {
  const [submissionMap, setSubmissionMap] = useState<Record<string, instructorApi.ModelWithSubmission[]>>({})
  const [loadingSubmissions, setLoadingSubmissions] = useState(true)
  const [collapsedGroups, setCollapsedGroups] = useState<Set<string>>(new Set())
  const [nudgeState, setNudgeState] = useState<Record<string, {
    open: boolean; loading: boolean; members: instructorApi.GroupMember[] | null
  }>>({})
  const [activityOpen, setActivityOpen] = useState<Record<string, boolean>>({})
  const [activityData, setActivityData] = useState<Record<string, instructorApi.GroupActivity | 'loading'>>({})

  const groupKey = groups.map(g => g.id).join(',')

  useEffect(() => {
    if (groups.length === 0) {
      setLoadingSubmissions(false)
      return
    }
    setCollapsedGroups(new Set(groups.map(g => g.id)))
    setLoadingSubmissions(true)
    Promise.all(groups.map(g => instructorApi.getGroupSubmissions(g.id)))
      .then(results => {
        const map: Record<string, instructorApi.ModelWithSubmission[]> = {}
        groups.forEach((g, i) => { map[g.id] = results[i] })
        setSubmissionMap(map)
      })
      .finally(() => setLoadingSubmissions(false))
  }, [groupKey]) // eslint-disable-line react-hooks/exhaustive-deps

  const toggleGroup = (groupId: string) =>
    setCollapsedGroups(prev => {
      const next = new Set(prev)
      next.has(groupId) ? next.delete(groupId) : next.add(groupId)
      return next
    })

  async function loadActivity(groupId: string) {
    if (activityData[groupId]) return
    setActivityData(prev => ({ ...prev, [groupId]: 'loading' }))
    try {
      const data = await instructorApi.getGroupActivity(groupId)
      setActivityData(prev => ({ ...prev, [groupId]: data }))
    } catch {
      setActivityData(prev => {
        const next = { ...prev }
        delete next[groupId]
        return next
      })
    }
  }

  function toggleActivity(groupId: string) {
    const opening = !activityOpen[groupId]
    setActivityOpen(prev => ({ ...prev, [groupId]: opening }))
    if (opening) loadActivity(groupId)
  }

  const toggleNudge = async (groupId: string) => {
    const current = nudgeState[groupId]
    if (current?.members) {
      // Already loaded — just toggle visibility via open flag
      setNudgeState(prev => ({ ...prev, [groupId]: { ...prev[groupId], open: !prev[groupId].open } }))
      return
    }
    setNudgeState(prev => ({ ...prev, [groupId]: { open: true, loading: true, members: null } }))
    const details = await instructorApi.getGroup(groupId)
    setNudgeState(prev => ({
      ...prev,
      [groupId]: { open: true, loading: false, members: details.members.map(m => m.user) }
    }))
  }

  if (groups.length === 0) {
    return (
      <div className="flex-1 flex items-center justify-center text-gray-500">
        No groups found.
      </div>
    )
  }

  return (
    <div className="p-6">
      <div className="flex items-center gap-3 mb-6">
        <h2 className="text-xl font-semibold text-gray-800">
          Overview — All Groups ({groups.length})
        </h2>
        <button
          onClick={() => {
            const allExpanded = collapsedGroups.size === 0
            setCollapsedGroups(allExpanded ? new Set(groups.map(g => g.id)) : new Set())
          }}
          className="text-xs text-gray-500 border border-gray-300 rounded px-2 py-1 hover:bg-gray-100 transition-colors"
        >
          {collapsedGroups.size === 0 ? 'Collapse all' : 'Expand all'}
        </button>
      </div>
      <div className="grid grid-cols-2 3xl:grid-cols-3 gap-6 items-start">
      {groups.map(group => {
        const models = submissionMap[group.id] ?? []
        const total = group.activeTemplateCount
        const isCollapsed = collapsedGroups.has(group.id)

        const timestamps = models.flatMap(m => m.submission ? [m.submission.updatedAt] : [])
        const lastActivity = timestamps.length > 0
          ? timeAgo(timestamps.reduce((a, b) => a > b ? a : b))
          : null

        const nudge = nudgeState[group.id]
        const students = (nudge?.members ?? []).filter(m => m.role === 'STUDENT')
        const teacherCc = group.teacherEmail ? [group.teacherEmail] : []
        const teacherNote = group.teacherName
          ? `\n\n(CC'ing your teacher, ${group.teacherName}.)`
          : ''

        return (
          <div key={group.id} className="bg-white rounded-lg shadow overflow-hidden">

            {/* ── Always-visible header (click to expand/collapse) ── */}
            <button
              className="w-full text-left px-5 pt-5 pb-4 hover:bg-gray-50 transition-colors"
              onClick={() => toggleGroup(group.id)}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-center gap-2 min-w-0">
                  <svg
                    className={`w-4 h-4 shrink-0 text-gray-400 transition-transform ${isCollapsed ? '-rotate-90' : ''}`}
                    fill="none" stroke="currentColor" viewBox="0 0 24 24"
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                  </svg>
                  <div className="min-w-0">
                    <h3 className="text-lg font-semibold text-gray-800">{group.name}</h3>
                    <p className="text-sm text-gray-500">
                      {group.proteinName} · {group.proteinPdbId} · {group.memberCount} members
                      {group.teacherName && ` · Teacher: ${group.teacherName}`}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  {group.unreadMessageCount > 0 && (
                    <span className="text-xs bg-red-100 text-red-600 px-2 py-0.5 rounded-full">
                      {group.unreadMessageCount} unread
                    </span>
                  )}
                  {lastActivity && (
                    <span className="text-xs text-gray-400">Last activity: {lastActivity}</span>
                  )}
                </div>
              </div>
              {total > 0 && (
                <div className="mt-2 pl-6 flex items-center gap-2 flex-wrap">
                  {loadingSubmissions ? (
                    <span className="text-xs text-gray-400">Loading…</span>
                  ) : (() => {
                    const noSub = models.filter(m => !m.submission).length
                    const draft = models.filter(m => m.submission?.status === 'DRAFT').length
                    const submitted = models.filter(m => m.submission?.status === 'SUBMITTED' || m.submission?.status === 'NEEDS_REVISION').length
                    const approved = models.filter(m => m.submission?.status === 'APPROVED').length
                    const pills: { label: string; count: number; className: string }[] = [
                      { label: 'No submission', count: noSub, className: 'bg-gray-100 text-gray-500' },
                      { label: 'Draft', count: draft, className: 'bg-gray-200 text-gray-600' },
                      { label: 'Submitted', count: submitted, className: 'bg-blue-100 text-blue-700' },
                      { label: 'Approved', count: approved, className: 'bg-green-100 text-green-700' },
                    ]
                    return pills.filter(p => p.count > 0).map(p => (
                      <span key={p.label} className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.className}`}>
                        {p.count} {p.label}
                      </span>
                    ))
                  })()}
                </div>
              )}
            </button>

            {/* ── Expandable body ── */}
            {!isCollapsed && (
              <div className="border-t">

                {/* Student Effort — sub-collapsible */}
                <div className="border-b">
                  <button
                    className="w-full flex items-center gap-2 px-5 py-3 text-sm font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-50 transition-colors"
                    onClick={() => toggleActivity(group.id)}
                  >
                    <svg
                      className={`w-4 h-4 shrink-0 transition-transform ${activityOpen[group.id] ? '' : '-rotate-90'}`}
                      fill="none" stroke="currentColor" viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    Student Effort
                  </button>
                  {activityOpen[group.id] && (
                    <div className="px-5 pb-5">
                      {activityData[group.id] === 'loading'
                        ? <p className="text-sm text-gray-400">Loading...</p>
                        : activityData[group.id]
                          ? <GroupEffortPanel activity={activityData[group.id] as instructorApi.GroupActivity} />
                          : null}
                    </div>
                  )}
                </div>

                {/* Model Submissions */}
                <div>
                  {loadingSubmissions ? (
                    <div className="px-5 py-4 text-sm text-gray-400">Loading submissions...</div>
                  ) : (
                    <table className="w-full text-sm">
                      <tbody>
                        {models.map(model => (
                          <tr
                            key={model.id}
                            className="border-b border-gray-50 last:border-0 cursor-pointer hover:bg-blue-50 transition-colors"
                            onClick={() => onSelectGroup(group.id)}
                          >
                            <td className="px-5 py-2.5 font-medium text-gray-700 w-2/5">
                              <div className="flex items-center gap-2">
                                {model.name}
                                {(model.submission?.unreadCount ?? 0) > 0 && (
                                  <span className="inline-flex items-center justify-center min-w-5 h-5 px-1.5 text-xs font-semibold bg-red-500 text-white rounded-full">
                                    {model.submission!.unreadCount}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="px-5 py-2.5">
                              {model.submission ? (
                                <span className={`text-xs px-2 py-0.5 rounded-full ${STATUS_STYLES[model.submission.status] ?? STATUS_STYLES.DRAFT}`}>
                                  {STATUS_LABELS[model.submission.status] ?? model.submission.status}
                                </span>
                              ) : (
                                <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-400">
                                  Not submitted
                                </span>
                              )}
                            </td>
                            <td className="px-5 py-2.5 text-gray-400 text-xs">
                              {model.submission
                                ? timeAgo(model.submission.status === 'NEEDS_REVISION'
                                    ? model.submission.updatedAt
                                    : model.submission.createdAt)
                                : '—'}
                            </td>
                            <td className="px-5 py-2.5 text-gray-500 text-xs">
                              {model.submission
                                ? `${model.submission.submittedBy.firstName} ${model.submission.submittedBy.lastName}`
                                : ''}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}

                  {/* Nudge students — inline below submissions */}
                  <div className="px-5 py-3 border-t bg-gray-50">
                    {!nudge?.members ? (
                      <button
                        onClick={() => toggleNudge(group.id)}
                        className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-blue-600 transition-colors"
                      >
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                        </svg>
                        {nudge?.loading ? 'Loading…' : 'Nudge students'}
                      </button>
                    ) : students.length === 0 ? (
                      <p className="text-sm text-gray-400">No students in this group.</p>
                    ) : (
                      <div className="flex flex-wrap items-center gap-3">
                        <a
                          href={buildMailto(
                            students[0].email,
                            [...students.slice(1).map(s => s.email), ...teacherCc],
                            `${group.name} — Protein Modeling Check-in`,
                            `Hi ${students[0].firstName} and ${students[1]?.firstName ?? students[0].firstName},\n\nBest,${teacherNote}`
                          )}
                          className="inline-flex items-center gap-1.5 text-sm bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 transition-colors"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                          </svg>
                          Email all
                        </a>
                        {group.teacherEmail && (
                          <span className="text-xs text-gray-400">CC: {group.teacherName ?? group.teacherEmail}</span>
                        )}
                        <span className="text-gray-300">|</span>
                        {students.map(student => (
                          <a
                            key={student.id}
                            href={buildMailto(
                              student.email,
                              teacherCc,
                              `${group.name} — Protein Modeling Check-in`,
                              `Hi ${student.firstName},\n\nBest,${teacherNote}`
                            )}
                            className="inline-flex items-center gap-1 text-sm text-gray-600 hover:text-blue-600 transition-colors"
                            title={student.email}
                          >
                            <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                            {student.firstName} {student.lastName}
                          </a>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

              </div>
            )}
          </div>
        )
      })}
      </div>
    </div>
  )
}
