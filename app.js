import { firebaseConfig } from './firebase-config.js';
import { createBackend } from './backend.js';
import { sealSolution, openSolution, normalizeAnswer } from './crypto.js';

const $ = (s, el = document) => el.querySelector(s);
const view = $('#view');
const CAT = { math: '수학', science: '과학' };

const state = { user: null, profile: null, admin: false, problems: null, filter: 'all', q: '', sort: 'new' };
let be;

/* ───────── 유틸 ───────── */
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmtDate = (ms) => {
  const d = new Date(ms), diff = (Date.now() - ms) / 1000;
  if (diff < 60) return '방금';
  if (diff < 3600) return Math.floor(diff / 60) + '분 전';
  if (diff < 86400) return Math.floor(diff / 3600) + '시간 전';
  if (diff < 86400 * 7) return Math.floor(diff / 86400) + '일 전';
  return `${d.getFullYear()}.${d.getMonth() + 1}.${d.getDate()}`;
};
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.classList.add('show');
  clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('show'), 2600);
}
function renderMath(el) {
  if (window.renderMathInElement) {
    window.renderMathInElement(el, {
      delimiters: [{ left: '$$', right: '$$', display: true }, { left: '$', right: '$', display: false }, { left: '\\(', right: '\\)', display: false }],
      throwOnError: false,
    });
  }
}
const I = {
  check: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M5 12.5l4.5 4.5L19 7.5" stroke="currentColor" stroke-width="2.4" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  chat: '<svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true"><path d="M4 5h16v11H9l-5 4z" stroke="currentColor" stroke-width="2" fill="none" stroke-linejoin="round"/></svg>',
  lock: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><rect x="5" y="11" width="14" height="9" rx="2" stroke="currentColor" stroke-width="2" fill="none"/><path d="M8 11V8a4 4 0 0 1 8 0v3" stroke="currentColor" stroke-width="2" fill="none"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M15 5l-7 7 7 7" stroke="currentColor" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><circle cx="11" cy="11" r="6.5" stroke="currentColor" stroke-width="2" fill="none"/><path d="M16 16l4 4" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
  img: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" stroke="currentColor" stroke-width="1.8" fill="none"/><circle cx="9" cy="10" r="1.8" fill="currentColor"/><path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" stroke-width="1.8" fill="none"/></svg>',
};

/* 이미지 압축: 긴 변 maxDim, 목표 용량(바이트, dataURL 길이 기준) 이하가 될 때까지 품질 조정 */
async function compressImage(file, maxDim, target) {
  const bmp = await createImageBitmap(file);
  let scale = Math.min(1, maxDim / Math.max(bmp.width, bmp.height));
  for (let tries = 0; tries < 6; tries++) {
    const w = Math.round(bmp.width * scale), h = Math.round(bmp.height * scale);
    const c = document.createElement('canvas'); c.width = w; c.height = h;
    const g = c.getContext('2d'); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(bmp, 0, 0, w, h);
    for (const q of [0.85, 0.75, 0.65, 0.55]) {
      const url = c.toDataURL('image/jpeg', q);
      if (url.length <= target) return url;
    }
    scale *= 0.75;
  }
  throw new Error('이미지가 너무 커요. 더 작은 이미지를 사용해 주세요.');
}

