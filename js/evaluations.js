const _evaluationsState = {
  page: 1,
  pageSize: 25,
  search: "",
  nationality: "",
  agent_name: "",
  overall: "",
  language: "",
  date_from: "",
  date_to: "",
};
let _evaluationsCache = [];

const LANGUAGE_LABELS = {
  ar: "العربية",
  en: "الإنجليزية",
  ur: "الأردية",
  id: "الإندونيسية",
  tr: "التركية",
};

const SATISFACTION_BADGES = {
  "راضي جداً": "bg-success",
  "راضي": "bg-primary",
  "غير راضي": "bg-danger",
  "أخرى": "bg-secondary",
};

const MATCH_BADGES = {
  "نعم": "bg-success",
  "نوعاً ما": "bg-warning text-dark",
  "غير مطابق": "bg-danger",
  "أخرى": "bg-secondary",
};

const AGENTS_BADGES = {
  "ممتاز": "bg-success",
  "جيد جداً": "bg-primary",
  "سيئ": "bg-danger",
  "أخرى": "bg-secondary",
};

function _overallPctBadgeClass(value) {
  const num = parseInt(value, 10);
  if (Number.isNaN(num)) return "bg-secondary";
  if (num >= 100) return "bg-success";
  if (num >= 75) return "bg-primary";
  if (num >= 50) return "bg-warning text-dark";
  return "bg-danger";
}

