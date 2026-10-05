const COMPLAINT_TYPE_BADGES = {
  "تائه": '<span class="badge bg-warning text-dark">تائه</span>',
  "شكوى على الفندق": '<span class="badge bg-info text-dark">شكوى على الفندق</span>',
  "شكوى على النقل": '<span class="badge bg-primary">شكوى على النقل</span>',
  "شكوى على المندوب": '<span class="badge bg-danger">شكوى على المندوب</span>',
  "شكوى أخرى": '<span class="badge bg-secondary">شكوى أخرى</span>',
};

const STATUS_BADGES = {
  "جديدة": '<span class="badge bg-danger">جديدة</span>',
  "قيد المعالجة": '<span class="badge bg-warning text-dark">قيد المعالجة</span>',
  "تم حلها": '<span class="badge bg-success">تم حلها</span>',
  "لم يتم الحل": '<span class="badge bg-dark">لم يتم الحل</span>',
};

// أحادية الاتجاه: يطابق STATUS_ORDER بالباك اند (complaints.py) تمامًا.
const STATUS_ORDER = { "جديدة": 0, "قيد المعالجة": 1, "تم حلها": 2, "لم يتم الحل": 2 };
const TERMINAL_STATUSES = new Set(["تم حلها", "لم يتم الحل"]);

let _selectedComplaintId = null;

function _playNotificationChime() {
  if (typeof playSoftChime === "function") playSoftChime("complaint");
  else console.warn("playSoftChime not loaded yet");
}

function _showToast(message) {
  const container = document.getElementById("toastContainer");
  if (!container) return;
  // Pop-up مؤقت: يظهر أعلى الشاشة ثم يختفي تلقائياً ولا يبقى بالصفحة
  const toastEl = document.createElement("div");
  toastEl.className = "toast align-items-center text-bg-danger border-0";
  toastEl.setAttribute("role", "alert");
  toastEl.innerHTML = `
    <div class="d-flex">
      <div class="toast-body">${message}</div>
      <button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button>
    </div>`;
  container.appendChild(toastEl);
  const toast = new bootstrap.Toast(toastEl, { delay: 4000 });
  toast.show();
  toastEl.addEventListener("hidden.bs.toast", () => toastEl.remove());
  // ضمان الإزالة النهائية حتى لو تعطل حدث Bootstrap
  setTimeout(() => { if (toastEl.isConnected) toastEl.remove(); }, 4500);
}

function _fmtDateTime(value) {
  return value ? new Date(value).toLocaleString("ar") : '<span class="text-muted">-</span>';
}

// حماية من XSS: محتوى البلاغ نص خام من مستخدمي واتساب، فلا يُحقن أبداً في innerHTML.
function _escapeHtmlComplaint(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// رابط محادثة المعتمر في واتساب على حساب البوت نفسه (المتصفح مربوط كجهاز مرافق
// لواتساب البوت)، فيرى الموظف كامل السجل والصور والرسائل الصوتية والموقع.
// يُرجَع نص فارغ إذا كان الرقم مقنّعاً (بلا صلاحية complaints.view_contact)
// أو غير صالح (مثل معرّفات LID) - فيُخفى الزر تلقائياً.
function _complaintChatUrl(phone) {
  const raw = String(phone ?? "");
  const digits = raw.replace(/\D/g, "");
  if (raw.includes("•") || digits.length < 8) return "";
  return `https://web.whatsapp.com/send?phone=${digits}`;
}

// عنصر زر "دخول المحادثة" (يُبنى بالـ DOM فلا يُحقن أي HTML من بيانات المعتمر)
function _renderComplaintChatLink(containerId, phone) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.textContent = "";
  const url = _complaintChatUrl(phone);
  if (!url) return;
  const link = document.createElement("a");
  link.className = "btn btn-sm btn-success";
  link.href = url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.title = "فتح محادثة المعتمر في واتساب ويب (حساب البوت)";
  const icon = document.createElement("i");
  icon.className = "bi bi-whatsapp";
  link.append(icon, " دخول المحادثة");
  container.appendChild(link);
}