/* ───────── 로그인 ───────── */
function needLogin() {
  if (state.user && state.profile?.nickname) return false;
  if (state.user) $('#nickDlg').showModal(); else openLogin();
  return true;
}
function openLogin() { $('#loginErr').textContent = ''; $('#loginDlg').showModal(); }
function authErr(e) {
  const m = String(e?.code || e?.message || e);
  if (m.includes('invalid-credential') || m.includes('wrong-password') || m.includes('user-not-found')) return '이메일 또는 비밀번호가 맞지 않아요.';
  if (m.includes('email-already-in-use')) return '이미 가입된 이메일이에요. 로그인해 주세요.';
  if (m.includes('weak-password')) return '비밀번호는 6자 이상이어야 해요.';
  if (m.includes('invalid-email')) return '이메일 형식을 확인해 주세요.';
  if (m.includes('popup-closed')) return '로그인 창이 닫혔어요.';
  if (m.includes('unauthorized-domain')) return '이 주소가 Firebase 승인 도메인에 없어요. (README 4단계 참고)';
  return '로그인하지 못했어요: ' + m;
}
function wireAuthUI() {
  $('#loginDlg').addEventListener('click', (e) => { if (e.target.closest('[data-close]') || e.target === $('#loginDlg')) $('#loginDlg').close(); });
  $('#googleBtn').onclick = async () => { try { await be.signInGoogle(); $('#loginDlg').close(); } catch (e) { $('#loginErr').textContent = authErr(e); } };
  const emailGo = (fn) => async () => {
    const em = $('#loginEmail').value.trim(), pw = $('#loginPw').value;
    if (!em || pw.length < 6) { $('#loginErr').textContent = '이메일과 6자 이상 비밀번호를 입력해 주세요.'; return; }
    try { await fn(em, pw); $('#loginDlg').close(); } catch (e) { $('#loginErr').textContent = authErr(e); }
  };
  $('#emailLoginBtn').onclick = emailGo((a, b) => be.signInEmail(a, b));
  $('#signupBtn').onclick = emailGo((a, b) => be.signUpEmail(a, b));
  $('#nickForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const n = $('#nickInput').value.trim();
    if (!n || n.length > 20) { $('#nickErr').textContent = '1~20자로 정해 주세요.'; return; }
    try {
      await be.setProfile(state.user.uid, { nickname: n });
      state.profile = { ...(state.profile || {}), nickname: n };
      $('#nickDlg').close(); renderUser(); toast(`${n}님, 환영해요!`); route();
    } catch (err) { $('#nickErr').textContent = '저장하지 못했어요: ' + (err.message || err); }
  });
}
function renderUser() {
  const slot = $('#userSlot');
  if (!state.user) {
    slot.innerHTML = `<button class="btn btn-ghost btn-sm" id="loginOpen">로그인</button>`;
    $('#loginOpen').onclick = openLogin;
  } else {
    slot.innerHTML = `<div class="userchip"><span>${esc(state.profile?.nickname || '닉네임 없음')}</span><button id="nickEdit" aria-label="닉네임 변경">변경</button><button id="logout">로그아웃</button></div>`;
    $('#nickEdit').onclick = () => { $('#nickInput').value = state.profile?.nickname || ''; $('#nickErr').textContent = ''; $('#nickDlg').showModal(); };
    $('#logout').onclick = async () => { await be.signOut(); toast('로그아웃했어요'); };
  }
}

