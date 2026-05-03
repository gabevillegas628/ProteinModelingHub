const API_BASE = '/modeling/api/instructor';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('modeling_token');

  const headers: HeadersInit = {
    'Content-Type': 'application/json',
    ...options.headers
  };

  if (token) {
    (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }

  return response.json();
}

// ============================================
// Types
// ============================================

export interface Group {
  id: string;
  name: string;
  proteinPdbId: string;
  proteinName: string;
  createdAt: string;
  submissionCount: number;
  pendingCount: number;
  activeTemplateCount: number;
  memberCount: number;
  unreadMessageCount: number;
  readyForPrinting: string | null;
  schoolName?: string | null;
  teacherName?: string;
  teacherEmail?: string;
}

export interface GroupMember {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
}

export interface GroupDetails extends Omit<Group, 'submissionCount' | 'pendingCount' | 'memberCount'> {
  members: {
    user: GroupMember;
  }[];
}

export interface Submission {
  id: string;
  groupId: string;
  modelTemplateId: string;
  submittedById: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  status: 'DRAFT' | 'SUBMITTED' | 'NEEDS_REVISION' | 'APPROVED';
  feedback: string | null;
  createdAt: string;
  updatedAt: string;
  submittedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  unreadCount?: number;
}

export interface ModelTemplate {
  id: string;
  name: string;
  description: string | null;
  orderIndex: number;
  isActive: boolean;
}

export interface ModelWithSubmission extends ModelTemplate {
  submission: Submission | null;
}

export interface Literature {
  id: string;
  groupId: string;
  uploadedById: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  description: string | null;
  createdAt: string;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
}

export interface Presentation {
  id: string;
  groupId: string;
  uploadedById: string;
  title: string;
  fileName: string;
  filePath: string;
  fileSize: number | null;
  slideCount: number | null;
  description: string | null;
  createdAt: string;
  uploadedBy: {
    id: string;
    firstName: string;
    lastName: string;
  };
  group: {
    id: string;
    name: string;
    proteinPdbId: string;
    schoolName: string | null;
  };
}

// ============================================
// Groups
// ============================================

export interface MessageThread {
  groupId: string;
  groupName: string;
  proteinPdbId: string;
  submissionId: string | null;
  label: string;
  latestMessage: {
    content: string;
    createdAt: string;
    user: { firstName: string; lastName: string };
  };
  unreadCount: number;
}

export function getGroups(): Promise<Group[]> {
  return request('/groups');
}

export function getMessageThreads(): Promise<MessageThread[]> {
  return request('/messages/threads');
}

export function getGroup(groupId: string): Promise<GroupDetails> {
  return request(`/groups/${groupId}`);
}

export function updateGroupPrintingStatus(
  groupId: string,
  readyForPrinting: boolean
): Promise<{ readyForPrinting: string | null }> {
  return request(`/groups/${groupId}/printing-status`, {
    method: 'PATCH',
    body: JSON.stringify({ readyForPrinting })
  });
}

// ============================================
// Submissions
// ============================================

export function getGroupSubmissions(groupId: string): Promise<ModelWithSubmission[]> {
  return request(`/groups/${groupId}/submissions`);
}

export function getSubmissionFileUrl(submissionId: string): string {
  const token = localStorage.getItem('modeling_token');
  // Add .png extension so JSmol can detect the file type from the URL
  return `${API_BASE}/submissions/file/${submissionId}.png?token=${token}`;
}

export function updateSubmission(
  submissionId: string,
  data: { status?: string; feedback?: string }
): Promise<Submission> {
  return request(`/submissions/${submissionId}`, {
    method: 'PATCH',
    body: JSON.stringify(data)
  });
}

// ============================================
// Literature
// ============================================

export function getGroupLiterature(groupId: string): Promise<Literature[]> {
  return request(`/groups/${groupId}/literature`);
}

export function getLiteratureFileUrl(id: string): string {
  const token = localStorage.getItem('modeling_token');
  return `${API_BASE}/literature/file/${id}?token=${token}`;
}

export async function uploadLiterature(
  groupId: string,
  file: File,
  title: string,
  description?: string
): Promise<Literature> {
  const token = localStorage.getItem('modeling_token');
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  if (description) formData.append('description', description);

  const response = await fetch(`${API_BASE}/groups/${groupId}/literature`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Upload failed' }));
    throw new Error(error.error || 'Upload failed');
  }

  return response.json();
}

export function deleteLiterature(id: string): Promise<{ success: boolean }> {
  return request(`/literature/${id}`, { method: 'DELETE' });
}

// ============================================
// Presentations
// ============================================

export function getAllPresentations(): Promise<Presentation[]> {
  return request('/presentations/all');
}

export function getPresentationFileUrl(id: string, filename?: string): string {
  const token = localStorage.getItem('modeling_token');
  const base = `${API_BASE}/presentations/file/${id}?token=${token}`;
  return filename ? `${base}&filename=${encodeURIComponent(filename)}` : base;
}

export interface MemberActivity {
  userId: string;
  firstName: string;
  lastName: string;
  literatureCount: number;
  submissionCount: number;
  // Parallel arrays aligned to GroupActivity.days
  logins: number[];
  viewerMinutes: number[];
  messages: number[];
}

export interface GroupActivity {
  days: string[];         // "YYYY-MM-DD", 30 entries oldest→newest
  members: MemberActivity[];
}

export function getGroupActivity(groupId: string): Promise<GroupActivity> {
  return request(`/groups/${groupId}/activity`);
}

// ============================================
// 3D Printing
// ============================================

export interface PrintTemplate extends ModelTemplate {
  submission: Submission;
}

export interface PrintGroup extends Omit<Group, 'submissionCount' | 'pendingCount' | 'memberCount' | 'unreadMessageCount' | 'activeTemplateCount'> {
  templates: PrintTemplate[];
}

export function getPrintGroups(): Promise<PrintGroup[]> {
  return request('/print/groups');
}

export async function convertX3dTo3mf(x3dFile: File, _outputName: string): Promise<Blob> {
  const token = localStorage.getItem('modeling_token');
  const formData = new FormData();
  formData.append('file', x3dFile);

  const response = await fetch(`${API_BASE}/print/convert`, {
    method: 'POST',
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    body: formData
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Conversion failed' }));
    throw new Error(error.error || 'Conversion failed');
  }

  return response.blob();
}
