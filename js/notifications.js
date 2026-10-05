// جرس الإشعارات + نوافذ منبثقة للبلاغات والتقييمات الجديدة.
// الإشعار يصل لكل الموظفين الفاتحين للوحة، وإذا فتحه موظف يختفي عنده هو فقط
// (حالة القراءة محفوظة لكل حساب في الباك اند: /api/notifications).

const _notifState = { items: [], unreadCount: 0 };
const NOTIF_POPUP_DURATION_MS = 8000;
const NOTIF_MAX_POPUPS = 3;

function _notifEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _notifRelativeTime(value) {
  const seconds = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 1000));
  if (seconds < 60) return "الآن";
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return minutes === 1 ? "قبل دقيقة" : minutes === 2 ? "قبل دقيقتين" : `قبل ${minutes} دقيقة`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours === 1 ? "قبل ساعة" : hours === 2 ? "قبل ساعتين" : `قبل ${hours} ساعة`;
  const days = Math.round(hours / 24);
  return days === 1 ? "أمس" : days === 2 ? "قبل يومين" : `قبل ${days} أيام`;
}

function _notifExactTime(value) {
  return new Date(value).toLocaleString("ar-SA-u-ca-gregory-nu-latn", {
    hour: "2-digit",
    minute: "2-digit",
    day: "numeric",
    month: "long",
  });
}

// العنوان والوصف لكل نوع إشعار (مستخدم في القائمة والنافذة المنبثقة)
function _notifContent(item) {
  if (item.kind === "complaint") {
    return {
      icon: "🚨",
      title: `بلاغ جديد${item.reference_number ? ` #${item.reference_number}` : ""}`,
      sub: [item.pilgrim_name, item.complaint_type].filter(Boolean).join(" — "),
      preview: item.preview || "",
    };
  }
  return {
    icon: "⭐",
    title: "تقييم جديد",
    sub: [item.pilgrim_name, item.overall_satisfaction_pct ? `الرضا العام: ${item.overall_satisfaction_pct}` : ""]
      .filter(Boolean)
      .join(" — "),
    preview: "",
  };
}

function _notifKey(item) {
  return `${item.kind}:${item.id}`;
}

// ==========================================================================
// الجرس والقائمة
// ==========================================================================

function _renderNotifBadge() {
  const badge = document.getElementById("notifBellBadge");
  const count = _notifState.unreadCount;
  badge.textContent = count > 99 ? "99+" : String(count);
  badge.classList.toggle("d-none", count === 0);
  document.getElementById("notifBell").classList.toggle("has-unread", count > 0);
}

function _renderNotifList() {
  const list = document.getElementById("notifList");
  document.getElementById("notifReadAllBtn").disabled = _notifState.items.length === 0;
  if (!_notifState.items.length) {
    list.innerHTML = `
      <div class="notif-empty">
        <i class="bi bi-bell-slash"></i>
        <div>لا توجد إشعارات جديدة</div>
      </div>`;
    return;
  }
  list.innerHTML = _notifState.items
    .map((item) => {
      const c = _notifContent(item);
      return `
        <button type="button" class="notif-item notif-item-${item.kind}" data-key="${_notifEscape(_notifKey(item))}">
          <span class="notif-item-icon">${c.icon}</span>
          <span class="notif-item-body">
            <span class="notif-item-title">${_notifEscape(c.title)}</span>
            ${c.sub ? `<span class="notif-item-sub">${_notifEscape(c.sub)}</span>` : ""}
            ${c.preview ? `<span class="notif-item-preview">${_notifEscape(c.preview)}</span>` : ""}
            <span class="notif-item-time" title="${_notifEscape(_notifExactTime(item.created_at))}">
              ${_notifEscape(_notifRelativeTime(item.created_at))} · ${_notifEscape(_notifExactTime(item.created_at))}
            </span>
          </span>
        </button>`;
    })
    .join("");
}

function _renderNotifications() {
  _renderNotifBadge();
  _renderNotifList();
}

async function loadNotifications() {
  try {
    const data = await apiGet("/api/notifications");
    _notifState.items = data.items || [];
    _notifState.unreadCount = data.unread_count || 0;
    _renderNotifications();
  } catch (err) {
    console.error("loadNotifications failed", err);
  }
}

