import { api, clearToken, getToken } from './api.js';
import { el } from './dom.js';

export async function currentUser() {
  if (!getToken()) return null;
  try {
    const { user } = await api('/api/auth/me');
    return user;
  } catch {
    clearToken();
    return null;
  }
}

export function mountHeader(user) {
  const slot = document.querySelector('[data-user]');
  if (slot) {
    const role = user.role === 'admin' ? 'администратор' : 'респондент';
    slot.textContent = `${user.name} · ${role}`;
  }
  document.querySelector('[data-logout]')?.addEventListener('click', () => {
    clearToken();
    location.assign('/');
  });
}

export async function requireUser() {
  const user = await currentUser();
  if (!user) {
    location.assign('/');
    return null;
  }
  mountHeader(user);
  return user;
}

export async function requireAdmin() {
  const user = await requireUser();
  if (!user) return null;
  if (user.role !== 'admin') {
    document.querySelector('main')?.replaceChildren(
      el('p', {}, 'Управлять опросами может только администратор. Пройти опрос можно по публичной ссылке без входа.'),
    );
    return null;
  }
  return user;
}
