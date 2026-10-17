// ==========================================================================
// Seattle Weather Forecast Verifier & Calibration - Interactive Logic
// ==========================================================================

const forecastState = {
  scatterMode: 'anomaly',   // 'anomaly' (Recommended) or 'absolute'
  activeMetric: 'high',     // 'high' or 'low'
  leadDay: 0,               // 0 to 10
  showTrendlines: false,    // show OLS calibration trendlines
  benchmarkMode: 'all',     // 'all' or 'common'
  degradationMetric: 'mae', // 'mae', 'rmse', 'msss'
  activeProviders: {
    nws: true,
    weather_com: true,
    weather_tool: true,
    accuweather: true
  },
  data: null,
  charts: {
    scatter: null,
    degradation: null,
    bias: null
  }
};

// Provider Metadata
const PROVIDER_CONFIG = {
  nws: {
    label: 'NWS',
    fullName: 'National Weather Service',
    color: '#10b981',
    bgColor: 'rgba(16, 185, 129, 0.45)',
    borderColor: '#10b981'
  },
  weather_com: {
    label: 'Weather.com',
    fullName: 'The Weather Channel',
    color: '#8b5cf6',
    bgColor: 'rgba(139, 92, 246, 0.45)',
    borderColor: '#8b5cf6'
  },
  weather_tool: {
    label: 'Weather Tool',
    fullName: 'Automated Weather Tool',
    color: '#06b6d4',
    bgColor: 'rgba(6, 182, 212, 0.45)',
    borderColor: '#06b6d4'
  },
  accuweather: {
    label: 'AccuWeather',
    fullName: 'AccuWeather Inc.',
    color: '#f59e0b',
    bgColor: 'rgba(245, 158, 11, 0.45)',
    borderColor: '#f59e0b'
  }
};

// Unit conversion helpers
function getAppUnit() {
  if (typeof appState !== 'undefined' && appState.unit) {
    return appState.unit;
  }
  const ind = document.getElementById('unit-indicator');
  if (ind && ind.textContent.includes('°C')) return 'C';
  return 'F';
}

function convertTemp(valF, unit = getAppUnit()) {
  if (valF === null || valF === undefined) return null;
  if (unit === 'C') {
    return (valF - 32) * (5 / 9);
  }
  return valF;
}

// Convert temperature difference or anomaly (delta T)
function convertTempDiff(diffF, unit = getAppUnit()) {
  if (diffF === null || diffF === undefined) return null;
  if (unit === 'C') {
    return diffF * (5 / 9);
  }
  return diffF;
}

function formatTempDisplay(valF, unit = getAppUnit(), decimals = 1) {
  if (valF === null || valF === undefined) return 'N/A';
  const c = convertTemp(valF, unit);
  return `${c.toFixed(decimals)}°${unit}`;
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', () => {
  setupTabNavigation();
  loadForecastData();
  setupForecastEventListeners();
});

// Tab Navigation logic
function setupTabNavigation() {
  const btnObs = document.getElementById('tab-btn-observational');
  const btnFmt = document.getElementById('tab-btn-forecast');
  const viewObs = document.getElementById('view-observational');
  const viewFmt = document.getElementById('view-forecast');

  if (!btnObs || !btnFmt || !viewObs || !viewFmt) return;

  function switchTab(targetTab) {
    if (targetTab === 'forecast') {
      btnObs.classList.remove('active');
      btnFmt.classList.add('active');
      viewObs.classList.add('hidden');
      viewFmt.classList.remove('hidden');

      // Resize forecast charts to ensure proper canvas dimensions
      setTimeout(() => {
        Object.values(forecastState.charts).forEach(ch => {
          if (ch) ch.resize();
        });
      }, 50);
    } else {
      btnFmt.classList.remove('active');
      btnObs.classList.add('active');
      viewFmt.classList.add('hidden');
      viewObs.classList.remove('hidden');

      // Trigger observational charts resize
      setTimeout(() => {
        if (typeof charts !== 'undefined') {
          Object.values(charts).forEach(ch => {
            if (ch) ch.resize();
          });
        }
      }, 50);
    }
  }

  btnObs.addEventListener('click', () => switchTab('observational'));
  btnFmt.addEventListener('click', () => switchTab('forecast'));
}

// Load verification data
async function loadForecastData() {
  const ts = Date.now();
  const paths = [
    `forecast_verifier_data.json?v=${ts}`,
    `public/forecast_verifier_data.json?v=${ts}`,
    `./forecast_verifier_data.json?v=${ts}`
  ];

  for (const path of paths) {
    try {
      const resp = await fetch(path);
      if (resp.ok) {
        forecastState.data = await resp.json();
        console.log(`Loaded forecast verification data from HTTP: ${path}`);
        renderAllForecastViews();
        return;
      }
    } catch (e) {
      console.warn(`Fetch failed for ${path}:`, e);
    }
  }

  // Fallback to window.SEATTLE_FORECAST_VERIFIER_DATA
  if (window.SEATTLE_FORECAST_VERIFIER_DATA) {
    console.log('Loaded forecast data via window.SEATTLE_FORECAST_VERIFIER_DATA fallback');
    forecastState.data = window.SEATTLE_FORECAST_VERIFIER_DATA;
    renderAllForecastViews();
    return;
  }

  console.error('Failed to load forecast verification dataset.');
}

