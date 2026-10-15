/**
 * 제주 가을여행 앱 — 저장 서버 (구글 Apps Script)
 *
 * 저장 위치
 *  - 구글 시트 '제주여행 기록' : 한마디 / 사진 목록 / 바뀐 기록 / 일정 상태
 *  - 구글 드라이브 '제주여행 사진' 폴더 : 1일차·2일차·3일차 폴더에 사진 원본
 *  → 여행이 끝나면 이 시트와 폴더로 추억 피드를 만들 수 있어요.
 *
 * 처음 한 번: 위쪽 메뉴에서 함수 'setup' 을 골라 ▶실행 → 권한 허용
 * 그다음: 배포 → 새 배포 → 웹 앱 (실행: 나 / 액세스: 모든 사용자) → 주소를 config.js 에 붙여 넣기
 */

var SHEETS = {
  comments: ['id', 'placeId', 'placeName', 'day', 'author', 'device', 'text', 'createdAt', 'updatedAt', 'deleted'],
  photos: ['id', 'placeId', 'placeName', 'day', 'author', 'device', 'fileId', 'createdAt', 'takenAt', 'takenGuess', 'lat', 'lng'],
  log: ['id', 'at', 'author', 'device', 'type', 'itemId', 'text'],
  state: ['key', 'json', 'updatedAt']
};

function setup() {
  var props = PropertiesService.getScriptProperties();
  var ss;
  if (props.getProperty('SHEET_ID')) {
    ss = SpreadsheetApp.openById(props.getProperty('SHEET_ID'));
  } else {
    ss = SpreadsheetApp.create('제주여행 기록');
    props.setProperty('SHEET_ID', ss.getId());
  }
  Object.keys(SHEETS).forEach(function (name) {
    var sh = ss.getSheetByName(name) || ss.insertSheet(name);
    if (sh.getLastRow() === 0) { sh.appendRow(SHEETS[name]); sh.setFrozenRows(1); }
  });
  var first = ss.getSheetByName('Sheet1') || ss.getSheetByName('시트1');
  if (first && ss.getSheets().length > 1) ss.deleteSheet(first);

  if (!props.getProperty('FOLDER_ID')) {
    var folder = DriveApp.createFolder('제주여행 사진');
    props.setProperty('FOLDER_ID', folder.getId());
  }
  Logger.log('준비 끝! 시트: ' + ss.getUrl());
  Logger.log('사진 폴더: ' + DriveApp.getFolderById(props.getProperty('FOLDER_ID')).getUrl());
}

/* ---------- 읽기 ---------- */
function doGet() {
  return json({ ok: true, state: readState() });
}

