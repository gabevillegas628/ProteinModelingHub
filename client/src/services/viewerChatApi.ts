const API_BASE = '/modeling/api/viewer-chat';

async function request<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
  const token = localStorage.getItem('token');
  const headers: HeadersInit = { 'Content-Type': 'application/json', ...options.headers };
  if (token) (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;

  const response = await fetch(`${API_BASE}${endpoint}`, { ...options, headers });
  if (!response.ok) {
    const error = await response.json().catch(() => ({ error: 'Request failed' }));
    throw new Error(error.error || 'Request failed');
  }
  return response.json();
}

export interface ViewerChatMessage {
  id: string;
  groupId: string;
  modelTemplateId: string;
  userId: string;
  content: string;
  createdAt: string;
  user: {
    id: string;
    firstName: string;
    lastName: string;
    role: string;
  };
}

export function getViewerChat(groupId: string, templateId: string): Promise<ViewerChatMessage[]> {
  return request(`/${groupId}/${templateId}`);
}

export function postViewerChat(groupId: string, templateId: string, content: string): Promise<ViewerChatMessage> {
  return request(`/${groupId}/${templateId}`, {
    method: 'POST',
    body: JSON.stringify({ content }),
  });
}
