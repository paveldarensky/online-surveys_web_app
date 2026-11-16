import { api, setToken } from './api.js';
import { clearError, showError } from './dom.js';
import { currentUser } from './session.js';

const loginForm = document.querySelector('#login');
const registerForm = document.querySelector('#register');

for (const button of document.querySelectorAll('[data-tab]')) {
  button.addEventListener('click', () => {
    const register = button.dataset.tab === 'register';
    loginForm.hidden = register;
    registerForm.hidden = !register;
    for (const tab of document.querySelectorAll('[data-tab]')) {
      tab.classList.toggle('active', tab === button);
    }
    clearError();
  });
}

async function enter(result) {
  setToken(result.token);
  location.assign('/surveys.html');
}

loginForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const data = new FormData(loginForm);
  try {
    const result = await api('/api/auth/login', {
      method: 'POST',
      auth: false,
      body: { email: data.get('email'), password: data.get('password') },
    });
    await enter(result);
  } catch (error) {
    showError(error);
  }
});

registerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const data = new FormData(registerForm);
  try {
    const result = await api('/api/auth/register', {
      method: 'POST',
      auth: false,
      body: {
        name: data.get('name'),
        email: data.get('email'),
        password: data.get('password'),
      },
    });
    await enter(result);
  } catch (error) {
    showError(error);
  }
});

const user = await currentUser();
if (user) location.assign('/surveys.html');