function _toggleNotifPanel(open) {
  const panel = document.getElementById("notifPanel");
  const bell = document.getElementById("notifBell");
  const shouldOpen = open ?? panel.classList.contains("d-none");
  panel.classList.toggle("d-none", !shouldOpen);
  bell.setAttribute("aria-expanded", String(shouldOpen));
  if (shouldOpen) _renderNotifList(); // تحديث "قبل X دقيقة"
}

// يفتح البلاغ/التقييم ويخفي الإشعار عند هذا الموظف فقط
async function openNotification(item) {
  _toggleNotifPanel(false);
  _dismissNotifPopup(_notifKey(item));

  // إخفاء فوري في الواجهة، ثم التأكيد من الخادم
  const key = _notifKey(item);
  if (_notifState.items.some((i) => _notifKey(i) === key)) {
    _notifState.items = _notifState.items.filter((i) => _notifKey(i) !== key);
    _notifState.unreadCount = Math.max(0, _notifState.unreadCount - 1);
    _renderNotifications();
  }
  apiPost("/api/notifications/read", { kind: item.kind, id: item.id })
    .then((res) => {
      _notifState.unreadCount = res.unread_count;
      _renderNotifBadge();
    })
    .catch((err) => console.error("mark notification read failed", err));

  // نلغي أي تصفية سابقة ونبحث عن العنصر نفسه، فيظهر مهما كانت صفحته
  if (item.kind === "complaint") {
    _goToSection("section-complaints");
    resetComplaintFilters();
    if (item.reference_number) {
      _complaintsState.search = item.reference_number;
      document.getElementById("complaintsSearchInput").value = item.reference_number;
    }
    await loadComplaints();
    openComplaintModal(item.id);
  } else {
    _goToSection("section-evaluations");
    resetEvaluationFilters();
    if (item.passport_number) {
      _evaluationsState.search = item.passport_number;
      document.getElementById("evaluationsSearchInput").value = item.passport_number;
    }
    await loadEvaluations();
    openEvaluationModal(item.id);
  }
}

function _goToSection(sectionId) {
  const link = document.querySelector(`#mainNav .nav-link[data-target="${sectionId}"]`);
  if (link) link.click();
}

async function markAllNotificationsRead() {
  _notifState.items = [];
  _notifState.unreadCount = 0;
  _renderNotifications();
  document.querySelectorAll(".notif-popup").forEach((el) => _dismissNotifPopup(el.dataset.key));
  try {
    await apiPost("/api/notifications/read-all");
  } catch (err) {
    console.error("mark all notifications read failed", err);
    loadNotifications();
  }
}

// ==========================================================================
// النافذة المنبثقة (Pop-up) + الصوت
// ==========================================================================

function _notifPopupContainer() {
  let container = document.getElementById("notifPopups");
  if (!container) {
    container = document.createElement("div");
    container.id = "notifPopups";
    container.setAttribute("aria-live", "polite");
    document.body.appendChild(container);
  }
  return container;
}

function _dismissNotifPopup(key) {
  const el = document.querySelector(`.notif-popup[data-key="${CSS.escape(key)}"]`);
  if (!el || el.classList.contains("leaving")) return;
  clearTimeout(el._hideTimer);
  el.classList.add("leaving");
  setTimeout(() => el.remove(), 300);
}

