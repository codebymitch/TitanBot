/* רשימות משותפות (כשהאתר רץ בתוך claude.ai): רשימה עם בעלים, חברים לפי תפקיד (עורך / מגיב / צופה),
   קודי הזמנה, משימות ותגובות במסד המשותף של האפליקציה.
   מבנה: slists/{listId} · slists/{listId}/tasks/{taskId} · slists/{listId}/comments/{commentId}
   ההרשאות לפי תפקיד נאכפות בממשק. השרת מבחין רק בין מי שיכול לכתוב באפליקציה (בעלים/עורכים שהוזמנו) לבין צופים. */
window.SharedLists = function (ctx) {
  'use strict';
  const RANK = { viewer: 0, commenter: 1, editor: 2, owner: 3 };
  const ROLE_NAME = { owner: 'בעלים', editor: 'עורך/ת', commenter: 'מגיב/ה', viewer: 'צופה' };
  const JKEY = 'shared-joined';
  let db = null, user = null, me = null, canWrite = false, started = false;
  const fromQuery = {}, fromJoined = {}, tasks = {}, subs = {};
  const names = {};
  let joined = (() => { try { return JSON.parse(localStorage.getItem(JKEY) || '[]'); } catch (e) { return []; } })();
  let timer = null;
  const changed = () => { clearTimeout(timer); timer = setTimeout(() => ctx.render(), 60); };
  const saveJoined = () => { try { localStorage.setItem(JKEY, JSON.stringify(joined)); } catch (e) { /* ignore */ } };
  const rand = (n) => Array.from(crypto.getRandomValues(new Uint8Array(n)), (b) => 'abcdefghjkmnpqrstuvwxyz23456789'[b % 31]).join('');

  function start(opts) {
    if (started || !opts.db || !opts.me) return;
    ({ db, user, me } = opts);
    canWrite = opts.canWrite !== false;
    started = true;
    subs.q = db.collection('slists').where('memberIds', 'array-contains', me).onSnapshot((qs) => {
      Object.keys(fromQuery).forEach((k) => delete fromQuery[k]);
      qs.docs.forEach((d) => { fromQuery[d.id] = Object.assign({ id: d.id }, d.data()); ensureTasks(d.id); });
      changed();
    }, () => {});
    joined.forEach((j) => subJoined(j.id));
  }
  function subJoined(id) {
    if (subs['l' + id]) return;
    subs['l' + id] = db.doc('slists/' + id).onSnapshot((s) => {
      if (s.exists) { fromJoined[id] = Object.assign({ id }, s.data()); ensureTasks(id); } else delete fromJoined[id];
      changed();
    }, () => {});
  }
  function ensureTasks(id) {
    if (subs['t' + id]) return;
    subs['t' + id] = db.collection('slists/' + id + '/tasks').onSnapshot((qs) => {
      tasks[id] = qs.docs.map((d) => Object.assign({ id: d.id }, d.data()));
      changed();
    }, () => {});
  }

  const raw = (id) => fromQuery[id] || fromJoined[id] || null;
  function role(id) {
    const l = raw(id);
    if (!l) return null;
    if (l.owner === me) return 'owner';
    let r = (l.members || {})[me] || null;
    if (!r) { const j = joined.find((x) => x.id === id); if (j && (l.invites || {})[j.code]) r = l.invites[j.code]; }
    if (r && !canWrite) r = 'viewer';
    return r;
  }
  const can = (id, need) => { const r = role(id); return r != null && RANK[r] >= RANK[need]; };
  function lists() {
    const ids = new Set(Object.keys(fromQuery).concat(Object.keys(fromJoined)));
    return [...ids].map(raw).filter((l) => l && role(l.id)).sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0));
  }
  const tasksOf = (id) => tasks[id] || [];

  // ---------- names ----------
  function nameOf(id) {
    if (id === me) return 'אני';
    if (names[id] === undefined && user) {
      names[id] = '';
      user.profiles([id]).then((ps) => { if (ps[id] && ps[id].name) { names[id] = ps[id].name; changed(); } }).catch(() => {});
    }
    return names[id] || 'משתמש/ת';
  }

  // ---------- lists ----------
  async function shareLocal(local, localTasks) {
    if (!canWrite) throw new Error('no-write');
    const id = 's' + rand(10);
    await db.doc('slists/' + id).set({ name: local.name, emoji: local.emoji, color: local.color, owner: me, members: {}, memberIds: [me], invites: {}, createdAt: Date.now(), updatedAt: Date.now() });
    for (const t of localTasks) {
      const d = Object.assign({}, t); delete d.id; delete d.listId;
      await db.doc(`slists/${id}/tasks/${t.id}`).set(Object.assign(d, { updatedBy: me, updatedAt: Date.now() }));
    }
    return id;
  }
  async function writeList(id, patch) {
    const l = raw(id);
    const body = Object.assign({}, l, patch, { updatedAt: Date.now() });
    delete body.id;
    body.memberIds = [body.owner].concat(Object.keys(body.members || {}));
    await db.doc('slists/' + id).set(body);
  }
  const updateList = (id, fields) => writeList(id, fields);
  async function deleteList(id) {
    for (const t of tasksOf(id)) await db.doc(`slists/${id}/tasks/${t.id}`).delete();
    const cs = await db.collection(`slists/${id}/comments`).get();
    for (const c of cs.docs) await db.doc(`slists/${id}/comments/${c.id}`).delete();
    await db.doc('slists/' + id).delete();
  }
  async function createInvite(id, r) {
    const code = rand(6);
    await writeList(id, { invites: Object.assign({}, raw(id).invites, { [code]: r }) });
    return id + '-' + code;
  }
  async function revokeInvite(id, code) {
    const inv = Object.assign({}, raw(id).invites); delete inv[code];
    await writeList(id, { invites: inv });
  }
  async function setRole(id, uid, r) {
    await writeList(id, { members: Object.assign({}, raw(id).members, { [uid]: r }) });
  }
  async function removeMember(id, uid) {
    const m = Object.assign({}, raw(id).members); delete m[uid];
    await writeList(id, { members: m });
  }
  async function join(codeStr) {
    const m = String(codeStr).trim().match(/^(s[a-z0-9]{10})-([a-z0-9]{6})$/i);
    if (!m) throw new Error('bad-code');
    const [, id, code] = m;
    const snap = await db.doc('slists/' + id).get();
    const l = snap.exists ? snap.data() : null;
    if (!l || !(l.invites || {})[code]) throw new Error('bad-code');
    if (l.owner === me) return { id, role: 'owner' };
    const r = l.invites[code];
    if (!joined.some((j) => j.id === id)) { joined.push({ id, code }); saveJoined(); }
    fromJoined[id] = Object.assign({ id }, l);
    if (canWrite) {
      try {
        const members = Object.assign({}, l.members, { [me]: r });
        await db.doc('slists/' + id).set(Object.assign({}, l, { members, memberIds: [l.owner].concat(Object.keys(members)), updatedAt: Date.now() }));
      } catch (e) { canWrite = false; }
    }
    subJoined(id); ensureTasks(id); changed();
    return { id, role: role(id) };
  }
  async function leave(id) {
    const l = raw(id);
    joined = joined.filter((j) => j.id !== id); saveJoined();
    if (subs['l' + id]) { subs['l' + id](); delete subs['l' + id]; }
    delete fromJoined[id];
    if (l && (l.members || {})[me] && canWrite) await removeMember(id, me);
    changed();
  }

  // ---------- tasks ----------
  async function saveTask(id, tid, data) {
    const body = Object.assign({}, data, { updatedBy: me, updatedAt: Date.now() });
    delete body.id; delete body.listId;
    await db.doc(`slists/${id}/tasks/${tid || 't' + rand(10)}`).set(body);
  }
  async function patchTask(id, tid, fields) {
    await db.doc(`slists/${id}/tasks/${tid}`).update(Object.assign({}, fields, { updatedBy: me, updatedAt: Date.now() }));
  }
  const deleteTask = (id, tid) => db.doc(`slists/${id}/tasks/${tid}`).delete();

  // ---------- comments ----------
  function watchComments(id, tid, cb) {
    return db.collection(`slists/${id}/comments`).where('taskId', '==', tid).onSnapshot((qs) => {
      cb(qs.docs.map((d) => Object.assign({ id: d.id }, d.data())).sort((a, b) => a.ts - b.ts));
    }, () => cb(null));
  }
  async function addComment(id, tid, text) {
    await db.collection(`slists/${id}/comments`).add({ taskId: tid, author: me, text, ts: Date.now() });
    const t = tasksOf(id).find((x) => x.id === tid);
    if (t) await patchTask(id, tid, { commentCount: (t.commentCount || 0) + 1 }).catch(() => {});
  }
  async function deleteComment(id, cid, tid) {
    await db.doc(`slists/${id}/comments/${cid}`).delete();
    const t = tasksOf(id).find((x) => x.id === tid);
    if (t && t.commentCount) await patchTask(id, tid, { commentCount: t.commentCount - 1 }).catch(() => {});
  }

  return {
    ROLE_NAME, RANK,
    available: () => started, canWrite: () => canWrite, me: () => me, start,
    lists, raw, role, can, tasksOf, nameOf, codeLabel: (sid, c) => sid + '-' + c,
    shareLocal, updateList, deleteList, createInvite, revokeInvite, setRole, removeMember, join, leave,
    saveTask, patchTask, deleteTask, watchComments, addComment, deleteComment,
  };
};
