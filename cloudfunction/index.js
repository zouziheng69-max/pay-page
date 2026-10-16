// TEDxSSES Youth · RIPPLE 购票系统云函数
// 买票页、付款页、管理页都只通过这个函数读写订单；数据库本身不对外开放。
// 订单存在云开发 SQL 型数据库（PostgreSQL）的 orders 表里，建表语句见「建表SQL.sql」。
// 管理密码放在云函数「环境变量」ADMIN_KEY 里，不写在代码中。
const tcb = require('@cloudbase/node-sdk');
const crypto = require('crypto');

// ================== 票价：必须和 index.html 里 CONFIG.tickets 保持一致 ==================
// free: true 的是校内免费预约（提交即出票，不用付款，同一个人只能约一张）
const TICKETS = {
  guest:   { name: '校外票', price: 68 },
  student: { name: '学生预约', price: 0, free: true },
  teacher: { name: '教师预约', price: 0, free: true },
};
// 学生学部：先选国内部 / 融合部，再选学段（要和 index.html 里的 DEPTS 一致）
const DEPTS = { '国内部': ['小学', '初中', '高中'], '融合部': ['PYP', 'MYP', 'IBDP', 'A-Level', 'NB'] };
const MAX_QTY = 5;             // 每单最多几张
const MAX_PENDING_PER_PHONE = 5; // 同一手机号最多几张待审核订单（防恶意刷单）
// ======================================================================================

const ENV_ID = process.env.TCB_ENV || 'tedx-d1giaw0jod202b6b9'; // 云开发环境 ID
const TABLE = 'orders';
const CODE_CHARS = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // 去掉了容易看错的 0 O 1 I
const STATUSES = ['pending', 'confirmed', 'void'];