/* ---------- 쓰기 ---------- */
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    var b = JSON.parse(e.postData.contents);
    handle(b);
    return json({ ok: true, state: readState() });
  } catch (err) {
    return json({ ok: false, error: String(err && err.message ? err.message : err) });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

function handle(b) {
  var now = new Date().toISOString();
  var author = clip(b.author, 20) || '이름없음';
  var device = clip(b.device, 40);
  switch (b.action) {
    case 'change': {
      var changes = getState('changes', {});
      var cur = changes[b.itemId] || {};
      var p = b.patch || {};
      ['name', 'time', 'memo'].forEach(function (k) { if (p[k] !== undefined) cur[k] = clip(p[k], 80); });
      if (p.skipped !== undefined) cur.skipped = !!p.skipped;
      cur.by = author; cur.at = now;
      changes[b.itemId] = cur;
      setState('changes', changes);
      addLog(now, author, device, 'change', b.itemId, b.log);
      break;
    }
    case 'lunch': {
      var lunch = getState('lunch', {});
      lunch[b.itemId] = { optionId: clip(b.optionId, 20), by: author, at: now };
      setState('lunch', lunch);
      addLog(now, author, device, 'lunch', b.itemId, b.log);
      break;
    }
    case 'massage': {
      var d = b.data || {};
      setState('massage', { name: clip(d.name, 40), address: clip(d.address, 80), link: /^https:\/\//.test(d.link || '') ? clip(d.link, 200) : '', note: clip(d.note, 60), by: author, at: now });
      addLog(now, author, device, 'massage', 'd3-4', b.log);
      break;
    }
    case 'comment.add': {
      var text = clip(b.text, 300);
      if (!text) throw new Error('내용이 비어 있어요');
      sheet('comments').appendRow([uid('c'), b.placeId, cell(clip(b.placeName, 40)), clip(b.day, 10), cell(author), device, cell(text), now, '', false]);
      break;
    }
    case 'comment.edit':
    case 'comment.delete': {
      var sh = sheet('comments');
      var rows = sh.getDataRange().getValues();
      for (var i = 1; i < rows.length; i++) {
        if (rows[i][0] === b.id) {
          if (rows[i][5] !== device) throw new Error('내가 쓴 한마디만 고칠 수 있어요');
          if (b.action === 'comment.edit') {
            sh.getRange(i + 1, 7).setValue(cell(clip(b.text, 300)));
            sh.getRange(i + 1, 9).setValue(now);
          } else {
            sh.getRange(i + 1, 10).setValue(true);
          }
          break;
        }
      }
      break;
    }
    case 'photo.add': {
      var m = /^data:(image\/\w+);base64,(.+)$/.exec(b.dataUrl || '');
      if (!m) throw new Error('사진 형식이 올바르지 않아요');
      var blob = Utilities.newBlob(Utilities.base64Decode(m[2]), m[1], clip(b.filename, 80) || 'photo.jpg');
      var file = dayFolder(clip(b.day, 10)).createFile(blob);
      file.setDescription(author + ' · ' + clip(b.placeName, 40));
      try { file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW); } catch (x) { /* 회사 계정은 막혀 있을 수 있어요 */ }
      var taken = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(b.takenAt || '') ? "'" + b.takenAt : '';
      var lat = isFinite(+b.lat) && b.lat !== '' ? +b.lat : '', lng = isFinite(+b.lng) && b.lng !== '' ? +b.lng : '';
      sheet('photos').appendRow([uid('p'), b.placeId, cell(clip(b.placeName, 40)), clip(b.day, 10), cell(author), device, file.getId(), now, taken, taken ? !!b.takenGuess : '', lat, lng]);
      break;
    }
    default:
      throw new Error('알 수 없는 요청이에요');
  }
}

/* ---------- 상태 만들기 ---------- */
function readState() {
  var props = PropertiesService.getScriptProperties();
  var comments = rowsOf('comments').map(function (r) {
    return { id: r.id, placeId: r.placeId, placeName: r.placeName, day: r.day, author: r.author, device: r.device, text: String(r.text), createdAt: iso(r.createdAt), updatedAt: iso(r.updatedAt), deleted: r.deleted === true || r.deleted === 'TRUE' };
  }).filter(function (c) { return !c.deleted; });
  var photos = rowsOf('photos').map(function (r) {
    return { id: r.id, placeId: r.placeId, placeName: r.placeName, day: r.day, author: r.author, device: r.device,
      url: 'https://drive.google.com/file/d/' + r.fileId + '/view', thumb: 'https://drive.google.com/thumbnail?id=' + r.fileId + '&sz=w600', createdAt: iso(r.createdAt),
      takenAt: r.takenAt ? String(r.takenAt) : '', lat: r.lat === '' ? '' : r.lat, lng: r.lng === '' ? '' : r.lng };
  });
  var log = rowsOf('log').slice(-150).map(function (r) {
    return { id: r.id, at: iso(r.at), author: r.author, device: r.device, type: r.type, itemId: r.itemId, text: r.text };
  });
  return {
    changes: getState('changes', {}),
    lunch: getState('lunch', {}),
    massage: getState('massage', null),
    comments: comments,
    photos: photos,
    log: log,
    meta: {
      sheetUrl: 'https://docs.google.com/spreadsheets/d/' + props.getProperty('SHEET_ID'),
      folderUrl: 'https://drive.google.com/drive/folders/' + props.getProperty('FOLDER_ID')
    }
  };
}

/* ---------- 도우미 ---------- */
function ss_() { return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('SHEET_ID')); }
function sheet(name) { return ss_().getSheetByName(name); }
function rowsOf(name) {
  var v = sheet(name).getDataRange().getValues();
  var head = v.shift() || [];
  return v.filter(function (r) { return r[0] !== ''; }).map(function (r) {
    var o = {}; head.forEach(function (h, i) { o[h] = r[i]; }); return o;
  });
}
function getState(key, def) {
  var rows = sheet('state').getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === key) { try { return JSON.parse(rows[i][1]); } catch (e) { return def; } }
  return def;
}
function setState(key, val) {
  var sh = sheet('state'), rows = sh.getDataRange().getValues(), s = JSON.stringify(val), now = new Date().toISOString();
  for (var i = 1; i < rows.length; i++) if (rows[i][0] === key) { sh.getRange(i + 1, 2, 1, 2).setValues([[s, now]]); return; }
  sh.appendRow([key, s, now]);
}
function addLog(at, author, device, type, itemId, text) {
  sheet('log').appendRow([uid('l'), at, cell(author), device, type, itemId || '', cell(clip(text, 200))]);
}
function dayFolder(day) {
  var root = DriveApp.getFolderById(PropertiesService.getScriptProperties().getProperty('FOLDER_ID'));
  var name = day || '기타';
  var it = root.getFoldersByName(name);
  return it.hasNext() ? it.next() : root.createFolder(name);
}
function uid(p) { return p + new Date().getTime().toString(36) + Math.floor(Math.random() * 1e6).toString(36); }
// 시트에서 수식으로 오해받지 않도록
function cell(v) { return /^[=+\-@]/.test(v) ? "'" + v : v; }
function clip(v, n) { return v == null ? '' : String(v).slice(0, n); }
function iso(v) { return v instanceof Date ? v.toISOString() : (v ? String(v) : ''); }
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
