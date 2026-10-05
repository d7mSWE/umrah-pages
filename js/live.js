/* Live notifications: bell badge + soft chime + auto-dismiss toast + SSE */
function _ensureLiveStyles() {
  if (document.getElementById("liveNotifyStyles")) return;
  const style = document.createElement("style");
  style.id = "liveNotifyStyles";
  style.textContent = [
    // Pop-up علوي يظهر لثوانٍ ثم يختفي نهائياً (لا يبقى بالصفحة)
    "#liveToast { position: fixed; top: 1rem; left: 50%; transform: translate(-50%, -160%) scale(.95);",
    " z-index: 9999; min-width: 320px; max-width: min(520px, 92vw); background: #fff;",
    " border: 1px solid #e9e5d8; border-inline-start: 5px solid #d6455a; border-radius: 0.85rem;",
    " box-shadow: 0 16px 32px rgba(16,24,40,.18); padding: 0.7rem 0.9rem 0.9rem;",
    " display: flex; align-items: flex-start; gap: 0.6rem; overflow: hidden;",
    " transition: transform 0.35s cubic-bezier(.2,.9,.3,1.2), opacity 0.3s ease; opacity: 0; pointer-events: none; }",
    "#liveToast.show { transform: translate(-50%, 0) scale(1); opacity: 1; pointer-events: auto; }",
    "#liveToast.hide { transform: translate(-50%, -160%) scale(.95); opacity: 0; pointer-events: none; }",
    "#liveToast.success { border-inline-start-color: #1f9d63; }",
    "#liveToast .live-toast-icon { font-size: 1.35rem; line-height: 1; margin-top: 0.1rem; }",
    "#liveToast .live-toast-body { flex: 1; min-width: 0; }",
    "#liveToast .live-toast-title { font-weight: 800; font-size: 0.92rem; }",
    "#liveToast .live-toast-sub { color: #6b7385; font-size: 0.8rem; }",
    "#liveToast .live-toast-close { background: transparent; border: 0; font-size: 1.3rem;",
    " line-height: 1; color: #9aa0ae; cursor: pointer; padding: 0 0.15rem; }",
    "#liveToast .live-toast-close:hover { color: #333; }",
    "#liveToast .live-toast-progress { position: absolute; bottom: 0; right: 0; left: 0; height: 4px;",
    " background: rgba(0,0,0,.08); }",
    "#liveToast .live-toast-progress span { display: block; height: 100%; width: 100%;",
    " background: #d6455a; transform-origin: right; animation: liveToastCountdown 5s linear forwards; }",
    "#liveToast.success .live-toast-progress span { background: #1f9d63; }",
    "@keyframes liveToastCountdown { from { transform: scaleX(1); } to { transform: scaleX(0); } }"
  ].join("\n");
  document.head.appendChild(style);
}
// الجرس الحالي في dashboard.html (#notifBell) وتديره notifications.js؛
// هذا يحذف فقط زر الجرس القديم (#notifBellBtn) إن وُجد.
function _ensureBellBadge() {
  const old = document.getElementById("notifBellBtn");
  if (old) old.remove();
  return null;
}

// صوت تنبيه هادئ: نغمتان قصيرتان بمستوى منخفض (لا يزعج الموظف)
let _liveAudioCtx = null;
function playSoftChime(kind) {
  try {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    _liveAudioCtx = _liveAudioCtx || new AC();
    const ctx = _liveAudioCtx;
    if (ctx.state === "suspended") void ctx.resume();
    const notes = kind === "evaluation" ? [523.25, 659.25] : [659.25, 783.99];
    const now = ctx.currentTime;
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = now + i * 0.16;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.03);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.28);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.3);
    });
  } catch (err) {
    console.warn("Soft chime failed", err);
  }
}

