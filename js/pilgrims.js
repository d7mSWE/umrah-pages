const PILGRIMS_COLUMN_COUNT = 17;

const _pilgrimsState = {
  page: 1,
  pageSize: 25,
  search: "",
  nationality: "",
  agent_name: "",
  pilgrim_status: "",
  inside_kingdom: "",
};

function _escapeHtml(text) {
  const div = document.createElement("div");
  div.textContent = text ?? "";
  return div.innerHTML;
}

// تعديل نص "التواجد" حسب حالة المعتمر لحالات خاصة (قبل الدخول أو لن يدخل أصلاً)،
// بدل الاعتماد فقط على متواجد داخل المملكة / غادر.
const PRESENCE_STATUS_OVERRIDES = {
  "التأشيره مرفوضه": { text: "تم رفض التأشيرة", badge: "bg-danger" },
  "تم طباعة التأشيرة": { text: "لم يدخل بعد", badge: "bg-warning text-dark" },
  "لم يتم اصدار التأشيره": { text: "لم تصدر التأشيرة بعد", badge: "bg-secondary" },
  "مراجعة القنصلية": { text: "لم تصدر التأشيرة بعد", badge: "bg-secondary" },
  "وفاة (مع تحرك وفاة)": { text: "متوفي", badge: "bg-dark" },
};

function _presenceLabel(p) {
  const override = PRESENCE_STATUS_OVERRIDES[p.pilgrim_status];
  if (override) {
    return `<span class="badge ${override.badge}">${override.text}</span>`;
  }
  return p.inside_kingdom
    ? '<span class="badge bg-success">داخل المملكة</span>'
    : '<span class="badge bg-secondary">غادر</span>';
}

// التصفية الحالية (مشتركة بين الجدول والتصدير)
function _pilgrimsFilterParams() {
  const params = new URLSearchParams();
  ["search", "nationality", "agent_name", "pilgrim_status", "inside_kingdom"].forEach((key) => {
    if (_pilgrimsState[key]) params.set(key, _pilgrimsState[key]);
  });
  return params;
}

async function loadPilgrims() {
  const tbody = document.getElementById("pilgrimsTableBody");
  tbody.innerHTML = `<tr><td colspan="${PILGRIMS_COLUMN_COUNT}" class="text-center text-muted py-4">جارِ التحميل...</td></tr>`;

  try {
    const params = _pilgrimsFilterParams();
    params.set("page", _pilgrimsState.page);
    params.set("page_size", _pilgrimsState.pageSize);

    const data = await apiGet(`/api/pilgrims?${params.toString()}`);

    if (data.items.length === 0) {
      tbody.innerHTML = `<tr><td colspan="${PILGRIMS_COLUMN_COUNT}" class="text-center text-muted py-4">لا توجد نتائج</td></tr>`;
    } else {
      tbody.innerHTML = data.items
        .map(
          (p) => `
        <tr>
          <td class="sticky-col fw-semibold">${_escapeHtml(p.pilgrim_name)}</td>
          <td class="font-monospace">${_escapeHtml(p.passport_number)}</td>
          <td>${_escapeHtml(p.nationality)}</td>
          <td class="group-end">${_escapeHtml(p.gender)}</td>
          <td>${_escapeHtml(p.group_number)}</td>
          <td>${_escapeHtml(p.agent_name)}</td>
          <td class="group-end">${_escapeHtml(p.agent_country)}</td>
          <td>${p.entry_date ?? ""}</td>
          <td>${_escapeHtml(p.arrival_flight_number)}</td>
          <td>${p.exit_date ?? ""}</td>
          <td>${_escapeHtml(p.departure_flight_number)}</td>
          <td>${p.residence_days ?? ""}</td>
          <td class="group-end">${_escapeHtml(p.program_duration)}</td>
          <td>${p.visa_issue_date ?? ""}</td>
          <td>${_escapeHtml(p.pilgrim_status)}</td>
          <td>${_escapeHtml(p.exit_status)}</td>
          <td>${_presenceLabel(p)}</td>
        </tr>`
        )
        .join("");
    }

    const totalPages = Math.max(1, Math.ceil(data.total / data.page_size));
    document.getElementById("pilgrimsPageInfo").textContent = `صفحة ${data.page} من ${totalPages} (الإجمالي: ${data.total})`;
    document.getElementById("pilgrimsPrevBtn").disabled = data.page <= 1;
    document.getElementById("pilgrimsNextBtn").disabled = data.page >= totalPages;
  } catch (err) {
    tbody.innerHTML = `<tr><td colspan="${PILGRIMS_COLUMN_COUNT}" class="text-center text-danger py-4">تعذّر تحميل البيانات: ${_escapeHtml(err.message)}</td></tr>`;
  }
}