// Setup Event Listeners
function setupForecastEventListeners() {
  // Scatter Mode toggle (Anomaly vs Absolute)
  const btnModeAnom = document.getElementById('scatter-mode-btn-anomaly');
  const btnModeAbs = document.getElementById('scatter-mode-btn-absolute');
  if (btnModeAnom && btnModeAbs) {
    btnModeAnom.addEventListener('click', () => {
      forecastState.scatterMode = 'anomaly';
      btnModeAnom.classList.add('active');
      btnModeAbs.classList.remove('active');
      updateScatterChart();
      updateScatterLiveStats();
    });
    btnModeAbs.addEventListener('click', () => {
      forecastState.scatterMode = 'absolute';
      btnModeAbs.classList.add('active');
      btnModeAnom.classList.remove('active');
      updateScatterChart();
      updateScatterLiveStats();
    });
  }

  // Metric toggle (High vs Low)
  const btnHigh = document.getElementById('metric-btn-high');
  const btnLow = document.getElementById('metric-btn-low');

  if (btnHigh && btnLow) {
    btnHigh.addEventListener('click', () => {
      forecastState.activeMetric = 'high';
      btnHigh.classList.add('active');
      btnLow.classList.remove('active');
      updateAllForecastCharts();
    });
    btnLow.addEventListener('click', () => {
      forecastState.activeMetric = 'low';
      btnLow.classList.add('active');
      btnHigh.classList.remove('active');
      updateAllForecastCharts();
    });
  }

  // Lead Days Slider
  const slider = document.getElementById('lead-days-slider');
  const badge = document.getElementById('lead-days-badge');
  if (slider && badge) {
    slider.addEventListener('input', (e) => {
      const val = parseInt(e.target.value, 10);
      forecastState.leadDay = val;
      badge.textContent = `${val} Day${val === 1 ? '' : 's'} Out`;
      updateScatterChart();
      updateScatterLiveStats();
      updateBiasDistributionChart();
      updateScorecardHighlight();
    });
  }

  // Provider chips
  document.querySelectorAll('.provider-chip').forEach(chip => {
    chip.addEventListener('click', () => {
      const prov = chip.dataset.provider;
      const willBeActive = !chip.classList.contains('active');
      chip.classList.toggle('active', willBeActive);
      forecastState.activeProviders[prov] = willBeActive;
      updateScatterChart();
      updateScatterLiveStats();
      updateLeadDegradationChart();
    });
  });

  // Trendline toggle
  const trendlineToggle = document.getElementById('toggle-trendlines');
  if (trendlineToggle) {
    trendlineToggle.addEventListener('change', (e) => {
      forecastState.showTrendlines = e.target.checked;
      updateScatterChart();
    });
  }

  // Benchmark cohort filter (All vs Common)
  const btnCohortAll = document.getElementById('cohort-btn-all');
  const btnCohortCommon = document.getElementById('cohort-btn-common');
  if (btnCohortAll && btnCohortCommon) {
    btnCohortAll.addEventListener('click', () => {
      forecastState.benchmarkMode = 'all';
      btnCohortAll.classList.add('active');
      btnCohortCommon.classList.remove('active');
      updateAllForecastCharts();
    });
    btnCohortCommon.addEventListener('click', () => {
      forecastState.benchmarkMode = 'common';
      btnCohortCommon.classList.add('active');
      btnCohortAll.classList.remove('active');
      updateAllForecastCharts();
    });
  }

  // Degradation metric pills
  document.querySelectorAll('.deg-metric-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.deg-metric-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      forecastState.degradationMetric = btn.dataset.metric;
      updateLeadDegradationChart();
    });
  });

  // Global unit toggle listener
  const unitBtn = document.getElementById('unit-toggle-btn');
  if (unitBtn) {
    unitBtn.addEventListener('click', () => {
      setTimeout(() => {
        updateAllForecastCharts();
      }, 50);
    });
  }
}

// Master Render Function
function renderAllForecastViews() {
  if (!forecastState.data) return;
  updateForecastSummaryCards();
  renderScatterChart();
  updateScatterLiveStats();
  renderLeadDegradationChart();
  renderBiasDistributionChart();
  renderForecastScorecardTable();
}

function updateAllForecastCharts() {
  updateScatterChart();
  updateScatterLiveStats();
  updateLeadDegradationChart();
  updateBiasDistributionChart();
  renderForecastScorecardTable();
}

