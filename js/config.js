// إعدادات الواجهة الأمامية
// - لوكال (localhost / 127.0.0.1): عنوان الـ backend يُشتق تلقائيًا من مضيف
//   الصفحة على المنفذ 8000، لضمان عمل كوكي الجلسة (SameSite=Lax).
// - إنتاج (GitHub Pages أو أي استضافة): يستخدم رابط Railway الثابت.
// ملاحظة: لا تحذف رابط الإنتاج عند العودة للوكال — الاختيار تلقائي حسب المضيف.
const PROD_API_BASE_URL = "https://umrah-satisfaction-rate-production.up.railway.app"; 

const _hostname = window.location.hostname || "";
const _isLocalHost =
  _hostname === "localhost" ||
  _hostname === "127.0.0.1" ||
  _hostname === "[::1]" ||
  _hostname === "";

const _apiBase =
  window.location.protocol === "file:"
    ? "http://127.0.0.1:8000" // احتياطي عند الفتح عبر file://
    : _isLocalHost &&
        (window.location.protocol === "http:" || window.location.protocol === "https:")
      ? `${window.location.protocol}//${_hostname === "" ? "127.0.0.1" : _hostname}:8000`
      : PROD_API_BASE_URL;

window.APP_CONFIG = {
  // عنوان خادم FastAPI (backend)
  API_BASE_URL: _apiBase,

  // بيانات مشروع Supabase (تُستخدم فقط للاشتراك اللحظي في جدول complaints عبر Realtime)
  SUPABASE_URL: "https://YOUR-PROJECT-REF.supabase.co",
  SUPABASE_ANON_KEY: "YOUR-SUPABASE-ANON-KEY",
};
