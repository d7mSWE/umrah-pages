/* مؤشر اتصال بوت الواتساب في الشريط العلوي: يقرأ /api/whatsapp/status دورياً */
const WA_STATUS_POLL_MS = 30000;

const _WA_STATES = {
  connected: { cls: "wa-status-ok", text: "الواتساب متصل", title: "بوت الواتساب يعمل ويستقبل الرسائل" },
  connecting: { cls: "wa-status-warn", text: "جارِ الاتصال...", title: "البوابة تحاول الاتصال بالواتساب" },
  disconnected: {
    cls: "wa-status-down",
    text: "الواتساب مفصول",
    title: "البوابة تعمل لكن الواتساب غير مرتبط - لن تصل رسائل المعتمرين ولا إشعاراتهم",
  },
  unreachable: {
    cls: "wa-status-down",
    text: "البوابة متوقفة",
    title: "خدمة بوابة الواتساب لا تعمل - لن تصل رسائل المعتمرين ولا إشعاراتهم",
  },
  unknown: { cls: "wa-status-unknown", text: "تعذّر الفحص", title: "تعذّر الاتصال بالخادم لفحص حالة الواتساب" },
};

let _waLastState = null;

function _applyWhatsappState(key) {
  const el = document.getElementById("waStatus");
  if (!el) return;
  const s = _WA_STATES[key];
  el.className = `wa-status ${s.cls}`;
  el.title = s.title;
  document.getElementById("waStatusText").textContent = s.text;

  // تنبيه لحظي عند انقطاع كان متصلاً (وليس عند كل فحص)
  const isDown = key === "disconnected" || key === "unreachable";
  if (isDown && _waLastState === "connected" && typeof showLiveToast === "function") {
    showLiveToast("انقطع اتصال بوت الواتساب", s.title, false);
  }
  _waLastState = key;
}

async function refreshWhatsappStatus() {
  try {
    const status = await apiGet("/api/whatsapp/status");
    if (!status.reachable) _applyWhatsappState("unreachable");
    else if (status.connected) _applyWhatsappState("connected");
    else if (status.connecting) _applyWhatsappState("connecting");
    else _applyWhatsappState("disconnected");
  } catch (_) {
    _applyWhatsappState("unknown");
  }
}

function initWhatsappStatus() {
  refreshWhatsappStatus();
  setInterval(refreshWhatsappStatus, WA_STATUS_POLL_MS);
}