/* ───────── 라우터 ───────── */
function route() {
  const h = location.hash.replace(/^#\/?/, '');
  const [seg, arg] = h.split('/');
  document.querySelectorAll('[data-nav]').forEach((a) => a.classList.remove('on'));
  if (seg === 'p' && arg) return showDetail(decodeURIComponent(arg));
  if (seg === 'new') return showNew();
  state.filter = seg === 'math' || seg === 'science' ? seg : 'all';
  $(`[data-nav="${state.filter}"]`)?.classList.add('on');
  showList();
}

/* ───────── 목록 ───────── */
async function showList(force) {
  view.innerHTML = `
    <section class="hero">
      <div class="eyebrow">Problem Explorer</div>
      <h1>문제 탐색</h1>
      <p>흥미로운 문제를 발견하고, 답을 맞혀 해설을 열어보세요.</p>
    </section>
    <div class="toolbar">
      <div class="seg" role="tablist" aria-label="분류">
        <a href="#/" class="${state.filter === 'all' ? 'on' : ''}">전체</a>
        <a href="#/math" class="${state.filter === 'math' ? 'on' : ''}">수학</a>
        <a href="#/science" class="${state.filter === 'science' ? 'on' : ''}">과학</a>
      </div>
      <label class="search">${I.search}<input id="q" type="search" placeholder="제목·내용·작성자 검색" value="${esc(state.q)}" aria-label="검색"></label>
      <select class="sort" id="sort" aria-label="정렬">
        <option value="new">최신순</option><option value="solved">많이 푼 순</option><option value="talk">댓글 많은 순</option><option value="hard">덜 풀린 순</option>
      </select>
    </div>
    <div id="list"><div class="loading">문제를 불러오는 중…</div></div>`;
  $('#sort').value = state.sort;
  $('#q').addEventListener('input', (e) => { state.q = e.target.value; drawList(); });
  $('#sort').addEventListener('change', (e) => { state.sort = e.target.value; drawList(); });
  if (!state.problems || force) {
    try { state.problems = await be.listProblems(); }
    catch (e) { $('#list').innerHTML = `<div class="empty"><h3>문제를 불러오지 못했어요</h3><p>${esc(e.message || e)}</p></div>`; return; }
  }
  drawList();
}
function drawList() {
  const box = $('#list'); if (!box) return;
  const q = state.q.trim().toLowerCase();
  let arr = state.problems.filter((p) => state.filter === 'all' || p.category === state.filter)
    .filter((p) => !q || [p.title, p.desc, p.authorName].some((s) => String(s || '').toLowerCase().includes(q)));
  const by = { new: (a, b) => b.createdAt - a.createdAt, solved: (a, b) => b.solvedCount - a.solvedCount, talk: (a, b) => b.commentCount - a.commentCount, hard: (a, b) => a.solvedCount - b.solvedCount };
  arr = [...arr].sort(by[state.sort]);
  if (!arr.length) {
    box.innerHTML = `<div class="empty"><h3>${q ? '검색 결과가 없어요' : '아직 문제가 없어요'}</h3><p>${q ? '다른 단어로 찾아보세요.' : '첫 번째 문제를 올려 보세요!'}</p>${q ? '' : '<a class="btn btn-primary" href="#/new">문제 올리기</a>'}</div>`;
    return;
  }
  box.innerHTML = `<div class="grid">${arr.map((p) => `
    <a class="card" href="#/p/${encodeURIComponent(p.id)}">
      <div class="thumb">${p.thumb ? `<img src="${esc(p.thumb)}" alt="" loading="lazy">` : ''}</div>
      <div class="card-body">
        <span class="chip ${esc(p.category)}">${CAT[p.category] || ''}</span>
        <h3 class="card-title tex">${esc(p.title)}</h3>
        <div class="meta"><span>${esc(p.authorName)} · ${fmtDate(p.createdAt)}</span>
          <span class="stat" title="맞힌 사람">${I.check}${p.solvedCount || 0}</span>
          <span class="stat" title="댓글">${I.chat}${p.commentCount || 0}</span></div>
      </div>
    </a>`).join('')}</div>`;
  renderMath(box);
}

/* ───────── 상세 ───────── */
async function showDetail(id) {
  view.innerHTML = `<a class="back" href="#/">${I.back}목록으로</a><div class="loading">불러오는 중…</div>`;
  let res;
  try { res = await be.getProblem(id); } catch (e) { res = null; }
  if (!res) { view.innerHTML = `<a class="back" href="#/">${I.back}목록으로</a><div class="empty"><h3>문제를 찾을 수 없어요</h3><p>삭제되었거나 주소가 잘못됐어요.</p></div>`; return; }
  const { problem: p, data } = res;
  const mine = state.user && state.user.uid === p.authorUid;
  const back = p.category ? `#/${p.category === 'math' ? 'math' : 'science'}` : '#/';

  view.innerHTML = `
    <a class="back" href="${back}">${I.back}목록으로</a>
    <div class="detail">
      <article class="panel panel-pad">
        <span class="chip ${esc(p.category)}">${CAT[p.category] || ''}</span>
        <h1 class="tex">${esc(p.title)}</h1>
        <div class="byline"><span>${esc(p.authorName)}</span><span>·</span><span>${fmtDate(p.createdAt)}</span>
          <span class="stat" id="solvedN">${I.check}${p.solvedCount || 0}명 맞힘</span>
          ${mine || state.admin ? `<button class="btn btn-danger btn-sm" id="delP" style="margin-left:auto">삭제</button>` : ''}</div>
        ${data?.image ? `<div class="problem-img" id="pimg"><img src="${esc(data.image)}" alt="${esc(p.title)} 문제 이미지"></div>` : ''}
        ${p.desc ? `<div class="desc tex">${esc(p.desc)}</div>` : ''}
      </article>
      <aside class="side">
        <section class="panel panel-pad answer-box">
          <h2>정답 입력</h2>
          <p class="muted" style="margin:0;font-size:14px">띄어쓰기·대소문자는 구분하지 않아요.</p>
          <form class="answer-row" id="ansForm">
            <input id="ans" placeholder="정답" autocomplete="off" aria-label="정답">
            <button class="btn btn-primary" id="ansBtn">확인</button>
          </form>
          <div class="feedback" id="fb" role="status"></div>
          <div id="solBox"><div class="lockhint">${I.lock}<span>정답을 맞히면 해설이 열려요.</span></div></div>
        </section>
        <section class="panel panel-pad comments">
          <h2>토론 <span class="muted" id="ccount" style="font-weight:600"></span></h2>
          <p class="muted" style="margin:0;font-size:13.5px">아직 못 푼 사람을 위해 정답은 직접 쓰지 말아 주세요.</p>
          <ul class="comment-list" id="clist"><li class="muted">불러오는 중…</li></ul>
          <div id="cform"></div>
        </section>
      </aside>
    </div>`;
  renderMath(view);

  $('#pimg')?.addEventListener('click', () => {
    const lb = document.createElement('div'); lb.className = 'lightbox';
    lb.innerHTML = `<img src="${esc(data.image)}" alt="">`; lb.onclick = () => lb.remove(); document.body.append(lb);
  });
  $('#delP')?.addEventListener('click', async () => {
    if (!confirm('이 문제를 삭제할까요? 되돌릴 수 없어요.')) return;
    try { await be.deleteProblem(id); state.problems = null; toast('삭제했어요'); location.hash = back; }
    catch (e) { toast('삭제하지 못했어요: ' + (e.message || e)); }
  });

  // 정답
  const reveal = (sol, first) => {
    $('#solBox').innerHTML = `<div class="solution"><h3>${I.check}해설</h3><div class="text tex">${esc(sol.text)}</div>${sol.image ? `<img src="${esc(sol.image)}" alt="해설 이미지">` : ''}</div>`;
    renderMath($('#solBox'));
    $('#fb').className = 'feedback ok';
    $('#fb').textContent = first ? '정답이에요! 해설이 열렸어요.' : '이미 맞힌 문제예요.';
  };
  let tries = 0;
  $('#ansForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const a = $('#ans').value;
    if (!normalizeAnswer(a)) return;
    $('#ansBtn').disabled = true; $('#fb').className = 'feedback'; $('#fb').textContent = '확인 중…';
    const sol = await openSolution(data?.sealed, a);
    $('#ansBtn').disabled = false;
    if (!sol) {
      tries++;
      $('#fb').className = 'feedback bad';
      $('#fb').textContent = tries >= 3 ? `아직 아니에요 (${tries}번째). 토론에서 힌트를 얻어 보세요.` : '아쉬워요, 다시 생각해 보세요.';
      $('#ansForm').classList.remove('shake'); void $('#ansForm').offsetWidth; $('#ansForm').classList.add('shake');
      return;
    }
    reveal(sol, true);
    try { localStorage.setItem('cms-solved-' + id, a); } catch {}
    if (state.user) {
      try { if (await be.markSolved(state.user.uid, id, a)) { p.solvedCount = (p.solvedCount || 0) + 1; state.problems = null; $('#solvedN').innerHTML = I.check + p.solvedCount + '명 맞힘'; } } catch (err) { console.warn(err); }
    } else {
      $('#fb').textContent = '정답이에요! (로그인하면 맞힌 기록이 남아요)';
    }
  });
  // 이전에 맞힌 문제면 자동으로 열기
  (async () => {
    let prev = null;
    try { prev = localStorage.getItem('cms-solved-' + id); } catch {}
    if (!prev && state.user) { try { prev = await be.getSolved(state.user.uid, id); } catch {} }
    if (prev) { const sol = await openSolution(data?.sealed, prev); if (sol) { $('#ans').value = prev; reveal(sol, false); } }
  })();

  loadComments(id, p);
}

