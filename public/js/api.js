const TOKEN_KEY = 'surveys_token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export async function api(path, { method = 'GET', body, auth = true } = {}) {
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && getToken()) headers.Authorization = `Bearer ${getToken()}`;

  let response;
  try {
    response = await fetch(path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new Error('Нет связи с сервером');
  }

  if (response.status === 204) return null;

  const isJson = (response.headers.get('content-type') || '').includes('application/json');
  const payload = isJson ? await response.json() : null;
  if (!response.ok) {
    if (auth && response.status === 401) clearToken();
    const error = new Error(payload?.error || 'Ошибка запроса');
    error.status = response.status;
    throw error;
  }
  return payload;
}

export async function download(path, fallbackName) {
  const headers = {};
  if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
  const response = await fetch(path, { headers });
  if (!response.ok) {
    let message = 'Не удалось скачать файл';
    try {
      const payload = await response.json();
      if (payload?.error) message = payload.error;
    } catch {
      // ответ без JSON
    }
    throw new Error(message);
  }

  const match = (response.headers.get('content-disposition') || '').match(/filename="([^"]+)"/);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = match?.[1] || fallbackName;
  document.body.append(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
