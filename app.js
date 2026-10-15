/* 제주 가을여행 앱 — 화면과 동작 전부 (빌드 도구 없이 바로 동작) */
(function () {
  'use strict';

  var C = window.APP_CONFIG || {};
  var DAYS = window.TRIP_DAYS || [];
  var MEMBERS = C.MEMBER_COUNT || 6;
  var OTHERS = Math.max(1, MEMBERS - 1);
  var TITLE = C.TRIP_TITLE || '제주 가을여행';
  var ONLINE = !!(C.API_URL && /^https:\/\//.test(C.API_URL));
  var app = document.getElementById('app');
  var layer = document.getElementById('layer');

  /* ---------- 저장 (내 휴대폰) ---------- */
  var store = {
    get: function (k, d) { try { var v = localStorage.getItem('jeju.' + k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set: function (k, v) { try { localStorage.setItem('jeju.' + k, JSON.stringify(v)); } catch (e) {} }
  };
  function emptyState() { return { changes: {}, lunch: {}, massage: null, comments: [], photos: [], log: [], meta: {} }; }

  var me = { name: store.get('name', ''), device: store.get('device', '') };
  if (!me.device) { me.device = 'd' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); store.set('device', me.device); }
  var S = Object.assign(emptyState(), store.get(ONLINE ? 'cache' : 'demo', {}));
  if (store.get('seenAt', null) == null) store.set('seenAt', new Date().toISOString());

  var ui = {
    day: todayDayIndex(), pday: todayDayIndex(), rday: todayDayIndex(), mapDay: 0,
    startStep: 1, editing: null, editCmt: null, drafts: {}, savedPid: null,
    adminOk: false, device: detectDevice(), busy: false, uploadMsg: '', prevSeen: store.get('seenAt', '')
  };
  var deferredPrompt = null;
  var toastTimer = null;

  function saveState() {
    if (ONLINE) {
      var copy = Object.assign({}, S, { photos: S.photos.filter(function (p) { return !/^data:/.test(p.thumb || ''); }) });
      store.set('cache', copy);
    } else {
      var demo = Object.assign({}, S, { photos: [] });
      store.set('demo', demo);
    }
  }

  /* ---------- 서버 ---------- */
  var api = {
    load: function () {
      if (!ONLINE) return Promise.resolve();
      return fetch(C.API_URL + '?action=state&t=' + Date.now())
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok) { S = Object.assign(emptyState(), j.state); saveState(); } })
        .catch(function () { /* 인터넷이 약하면 마지막으로 받은 내용 그대로 보여 줘요 */ });
    },
    post: function (action, payload) {
      var body = Object.assign({ action: action, author: me.name, device: me.device }, payload);
      if (!ONLINE) { localApply(body); saveState(); return Promise.resolve(); }
      return fetch(C.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(body) })
        .then(function (r) { return r.json(); })
        .then(function (j) {
          if (!j || !j.ok) throw new Error((j && j.error) || '저장하지 못했어요');
          S = Object.assign(emptyState(), j.state); saveState();
        });
    }
  };

  // 연습 모드(서버 없음)에서 서버와 똑같이 동작하게 해 주는 부분
  function localApply(a) {
    var now = new Date().toISOString();
    function log(type, itemId, text) { S.log.push({ id: 'l' + Date.now(), at: now, author: a.author, device: a.device, type: type, itemId: itemId || '', text: text || '' }); }
    if (a.action === 'change') {
      S.changes[a.itemId] = Object.assign({}, S.changes[a.itemId] || {}, a.patch, { by: a.author, at: now });
      log('change', a.itemId, a.log);
    } else if (a.action === 'lunch') {
      S.lunch[a.itemId] = { optionId: a.optionId, by: a.author, at: now };
      log('lunch', a.itemId, a.log);
    } else if (a.action === 'massage') {
      S.massage = Object.assign({}, a.data, { by: a.author, at: now });
      log('massage', 'd3-4', a.log);
    } else if (a.action === 'comment.add') {
      S.comments.push({ id: 'c' + Date.now(), placeId: a.placeId, placeName: a.placeName, day: a.day, author: a.author, device: a.device, text: a.text, createdAt: now, updatedAt: '', deleted: false });
    } else if (a.action === 'comment.edit' || a.action === 'comment.delete') {
      S.comments.forEach(function (c) {
        if (c.id === a.id && c.device === a.device) {
          if (a.action === 'comment.edit') { c.text = a.text; c.updatedAt = now; } else { c.deleted = true; }
        }
      });
    } else if (a.action === 'photo.add') {
      S.photos.push({ id: 'p' + Date.now() + Math.random(), placeId: a.placeId, placeName: a.placeName, day: a.day, author: a.author, device: a.device, url: a.dataUrl, thumb: a.dataUrl, createdAt: now, takenAt: a.takenAt || '', lat: a.lat || '', lng: a.lng || '' });
    }
  }

  /* ---------- 도우미 ---------- */
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isoDay(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function todayDayIndex() { var t = isoDay(new Date()); for (var i = 0; i < DAYS.length; i++) if (DAYS[i].iso === t) return i; return 0; }
  function when(iso) {
    if (!iso) return '';
    var d = new Date(iso), diff = (Date.now() - d.getTime()) / 60000;
    if (diff < 2) return '방금';
    if (diff < 60) return Math.floor(diff) + '분 전';
    return (d.getMonth() + 1) + '/' + d.getDate() + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function ddayText() {
    var now = new Date(), today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var p = DAYS[0].iso.split('-'), start = new Date(+p[0], +p[1] - 1, +p[2]);
    var diff = Math.round((start - today) / 86400000);
    if (diff > 1) return 'D-' + diff;
    if (diff === 1) return '내일 출발!';
    if (diff === 0) return '오늘 출발!';
    if (diff > -DAYS.length) return '오늘은 ' + (1 - diff) + '일차';
    return '다녀온 여행';
  }
  function detectDevice() { var u = navigator.userAgent || ''; return /iPhone|iPad|iPod/i.test(u) ? '아이폰' : '갤럭시'; }
  function isStandalone() { return (window.matchMedia && window.matchMedia('(display-mode: standalone)').matches) || window.navigator.standalone === true; }
  function isInApp() { return /KAKAOTALK|NAVER|Instagram|FBAN|FBAV|Line\//i.test(navigator.userAgent || ''); }

  function findItem(id) {
    for (var d = 0; d < DAYS.length; d++) for (var i = 0; i < DAYS[d].items.length; i++) if (DAYS[d].items[i].id === id) return { item: DAYS[d].items[i], day: DAYS[d], dayIdx: d, idx: i };
    return null;
  }
  function eff(item) {
    var ch = S.changes[item.id] || {};
    return {
      name: ch.name || item.name,
      time: ch.time != null && ch.time !== '' ? ch.time : (item.time || ''),
      memo: ch.memo || '',
      skipped: !!ch.skipped,
      renamed: !!ch.name && ch.name !== item.name,
      by: ch.by || '', at: ch.at || ''
    };
  }
  function chosenOption(item) {
    var l = S.lunch[item.id];
    if (!l || !l.optionId) return null;
    var o = (item.options || []).filter(function (x) { return x.id === l.optionId; })[0];
    return o ? { opt: o, by: l.by } : null;
  }
  function placeName(item) {
    if (item.kind === 'choice') { var c = chosenOption(item); return c ? c.opt.name : item.name; }
    if (item.kind === 'recommend' && S.massage && S.massage.name) return S.massage.name;
    return eff(item).name;
  }
  function links(p) {
    var q = p.address || p.query || p.name;
    return {
      naver: p.naverUrl || ('https://map.naver.com/p/search/' + encodeURIComponent(q)),
      kakao: p.kakaoUrl || ('https://map.kakao.com/link/search/' + encodeURIComponent(q))
    };
  }
  function totalPlaces() { return DAYS.reduce(function (n, d) { return n + d.items.length; }, 0); }
  function unseen() {
    var seen = store.get('seenAt', '');
    return S.log.filter(function (l) { return l.device !== me.device && l.at > seen; });
  }

  /* ---------- 아이콘 ---------- */
  var P = {
    home: '<path d="M3 11l9-7 9 7v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
    cal: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M3 10h18M8 3v4M16 3v4"/>',
    map: '<path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z"/><path d="M9 4v14M15 6v14"/>',
    cam: '<path d="M4 8h3l2-3h6l2 3h3a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="4"/>',
    chat: '<path d="M4 5h16v11H9l-5 4z"/>',
    bell: '<path d="M6 9a6 6 0 0 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
    back: '<path d="M15 6l-6 6 6 6"/>',
    next: '<path d="M9 6l6 6-6 6"/>',
    pin: '<path d="M12 21s7-6.5 7-12a7 7 0 0 0-14 0c0 5.5 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
    edit: '<path d="M4 20h4L19 9l-4-4L4 16z"/><path d="M13.5 6.5l4 4"/>',
    skip: '<path d="M5 5l9 7-9 7z"/><path d="M18 5v14"/>',
    undo: '<path d="M4 12a8 8 0 1 0 2.5-5.8"/><path d="M4 4v4h4"/>',
    check: '<path d="M5 12l5 5 9-10"/>',
    lock: '<rect x="5" y="11" width="14" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>',
    trash: '<path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/>',
    x: '<path d="M6 6l12 12M18 6L6 18"/>',
    down: '<path d="M12 4v11M7 10l5 5 5-5"/><path d="M5 20h14"/>',
    phone: '<rect x="7" y="2" width="10" height="20" rx="2"/><path d="M12 7v7M9.5 11.5L12 14l2.5-2.5"/>',
    share: '<path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2"/><path d="M12 3v12M8.5 6.5L12 3l3.5 3.5"/>',
    plusbox: '<rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 8v5M12 16.5v.5"/>',
    folder: '<path d="M3 6a1 1 0 0 1 1-1h5l2 2h9a1 1 0 0 1 1 1v10a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1z"/>'
  };
  function ic(name, size, extra) {
    return '<svg aria-hidden="true" width="' + (size || 24) + '" height="' + (size || 24) + '" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"' + (extra || '') + '>' + P[name] + '</svg>';
  }

  /* ---------- 공통 조각 ---------- */
  function nav(active) {
    var items = [['home', 'home', '홈'], ['schedule', 'cal', '일정'], ['map', 'map', '지도'], ['photos', 'cam', '사진'], ['reviews', 'chat', '한마디']];
    return '<nav class="nav" aria-label="하단 메뉴"><div class="in">' + items.map(function (it) {
      return '<a href="#/' + it[0] + '"' + (active === it[0] ? ' aria-current="page"' : '') + '>' + ic(it[1], 26) + it[2] + '</a>';
    }).join('') + '</div></nav>';
  }
  function header(title, lead, backTo, backLabel, withBell) {
    var n = unseen().length;
    return '<header class="top"><div class="toprow">' +
      '<a class="back" href="#/' + (backTo || 'home') + '">' + ic('back', 22) + (backLabel || '홈') + '</a>' +
      (withBell ? '<a class="bell" href="#/notify" aria-label="새 소식 ' + n + '개">' + ic('bell', 26) + (n ? '<span class="badge">' + n + '</span>' : '') + '</a>' : '') +
      '</div><h1 class="h1 serif">' + title + '</h1>' + (lead ? '<p class="lead">' + lead + '</p>' : '') + '</header>';
  }
  function dayTabs(act, cur, dark) {
    return '<div class="tabs' + (dark ? ' dark' : '') + '" role="tablist" style="grid-template-columns:repeat(' + DAYS.length + ',minmax(0,1fr))">' + DAYS.map(function (d, i) {
      return '<button role="tab" aria-selected="' + (i === cur) + '" data-act="' + act + '" data-i="' + i + '">' + d.label + '<small>' + d.date + '</small></button>';
    }).join('') + '</div>';
  }
  function modeNote() {
    return ONLINE ? '' : '<p class="mode">연습 모드예요. 지금 남긴 내용은 이 휴대폰에만 저장되고 일행과 공유되지 않아요.</p>';
  }
  function unseenBanner() {
    var u = unseen();
    if (!u.length) return '';
    var last = u[u.length - 1];
    return '<a class="banner" href="#/notify">' + ic('bell', 24, ' style="flex:none;margin-top:2px"') +
      '<div style="flex:1"><p style="font-size:17px;font-weight:700">' + esc(last.author) + '님이 ' + esc(last.text) + '</p>' +
      '<p style="font-size:15px;opacity:.9">새 소식 ' + u.length + '개 · 눌러서 보기</p></div></a>';
  }
  function mapButtons(p) {
    var l = links(p);
    return '<div class="grid2"><a class="mapbtn naver" href="' + esc(l.naver) + '" target="_blank" rel="noopener"><span class="dot" aria-hidden="true"></span>네이버지도</a>' +
      '<a class="mapbtn kakao" href="' + esc(l.kakao) + '" target="_blank" rel="noopener"><span class="dot" aria-hidden="true"></span>카카오맵</a></div>';
  }

  /* ---------- 화면: 시작 ---------- */
  function screenStart() {
    var step = ui.startStep;
    var h = '<div class="start"><div class="in"><div class="steps" aria-label="2단계 중 ' + step + '단계"><span class="on"></span><span class="' + (step === 2 ? 'on' : '') + '"></span></div>';
    if (step === 1) {
      var v = ui.drafts.startName != null ? ui.drafts.startName : me.name;
      h += '<p style="margin:0 0 10px;font-size:18px;font-weight:600;opacity:.9">' + esc(TITLE) + ' · 2박 3일</p>' +
        '<h1 class="serif">반가워요!<br>이름이 어떻게 되세요?</h1>' +
        '<p style="margin:14px 0 30px;font-size:18px;opacity:.92">일정을 바꾸거나 한마디를 남기면 이 이름으로 보여요.</p>' +
        '<label for="startName" style="margin-bottom:10px;font-size:18px;font-weight:700">내 이름</label>' +
        '<input id="startName" class="input" type="text" autocomplete="name" placeholder="예: 김영희" maxlength="12" value="' + esc(v) + '" data-input="startName">' +
        '<div style="flex:1;min-height:30px"></div>' +
        '<button class="btn big primary" id="startNext" data-act="startNext"' + (v.trim() ? '' : ' disabled') + '>다음</button>';
    } else {
      h += '<p style="margin:0 0 8px;font-size:21px;font-weight:700">' + esc(me.name) + '님,</p>' +
        '<h1 class="serif">여행을 시작할<br>준비가 되었나요?</h1>' +
        '<div class="tripcard"><div style="display:flex;justify-content:space-between;align-items:center"><b style="font-size:17px;color:var(--muted)">여행 날짜</b>' +
        '<span class="chip t-식사" style="font-size:16px">' + ddayText() + '</span></div>' +
        '<p style="margin:0;font-size:21px;font-weight:700;line-height:1.4">2026년 ' + DAYS[0].dateLong + '<br>– ' + DAYS[DAYS.length - 1].dateLong + '</p>' +
        '<div class="stats" style="margin:0;border:0;border-top:1px solid var(--line);border-radius:0"><div><b>2박 3일</b></div><div><b>' + totalPlaces() + '곳</b></div><div><b>' + MEMBERS + '명</b></div></div>' +
        '<p class="empty" style="color:var(--ink);font-size:17px">첫 일정 · <b>' + esc(placeName(DAYS[0].items[0])) + '</b></p></div>' +
        '<div style="flex:1;min-height:30px"></div>' +
        '<button class="btn big primary" data-act="startGo">네, 시작할게요 ' + ic('next', 24) + '</button>' +
        '<button class="link" style="color:#fff;align-self:center;margin-top:10px;font-size:18px" data-act="startBack">이름 다시 쓰기</button>';
    }
    return h + '</div></div>';
  }

  /* ---------- 화면: 홈 ---------- */
  function screenHome() {
    var first = DAYS[0], last = DAYS[DAYS.length - 1];
    var h = '<div class="wrap"><section class="hero">' +
      '<div class="sun" aria-hidden="true"></div><div class="leaf" aria-hidden="true"></div>' +
      '<p style="font-size:17px;font-weight:600;opacity:.92;margin-bottom:10px">2026. ' + first.date.split(' ')[0].replace('/', '. ') + ' – ' + last.date.split(' ')[0].split('/')[1] + ' · ' + ddayText() + '</p>' +
      '<h1 class="serif">가을, 제주<br>우리 여섯의 여행</h1>' +
      '<p style="margin-top:14px;font-size:18px;opacity:.92;max-width:300px">' + esc(me.name) + '님, 반가워요. 일정과 지도, 사진을 여기 한곳에 모았어요.</p></section>' +
      '<div class="stats"><div><b>3일</b><span>여행</span></div><div><b>' + totalPlaces() + '곳</b><span>방문</span></div><div><b>' + MEMBERS + '명</b><span>함께</span></div></div>' +
      modeNote() + '<div style="height:16px"></div>' + unseenBanner() +
      '<nav class="menu" aria-label="주요 메뉴" style="padding-top:4px">' +
      '<a class="main first" href="#/schedule">' + ic('cal', 30) + '<span>일정 보기</span>' + ic('next', 24) + '</a>' +
      '<a class="main" href="#/map">' + ic('map', 30, ' style="color:var(--sea)"') + '<span>지도 보기</span>' + ic('next', 24) + '</a>' +
      '<a class="main" href="#/photos">' + ic('cam', 30, ' style="color:var(--sea)"') + '<span>사진 보기·올리기</span>' + ic('next', 24) + '</a>' +
      '<a class="main" href="#/reviews">' + ic('chat', 30, ' style="color:var(--sea)"') + '<span>한마디 남기기</span>' + ic('next', 24) + '</a>' +
      '<a class="btn soft" href="#/notify">' + ic('bell', 22) + '새 소식' + (unseen().length ? ' (' + unseen().length + ')' : '') + '</a>' +
      (isStandalone() ? '' : '<a class="main" href="#/install" style="border-style:dashed;border-color:#C9A98A;font-size:19px">' + ic('phone', 28, ' style="color:var(--accent)"') + '<span>휴대폰에 앱으로 설치하기</span>' + ic('next', 22) + '</a>') +
      '</nav>' +
      '<p class="pad muted" style="font-size:16px;display:flex;gap:16px;flex-wrap:wrap;align-items:center">내 이름: <b style="color:var(--ink)">' + esc(me.name) + '</b>' +
      '<button class="link" data-act="rename">이름 바꾸기</button><a class="link" href="#/admin">관리자</a></p>' +
      '</div>' + nav('home');
    return h;
  }

  /* ---------- 화면: 일정 ---------- */
  function screenSchedule() {
    var d = DAYS[ui.day];
    var skippedN = d.items.filter(function (it) { return eff(it).skipped; }).length;
    var h = '<div class="wrap">' + header('여행 일정', '누구나 일정을 바꾸거나 건너뛸 수 있어요. 바꾸기 전에 한 번 더 물어봐요.', 'home', '홈', true) +
      '<div class="pad">' + dayTabs('day', ui.day) + '</div>' + unseenBanner() +
      '<p class="pad" style="margin:4px 0 2px;font-size:19px;font-weight:700">' + d.label + ' · ' + d.dateLong + (d.iso === isoDay(new Date()) ? ' · 오늘' : '') + '</p>' +
      '<p class="pad muted" style="margin:0 0 14px;font-size:16px">' + esc(d.title) + ' · ' + d.items.length + '곳' + (skippedN ? ' · ' + skippedN + '곳 건너뜀' : '') + '</p>' +
      '<ol class="list">' + d.items.map(function (it, i) { return card(it, i); }).join('') + '</ol></div>' + nav('schedule');
    return h;
  }

  function card(it, i) {
    var e = eff(it), editing = ui.editing === it.id;
    var h = '<li class="card' + (e.skipped ? ' skipped' : '') + (editing ? ' focus' : '') + '" id="card-' + it.id + '">' +
      '<div class="cardhead"><span class="num">' + (i + 1) + '</span><div style="flex:1;min-width:0"><div class="chips">' +
      (e.time ? '<span class="chip time">' + esc(e.time) + '</span>' : '') +
      '<span class="chip t-' + it.tag + '">' + it.tag + '</span>' +
      (e.skipped ? '<span class="chip skip">건너뜀</span>' : '') +
      (!e.skipped && (e.renamed || e.memo) ? '<span class="chip edited">변경됨</span>' : '') +
      '</div><h2 class="pname">' + esc(it.kind === 'choice' ? it.name : (it.kind === 'recommend' ? it.name : e.name)) + '</h2></div></div>';

    if (e.renamed) h += '<p class="note">원래 일정: ' + esc(it.name) + (e.by ? ' · ' + esc(e.by) + '님이 바꿈' : '') + '</p>';
    if (e.memo) h += '<p class="note">메모: ' + esc(e.memo) + '</p>';
    if (e.skipped && e.by) h += '<p class="muted" style="margin:0;font-size:15px">' + esc(e.by) + '님이 건너뛰기로 했어요 · ' + when(e.at) + '</p>';

    if (!e.skipped && !editing) {
      if (!e.renamed) h += '<p class="intro">' + esc(it.intro) + '</p>';
      if (it.kind === 'place') {
        var p = e.renamed ? { name: e.name } : it;
        if (!e.renamed && it.address) h += '<p class="addr">' + ic('pin', 18) + esc(it.address) + '</p>';
        h += mapButtons(p);
      } else if (it.kind === 'choice') {
        h += choiceBlock(it);
      } else if (it.kind === 'recommend') {
        h += recommendBlock();
      }
    }

    h += '<div class="actions">';
    if (editing) {
      h += '<div class="panel">' +
        '<div class="field"><label for="ed-name">장소 이름</label><input id="ed-name" class="input" type="text" maxlength="40" value="' + esc(it.kind === 'place' ? e.name : it.name) + '"' + (it.kind === 'place' ? '' : ' disabled') + '></div>' +
        '<div class="field"><label for="ed-time">시간 (선택)</label><input id="ed-time" class="input" type="text" inputmode="numeric" maxlength="11" placeholder="예: 10:30" value="' + esc(e.time) + '"></div>' +
        '<div class="field"><label for="ed-memo">메모 (선택)</label><input id="ed-memo" class="input" type="text" maxlength="60" placeholder="예: 비가 와서 실내로" value="' + esc(e.memo) + '"></div>' +
        '<div class="grid2"><button class="btn line" data-act="editCancel">취소</button><button class="btn dark" data-act="editNext" data-id="' + it.id + '">다음</button></div></div>';
    } else if (e.skipped) {
      h += '<button class="btn line-sea" style="width:100%" data-act="restore" data-id="' + it.id + '">' + ic('undo', 20) + '일정에 다시 넣기</button>';
    } else {
      h += '<div class="grid2"><button class="btn soft" data-act="edit" data-id="' + it.id + '">' + ic('edit', 20) + '일정 변경</button>' +
        '<button class="btn soft" data-act="skip" data-id="' + it.id + '">' + ic('skip', 20) + '건너뛰기</button></div>';
    }
    return h + '</div></li>';
  }

  function choiceBlock(it) {
    var c = chosenOption(it);
    var h = '<div style="display:flex;flex-direction:column;gap:10px">' + it.options.map(function (o, j) {
      var chosen = c && c.opt.id === o.id, dim = c && !chosen;
      return '<div class="option' + (chosen ? ' chosen' : '') + (dim ? ' dim' : '') + '">' +
        '<p class="optlabel">' + (chosen ? ic('check', 18, ' style="vertical-align:-3px"') + ' 여기로 정했어요' + (c.by ? ' · ' + esc(c.by) + '님' : '') : '선택 ' + 'AB'[j]) + '</p>' +
        '<h3>' + esc(o.name) + '</h3><p class="intro" style="font-size:17px">' + esc(o.intro) + '</p>' +
        (o.address ? '<p class="addr" style="font-size:15px">' + ic('pin', 16) + esc(o.address) + '</p>' : '') +
        mapButtons(o) +
        (!c ? '<button class="btn sea" data-act="lunch" data-id="' + it.id + '" data-opt="' + o.id + '">' + ic('check', 20) + '여기로 정해요</button>' : '') +
        '</div>';
    }).join('') + '</div>';
    if (c) h += '<button class="link" data-act="lunchReset" data-id="' + it.id + '">다시 고르기</button>';
    return h;
  }

  function recommendBlock() {
    var m = S.massage;
    if (m && m.name) {
      return '<div class="option chosen"><p class="optlabel">추천 업체</p><h3>' + esc(m.name) + '</h3>' +
        (m.note ? '<p class="intro" style="font-size:17px">' + esc(m.note) + '</p>' : '') +
        (m.address ? '<p class="addr" style="font-size:15px">' + ic('pin', 16) + esc(m.address) + '</p>' : '') +
        mapButtons({ name: m.name, address: m.address, naverUrl: m.link }) + '</div>';
    }
    return '<div class="dashed"><b style="font-size:18px">추천 업체를 기다리는 중</b><span class="muted" style="font-size:16px">관리자가 업체를 등록하면 주소와 지도 버튼이 여기에 나타나요.</span></div>' +
      '<a class="link" href="#/admin">' + ic('lock', 18) + '관리자 화면에서 등록</a>';
  }

  /* ---------- 화면: 지도 ---------- */
  function screenMap() {
    var o = function (n) { return ui.mapDay === 0 || ui.mapDay === n ? 1 : 0.15; };
    var labels = ['전체', '1일', '2일', '3일'];
    var colors = ['#C2551B', '#1F5560', '#7A5A12'];
    var h = '<div class="wrap">' + header('전체 동선 보기', '날짜를 누르면 그날 다니는 길만 진하게 보여요.') +
      '<div class="pad"><div class="tabs dark" style="grid-template-columns:repeat(4,minmax(0,1fr))">' + labels.map(function (l, i) {
        return '<button aria-pressed="' + (ui.mapDay === i) + '" aria-selected="' + (ui.mapDay === i) + '" data-act="mapDay" data-i="' + i + '">' + l + '</button>';
      }).join('') + '</div></div>' +
      '<figure class="mapfig"><svg role="img" aria-label="제주도 여행 동선 약도" viewBox="0 0 358 240">' +
      '<path d="M28 122 C 34 72, 110 40, 190 40 C 262 40, 332 66, 340 100 C 348 138, 300 186, 222 196 C 150 206, 62 192, 36 162 Z" fill="#F1E9DA" stroke="#C9BBA4" stroke-width="1.5"/>' +
      '<ellipse cx="180" cy="112" rx="22" ry="14" fill="#E2D6BE"/><text x="180" y="116" text-anchor="middle" font-size="10" fill="#6B5F50">한라산</text>' +
      '<g opacity="' + o(1) + '"><polyline points="130,58 175,95 120,170 145,178 165,178 185,175 160,172 255,160" fill="none" stroke="#C2551B" stroke-width="3.5" stroke-linejoin="round" stroke-linecap="round"/>' + dots('130,58 175,95 120,170 145,178 165,178 185,175 255,160', '#C2551B') + '</g>' +
      '<g opacity="' + o(2) + '"><polyline points="255,160 260,154 290,135 318,110 300,95 280,62 250,50 226,48 246,56" fill="none" stroke="#1F5560" stroke-width="3.5" stroke-linejoin="round" stroke-dasharray="8 5"/>' + dots('260,154 290,135 318,110 300,95 280,62 250,50 226,48', '#1F5560') + '</g>' +
      '<g opacity="' + o(3) + '"><polyline points="246,56 260,70 126,68 138,62 132,58" fill="none" stroke="#7A5A12" stroke-width="3.5" stroke-linejoin="round" stroke-dasharray="2 6" stroke-linecap="round"/>' + dots('246,56 260,70 126,68 138,62', '#7A5A12') + '</g>' +
      '<g font-size="12" font-weight="700" fill="#2A2622"><text x="112" y="44">제주공항</text><text x="128" y="200">서귀포</text><text x="300" y="128">성산</text><text x="222" y="34">김녕</text><text x="248" y="180">표선</text></g>' +
      '</svg><figcaption>위치를 단순하게 그린 약도예요. 정확한 길은 일정의 지도 버튼으로 봐요.</figcaption></figure>' +
      '<div style="display:flex;flex-direction:column;gap:12px;padding:20px">' + DAYS.map(function (d, i) {
        return '<div class="card" style="gap:8px"><div style="display:flex;align-items:center;gap:10px"><span aria-hidden="true" style="width:28px;height:6px;border-radius:3px;background:' + colors[i] + '"></span><h2 style="margin:0;font-size:20px">' + d.label + ' · ' + d.date + '</h2></div>' +
          '<p class="route">' + d.items.map(function (it) { var n = esc(placeName(it)); return eff(it).skipped ? '<s>' + n + '</s>' : n; }).join(' → ') + '</p></div>';
      }).join('') + '<a class="btn big primary" href="#/schedule">' + ic('cal', 24) + '장소별 지도 버튼은 일정에서</a></div></div>' + nav('map');
    return h;
  }
  function dots(pts, color) { return pts.split(' ').map(function (p) { var xy = p.split(','); return '<circle cx="' + xy[0] + '" cy="' + xy[1] + '" r="5" fill="' + color + '"/>'; }).join(''); }

  /* ---------- 화면: 사진 ---------- */
  function screenPhotos() {
    var d = DAYS[ui.pday];
    var h = '<div class="wrap">' + header('우리 사진', ONLINE ? '올린 사진은 구글 드라이브 ‘제주여행 사진’ 폴더에 날짜별로 모여요.' : '연습 모드라 사진은 이 화면에서만 잠깐 보여요.') +
      '<div class="pad">' + dayTabs('pday', ui.pday) + '</div>' +
      '<div class="card" style="margin:0 20px">' +
      '<p style="margin:0;font-size:17px">올리는 사람: <b>' + esc(me.name) + '</b></p>' +
      '<div class="field"><label for="ph-place">어디서 찍었나요?</label><select id="ph-place" class="select">' +
      d.items.map(function (it) { return '<option value="' + it.id + '">' + esc(placeName(it)) + '</option>'; }).join('') + '</select></div>' +
      '<label class="drop" for="ph-files">' + ic('cam', 40, ' style="color:var(--accent)"') + '<b>사진 고르기</b><span class="muted" id="pickInfo" style="font-size:16px">여러 장을 한 번에 골라도 돼요 (최대 10장)</span></label>' +
      '<input id="ph-files" class="sr" type="file" accept="image/*" multiple data-input="files">' +
      '<button class="btn big primary" id="ph-up" data-act="upload"' + (ui.busy ? ' disabled' : '') + '>' + (ui.busy ? '올리는 중…' : '올리기') + '</button>' +
      (ui.uploadMsg ? '<p class="status" role="status">' + esc(ui.uploadMsg) + '</p>' : '') +
      '</div><h2 class="section-title serif">' + d.label + ' 사진</h2><div style="display:flex;flex-direction:column;gap:12px;padding:0 20px">' +
      d.items.map(function (it) {
        var ps = S.photos.filter(function (p) { return p.placeId === it.id; }).sort(function (a, b) {
          var x = a.takenAt || a.createdAt || '', y = b.takenAt || b.createdAt || ''; return x < y ? -1 : 1;
        });
        return '<div class="card" style="gap:10px"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h3 style="margin:0;font-size:19px">' + esc(placeName(it)) + '</h3><span class="muted" style="font-size:15px;flex:none">' + ps.length + '장</span></div>' +
          (ps.length ? '<div class="thumbs">' + ps.map(function (p) {
            return '<a href="' + esc(p.url) + '" target="_blank" rel="noopener" aria-label="' + esc(p.author) + '님 사진 크게 보기"><img src="' + esc(p.thumb) + '" alt="' + esc(placeName(it)) + ' 사진 (' + esc(p.author) + ')" loading="lazy" referrerpolicy="no-referrer">' + (takenLabel(p) ? '<span class="tt">' + takenLabel(p) + '</span>' : '') + '</a>';
          }).join('') + '</div>' : '<p class="empty">아직 사진이 없어요.</p>') + '</div>';
      }).join('') + '</div></div>' + nav('photos');
    return h;
  }

  /* ---------- 화면: 한마디 ---------- */
  function screenReviews() {
    var d = DAYS[ui.rday];
    var h = '<div class="wrap">' + header('한마디', '장소마다 한마디씩 남겨요. 일행이 남긴 말도 함께 보여요.') +
      '<div class="pad">' + dayTabs('rday', ui.rday) + '</div>' +
      '<div style="display:flex;flex-direction:column;gap:14px;padding:0 20px">' + d.items.map(function (it) { return reviewCard(it, d); }).join('') + '</div>' +
      '<div class="card" style="margin:22px 20px 0;background:var(--sea);color:#fff;border:0"><h2 class="serif" style="margin:0;font-size:23px">여행이 끝나면</h2>' +
      '<p style="margin:0;font-size:17px;opacity:.92">모두의 사진과 한마디는 구글 드라이브와 시트에 차곡차곡 쌓여요. 여행 뒤에 이걸 엮어 날짜별 추억 피드로 만들 거예요.</p></div>' +
      '</div>' + nav('reviews');
    return h;
  }
  function reviewCard(it, d) {
    var pid = it.id;
    var list = S.comments.filter(function (c) { return c.placeId === pid && !c.deleted; }).sort(function (a, b) { return a.createdAt < b.createdAt ? -1 : 1; });
    var hasMine = list.some(function (c) { return c.device === me.device; });
    var draft = ui.drafts['d-' + pid] || '';
    var h = '<article class="card"><div style="display:flex;justify-content:space-between;gap:10px;align-items:baseline"><h3 style="margin:0;font-size:20px">' + esc(placeName(it)) + '</h3><span class="chip t-' + it.tag + '" style="flex:none">' + it.tag + '</span></div>';
    if (!list.length) h += '<p class="empty">아직 남긴 한마디가 없어요. 첫 한마디를 남겨 주세요.</p>';
    else h += '<p class="muted" style="margin:0;font-size:15px;font-weight:700">한마디 ' + list.length + '개</p>' + list.map(function (c) {
      var mine = c.device === me.device, ed = ui.editCmt === c.id;
      var s = '<div class="cmt' + (mine ? ' mine' : '') + '"><div class="who"><span class="av" aria-hidden="true">' + esc((c.author || '?').slice(0, 1)) + '</span><b>' + esc(c.author) + (mine ? ' (나)' : '') + '</b><span>' + when(c.createdAt) + (c.updatedAt ? ' · 고침' : '') + '</span></div>';
      if (ed) {
        s += '<label for="ec-' + c.id + '" style="font-size:16px;font-weight:700">한마디 고치기</label><textarea id="ec-' + c.id + '" class="textarea" maxlength="300">' + esc(c.text) + '</textarea>' +
          '<div class="grid2"><button class="btn line" data-act="cmtCancel">취소</button><button class="btn dark" data-act="cmtSave" data-id="' + c.id + '">고친 내용 저장</button></div>';
      } else {
        s += '<p class="txt">' + esc(c.text) + '</p>';
        if (mine) s += '<div class="grid2"><button class="btn soft" style="min-height:48px;font-size:17px" data-act="cmtEdit" data-id="' + c.id + '">' + ic('edit', 18) + '고치기</button><button class="btn soft" style="min-height:48px;font-size:17px" data-act="cmtDel" data-id="' + c.id + '">' + ic('trash', 18) + '지우기</button></div>';
      }
      return s + '</div>';
    }).join('');
    h += '<label for="dr-' + pid + '" style="font-size:17px;font-weight:700;margin-top:4px">나의 한마디</label>' +
      '<textarea id="dr-' + pid + '" class="textarea" maxlength="300" placeholder="좋았던 점을 짧게 적어 주세요" data-input="draft" data-pid="' + pid + '">' + esc(draft) + '</textarea>' +
      '<button class="btn primary" id="post-' + pid + '" data-act="cmtAdd" data-id="' + pid + '"' + (draft.trim() ? '' : ' disabled') + '>' + (draft.trim() ? '한마디 남기기' : '한마디를 적으면 남길 수 있어요') + '</button>';
    if (ui.savedPid === pid && hasMine) h += '<p class="status" role="status" style="font-size:16px">남겼어요! 일행도 함께 볼 수 있어요.</p>';
    return h + '</article>';
  }

  /* ---------- 화면: 새 소식 ---------- */
  function screenNotify() {
    var prev = ui.prevSeen;
    var logs = S.log.slice().reverse();
    var h = '<div class="wrap">' + header('새 소식', '누가 언제 무엇을 바꿨는지 모두 볼 수 있어요.', 'schedule', '일정') +
      '<div class="card" style="margin:0 20px"><p style="margin:0;font-size:18px;font-weight:700">알림은 이렇게 받아요</p>' +
      '<p style="margin:0;font-size:16px;color:var(--ink2)">일정을 바꾸면 바꾼 사람 화면에 ‘카톡으로 알리기’ 버튼이 떠요. 단톡방에 보내 주면 모두가 바로 알 수 있어요. 앱을 열면 위쪽에 새 소식도 보여요.</p>' +
      (isStandalone() ? '' : '<a class="btn soft" href="#/install">' + ic('phone', 22) + '휴대폰에 앱으로 설치하기</a>') + '</div>' +
      '<h2 class="section-title serif">바뀐 기록</h2><div style="display:flex;flex-direction:column;gap:12px;padding:0 20px">' +
      (logs.length ? logs.map(function (l) {
        var isNew = l.device !== me.device && l.at > prev;
        var lab = { change: '변경', lunch: '점심', massage: '추천' }[l.type] || '소식';
        return '<article class="card" style="flex-direction:row;gap:14px;' + (isNew ? 'border:2px solid var(--accent)' : '') + '"><span class="av" style="width:46px;height:46px;background:' + (l.type === 'change' ? 'var(--accent)' : 'var(--sea)') + '" aria-hidden="true">' + lab + '</span>' +
          '<div style="flex:1;min-width:0"><p style="margin:0;font-size:17px"><b>' + esc(l.author) + '</b>님이 ' + esc(l.text) + '</p><p class="muted" style="margin:4px 0 0;font-size:15px">' + when(l.at) + (isNew ? ' · 새 소식' : '') + '</p>' +
          (l.itemId ? '<a class="link" href="#/schedule" data-act="gotoItem" data-id="' + l.itemId + '">일정에서 보기</a>' : '') + '</div></article>';
      }).join('') : '<p class="empty">아직 바뀐 일정이 없어요.</p>') + '</div></div>' + nav('');
    return h;
  }

  /* ---------- 화면: 설치 안내 ---------- */
  function screenInstall() {
    var dev = ui.device;
    var h = '<div class="wrap">' + header('앱으로 설치하기', '내 휴대폰을 골라 주세요. 순서대로 따라 하면 3분이면 끝나요.') +
      '<div class="pad"><div class="tabs dark" style="grid-template-columns:repeat(2,minmax(0,1fr))">' + ['갤럭시', '아이폰'].map(function (l) {
        return '<button aria-selected="' + (dev === l) + '" data-act="device" data-v="' + l + '">' + l + '</button>';
      }).join('') + '</div></div><div style="display:flex;flex-direction:column;gap:14px;padding:0 20px">';
    if (isStandalone()) h += '<p class="status">이미 설치된 앱으로 열려 있어요. 잘 하셨어요!</p>';
    if (isInApp()) h += '<p class="note" style="font-size:16px">지금 카톡 안에서 열려 있어요. 설치하려면 먼저 ' + (dev === '아이폰' ? '오른쪽 아래 점 세 개 → ‘Safari로 열기’' : '오른쪽 아래(또는 위) 점 세 개 → ‘다른 브라우저로 열기’') + '를 눌러 주세요.</p>';
    var steps;
    if (dev === '갤럭시') {
      if (deferredPrompt) h += '<div class="card" style="background:var(--sea);color:#fff;border:0"><p style="margin:0;font-size:19px;font-weight:700">버튼 하나로 설치돼요</p><button class="btn big" style="background:#fff;color:var(--sea)" data-act="installNow">' + ic('down', 24) + '앱 설치하기</button></div>';
      steps = [
        ['삼성 인터넷이나 크롬으로 열기', '카톡에서 링크를 눌렀다면 점 세 개 → ‘다른 브라우저로 열기’를 눌러요.'],
        ['메뉴 버튼 누르기', '삼성 인터넷은 아래쪽 줄 세 개(≡), 크롬은 오른쪽 위 점 세 개(⋮)예요.'],
        ['‘홈 화면에 추가’ 또는 ‘앱 설치’', '삼성 인터넷은 ‘현재 페이지 추가 → 홈 화면’을 골라요.'],
        ['홈 화면 아이콘으로 열기', '‘제주여행’ 아이콘이 생겼어요. 이제 이걸로 열면 돼요.']
      ];
    } else {
      steps = [
        ['사파리로 열기', '카톡에서 열었다면 오른쪽 아래 점 세 개 → ‘Safari로 열기’를 골라요.'],
        ['아래 가운데 공유 버튼 누르기', '네모 위로 화살표가 나온 버튼이에요. ' + ic('share', 22, ' style="vertical-align:-5px;color:var(--sea)"')],
        ['아래로 내려 ‘홈 화면에 추가’', '오른쪽 위 ‘추가’를 누르면 아이콘이 생겨요. ' + ic('plusbox', 22, ' style="vertical-align:-5px;color:var(--sea)"')],
        ['홈 화면 아이콘으로 열기', '‘제주여행’ 아이콘으로 열면 주소창 없이 앱처럼 보여요.']
      ];
    }
    h += steps.map(function (s, i) {
      return '<div class="card" style="flex-direction:row;gap:14px"><span class="num" style="background:var(--accent)">' + (i + 1) + '</span><div><p style="margin:0;font-size:19px;font-weight:700">' + s[0] + '</p><p class="muted" style="margin:4px 0 0;font-size:16px">' + s[1] + '</p></div></div>';
    }).join('');
    return h + '</div></div>' + nav('');
  }

  /* ---------- 화면: 관리자 ---------- */
  function screenAdmin() {
    var h = '<div class="wrap">' + header('관리자', '');
    if (!ui.adminOk) {
      h += '<div class="card" style="margin:0 20px"><p style="margin:0;font-size:18px;text-align:center">발 마사지 추천처럼 정리할 것을 등록하는 곳이에요.<br>비밀번호 4자리를 눌러 주세요.</p>' +
        '<div class="field"><label for="pin">비밀번호</label><input id="pin" class="input" type="password" inputmode="numeric" maxlength="4" style="font-size:28px;letter-spacing:.4em;text-align:center"></div>' +
        '<button class="btn big dark" data-act="adminIn">들어가기</button><p id="pinMsg" class="muted" style="margin:0;font-size:16px" role="status"></p></div>';
    } else {
      var m = S.massage || {};
      h += '<div class="card" style="margin:0 20px"><h2 style="margin:0;font-size:21px">공항 근처 발 마사지 추천</h2><p class="muted" style="margin:0;font-size:16px">저장하면 3일차 일정의 추천 카드에 바로 보여요.</p>' +
        '<div class="field"><label for="m-name">업체 이름</label><input id="m-name" class="input" type="text" maxlength="40" value="' + esc(m.name || '') + '"></div>' +
        '<div class="field"><label for="m-addr">주소</label><input id="m-addr" class="input" type="text" maxlength="80" placeholder="제주 제주시 …" value="' + esc(m.address || '') + '"></div>' +
        '<div class="field"><label for="m-link">네이버 지도 링크 (선택)</label><input id="m-link" class="input" type="url" placeholder="https://naver.me/…" value="' + esc(m.link || '') + '"></div>' +
        '<div class="field"><label for="m-note">한 줄 소개</label><input id="m-note" class="input" type="text" maxlength="60" value="' + esc(m.note || '') + '"></div>' +
        '<button class="btn big primary" data-act="massageSave">저장하기</button></div>';
      h += '<div class="card" style="margin:16px 20px 0"><h2 style="margin:0;font-size:21px">저장 위치</h2>' +
        (ONLINE ? '<p class="muted" style="margin:0;font-size:16px">모든 한마디·사진·변경 기록이 여기에 쌓여요. 여행 뒤 추억 피드의 재료예요.</p>' +
          (S.meta && S.meta.sheetUrl ? '<a class="btn soft" href="' + esc(S.meta.sheetUrl) + '" target="_blank" rel="noopener">' + ic('folder', 22) + '구글 시트 열기</a>' : '') +
          (S.meta && S.meta.folderUrl ? '<a class="btn soft" href="' + esc(S.meta.folderUrl) + '" target="_blank" rel="noopener">' + ic('cam', 22) + '사진 폴더 열기</a>' : '')
          : '<p class="note" style="font-size:16px">아직 연습 모드예요. 설치 안내서 대로 config.js에 주소를 넣으면 구글 드라이브·시트에 저장돼요.</p>') + '</div>';
    }
    return h + '</div>' + nav('');
  }

  /* ---------- 확인 창 / 알림 띠 ---------- */
  function confirmBox(o) {
    return new Promise(function (resolve) {
      var el = document.createElement('div');
      el.className = 'scrim';
      el.innerHTML = '<div class="sheet" role="alertdialog" aria-modal="true" aria-labelledby="cf-t"><div class="grip" aria-hidden="true"></div>' +
        '<h2 id="cf-t" class="serif">' + esc(o.title) + '</h2>' + (o.detail ? '<p class="detail">' + esc(o.detail) + '</p>' : '') +
        (o.notify ? '<p class="hint">' + ic('bell', 20, ' style="vertical-align:-4px;color:var(--sea)"') + ' 확인하면 바뀐 내용이 일행 ' + OTHERS + '명의 앱에도 보여요.</p>' : '') +
        (o.hint ? '<p class="hint">' + esc(o.hint) + '</p>' : '') +
        '<button class="btn big ' + (o.danger ? 'dark' : 'primary') + '" data-yes>' + esc(o.yes) + '</button>' +
        '<button class="btn big line" data-no>' + esc(o.no || '아니요, 그대로 둘게요') + '</button></div>';
      function close(v) { el.remove(); document.removeEventListener('keydown', onKey); resolve(v); }
      function onKey(e) { if (e.key === 'Escape') close(false); }
      el.addEventListener('click', function (e) {
        if (e.target === el || e.target.closest('[data-no]')) close(false);
        else if (e.target.closest('[data-yes]')) close(true);
      });
      document.addEventListener('keydown', onKey);
      document.body.appendChild(el);
      el.querySelector('[data-yes]').focus();
    });
  }

  function toast(text, shareText, isError) {
    clearTimeout(toastTimer);
    layer.innerHTML = '<div class="toast" role="status"' + (isError ? ' style="background:#8A2A10"' : '') + '><p>' + esc(text) + '</p>' +
      '<div class="row">' + (shareText ? '<button class="btn kakao" data-act="share" data-text="' + esc(shareText) + '">' + ic('chat', 20) + '카톡으로 알리기</button>' : '') +
      '<button class="btn line" style="flex:' + (shareText ? '0 0 96px' : '1') + '" data-act="toastClose">닫기</button></div></div>';
    toastTimer = setTimeout(function () { layer.innerHTML = ''; }, shareText ? 20000 : 6000);
  }

  function shareText(text) {
    var url = location.href.split('#')[0];
    var full = '[' + TITLE + '] ' + text + '\n앱에서 보기: ' + url;
    if (navigator.share) {
      navigator.share({ title: TITLE, text: full }).catch(function () {});
    } else if (navigator.clipboard) {
      navigator.clipboard.writeText(full).then(function () { toast('복사했어요. 카톡 단톡방에 붙여 넣어 주세요.'); }, function () { toast('복사하지 못했어요.', null, true); });
    } else {
      toast('이 휴대폰에서는 공유 기능이 없어요. 카톡에 직접 알려 주세요.', null, true);
    }
  }

  /* ---------- 동작 ---------- */
  function run(action, payload, okText, share) {
    ui.busy = true;
    return api.post(action, payload).then(function () {
      ui.busy = false; render(true);
      if (okText) toast(okText, share ? (me.name + '님이 ' + payload.log) : null);
    }).catch(function (err) {
      ui.busy = false; render(true);
      toast('저장하지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요. (' + err.message + ')', null, true);
      throw err;
    });
  }

  var actions = {
    startNext: function () {
      var v = (document.getElementById('startName').value || '').trim();
      if (!v) return;
      me.name = v; store.set('name', v); ui.drafts.startName = null; ui.startStep = 2; render(true);
    },
    startBack: function () { ui.startStep = 1; render(true); },
    startGo: function () { location.hash = '#/schedule'; },
    rename: function () { ui.startStep = 1; location.hash = '#/start'; },
    day: function (el) { ui.day = +el.dataset.i; ui.editing = null; render(true); },
    pday: function (el) { ui.pday = +el.dataset.i; ui.uploadMsg = ''; render(true); },
    rday: function (el) { ui.rday = +el.dataset.i; ui.editCmt = null; render(true); },
    mapDay: function (el) { ui.mapDay = +el.dataset.i; render(true); },
    device: function (el) { ui.device = el.dataset.v; render(true); },

    edit: function (el) { ui.editing = el.dataset.id; render(true); var f = document.getElementById('ed-time'); if (f) f.scrollIntoView({ block: 'center', behavior: 'smooth' }); },
    editCancel: function () { ui.editing = null; render(true); },
    editNext: function (el) {
      var f = findItem(el.dataset.id), e = eff(f.item);
      var nm = (document.getElementById('ed-name').value || '').trim();
      var tm = (document.getElementById('ed-time').value || '').trim();
      var mm = (document.getElementById('ed-memo').value || '').trim();
      var patch = {}, lines = [], logs = [];
      if (f.item.kind === 'place' && nm && nm !== e.name) { patch.name = nm; lines.push(e.name + '\n→ ' + nm); logs.push('‘' + e.name + '’을(를) ‘' + nm + '’(으)로'); }
      if (tm !== e.time) { patch.time = tm; lines.push('시간: ' + (tm || '없음')); logs.push('시간을 ' + (tm || '없음') + '(으)로'); }
      if (mm !== e.memo) { patch.memo = mm; lines.push('메모: ' + (mm || '없음')); }
      if (!lines.length) { ui.editing = null; render(true); return; }
      var label = f.day.label + ' ' + (f.idx + 1) + '번';
      var logText = f.day.label + ' ' + (logs.length ? logs.join(', ') + ' 바꿨어요.' : '‘' + (patch.name || e.name) + '’ 메모를 남겼어요.' + (mm ? ' (' + mm + ')' : ''));
      if (patch.memo && logs.length) logText = logText.replace(/\.$/, ' (' + mm + ')');
      confirmBox({ title: '정말 이 일정을\n변경하시겠습니까?', detail: label + '\n' + lines.join('\n'), yes: '네, 변경할게요', notify: true }).then(function (ok) {
        if (!ok) return;
        ui.editing = null;
        run('change', { itemId: f.item.id, patch: patch, log: logText }, '일정을 바꿨어요. 단톡방에도 알려 주세요.', true).catch(function () {});
      });
    },
    skip: function (el) {
      var f = findItem(el.dataset.id), n = placeName(f.item);
      confirmBox({ title: '정말 이 일정을\n건너뛰시겠습니까?', detail: f.day.label + ' ' + (f.idx + 1) + '번\n' + n, yes: '네, 건너뛸게요', notify: true, hint: '나중에 ‘일정에 다시 넣기’로 되돌릴 수 있어요.' }).then(function (ok) {
        if (!ok) return;
        run('change', { itemId: f.item.id, patch: { skipped: true }, log: f.day.label + ' ‘' + n + '’을(를) 건너뛰기로 했어요.' }, '‘' + n + '’을(를) 건너뛰었어요.', true).catch(function () {});
      });
    },
    restore: function (el) {
      var f = findItem(el.dataset.id), n = placeName(f.item);
      confirmBox({ title: '이 일정을\n다시 넣으시겠습니까?', detail: f.day.label + ' ' + (f.idx + 1) + '번\n' + n, yes: '네, 다시 넣을게요', notify: true }).then(function (ok) {
        if (!ok) return;
        run('change', { itemId: f.item.id, patch: { skipped: false }, log: f.day.label + ' ‘' + n + '’을(를) 다시 넣었어요.' }, '‘' + n + '’을(를) 다시 넣었어요.', true).catch(function () {});
      });
    },
    lunch: function (el) {
      var f = findItem(el.dataset.id);
      var o = f.item.options.filter(function (x) { return x.id === el.dataset.opt; })[0];
      confirmBox({ title: '점심을 여기로\n정하시겠습니까?', detail: o.name, yes: '네, 여기로 정할게요', notify: true }).then(function (ok) {
        if (!ok) return;
        run('lunch', { itemId: f.item.id, optionId: o.id, log: f.day.label + ' 점심을 ‘' + o.name + '’(으)로 정했어요.' }, '점심을 ‘' + o.name + '’(으)로 정했어요.', true).catch(function () {});
      });
    },
    lunchReset: function (el) {
      var f = findItem(el.dataset.id);
      confirmBox({ title: '점심 선택을\n다시 하시겠습니까?', detail: '정해 둔 곳: ' + placeName(f.item), yes: '네, 다시 고를게요', notify: true }).then(function (ok) {
        if (!ok) return;
        run('lunch', { itemId: f.item.id, optionId: '', log: f.day.label + ' 점심을 다시 고르기로 했어요.' }, '점심을 다시 고를 수 있어요.', true).catch(function () {});
      });
    },
    gotoItem: function (el) {
      var f = findItem(el.dataset.id); if (!f) return;
      ui.day = f.dayIdx;
      setTimeout(function () { var c = document.getElementById('card-' + f.item.id); if (c) c.scrollIntoView({ block: 'start', behavior: 'smooth' }); }, 300);
    },

    upload: function () {
      var input = document.getElementById('ph-files');
      var files = Array.prototype.slice.call(input.files || [], 0, 10);
      if (!files.length) { ui.uploadMsg = '먼저 ‘사진 고르기’를 눌러 사진을 골라 주세요.'; render(true); return; }
      var sel = document.getElementById('ph-place');
      var f = findItem(sel.value), name = placeName(f.item);
      ui.busy = true; ui.uploadMsg = '0 / ' + files.length + '장 올리는 중…'; render(true);
      var done = 0, failed = 0;
      files.reduce(function (p, file) {
        return p.then(function () {
          var meta;
          return readExif(file).then(function (x) { meta = x; return resizeImage(file); }).then(function (dataUrl) {
            var stamp = meta.takenAt ? meta.takenAt.replace(/[-:]/g, '').replace(' ', '_') + '_' : '';
            return api.post('photo.add', { placeId: f.item.id, placeName: name, day: f.day.label, dataUrl: dataUrl,
              takenAt: meta.takenAt, takenGuess: !!meta.guess, lat: meta.lat, lng: meta.lng,
              filename: stamp + f.day.label + '_' + name + '_' + me.name + '.jpg' });
          }).then(function () { done++; }, function () { failed++; }).then(function () {
            ui.uploadMsg = (done + failed) + ' / ' + files.length + '장 올리는 중…'; render(true);
          });
        });
      }, Promise.resolve()).then(function () {
        ui.busy = false;
        ui.uploadMsg = failed ? (done + '장 올렸고 ' + failed + '장은 실패했어요. 다시 시도해 주세요.') : (done + '장 모두 올렸어요!');
        render(true);
      });
    },

    cmtAdd: function (el) {
      var pid = el.dataset.id, f = findItem(pid);
      var t = (ui.drafts['d-' + pid] || '').trim();
      if (!t) return;
      run('comment.add', { placeId: pid, placeName: placeName(f.item), day: f.day.label, text: t }).then(function () {
        ui.drafts['d-' + pid] = ''; ui.savedPid = pid; render(true);
      }).catch(function () {});
    },
    cmtEdit: function (el) { ui.editCmt = el.dataset.id; render(true); var t = document.getElementById('ec-' + el.dataset.id); if (t) t.focus(); },
    cmtCancel: function () { ui.editCmt = null; render(true); },
    cmtSave: function (el) {
      var id = el.dataset.id, t = (document.getElementById('ec-' + id).value || '').trim();
      if (!t) return;
      ui.editCmt = null;
      run('comment.edit', { id: id, text: t }, '고친 내용을 저장했어요.').catch(function () {});
    },
    cmtDel: function (el) {
      var id = el.dataset.id;
      var c = S.comments.filter(function (x) { return x.id === id; })[0];
      confirmBox({ title: '정말 이 한마디를\n지우시겠습니까?', detail: c ? c.text : '', yes: '네, 지울게요', danger: true, hint: '지우면 일행 모두의 화면에서도 사라져요.', no: '아니요' }).then(function (ok) {
        if (!ok) return;
        run('comment.delete', { id: id }, '한마디를 지웠어요.').then(function () {
          var still = S.comments.some(function (x) { return x.placeId === (c && c.placeId) && !x.deleted && x.device === me.device; });
          if (!still) { ui.savedPid = null; render(true); }
        }).catch(function () {});
      });
    },

    adminIn: function () {
      var v = document.getElementById('pin').value;
      if (v === String(C.ADMIN_PIN || '')) { ui.adminOk = true; render(true); }
      else { document.getElementById('pinMsg').textContent = '비밀번호가 맞지 않아요.'; }
    },
    massageSave: function () {
      var data = {
        name: document.getElementById('m-name').value.trim(),
        address: document.getElementById('m-addr').value.trim(),
        link: document.getElementById('m-link').value.trim(),
        note: document.getElementById('m-note').value.trim()
      };
      if (data.link && !/^https:\/\//.test(data.link)) data.link = '';
      if (!data.name) { toast('업체 이름을 적어 주세요.', null, true); return; }
      confirmBox({ title: '이 내용으로\n저장하시겠습니까?', detail: data.name + (data.address ? '\n' + data.address : ''), yes: '네, 저장할게요', notify: true }).then(function (ok) {
        if (!ok) return;
        run('massage', { data: data, log: '3일차 발 마사지 추천으로 ‘' + data.name + '’을(를) 등록했어요.' }, '추천 업체를 저장했어요.', true).catch(function () {});
      });
    },

    installNow: function () {
      if (!deferredPrompt) return;
      deferredPrompt.prompt();
      deferredPrompt.userChoice.then(function () { deferredPrompt = null; render(true); });
    },
    share: function (el) { shareText(el.dataset.text); },
    toastClose: function () { layer.innerHTML = ''; }
  };

  /* 사진 속 '찍은 시간·위치'(EXIF) 읽기 — 크기를 줄이면 사라지므로 먼저 읽어 둬요 */
  function readExif(file) {
    var empty = { takenAt: '', lat: '', lng: '' };
    if (!file.slice || !window.DataView) return Promise.resolve(empty);
    var blob = file.slice(0, 262144);
    var p = blob.arrayBuffer ? blob.arrayBuffer() : new Promise(function (res, rej) { var r = new FileReader(); r.onload = function () { res(r.result); }; r.onerror = rej; r.readAsArrayBuffer(blob); });
    return p.then(function (buf) {
      try { return parseExif(new DataView(buf)) || empty; } catch (e) { return empty; }
    }, function () { return empty; }).then(function (x) {
      // 시간이 없으면 파일 날짜로 대신해요 (방금 만든 파일이면 쓰지 않아요)
      if (!x.takenAt && file.lastModified && Date.now() - file.lastModified > 5 * 60000) {
        var d = new Date(file.lastModified);
        x.takenAt = isoDay(d) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
        x.guess = true;
      }
      return x;
    });
  }
  function parseExif(v) {
    if (v.getUint16(0) !== 0xFFD8) return null;
    var off = 2, len = v.byteLength;
    while (off + 4 < len) {
      var marker = v.getUint16(off), size = v.getUint16(off + 2);
      if (marker === 0xFFE1 && v.getUint32(off + 4) === 0x45786966) return readTiff(v, off + 10);
      if ((marker & 0xFF00) !== 0xFF00) break;
      off += 2 + size;
    }
    return null;
  }
  function readTiff(v, t) {
    var le = v.getUint16(t) === 0x4949;
    function u16(o) { return v.getUint16(o, le); }
    function u32(o) { return v.getUint32(o, le); }
    function tags(ifd) {
      var out = {}, n = u16(t + ifd);
      for (var i = 0; i < n; i++) {
        var e = t + ifd + 2 + i * 12;
        out[u16(e)] = { type: u16(e + 2), count: u32(e + 4), at: e + 8 };
      }
      return out;
    }
    function str(tag) {
      if (!tag) return '';
      var o = tag.count > 4 ? t + u32(tag.at) : tag.at, s = '';
      for (var i = 0; i < tag.count - 1; i++) s += String.fromCharCode(v.getUint8(o + i));
      return s;
    }
    function gps(tag, ref) {
      if (!tag) return '';
      var o = t + u32(tag.at), r = function (k) { return u32(o + k * 8) / (u32(o + k * 8 + 4) || 1); };
      var val = r(0) + r(1) / 60 + r(2) / 3600;
      if (ref === 'S' || ref === 'W') val = -val;
      return Math.round(val * 1e6) / 1e6;
    }
    var ifd0 = tags(u32(t + 4)), res = { takenAt: '', lat: '', lng: '' };
    var dt = '';
    if (ifd0[0x8769]) { var ex = tags(u32(ifd0[0x8769].at)); dt = str(ex[0x9003]) || str(ex[0x9004]); }
    if (!dt) dt = str(ifd0[0x0132]);
    var m = /^(\d{4}):(\d{2}):(\d{2}) (\d{2}):(\d{2}):(\d{2})/.exec(dt);
    if (m) res.takenAt = m[1] + '-' + m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5] + ':' + m[6];
    if (ifd0[0x8825]) {
      var g = tags(u32(ifd0[0x8825].at));
      var lat = gps(g[0x0002], str(g[0x0001])), lng = gps(g[0x0004], str(g[0x0003]));
      if (lat && lng) { res.lat = lat; res.lng = lng; }
    }
    return res;
  }
  function takenLabel(p) {
    var m = /(\d{4})-(\d{2})-(\d{2})[ T](\d{2}):(\d{2})/.exec(p.takenAt || '');
    return m ? (+m[2]) + '/' + (+m[3]) + ' ' + m[4] + ':' + m[5] : '';
  }

  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      var url = URL.createObjectURL(file), img = new Image();
      img.onload = function () {
        var max = 1600, w = img.naturalWidth, h = img.naturalHeight, s = Math.min(1, max / Math.max(w, h));
        var c = document.createElement('canvas'); c.width = Math.round(w * s); c.height = Math.round(h * s);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', 0.82));
      };
      img.onerror = function () { URL.revokeObjectURL(url); reject(new Error('사진을 읽지 못했어요')); };
      img.src = url;
    });
  }

  /* ---------- 화면 그리기 ---------- */
  var screens = { start: screenStart, home: screenHome, schedule: screenSchedule, map: screenMap, photos: screenPhotos, reviews: screenReviews, notify: screenNotify, install: screenInstall, admin: screenAdmin };
  function route() { var r = (location.hash || '').replace(/^#\/?/, '').split('?')[0]; return screens[r] ? r : 'home'; }
  var pendingRender = false;

  function render(force) {
    var a = document.activeElement;
    if (!force && a && app.contains(a) && /INPUT|TEXTAREA|SELECT/.test(a.tagName)) { pendingRender = true; return; }
    pendingRender = false;
    var r = route();
    if (!me.name && r !== 'start' && r !== 'install') { location.replace('#/start'); return; }
    var y = window.scrollY;
    app.innerHTML = screens[r]();
    window.scrollTo(0, y);
    document.title = TITLE;
  }

  document.addEventListener('click', function (e) {
    var el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    var fn = actions[el.dataset.act];
    if (fn) { if (el.tagName === 'BUTTON') e.preventDefault(); fn(el, e); }
  });
  document.addEventListener('input', function (e) {
    var el = e.target, k = el.dataset && el.dataset.input;
    if (!k) return;
    if (k === 'startName') {
      ui.drafts.startName = el.value;
      var b = document.getElementById('startNext'); if (b) b.disabled = !el.value.trim();
    } else if (k === 'draft') {
      var pid = el.dataset.pid; ui.drafts['d-' + pid] = el.value;
      var btn = document.getElementById('post-' + pid);
      if (btn) { btn.disabled = !el.value.trim(); btn.textContent = el.value.trim() ? '한마디 남기기' : '한마디를 적으면 남길 수 있어요'; }
    }
  });
  document.addEventListener('change', function (e) {
    if (e.target.id === 'ph-files') {
      var n = e.target.files ? e.target.files.length : 0;
      var info = document.getElementById('pickInfo');
      if (info) info.textContent = n ? (Math.min(n, 10) + '장 골랐어요' + (n > 10 ? ' (10장까지만 올라가요)' : '')) : '여러 장을 한 번에 골라도 돼요 (최대 10장)';
      ui.uploadMsg = '';
    }
  });
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target.id === 'startName') actions.startNext();
    if (e.key === 'Enter' && e.target.id === 'pin') actions.adminIn();
  });
  document.addEventListener('focusout', function () { setTimeout(function () { if (pendingRender) render(); }, 200); });

  window.addEventListener('hashchange', function () {
    var r = route();
    if (r === 'notify') { ui.prevSeen = store.get('seenAt', ''); store.set('seenAt', new Date().toISOString()); }
    if (r !== 'schedule') ui.editing = null;
    layer.innerHTML = '';
    render(true);
    if (r === 'schedule' && ui._goto) return;
    window.scrollTo(0, 0);
  });
  window.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; if (route() === 'install') render(); });
  window.addEventListener('appinstalled', function () { deferredPrompt = null; toast('설치됐어요! 홈 화면의 ‘제주여행’ 아이콘으로 열어 주세요.'); });

  function refresh() { return api.load().then(function () { render(); }); }
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'visible') refresh(); });
  setInterval(function () { if (document.visibilityState === 'visible') refresh(); }, 30000);

  if ('serviceWorker' in navigator && location.protocol === 'https:') {
    window.addEventListener('load', function () { navigator.serviceWorker.register('sw.js').catch(function () {}); });
  }

  render(true);
  refresh();
})();
