function json(obj, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function now() {
  return new Date().toISOString();
}

async function getState(env) {
  const tp = await env.DB.prepare(
    'SELECT day, member, task, progress FROM task_progress'
  ).all();
  const db_ = await env.DB.prepare('SELECT * FROM day_blockers').all();
  const tb = await env.DB.prepare('SELECT * FROM task_blockers').all();
  return json({
    taskProgress: tp.results,
    dayBlockers: db_.results,
    taskBlockers: tb.results,
  });
}

async function setTaskProgress(request, env) {
  const { day, member, task, value, actor, actorLabel } = await request.json();
  if (!actor) return json({ error: 'Not authenticated' }, 401);
  const ts = now();

  const old = await env.DB.prepare(
    'SELECT progress FROM task_progress WHERE day=? AND member=? AND task=?'
  ).bind(day, member, task).first();
  const oldVal = old ? old.progress : 0;

  await env.DB.prepare(
    `INSERT INTO task_progress (day, member, task, progress, updated_by, updated_by_label, updated_at)
     VALUES (?,?,?,?,?,?,?)
     ON CONFLICT(day, member, task) DO UPDATE SET
       progress=excluded.progress, updated_by=excluded.updated_by,
       updated_by_label=excluded.updated_by_label, updated_at=excluded.updated_at`
  ).bind(day, member, task, value, actor, actorLabel, ts).run();

  await env.DB.prepare(
    `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
     VALUES (?,?,?,?,?,?,?,?)`
  ).bind(ts, actor, actorLabel, 'task_progress', day, member, task, `${oldVal}% \u2192 ${value}%`).run();

  return json({ ok: true });
}

async function dayBlockerAction(request, env) {
  const body = await request.json();
  const { op, day, id, desc, owner, sev, actor, actorLabel } = body;
  if (!actor) return json({ error: 'Not authenticated' }, 401);
  const ts = now();

  if (op === 'add') {
    const newId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO day_blockers (id, day, desc, owner, sev, resolved, created_by, created_by_label, created_at)
       VALUES (?,?,?,?,?,0,?,?,?)`
    ).bind(newId, day, desc, owner || '', sev, actor, actorLabel, ts).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, 'day_blocker_add', day, owner || '', '', desc).run();
    return json({ ok: true, id: newId });
  }

  if (op === 'resolve') {
    const row = await env.DB.prepare('SELECT resolved, desc FROM day_blockers WHERE id=?').bind(id).first();
    if (!row) return json({ error: 'Not found' }, 404);
    const newResolved = row.resolved ? 0 : 1;
    await env.DB.prepare(
      `UPDATE day_blockers SET resolved=?, resolved_by=?, resolved_by_label=?, resolved_at=? WHERE id=?`
    ).bind(newResolved, actor, actorLabel, ts, id).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, newResolved ? 'day_blocker_resolve' : 'day_blocker_reopen', day, '', '', row.desc).run();
    return json({ ok: true });
  }

  if (op === 'delete') {
    const row = await env.DB.prepare('SELECT desc FROM day_blockers WHERE id=?').bind(id).first();
    await env.DB.prepare('DELETE FROM day_blockers WHERE id=?').bind(id).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, 'day_blocker_delete', day, '', '', row ? row.desc : '').run();
    return json({ ok: true });
  }

  return json({ error: 'Unknown op' }, 400);
}

async function taskBlockerAction(request, env) {
  const body = await request.json();
  const { op, day, member, task, id, desc, sev, actor, actorLabel } = body;
  if (!actor) return json({ error: 'Not authenticated' }, 401);
  const ts = now();

  if (op === 'add') {
    const newId = crypto.randomUUID();
    await env.DB.prepare(
      `INSERT INTO task_blockers (id, day, member, task, desc, sev, resolved, created_by, created_by_label, created_at)
       VALUES (?,?,?,?,?,?,0,?,?,?)`
    ).bind(newId, day, member, task, desc, sev, actor, actorLabel, ts).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, 'task_blocker_add', day, member, task, desc).run();
    return json({ ok: true, id: newId });
  }

  if (op === 'resolve') {
    const row = await env.DB.prepare('SELECT resolved, desc FROM task_blockers WHERE id=?').bind(id).first();
    if (!row) return json({ error: 'Not found' }, 404);
    const newResolved = row.resolved ? 0 : 1;
    await env.DB.prepare(
      `UPDATE task_blockers SET resolved=?, resolved_by=?, resolved_by_label=?, resolved_at=? WHERE id=?`
    ).bind(newResolved, actor, actorLabel, ts, id).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, newResolved ? 'task_blocker_resolve' : 'task_blocker_reopen', day, member, task, row.desc).run();
    return json({ ok: true });
  }

  if (op === 'delete') {
    const row = await env.DB.prepare('SELECT desc FROM task_blockers WHERE id=?').bind(id).first();
    await env.DB.prepare('DELETE FROM task_blockers WHERE id=?').bind(id).run();
    await env.DB.prepare(
      `INSERT INTO history (ts, actor, actor_label, action, day, member, task, detail)
       VALUES (?,?,?,?,?,?,?,?)`
    ).bind(ts, actor, actorLabel, 'task_blocker_delete', day, member, task, row ? row.desc : '').run();
    return json({ ok: true });
  }

  return json({ error: 'Unknown op' }, 400);
}

async function getHistory(env, url) {
  const limit = Math.min(parseInt(url.searchParams.get('limit') || '300', 10), 1000);
  const day = url.searchParams.get('day');
  let q = 'SELECT * FROM history';
  const binds = [];
  if (day) {
    q += ' WHERE day=?';
    binds.push(day);
  }
  q += ' ORDER BY id DESC LIMIT ?';
  binds.push(limit);
  const res = await env.DB.prepare(q).bind(...binds).all();
  return json({ history: res.results });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith('/api/')) {
      try {
        if (url.pathname === '/api/state' && request.method === 'GET') {
          return await getState(env);
        }
        if (url.pathname === '/api/task-progress' && request.method === 'POST') {
          return await setTaskProgress(request, env);
        }
        if (url.pathname === '/api/day-blocker' && request.method === 'POST') {
          return await dayBlockerAction(request, env);
        }
        if (url.pathname === '/api/task-blocker' && request.method === 'POST') {
          return await taskBlockerAction(request, env);
        }
        if (url.pathname === '/api/history' && request.method === 'GET') {
          return await getHistory(env, url);
        }
        return json({ error: 'Not found' }, 404);
      } catch (e) {
        return json({ error: e.message }, 500);
      }
    }

    return env.ASSETS.fetch(request);
  },
};
