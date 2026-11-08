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

/*
 * AVISOS NO CELULAR (push). A mensagem é genérica (sem nome de criança, endereço ou mapa): ver push.ts.
 * Aqui só mostramos o que o servidor mandou, com limite de tamanho, e abrimos o app ao tocar.
 */
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = {}; }
  const texto = (v, max, padrao) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : padrao);
  event.waitUntil(
    self.registration.showNotification(texto(d.titulo, 80, 'VanEscolar'), {
      body: texto(d.corpo, 160, 'Abra o app para ver.'),
      tag: texto(d.tag, 40, 'vanescolar'),
      renotify: true,
      icon: '/icons/icon-192.png',
      badge: '/icons/icon-192.png'
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((janelas) => {
      const aberta = janelas.find((j) => new URL(j.url).origin === self.location.origin);
      return aberta ? aberta.focus() : self.clients.openWindow('/');
    })
  );
});