// 两种调用方式都支持：
// 1) 网页用 SDK 的 callFunction 调用：event 就是参数
// 2) 通过「HTTP 网关」的公开地址访问：event 带 httpMethod，参数在 body 里（JSON 字符串）
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' };
exports.main = async (event) => {
  const ev = event || {};
  const viaHttp = typeof ev.httpMethod === 'string';
  if (viaHttp && ev.httpMethod.toUpperCase() === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  let result;
  try {
    let data = ev;
    if (viaHttp) {
      let body = ev.body || '';
      if (ev.isBase64Encoded) body = Buffer.from(body, 'base64').toString('utf8');
      data = typeof body === 'string' ? JSON.parse(body || '{}') : body;
    }
    result = await handle(data || {});
  } catch (e) {
    console.error(e);
    result = e && e.userMsg ? { ok: false, msg: e.userMsg, code: e.code || 'ERROR' } : { ok: false, msg: '服务器出错了，请稍后再试' };
    if (!viaHttp) result.detail = (e && e.details) || [String(e && e.message)]; // 只在控制台「测试」里显示具体原因
  }
  return viaHttp ? { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(result) } : result;
};
exports.handle = handle; // 本地测试用

// db 不传 = 用云上的 PostgreSQL；本地测试/预览模式会传一个模拟数据库进来
async function handle(ev, db) {
  if (ev.action === 'dbcheck') return dbcheck();
  if (!db) db = await pgStore();
  else if (db.collection) db = docStore(db);
  switch (ev.action) {
    case 'create': return create(ev, db);
    case 'get': return getOrder(ev, db);
    case 'claim': return claim(ev, db);
    case 'admin': return admin(ev, db);
    default: return { ok: false, msg: '未知操作' };
  }
}

// ---------- 买票人 ----------
async function create(ev, db) {
  const t = TICKETS[ev.ticketId];
  const name = String(ev.name || '').trim();
  if (!t) return fail('请选择身份');
  if (!name || name.length > 20) return fail('请填写姓名');
  const now = Date.now();
  const doc = {
    code: '', token: crypto.randomBytes(16).toString('hex'),
    ticketId: ev.ticketId, ticketName: t.name, price: t.price, qty: 1, amount: 0,
    name, cls: '', phone: '', method: 'free', status: 'pending',
    createdAt: now, updatedAt: now, claimedAt: null, confirmedAt: null, checkedInAt: null,
  };

  if (t.free) {
    // 校内预约：学生填学部+班级，老师只填姓名
    if (ev.ticketId === 'student') {
      const dept = String(ev.dept || '').trim(), klass = String(ev.cls || '').trim();
      const [top, sub] = dept.split(' ');
      if (!DEPTS[top] || !DEPTS[top].includes(sub)) return fail('请选择学部');
      if (!klass || klass.length > 20) return fail('请填写班级');
      doc.cls = `${dept} ${klass}`;
    } else {
      const dept = String(ev.dept || '').trim();
      if (!DEPTS[dept]) return fail('请选择学部');
      doc.cls = dept;
    }
    if (await db.hasActive(ev.ticketId, name, doc.cls)) {
      return fail('这个名字已经预约过了，可以在本机购票页底部「我的订单」里查看，或联系主办方', 'DUPLICATE');
    }
    doc.status = 'confirmed';
    doc.confirmedAt = now;
  } else {
    const qty = Number(ev.qty);
    const phone = String(ev.phone || '').trim();
    if (typeof t.price !== 'number') return fail('票价待公布，暂时不能购买');
    if (!Number.isInteger(qty) || qty < 1 || qty > MAX_QTY) return fail(`每单可买 1–${MAX_QTY} 张`);
    if (!/^1\d{10}$/.test(phone)) return fail('请填写正确的 11 位手机号');
    const amount = Math.round(t.price * qty * 100) / 100;
    // 页面上显示的金额和服务器算的不一致，说明页面是旧的，让买家刷新，避免按错的价格付款
    if (ev.expectAmount !== undefined && Number(ev.expectAmount) !== amount) {
      return fail('票价有更新，请刷新页面后重新下单', 'PRICE_CHANGED');
    }
    if ((await db.countPending(phone, MAX_PENDING_PER_PHONE)) >= MAX_PENDING_PER_PHONE) {
      return fail('这个手机号的待确认订单太多了，请先联系主办方');
    }
    Object.assign(doc, { qty, amount, phone, method: ev.method === 'alipay' ? 'alipay' : 'wechat' });
  }

  // 订单号撞了就换一个再试（数据库里 code 不允许重复）
  for (let i = 0; i < 6; i++) {
    doc.code = randomCode(4);
    const id = await db.insert(doc);
    if (id) return { ok: true, order: { ...view({ ...doc, id }), token: doc.token } };
  }
  return fail('下单人数较多，请再试一次');
}

async function getOrder(ev, db) {
  const o = await load(ev, db);
  return o ? { ok: true, order: view(o) } : fail('找不到这个订单', 'NOT_FOUND');
}

// 买家点了「我已完成付款」：记下来，方便主办方优先核对
async function claim(ev, db) {
  const o = await load(ev, db);
  if (!o) return fail('找不到这个订单', 'NOT_FOUND');
  if (o.status === 'pending' && !o.claimedAt) {
    o.claimedAt = Date.now();
    if ((ev.method === 'alipay' || ev.method === 'wechat') && o.method !== 'free') o.method = ev.method; // 以买家实际选的付款方式为准
    await db.update(o.id, { claimedAt: o.claimedAt, method: o.method });
  }
  return { ok: true, order: view(o) };
}

async function load(ev, db) {
  if (!ev.id || !ev.token) return null;
  const o = await db.get(String(ev.id));
  if (!o || !safeEqual(o.token, String(ev.token))) return null;
  return o;
}

// ---------- 主办方 ----------
async function admin(ev, db) {
  const key = process.env.ADMIN_KEY || '';
  if (!key) return fail('还没设置管理密码：请在云函数的环境变量里添加 ADMIN_KEY', 'NO_KEY');
  if (!safeEqual(key, String(ev.key || ''))) {
    await new Promise((r) => setTimeout(r, 300)); // 拖慢暴力猜密码
    return fail('管理密码不对', 'BAD_KEY');
  }
  if (ev.op === 'login') return { ok: true };
  // 清空所有订单：除了管理密码，还要再输一次清空密码（环境变量 PURGE_KEY，没设置时默认 tedx）
  if (ev.op === 'purge') {
    const pk = process.env.PURGE_KEY || 'tedx';
    if (!safeEqual(pk, String(ev.purgeKey || ''))) {
      await new Promise((r) => setTimeout(r, 300));
      return fail('清空密码不对', 'BAD_PURGE_KEY');
    }
    const n = await db.purge();
    return { ok: true, deleted: n };
  }
  if (ev.op === 'list') {
    const all = await db.list();
    return { ok: true, orders: all.map(view), now: Date.now() };
  }
  const o = ev.id ? await db.get(String(ev.id)) : null;
  if (!o) return fail('找不到这个订单', 'NOT_FOUND');
  const now = Date.now();
  let patch;
  if (ev.op === 'set') {
    if (!STATUSES.includes(ev.status)) return fail('状态不对');
    patch = { status: ev.status, updatedAt: now, confirmedAt: ev.status === 'confirmed' ? (o.confirmedAt || now) : null };
    if (ev.status !== 'confirmed') patch.checkedInAt = null;
  } else if (ev.op === 'checkin') {
    if (o.status !== 'confirmed') return fail('这张票还没确认收款，不能入场');
    if (ev.undo) patch = { checkedInAt: null, updatedAt: now };
    else if (o.checkedInAt) return fail(`这张票已经在 ${fmt(o.checkedInAt)} 入过场了`, 'ALREADY_IN');
    else patch = { checkedInAt: now, updatedAt: now };
  } else {
    return fail('未知操作');
  }
  await db.update(o.id, patch);
  return { ok: true, order: view({ ...o, ...patch }) };
}

// ---------- 工具 ----------
function view(o) {
  return {
    id: o.id, code: o.code, ticketId: o.ticketId, ticketName: o.ticketName, qty: o.qty, amount: o.amount,
    name: o.name, cls: o.cls || '', phone: o.phone, method: o.method, status: o.status,
    createdAt: o.createdAt, claimedAt: o.claimedAt || null, confirmedAt: o.confirmedAt || null, checkedInAt: o.checkedInAt || null,
  };
}
function fail(msg, code) { return { ok: false, msg, code: code || 'ERROR' }; }
function randomCode(n) {
  const b = crypto.randomBytes(n);
  let s = '';
  for (let i = 0; i < n; i++) s += CODE_CHARS[b[i] % CODE_CHARS.length];
  return s;
}
function safeEqual(a, b) {
  const x = Buffer.from(String(a)), y = Buffer.from(String(b));
  return x.length === y.length && crypto.timingSafeEqual(x, y);
}
function fmt(t) {
  const d = new Date(t + 8 * 3600e3); // 北京时间
  return `${d.getUTCMonth() + 1}月${d.getUTCDate()}日 ${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

// ================== 数据库 ==================
// 程序里统一用驼峰字段；PostgreSQL 表里是下划线字段
const COLS = {
  id: 'id', code: 'code', token: 'token', ticketId: 'ticket_id', ticketName: 'ticket_name', price: 'price', qty: 'qty',
  amount: 'amount', name: 'name', cls: 'cls', phone: 'phone', method: 'method', status: 'status',
  createdAt: 'created_at', updatedAt: 'updated_at', claimedAt: 'claimed_at', confirmedAt: 'confirmed_at', checkedInAt: 'checked_in_at',
};
const NUMS = ['price', 'qty', 'amount', 'createdAt', 'updatedAt', 'claimedAt', 'confirmedAt', 'checkedInAt'];
function toRow(o) {
  const r = {};
  for (const k of Object.keys(o)) if (COLS[k]) r[COLS[k]] = o[k];
  return r;
}
function fromRow(r) {
  const o = {};
  for (const k of Object.keys(COLS)) {
    let v = r[COLS[k]];
    if (v === undefined) v = null;
    if (v !== null && NUMS.includes(k)) v = Number(v);
    o[k] = v;
  }
  return o;
}

// 云开发 SQL 型数据库（PostgreSQL）。两种连法：
// 1) 云函数环境变量里填了 CLOUDBASE_API_KEY（控制台「API Key 配置」里的 API Key）：用它访问，数据库角色是 service_role
// 2) 没填：用官方 SDK 的 app.rdb()。不同环境对库名参数要求不一样，第一次用时依次试，记住能用的那种
let _pg = null;
async function pgStore() {
  if (_pg) return _pg;
  const modes = [];
  const apiKey = String(process.env.CLOUDBASE_API_KEY || '').trim().replace(/^Bearer\s+/i, '');
  if (apiKey) {
    modes.push(['API Key', () => restClient(apiKey)]);
  } else {
    const app = tcb.init({ env: ENV_ID, region: 'ap-shanghai' });
    if (typeof app.rdb !== 'function') throw userErr('云函数依赖没装好：请在云函数里重新「上传并部署（自动安装依赖）」', ['app.rdb 不存在']);
    modes.push(['默认', () => app.rdb()], ['public', () => app.rdb({ database: 'public' })]);
  }
  const errs = [];
  for (const [label, make] of modes) {
    try {
      const client = make();
      const r = await run(client.from(TABLE).select('id').limit(1));
      if (!r.error) {
        _pg = pgOps(client);
        _pg.mode = label;
        return _pg;
      }
      errs.push(`[${label}] ${errText(r.error)}`);
    } catch (e) {
      errs.push(`[${label}] ${errText(e)}`);
    }
  }
  console.error('连接 PostgreSQL 失败：\n' + errs.join('\n'));
  throw userErr(errs.some((m) => isMissing(m))
    ? '数据库里还没有 orders 表：请先在「SQL 型数据库 → SQL 编辑器」里运行建表语句'
    : '连不上数据库，请稍后再试', errs);
}

// 直接按 PostgREST 接口发 HTTP 请求（只实现了本程序用到的几种写法，用法和 app.rdb() 一样）
function restClient(key) {
  const base = `https://${ENV_ID}.api.tcloudbasegateway.com/v1/rdb/rest`;
  return { from: (table) => restQuery(`${base}/${table}`, key) };
}
function restQuery(url, key) {
  const qs = new URLSearchParams();
  let method = 'GET';
  let body;
  const q = {
    select(cols) { qs.set('select', cols || '*'); return q; },
    eq(k, v) { qs.append(k, `eq.${v}`); return q; },
    neq(k, v) { qs.append(k, `neq.${v}`); return q; },
    delete() { method = 'DELETE'; return q; },
    limit(n) { qs.set('limit', String(n)); return q; },
    order(col, opt) { qs.set('order', `${col}.${opt && opt.ascending === false ? 'desc' : 'asc'}`); return q; },
    range(a, b) { qs.set('offset', String(a)); qs.set('limit', String(b - a + 1)); return q; },
    insert(row) { method = 'POST'; body = row; return q; },
    update(patch) { method = 'PATCH'; body = patch; return q; },
    then(ok, bad) { return send().then(ok, bad); },
  };
  async function send() {
    const s = qs.toString();
    const res = await fetch(url + (s ? '?' + s : ''), {
      method,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', Prefer: 'return=minimal' },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(2500) : undefined,
    });
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = text; }
    if (!res.ok) return { error: data && typeof data === 'object' ? data : { message: `HTTP ${res.status} ${String(text).slice(0, 200)}` } };
    return { data };
  }
  return q;
}