function _populateSelect(selectEl, values) {
  for (const value of values) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = value;
    selectEl.appendChild(option);
  }
}

async function _loadFilterOptions() {
  try {
    const options = await apiGet("/api/pilgrims/filter-options");
    _populateSelect(document.getElementById("pilgrimsFilterNationality"), options.nationalities);
    _populateSelect(document.getElementById("pilgrimsFilterAgent"), options.agents);
    _populateSelect(document.getElementById("pilgrimsFilterStatus"), options.statuses);
  } catch (err) {
    console.error("تعذّر تحميل خيارات الفلاتر", err);
  }
}

function _wirePilgrimsSearch() {
  const input = document.getElementById("pilgrimsSearchInput");
  let debounceTimer;
  input.addEventListener("input", () => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      _pilgrimsState.search = input.value.trim();
      _pilgrimsState.page = 1;
      loadPilgrims();
    }, 350);
  });

  document.getElementById("pilgrimsPrevBtn").addEventListener("click", () => {
    if (_pilgrimsState.page > 1) {
      _pilgrimsState.page -= 1;
      loadPilgrims();
    }
  });
  document.getElementById("pilgrimsNextBtn").addEventListener("click", () => {
    _pilgrimsState.page += 1;
    loadPilgrims();
  });
}

function _wirePilgrimsFilters() {
  const filterMap = {
    pilgrimsFilterNationality: "nationality",
    pilgrimsFilterAgent: "agent_name",
    pilgrimsFilterStatus: "pilgrim_status",
    pilgrimsFilterInsideKingdom: "inside_kingdom",
  };

  Object.entries(filterMap).forEach(([elementId, stateKey]) => {
    document.getElementById(elementId).addEventListener("change", (e) => {
      _pilgrimsState[stateKey] = e.target.value;
      _pilgrimsState.page = 1;
      loadPilgrims();
    });
  });

  document.getElementById("pilgrimsResetFiltersBtn").addEventListener("click", () => {
    document.getElementById("pilgrimsSearchInput").value = "";
    Object.keys(filterMap).forEach((elementId) => (document.getElementById(elementId).value = ""));
    Object.assign(_pilgrimsState, {
      search: "",
      nationality: "",
      agent_name: "",
      pilgrim_status: "",
      inside_kingdom: "",
      page: 1,
    });
    loadPilgrims();
  });
}

