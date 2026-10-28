/*
 * app.js — 좌우 분할 데모 하네스
 *
 * 이 파일은 버려지는 쪽이다. 규칙은 하나도 여기에 없고 전부 intro-request.js 에 있다.
 * 여기가 하는 일은 세 가지뿐이다: 그리기 / 클릭을 상태 기계 호출로 바꾸기 / 저장.
 */
(function () {
  'use strict';

  var IR = globalThis.IntroRequest;
  var DAY = IR.DAY;

  var SINGLE_ID = 'single_me';
  var SINGLE_NAME = '양경준';
  var MATCHMAKERS = [
    { id: 'mm_1', name: '김선영', rel: '대학 선배 · 기혼' },
    { id: 'mm_2', name: '박지훈', rel: '전 직장 동료 · 기혼' },
    { id: 'mm_3', name: '이수진', rel: '사촌 누나 · 기혼' }
  ];
  var KEY = 'jieum_intro_request_v1';

  var state = load();
  var draft = freshDraft();
  var resetArmed = false;

  /* ── 저장 ─────────────────────────────── */
  function fresh() {
    return {
      store: IR.createStore({ matchmakers: MATCHMAKERS }),
      now: Date.now(),
      activeMm: 'mm_1'
    };
  }

  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        if (parsed && parsed.store && parsed.store.requests) return parsed;
      }
    } catch (e) { /* file:// 에서 막히면 그냥 메모리로 간다 */ }
    return fresh();
  }

  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) {}
  }

  function freshDraft() {
    var conditions = {};
    IR.FIELD_KEYS.forEach(function (key) { conditions[key] = { grade: 'any', value: null }; });
    return { matchmakerId: null, conditions: conditions, note: '', editingId: null };
  }

  /* ── 작은 도구들 ──────────────────────── */
  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function mmName(id) {
    for (var i = 0; i < MATCHMAKERS.length; i++) if (MATCHMAKERS[i].id === id) return MATCHMAKERS[i].name;
    return id;
  }

  function fmtDate(ms) {
    var d = new Date(ms);
    var w = ['일', '월', '화', '수', '목', '금', '토'][d.getDay()];
    return d.getFullYear() + '. ' + String(d.getMonth() + 1).padStart(2, '0') + '. ' +
           String(d.getDate()).padStart(2, '0') + '. (' + w + ')';
  }

  function daysLeft(request) {
    return Math.max(0, Math.ceil((request.expiresAt - state.now) / DAY));
  }

  function mustCount() {
    return IR.FIELD_KEYS.filter(function (k) { return draft.conditions[k].grade === 'must'; }).length;
  }

  function notice(message) {
    var el = document.getElementById('gateNotice');
    if (!message) { el.className = 'notice'; el.textContent = ''; return; }
    el.className = 'notice on';
    el.textContent = message;
  }

  var BLOCK_SHORT = {
    DUPLICATE_ACTIVE: '진행 중인 부탁 있음',
    ACTIVE_LIMIT_REACHED: '동시 3건을 다 썼습니다',
    MATCHMAKER_WINDOW_LIMIT: '30일 2건 상한',
    UNKNOWN_MATCHMAKER: '연결되지 않음'
  };

  /* ── 그리기 ───────────────────────────── */
  function render() {
    state.store = IR.tick(state.store, state.now);

    renderClock();
    renderMatchmakers();
    renderConditions();
    renderNote();
    renderSendBar();
    renderMyList();
    renderTabs();
    renderInbox();

    save();
  }

  function renderClock() {
    document.getElementById('clockDate').textContent = fmtDate(state.now);
    document.getElementById('resetBtn').textContent = resetArmed ? '정말 지울까요?' : '처음부터';
  }

  function renderMatchmakers() {
    var left = IR.remainingSlots(state.store, SINGLE_ID, state.now);
    document.getElementById('slotInfo').textContent = '남은 칸 ' + left + ' / ' + IR.RULES.maxActiveRequests;

    var editing = !!draft.editingId;

    document.getElementById('mmRow').innerHTML = MATCHMAKERS.map(function (m) {
      var gate = IR.canSend(state.store, SINGLE_ID, m.id, state.now);
      var blocked = !gate.ok;
      var sub = m.rel;

      if (blocked) {
        if (gate.error === 'COOLDOWN_ACTIVE') {
          sub = gate.message.replace(/^.*?(\d+)일 남았습니다\.$/, '$1일 뒤에 다시');
          if (sub === gate.message) sub = '쿨다운 중';
        } else {
          sub = BLOCK_SHORT[gate.error] || '지금은 어려움';
        }
      }

      var selected = draft.matchmakerId === m.id;
      // 수정 중에는 받는 사람을 바꿀 수 없다. 수정은 내용만 고치는 일이다.
      var disabled = editing ? true : blocked;

      return '<button class="mm" data-mm="' + m.id + '" aria-pressed="' + (selected ? 'true' : 'false') + '"' +
             (disabled ? ' disabled' : '') + '>' +
             '<div class="mm-name">' + esc(m.name) + '</div>' +
             '<div class="mm-sub">' + esc(sub) + '</div>' +
             '</button>';
    }).join('');
  }

  function renderConditions() {
    document.getElementById('condList').innerHTML = IR.FIELDS.map(function (field) {
      var entry = draft.conditions[field.key];
      var options = field.options.map(function (opt) {
        return '<option value="' + esc(opt) + '"' + (entry.value === opt ? ' selected' : '') + '>' + esc(opt) + '</option>';
      }).join('');

      var grades = [
        { g: 'must', t: '필수' },
        { g: 'prefer', t: '선호' },
        { g: 'any', t: '상관없음' }
      ].map(function (x) {
        return '<button type="button" data-grade="' + x.g + '" aria-pressed="' +
               (entry.grade === x.g ? 'true' : 'false') + '">' + x.t + '</button>';
      }).join('');

      return '<div class="cond" data-field="' + field.key + '">' +
             '<div class="cond-label">' + esc(field.label) + '</div>' +
             '<div class="grades">' + grades + '</div>' +
             '<select data-value-for="' + field.key + '"' + (entry.grade === 'any' ? ' disabled' : '') + '>' +
             (entry.grade === 'any' ? '<option>—</option>' : options) +
             '</select></div>';
    }).join('');

    var count = mustCount();
    var pips = '';
    for (var i = 0; i < IR.RULES.maxMust; i++) {
      pips += '<span class="pip' + (i < count ? ' on' : '') + '"></span>';
    }
    document.getElementById('mustMeter').innerHTML = pips + '<span>필수 ' + count + ' / ' + IR.RULES.maxMust + '</span>';
  }

  function renderNote() {
    var box = document.getElementById('note');
    if (box.value !== draft.note) box.value = draft.note;
    document.getElementById('noteCount').textContent = draft.note.length + ' / ' + IR.RULES.maxNoteLength;
  }

  function renderSendBar() {
    var editing = !!draft.editingId;
    document.getElementById('sendBtn').textContent = editing ? '수정 저장' : '부탁 보내기';
    document.getElementById('cancelEditBtn').style.display = editing ? '' : 'none';
  }

  function condBadges(request, withPrefer) {
    var html = IR.mustConditions(request).map(function (c) {
      return '<span class="badge">' + esc(c.label) + ' · ' + esc(c.value) + '</span>';
    }).join('');
    if (withPrefer) {
      html += IR.preferConditions(request).map(function (c) {
        return '<span class="badge prefer">' + esc(c.label) + ' · ' + esc(c.value) + '</span>';
      }).join('');
    }
    return '<div class="badges">' + (html || '<span class="badge prefer">조건 없음</span>') + '</div>';
  }

  function stateClass(request, forSingle) {
    if (request.state === 'closed') return 'closed';
    if (request.state === 'accepted') return 'searching';
    if (!forSingle && request.state === 'sent' && !request.readAt) return 'fresh';
    return '';
  }

  /* 왼쪽: 내가 보낸 부탁 */
  function renderMyList() {
    var mine = state.store.requests
      .filter(function (r) { return r.singleId === SINGLE_ID; })
      .sort(function (a, b) {
        var act = (IR.isActive(b) ? 1 : 0) - (IR.isActive(a) ? 1 : 0);
        return act !== 0 ? act : b.createdAt - a.createdAt;
      });

    if (!mine.length) {
      document.getElementById('myList').innerHTML =
        '<div class="empty">아직 보낸 부탁이 없습니다.</div>';
      return;
    }

    document.getElementById('myList').innerHTML = mine.map(function (r) {
      var closed = r.state === 'closed';
      var canEdit = r.state === 'sent' && !r.readAt;

      var actions = '';
      if (IR.isActive(r)) {
        if (canEdit) actions += '<button class="btn ghost sm" data-edit="' + r.id + '">고치기</button>';
        actions += '<button class="btn ghost sm" data-cancel="' + r.id + '">부탁 거두기</button>';
      }

      // 싱글에게는 closedReason 을 보여주지 않는다. 종료와 만료가 구분되면 안 된다.
      var meta = closed
        ? '보낸 날 ' + fmtDate(r.createdAt).slice(0, 12) + ' · 닫힌 날 ' + fmtDate(r.closedAt).slice(0, 12)
        : '보낸 날 ' + fmtDate(r.createdAt).slice(0, 12) + ' · 앞으로 ' + daysLeft(r) + '일';

      return '<div class="req' + (closed ? ' closed' : '') + '">' +
        '<div class="req-top">' +
          '<span class="req-who">' + esc(mmName(r.matchmakerId)) + ' 님께</span>' +
          '<span class="state ' + stateClass(r, true) + '">' + esc(IR.singleLabel(r)) + '</span>' +
        '</div>' +
        condBadges(r, true) +
        (r.note ? '<p class="note">' + esc(r.note) + '</p>' : '') +
        '<div class="meta">' + esc(meta) + '</div>' +
        (actions ? '<div class="req-actions">' + actions + '</div>' : '') +
      '</div>';
    }).join('');
  }

  /* 오른쪽: 주선자 탭 */
  function renderTabs() {
    document.getElementById('mmTabs').innerHTML = MATCHMAKERS.map(function (m) {
      var open = IR.inboxOf(state.store, m.id, state.now).filter(IR.isActive).length;
      return '<button class="tab" data-tab="' + m.id + '" aria-pressed="' +
             (state.activeMm === m.id ? 'true' : 'false') + '">' +
             esc(m.name) + '<span class="n">' + open + '</span></button>';
    }).join('');
  }

  function renderInbox() {
    var items = IR.inboxOf(state.store, state.activeMm, state.now).sort(function (a, b) {
      var act = (IR.isActive(b) ? 1 : 0) - (IR.isActive(a) ? 1 : 0);
      return act !== 0 ? act : b.createdAt - a.createdAt;
    });

    if (!items.length) {
      document.getElementById('inbox').innerHTML =
        '<div class="empty">받은 소개 부탁이 없습니다.</div>';
      return;
    }

    document.getElementById('inbox').innerHTML = items.map(function (r) {
      var read = !!r.readAt;
      var closed = r.state === 'closed';

      var actions = [];
      if (r.state === 'sent' || r.state === 'held') actions.push(['accept', '찾아볼게요']);
      if (r.state === 'sent') actions.push(['hold', '조금 뒤에']);
      if (IR.isActive(r)) actions.push(['decline', '이번엔 어렵겠어요']);

      var actionHtml = actions.map(function (a) {
        var primary = a[0] === 'accept';
        return '<button class="btn ' + (primary ? '' : 'ghost ') + 'sm" data-act="' + a[0] +
               '" data-id="' + r.id + '">' + a[1] + '</button>';
      }).join('');

      // 주선자는 자기가 한 행동이므로 이유를 봐도 된다. 숨기는 쪽은 싱글이다.
      var closedText = {
        declined: '내가 종료했습니다',
        expired: '기한이 지나 닫혔습니다',
        cancelled: '상대가 부탁을 거두었습니다'
      }[r.closedReason];

      var body = read
        ? condBadges(r, true) + (r.note ? '<p class="note">' + esc(r.note) + '</p>' : '')
        : condBadges(r, false) +
          '<div class="veil">양보 가능한 조건과 한마디는 열어본 뒤에 보입니다. ' +
          '열어보면 상대는 더 이상 내용을 고칠 수 없습니다.</div>';

      var meta = closed
        ? esc(closedText) + ' · ' + fmtDate(r.closedAt).slice(0, 12)
        : '받은 날 ' + fmtDate(r.createdAt).slice(0, 12) + ' · 앞으로 ' + daysLeft(r) + '일';

      var openBtn = (!read && IR.isActive(r))
        ? '<button class="btn ghost sm" data-act="read" data-id="' + r.id + '">열어보기</button>'
        : '';

      return '<div class="req' + (closed ? ' closed' : '') + '">' +
        '<div class="req-top">' +
          '<span class="req-who">' + esc(SINGLE_NAME) + ' 님의 부탁</span>' +
          '<span class="state ' + stateClass(r, false) + '">' + esc(IR.matchmakerLabel(r)) + '</span>' +
        '</div>' +
        body +
        '<div class="meta">' + meta + '</div>' +
        (openBtn || actionHtml
          ? '<div class="req-actions">' + openBtn + actionHtml + '</div>'
          : '') +
      '</div>';
    }).join('');
  }

  /* ── 이벤트 ───────────────────────────── */
  function apply(result) {
    if (!result.ok) { notice(result.message); render(); return false; }
    state.store = result.store;
    notice('');
    render();
    return true;
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest('button');
    if (!el) return;

    // 주선자 고르기
    if (el.dataset.mm) {
      draft.matchmakerId = draft.matchmakerId === el.dataset.mm ? null : el.dataset.mm;
      notice('');
      render();
      return;
    }

    // 등급 바꾸기
    if (el.dataset.grade) {
      var key = el.closest('.cond').dataset.field;
      var entry = draft.conditions[key];
      var next = el.dataset.grade;

      if (next === 'must' && entry.grade !== 'must' && mustCount() >= IR.RULES.maxMust) {
        notice('필수 조건은 최대 ' + IR.RULES.maxMust + '개입니다. 하나를 "선호"로 내려놓아야 새로 고를 수 있습니다. ' +
               '— 무엇을 양보할지 고르는 일이 이 기능의 핵심입니다.');
        return;
      }

      entry.grade = next;
      if (next === 'any') entry.value = null;
      else if (!entry.value) entry.value = IR.fieldOptions(key)[0];
      notice('');
      render();
      return;
    }

    // 탭
    if (el.dataset.tab) { state.activeMm = el.dataset.tab; render(); return; }

    // 보내기 / 수정 저장
    if (el.id === 'sendBtn') {
      if (!draft.matchmakerId) { notice('부탁을 건넬 주선자를 한 분 골라 주세요.'); return; }
      var payload = {
        singleId: SINGLE_ID,
        matchmakerId: draft.matchmakerId,
        conditions: draft.conditions,
        note: draft.note
      };
      var ok = draft.editingId
        ? apply(IR.edit(state.store, draft.editingId, payload, state.now))
        : apply(IR.send(state.store, payload, state.now));
      if (ok) { draft = freshDraft(); render(); }
      return;
    }

    if (el.id === 'cancelEditBtn') { draft = freshDraft(); notice(''); render(); return; }

    // 싱글 액션
    if (el.dataset.cancel) { apply(IR.cancel(state.store, el.dataset.cancel, state.now)); return; }

    if (el.dataset.edit) {
      var target = state.store.requests.filter(function (r) { return r.id === el.dataset.edit; })[0];
      if (!target) return;
      draft = {
        matchmakerId: target.matchmakerId,
        conditions: JSON.parse(JSON.stringify(target.conditions)),
        note: target.note,
        editingId: target.id
      };
      notice('');
      render();
      document.getElementById('gate').scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }

    // 주선자 액션
    if (el.dataset.act) {
      var fn = { read: IR.markRead, accept: IR.accept, hold: IR.hold, decline: IR.decline }[el.dataset.act];
      apply(fn(state.store, el.dataset.id, state.now));
      return;
    }

    // 마당
    if (el.dataset.advance) {
      state.now += Number(el.dataset.advance) * DAY;
      resetArmed = false;
      notice('');
      render();
      return;
    }

    if (el.id === 'resetBtn') {
      if (!resetArmed) { resetArmed = true; renderClock(); return; }
      resetArmed = false;
      state = fresh();
      draft = freshDraft();
      notice('');
      render();
      return;
    }
  });

  document.addEventListener('change', function (event) {
    var field = event.target.dataset && event.target.dataset.valueFor;
    if (!field) return;
    draft.conditions[field].value = event.target.value;
    save();
  });

  document.addEventListener('input', function (event) {
    if (event.target.id !== 'note') return;
    draft.note = event.target.value;
    document.getElementById('noteCount').textContent = draft.note.length + ' / ' + IR.RULES.maxNoteLength;
  });

  render();
})();