function showNotificationPopup(item) {
  const container = _notifPopupContainer();
  const key = _notifKey(item);
  if (container.querySelector(`.notif-popup[data-key="${CSS.escape(key)}"]`)) return;

  const c = _notifContent(item);
  const el = document.createElement("div");
  el.className = `notif-popup notif-popup-${item.kind}`;
  el.dataset.key = key;
  el.setAttribute("role", "alert");
  el.innerHTML = `
    <span class="notif-popup-icon">${c.icon}</span>
    <span class="notif-popup-body">
      <span class="notif-popup-title">${_notifEscape(c.title)}</span>
      ${c.sub ? `<span class="notif-popup-sub">${_notifEscape(c.sub)}</span>` : ""}
      <span class="notif-popup-time">${_notifEscape(_notifExactTime(item.created_at))} · اضغط للفتح</span>
    </span>
    <button type="button" class="notif-popup-close" aria-label="إغلاق">×</button>
    <span class="notif-popup-progress"><span></span></span>`;
  el.querySelector(".notif-popup-progress span").style.animationDuration = `${NOTIF_POPUP_DURATION_MS}ms`;

  // الضغط على النافذة يفتح البلاغ ويخفيه عند هذا الموظف؛ زر × يغلق النافذة فقط ويبقى الإشعار في الجرس
  el.addEventListener("click", () => openNotification(item));
  el.querySelector(".notif-popup-close").addEventListener("click", (ev) => {
    ev.stopPropagation();
    _dismissNotifPopup(key);
  });

  // الأحدث فوق
  container.prepend(el);
  const popups = container.querySelectorAll(".notif-popup:not(.leaving)");
  Array.from(popups).slice(NOTIF_MAX_POPUPS).forEach((old) => _dismissNotifPopup(old.dataset.key));

  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.add("show")));

  // المؤقت يتوقف مع وقوف الماوس على النافذة (مثل شريط العد في CSS) ويكمل بعد مغادرتها
  let remaining = NOTIF_POPUP_DURATION_MS;
  let startedAt = Date.now();
  el._hideTimer = setTimeout(() => _dismissNotifPopup(key), remaining);
  el.addEventListener("mouseenter", () => {
    clearTimeout(el._hideTimer);
    remaining -= Date.now() - startedAt;
  });
  el.addEventListener("mouseleave", () => {
    startedAt = Date.now();
    el._hideTimer = setTimeout(() => _dismissNotifPopup(key), Math.max(remaining, 1000));
  });
}

// المتصفح يمنع الصوت حتى أول تفاعل للمستخدم مع الصفحة، فنفعّله مع أول نقرة أو ضغطة زر
function _unlockNotificationSound() {
  const unlock = () => {
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      _liveAudioCtx = _liveAudioCtx || new AC();
      if (_liveAudioCtx.state === "suspended") void _liveAudioCtx.resume();
    } catch (err) {
      console.warn("Audio unlock failed", err);
    }
  };
  ["pointerdown", "keydown"].forEach((type) => document.addEventListener(type, unlock, { once: true, capture: true }));
}

// يُستدعى من live.js عند وصول حدث لحظي (SSE) لبلاغ أو تقييم جديد
async function handleLiveNotification(kind, data) {
  if (typeof playSoftChime === "function") playSoftChime(kind);
  await loadNotifications();
  const item =
    _notifState.items.find((i) => i.kind === kind && i.id === data.id) ||
    // احتياط إن لم يصل من الخادم (مثلاً خطأ شبكة): نعرض ما في الحدث نفسه
    {
      kind,
      id: data.id,
      reference_number: data.reference_number,
      complaint_type: data.complaint_type,
      overall_satisfaction_pct: data.overall_satisfaction_pct,
      created_at: new Date().toISOString(),
    };
  showNotificationPopup(item);
}

function initNotifications() {
  const bell = document.getElementById("notifBell");
  if (!bell) return;

  bell.addEventListener("click", (ev) => {
    ev.stopPropagation();
    _toggleNotifPanel();
  });
  document.getElementById("notifReadAllBtn").addEventListener("click", (ev) => {
    ev.stopPropagation();
    markAllNotificationsRead();
  });
  document.getElementById("notifList").addEventListener("click", (ev) => {
    const button = ev.target.closest(".notif-item");
    if (!button) return;
    const item = _notifState.items.find((i) => _notifKey(i) === button.dataset.key);
    if (item) openNotification(item);
  });
  document.addEventListener("click", (ev) => {
    if (!ev.target.closest(".notif-bell-wrap")) _toggleNotifPanel(false);
  });
  document.addEventListener("keydown", (ev) => {
    if (ev.key === "Escape") _toggleNotifPanel(false);
  });

  _unlockNotificationSound();
  loadNotifications();
  // تحديث دوري: أوقات "قبل X دقيقة"، وما فتحه الموظف نفسه من تبويب أو جهاز آخر
  setInterval(loadNotifications, 60_000);
}
