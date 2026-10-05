// تصدير PDF عبر طباعة المتصفح الأصلية (بدل html2canvas الذي لا يعالج تشكيل النص العربي RTL).
// كل مستند طباعة عنصر مستقل بالصنف .print-doc مباشرة تحت <body>، وأثناء الطباعة يُخفى كل ما سواه
// (display:none وليس visibility:hidden حتى لا تبقى مساحات فارغة وصفحات بيضاء في الملف الناتج).

function _printEscape(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function _printDates() {
  const now = new Date();
  const dateOptions = { year: "numeric", month: "long", day: "numeric" };
  return {
    gregorian: now.toLocaleDateString("ar-SA-u-ca-gregory-nu-latn", dateOptions),
    hijri: now.toLocaleDateString("ar-SA-u-ca-islamic-umalqura-nu-latn", dateOptions),
    time: now.toLocaleTimeString("ar-SA-u-nu-latn", { hour: "2-digit", minute: "2-digit" }),
    isoDate: now.toISOString().slice(0, 10),
  };
}

// ترويسة موحدة لكل مستندات الطباعة: الشعار + اسم النظام + تاريخ الإصدار (ميلادي وهجري) + العنوان
function printDocHeader(title, subtitle) {
  const dates = _printDates();
  return `
    <header class="pd-header">
      <div class="pd-brand">
        <img src="assets/logo.png" alt="" />
        <div>
          <div class="pd-brand-name">صوت المعتمر</div>
          <div class="pd-brand-sub">نظام قياس رضا المعتمرين وإدارة البلاغات</div>
        </div>
      </div>
      <div class="pd-meta">
        <div>تاريخ الإصدار: ${_printEscape(dates.gregorian)}</div>
        <div>الموافق: ${_printEscape(dates.hijri)}</div>
        <div>الوقت: ${_printEscape(dates.time)}</div>
      </div>
    </header>
    <h1 class="pd-title">${_printEscape(title)}</h1>
    ${subtitle ? `<p class="pd-subtitle">${_printEscape(subtitle)}</p>` : ""}`;
}

async function printDocument(docEl, fileTitle) {
  // ننتظر فك ترميز الصور (الشعار وصور الرسوم) حتى لا تُطبع فارغة
  await Promise.all([...docEl.querySelectorAll("img")].map((img) => img.decode().catch(() => {})));

  const originalTitle = document.title;
  const cleanup = () => {
    document.body.classList.remove("is-printing");
    docEl.classList.remove("print-doc-active");
    document.title = originalTitle;
  };

  // عنوان الصفحة يصبح اسم ملف الـ PDF المقترح عند الحفظ
  document.title = `${fileTitle}-${_printDates().isoDate}`;
  document.body.classList.add("is-printing");
  docEl.classList.add("print-doc-active");
  window.addEventListener("afterprint", cleanup, { once: true });
  window.print();
}
