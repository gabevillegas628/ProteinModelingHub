const API_BASE = '/modeling/api/student';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');

  const headers: HeadersInit = {
    ...options.headers
  };

  // Don't set Content-Type for FormData (browser will set it with boundary)
  if (!(options.body instanceof FormData)) {
    (headers as Record<string, string>)['Content-Type'] = 'application/json';
  }

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
}

export interface ModelTemplate {
  id: string;
  name: string;
  description: string | null;
  orderIndex: number;
  isActive: boolean;
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
  unreadCount?: number;
}

export interface ModelWithSubmission extends ModelTemplate {
  submission: Submission | null;
}

export interface ModelsResponse {
  group: Group;
  models: ModelWithSubmission[];
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
// Group
// ============================================

export function getGroup(): Promise<Group> {
  return request('/group');
}

export interface UpdateGroupParams {
  proteinPdbId?: string;
  proteinName?: string;
}

export function updateGroup(params: UpdateGroupParams): Promise<Group> {
  return request('/group', {
    method: 'PUT',
    body: JSON.stringify(params)
  });
}

// ============================================
// Models & Submissions
// ============================================

export function getModels(): Promise<ModelsResponse> {
  return request('/models');
}

export async function uploadModel(templateId: string, file: File): Promise<Submission> {
  const formData = new FormData();
  formData.append('file', file);

  return request(`/models/${templateId}/upload`, {
    method: 'POST',
    body: formData
  });
}

export function getModelFileUrl(submissionId: string): string {
  const token = localStorage.getItem('token');
  // Add .png extension so JSmol can detect the file type from the URL
  return `${API_BASE}/models/file/${submissionId}.png?token=${token}`;
}

// ============================================
// Literature
// ============================================

export function getLiterature(): Promise<Literature[]> {
  return request('/literature');
}

export async function uploadLiterature(file: File, title: string, description?: string): Promise<Literature> {
  const formData = new FormData();
  formData.append('file', file);
  formData.append('title', title);
  if (description) {
    formData.append('description', description);
  }

  return request('/literature', {
    method: 'POST',
    body: formData
  });
}

export function getLiteratureFileUrl(id: string): string {
  const token = localStorage.getItem('token');
  return `${API_BASE}/literature/file/${id}?token=${token}`;
}

export function deleteLiterature(id: string): Promise<{ success: boolean }> {
  return request(`/literature/${id}`, { method: 'DELETE' });
}

// ============================================
// Review Request
// ============================================

export interface ReviewStatus {
  lastReviewRequestedAt: string | null;
  canRequest: boolean;
  cooldownEndsAt: string | null;
}

export interface ReviewRequestResponse {
  success: boolean;
  message: string;
  lastReviewRequestedAt: string;
}

export function getReviewStatus(): Promise<ReviewStatus> {
  return request('/review-status');
}

export function requestReview(): Promise<ReviewRequestResponse> {
  return request('/request-review', { method: 'POST' });
}
