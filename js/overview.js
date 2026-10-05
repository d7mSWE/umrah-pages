let _overviewSatChart = null;
let _overviewLangChart = null;

function _chartColors(n) {
  const palette = ["#0d6efd", "#20c997", "#ffc107", "#dc3545", "#6f42c1", "#fd7e14", "#0dcaf0", "#6c757d"];
  return Array.from({ length: n }, (_, i) => palette[i % palette.length]);
}

async function initOverview() {
  try {
    const data = await apiGet("/api/overview");

    document.getElementById("kpiTotalPilgrims").textContent = data.total_pilgrims.toLocaleString("ar");
    document.getElementById("kpiInsideKingdom").textContent = data.pilgrims_inside_kingdom.toLocaleString("ar");
    document.getElementById("kpiAvgSatisfaction").textContent = `${data.average_satisfaction_pct.toFixed(1)}%`;
    document.getElementById("kpiTotalComplaints").textContent = data.total_complaints.toLocaleString("ar");
    document.getElementById("kpiOpenComplaints").textContent = data.open_complaints.toLocaleString("ar");

    const satLabels = Object.keys(data.satisfaction_distribution);
    const satValues = Object.values(data.satisfaction_distribution);
    const satCtx = document.getElementById("chartSatisfactionDist").getContext("2d");
    if (_overviewSatChart) _overviewSatChart.destroy();
    _overviewSatChart = new Chart(satCtx, {
      type: "doughnut",
      data: { labels: satLabels, datasets: [{ data: satValues, backgroundColor: _chartColors(satLabels.length) }] },
      options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: "bottom", rtl: true } } },
    });

    const langLabels = Object.keys(data.language_distribution);
    const langValues = Object.values(data.language_distribution);
    const langCtx = document.getElementById("chartLanguageDist").getContext("2d");
    if (_overviewLangChart) _overviewLangChart.destroy();
    _overviewLangChart = new Chart(langCtx, {
      type: "bar",
      data: { labels: langLabels, datasets: [{ label: "عدد التقييمات", data: langValues, backgroundColor: "#0d6efd" }] },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: { y: { beginAtZero: true } },
      },
    });
  } catch (err) {
    console.error("initOverview failed", err);
    const box = document.getElementById("overviewError");
    if (box) {
      box.textContent = `تعذّر تحميل النظرة العامة: ${err.message}`;
      box.classList.remove("d-none");
    }
  }
}
