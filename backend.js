// 저장소 계층: Firebase(실제 공유) 또는 데모(이 브라우저에만 저장)
const FB = 'https://www.gstatic.com/firebasejs/10.12.2/';

export async function createBackend(config) {
  const ready = config && config.apiKey && config.projectId;
  return ready ? firebaseBackend(config) : demoBackend();
}

/* ───────────────────────── Firebase ───────────────────────── */
async function firebaseBackend(config) {
  const { initializeApp } = await import(FB + 'firebase-app.js');
  const A = await import(FB + 'firebase-auth.js');
  const F = await import(FB + 'firebase-firestore.js');

  const app = initializeApp(config);
  const auth = A.getAuth(app);
  const db = F.getFirestore(app);
  const toMs = (t) => (t && t.toMillis ? t.toMillis() : (t || Date.now()));

  return {
    mode: 'firebase',
    onAuth(cb) { A.onAuthStateChanged(auth, (u) => cb(u ? { uid: u.uid, email: u.email, name: u.displayName } : null)); },
    async signInGoogle() { await A.signInWithPopup(auth, new A.GoogleAuthProvider()); },
    async signInEmail(email, pw) { await A.signInWithEmailAndPassword(auth, email, pw); },
    async signUpEmail(email, pw) { await A.createUserWithEmailAndPassword(auth, email, pw); },
    async signOut() { await A.signOut(auth); },

    async getProfile(uid) {
      const s = await F.getDoc(F.doc(db, 'users', uid));
      return s.exists() ? s.data() : null;
    },
    async setProfile(uid, p) { await F.setDoc(F.doc(db, 'users', uid), p, { merge: true }); },
    async isAdmin(uid) {
      try { return (await F.getDoc(F.doc(db, 'admins', uid))).exists(); } catch { return false; }
    },

    async listProblems() {
      const q = F.query(F.collection(db, 'problems'), F.orderBy('createdAt', 'desc'), F.limit(300));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) }));
    },
    async getProblem(id) {
      const [p, d] = await Promise.all([F.getDoc(F.doc(db, 'problems', id)), F.getDoc(F.doc(db, 'problemData', id))]);
      if (!p.exists()) return null;
      return { problem: { id, ...p.data(), createdAt: toMs(p.data().createdAt) }, data: d.exists() ? d.data() : null };
    },
    async createProblem(meta, image, sealed) {
      const ref = F.doc(F.collection(db, 'problems'));
      const b = F.writeBatch(db);
      b.set(ref, { ...meta, solvedCount: 0, commentCount: 0, createdAt: F.serverTimestamp() });
      b.set(F.doc(db, 'problemData', ref.id), { authorUid: meta.authorUid, image, sealed });
      await b.commit();
      return ref.id;
    },
    async deleteProblem(id) {
      const b = F.writeBatch(db);
      b.delete(F.doc(db, 'problemData', id));
      b.delete(F.doc(db, 'problems', id));
      await b.commit();
    },

    async getSolved(uid, pid) {
      const s = await F.getDoc(F.doc(db, 'users', uid, 'solved', pid));
      return s.exists() ? s.data().answer : null;
    },
    async markSolved(uid, pid, answer) {
      const sref = F.doc(db, 'users', uid, 'solved', pid);
      if ((await F.getDoc(sref)).exists()) return false;
      const b = F.writeBatch(db);
      b.set(sref, { answer, at: F.serverTimestamp() });
      b.update(F.doc(db, 'problems', pid), { solvedCount: F.increment(1) });
      await b.commit();
      return true;
    },

    async listComments(pid) {
      const q = F.query(F.collection(db, 'problems', pid, 'comments'), F.orderBy('createdAt', 'asc'), F.limit(500));
      const snap = await F.getDocs(q);
      return snap.docs.map((d) => ({ id: d.id, ...d.data(), createdAt: toMs(d.data().createdAt) }));
    },
    async addComment(pid, c) {
      const ref = F.doc(F.collection(db, 'problems', pid, 'comments'));
      const b = F.writeBatch(db);
      b.set(ref, { ...c, createdAt: F.serverTimestamp() });
      b.update(F.doc(db, 'problems', pid), { commentCount: F.increment(1) });
      await b.commit();
    },
    async deleteComment(pid, cid) {
      const b = F.writeBatch(db);
      b.delete(F.doc(db, 'problems', pid, 'comments', cid));
      b.update(F.doc(db, 'problems', pid), { commentCount: F.increment(-1) });
      await b.commit();
    },
  };
}

/* ───────────────────────── 데모 (localStorage) ───────────────────────── */
function demoBackend() {
  const KEY = 'cms-demo-v1';
  const mem = { users: {}, problems: {}, data: {}, comments: {}, solved: {}, session: null };
  const load = () => { try { return JSON.parse(localStorage.getItem(KEY)) || mem; } catch { return mem; } };
  let st = load();
  const save = () => { try { localStorage.setItem(KEY, JSON.stringify(st)); } catch (e) { console.warn('저장 공간 부족', e); } };
  const id = () => Math.random().toString(36).slice(2, 12);
  let authCb = () => {};
  const emit = () => authCb(st.session ? { uid: st.session, email: st.session + '@demo' } : null);
  const fakeLogin = (key) => { st.session = 'demo-' + key.replace(/[^a-z0-9]/gi, '').slice(0, 20); save(); emit(); };

  return {
    mode: 'demo',
    onAuth(cb) { authCb = cb; setTimeout(emit, 0); },
    async signInGoogle() { fakeLogin('google'); },
    async signInEmail(email) { fakeLogin(email); },
    async signUpEmail(email) { fakeLogin(email); },
    async signOut() { st.session = null; save(); emit(); },
    async getProfile(uid) { return st.users[uid] || null; },
    async setProfile(uid, p) { st.users[uid] = { ...(st.users[uid] || {}), ...p }; save(); },
    async isAdmin() { return false; },

    async listProblems() { return Object.values(st.problems).map((p) => ({ ...p })).sort((a, b) => b.createdAt - a.createdAt); },
    async getProblem(pid) { const p = st.problems[pid]; return p ? { problem: { ...p }, data: st.data[pid] || null } : null; },
    async createProblem(meta, image, sealed) {
      const pid = id();
      st.problems[pid] = { id: pid, ...meta, solvedCount: 0, commentCount: 0, createdAt: Date.now() };
      st.data[pid] = { authorUid: meta.authorUid, image, sealed };
      save(); return pid;
    },
    async deleteProblem(pid) { delete st.problems[pid]; delete st.data[pid]; delete st.comments[pid]; save(); },
    async getSolved(uid, pid) { return st.solved[uid + '/' + pid] || null; },
    async markSolved(uid, pid, answer) {
      const k = uid + '/' + pid;
      if (st.solved[k]) return false;
      st.solved[k] = answer; if (st.problems[pid]) st.problems[pid].solvedCount++; save(); return true;
    },
    async listComments(pid) { return st.comments[pid] || []; },
    async addComment(pid, c) {
      (st.comments[pid] ||= []).push({ id: id(), ...c, createdAt: Date.now() });
      if (st.problems[pid]) st.problems[pid].commentCount++; save();
    },
    async deleteComment(pid, cid) {
      st.comments[pid] = (st.comments[pid] || []).filter((c) => c.id !== cid);
      if (st.problems[pid]) st.problems[pid].commentCount--; save();
    },
  };
}
