const API_BASE = 'http://localhost:3001/api';

// BUG-026 (Medium / Security): Token retrieved from localStorage which is
// readable by any JavaScript on the page. An XSS attack can steal it.
// Prefer httpOnly cookies managed by the server.
function getToken(): string {
  return localStorage.getItem('token') || '';
}

// BUG-022 (Medium / TypeScript): Return type is `any` — callers get no type
// help and errors are silently lost.
async function request(endpoint: string, options: RequestInit = {}): Promise<any> {
  const token = getToken();

  const response = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...options.headers,
    },
  });

  // BUG-017 (Medium / Logic): Non-2xx responses are not detected. A 401, 403,
  // or 500 will silently return the error JSON as if it were success data.
  const data = await response.json();
  return data;
}

export const api = {
  getTasks:   ()                       => request('/tasks'),
  createTask: (task: any)              => request('/tasks', { method: 'POST', body: JSON.stringify(task) }),
  updateTask: (id: number, task: any)  => request(`/tasks/${id}`, { method: 'PUT',  body: JSON.stringify(task) }),
  deleteTask: (id: number)             => request(`/tasks/${id}`, { method: 'DELETE' }),
  getStats:   ()                       => request('/tasks/stats'),

  login:    (email: string, password: string) =>
    request('/users/login', { method: 'POST', body: JSON.stringify({ email, password }) }),
  register: (name: string, email: string, password: string) =>
    request('/users/register', { method: 'POST', body: JSON.stringify({ name, email, password }) }),

  getUser: (id: number) => request(`/users/${id}`),

  // BUG-028 (Medium / Logic): Query parameter is not URL-encoded. A search
  // term like "O'Brien" or "&admin=1" will corrupt the URL.
  searchUsers: (q: string) => request(`/users/search?q=${q}`),
};