async function loadComments(id, p) {
  const list = $('#clist'); if (!list) return;
  let cs = [];
  try { cs = await be.listComments(id); } catch (e) { list.innerHTML = `<li class="muted">댓글을 불러오지 못했어요.</li>`; }
  $('#ccount').textContent = cs.length ? cs.length : '';
  list.innerHTML = cs.length ? cs.map((c) => `
    <li class="comment"><div class="comment-head"><b>${esc(c.authorName)}</b><span>${fmtDate(c.createdAt)}</span>
      ${state.user && (state.user.uid === c.authorUid || state.admin) ? `<button class="linkbtn" data-del="${esc(c.id)}">삭제</button>` : ''}</div>
      <p class="tex">${esc(c.text)}</p></li>`).join('') : `<li class="muted" style="font-size:14px">첫 댓글을 남겨 보세요.</li>`;
  renderMath(list);
  list.querySelectorAll('[data-del]').forEach((b) => b.onclick = async () => {
    if (!confirm('댓글을 삭제할까요?')) return;
    try { await be.deleteComment(id, b.dataset.del); state.problems = null; loadComments(id, p); } catch (e) { toast('삭제하지 못했어요'); }
  });

  const f = $('#cform');
  if (!state.user || !state.profile?.nickname) {
    f.innerHTML = `<button class="btn btn-ghost" style="margin-top:14px;width:100%" id="cLogin">로그인하고 댓글 쓰기</button>`;
    $('#cLogin').onclick = () => needLogin();
    return;
  }
  f.innerHTML = `<form class="comment-form" id="cf"><textarea id="ctext" maxlength="2000" placeholder="풀이 아이디어, 질문, 힌트… ($수식$ 사용 가능)" aria-label="댓글"></textarea>
    <div class="row"><span>${esc(state.profile.nickname)}(으)로 작성</span><button class="btn btn-primary btn-sm" id="cbtn">등록</button></div></form>`;
  $('#cf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = $('#ctext').value.trim(); if (!text) return;
    $('#cbtn').disabled = true;
    try { await be.addComment(id, { text, authorUid: state.user.uid, authorName: state.profile.nickname }); state.problems = null; loadComments(id, p); }
    catch (err) { toast('등록하지 못했어요: ' + (err.message || err)); $('#cbtn').disabled = false; }
  });
}

