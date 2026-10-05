const API_BASE_URL = window.APP_CONFIG.API_BASE_URL;

async function apiFetch(path, { method = "GET", body, isForm = false } = {}) {
  const headers = {};
  if (!isForm) headers["Content-Type"] = "application/json";

  const response = await fetch(`${API_BASE_URL}${path}`, {
    method,
    credentials: "include",
    headers,
    body: isForm ? body : body !== undefined ? JSON.stringify(body) : undefined,
  });

  if (response.status === 401) {
    window.location.href = "login.html";
    throw new Error("غير مصرح - يرجى تسجيل الدخول");
  }

  if (!response.ok) {
    let detail = response.statusText;
    try {
      const errBody = await response.json();
      detail = errBody.detail || detail;
    } catch (_) {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }

  const contentType = response.headers.get("content-type") || "";
  return contentType.includes("application/json") ? response.json() : response.text();
}

// المستخدم الحالي وصلاحياته (يُملأ من /api/auth/me في dashboard.html).
// إخفاء العناصر حسب الصلاحية للعرض فقط؛ الباك اند يتحقق من كل طلب.
let CURRENT_USER = null;
function hasPerm(permission) {
  return !!CURRENT_USER && (CURRENT_USER.is_admin || (CURRENT_USER.permissions || []).includes(permission));
}

// تنزيل ملف من الخادم (تصدير Excel) مع نفس معالجة الأخطاء والجلسة في apiFetch
async function apiDownload(path, fallbackName) {
  const response = await fetch(`${API_BASE_URL}${path}`, { credentials: "include" });
  if (response.status === 401) {
    window.location.href = "login.html";
    throw new Error("غير مصرح - يرجى تسجيل الدخول");
  }
  if (!response.ok) {
    let detail = response.statusText;
    try {
      detail = (await response.json()).detail || detail;
    } catch (_) {
      /* ignore parse errors */
    }
    throw new Error(detail);
  }
  const disposition = response.headers.get("content-disposition") || "";
  const match = disposition.match(/filename\*=UTF-8''([^;]+)/i);
  const filename = match ? decodeURIComponent(match[1]) : fallbackName;
  const url = URL.createObjectURL(await response.blob());
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// زر تصدير في صفحة: يظهر بالصلاحية فقط، ويصدّر حسب التصفية الحالية للصفحة
function wireExportButton(buttonId, permission, buildPath, fallbackName) {
  const button = document.getElementById(buttonId);
  if (!button) return;
  if (!hasPerm(permission)) {
    button.classList.add("d-none");
    return;
  }
  button.addEventListener("click", async () => {
    const original = button.innerHTML;
    button.disabled = true;
    button.innerHTML = '<span class="spinner-border spinner-border-sm"></span> جارِ التصدير...';
    try {
      await apiDownload(buildPath(), fallbackName);
    } catch (err) {
      alert(`تعذّر التصدير: ${err.message}`);
    } finally {
      button.disabled = false;
      button.innerHTML = original;
    }
  });
}

const apiGet = (path) => apiFetch(path);
const apiPost = (path, body) => apiFetch(path, { method: "POST", body });
const apiPatch = (path, body) => apiFetch(path, { method: "PATCH", body });
const apiUpload = (path, formData) => apiFetch(path, { method: "POST", body: formData, isForm: true });
