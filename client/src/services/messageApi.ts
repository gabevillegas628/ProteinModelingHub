const API_BASE = '/api/messages';

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

export interface MessageUser {
  id: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
}

export interface Message {
  id: string;
  groupId: string;
  userId: string;
  submissionId: string | null;
  content: string;
  createdAt: string;
  user: MessageUser;
}

// ============================================
// Group Chat
// ============================================

export function getGroupMessages(groupId: string): Promise<Message[]> {
  return request(`/group/${groupId}`);
}

export function postGroupMessage(groupId: string, content: string): Promise<Message> {
  return request(`/group/${groupId}`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}

// ============================================
// Submission Comments
// ============================================

export function getSubmissionComments(submissionId: string): Promise<Message[]> {
  return request(`/submission/${submissionId}`);
}

export function postSubmissionComment(submissionId: string, content: string): Promise<Message> {
  return request(`/submission/${submissionId}`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
}