// عرض المحتوى مع تحويل الروابط (مواقع/روابط يرسلها المعتمر) إلى روابط قابلة
// للنقر، مع إبقاء النص كنص خام (textContent) فلا يُنفَّذ أي HTML.
function _renderComplaintContent(element, text) {
  element.textContent = "";
  const raw = String(text ?? "");
  const urlPattern = /https?:\/\/[^\s]+/g;
  let lastIndex = 0;
  for (const match of raw.matchAll(urlPattern)) {
    if (match.index > lastIndex) element.append(raw.slice(lastIndex, match.index));
    const link = document.createElement("a");
    link.href = match[0];
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = match[0];
    element.append(link);
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < raw.length) element.append(raw.slice(lastIndex));
}

function _canActOnComplaints() {
  return hasPerm("complaints.add_note") || hasPerm("complaints.process") || hasPerm("complaints.close");
}

function _renderComplaintsRow(c) {
  const rawContent = c.content || "";
  const contentPreview = rawContent.length > 60 ? rawContent.slice(0, 60) + "…" : rawContent;
  const complaintType = COMPLAINT_TYPE_BADGES[c.complaint_type] || '<span class="text-muted">غير محدد</span>';
  const statusBadge = STATUS_BADGES[c.status] || _escapeHtmlComplaint(c.status);
  const receivedBy = c.received_by ? _escapeHtmlComplaint(c.received_by) : '<span class="text-muted">-</span>';
  // رابط محادثة البوت (يُبنى من أرقام فقط، ولا يظهر للرقم المقنّع)
  const chatUrl = _complaintChatUrl(c.phone_number);
  return `
    <tr data-complaint-id="${c.id}">
      <td class="sticky-col fw-semibold">${c.pilgrim_name ? _escapeHtmlComplaint(c.pilgrim_name) : "-"}</td>
      <td class="font-monospace">#${_escapeHtmlComplaint(c.reference_number)}</td>
      <td class="font-monospace">${_escapeHtmlComplaint(c.passport_number)}</td>
      <td class="font-monospace">${c.phone_number ? _escapeHtmlComplaint(c.phone_number) : "-"}</td>
      <td>${c.agent_name ? _escapeHtmlComplaint(c.agent_name) : "-"}</td>
      <td>${complaintType}</td>
      <td>${_escapeHtmlComplaint(contentPreview)}</td>
      <td>${statusBadge}</td>
      <td>${_fmtDateTime(c.created_at)}</td>
      <td>${_fmtDateTime(c.received_at)}</td>
      <td>${receivedBy}</td>
      <td>${_fmtDateTime(c.closed_at)}</td>
      <td>
        <div class="d-flex gap-1 justify-content-center">
          <button class="btn btn-sm btn-outline-primary" onclick="openComplaintModal(${c.id})">${_canActOnComplaints() ? "إدارة" : "عرض"}</button>
          ${
            chatUrl
              ? `<a class="btn btn-sm btn-outline-success" href="${chatUrl}" target="_blank" rel="noopener noreferrer" title="فتح محادثة المعتمر في واتساب ويب (حساب البوت)"><i class="bi bi-whatsapp"></i> دخول المحادثة</a>`
              : ""
          }
        </div>
      </td>
    </tr>`;
}

let _complaintsCache = [];
const _complaintsState = {
  page: 1,
  pageSize: 25,
  search: "",
  agent_name: "",
  complaint_type: "",
  status: "",
  nationality: "",
  date_from: "",
  date_to: "",
};

// التصفية الحالية (مشتركة بين الجدول والتصدير)
function _complaintsFilterParams() {
  const params = new URLSearchParams();
  ["search", "agent_name", "complaint_type", "status", "nationality", "date_from", "date_to"].forEach((key) => {
    if (_complaintsState[key]) params.set(key, _complaintsState[key]);
  });
  return params;
}

