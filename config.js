/* ================== 上线前只需要改这里 ================== */
window.TEDX_CONFIG = {
  env: 'tedx-d1giaw0jod202b6b9',   // 云开发环境 ID
  region: 'ap-shanghai',           // 环境所在地域，一般是上海，不用改
  // Publishable Key：公开密钥，权限等同匿名访客，可以放在网页里（云开发控制台 → API Key 配置）
  accessKey: 'eyJhbGciOiJSUzI1NiIsImtpZCI6IjYxOTQ5YTA2LTFmMGItNGNhZC04MmQzLWFjYWM4MjExNWRhOSJ9.eyJpc3MiOiJodHRwczovL3RlZHgtZDFnaWF3MGpvZDIwMmI2YjkuYXAtc2hhbmdoYWkudGNiLWFwaS50ZW5jZW50Y2xvdWRhcGkuY29tIiwic3ViIjoiYW5vbiIsImF1ZCI6InRlZHgtZDFnaWF3MGpvZDIwMmI2YjkiLCJleHAiOjQwOTU1NDIwNjUsImlhdCI6MTc5MTg1ODg2NSwibm9uY2UiOiJQVFBIdFFiU1N3V3h4djlCRXdXZThRIiwiYXRfaGFzaCI6IlBUUEh0UWJTU3dXeHh2OUJFd1dlOFEiLCJuYW1lIjoiQW5vbnltb3VzIiwic2NvcGUiOiJhbm9ueW1vdXMiLCJwcm9qZWN0X2lkIjoidGVkeC1kMWdpYXcwam9kMjAyYjZiOSIsIm1ldGEiOnsicGxhdGZvcm0iOiJQdWJsaXNoYWJsZUtleSJ9LCJyb2xlIjoiYW5vbiIsImlzX2Fub255bW91cyI6dHJ1ZSwiYXBwX21ldGFkYXRhIjp7InByb3ZpZGVyIjoiYW5vbnltb3VzIiwicHJvdmlkZXJzIjpbImFub255bW91cyJdfSwidXNlcl9tZXRhZGF0YSI6eyJuYW1lIjoiQW5vbnltb3VzIn0sInVzZXJfdHlwZSI6IiIsImNsaWVudF90eXBlIjoiY2xpZW50X3VzZXIiLCJpc19zeXN0ZW1fYWRtaW4iOmZhbHNlfQ.hXEnRjFLWcBtoANNToXk5cxGdPVPNU9_04urIiCnrwjrNkGgpQsE43qAeFzUOTFgp5BUhzPDBYxCP5Ucju3yBFD2OE6FCT4x9deQBZSYPvbLxdaOphf-lCxxN2ztDwsNQohFdOGgNr-SJuGHriAoQbUM9_4iU18XhgJkPEqlNnNXgFTDrRpWlms7bCZjvm8d6Ecql3KaMBY3eAulUr3F6-5ZMdxzl_A0Pe-cPAyADGffh0f4fhYFVgyzkeeRN3IJxX4HbFGI93HiPAOC5abPomIZbuxUt8Gjtb1CmhlUQx6CleQAMyMJBLRDKUh3jEmrlYDVgsPDrERz95rglpN0Iw',
  fn: 'tedx',                      // 云函数名字，和腾讯云上新建的函数名一致
  // 云函数的 HTTP 公开地址（HTTP 网关里配置）。填了就直接用这个地址，不再经过 SDK 和访客权限
  apiUrl: 'https://tedx-d1giaw0jod202b6b9-1505178414.ap-shanghai.app.tcloudbase.com/tedx-api',

  // 活动信息（购票页、电子票、管理页共用）
  event: {
    dateEn: 'Nov. 2, 2026',
    dateZh: '2026年11月2日（周一）',
    time: '14:00–16:30',
    checkin: '13:40–13:55',  // 建议抵达签到时间（电子票上显示），留空不显示
    placeEn: 'SSES Auditorium',
    placeZh: '尚德大会堂（SSES Auditorium）',
    contact: '',     // 主办方联系方式（微信号/电话），留空不显示
  },
  maxPerOrder: 5,
  // ⚠️ 票价：改这里的同时，云函数 index.js 顶部的 TICKETS 也要改成一样，否则下单会提示「票价有更新」
  // free: true = 校内免费预约（提交即出票，不用付款）
  tickets: [
    { id: 'guest',   name: '校外人士', en: 'GUEST',   price: 68 },
    { id: 'student', name: '本校学生', en: 'STUDENT', price: 0, free: true },
    { id: 'teacher', name: '本校老师', en: 'TEACHER', price: 0, free: true },
  ],
};
/* ====================================================== */

