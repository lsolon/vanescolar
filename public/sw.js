/*
 * Service worker do VanEscolar.
 * PRIVACIDADE: nunca guarda respostas da API (/api/*), onde ficam dados de crianças, GPS e cobranças.
 * Só guarda o "esqueleto" do app (arquivos estáticos) e uma página de aviso para quando estiver sem internet.
 */
const VERSAO = 'vanescolar-v1';
const OFFLINE = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(VERSAO).then((c) => c.addAll([OFFLINE, '/icons/icon-192.png'])).then(() => self.skipWaiting()));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((nomes) => Promise.all(nomes.filter((n) => n !== VERSAO).map((n) => caches.delete(n))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;           // mapas, fontes e Firebase: direto na rede
  if (url.pathname.startsWith('/api/')) return;              // dados do app: nunca em cache

  // Abrir o app: sempre a versão mais nova; sem internet, mostra a página de aviso.
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => caches.match(OFFLINE)));
    return;
  }

  // Arquivos estáticos com nome versionado (/assets/*) e ícones: cache primeiro, atualiza em segundo plano.
  if (url.pathname.startsWith('/assets/') || url.pathname.startsWith('/icons/')) {
    event.respondWith(
      caches.open(VERSAO).then(async (cache) => {
        const guardado = await cache.match(req);
        const rede = fetch(req).then((res) => { if (res.ok) cache.put(req, res.clone()); return res; }).catch(() => guardado);
        return guardado || rede;
      })
    );
  }
});
