const form = document.querySelector('#video-form');
const input = document.querySelector('#video-url');
const error = document.querySelector('#form-error');
const result = document.querySelector('#result');
const thumbnail = document.querySelector('#video-thumbnail');
const openYoutube = document.querySelector('#open-youtube');
const copyButton = document.querySelector('#copy-clean');
const pasteButton = document.querySelector('#paste-button');
const toast = document.querySelector('#toast');

let cleanUrl = '';
let toastTimer;
const { extractVideoId } = window.AulaOffline;

function showToast(message) {
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
}

function prepareVideo(value) {
  const id = extractVideoId(value);
  if (!id) {
    error.textContent = 'Introduce un enlace válido de YouTube, youtu.be o YouTube Shorts.';
    result.hidden = true;
    input.setAttribute('aria-invalid', 'true');
    input.focus();
    return;
  }

  cleanUrl = `https://www.youtube.com/watch?v=${id}`;
  error.textContent = '';
  input.removeAttribute('aria-invalid');
  input.value = cleanUrl;
  thumbnail.src = `https://i.ytimg.com/vi/${id}/hqdefault.jpg`;
  openYoutube.href = cleanUrl;
  result.hidden = false;
  result.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  prepareVideo(input.value);
});

pasteButton.addEventListener('click', async () => {
  try {
    const text = await navigator.clipboard.readText();
    input.value = text;
    prepareVideo(text);
  } catch {
    input.focus();
    showToast('Pega el enlace en el campo');
  }
});

copyButton.addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText(cleanUrl);
    showToast('Enlace limpio copiado');
  } catch {
    input.select();
    document.execCommand('copy');
    showToast('Enlace limpio copiado');
  }
});

input.addEventListener('input', () => {
  if (error.textContent) {
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  }
});

thumbnail.addEventListener('error', () => {
  thumbnail.removeAttribute('src');
  thumbnail.alt = 'No se pudo cargar la miniatura del vídeo';
});

document.querySelector('#year').textContent = new Date().getFullYear();