async function loadComplaints() {
  const tbody = document.getElementById("complaintsTableBody");
  try {
    const params = _complaintsFilterParams();
    params.set("page", _complaintsState.page);
    params.set("page_size", _complaintsState.pageSize);
    const data = await apiGet(`/api/complaints?${params.toString()}`);
    _complaintsCache = data.items;
    tbody.innerHTML = _complaintsCache.length
      ? _complaintsCache.map(_renderComplaintsRow).join("")
      : `<tr><td colspan="13" class="text-center text-muted py-4">لا توجد بلاغات</td></tr>`;

    const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
    document.getElementById("complaintsPageInfo").textContent = `صفحة ${data.page} من ${totalPages} (الإجمالي: ${data.total})`;
    document.getElementById("complaintsPrevBtn").disabled = data.page <= 1;
    document.getElementById("complaintsNextBtn").disabled = data.page >= totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="13" class="text-center text-danger py-4">تعذّر تحميل البلاغات: ${_escapeHtmlComplaint(err.message)}</td></tr>`;
  }
}

function openComplaintModal(id) {
  const complaint = _complaintsCache.find((c) => c.id === id);
  if (!complaint) return;
  _selectedComplaintId = id;

  document.getElementById("modalComplaintId").textContent = `#${complaint.reference_number}`;
  document.getElementById("modalComplaintPassport").textContent = complaint.passport_number;
  document.getElementById("modalComplaintType").textContent = complaint.complaint_type || "غير محدد";
  document.getElementById("modalComplaintContentType").textContent = complaint.content_type || "وسائط";
  _renderComplaintContent(document.getElementById("modalComplaintContent"), complaint.content);
  // زر فتح محادثة البوت مع المعتمر (يُخفى تلقائياً إذا كان الرقم مقنّعاً أو غير صالح)
  document.getElementById("modalComplaintPhone").textContent = complaint.phone_number || "-";
  _renderComplaintChatLink("modalComplaintChatBtn", complaint.phone_number);

  const isTerminal = TERMINAL_STATUSES.has(complaint.status);

  const actionField = document.getElementById("modalComplaintAction");
  const actionHintEl = document.getElementById("modalComplaintActionHint");
  actionField.value = "";
  actionField.disabled = isTerminal;
  actionHintEl.textContent = isTerminal
    ? "البلاغ مغلق نهائياً - لا يمكن إضافة إجراءات بعد الآن."
    : complaint.status === "جديدة"
      ? 'إلزامي عند تغيير الحالة عن "جديدة". عند اختيار "تم حلها" يصل للمعتمر إشعار واتساب تلقائي برقم المرجع.'
      : 'اختياري - أضف ملاحظة متابعة. عند اختيار "تم حلها" يصل للمعتمر إشعار واتساب تلقائي برقم المرجع.';
  _loadComplaintLog(complaint);

  const statusSelect = document.getElementById("modalComplaintStatus");
  const hintEl = document.getElementById("modalComplaintStatusHint");
  const currentOrder = STATUS_ORDER[complaint.status];

  // كل انتقال بصلاحيته: بدء المعالجة (process) والإغلاق (close) - مطابق للباك اند
  const canProcess = hasPerm("complaints.process");
  const canClose = hasPerm("complaints.close");
  Array.from(statusSelect.options).forEach((opt) => {
    const isBackward = opt.value !== complaint.status && STATUS_ORDER[opt.value] < currentOrder;
    const lacksPerm =
      opt.value !== complaint.status &&
      ((opt.value === "قيد المعالجة" && !canProcess) || (TERMINAL_STATUSES.has(opt.value) && !canClose));
    opt.disabled = isBackward || lacksPerm;
  });
  statusSelect.value = complaint.status;
  statusSelect.disabled = isTerminal;
  hintEl.textContent = isTerminal
    ? "هذا البلاغ مغلق نهائياً (تم حلها / لم يتم الحل) ولا يمكن تغيير حالته بعد الآن."
    : "لا يمكن الرجوع لحالة سابقة بعد تقدّم البلاغ.";
  document.getElementById("modalReceivedAt").textContent = complaint.received_at
    ? new Date(complaint.received_at).toLocaleString("ar")
    : "لم يُستلم بعد";
  document.getElementById("modalReceivedBy").textContent = complaint.received_by || "-";
  document.getElementById("modalClosedAt").textContent = complaint.closed_at
    ? new Date(complaint.closed_at).toLocaleString("ar")
    : "-";

  // الملاحظة تظهر لمن يستطيع إضافتها أو تغيير الحالة (الملاحظة ترافق تغيير الحالة)
  const canNote = hasPerm("complaints.add_note");
  const canChangeStatus = canProcess || canClose;
  const canAct = canNote || canChangeStatus;
  actionField.closest(".mb-3").classList.toggle("d-none", !canAct);
  document.getElementById("saveComplaintBtn").classList.toggle("d-none", !canAct);
  if (!canChangeStatus) {
    statusSelect.disabled = true;
    if (!isTerminal) {
      hintEl.textContent = canNote
        ? "صلاحيتك إضافة ملاحظات متابعة فقط دون تغيير حالة البلاغ."
        : "صلاحيتك عرض البلاغات فقط - تواصل مع المدير لمنحك صلاحيات إضافية.";
    }
  } else if (!isTerminal && !canClose) {
    hintEl.textContent = "لا تملك صلاحية إغلاق البلاغ - يمكنك بدء معالجته وإضافة الملاحظات.";
  }

  new bootstrap.Modal(document.getElementById("complaintModal")).show();
}

const _LOG_KIND_META = {
  notification_sent: { icon: "bi-whatsapp", cls: "log-success", title: "تم إرسال إشعار الحل للمعتمر عبر واتساب" },
  notification_failed: { icon: "bi-exclamation-triangle-fill", cls: "log-danger", title: "تعذّر إرسال إشعار الحل للمعتمر" },
};

function _renderLogEntry(entry) {
  const meta = _LOG_KIND_META[entry.kind] || { icon: "bi-pencil-square", cls: "", title: "" };
  const statusChange = entry.to_status
    ? `<div class="complaint-log-status">${STATUS_BADGES[entry.from_status] || _escapeHtmlComplaint(entry.from_status || "-")}
         <i class="bi bi-arrow-left"></i> ${STATUS_BADGES[entry.to_status] || _escapeHtmlComplaint(entry.to_status)}</div>`
    : "";
  const title = meta.title ? `<div class="complaint-log-title">${meta.title}</div>` : "";
  const note = entry.note ? `<div class="complaint-log-note">${_escapeHtmlComplaint(entry.note)}</div>` : "";
  const when = entry.created_at ? new Date(entry.created_at).toLocaleString("ar") : "";
  return `
    <li class="complaint-log-item ${meta.cls}">
      <i class="bi ${meta.icon} complaint-log-icon"></i>
      <div class="complaint-log-body">
        <div class="complaint-log-meta"><strong>${_escapeHtmlComplaint(entry.author)}</strong> · ${when}</div>
        ${title}${statusChange}${note}
      </div>
    </li>`;
}

async function _loadComplaintLog(complaint) {
  const list = document.getElementById("modalComplaintLog");
  list.innerHTML = '<li class="text-muted small">جارِ تحميل السجل...</li>';
  try {
    const entries = await apiGet(`/api/complaints/${complaint.id}/actions`);
    if (_selectedComplaintId !== complaint.id) return; // فُتح بلاغ آخر أثناء التحميل
    // بلاغات ما قبل تفعيل السجل: آخر إجراء محفوظ فقط في action_taken
    if (!entries.length && complaint.action_taken) {
      entries.push({
        kind: "update",
        author: complaint.received_by || "إجراء سابق",
        note: complaint.action_taken,
        created_at: complaint.received_at,
      });
    }
    list.innerHTML = entries.length
      ? entries.map(_renderLogEntry).join("")
      : '<li class="text-muted small">لا توجد إجراءات بعد</li>';
  } catch (err) {
    list.innerHTML = `<li class="text-danger small">تعذّر تحميل السجل: ${_escapeHtmlComplaint(err.message)}</li>`;
  }
}

async function saveComplaintUpdate() {
  if (!_selectedComplaintId) return;
  const status = document.getElementById("modalComplaintStatus").value;
  const note = document.getElementById("modalComplaintAction").value.trim();
  const payload = { status };
  if (note) payload.action_taken = note;

  try {
    await apiPatch(`/api/complaints/${_selectedComplaintId}`, payload);
    bootstrap.Modal.getInstance(document.getElementById("complaintModal")).hide();
    loadComplaints();
  } catch (err) {
    alert(`فشل تحديث البلاغ: ${err.message}`);
  }
}

// عناصر التصفية وحقل الحالة المقابل لكل منها
const _COMPLAINT_FILTERS = {
  complaintsFilterAgent: "agent_name",
  complaintsFilterType: "complaint_type",
  complaintsFilterStatus: "status",
  complaintsFilterNationality: "nationality",
  complaintsFilterDateFrom: "date_from",
  complaintsFilterDateTo: "date_to",
};

async function _loadComplaintFilterOptions() {
  _populateSelect(document.getElementById("complaintsFilterType"), Object.keys(COMPLAINT_TYPE_BADGES));
  _populateSelect(document.getElementById("complaintsFilterStatus"), Object.keys(STATUS_BADGES));
  try {
    // اسم الوكيل والجنسية من بيانات المعتمرين (نفس خيارات صفحة المعتمرين)
    const options = await apiGet("/api/pilgrims/filter-options");
    _populateSelect(document.getElementById("complaintsFilterAgent"), options.agents);
    _populateSelect(document.getElementById("complaintsFilterNationality"), options.nationalities);
  } catch (err) {
    console.error("تعذّر تحميل خيارات فلاتر البلاغات", err);
  }
}

// يُستخدم أيضاً من الإشعارات قبل فتح بلاغ حتى لا تخفيه تصفية سابقة
function resetComplaintFilters() {
  document.getElementById("complaintsSearchInput").value = "";
  Object.keys(_COMPLAINT_FILTERS).forEach((elementId) => (document.getElementById(elementId).value = ""));
  Object.assign(_complaintsState, {
    search: "",
    agent_name: "",
    complaint_type: "",
    status: "",
    nationality: "",
    date_from: "",
    date_to: "",
    page: 1,
  });
}

function _wireComplaintFilters() {
  const input = document.getElementById("complaintsSearchInput");
  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _complaintsState.search = input.value.trim();
      _complaintsState.page = 1;
      loadComplaints();
    }, 350);
  });

  Object.entries(_COMPLAINT_FILTERS).forEach(([elementId, stateKey]) => {
    document.getElementById(elementId).addEventListener("change", (e) => {
      _complaintsState[stateKey] = e.target.value;
      _complaintsState.page = 1;
      loadComplaints();
    });
  });

  document.getElementById("complaintsResetFiltersBtn").addEventListener("click", () => {
    resetComplaintFilters();
    loadComplaints();
  });

  document.getElementById("complaintsPrevBtn").addEventListener("click", () => {
    if (_complaintsState.page > 1) {
      _complaintsState.page -= 1;
      loadComplaints();
    }
  });
  document.getElementById("complaintsNextBtn").addEventListener("click", () => {
    _complaintsState.page += 1;
    loadComplaints();
  });
}

function initComplaints() {
  wireExportButton(
    "complaintsExportBtn", "complaints.export", () => `/api/complaints/export?${_complaintsFilterParams()}`, "البلاغات.csv"
  );
  _wireComplaintFilters();
  _loadComplaintFilterOptions();
  loadComplaints();
  document.getElementById("saveComplaintBtn").addEventListener("click", saveComplaintUpdate);
}