// 1. Summary Cards
function updateForecastSummaryCards() {
  const sh = forecastState.data.summary_highlights;
  if (!sh) return;

  const cardLow = document.getElementById('card-best-low');
  if (cardLow) {
    cardLow.innerHTML = `
      <div class="metric-icon">🌙</div>
      <div class="metric-data">
        <span class="metric-label">Best Overnight Low (Day 0)</span>
        <span class="metric-value" style="color: #10b981">${sh.best_low_day0.name}</span>
        <span class="metric-sub">MAE: ${sh.best_low_day0.mae}°F | r = ${sh.best_low_day0.r} (Puget Marine Inversion)</span>
      </div>
    `;
  }

  const cardHigh = document.getElementById('card-best-high');
  if (cardHigh) {
    cardHigh.innerHTML = `
      <div class="metric-icon">☀️</div>
      <div class="metric-data">
        <span class="metric-label">Best Daytime High (Day 0–1)</span>
        <span class="metric-value" style="color: #06b6d4">${sh.best_high_day0.name}</span>
        <span class="metric-sub">MAE: ${sh.best_high_day0.mae}°F | r = ${sh.best_high_day0.r} (Top Peak Tracking)</span>
      </div>
    `;
  }

  const cardHorizon = document.getElementById('card-horizon');
  if (cardHorizon) {
    cardHorizon.innerHTML = `
      <div class="metric-icon">⏱️</div>
      <div class="metric-data">
        <span class="metric-label">Predictability Horizon</span>
        <span class="metric-value" style="color: #f59e0b">${sh.predictability_horizon_days} Days Out</span>
        <span class="metric-sub">Day 6+ MSSS &lt; 0 (Climatology wins over apps)</span>
      </div>
    `;
  }

  const cardBias = document.getElementById('card-systemic-bias');
  if (cardBias) {
    cardBias.innerHTML = `
      <div class="metric-icon">⚖️</div>
      <div class="metric-data">
        <span class="metric-label">Systematic Seattle Bias</span>
        <span class="metric-value" style="color: #ff7043">+1.8°F High / -1.1°F Low</span>
        <span class="metric-sub">Highs too warm, night lows too cold across models</span>
      </div>
    `;
  }
}

