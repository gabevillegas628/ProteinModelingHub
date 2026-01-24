const API_BASE = '/api/admin';

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

export interface ModelTemplate {
  id: string;
  name: string;
  description: string | null;
  orderIndex: number;
  isActive: boolean;
  createdAt: string;
}

export interface GroupMember {
  id: string;
  userId: string;
  joinedAt: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string;
  };
}

export interface Group {
  id: string;
  name: string;
  proteinPdbId: string;
  proteinName: string;
  createdAt: string;
  members: GroupMember[];
}

export interface User {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  role: 'ADMIN' | 'INSTRUCTOR' | 'STUDENT';
  isApproved: boolean;
  createdAt: string;
  groupMemberships?: {
    group: { id: string; name: string };
  }[];
}

// ============================================
// Model Templates
// ============================================

export function getModelTemplates(): Promise<ModelTemplate[]> {
  return request('/model-templates');
}

export function createModelTemplate(data: { name: string; description?: string }): Promise<ModelTemplate> {
  return request('/model-templates', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function updateModelTemplate(id: string, data: Partial<ModelTemplate>): Promise<ModelTemplate> {
  return request(`/model-templates/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export function deleteModelTemplate(id: string): Promise<{ success: boolean }> {
  return request(`/model-templates/${id}`, { method: 'DELETE' });
}

export function reorderModelTemplates(orderedIds: string[]): Promise<{ success: boolean }> {
  return request('/model-templates/reorder', {
    method: 'POST',
    body: JSON.stringify({ orderedIds })
  });
}

// ============================================
// Groups
// ============================================

export function getGroups(): Promise<Group[]> {
  return request('/groups');
}

export function createGroup(data: { name: string; proteinPdbId: string; proteinName: string }): Promise<Group> {
  return request('/groups', {
    method: 'POST',
    body: JSON.stringify(data)
  });
}

export function updateGroup(id: string, data: Partial<Group>): Promise<Group> {
  return request(`/groups/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export function deleteGroup(id: string): Promise<{ success: boolean }> {
  return request(`/groups/${id}`, { method: 'DELETE' });
}

export interface CsvUploadResult {
  success: boolean;
  created: number;
  total: number;
  errors?: string[];
}

export function uploadGroupsCsv(csvData: string): Promise<CsvUploadResult> {
  return request('/groups/upload-csv', {
    method: 'POST',
    body: JSON.stringify({ csvData })
  });
}

export function addGroupMember(groupId: string, userId: string): Promise<GroupMember> {
  return request(`/groups/${groupId}/members`, {
    method: 'POST',
    body: JSON.stringify({ userId })
  });
}

export function removeGroupMember(groupId: string, userId: string): Promise<{ success: boolean }> {
  return request(`/groups/${groupId}/members/${userId}`, { method: 'DELETE' });
}

// ============================================
// Users
// ============================================

export function getUsers(): Promise<User[]> {
  return request('/users');
}

export function getPendingUsers(): Promise<User[]> {
  return request('/users/pending');
}

export function approveUser(id: string): Promise<User> {
  return request(`/users/${id}/approve`, { method: 'POST' });
}

export function updateUser(id: string, data: Partial<User> & { password?: string }): Promise<User> {
  return request(`/users/${id}`, {
    method: 'PUT',
    body: JSON.stringify(data)
  });
}

export function deleteUser(id: string): Promise<{ success: boolean }> {
  return request(`/users/${id}`, { method: 'DELETE' });
}