function pgOps(client) {
  const T = () => client.from(TABLE);
  return {
    async countPending(phone, cap) {
      return (await rows(T().select('id').eq('phone', phone).eq('status', 'pending').limit(cap))).length;
    },
    async hasActive(ticketId, name, cls) {
      const d = await rows(T().select('status').eq('ticket_id', ticketId).eq('name', name).eq('cls', cls).limit(50));
      return d.some((r) => r.status !== 'void');
    },
    // 返回新订单 id；订单号重复时返回 null（换个号再试）
    async insert(o) {
      const id = crypto.randomBytes(12).toString('hex');
      const r = await run(T().insert(toRow({ ...o, id })));
      if (r.error) {
        if (/23505|duplicate|unique/i.test(errText(r.error))) return null;
        throw dbErr(r.error);
      }
      return id;
    },
    async get(id) {
      if (!/^[0-9a-f]{24}$/.test(id)) return null;
      const d = await rows(T().select('*').eq('id', id).limit(1));
      return d[0] ? fromRow(d[0]) : null;
    },
    async update(id, patch) {
      await rows(T().update(toRow(patch)).eq('id', id));
    },
    async purge() {
      const n = (await rows(T().select('id').limit(100000))).length;
      await rows(T().delete().neq('id', ''));
      return n;
    },
    async list() {
      const all = [];
      for (let off = 0; off < 5000;) {
        const d = await rows(T().select('*').order('created_at', { ascending: false }).range(off, off + 999));
        if (!d.length) break;
        all.push(...d);
        off += d.length;
      }
      return all.map(fromRow);
    },
  };
}
async function run(builder) {
  try {
    return (await builder) || {};
  } catch (e) {
    return { error: e || { message: 'unknown' } };
  }
}
async function rows(builder) {
  const r = await run(builder);
  if (r.error) throw dbErr(r.error);
  return Array.isArray(r.data) ? r.data : [];
}
function errText(e) {
  if (!e) return '';
  const s = [e.code, e.message, e.details, e.hint].filter(Boolean).map((x) => String(x).split('\n')[0]);
  return (s.join(' ') || String(e)).slice(0, 300);
}
function isMissing(m) { return /42P01|PGRST205|does not exist|could not find the table|不存在/i.test(m); }
function userErr(msg, details) {
  const e = new Error(msg + (details ? '\n' + details.join('\n') : ''));
  e.userMsg = msg;
  e.code = 'DB';
  e.details = details || [];
  return e;
}
function dbErr(err) {
  const m = errText(err);
  if (isMissing(m)) return userErr('数据库里还没有 orders 表：请先在「SQL 型数据库 → SQL 编辑器」里运行建表语句', [m]);
  if (/42501|row-level security|permission denied/i.test(m)) return userErr('数据库拒绝了云函数读写 orders 表（权限设置）', [m]);
  return userErr('数据库出错了，请稍后再试', [m]);
}

