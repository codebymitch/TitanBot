/* רשימות משותפות באתר העצמאי (Firebase / Firestore) — אותו ממשק כמו shared.js.
   ההרשאות (בעלים / עורך / מגיב / צופה) נאכפות בשרת לפי firestore.rules.
   מבנה: slists/{listId} · slists/{listId}/tasks/{taskId} · slists/{listId}/comments/{id} · invites/{code} */
window.SharedListsFirebase = function (ctx) {
  'use strict';
  const RANK = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
  const ROLE_NAME = { owner: 'בעלים', editor: 'עורך/ת', commenter: 'מגיב/ה', viewer: 'צופה' };
  let fs = null, db = null, me = null, myName = '', started = false;
  const listsById = {}, tasks = {}, subs = {};
  let timer = null;
  const changed = () => { clearTimeout(timer); timer = setTimeout(() => ctx.render(), 60); };
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');
  const ref = (path) => fs.doc(db, path);

  function start(opts) {
    stop();
    ({ fs, db } = opts);
    me = opts.uid; myName = opts.name || '';
    started = true;
    const q = fs.query(fs.collection(db, 'slists'), fs.where('memberIds', 'array-contains', me));
    subs.q = fs.onSnapshot(q, { includeMetadataChanges: true }, (qs) => {
      const seen = new Set();
      qs.docs.forEach((d) => { seen.add(d.id); listsById[d.id] = Object.assign({ id: d.id }, d.data()); if (!d.metadata.hasPendingWrites) ensureTasks(d.id); });
      Object.keys(listsById).forEach((id) => { if (!seen.has(id)) { delete listsById[id]; dropTasks(id); } });
      changed();
    }, () => {});
  }
  function stop() {
    Object.values(subs).forEach((u) => { try { u(); } catch (e) { /* ignore */ } });
    Object.keys(subs).forEach((k) => delete subs[k]);
    Object.keys(listsById).forEach((k) => delete listsById[k]);
    Object.keys(tasks).forEach((k) => delete tasks[k]);
    started = false; me = null;
  }
  function ensureTasks(id, attempt = 0) {
    if (subs['t' + id]) return;
    subs['t' + id] = fs.onSnapshot(fs.collection(db, `slists/${id}/tasks`), (qs) => {
      tasks[id] = qs.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      changed();
    }, () => {
      // למשל מיד אחרי יצירה/הצטרפות, לפני שהשרת סיים לעדכן את הרשימה — מנסים שוב
      delete subs['t' + id];
      if (attempt < 8 && listsById[id]) setTimeout(() => { if (started && listsById[id]) ensureTasks(id, attempt + 1); }, 800 * (attempt + 1));
    });
  }
  function dropTasks(id) { if (subs['t' + id]) { subs['t' + id](); delete subs['t' + id]; } delete tasks[id]; }

  const raw = (id) => listsById[id] || null;
  function role(id) {
    const l = raw(id);
    if (!l) return null;
    if (l.owner === me) return 'owner';
    return (l.members || {})[me] || null;
  }
  const can = (id, need) => { const r = role(id); return r != null && RANK[r] >= RANK[need]; };
  const lists = () => Object.values(listsById).filter((l) => role(l.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  const tasksOf = (id) => tasks[id] || [];
  function nameOf(uid) {
    if (uid === me) return 'אני';
    for (const l of Object.values(listsById)) if (l.names && l.names[uid]) return l.names[uid];
    return 'משתמש/ת';
  }
  const codeLabel = (sid, code) => code;

  // ---------- lists ----------
  async function shareLocal(local, localTasks) {
    const id = 's' + rand(12);
    await fs.setDoc(ref('slists/' + id), {
      name: local.name, emoji: local.emoji, color: local.color, owner: me, members: {}, memberIds: [me],
      names: { [me]: myName || 'בעל/ת הרשימה' }, invites: {}, createdAt: Date.now(), updatedAt: Date.now(),
    });
    for (const t of localTasks) {
      const d = Object.assign({}, t); delete d.id; delete d.listId;
      await fs.setDoc(ref(`slists/${id}/tasks/${t.id}`), Object.assign(d, { updatedBy: me, updatedAt: Date.now() }));
    }
    return id;
  }
  const updateList = (id, fields) => fs.updateDoc(ref('slists/' + id), Object.assign({}, fields, { updatedAt: Date.now() }));
  async function deleteList(id) {
    const l = raw(id);
    const [ts, cs] = await Promise.all([fs.getDocs(fs.collection(db, `slists/${id}/tasks`)), fs.getDocs(fs.collection(db, `slists/${id}/comments`))]);
    for (const d of ts.docs) await fs.deleteDoc(d.ref);
    for (const d of cs.docs) await fs.deleteDoc(d.ref);
    for (const code of Object.keys((l && l.invites) || {})) await fs.deleteDoc(ref('invites/' + code)).catch(() => {});
    await fs.deleteDoc(ref('slists/' + id));
  }
  async function createInvite(id, r) {
    const code = rand(10);
    await fs.setDoc(ref('invites/' + code), { listId: id, role: r, owner: me, createdAt: Date.now() });
    await fs.updateDoc(ref('slists/' + id), { ['invites.' + code]: r, updatedAt: Date.now() });
    return code;
  }
  async function revokeInvite(id, code) {
    await fs.deleteDoc(ref('invites/' + code)).catch(() => {});
    await fs.updateDoc(ref('slists/' + id), { ['invites.' + code]: fs.deleteField(), updatedAt: Date.now() });
  }
  const setRole = (id, uid, r) => fs.updateDoc(ref('slists/' + id), { ['members.' + uid]: r, updatedAt: Date.now() });
  const removeMember = (id, uid) => fs.updateDoc(ref('slists/' + id), { ['members.' + uid]: fs.deleteField(), memberIds: fs.arrayRemove(uid), updatedAt: Date.now() });
  async function join(codeStr) {
    const code = String(codeStr).trim().toLowerCase().replace(/^.*-/, '');
    if (!/^[a-z0-9]{6,20}$/.test(code)) throw new Error('bad-code');
    const inv = await fs.getDoc(ref('invites/' + code)).catch(() => null);
    if (!inv || !inv.exists()) throw new Error('bad-code');
    const { listId, role: r } = inv.data();
    if (raw(listId) && raw(listId).owner === me) return { id: listId, role: 'owner' };
    await fs.updateDoc(ref('slists/' + listId), {
      ['members.' + me]: r, ['names.' + me]: myName || 'משתמש/ת', memberIds: fs.arrayUnion(me),
      lastJoin: { uid: me, code }, updatedAt: Date.now(),
    });
    return { id: listId, role: r };
  }
  const leave = (id) => fs.updateDoc(ref('slists/' + id), { ['members.' + me]: fs.deleteField(), memberIds: fs.arrayRemove(me), updatedAt: Date.now() });

  // ---------- tasks ----------
  async function saveTask(id, tid, data) {
    const body = Object.assign({}, data, { updatedBy: me, updatedAt: Date.now() });
    delete body.id; delete body.listId;
    await fs.setDoc(ref(`slists/${id}/tasks/${tid || 't' + rand(12)}`), body);
  }
  const patchTask = (id, tid, fields) => fs.updateDoc(ref(`slists/${id}/tasks/${tid}`), Object.assign({}, fields, { updatedBy: me, updatedAt: Date.now() }));
  const deleteTask = (id, tid) => fs.deleteDoc(ref(`slists/${id}/tasks/${tid}`));

  // ---------- comments ----------
  function watchComments(id, tid, cb) {
    const q = fs.query(fs.collection(db, `slists/${id}/comments`), fs.where('taskId', '==', tid));
    return fs.onSnapshot(q, (qs) => cb(qs.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.ts - b.ts)), () => cb(null));
  }
  async function addComment(id, tid, text) {
    await fs.addDoc(fs.collection(db, `slists/${id}/comments`), { taskId: tid, author: me, authorName: myName || '', text, ts: Date.now() });
    const t = tasksOf(id).find((x) => x.id === tid);
    if (t) await patchTask(id, tid, { commentCount: (t.commentCount || 0) + 1 }).catch(() => {});
  }
  async function deleteComment(id, cid, tid) {
    await fs.deleteDoc(ref(`slists/${id}/comments/${cid}`));
    const t = tasksOf(id).find((x) => x.id === tid);
    if (t && t.commentCount) await patchTask(id, tid, { commentCount: t.commentCount - 1 }).catch(() => {});
  }

  return {
    ROLE_NAME, RANK,
    available: () => started, canWrite: () => true, me: () => me, start, stop,
    lists, raw, role, can, tasksOf, nameOf, codeLabel,
    shareLocal, updateList, deleteList, createInvite, revokeInvite, setRole, removeMember, join, leave,
    saveTask, patchTask, deleteTask, watchComments, addComment, deleteComment,
  };
};
