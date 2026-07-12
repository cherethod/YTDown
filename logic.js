(function exposeVideoTools(scope) {
  function extractVideoId(value) {
    const candidate = String(value || '').trim();
    if (!candidate) return null;

    try {
      const url = new URL(candidate.startsWith('http') ? candidate : `https://${candidate}`);
      const host = url.hostname.replace(/^www\./, '').replace(/^m\./, '');
      let id = null;

      if (host === 'youtu.be') id = url.pathname.split('/').filter(Boolean)[0];
      if (host === 'youtube.com' || host.endsWith('.youtube.com')) {
        if (url.pathname === '/watch') id = url.searchParams.get('v');
        if (url.pathname.startsWith('/shorts/') || url.pathname.startsWith('/embed/') || url.pathname.startsWith('/live/')) {
          id = url.pathname.split('/').filter(Boolean)[1];
        }
      }

      return id && /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null;
    } catch {
      return null;
    }
  }

  scope.AulaOffline = { extractVideoId };
  if (typeof module !== 'undefined' && module.exports) module.exports = scope.AulaOffline;
})(typeof window !== 'undefined' ? window : globalThis);