// 部署后在控制台「测试」里发 {"action":"dbcheck"}，可以检查数据库通不通
async function dbcheck() {
  try {
    const s = await pgStore();
    return { ok: true, msg: `数据库连接正常（${s.mode}）` };
  } catch (e) {
    return { ok: false, msg: e.userMsg || '数据库出错了', detail: e.details || [errText(e)] };
  }
}

// 本地测试/预览模式用：模拟的文档型数据库
function docStore(db) {
  const col = () => db.collection(TABLE);
  const fix = (d) => (d ? { ...d, id: d._id } : null);
  const withCol = async (fn) => {
    try {
      return await fn();
    } catch (e) {
      const m = String((e && (e.code || '')) + ' ' + ((e && e.message) || ''));
      if (!/not.?exist|NOT_EXIST|不存在|NOT_FOUND|not.?found/i.test(m)) throw e;
      await db.createCollection(TABLE);
      return fn();
    }
  };
  return {
    async countPending(phone) {
      return (await withCol(() => col().where({ phone, status: 'pending' }).count())).total || 0;
    },
    async hasActive(ticketId, name, cls) {
      const r = await withCol(() => col().where({ ticketId, name, cls }).get());
      return r.data.some((d) => d.status !== 'void');
    },
    async insert(o) {
      const dup = await withCol(() => col().where({ code: o.code }).count());
      if (dup.total) return null;
      const r = await col().add({ ...o });
      return r.id || (r.ids && r.ids[0]) || null;
    },
    async get(id) {
      try {
        const r = await col().doc(id).get();
        return fix(r && r.data && r.data[0]);
      } catch (e) {
        return null;
      }
    },
    async update(id, patch) {
      await col().doc(id).update(patch);
    },
    async purge() {
      const all = await this.list();
      for (const o of all) await col().doc(o.id).remove();
      return all.length;
    },
    async list() {
      const all = [];
      for (let skip = 0; skip < 5000; skip += 100) {
        const r = await withCol(() => col().orderBy('createdAt', 'desc').skip(skip).limit(100).get());
        all.push(...r.data.map(fix));
        if (r.data.length < 100) break;
      }
      return all;
    },
  };
}
