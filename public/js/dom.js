export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === undefined || value === null) continue;
    if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else node.setAttribute(key, value);
  }
  for (const child of [].concat(children)) {
    if (child === null || child === undefined || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function showError(error) {
  const node = document.querySelector('[data-error]');
  if (!node) return;
  node.hidden = false;
  node.textContent = error?.message || 'Неизвестная ошибка';
}

export function clearError() {
  const node = document.querySelector('[data-error]');
  if (!node) return;
  node.hidden = true;
  node.textContent = '';
}

export const STATUS_LABEL = {
  draft: 'Черновик',
  published: 'Опубликован',
  closed: 'Закрыт',
};

export const TYPE_LABEL = {
  single: 'Один вариант',
  multi: 'Несколько вариантов',
  text: 'Текст',
  scale: 'Шкала',
};