// 三个页面共用：调用云函数
(function () {
  let app = null, signIn = null;
  // 预览模式：在电脑上直接双击打开网页文件时自动启用（或网址加 ?demo=1）。
  // 订单只存在这台设备的浏览器里，不连腾讯云；正式网址打开时不会启用。
  let DEMO = location.protocol === 'file:';
  try {
    if (new URLSearchParams(location.search).get('demo') === '1') sessionStorage.setItem('tedx-demo', '1');
    DEMO = DEMO || sessionStorage.getItem('tedx-demo') === '1';
  } catch (e) {}
  window.TEDX_DEMO = DEMO;
  let demoReady = null;
  if (DEMO) {
    demoReady = new Promise((ok, bad) => { const sc = document.createElement('script'); sc.src = 'demo.js'; sc.onload = ok; sc.onerror = () => bad(new Error('预览模式缺少 demo.js')); document.head.appendChild(sc); });
    addEventListener('DOMContentLoaded', () => {
      const b = document.createElement('div');
      b.textContent = '预览模式 · 订单只存在这台设备，不会真的下单' + (/admin\.html/.test(location.pathname) ? ' · 管理密码 admin' : '');
      b.style.cssText = 'position:fixed;left:50%;bottom:calc(10px + env(safe-area-inset-bottom));transform:translateX(-50%);z-index:80;background:rgba(20,8,9,.92);color:#ffd27a;border:1px solid rgba(255,210,122,.45);border-radius:999px;padding:5px 12px;font:12px/1.4 -apple-system,"PingFang SC",sans-serif;white-space:nowrap;pointer-events:none;max-width:94vw;overflow:hidden;text-overflow:ellipsis';
      document.body.appendChild(b);
    });
  }
  window.tedxApi = async function (data) {
    const C = window.TEDX_CONFIG;
    if (DEMO) {
      await demoReady;
      const r = await window.tedxDemo.call(data);
      if (!r.ok) { const err = new Error(r.msg || '操作失败'); err.code = r.code; throw err; }
      return r;
    }
    if (C.apiUrl) {
      // 直接请求云函数的 HTTP 地址（text/plain 避免浏览器多发一次预检请求）
      let resp, r;
      try {
        resp = await fetch(C.apiUrl, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: JSON.stringify(data) });
      } catch (e) { console.error(e); const err = new Error('网络连接失败，请检查网络后再试'); err.code = 'NETWORK'; throw err; }
      try { r = await resp.json(); } catch (e) { r = null; }
      if (!resp.ok || !r) { const err = new Error(`服务器出错了（HTTP ${resp.status}）`); err.code = 'HTTP_' + resp.status; throw err; }
      if (!r.ok) { const err = new Error(r.msg || '操作失败'); err.code = r.code; throw err; }
      return r;
    }
    if (!C.accessKey) throw new Error('购票系统还没配置好（config.js 缺少 Publishable Key），请联系主办方');
    if (!window.cloudbase) throw new Error('网络较慢，页面还没加载完，请稍等几秒再试');
    if (!app) app = window.cloudbase.init({ env: C.env, region: C.region, accessKey: C.accessKey });
    // 先以「匿名登录用户」身份登录（需在 身份认证 → 登录方式 开启匿名登录）；失败就退回只用 Publishable Key
    if (!signIn) signIn = (async () => {
      try {
        const auth = app.auth;
        const st = await auth.getLoginState();
        if (!st) await auth.signInAnonymously({});
      } catch (e) { console.warn('匿名登录失败，改用 Publishable Key 调用', e); }
    })();
    await signIn;
    let res;
    try {
      res = await app.callFunction({ name: C.fn, data });
    } catch (e) {
      console.error(e);
      // 把腾讯云返回的错误类型翻译成看得懂的提示，方便排查
      const raw = String((e && (e.code || '')) + ' ' + (e && e.message || ''));
      const code = (raw.match(/[A-Z][A-Z0-9_]{5,}/) || [''])[0];
      let msg = '网络开小差了，请检查网络后再试';
      if (/EXCEED_AUTHORITY|ACTION_FORBIDDEN|403|PERMISSION/i.test(raw)) msg = '服务器拒绝了请求（没有调用权限）';
      else if (/TIME_LIMIT|TIMEOUT|timed? ?out|超时/i.test(raw)) msg = '服务器响应超时，请再点一次';
      else if (/FUNCTION_NOT_FOUND|ResourceNotFound|not ?found/i.test(raw)) msg = '找不到云函数 ' + C.fn;
      else if (/Failed to fetch|NetworkError|network/i.test(raw)) msg = '网络连接失败，请检查网络后再试';
      const err = new Error(msg + (code ? `（${code}）` : ''));
      err.code = code || 'NETWORK';
      throw err;
    }
    const r = res && res.result;
    if (!r) throw new Error('服务器没有响应，请稍后再试');
    if (!r.ok) { const err = new Error(r.msg || '操作失败'); err.code = r.code; throw err; }
    return r;
  };
  // 记住这台设备上下过的订单，方便买家回来查看
  window.tedxMyOrders = {
    list() { try { return JSON.parse(localStorage.getItem('tedx-orders') || '[]'); } catch (e) { return []; } },
    add(o) { try { const l = this.list().filter((x) => x.id !== o.id); l.unshift({ id: o.id, token: o.token, code: o.code, ticket: `${o.ticketName} × ${o.qty}`, at: o.createdAt }); localStorage.setItem('tedx-orders', JSON.stringify(l.slice(0, 10))); } catch (e) {} },
  };
})();
