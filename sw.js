// 앱 화면 파일을 휴대폰에 저장해 두어, 인터넷이 약한 곳에서도 일정이 열리게 해요.
// 파일을 고친 뒤에는 VERSION 숫자를 하나 올려 주세요.
var VERSION = 'jeju-v2';
var SHELL = ['./', 'index.html', 'styles.css', 'app.js', 'data.js', 'config.js', 'manifest.webmanifest', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/apple-touch-icon.png'];

self.addEventListener('install', function (e) {
  e.waitUntil(caches.open(VERSION).then(function (c) { return c.addAll(SHELL); }).then(function () { return self.skipWaiting(); }));
});

self.addEventListener('activate', function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    return Promise.all(keys.filter(function (k) { return k !== VERSION; }).map(function (k) { return caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

// 같은 주소의 파일: 인터넷 먼저, 안 되면 저장해 둔 것 (항상 최신 일정이 보이도록)
self.addEventListener('fetch', function (e) {
  var req = e.request;
  if (req.method !== 'GET' || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(function (res) {
      var copy = res.clone();
      caches.open(VERSION).then(function (c) { c.put(req, copy); });
      return res;
    }).catch(function () {
      return caches.match(req).then(function (hit) { return hit || caches.match('index.html'); });
    })
  );
});