function _downloadCsv(rows, columns, filename) {
  const bom = "﻿";
  const header = columns.map((c) => c.label).join(",");
  const escapeCell = (v) => `"${String(v ?? "").replace(/"/g, '""')}"`;
  const lines = rows.map((r) => columns.map((c) => escapeCell(r[c.key])).join(","));
  const csv = bom + [header, ...lines].join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

// الطباعة عبر printDocument (js/print.js) لأن html2canvas يُفسد تشكيل النص العربي RTL
function _printRowsAsPdf(rows, columns, title) {
  const printArea = document.getElementById("printArea");
  printArea.innerHTML = `
    ${printDocHeader(title, `عدد السجلات: ${rows.length.toLocaleString("en")}`)}
    <table class="pd-table pd-table-list">
      <thead>
        <tr><th class="pd-num">#</th>${columns.map((c) => `<th>${_escapeHtml(c.label)}</th>`).join("")}</tr>
      </thead>
      <tbody>
        ${rows
          .map(
            (r, i) =>
              `<tr><td class="pd-num">${i + 1}</td>${columns.map((c) => `<td>${_escapeHtml(r[c.key])}</td>`).join("")}</tr>`
          )
          .join("")}
      </tbody>
    </table>`;

  printDocument(printArea, title);
}

const _DUPLICATE_EXPORT_COLUMNS = [
  { key: "pilgrim_name", label: "الاسم" },
  { key: "passport_number", label: "رقم الجواز" },
  { key: "visa_issue_date", label: "تاريخ إصدار التأشيرة" },
];

const _EXCLUDED_EXPORT_COLUMNS = [
  { key: "pilgrim_name", label: "الاسم" },
  { key: "passport_number", label: "رقم الجواز" },
  { key: "pilgrim_status", label: "الحالة" },
];

function _renderExportSection(title, list, idPrefix, columns) {
  if (!list || !list.length) return "";
  return `
    <div class="mt-2 d-flex align-items-center gap-2">
      <span class="small text-muted">${_escapeHtml(title)} (${list.length}):</span>
      <button class="btn btn-sm btn-outline-success" id="${idPrefix}ExcelBtn" type="button">تنزيل Excel</button>
      <button class="btn btn-sm btn-outline-danger" id="${idPrefix}PdfBtn" type="button">تنزيل PDF</button>
    </div>`;
}

function _wireExportButtons(idPrefix, list, columns, title) {
  if (!list || !list.length) return;
  const today = new Date().toISOString().slice(0, 10);
  document.getElementById(`${idPrefix}ExcelBtn`).addEventListener("click", () => {
    _downloadCsv(list, columns, `${title}-${today}.csv`);
  });
  document.getElementById(`${idPrefix}PdfBtn`).addEventListener("click", () => {
    _printRowsAsPdf(list, columns, title);
  });
}

function _wireExcelUpload() {
  const dropzone = document.getElementById("excelDropzone");
  const fileInput = document.getElementById("excelFileInput");
  const resultBox = document.getElementById("excelImportResult");

  const handleFile = async (file) => {
    if (!file) return;
    resultBox.innerHTML = `<div class="alert alert-info mb-0">جارِ رفع ومعالجة الملف...</div>`;

    const formData = new FormData();
    formData.append("file", file);

    try {
      const result = await apiUpload("/api/pilgrims/import", formData);
      const errorsHtml = result.errors && result.errors.length
        ? `<div class="alert alert-warning mt-2 mb-0 small" style="white-space: pre-wrap;">${result.errors.map(_escapeHtml).join("\n")}</div>`
        : "";
      resultBox.innerHTML = `
        <div class="alert alert-success mb-0">
          تم استيراد <strong>${result.inserted_or_updated}</strong> سجل بنجاح من أصل ${result.total_rows} صف
          ${result.skipped_rows ? ` (تم تجاوز ${result.skipped_rows} صف - راجع التفاصيل أدناه)` : ""}
        </div>${errorsHtml}
        ${_renderExportSection("المعتمرون المكررون", result.duplicate_pilgrims, "dup", _DUPLICATE_EXPORT_COLUMNS)}
        ${_renderExportSection("المعتمرون المستبعدون", result.excluded_pilgrims, "excl", _EXCLUDED_EXPORT_COLUMNS)}`;
      _wireExportButtons("dup", result.duplicate_pilgrims, _DUPLICATE_EXPORT_COLUMNS, "المعتمرون-المكررون");
      _wireExportButtons("excl", result.excluded_pilgrims, _EXCLUDED_EXPORT_COLUMNS, "المعتمرون-المستبعدون");
      _pilgrimsState.page = 1;
      loadPilgrims();
    } catch (err) {
      resultBox.innerHTML = `<div class="alert alert-danger mb-0">فشل الاستيراد: ${_escapeHtml(err.message)}</div>`;
    }
  };

  dropzone.addEventListener("click", () => fileInput.click());
  fileInput.addEventListener("change", () => handleFile(fileInput.files[0]));

  ["dragenter", "dragover"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.add("dropzone-active");
    })
  );
  ["dragleave", "drop"].forEach((evt) =>
    dropzone.addEventListener(evt, (e) => {
      e.preventDefault();
      dropzone.classList.remove("dropzone-active");
    })
  );
  dropzone.addEventListener("drop", (e) => handleFile(e.dataTransfer.files[0]));
}

function initPilgrims() {
  _wirePilgrimsSearch();
  _wirePilgrimsFilters();
  if (hasPerm("pilgrims.import")) {
    _wireExcelUpload();
  } else {
    document.getElementById("excelDropzone").classList.add("d-none");
  }
  wireExportButton("pilgrimsExportBtn", "pilgrims.export", () => `/api/pilgrims/export?${_pilgrimsFilterParams()}`, "المعتمرون.csv");
  _loadFilterOptions();
  loadPilgrims();
}
