const _reportCharts = {};
let _reportData = null;

// ألوان دلالية ثابتة للإجابات المعروفة (إيجابي أخضر، محايد أصفر، سلبي أحمر) في الشاشة والتقرير المطبوع
const _ANSWER_COLORS = {
  "راضي جداً": "#157347",
  "راضي": "#52b788",
  "غير راضي": "#dc3545",
  "نعم": "#157347",
  "نوعاً ما": "#e0a800",
  "غير مطابق": "#dc3545",
  "ممتاز": "#157347",
  "جيد جداً": "#52b788",
  "سيئ": "#dc3545",
  "100%": "#157347",
  "75%": "#52b788",
  "50%": "#e0a800",
  "25%": "#dc3545",
  "جديدة": "#0d6efd",
  "قيد المعالجة": "#e0a800",
  "مغلقة": "#157347",
  "تم حلها": "#157347",
  "لم يتم الحل": "#dc3545",
  "أخرى": "#8a94a6",
};

// ترتيب منطقي للمقياس (من الأفضل للأسوأ) بدل الترتيب حسب العدد
const _ANSWER_ORDER = Object.keys(_ANSWER_COLORS);

const _FALLBACK_PALETTE = ["#0d6efd", "#20c997", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14", "#0dcaf0", "#6c757d"];

// اسم مستقل عن _chartColors(n) المشتركة في overview.js حتى لا تطغى إحداهما على الأخرى
function _answerColors(labels) {
  let fallbackIndex = 0;
  return labels.map((label) => _ANSWER_COLORS[label] || _FALLBACK_PALETTE[fallbackIndex++ % _FALLBACK_PALETTE.length]);
}

function _orderedEntries(distribution) {
  const entries = Object.entries(distribution || {});
  const rank = (label) => {
    const index = _ANSWER_ORDER.indexOf(label);
    return index === -1 ? _ANSWER_ORDER.length : index;
  };
  // المعروفة بترتيب المقياس، وغير المعروفة (كاللغات) حسب العدد تنازلياً
  return entries.sort((a, b) => rank(a[0]) - rank(b[0]) || b[1] - a[1]);
}

function _chartConfig(type, distribution, label, { forPrint = false } = {}) {
  const entries = _orderedEntries(distribution);
  const labels = entries.map(([key]) => key);
  const fontSize = forPrint ? 17 : 12;
  return {
    type,
    data: {
      labels,
      datasets: [
        {
          label,
          data: entries.map(([, value]) => value),
          backgroundColor: _answerColors(labels),
          borderColor: "#fff",
          borderWidth: type === "bar" ? 0 : 2,
          borderRadius: type === "bar" ? 6 : 0,
          maxBarThickness: 56,
        },
      ],
    },
    options: {
      responsive: !forPrint,
      maintainAspectRatio: false,
      animation: forPrint ? false : undefined,
      devicePixelRatio: forPrint ? 2 : undefined,
      plugins: {
        // في المطبوع يغني جدول التوزيع (بمربعات الألوان) عن وسيلة الإيضاح
        legend: {
          display: type !== "bar" && !forPrint,
          position: "bottom",
          rtl: true,
          labels: { font: { size: fontSize } },
        },
      },
      scales:
        type === "bar"
          ? {
              y: { beginAtZero: true, ticks: { precision: 0, font: { size: fontSize } } },
              x: { ticks: { font: { size: fontSize } } },
            }
          : undefined,
    },
  };
}

function _renderDistributionChart(canvasId, type, distribution, label) {
  const ctx = document.getElementById(canvasId).getContext("2d");
  if (_reportCharts[canvasId]) _reportCharts[canvasId].destroy();
  _reportCharts[canvasId] = new Chart(ctx, _chartConfig(type, distribution, label));
}

function _scoreTier(pct) {
  if (pct >= 80) return "score-good";
  if (pct >= 60) return "score-mid";
  return "score-low";
}

function _renderScoreCard(valueId, barId, pct) {
  const valueEl = document.getElementById(valueId);
  const barEl = document.getElementById(barId);
  if (pct === null || pct === undefined) {
    valueEl.textContent = "لا توجد بيانات";
    valueEl.classList.add("text-muted");
    if (barEl) barEl.style.width = "0%";
    return;
  }
  valueEl.classList.remove("text-muted");
  valueEl.textContent = `${pct}%`;
  if (barEl) {
    barEl.style.width = `${pct}%`;
    barEl.classList.remove("score-good", "score-mid", "score-low");
    barEl.classList.add(_scoreTier(pct));
  }
}

function _renderScores(scores) {
  document.getElementById("scoreOverall").textContent =
    scores.overall_avg !== null && scores.overall_avg !== undefined ? `${scores.overall_avg}%` : "لا توجد بيانات";
  document.getElementById("scoreResponsesCount").textContent = `بناءً على ${scores.total_responses.toLocaleString("ar")} تقييم مستلم`;

  _renderScoreCard("scoreFlight", "scoreFlightBar", scores.flight);
  _renderScoreCard("scoreTransport", "scoreTransportBar", scores.transport);
  _renderScoreCard("scoreHotels", "scoreHotelsBar", scores.hotels);
  _renderScoreCard("scoreAgents", "scoreAgentsBar", scores.agents);
  _renderScoreCard("scoreServicesMatch", "scoreServicesMatchBar", scores.services_match);
}

// تعريف واحد للرسوم يُستخدم في الشاشة وفي التقرير المطبوع
const _REPORT_CHARTS = [
  { canvasId: "chartFlight", key: "flight_satisfaction", type: "bar", title: "أداء خدمة الطيران" },
  { canvasId: "chartTransport", key: "transport_satisfaction", type: "bar", title: "أداء النقل والمواصلات" },
  { canvasId: "chartHotels", key: "hotels_satisfaction", type: "bar", title: "أداء فنادق مكة والمدينة" },
  { canvasId: "chartServicesMatch", key: "services_match", type: "pie", title: "مطابقة الخدمات للوصف" },
  { canvasId: "chartAgents", key: "agents_rating", type: "pie", title: "تقييم مناديب الشركة" },
  { canvasId: "chartOverall", key: "overall_satisfaction", type: "doughnut", title: "توزيع نسبة الرضا العام" },
  { canvasId: "chartLanguageUsage", key: "language_usage", type: "bar", title: "اللغات الأكثر استخداماً" },
  { canvasId: "chartComplaintsType", key: "complaints_by_content_type", type: "pie", title: "تصنيف وسائط البلاغات" },
  { canvasId: "chartComplaintsStatus", key: "complaints_by_status", type: "doughnut", title: "حالة البلاغات" },
];

// ==========================================================================
// فترة التقرير: كل الفترات / يوم / شهر (ميلادي) / موسم (رمضان أو موسم العمرة بالتقويم الهجري)
// ==========================================================================

const _HIJRI_FORMAT = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura-nu-latn", {
  year: "numeric",
  month: "numeric",
  day: "numeric",
});
const _HIJRI_EPOCH = new Date(622, 6, 19, 12); // 1 محرم 1 هـ تقريباً