function _escapeHtmlEval(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

function _badge(value, map) {
  if (!value) return '<span class="text-muted">-</span>';
  const cls = map[value] || "bg-secondary";
  return `<span class="badge ${cls}">${_escapeHtmlEval(value)}</span>`;
}

function _overallPctBadge(value) {
  if (!value) return '<span class="text-muted">-</span>';
  return `<span class="badge ${_overallPctBadgeClass(value)}">${_escapeHtmlEval(value)}</span>`;
}

function _renderEvaluationsRow(e) {
  const hasNotes = e.suggestions_notes && e.suggestions_notes.trim().length > 0;
  return `
    <tr>
      <td class="sticky-col fw-semibold">${_escapeHtmlEval(e.pilgrim_name) || "-"}</td>
      <td class="font-monospace">${_escapeHtmlEval(e.passport_number)}</td>
      <td>${_escapeHtmlEval(e.agent_name) || "-"}</td>
      <td>${_escapeHtmlEval(e.nationality) || "-"}</td>
      <td class="font-monospace">${_escapeHtmlEval(e.phone_number) || "-"}</td>
      <td>${LANGUAGE_LABELS[e.language] || _escapeHtmlEval(e.language) || "-"}</td>
      <td>${_overallPctBadge(e.overall_satisfaction_pct)}</td>
      <td>${new Date(e.created_at).toLocaleDateString("ar")}</td>
      <td>${hasNotes ? '<span class="badge bg-info text-dark">نعم</span>' : '<span class="badge bg-secondary">لا</span>'}</td>
      <td>
        <button class="btn btn-sm btn-outline-primary" onclick="openEvaluationModal(${e.id})">عرض التقييم</button>
      </td>
    </tr>`;
}

// التصفية الحالية (مشتركة بين الجدول والتصدير)
function _evaluationsFilterParams() {
  const params = new URLSearchParams();
  ["search", "nationality", "agent_name", "overall", "language", "date_from", "date_to"].forEach((key) => {
    if (_evaluationsState[key]) params.set(key, _evaluationsState[key]);
  });
  return params;
}

async function loadEvaluations() {
  const tbody = document.getElementById("evaluationsTableBody");
  tbody.innerHTML = `<tr><td colspan="10" class="text-center text-muted py-4">جارِ التحميل...</td></tr>`;

  try {
    const params = _evaluationsFilterParams();
    params.set("page", _evaluationsState.page);
    params.set("page_size", _evaluationsState.pageSize);

    const data = await apiGet(`/api/evaluations?${params.toString()}`);
    _evaluationsCache = data.items;

    tbody.innerHTML = data.items.length
      ? data.items.map(_renderEvaluationsRow).join("")
      : `<tr><td colspan="10" class="text-center text-muted py-4">لا توجد تقييمات</td></tr>`;

    const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
    document.getElementById("evaluationsPageInfo").textContent = `صفحة ${data.page} من ${totalPages} (الإجمالي: ${data.total})`;
    document.getElementById("evaluationsPrevBtn").disabled = data.page <= 1;
    document.getElementById("evaluationsNextBtn").disabled = data.page >= totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="10" class="text-center text-danger py-4">تعذّر تحميل التقييمات: ${_escapeHtmlEval(err.message)}</td></tr>`;
  }
}

function _evalItem(label, badgeHtml, detail) {
  return `
    <div class="eval-item">
      <div class="eval-item-label">${label}</div>
      <div class="eval-item-value">
        ${badgeHtml}
        ${detail ? `<div class="eval-item-detail">${_escapeHtmlEval(detail)}</div>` : ""}
      </div>
    </div>`;
}

function openEvaluationModal(id) {
  const evaluation = _evaluationsCache.find((e) => e.id === id);
  if (!evaluation) return;

  document.getElementById("modalEvalPilgrimName").textContent = evaluation.pilgrim_name || "-";
  document.getElementById("modalEvalPassport").textContent = evaluation.passport_number;

  const items = [
    _evalItem("رضا خدمة الطيران", _badge(evaluation.flight_satisfaction, SATISFACTION_BADGES), evaluation.flight_other_detail),
    _evalItem("رضا النقل والمواصلات", _badge(evaluation.transport_satisfaction, SATISFACTION_BADGES), evaluation.transport_other_detail),
    _evalItem("رضا الفنادق", _badge(evaluation.hotels_satisfaction, SATISFACTION_BADGES), evaluation.hotels_other_detail),
    _evalItem("مطابقة الخدمات للوصف", _badge(evaluation.services_match, MATCH_BADGES), evaluation.services_match_other_detail),
    _evalItem("تقييم مناديب الشركة", _badge(evaluation.agents_rating, AGENTS_BADGES), evaluation.agents_other_detail),
    _evalItem("نسبة الرضا العام", _overallPctBadge(evaluation.overall_satisfaction_pct)),
  ];

  document.getElementById("modalEvalItems").innerHTML = items.join("");
  document.getElementById("modalEvalNotes").textContent = evaluation.suggestions_notes && evaluation.suggestions_notes.trim()
    ? evaluation.suggestions_notes
    : "لم يكتب المعتمر أي ملاحظات";

  new bootstrap.Modal(document.getElementById("evaluationModal")).show();
}

function _wireEvaluationsSearch() {
  const input = document.getElementById("evaluationsSearchInput");
  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _evaluationsState.search = input.value.trim();
      _evaluationsState.page = 1;
      loadEvaluations();
    }, 350);
  });

  document.getElementById("evaluationsPrevBtn").addEventListener("click", () => {
    if (_evaluationsState.page > 1) {
      _evaluationsState.page -= 1;
      loadEvaluations();
    }
  });
  document.getElementById("evaluationsNextBtn").addEventListener("click", () => {
    _evaluationsState.page += 1;
    loadEvaluations();
  });
}

// عناصر التصفية وحقل الحالة المقابل لكل منها
const _EVALUATION_FILTERS = {
  evaluationsFilterNationality: "nationality",
  evaluationsFilterAgent: "agent_name",
  evaluationsFilterOverall: "overall",
  evaluationsFilterLanguage: "language",
  evaluationsFilterDateFrom: "date_from",
  evaluationsFilterDateTo: "date_to",
};

async function _loadEvaluationFilterOptions() {
  const languageSelect = document.getElementById("evaluationsFilterLanguage");
  Object.entries(LANGUAGE_LABELS).forEach(([code, label]) => {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = label;
    languageSelect.appendChild(option);
  });
  try {
    // الجنسية واسم الوكيل من بيانات المعتمرين (نفس خيارات صفحة المعتمرين)
    const options = await apiGet("/api/pilgrims/filter-options");
    _populateSelect(document.getElementById("evaluationsFilterNationality"), options.nationalities);
    _populateSelect(document.getElementById("evaluationsFilterAgent"), options.agents);
  } catch (err) {
    console.error("تعذّر تحميل خيارات فلاتر التقييمات", err);
  }
}

function _wireEvaluationFilters() {
  Object.entries(_EVALUATION_FILTERS).forEach(([elementId, stateKey]) => {
    document.getElementById(elementId).addEventListener("change", (e) => {
      _evaluationsState[stateKey] = e.target.value;
      _evaluationsState.page = 1;
      loadEvaluations();
    });
  });

  document.getElementById("evaluationsResetFiltersBtn").addEventListener("click", () => {
    resetEvaluationFilters();
    loadEvaluations();
  });
}

// يُستخدم أيضاً من الإشعارات قبل فتح تقييم حتى لا تخفيه تصفية سابقة
function resetEvaluationFilters() {
  document.getElementById("evaluationsSearchInput").value = "";
  Object.keys(_EVALUATION_FILTERS).forEach((elementId) => (document.getElementById(elementId).value = ""));
  Object.assign(_evaluationsState, {
    search: "",
    nationality: "",
    agent_name: "",
    overall: "",
    language: "",
    date_from: "",
    date_to: "",
    page: 1,
  });
}

function initEvaluations() {
  wireExportButton(
    "evaluationsExportBtn", "evaluations.export", () => `/api/evaluations/export?${_evaluationsFilterParams()}`, "التقييمات.csv"
  );
  _wireEvaluationsSearch();
  _wireEvaluationFilters();
  _loadEvaluationFilterOptions();
  loadEvaluations();
}