let _liveToastTimer = null;
let _liveToastRemoveTimer = null;
const LIVE_TOAST_DURATION_MS = 5000;
function showLiveToast(title, sub, success) {
  _ensureLiveStyles();
  let el = document.getElementById("liveToast");
  if (!el) {
    el = document.createElement("div");
    el.id = "liveToast";
    el.setAttribute("role", "status");
    el.setAttribute("aria-live", "polite");
    document.body.appendChild(el);
  }
  // إلغاء أي مؤقتات سابقة (إشعار جديد يمدد الظهور من جديد)
  if (_liveToastTimer) clearTimeout(_liveToastTimer);
  if (_liveToastRemoveTimer) clearTimeout(_liveToastRemoveTimer);
  el.classList.toggle("success", !!success);
  el.classList.remove("hide");
  el.innerHTML = "";
  const icon = document.createElement("div");
  icon.className = "live-toast-icon";
  icon.textContent = success ? "✅" : "🔔";
  const body = document.createElement("div");
  body.className = "live-toast-body";
  const titleEl = document.createElement("div");
  titleEl.className = "live-toast-title";
  titleEl.textContent = title;
  const subEl = document.createElement("div");
  subEl.className = "live-toast-sub";
  subEl.textContent = sub || "";
  body.appendChild(titleEl);
  if (sub) body.appendChild(subEl);
  const closeBtn = document.createElement("button");
  closeBtn.type = "button";
  closeBtn.className = "live-toast-close";
  closeBtn.setAttribute("aria-label", "إغلاق التنبيه");
  closeBtn.textContent = "×";
  closeBtn.onclick = (ev) => { ev.stopPropagation(); dismissLiveToast(); };
  const bar = document.createElement("div");
  bar.className = "live-toast-progress";
  bar.innerHTML = "<span></span>";
  // إعادة تشغيل أنيميشن شريط العد التنازلي
  const barSpan = bar.firstChild;
  barSpan.style.animation = "none";
  void barSpan.offsetWidth;
  barSpan.style.animation = "";
  barSpan.style.animationDuration = (LIVE_TOAST_DURATION_MS / 1000) + "s";
  el.appendChild(icon);
  el.appendChild(body);
  el.appendChild(closeBtn);
  el.appendChild(bar);
  // إظهار كـ Pop-up ثم إخفاء تلقائي + إزالة نهائية من الصفحة
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));
  _liveToastTimer = setTimeout(() => dismissLiveToast(), LIVE_TOAST_DURATION_MS);
}
function dismissLiveToast() {
  const el = document.getElementById("liveToast");
  if (!el) return;
  if (_liveToastTimer) { clearTimeout(_liveToastTimer); _liveToastTimer = null; }
  if (_liveToastRemoveTimer) clearTimeout(_liveToastRemoveTimer);
  el.classList.remove("show");
  el.classList.add("hide");
  // إزالة كاملة من الـ DOM بعد انتهاء أنيميشن الخروج حتى لا يبقى أي أثر بالصفحة
  _liveToastRemoveTimer = setTimeout(() => {
    const node = document.getElementById("liveToast");
    if (node) node.remove();
    _liveToastRemoveTimer = null;
  }, 400);
}
function refreshLiveData(kind) {
  // تحديث الصفحات المسموحة للموظف فقط (البقية غير مهيأة وسيرفضها الخادم)
  try { if (hasPerm("overview.view")) initOverview(); } catch (e) { /* ignore */ }
  try {
    if (kind === "complaint" && hasPerm("complaints.view")) loadComplaints();
    if (kind === "evaluation" && hasPerm("evaluations.view")) loadEvaluations();
    if (hasPerm("reports.view") && typeof loadReports === "function") loadReports();
  } catch (e) { /* ignore */ }
}
let _liveEventSource = null;
function initLiveNotifications() {
  _ensureBellBadge();
  if (_liveEventSource || typeof EventSource === "undefined") return;
  const base = (window.APP_CONFIG && window.APP_CONFIG.API_BASE_URL) || "";
  const es = new EventSource(base + "/api/events/stream", { withCredentials: true });
  _liveEventSource = es;
  // الصوت + النافذة المنبثقة + الجرس في notifications.js (handleLiveNotification)
  es.addEventListener("complaint_created", (e) => {
    let data = {};
    try { data = JSON.parse(e.data); } catch (err) { /* ignore */ }
    handleLiveNotification("complaint", data);
    refreshLiveData("complaint");
  });
  es.addEventListener("evaluation_created", (e) => {
    let data = {};
    try { data = JSON.parse(e.data); } catch (err) { /* ignore */ }
    handleLiveNotification("evaluation", data);
    refreshLiveData("evaluation");
  });
  es.onerror = () => {
    try { es.close(); } catch (err) { /* ignore */ }
    _liveEventSource = null;
    setTimeout(initLiveNotifications, 5000);
  };
}