// كل التواريخ هنا عند الظهر بالتوقيت المحلي لتفادي انزلاق اليوم عند التحويلات
function _dateAtNoon(year, monthIndex, day) {
  return new Date(year, monthIndex, day, 12);
}

function _addDays(date, days) {
  return _dateAtNoon(date.getFullYear(), date.getMonth(), date.getDate() + days);
}

function _isoDate(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function _formatDate(date) {
  return date.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long", day: "numeric" });
}

function _hijriParts(date) {
  const parts = Object.fromEntries(_HIJRI_FORMAT.formatToParts(date).map((p) => [p.type, p.value]));
  return { year: parseInt(parts.year, 10), month: Number(parts.month), day: Number(parts.day) };
}

// أول يوم ميلادي من شهر هجري (تقويم أم القرى): تقدير بمتوسط طول الشهر ثم بحث يومي حوله
function _hijriMonthStart(year, month) {
  const estimate = new Date(_HIJRI_EPOCH.getTime() + ((year - 1) * 354.367 + (month - 1) * 29.5306) * 864e5);
  for (let offset = -30; offset <= 30; offset++) {
    const candidate = _addDays(estimate, offset);
    const h = _hijriParts(candidate);
    if (h.year === year && h.month === month && h.day === 1) return candidate;
  }
  return null;
}

// مواسم آخر 3 سنوات هجرية التي بدأت فعلاً، الأحدث أولاً
// موسم العمرة: من 1 محرم إلى نهاية شوال. موسم رمضان: شهر رمضان كاملاً.
function _reportSeasons() {
  const today = new Date();
  const currentYear = _hijriParts(today).year;
  const seasons = [];
  for (let year = currentYear; year >= currentYear - 2; year--) {
    const ramadanStart = _hijriMonthStart(year, 9);
    const shawwalStart = _hijriMonthStart(year, 10);
    const umrahStart = _hijriMonthStart(year, 1);
    const dhulQadahStart = _hijriMonthStart(year, 11);
    if (ramadanStart && shawwalStart) {
      seasons.push({ id: `ramadan-${year}`, name: `موسم رمضان ${year} هـ`, from: ramadanStart, to: _addDays(shawwalStart, -1) });
    }
    if (umrahStart && dhulQadahStart) {
      seasons.push({ id: `umrah-${year}`, name: `موسم العمرة ${year} هـ`, from: umrahStart, to: _addDays(dhulQadahStart, -1) });
    }
  }
  return seasons
    .filter((s) => s.from <= today)
    .map((s) => ({ ...s, current: today <= s.to }))
    .sort((a, b) => b.from - a.from);
}

let _reportSeasonList = [];

function _selectedReportPeriod() {
  const type = document.getElementById("reportPeriodType").value;

  if (type === "day") {
    const value = document.getElementById("reportDayInput").value;
    if (!value) return null;
    const [y, m, d] = value.split("-").map(Number);
    const day = _dateAtNoon(y, m - 1, d);
    return { from: day, to: day, name: `يوم ${_formatDate(day)}` };
  }

  if (type === "month") {
    const value = document.getElementById("reportMonthInput").value;
    if (!value) return null;
    const [y, m] = value.split("-").map(Number);
    const from = _dateAtNoon(y, m - 1, 1);
    const monthName = from.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", { year: "numeric", month: "long" });
    return { from, to: _dateAtNoon(y, m, 0), name: `شهر ${monthName}` };
  }

  if (type === "season") {
    const season = _reportSeasonList.find((s) => s.id === document.getElementById("reportSeasonSelect").value);
    return season ? { from: season.from, to: season.to, name: season.name } : null;
  }

  return { from: null, to: null, name: "كل الفترات" };
}

function _periodRangeText(period) {
  if (!period.from) return "";
  if (_isoDate(period.from) === _isoDate(period.to)) return "";
  return `من ${_formatDate(period.from)} إلى ${_formatDate(period.to)}`;
}

function _renderPeriodLabel(period) {
  const range = _periodRangeText(period);
  document.getElementById("reportPeriodLabel").innerHTML =
    `الفترة المعروضة: <b>${_printEscape(period.name)}</b>${range ? ` (${_printEscape(range)})` : ""}`;
}

function _onPeriodTypeChange() {
  const type = document.getElementById("reportPeriodType").value;
  const today = new Date();
  const show = (id, visible) => document.getElementById(id).classList.toggle("d-none", !visible);
  show("reportDayWrap", type === "day");
  show("reportMonthWrap", type === "month");
  show("reportSeasonWrap", type === "season");

  // قيمة افتراضية معقولة حتى يظهر تقرير فوراً عند تبديل النوع
  const dayInput = document.getElementById("reportDayInput");
  const monthInput = document.getElementById("reportMonthInput");
  if (type === "day" && !dayInput.value) dayInput.value = _isoDate(today);
  if (type === "month" && !monthInput.value) monthInput.value = _isoDate(today).slice(0, 7);

  loadReports();
}

function _initPeriodFilter() {
  _reportSeasonList = _reportSeasons();
  document.getElementById("reportSeasonSelect").innerHTML = _reportSeasonList
    .map((s) => `<option value="${s.id}">${_printEscape(s.name)}${s.current ? " — الموسم الحالي" : ""}</option>`)
    .join("");

  const today = _isoDate(new Date());
  document.getElementById("reportDayInput").max = today;
  document.getElementById("reportMonthInput").max = today.slice(0, 7);

  document.getElementById("reportPeriodType").addEventListener("change", _onPeriodTypeChange);
  ["reportDayInput", "reportMonthInput", "reportSeasonSelect"].forEach((id) =>
    document.getElementById(id).addEventListener("change", () => loadReports())
  );
}

let _reportPeriod = null;
let _reportRequestId = 0;

async function loadReports() {
  const period = _selectedReportPeriod();
  if (!period) return;
  _renderPeriodLabel(period);

  const query = new URLSearchParams();
  if (period.from) query.set("date_from", _isoDate(period.from));
  if (period.to) query.set("date_to", _isoDate(period.to));

  // تجاهل الردود المتأخرة إذا غيّر المستخدم الفترة قبل وصولها
  const requestId = ++_reportRequestId;
  try {
    const data = await apiGet(`/api/reports${query.toString() ? `?${query}` : ""}`);
    if (requestId !== _reportRequestId) return;
    document.getElementById("reportsError")?.classList.add("d-none");
    _reportData = data;
    _reportPeriod = period;

    _renderScores(data.scores);
    _REPORT_CHARTS.forEach((c) => _renderDistributionChart(c.canvasId, c.type, data[c.key], c.title));
  } catch (err) {
    console.error("loadReports failed", err);
    const box = document.getElementById("reportsError");
    if (box) {
      box.textContent = `تعذّر تحميل التقارير: ${err.message}`;
      box.classList.remove("d-none");
    }
  }
}

// ==========================================================================
// التقرير التنفيذي المطبوع (PDF)
// ==========================================================================

const _SERVICE_SCORES = [
  { key: "flight", label: "خدمة الطيران" },
  { key: "transport", label: "النقل والمواصلات" },
  { key: "hotels", label: "الفنادق" },
  { key: "agents", label: "مناديب الشركة" },
  { key: "services_match", label: "مطابقة الخدمات للوصف" },
];

function _printTier(pct) {
  if (pct >= 80) return { cls: "pd-good", label: "ممتاز" };
  if (pct >= 60) return { cls: "pd-mid", label: "جيد" };
  return { cls: "pd-low", label: "يحتاج تحسين" };
}

// يرسم الرسم على لوحة مؤقتة بحجم ثابت ودقة مضاعفة ويعيده صورة، بغض النظر عن حجم الشاشة
function _chartImage(type, distribution, label) {
  const holder = document.createElement("div");
  holder.style.cssText = "position:fixed;left:-10000px;top:0;width:560px;height:185px;";
  const canvas = document.createElement("canvas");
  canvas.width = 560;
  canvas.height = 185;
  holder.appendChild(canvas);
  document.body.appendChild(holder);
  const chart = new Chart(canvas, _chartConfig(type, distribution, label, { forPrint: true }));
  const url = chart.toBase64Image("image/png", 1);
  chart.destroy();
  holder.remove();
  return url;
}

function _distributionTable(distribution) {
  const entries = _orderedEntries(distribution);
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  const colors = _answerColors(entries.map(([key]) => key));
  const rows = entries
    .map(([key, value], i) => {
      const pct = total ? ((value / total) * 100).toFixed(1) : "0.0";
      return `
        <tr>
          <td><span class="pd-swatch" style="background:${colors[i]}"></span>${_printEscape(key)}</td>
          <td class="pd-num">${value.toLocaleString("en")}</td>
          <td class="pd-num">${pct}%</td>
          <td class="pd-bar-cell"><div class="pd-bar"><span style="width:${pct}%;background:${colors[i]}"></span></div></td>
        </tr>`;
    })
    .join("");
  return `
    <table class="pd-table">
      <thead><tr><th>الإجابة</th><th class="pd-num">العدد</th><th class="pd-num">النسبة</th><th></th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot><tr><td>الإجمالي</td><td class="pd-num">${total.toLocaleString("en")}</td><td class="pd-num">100%</td><td></td></tr></tfoot>
    </table>`;
}

function _reportCard(chart, data) {
  const distribution = data[chart.key];
  const hasData = distribution && Object.keys(distribution).length;
  const body = hasData
    ? `<img src="${_chartImage(chart.type, distribution, chart.title)}" alt="" />${_distributionTable(distribution)}`
    : `<p class="pd-empty">لا توجد بيانات مسجلة بعد.</p>`;
  return `<section class="pd-card"><h3>${_printEscape(chart.title)}</h3>${body}</section>`;
}

function _keyFindings(data) {
  const scores = data.scores;
  const findings = [];
  const rated = _SERVICE_SCORES.filter((s) => scores[s.key] !== null && scores[s.key] !== undefined).map((s) => ({
    ...s,
    value: scores[s.key],
  }));

  if (rated.length) {
    const best = rated.reduce((a, b) => (b.value > a.value ? b : a));
    const worst = rated.reduce((a, b) => (b.value < a.value ? b : a));
    findings.push({ cls: "pd-good", text: `أعلى الخدمات رضاً: <b>${best.label}</b> بنسبة <b>${best.value}%</b>.` });
    if (worst.key !== best.key) {
      findings.push({ cls: _printTier(worst.value).cls, text: `أقل الخدمات رضاً: <b>${worst.label}</b> بنسبة <b>${worst.value}%</b>.` });
    }
    const weak = rated.filter((s) => s.value < 60);
    findings.push(
      weak.length
        ? { cls: "pd-low", text: `خدمات تحتاج إلى خطة تحسين (أقل من 60%): <b>${weak.map((s) => s.label).join("، ")}</b>.` }
        : { cls: "pd-good", text: "جميع الخدمات المقيَّمة تجاوزت حد 60% من الرضا." }
    );
  }

  const statuses = data.complaints_by_status || {};
  const totalComplaints = Object.values(statuses).reduce((sum, v) => sum + v, 0);
  if (totalComplaints) {
    const openComplaints = totalComplaints - (statuses["مغلقة"] || 0);
    findings.push({
      cls: openComplaints ? "pd-mid" : "pd-good",
      text: `إجمالي البلاغات <b>${totalComplaints}</b>، منها <b>${openComplaints}</b> بلاغاً مفتوحاً لم يُغلق بعد.`,
    });
  } else {
    findings.push({ cls: "pd-good", text: "لا توجد بلاغات مسجلة." });
  }

  const topLanguage = _orderedEntries(data.language_usage)[0];
  if (topLanguage) {
    findings.push({ cls: "pd-info", text: `اللغة الأكثر استخداماً في المحادثات: <b>${_printEscape(topLanguage[0])}</b> (${topLanguage[1]} تقييماً).` });
  }

  return findings;
}

function _buildReportDocument(data, period) {
  const scores = data.scores;
  const total = scores.total_responses || 0;
  const overall = scores.overall_avg;

  const kpis = _SERVICE_SCORES.map((s) => {
    const value = scores[s.key];
    if (value === null || value === undefined) {
      return `<div class="pd-kpi"><div class="pd-kpi-label">${s.label}</div><div class="pd-kpi-value pd-muted">—</div><div class="pd-tag">لا توجد بيانات</div></div>`;
    }
    const tier = _printTier(value);
    return `
      <div class="pd-kpi">
        <div class="pd-kpi-label">${s.label}</div>
        <div class="pd-kpi-value ${tier.cls}">${value}%</div>
        <div class="pd-bar"><span class="${tier.cls}" style="width:${value}%"></span></div>
        <div class="pd-tag ${tier.cls}">${tier.label}</div>
      </div>`;
  }).join("");

  const overallTier = overall !== null && overall !== undefined ? _printTier(overall) : null;
  const findings = _keyFindings(data)
    .map((f) => `<li class="${f.cls}">${f.text}</li>`)
    .join("");

  const evaluationCards = _REPORT_CHARTS.slice(0, 6).map((c) => _reportCard(c, data)).join("");
  const otherCards = _REPORT_CHARTS.slice(6).map((c) => _reportCard(c, data)).join("");

  const range = _periodRangeText(period);
  const subtitle = period.from
    ? `فترة التقرير: ${period.name}${range ? ` (${range})` : ""} — ملخص تقييمات الرحلات والبلاغات الواردة عبر واتساب خلال هذه الفترة.`
    : "فترة التقرير: كل الفترات — ملخص تقييمات الرحلات والبلاغات الواردة عبر واتساب حتى تاريخ الإصدار.";

  return `
    ${printDocHeader("التقرير التنفيذي لقياس رضا المعتمرين", subtitle)}

    <section class="pd-section">
      <h2 class="pd-section-title">الملخص التنفيذي</h2>
      <div class="pd-hero">
        <div>
          <div class="pd-hero-label">نسبة الرضا العام</div>
          <div class="pd-hero-value">${overallTier ? `${overall}%` : "—"}</div>
        </div>
        <div class="pd-hero-side">
          <div>عدد التقييمات المستلمة: <b>${total.toLocaleString("en")}</b></div>
          ${overallTier ? `<div>التصنيف العام: <b>${overallTier.label}</b></div>` : ""}
        </div>
      </div>
      <div class="pd-kpis">${kpis}</div>
      <p class="pd-note">نسبة رضا كل خدمة = نسبة من اختاروا إجابة إيجابية («راضي جداً / راضي»، «نعم»، «ممتاز / جيد جداً») من إجمالي من أجابوا على السؤال. التصنيف: ممتاز ≥ 80%، جيد ≥ 60%، أقل من ذلك يحتاج تحسين.</p>
    </section>

    <section class="pd-section">
      <h2 class="pd-section-title">أبرز النتائج</h2>
      <ul class="pd-findings">${findings}</ul>
    </section>

    <section class="pd-section pd-page-break">
      <h2 class="pd-section-title">تفاصيل تقييم الخدمات</h2>
      <div class="pd-grid">${evaluationCards}</div>
    </section>

    <section class="pd-section">
      <h2 class="pd-section-title">اللغات والبلاغات</h2>
      <div class="pd-grid">${otherCards}</div>
    </section>`;
}

async function exportReportPdf() {
  const button = document.getElementById("exportPdfBtn");
  button.disabled = true;
  try {
    if (!_reportData) await loadReports();
    if (!_reportData) {
      alert("تعذّر تحميل بيانات التقرير، حاول مرة أخرى.");
      return;
    }
    const doc = document.getElementById("reportPrintDoc");
    doc.innerHTML = _buildReportDocument(_reportData, _reportPeriod);
    const fileTitle = _reportPeriod.from ? `التقرير-التنفيذي-${_reportPeriod.name}` : "التقرير-التنفيذي";
    await printDocument(doc, fileTitle.replace(/\s+/g, "-"));
  } finally {
    button.disabled = false;
  }
}

function initReports() {
  _initPeriodFilter();
  loadReports();
  const exportButton = document.getElementById("exportPdfBtn");
  if (hasPerm("reports.export")) exportButton.addEventListener("click", exportReportPdf);
  else exportButton.classList.add("d-none");
}
