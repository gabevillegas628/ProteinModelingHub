const API_BASE = '/modeling/api/instructor';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

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
  memberCount: number;
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

// ============================================
// Groups
// ============================================

export function getGroups(): Promise<Group[]> {
  return request('/groups');
}

export function getGroup(groupId: string): Promise<GroupDetails> {
  return request(`/groups/${groupId}`);
}

// ============================================
// Submissions
// ============================================

export function getGroupSubmissions(groupId: string): Promise<ModelWithSubmission[]> {
  return request(`/groups/${groupId}/submissions`);
}

export function getSubmissionFileUrl(submissionId: string): string {
  const token = localStorage.getItem('token');
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
  const token = localStorage.getItem('token');
  return `${API_BASE}/literature/file/${id}?token=${token}`;
}