/* ───────── 올리기 ───────── */
function showNew() {
  if (needLogin()) {
    view.innerHTML = `<div class="form-wrap"><div class="empty"><h3>로그인이 필요해요</h3><p>문제를 올리려면 로그인하고 닉네임을 정해 주세요.</p><button class="btn btn-primary" id="goLogin">로그인</button></div></div>`;
    $('#goLogin').onclick = () => needLogin();
    return;
  }
  view.innerHTML = `
    <div class="form-wrap">
      <a class="back" href="#/">${I.back}목록으로</a>
      <h1>문제 올리기</h1>
      <p class="muted" style="margin:0">정답과 해설은 잠겨서 저장돼요. 정답을 맞힌 사람만 해설을 볼 수 있어요.</p>
      <form class="form" id="nf" novalidate>
        <div class="field"><span>분류</span>
          <div class="seg" role="radiogroup" aria-label="분류">
            <button type="button" data-cat="math" class="on" role="radio" aria-checked="true">수학</button>
            <button type="button" data-cat="science" role="radio" aria-checked="false">과학</button>
          </div></div>
        <label class="field"><span>제목</span><input id="nTitle" maxlength="100" placeholder="예) 정사각형 안의 네 원"></label>
        <div class="field"><span>문제 이미지 <small>(필수 · 자동으로 용량을 줄여요)</small></span>
          <label class="drop" id="pDrop"><input type="file" accept="image/*" id="pFile" aria-label="문제 이미지 선택"><div id="pPrev">${I.img}<div>클릭하거나 이미지를 끌어다 놓으세요</div></div></label></div>
        <label class="field"><span>설명 <small>(선택)</small></span><textarea id="nDesc" maxlength="3000" placeholder="조건이나 추가 설명"></textarea></label>
        <fieldset class="fieldset"><legend>정답 · 해설 (잠김)</legend>
          <label class="field"><span>정답</span><input id="nAns" maxlength="200" placeholder="예) 12"></label>
          <label class="field"><span>함께 인정할 답 <small>(선택, 쉼표로 구분)</small></span><input id="nAlt" maxlength="500" placeholder="예) 12개, twelve"></label>
          <label class="field"><span>해설</span><textarea id="nSol" maxlength="8000" placeholder="풀이 과정을 적어 주세요"></textarea></label>
          <div class="field"><span>해설 이미지 <small>(선택)</small></span>
            <label class="drop small" id="sDrop"><input type="file" accept="image/*" id="sFile" aria-label="해설 이미지 선택"><div id="sPrev">${I.img}<div>풀이 사진이 있으면 올려 주세요</div></div></label></div>
        </fieldset>
        <p class="tip">수식은 <code>$x^2+y^2=r^2$</code>처럼 $ 사이에 쓰면 예쁘게 보여요.</p>
        <p class="form-err" id="nErr" role="alert"></p>
        <div class="form-actions"><a class="btn btn-ghost" href="#/">취소</a><button class="btn btn-primary" id="nSubmit">올리기</button></div>
      </form>
    </div>`;

  let cat = 'math', pImg = null, sImg = null;
  view.querySelectorAll('[data-cat]').forEach((b) => b.onclick = () => {
    cat = b.dataset.cat;
    view.querySelectorAll('[data-cat]').forEach((x) => { x.classList.toggle('on', x === b); x.setAttribute('aria-checked', x === b); });
  });
  const wireDrop = (drop, input, prev, maxDim, target, set) => {
    const take = async (file) => {
      if (!file || !file.type.startsWith('image/')) return;
      prev.innerHTML = '이미지 준비 중…';
      try { const url = await compressImage(file, maxDim, target); set(url); prev.innerHTML = `<img src="${url}" alt="미리보기">`; }
      catch (e) { set(null); prev.textContent = e.message; }
    };
    input.onchange = () => take(input.files[0]);
    drop.addEventListener('dragover', (e) => { e.preventDefault(); drop.classList.add('over'); });
    drop.addEventListener('dragleave', () => drop.classList.remove('over'));
    drop.addEventListener('drop', (e) => { e.preventDefault(); drop.classList.remove('over'); take(e.dataTransfer.files[0]); });
  };
  wireDrop($('#pDrop'), $('#pFile'), $('#pPrev'), 1600, 420000, (u) => pImg = u);
  wireDrop($('#sDrop'), $('#sFile'), $('#sPrev'), 1400, 260000, (u) => sImg = u);

  $('#nf').addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('#nErr'); err.textContent = '';
    const title = $('#nTitle').value.trim(), desc = $('#nDesc').value.trim();
    const ans = $('#nAns').value.trim(), alts = $('#nAlt').value.split(',').map((s) => s.trim()).filter(Boolean);
    const sol = $('#nSol').value.trim();
    if (!title) return err.textContent = '제목을 입력해 주세요.';
    if (!pImg) return err.textContent = '문제 이미지를 올려 주세요.';
    if (!normalizeAnswer(ans)) return err.textContent = '정답을 입력해 주세요.';
    if (!sol && !sImg) return err.textContent = '해설(글 또는 이미지)을 넣어 주세요.';
    const btn = $('#nSubmit'); btn.disabled = true; btn.textContent = '올리는 중…';
    try {
      const thumb = await compressImage(await (await fetch(pImg)).blob(), 520, 60000);
      const sealed = await sealSolution([ans, ...alts], { text: sol, image: sImg || null });
      const id = await be.createProblem({
        title, desc, category: cat, thumb, authorUid: state.user.uid, authorName: state.profile.nickname,
      }, pImg, sealed);
      try { localStorage.setItem('cms-solved-' + id, ans); } catch {}
      state.problems = null;
      toast('문제를 올렸어요!');
      location.hash = '#/p/' + id;
    } catch (ex) {
      err.textContent = '올리지 못했어요: ' + (ex.message || ex);
      btn.disabled = false; btn.textContent = '올리기';
    }
  });
}

/* ───────── 시작 ───────── */
(async function start() {
  try { be = await createBackend(firebaseConfig); }
  catch (e) {
    view.innerHTML = `<div class="empty" style="margin-top:40px"><h3>Firebase에 연결하지 못했어요</h3><p>${esc(e.message || e)}</p></div>`;
    return;
  }
  if (be.mode === 'demo') $('#demoBanner').hidden = false;
  wireAuthUI();
  renderUser();
  be.onAuth(async (u) => {
    state.user = u; state.profile = null; state.admin = false;
    if (u) {
      try { state.profile = await be.getProfile(u.uid); } catch {}
      try { state.admin = await be.isAdmin(u.uid); } catch {}
      if (!state.profile?.nickname) {
        $('#nickInput').value = (u.name || '').slice(0, 20); $('#nickErr').textContent = '';
        if (!$('#nickDlg').open) $('#nickDlg').showModal();
      }
    }
    renderUser();
    route();
  });
  window.addEventListener('hashchange', () => { window.scrollTo(0, 0); route(); });
  // KaTeX가 늦게 로드되면 한 번 더 렌더
  window.addEventListener('load', () => renderMath(view));
})();