// 2. Forecast Scatterplot (The Core User Request - Anomaly vs. Actual)
function renderScatterChart() {
  const canvas = document.getElementById('forecast-scatter-chart');
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (forecastState.charts.scatter) {
    forecastState.charts.scatter.destroy();
  }

  const { datasets, minVal, maxVal, isAnomalyMode } = buildScatterDatasets();
  const unit = getAppUnit();
  const metricLabel = forecastState.activeMetric === 'high' ? 'High' : 'Low';
  const axisSuffix = isAnomalyMode ? `Anomaly vs. Normal (°${unit})` : `Temperature (°${unit})`;

  forecastState.charts.scatter = new Chart(ctx, {
    type: 'scatter',
    data: { datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 350 },
      plugins: {
        legend: {
          display: true,
          position: 'top',
          labels: {
            color: '#cbd5e1',
            font: { family: 'Inter', size: 12 },
            filter: (item) => !item.text.includes('Identity') && !item.text.includes('Tolerance') && !item.text.includes('Climatology') && !item.text.includes('Fit')
          }
        },
        tooltip: {
          backgroundColor: '#182030',
          titleColor: '#f0f4f8',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          padding: 12,
          boxPadding: 4,
          callbacks: {
            label: (context) => {
              const pt = context.raw;
              if (!pt || !pt.pointMeta) {
                return context.dataset.label;
              }
              const meta = pt.pointMeta;
              const provName = PROVIDER_CONFIG[meta.source]?.label || meta.source;
              const f = convertTemp(meta.f, unit);
              const a = convertTemp(meta.a, unit);
              const c = meta.c !== null ? convertTemp(meta.c, unit) : null;
              const err = f - a;
              const errSign = err >= 0 ? '+' : '';
              const climStr = c !== null ? `${c.toFixed(1)}°${unit}` : 'N/A';

              if (isAnomalyMode) {
                const signX = pt.x >= 0 ? '+' : '';
                const signY = pt.y >= 0 ? '+' : '';
                let quadrantInsight = '';
                if (pt.x >= 0 && pt.y >= 0) quadrantInsight = 'Quadrant I: Both Above Normal ✅';
                else if (pt.x < 0 && pt.y < 0) quadrantInsight = 'Quadrant III: Both Below Normal ✅';
                else if (pt.x >= 0 && pt.y < 0) quadrantInsight = 'Quadrant IV: Predicted Warm, Actually Cool ⚠️';
                else quadrantInsight = 'Quadrant II: Predicted Cool, Actually Warm ⚠️';

                return [
                  `${provName} (${meta.lead_days}d lead) — ${meta.target_date}:`,
                  `  Pred Anomaly:   ${signX}${pt.x.toFixed(1)}°${unit} (Temp: ${f.toFixed(1)}°${unit})`,
                  `  Actual Anomaly: ${signY}${pt.y.toFixed(1)}°${unit} (Temp: ${a.toFixed(1)}°${unit})`,
                  `  Forecast Error: ${errSign}${err.toFixed(1)}°${unit} (${err >= 0 ? 'Overestimated' : 'Underestimated'})`,
                  `  Clim Normal:    ${climStr}`,
                  `  Direction Skill: ${quadrantInsight}`
                ];
              }

              return [
                `${provName} (${meta.lead_days}d lead):`,
                `  Target Date: ${meta.target_date}`,
                `  Forecast:    ${f.toFixed(1)}°${unit}`,
                `  Actual:      ${a.toFixed(1)}°${unit}`,
                `  Error:       ${errSign}${err.toFixed(1)}°${unit} (${err >= 0 ? 'Overestimated' : 'Underestimated'})`,
                `  Clim Normal: ${climStr}`
              ];
            }
          }
        }
      },
      scales: {
        x: {
          type: 'linear',
          position: 'bottom',
          min: minVal,
          max: maxVal,
          title: {
            display: true,
            text: `Predicted ${metricLabel} ${axisSuffix}`,
            color: '#94a3b8',
            font: { family: 'Outfit', size: 13, weight: 600 }
          },
          grid: { 
            color: (c) => (isAnomalyMode && c.tick.value === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.07)'),
            lineWidth: (c) => (isAnomalyMode && c.tick.value === 0 ? 1.5 : 1)
          },
          ticks: { 
            color: (c) => (isAnomalyMode && c.tick.value === 0 ? '#ffca28' : '#64748b'),
            callback: (v) => isAnomalyMode ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}°` : `${v.toFixed(0)}°`
          }
        },
        y: {
          type: 'linear',
          position: 'left',
          min: minVal,
          max: maxVal,
          title: {
            display: true,
            text: `Actual Recorded ${metricLabel} ${axisSuffix}`,
            color: '#94a3b8',
            font: { family: 'Outfit', size: 13, weight: 600 }
          },
          grid: { 
            color: (c) => (isAnomalyMode && c.tick.value === 0 ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.07)'),
            lineWidth: (c) => (isAnomalyMode && c.tick.value === 0 ? 1.5 : 1)
          },
          ticks: { 
            color: (c) => (isAnomalyMode && c.tick.value === 0 ? '#ffca28' : '#64748b'),
            callback: (v) => isAnomalyMode ? `${v >= 0 ? '+' : ''}${v.toFixed(0)}°` : `${v.toFixed(0)}°`
          }
        }
      }
    }
  });
}

function updateScatterChart() {
  if (!forecastState.charts.scatter) {
    renderScatterChart();
    return;
  }
  const { datasets, minVal, maxVal, isAnomalyMode } = buildScatterDatasets();
  const unit = getAppUnit();
  const metricLabel = forecastState.activeMetric === 'high' ? 'High' : 'Low';
  const axisSuffix = isAnomalyMode ? `Anomaly vs. Normal (°${unit})` : `Temperature (°${unit})`;

  const chart = forecastState.charts.scatter;
  chart.data.datasets = datasets;
  chart.options.scales.x.min = minVal;
  chart.options.scales.x.max = maxVal;
  chart.options.scales.x.title.text = `Predicted ${metricLabel} ${axisSuffix}`;
  chart.options.scales.y.min = minVal;
  chart.options.scales.y.max = maxVal;
  chart.options.scales.y.title.text = `Actual Recorded ${metricLabel} ${axisSuffix}`;
  chart.update();
}

function buildScatterDatasets() {
  const points = forecastState.data.points;
  const isHigh = forecastState.activeMetric === 'high';
  const leadDay = forecastState.leadDay;
  const isCommonOnly = forecastState.benchmarkMode === 'common';
  const isAnomalyMode = forecastState.scatterMode === 'anomaly';
  const unit = getAppUnit();

  // Filter relevant points
  const filtered = points.filter(p => {
    if (p.lead_days !== leadDay) return false;
    if (isCommonOnly && !p.is_common) return false;
    if (!forecastState.activeProviders[p.source]) return false;
    const fVal = isHigh ? p.f_high : p.f_low;
    const aVal = isHigh ? p.actual_high : p.actual_low;
    const cVal = isHigh ? p.clim_high : p.clim_low;
    if (fVal === null || aVal === null) return false;
    if (isAnomalyMode && cVal === null) return false;
    return true;
  });

  let minVal = -12;
  let maxVal = 12;

  if (isAnomalyMode) {
    // Symmetrical bounds around (0, 0) for true 45° diagonal centered crosshair
    let maxAbs = 6;
    filtered.forEach(p => {
      const fF = isHigh ? p.f_high : p.f_low;
      const aF = isHigh ? p.actual_high : p.actual_low;
      const cF = isHigh ? p.clim_high : p.clim_low;
      const anomP = convertTempDiff(fF - cF, unit);
      const anomA = convertTempDiff(aF - cF, unit);
      if (anomP !== null) maxAbs = Math.max(maxAbs, Math.abs(anomP));
      if (anomA !== null) maxAbs = Math.max(maxAbs, Math.abs(anomA));
    });
    const bound = Math.ceil(maxAbs + 2);
    minVal = -bound;
    maxVal = bound;
  } else {
    // Absolute temperature bounds
    let allVals = [];
    filtered.forEach(p => {
      const fVal = convertTemp(isHigh ? p.f_high : p.f_low, unit);
      const aVal = convertTemp(isHigh ? p.actual_high : p.actual_low, unit);
      allVals.push(fVal, aVal);
    });
    if (allVals.length > 0) {
      minVal = Math.floor(Math.min(...allVals) - 3);
      maxVal = Math.ceil(Math.max(...allVals) + 3);
    } else {
      minVal = convertTemp(isHigh ? 50 : 35, unit);
      maxVal = convertTemp(isHigh ? 90 : 70, unit);
    }
  }

  const datasets = [];

  // 1. Identity Reference Line (y = x, Perfect Calibration)
  datasets.push({
    type: 'line',
    label: isAnomalyMode ? 'Perfect Anomaly Forecast (y = x)' : 'Perfect Forecast (y = x)',
    data: [
      { x: minVal, y: minVal },
      { x: maxVal, y: maxVal }
    ],
    borderColor: 'rgba(255, 255, 255, 0.45)',
    borderDash: [6, 6],
    borderWidth: 2,
    pointRadius: 0,
    fill: false,
    order: 10
  });

  // 2. In Anomaly Mode: Climatology Normal Baseline Crosshairs (0, 0)
  if (isAnomalyMode) {
    datasets.push({
      type: 'line',
      label: 'Climatology Baseline Normal (0°)',
      data: [
        { x: minVal, y: 0 },
        { x: maxVal, y: 0 }
      ],
      borderColor: 'rgba(255, 202, 40, 0.35)',
      borderDash: [3, 3],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      order: 12
    });
    datasets.push({
      type: 'line',
      label: 'Climatology Baseline Normal Forecast (0°)',
      data: [
        { x: 0, y: minVal },
        { x: 0, y: maxVal }
      ],
      borderColor: 'rgba(255, 202, 40, 0.35)',
      borderDash: [3, 3],
      borderWidth: 1.5,
      pointRadius: 0,
      fill: false,
      order: 12
    });
  }

  // 3. Tolerance Bounds (±3°F or ±1.7°C)
  const tol = unit === 'C' ? 1.7 : 3.0;
  datasets.push({
    type: 'line',
    label: `±${tol.toFixed(1)}°${unit} Tolerance`,
    data: [
      { x: minVal, y: minVal + tol },
      { x: maxVal, y: maxVal + tol }
    ],
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderDash: [3, 4],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
    order: 11
  });
  datasets.push({
    type: 'line',
    label: `-${tol.toFixed(1)}°${unit} Tolerance`,
    data: [
      { x: minVal, y: minVal - tol },
      { x: maxVal, y: maxVal - tol }
    ],
    borderColor: 'rgba(255, 255, 255, 0.1)',
    borderDash: [3, 4],
    borderWidth: 1,
    pointRadius: 0,
    fill: false,
    order: 11
  });

  // 4. Provider Datasets
  Object.keys(PROVIDER_CONFIG).forEach(provKey => {
    if (!forecastState.activeProviders[provKey]) return;
    const cfg = PROVIDER_CONFIG[provKey];

    const provPoints = filtered
      .filter(p => p.source === provKey)
      .map(p => {
        const fF = isHigh ? p.f_high : p.f_low;
        const aF = isHigh ? p.actual_high : p.actual_low;
        const cF = isHigh ? p.clim_high : p.clim_low;

        let ptX = 0;
        let ptY = 0;
        if (isAnomalyMode) {
          ptX = convertTempDiff(fF - cF, unit);
          ptY = convertTempDiff(aF - cF, unit);
        } else {
          ptX = convertTemp(fF, unit);
          ptY = convertTemp(aF, unit);
        }

        return {
          x: ptX,
          y: ptY,
          pointMeta: {
            source: p.source,
            target_date: p.target_date,
            lead_days: p.lead_days,
            f: fF,
            a: aF,
            c: cF
          }
        };
      });

    datasets.push({
      type: 'scatter',
      label: cfg.label,
      data: provPoints,
      backgroundColor: cfg.bgColor,
      borderColor: cfg.color,
      borderWidth: 1.5,
      pointRadius: 5.5,
      pointHoverRadius: 8.5,
      order: 2
    });

    // 5. Optional Calibration Regression Fit Line
    if (forecastState.showTrendlines && provPoints.length >= 3) {
      const xs = provPoints.map(pt => pt.x);
      const ys = provPoints.map(pt => pt.y);
      const n = xs.length;
      const xMean = xs.reduce((a, b) => a + b, 0) / n;
      const yMean = ys.reduce((a, b) => a + b, 0) / n;
      let num = 0;
      let den = 0;
      for (let i = 0; i < n; i++) {
        num += (xs[i] - xMean) * (ys[i] - yMean);
        den += (xs[i] - xMean) ** 2;
      }
      if (den > 1e-5) {
        const slope = num / den;
        const intercept = yMean - slope * xMean;
        const x1 = Math.min(...xs);
        const x2 = Math.max(...xs);
        datasets.push({
          type: 'line',
          label: `${cfg.label} Fit (β = ${slope.toFixed(2)})`,
          data: [
            { x: x1, y: slope * x1 + intercept },
            { x: x2, y: slope * x2 + intercept }
          ],
          borderColor: cfg.color,
          borderWidth: 2,
          pointRadius: 0,
          fill: false,
          order: 3
        });
      }
    }
  });

  return { datasets, minVal, maxVal, isAnomalyMode };
}

// 3. Live Scatter Stats Panel
function updateScatterLiveStats() {
  const container = document.getElementById('scatter-live-stats');
  if (!container || !forecastState.data) return;

  const metric = forecastState.activeMetric;
  const leadDayStr = String(forecastState.leadDay);
  const cohortKey = forecastState.benchmarkMode === 'common' ? 'common' : 'all';
  const metricsMap = forecastState.data.metrics[cohortKey][metric];
  const isAnomalyMode = forecastState.scatterMode === 'anomaly';
  const unit = getAppUnit();

  let html = '';
  Object.keys(PROVIDER_CONFIG).forEach(provKey => {
    const cfg = PROVIDER_CONFIG[provKey];
    const provMetrics = metricsMap[provKey]?.[leadDayStr];
    const isActive = forecastState.activeProviders[provKey];

    if (!provMetrics) {
      if (isActive) {
        html += `
          <div class="provider-stat-card" style="opacity: 0.5;">
            <div class="stat-header">
              <span class="stat-name"><span class="chip-dot" style="background:${cfg.color};"></span> ${cfg.label}</span>
              <span style="font-size:0.75rem; color:#64748b;">No data at Day ${leadDayStr}</span>
            </div>
            <p style="font-size:0.78rem; color:#64748b;">Provider only issues up to 7-day outlooks.</p>
          </div>
        `;
      }
      return;
    }

    const maeDisp = unit === 'C' ? (provMetrics.mae * 5 / 9).toFixed(1) : provMetrics.mae.toFixed(1);
    const rmseDisp = unit === 'C' ? (provMetrics.rmse * 5 / 9).toFixed(1) : provMetrics.rmse.toFixed(1);
    const biasDisp = unit === 'C' ? (provMetrics.bias * 5 / 9).toFixed(1) : provMetrics.bias.toFixed(1);
    const biasSign = provMetrics.bias >= 0 ? '+' : '';
    const msssClass = provMetrics.msss !== null && provMetrics.msss < 0 ? 'negative-skill' : 'positive-skill';

    // Highlight anomaly r when in anomaly mode
    const anomRowStyle = isAnomalyMode 
      ? `style="background: rgba(38,198,218,0.12); padding: 2px 4px; border-radius: 4px; border-left: 2px solid var(--accent-cyan);"` 
      : '';

    html += `
      <div class="provider-stat-card" style="border-left: 3px solid ${cfg.color}; ${isActive ? '' : 'opacity:0.4;'}">
        <div class="stat-header">
          <span class="stat-name">
            <span class="chip-dot" style="background:${cfg.color};"></span>
            ${cfg.label}
          </span>
          <span style="font-size:0.75rem; color:#94a3b8; font-weight:600;">N = ${provMetrics.n}</span>
        </div>
        <div class="stat-metrics">
          <div class="stat-metric-row">
            <span class="metric-k">MAE:</span>
            <span class="metric-v">${maeDisp}°${unit}</span>
          </div>
          <div class="stat-metric-row">
            <span class="metric-k">RMSE:</span>
            <span class="metric-v">${rmseDisp}°${unit}</span>
          </div>
          <div class="stat-metric-row">
            <span class="metric-k">Mean Bias:</span>
            <span class="metric-v">${biasSign}${biasDisp}°${unit}</span>
          </div>
          <div class="stat-metric-row" ${anomRowStyle}>
            <span class="metric-k" ${isAnomalyMode ? 'style="color:#26c6da; font-weight:600;"' : ''}>Anomaly r (ACC):</span>
            <span class="metric-v" ${isAnomalyMode ? 'style="color:#26c6da; font-weight:700;"' : ''}>${provMetrics.corr_anom !== null ? provMetrics.corr_anom.toFixed(3) : 'N/A'}</span>
          </div>
          <div class="stat-metric-row">
            <span class="metric-k">Raw r:</span>
            <span class="metric-v">${provMetrics.corr_raw !== null ? provMetrics.corr_raw.toFixed(3) : 'N/A'}</span>
          </div>
          <div class="stat-metric-row">
            <span class="metric-k">Skill Score (MSSS):</span>
            <span class="metric-v ${msssClass}">${provMetrics.msss !== null ? provMetrics.msss.toFixed(2) : 'N/A'}</span>
          </div>
        </div>
      </div>
    `;
  });

  container.innerHTML = html;
}

// 4. Lead-Time Skill Degradation Chart
function renderLeadDegradationChart() {
  const canvas = document.getElementById('lead-degradation-chart');
  if (!canvas || !forecastState.data) return;

  const ctx = canvas.getContext('2d');
  if (forecastState.charts.degradation) {
    forecastState.charts.degradation.destroy();
  }

  const { datasets, yLabel, yMin, yMax } = buildDegradationDatasets();

  forecastState.charts.degradation = new Chart(ctx, {
    type: 'line',
    data: {
      labels: ['0d', '1d', '2d', '3d', '4d', '5d', '6d', '7d', '8d', '9d', '10d'],
      datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: {
          labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12 } }
        },
        tooltip: {
          backgroundColor: '#182030',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Forecast Lead Time (Days Out)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.06)' },
          ticks: { color: '#64748b' }
        },
        y: {
          title: { display: true, text: yLabel, color: '#94a3b8' },
          min: yMin,
          max: yMax,
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function updateLeadDegradationChart() {
  if (!forecastState.charts.degradation) {
    renderLeadDegradationChart();
    return;
  }
  const { datasets, yLabel, yMin, yMax } = buildDegradationDatasets();
  const chart = forecastState.charts.degradation;
  chart.data.datasets = datasets;
  chart.options.scales.y.title.text = yLabel;
  chart.options.scales.y.min = yMin;
  chart.options.scales.y.max = yMax;
  chart.update();
}

function buildDegradationDatasets() {
  const metric = forecastState.activeMetric;
  const statKey = forecastState.degradationMetric; // 'mae', 'rmse', 'msss'
  const cohortKey = forecastState.benchmarkMode === 'common' ? 'common' : 'all';
  const metricsMap = forecastState.data.metrics[cohortKey][metric];
  const unit = getAppUnit();

  const datasets = [];
  let yLabel = '';
  let yMin = undefined;
  let yMax = undefined;

  if (statKey === 'mae') {
    yLabel = `Mean Absolute Error (°${unit})`;
    yMin = 0;
  } else if (statKey === 'rmse') {
    yLabel = `Root Mean Squared Error (°${unit})`;
    yMin = 0;
  } else {
    yLabel = 'Mean Squared Skill Score (MSSS vs Climatology)';
    yMax = 1.0;
  }

  // Zero-skill baseline if MSSS
  if (statKey === 'msss') {
    datasets.push({
      label: 'Zero-Skill Climatology Threshold (MSSS = 0)',
      data: Array(11).fill(0.0),
      borderColor: '#ef5350',
      borderDash: [6, 6],
      borderWidth: 2,
      pointRadius: 0,
      fill: false,
      order: 10
    });
  }

  Object.keys(PROVIDER_CONFIG).forEach(provKey => {
    if (!forecastState.activeProviders[provKey]) return;
    const cfg = PROVIDER_CONFIG[provKey];

    const data = [];
    for (let ld = 0; ld <= 10; ld++) {
      const m = metricsMap[provKey]?.[String(ld)];
      if (!m || m[statKey] === null) {
        data.push(null);
      } else {
        let val = m[statKey];
        if ((statKey === 'mae' || statKey === 'rmse') && unit === 'C') {
          val = val * (5 / 9);
        }
        data.push(val);
      }
    }

    datasets.push({
      label: cfg.label,
      data,
      borderColor: cfg.color,
      backgroundColor: cfg.bgColor,
      borderWidth: 2.5,
      pointRadius: 4,
      pointHoverRadius: 7,
      tension: 0.25,
      spanGaps: false
    });
  });

  return { datasets, yLabel, yMin, yMax };
}

// 5. Bias Distribution Bar Chart
function renderBiasDistributionChart() {
  const canvas = document.getElementById('bias-distribution-chart');
  if (!canvas || !forecastState.data) return;

  const ctx = canvas.getContext('2d');
  if (forecastState.charts.bias) {
    forecastState.charts.bias.destroy();
  }

  const { labels, highBiases, lowBiases } = buildBiasDatasets();
  const unit = getAppUnit();

  forecastState.charts.bias = new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [
        {
          label: `High Temp Bias (°${unit})`,
          data: highBiases,
          backgroundColor: 'rgba(255, 112, 67, 0.75)',
          borderColor: '#ff7043',
          borderWidth: 1
        },
        {
          label: `Low Temp Bias (°${unit})`,
          data: lowBiases,
          backgroundColor: 'rgba(41, 182, 246, 0.75)',
          borderColor: '#29b6f6',
          borderWidth: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#cbd5e1', font: { family: 'Inter', size: 12 } } },
        tooltip: {
          backgroundColor: '#182030',
          callbacks: {
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw >= 0 ? '+' : ''}${ctx.raw.toFixed(2)}°${unit}`
          }
        }
      },
      scales: {
        x: { grid: { color: 'rgba(255, 255, 255, 0.05)' }, ticks: { color: '#64748b' } },
        y: {
          title: { display: true, text: `Mean Bias (°${unit})`, color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

function updateBiasDistributionChart() {
  if (!forecastState.charts.bias) {
    renderBiasDistributionChart();
    return;
  }
  const { labels, highBiases, lowBiases } = buildBiasDatasets();
  const unit = getAppUnit();
  const chart = forecastState.charts.bias;
  chart.data.labels = labels;
  chart.data.datasets[0].label = `High Temp Bias (°${unit})`;
  chart.data.datasets[0].data = highBiases;
  chart.data.datasets[1].label = `Low Temp Bias (°${unit})`;
  chart.data.datasets[1].data = lowBiases;
  chart.options.scales.y.title.text = `Mean Bias (°${unit})`;
  chart.update();
}

function buildBiasDatasets() {
  const leadDayStr = String(forecastState.leadDay);
  const cohortKey = forecastState.benchmarkMode === 'common' ? 'common' : 'all';
  const mHigh = forecastState.data.metrics[cohortKey].high;
  const mLow = forecastState.data.metrics[cohortKey].low;
  const unit = getAppUnit();

  const labels = [];
  const highBiases = [];
  const lowBiases = [];

  Object.keys(PROVIDER_CONFIG).forEach(provKey => {
    if (!forecastState.activeProviders[provKey]) return;
    const cfg = PROVIDER_CONFIG[provKey];
    labels.push(cfg.label);

    const bh = mHigh[provKey]?.[leadDayStr]?.bias;
    const bl = mLow[provKey]?.[leadDayStr]?.bias;

    highBiases.push(bh !== undefined && bh !== null ? (unit === 'C' ? bh * 5 / 9 : bh) : null);
    lowBiases.push(bl !== undefined && bl !== null ? (unit === 'C' ? bl * 5 / 9 : bl) : null);
  });

  return { labels, highBiases, lowBiases };
}

// 6. Comparative Scorecard Table
function renderForecastScorecardTable() {
  const tbody = document.getElementById('scorecard-tbody');
  if (!tbody || !forecastState.data) return;

  const cohortKey = forecastState.benchmarkMode === 'common' ? 'common' : 'all';
  const mHigh = forecastState.data.metrics[cohortKey].high;
  const mLow = forecastState.data.metrics[cohortKey].low;
  const unit = getAppUnit();
  const targetLeadDays = [0, 1, 3, 5, 7, 10];

  let html = '';

  targetLeadDays.forEach(ld => {
    const ldStr = String(ld);

    // Identify best MAE at this lead day
    let bestHighMAE = Infinity, bestHighProv = null;
    let bestLowMAE = Infinity, bestLowProv = null;

    Object.keys(PROVIDER_CONFIG).forEach(pk => {
      const mh = mHigh[pk]?.[ldStr];
      const ml = mLow[pk]?.[ldStr];
      if (mh && mh.mae < bestHighMAE) { bestHighMAE = mh.mae; bestHighProv = pk; }
      if (ml && ml.mae < bestLowMAE) { bestLowMAE = ml.mae; bestLowProv = pk; }
    });

    Object.keys(PROVIDER_CONFIG).forEach(provKey => {
      const cfg = PROVIDER_CONFIG[provKey];
      const mh = mHigh[provKey]?.[ldStr];
      const ml = mLow[provKey]?.[ldStr];

      if (!mh && !ml) return;

      const highMAE = mh ? (unit === 'C' ? (mh.mae * 5 / 9).toFixed(1) : mh.mae.toFixed(1)) : 'N/A';
      const lowMAE = ml ? (unit === 'C' ? (ml.mae * 5 / 9).toFixed(1) : ml.mae.toFixed(1)) : 'N/A';
      const highBias = mh ? `${mh.bias >= 0 ? '+' : ''}${(unit === 'C' ? mh.bias * 5 / 9 : mh.bias).toFixed(1)}` : 'N/A';
      const lowBias = ml ? `${ml.bias >= 0 ? '+' : ''}${(unit === 'C' ? ml.bias * 5 / 9 : ml.bias).toFixed(1)}` : 'N/A';
      const msssH = mh && mh.msss !== null ? mh.msss.toFixed(2) : 'N/A';
      const anomCorr = mh && mh.corr_anom !== null ? mh.corr_anom.toFixed(3) : 'N/A';

      const isHighWinner = mh && provKey === bestHighProv;
      const isLowWinner = ml && provKey === bestLowProv;

      let badgeHtml = '';
      if (isHighWinner && isLowWinner) {
        badgeHtml = `<span class="winner-pill" style="background:rgba(255,215,0,0.2); color:#ffd700; border-color:#ffd700;">⭐ Best High & Low</span>`;
      } else if (isHighWinner) {
        badgeHtml = `<span class="winner-pill">🥇 Best High</span>`;
      } else if (isLowWinner) {
        badgeHtml = `<span class="winner-pill" style="background:rgba(16,185,129,0.2); color:#10b981; border-color:#10b981;">🌙 Best Low</span>`;
      }

      const msssColor = mh && mh.msss < 0 ? 'negative-skill' : 'positive-skill';

      html += `
        <tr class="scorecard-row" data-lead="${ld}">
          <td><strong style="color: ${cfg.color}">${cfg.label}</strong></td>
          <td><strong>${ld}d</strong> out</td>
          <td>${mh ? mh.n : (ml ? ml.n : '-')}</td>
          <td>${highMAE}°${unit} ${isHighWinner ? '🔥' : ''}</td>
          <td>${lowMAE}°${unit} ${isLowWinner ? '❄️' : ''}</td>
          <td>${highBias}°${unit}</td>
          <td>${lowBias}°${unit}</td>
          <td>${anomCorr}</td>
          <td class="${msssColor}">${msssH}</td>
          <td>${badgeHtml}</td>
        </tr>
      `;
    });
  });

  tbody.innerHTML = html;
  updateScorecardHighlight();
}

function updateScorecardHighlight() {
  const currentLead = forecastState.leadDay;
  document.querySelectorAll('.scorecard-row').forEach(row => {
    const rowLead = parseInt(row.dataset.lead, 10);
    if (rowLead === currentLead) {
      row.style.background = 'rgba(38, 198, 218, 0.08)';
      row.style.outline = '1px solid rgba(38, 198, 218, 0.3)';
    } else {
      row.style.background = '';
      row.style.outline = '';
    }
  });
}
