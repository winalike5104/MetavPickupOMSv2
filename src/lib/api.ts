export async function apiFetch(url: string, options: RequestInit = {}) {
  const token = localStorage.getItem('your_app_token');
  const headers = {
    'Content-Type': 'application/json',
    ...(token ? { 'x-custom-auth-token': `Bearer ${token}` } : {}),
    ...options.headers,
  };

  const response = await fetch(url, { ...options, headers });

  if (response.status === 401) {
    // Unauthorized - clear token and redirect to login
    localStorage.removeItem('your_app_token');
    localStorage.removeItem('user_info');
    window.location.href = '/login';
    throw new Error('Unauthorized');
  }

  return response;
}
