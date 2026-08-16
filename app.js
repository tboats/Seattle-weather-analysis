// ==========================================================================
// Seattle Weather & Daylight Lag Analysis - Core Application Logic
// ==========================================================================

let appState = {
  unit: 'F', // 'F' or 'C'
  showScatter: true,
  showRolling: true,
  showRangeFill: true,
  currentLagDays: 0,
  data: null
};

// Chart Instances
let charts = {
  tempTimeSeries: null,
  monthlyAnomaly: null,
  residualsDist: null,
  precipDaily: null,
  precipCum: null,
  sunTempLag: null,
  crossCorr: null,
  hysteresis: null
};

// Helper Functions
function fToC(f) {
  return f !== null && f !== undefined ? (f - 32) * (5 / 9) : null;
}

function formatTemp(f, unit = appState.unit) {
  if (f === null || f === undefined) return 'N/A';
  if (unit === 'C') {
    return `${fToC(f).toFixed(1)}°C`;
  }
  return `${f.toFixed(1)}°F`;
}

function formatDateLabel(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mIdx = parseInt(parts[1], 10) - 1;
    const day = parseInt(parts[2], 10);
    return `${monthNames[mIdx]} ${day}`;
  }
  return dateStr;
}

function formatMonthLabel(monthStr) {
  if (!monthStr) return '';
  const parts = monthStr.split('-');
  if (parts.length === 2) {
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const mIdx = parseInt(parts[1], 10) - 1;
    return `${monthNames[mIdx]} '${parts[0].substring(2)}`;
  }
  return monthStr;
}

function calcRollingAverage(arr, windowSize = 7) {
  const result = [];
  const half = Math.floor(windowSize / 2);
  for (let i = 0; i < arr.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = i - half; j <= i + half; j++) {
      if (j >= 0 && j < arr.length && arr[j] !== null && arr[j] !== undefined) {
        sum += arr[j];
        count++;
      }
    }
    result.push(count > 0 ? sum / count : null);
  }
  return result;
}

function computeMonthlyAnomaliesFromObs(obs) {
  if (!obs || !obs.length) return [];
  const byMonth = {};
  obs.forEach(o => {
    const mKey = o.date ? o.date.substring(0, 7) : null;
    if (!mKey) return;
    if (!byMonth[mKey]) {
      byMonth[mKey] = { hObs: [], hAvg: [], lObs: [], lAvg: [] };
    }
    if (o.observed_high !== null && o.avg_high !== null) {
      byMonth[mKey].hObs.push(o.observed_high);
      byMonth[mKey].hAvg.push(o.avg_high);
    }
    if (o.observed_low !== null && o.avg_low !== null) {
      byMonth[mKey].lObs.push(o.observed_low);
      byMonth[mKey].lAvg.push(o.avg_low);
    }
  });

  const monthsSorted = Object.keys(byMonth).sort();
  return monthsSorted.map(mKey => {
    const v = byMonth[mKey];
    const meanHObs = v.hObs.length ? v.hObs.reduce((a,b)=>a+b, 0)/v.hObs.length : 0;
    const meanHAvg = v.hAvg.length ? v.hAvg.reduce((a,b)=>a+b, 0)/v.hAvg.length : 0;
    const meanLObs = v.lObs.length ? v.lObs.reduce((a,b)=>a+b, 0)/v.lObs.length : 0;
    const meanLAvg = v.lAvg.length ? v.lAvg.reduce((a,b)=>a+b, 0)/v.lAvg.length : 0;

    return {
      month: mKey,
      high_anomaly: parseFloat((meanHObs - meanHAvg).toFixed(2)),
      low_anomaly: parseFloat((meanLObs - meanLAvg).toFixed(2)),
      mean_anomaly: parseFloat(((meanHObs + meanLObs)/2 - (meanHAvg + meanLAvg)/2).toFixed(2))
    };
  });
}

function computeSeasonalAnomaliesFromMonthly(monthlyData) {
  if (!monthlyData || !monthlyData.length) return null;
  const seasonsMap = {
    Winter: ['12', '01', '02'],
    Spring: ['03', '04', '05'],
    Summer: ['06', '07', '08'],
    Autumn: ['09', '10', '11']
  };
  const res = {};
  Object.entries(seasonsMap).forEach(([sName, mList]) => {
    const sH = monthlyData.filter(m => mList.includes(m.month.substring(5))).map(m => m.high_anomaly);
    const sL = monthlyData.filter(m => mList.includes(m.month.substring(5))).map(m => m.low_anomaly);
    const mean = arr => arr.length ? arr.reduce((a,b)=>a+b, 0)/arr.length : 0;
    res[sName] = {
      high_anomaly: parseFloat(mean(sH).toFixed(2)),
      low_anomaly: parseFloat(mean(sL).toFixed(2)),
      mean_anomaly: parseFloat(mean(sH.concat(sL)).toFixed(2))
    };
  });
  return res;
}

// --------------------------------------------------------------------------
// Initialization
// --------------------------------------------------------------------------
function initApp() {
  console.log('Initializing app...');
  loadWeatherData();
  setupEventListeners();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

async function loadWeatherData() {
  if (window.SEATTLE_WEATHER_DATA && window.SEATTLE_WEATHER_DATA.observations) {
    console.log('Loaded weather data via window.SEATTLE_WEATHER_DATA');
    appState.data = window.SEATTLE_WEATHER_DATA;
    ensureMonthlyDataPresent();
    updateHeaderMetrics();
    renderAllCharts();
    return;
  }

  const candidatePaths = [
    'weather_data.json',
    'public/weather_data.json',
    './weather_data.json',
    './public/weather_data.json'
  ];

  for (const path of candidatePaths) {
    try {
      const response = await fetch(path);
      if (response.ok) {
        appState.data = await response.json();
        console.log(`Loaded weather data successfully from: ${path}`);
        ensureMonthlyDataPresent();
        updateHeaderMetrics();
        renderAllCharts();
        return;
      }
    } catch (err) {
      console.warn(`Failed fetching from ${path}:`, err);
    }
  }

  console.error('Failed to load weather data from candidate paths.');
}

function ensureMonthlyDataPresent() {
  if (!appState.data) return;
  if (!appState.data.monthly_anomalies || !appState.data.monthly_anomalies.length) {
    console.log('Computing monthly & seasonal anomalies dynamically from observations...');
    appState.data.monthly_anomalies = computeMonthlyAnomaliesFromObs(appState.data.observations);
  }
  if (!appState.data.seasonal_anomalies) {
    appState.data.seasonal_anomalies = computeSeasonalAnomaliesFromMonthly(appState.data.monthly_anomalies);
  }
}

function setupEventListeners() {
  const unitBtn = document.getElementById('unit-toggle-btn');
  if (unitBtn) {
    unitBtn.addEventListener('click', () => {
      appState.unit = appState.unit === 'F' ? 'C' : 'F';
      document.getElementById('unit-indicator').textContent = `°${appState.unit} / in`;
      updateHeaderMetrics();
      renderAllCharts();
    });
  }

  const rollingToggle = document.getElementById('toggle-rolling');
  if (rollingToggle) {
    rollingToggle.addEventListener('change', (e) => {
      appState.showRolling = e.target.checked;
      updateTempTimeSeriesChart();
    });
  }

  const scatterToggle = document.getElementById('toggle-scatter');
  if (scatterToggle) {
    scatterToggle.addEventListener('change', (e) => {
      appState.showScatter = e.target.checked;
      updateTempTimeSeriesChart();
    });
  }

  const rangeToggle = document.getElementById('toggle-range-fill');
  if (rangeToggle) {
    rangeToggle.addEventListener('change', (e) => {
      appState.showRangeFill = e.target.checked;
      updateTempTimeSeriesChart();
    });
  }

  const slider = document.getElementById('lag-slider');
  if (slider) {
    slider.addEventListener('input', (e) => {
      appState.currentLagDays = parseInt(e.target.value, 10);
      updateLagSliderUI();
      updateSunTempLagChart();
    });
  }

  const btn0 = document.getElementById('btn-lag-0');
  if (btn0) {
    btn0.addEventListener('click', () => {
      if (slider) slider.value = 0;
      appState.currentLagDays = 0;
      updateLagSliderUI();
      updateSunTempLagChart();
    });
  }

  const btnOptimal = document.getElementById('btn-lag-optimal');
  if (btnOptimal) {
    btnOptimal.addEventListener('click', () => {
      const bestLag = appState.data ? appState.data.best_lag_days : 34;
      if (slider) slider.value = bestLag;
      appState.currentLagDays = bestLag;
      updateLagSliderUI();
      updateSunTempLagChart();
    });
  }

  const refreshBtn = document.getElementById('refresh-data-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      loadWeatherData();
    });
  }
}

function updateHeaderMetrics() {
  if (!appState.data) return;
  ensureMonthlyDataPresent();
  const { 
    observations, 
    climate_normals, 
    best_lag_days, 
    max_correlation,
    total_observed_precip_in,
    total_normal_precip_in,
    precip_anomaly_in,
    precip_anomaly_pct,
    residual_stats,
    precip_stats,
    seasonal_anomalies
  } = appState.data;

  // Thermal Lag Metric
  const elLag = document.getElementById('val-thermal-lag');
  if (elLag) elLag.textContent = `${best_lag_days} Days`;
  
  const elCorr = document.getElementById('val-lag-corr');
  if (elCorr) elCorr.textContent = `Max Correlation: r = ${max_correlation}`;

  // Peak Sun Date
  let maxDaylight = -1;
  let peakSunDate = '06-21';
  Object.entries(climate_normals).forEach(([mmdd, vals]) => {
    if (vals.avg_daylight_hrs > maxDaylight) {
      maxDaylight = vals.avg_daylight_hrs;
      peakSunDate = mmdd;
    }
  });
  const elPeakSun = document.getElementById('val-peak-sun');
  if (elPeakSun) elPeakSun.textContent = formatDateLabel(`2026-${peakSunDate}`);

  // Peak Temp Date
  let maxTemp = -1;
  let peakTempDate = '07-25';
  Object.entries(climate_normals).forEach(([mmdd, vals]) => {
    if (vals.avg_high > maxTemp) {
      maxTemp = vals.avg_high;
      peakTempDate = mmdd;
    }
  });
  const elPeakTemp = document.getElementById('val-peak-temp');
  if (elPeakTemp) elPeakTemp.textContent = formatDateLabel(`2026-${peakTempDate}`);
  const elPeakTempSub = document.getElementById('val-peak-temp-sub');
  if (elPeakTempSub) elPeakTempSub.textContent = `${formatTemp(maxTemp)} Avg High`;

  const convFactor = appState.unit === 'C' ? (5 / 9) : 1;
  const unitLabel = `°${appState.unit}`;

  // Seasonal Anomaly Bindings
  if (seasonal_anomalies) {
    const w = seasonal_anomalies.Winter;
    const sp = seasonal_anomalies.Spring;
    const au = seasonal_anomalies.Autumn;
    const su = seasonal_anomalies.Summer;

    const elW = document.getElementById('val-season-winter');
    if (elW && w) elW.textContent = `+${(w.low_anomaly * convFactor).toFixed(2)}${unitLabel} Lows`;
    const elWH = document.getElementById('val-season-winter-high');
    if (elWH && w) elWH.textContent = `High Anomaly: +${(w.high_anomaly * convFactor).toFixed(2)}${unitLabel}`;

    const elSp = document.getElementById('val-season-spring');
    if (elSp && sp) elSp.textContent = `+${(sp.low_anomaly * convFactor).toFixed(2)}${unitLabel} Lows`;
    const elSpH = document.getElementById('val-season-spring-high');
    if (elSpH && sp) elSpH.textContent = `High Anomaly: +${(sp.high_anomaly * convFactor).toFixed(2)}${unitLabel}`;

    const elAu = document.getElementById('val-season-autumn');
    if (elAu && au) elAu.textContent = `+${(au.low_anomaly * convFactor).toFixed(2)}${unitLabel} Lows`;
    const elAuH = document.getElementById('val-season-autumn-high');
    if (elAuH && au) elAuH.textContent = `High Anomaly: +${(au.high_anomaly * convFactor).toFixed(2)}${unitLabel}`;

    const elSu = document.getElementById('val-season-summer');
    if (elSu && su) elSu.textContent = `+${(su.low_anomaly * convFactor).toFixed(2)}${unitLabel} Lows`;
    const elSuH = document.getElementById('val-season-summer-high');
    if (elSuH && su) elSuH.textContent = `High Anomaly: +${(su.high_anomaly * convFactor).toFixed(2)}${unitLabel}`;
  }

  // High & Low Temperature Variation Metrics
  if (residual_stats) {
    const hStats = residual_stats.high;
    const lStats = residual_stats.low;

    const hMean = (hStats.mean * convFactor).toFixed(2);
    const hStd = (hStats.std_dev * convFactor).toFixed(2);
    const hP25 = (hStats.p25 * convFactor).toFixed(1);
    const hP75 = (hStats.p75 * convFactor).toFixed(1);
    const hHistStd = (hStats.typical_hist_std * convFactor).toFixed(2);

    const lMean = (lStats.mean * convFactor).toFixed(2);
    const lStd = (lStats.std_dev * convFactor).toFixed(2);
    const lP25 = (lStats.p25 * convFactor).toFixed(1);
    const lP75 = (lStats.p75 * convFactor).toFixed(1);
    const lHistStd = (lStats.typical_hist_std * convFactor).toFixed(2);

    const elAnnualAnomaly = document.getElementById('val-annual-anomaly');
    if (elAnnualAnomaly) elAnnualAnomaly.textContent = `+${lMean}${unitLabel} Lows`;

    const elHighResMean = document.getElementById('val-high-res-mean');
    if (elHighResMean) elHighResMean.textContent = `+${hMean}${unitLabel}`;
    
    const elHighResVar = document.getElementById('val-high-res-var');
    if (elHighResVar) elHighResVar.textContent = `σ = ±${hStd}${unitLabel} | IQR: ${hP25}° to +${hP75}${unitLabel}`;

    const elHighResComp = document.getElementById('val-high-res-comp');
    if (elHighResComp) elHighResComp.textContent = `vs. Typical 10-Yr σ = ${hHistStd}${unitLabel} (+${(hStd - hHistStd).toFixed(2)}° spread)`;

    const elLowResMean = document.getElementById('val-low-res-mean');
    if (elLowResMean) elLowResMean.textContent = `+${lMean}${unitLabel}`;

    const elLowResVar = document.getElementById('val-low-res-var');
    if (elLowResVar) elLowResVar.textContent = `σ = ±${lStd}${unitLabel} | IQR: ${lP25}° to +${lP75}${unitLabel}`;

    const elLowResComp = document.getElementById('val-low-res-comp');
    if (elLowResComp) elLowResComp.textContent = `vs. Typical 10-Yr σ = ${lHistStd}${unitLabel} (+${lMean}° warm shift)`;
  }

  // Precipitation Summary Metrics
  const elPrecipTotal = document.getElementById('val-precip-total');
  if (elPrecipTotal) elPrecipTotal.textContent = `${total_observed_precip_in.toFixed(2)} in`;

  const elPrecipAnomaly = document.getElementById('val-precip-anomaly');
  if (elPrecipAnomaly) {
    const sign = precip_anomaly_in > 0 ? '+' : '';
    elPrecipAnomaly.textContent = `${sign}${precip_anomaly_in.toFixed(2)} in (${precip_anomaly_pct > 0 ? '+' : ''}${precip_anomaly_pct}% vs Normal)`;
  }

  const elPrecipObsStat = document.getElementById('val-precip-obs-stat');
  if (elPrecipObsStat) elPrecipObsStat.textContent = `${total_observed_precip_in.toFixed(2)} in`;

  const elPrecipNormSub = document.getElementById('val-precip-norm-sub');
  if (elPrecipNormSub) elPrecipNormSub.textContent = `10-Yr Normal: ${total_normal_precip_in.toFixed(2)} in (${precip_anomaly_pct > 0 ? '+' : ''}${precip_anomaly_pct}%)`;

  if (precip_stats) {
    const pStd = precip_stats.obs_daily_std;
    const pHistStd = precip_stats.typical_hist_daily_std;
    const stdPct = (((pStd - pHistStd) / pHistStd) * 100).toFixed(1);

    const elPrecipStdStat = document.getElementById('val-precip-std-stat');
    if (elPrecipStdStat) elPrecipStdStat.textContent = `σ = ${pStd.toFixed(3)} in/d`;

    const elPrecipStdComp = document.getElementById('val-precip-std-comp');
    if (elPrecipStdComp) elPrecipStdComp.textContent = `vs. Typical 10-Yr σ = ${pHistStd.toFixed(3)} in/d (+${stdPct}% spread)`;

    const elPrecipHeavyStat = document.getElementById('val-precip-heavy-stat');
    if (elPrecipHeavyStat) elPrecipHeavyStat.textContent = `${precip_stats.heavy_days_obs} Days`;

    const heavyPct = (((precip_stats.heavy_days_obs - precip_stats.heavy_days_norm) / precip_stats.heavy_days_norm) * 100).toFixed(1);

    const elPrecipHeavyComp = document.getElementById('val-precip-heavy-comp');
    if (elPrecipHeavyComp) elPrecipHeavyComp.textContent = `vs. Typical = ${precip_stats.heavy_days_norm} Days (+${heavyPct}% more downpours)`;

    const elRainDaysSub = document.getElementById('val-rain-days-sub');
    if (elRainDaysSub) elRainDaysSub.textContent = `${precip_stats.wet_days_obs} Wet Days (Normal: ${precip_stats.wet_days_norm} days)`;
  }
}

function updateLagSliderUI() {
  const elSliderDays = document.getElementById('slider-days-display');
  if (elSliderDays) elSliderDays.textContent = `${appState.currentLagDays} Days`;
  
  if (!appState.data) return;
  const lagItem = appState.data.cross_correlation.find(c => c.lag_days === appState.currentLagDays);
  if (lagItem) {
    const elSliderCorr = document.getElementById('slider-corr-display');
    if (elSliderCorr) elSliderCorr.textContent = `Correlation r = ${lagItem.r}`;
  }
}

// --------------------------------------------------------------------------
// Chart Renderers
// --------------------------------------------------------------------------
function renderAllCharts() {
  if (!appState.data) return;
  try { updateTempTimeSeriesChart(); } catch(e) { console.error('Error in updateTempTimeSeriesChart:', e); }
  try { renderMonthlyAnomalyChart(); } catch(e) { console.error('Error in renderMonthlyAnomalyChart:', e); }
  try { renderResidualsDistChart(); } catch(e) { console.error('Error in renderResidualsDistChart:', e); }
  try { renderPrecipDailyChart(); } catch(e) { console.error('Error in renderPrecipDailyChart:', e); }
  try { renderPrecipCumChart(); } catch(e) { console.error('Error in renderPrecipCumChart:', e); }
  try { updateSunTempLagChart(); } catch(e) { console.error('Error in updateSunTempLagChart:', e); }
  try { renderCrossCorrChart(); } catch(e) { console.error('Error in renderCrossCorrChart:', e); }
  try { renderHysteresisChart(); } catch(e) { console.error('Error in renderHysteresisChart:', e); }
}

// --------------------------------------------------------------------------
// Plot 1: Temperature Time Series (1 Year) with 7d Rolling Avg
// --------------------------------------------------------------------------
function updateTempTimeSeriesChart() {
  const canvas = document.getElementById('temp-timeseries-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const obs = appState.data.observations;

  const dateLabels = obs.map(o => formatDateLabel(o.date));
  const avgHighs = obs.map(o => appState.unit === 'C' ? fToC(o.avg_high) : o.avg_high);
  const avgLows = obs.map(o => appState.unit === 'C' ? fToC(o.avg_low) : o.avg_low);
  const obsHighs = obs.map(o => appState.unit === 'C' ? fToC(o.observed_high) : o.observed_high);
  const obsLows = obs.map(o => appState.unit === 'C' ? fToC(o.observed_low) : o.observed_low);

  const rollHighs = calcRollingAverage(obsHighs, 7);
  const rollLows = calcRollingAverage(obsLows, 7);

  const datasets = [
    {
      label: `Avg High Baseline (°${appState.unit})`,
      data: avgHighs,
      borderColor: 'rgba(255, 112, 67, 0.6)',
      borderDash: [5, 5],
      backgroundColor: 'transparent',
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.35,
      order: 3
    },
    {
      label: `Avg Low Baseline (°${appState.unit})`,
      data: avgLows,
      borderColor: 'rgba(41, 182, 246, 0.6)',
      borderDash: [5, 5],
      backgroundColor: appState.showRangeFill ? 'rgba(255, 112, 67, 0.08)' : 'transparent',
      fill: appState.showRangeFill ? '-1' : false,
      borderWidth: 2,
      pointRadius: 0,
      tension: 0.35,
      order: 4
    }
  ];

  if (appState.showRolling) {
    datasets.unshift(
      {
        label: `7-Day Rolling High (°${appState.unit})`,
        data: rollHighs,
        borderColor: '#ff3d00',
        backgroundColor: 'transparent',
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.3,
        order: 1
      },
      {
        label: `7-Day Rolling Low (°${appState.unit})`,
        data: rollLows,
        borderColor: '#00b0ff',
        backgroundColor: 'transparent',
        borderWidth: 3,
        pointRadius: 0,
        tension: 0.3,
        order: 2
      }
    );
  }

  if (appState.showScatter) {
    datasets.push({
      label: `Observed High (°${appState.unit})`,
      data: obsHighs,
      borderColor: '#ef5350',
      backgroundColor: 'rgba(239, 83, 80, 0.5)',
      showLine: false,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      order: 5
    });
    datasets.push({
      label: `Observed Low (°${appState.unit})`,
      data: obsLows,
      borderColor: '#42a5f5',
      backgroundColor: 'rgba(66, 165, 245, 0.5)',
      showLine: false,
      pointRadius: 2.5,
      pointHoverRadius: 5,
      order: 6
    });
  }

  if (charts.tempTimeSeries) {
    charts.tempTimeSeries.destroy();
  }

  charts.tempTimeSeries = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dateLabels,
      datasets: datasets
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
        tooltip: {
          backgroundColor: '#182030',
          titleColor: '#f0f4f8',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.15)',
          borderWidth: 1,
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              return `${obs[idx].date} (${dateLabels[idx]})`;
            },
            label: (context) => {
              const val = context.parsed.y;
              return `${context.dataset.label}: ${val !== null ? val.toFixed(1) : 'N/A'}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 12 }
        },
        y: {
          title: { display: true, text: `Temperature (°${appState.unit})`, color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot: Month-by-Month Temperature Anomaly Chart
// --------------------------------------------------------------------------
function renderMonthlyAnomalyChart() {
  const canvas = document.getElementById('monthly-anomaly-chart');
  if (!canvas) return;
  ensureMonthlyDataPresent();
  const ctx = canvas.getContext('2d');
  let monthlyData = appState.data.monthly_anomalies;
  if (!monthlyData || !monthlyData.length) {
    monthlyData = computeMonthlyAnomaliesFromObs(appState.data.observations);
  }
  if (!monthlyData || !monthlyData.length) return;

  const conv = appState.unit === 'C' ? (5 / 9) : 1;
  const labels = monthlyData.map(m => formatMonthLabel(m.month));
  const highAnoms = monthlyData.map(m => (m.high_anomaly * conv));
  const lowAnoms = monthlyData.map(m => (m.low_anomaly * conv));

  if (charts.monthlyAnomaly) {
    charts.monthlyAnomaly.destroy();
  }

  // HIGH TEMP ANOMALY: Sunburst Amber / Flame Gold (#ff6f00 / #ffab00) for positive, Ocean Blue (#0288d1) for negative
  // LOW TEMP ANOMALY: Nightfall Electric Violet / Indigo (#7c4dff / #b388ff) for positive, Deep Cyan (#00e5ff) for negative
  charts.monthlyAnomaly = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [
        {
          label: `Daytime High Anomaly (°${appState.unit}) [Sunburst Gold]`,
          data: highAnoms,
          backgroundColor: highAnoms.map(val => val >= 0 ? 'rgba(255, 111, 0, 0.85)' : 'rgba(2, 136, 209, 0.85)'),
          borderColor: highAnoms.map(val => val >= 0 ? '#ff8f00' : '#039be5'),
          borderWidth: 2
        },
        {
          label: `Nighttime Low Anomaly (°${appState.unit}) [Electric Violet]`,
          data: lowAnoms,
          backgroundColor: lowAnoms.map(val => val >= 0 ? 'rgba(124, 77, 255, 0.85)' : 'rgba(0, 229, 255, 0.85)'),
          borderColor: lowAnoms.map(val => val >= 0 ? '#b388ff' : '#18ffff'),
          borderWidth: 2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { 
          labels: { 
            color: '#f0f4f8', 
            font: { family: 'Inter', size: 13, weight: '600' },
            usePointStyle: true,
            boxWidth: 12
          } 
        },
        tooltip: {
          backgroundColor: '#182030',
          titleColor: '#f0f4f8',
          bodyColor: '#cbd5e1',
          borderColor: 'rgba(255, 255, 255, 0.2)',
          borderWidth: 1,
          callbacks: {
            title: (items) => `Month: ${items[0].label}`,
            label: (context) => {
              const val = context.parsed.y;
              const sign = val >= 0 ? '+' : '';
              return `${context.dataset.label}: ${sign}${val.toFixed(2)}°${appState.unit}`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#94a3b8', font: { family: 'Inter', size: 12 } }
        },
        y: {
          title: { display: true, text: `Temperature Anomaly (°${appState.unit})`, color: '#94a3b8', font: { size: 12 } },
          grid: { color: 'rgba(255, 255, 255, 0.08)' },
          ticks: { color: '#94a3b8' }
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot: Residuals Distribution Histogram
// --------------------------------------------------------------------------
function renderResidualsDistChart() {
  const canvas = document.getElementById('residuals-dist-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const obs = appState.data.observations;

  const conv = appState.unit === 'C' ? (5 / 9) : 1;
  const highRes = obs.filter(o => o.observed_high !== null && o.avg_high !== null).map(o => (o.observed_high - o.avg_high) * conv);
  const lowRes = obs.filter(o => o.observed_low !== null && o.avg_low !== null).map(o => (o.observed_low - o.avg_low) * conv);

  const binStep = appState.unit === 'C' ? 1.5 : 3.0;
  const minBin = appState.unit === 'C' ? -10 : -18;
  const maxBin = appState.unit === 'C' ? 12 : 21;

  const bins = [];
  for (let b = minBin; b <= maxBin; b += binStep) {
    bins.push(b);
  }

  const binLabels = bins.map(b => `${b > 0 ? '+' : ''}${b.toFixed(1)}°${appState.unit}`);
  const highCounts = new Array(bins.length).fill(0);
  const lowCounts = new Array(bins.length).fill(0);

  highRes.forEach(r => {
    const idx = Math.floor((r - minBin) / binStep);
    if (idx >= 0 && idx < bins.length) highCounts[idx]++;
  });

  lowRes.forEach(r => {
    const idx = Math.floor((r - minBin) / binStep);
    if (idx >= 0 && idx < bins.length) lowCounts[idx]++;
  });

  if (charts.residualsDist) {
    charts.residualsDist.destroy();
  }

  charts.residualsDist = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: binLabels,
      datasets: [
        {
          label: `High Temp Residuals (Mean: +${appState.data.residual_stats ? (appState.data.residual_stats.high.mean * conv).toFixed(2) : '1.46'}°, σ: ${(appState.data.residual_stats ? appState.data.residual_stats.high.std_dev * conv : 5.67).toFixed(2)}°)`,
          data: highCounts,
          backgroundColor: 'rgba(255, 111, 0, 0.75)',
          borderColor: '#ff8f00',
          borderWidth: 1.5
        },
        {
          label: `Low Temp Residuals (Mean: +${appState.data.residual_stats ? (appState.data.residual_stats.low.mean * conv).toFixed(2) : '2.26'}°, σ: ${(appState.data.residual_stats ? appState.data.residual_stats.low.std_dev * conv : 4.19).toFixed(2)}°)`,
          data: lowCounts,
          backgroundColor: 'rgba(124, 77, 255, 0.75)',
          borderColor: '#b388ff',
          borderWidth: 1.5
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } },
        tooltip: {
          callbacks: {
            title: (items) => `Residual Bin: ${items[0].label}`,
            label: (items) => `${items.dataset.label}: ${items.parsed.y} days`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: `Deviation from Historical Normal (°${appState.unit})`, color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        },
        y: {
          title: { display: true, text: 'Number of Days', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot: Daily Rainfall & 7-Day Rolling Average Rate
// --------------------------------------------------------------------------
function renderPrecipDailyChart() {
  const canvas = document.getElementById('precip-daily-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const obs = appState.data.observations;

  const dateLabels = obs.map(o => formatDateLabel(o.date));
  const dailyObs = obs.map(o => o.observed_precip_in);
  const dailyAvg = obs.map(o => o.avg_precip_in);
  const roll7Avg = calcRollingAverage(dailyObs, 7);

  if (charts.precipDaily) {
    charts.precipDaily.destroy();
  }

  charts.precipDaily = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: dateLabels,
      datasets: [
        {
          type: 'line',
          label: '7-Day Rolling Avg Rate (in/day)',
          data: roll7Avg,
          borderColor: '#00b0ff',
          backgroundColor: 'transparent',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          type: 'line',
          label: '10-Yr Baseline Daily Normal (in/day)',
          data: dailyAvg,
          borderColor: '#ffb74d',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.3,
          yAxisID: 'y'
        },
        {
          type: 'bar',
          label: 'Observed Daily Rainfall (in/day)',
          data: dailyObs,
          backgroundColor: 'rgba(41, 182, 246, 0.4)',
          borderColor: 'rgba(41, 182, 246, 0.7)',
          borderWidth: 1,
          yAxisID: 'y'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
        tooltip: {
          callbacks: {
            label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(3)} in/day`
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'Daily Rate (inches/day)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' },
          beginAtZero: true
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot: Cumulative Rainfall Trajectory
// --------------------------------------------------------------------------
function renderPrecipCumChart() {
  const canvas = document.getElementById('precip-cum-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const obs = appState.data.observations;

  const dateLabels = obs.map(o => formatDateLabel(o.date));
  const cumObs = obs.map(o => o.cum_observed_precip_in);
  const cumNorm = obs.map(o => o.cum_avg_precip_in);

  if (charts.precipCum) {
    charts.precipCum.destroy();
  }

  charts.precipCum = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dateLabels,
      datasets: [
        {
          label: 'Observed Accumulated Rainfall (in)',
          data: cumObs,
          borderColor: '#0288d1',
          backgroundColor: 'rgba(2, 136, 209, 0.15)',
          fill: true,
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.2
        },
        {
          label: '10-Yr Baseline Normal Cumulative (in)',
          data: cumNorm,
          borderColor: '#ffb74d',
          borderDash: [5, 5],
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          pointRadius: 0,
          tension: 0.2
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 11 } } },
        tooltip: {
          callbacks: {
            title: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              return `${obs[idx].date} (${dateLabels[idx]})`;
            },
            label: (c) => `${c.dataset.label}: ${c.parsed.y.toFixed(2)} in`,
            afterBody: (items) => {
              if (!items.length) return '';
              const idx = items[0].dataIndex;
              const diff = (cumObs[idx] - cumNorm[idx]).toFixed(2);
              const sign = diff >= 0 ? '+' : '';
              return `Anomaly to Date: ${sign}${diff} in (${diff >= 0 ? 'Surplus' : 'Deficit'})`;
            }
          }
        }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 10 }
        },
        y: {
          title: { display: true, text: 'Accumulated Rainfall (inches)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' },
          beginAtZero: true
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot 2: Sun Up Time vs Average Temperature & Interactive Lag
// --------------------------------------------------------------------------
function updateSunTempLagChart() {
  const canvas = document.getElementById('sun-temp-lag-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const normals = appState.data.climate_normals;

  const dates = Object.keys(normals).filter(d => d !== '02-29').sort();
  const n = dates.length;

  const originalDaylight = dates.map(d => normals[d].avg_daylight_hrs);
  const avgMeanTemp = dates.map(d => appState.unit === 'C' ? fToC(normals[d].avg_mean) : normals[d].avg_mean);

  const lag = appState.currentLagDays;
  const shiftedDaylight = dates.map((_, i) => {
    const shiftedIdx = (i - lag + n) % n;
    return originalDaylight[shiftedIdx];
  });

  if (charts.sunTempLag) {
    charts.sunTempLag.destroy();
  }

  charts.sunTempLag = new Chart(ctx, {
    type: 'line',
    data: {
      labels: dates.map(d => formatDateLabel(`2026-${d}`)),
      datasets: [
        {
          label: `Daylight Duration (Sun Up Time, Hours) [Shifted +${lag}d]`,
          data: shiftedDaylight,
          borderColor: '#fbc02d',
          backgroundColor: 'rgba(251, 192, 45, 0.15)',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'ySun'
        },
        {
          label: `Daily Average Temperature (°${appState.unit})`,
          data: avgMeanTemp,
          borderColor: '#26a69a',
          backgroundColor: 'rgba(38, 166, 154, 0.15)',
          borderWidth: 3,
          pointRadius: 0,
          tension: 0.4,
          yAxisID: 'yTemp'
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: 'index', intersect: false },
      plugins: {
        legend: { labels: { color: '#94a3b8', font: { family: 'Inter', size: 12 } } }
      },
      scales: {
        x: {
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b', maxTicksLimit: 12 }
        },
        ySun: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: 'Daylight Duration (Hours)', color: '#fbc02d' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#fbc02d' },
          min: 8,
          max: 17
        },
        yTemp: {
          type: 'linear',
          position: 'right',
          title: { display: true, text: `Daily Mean Temp (°${appState.unit})`, color: '#26a69a' },
          grid: { drawOnChartArea: false },
          ticks: { color: '#26a69a' }
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot 3: Cross-Correlation Spectrum R(tau)
// --------------------------------------------------------------------------
function renderCrossCorrChart() {
  const canvas = document.getElementById('cross-corr-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const crossData = appState.data.cross_correlation;

  const lags = crossData.map(c => c.lag_days);
  const rValues = crossData.map(c => c.r);
  const pointColors = crossData.map(c => c.lag_days === appState.data.best_lag_days ? '#ff7043' : 'transparent');
  const pointRadii = crossData.map(c => c.lag_days === appState.data.best_lag_days ? 6 : 0);

  if (charts.crossCorr) {
    charts.crossCorr.destroy();
  }

  charts.crossCorr = new Chart(ctx, {
    type: 'line',
    data: {
      labels: lags,
      datasets: [{
        label: 'Correlation r',
        data: rValues,
        borderColor: '#3b82f6',
        borderWidth: 2,
        pointBackgroundColor: pointColors,
        pointBorderColor: pointColors,
        pointRadius: pointRadii,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => `Lag Offset: ${items[0].label} Days`,
            label: (items) => `Correlation r: ${items.parsed.y.toFixed(4)}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Lag Shift (Days)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        },
        y: {
          title: { display: true, text: 'Correlation r', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' },
          min: 0.5,
          max: 1.0
        }
      }
    }
  });
}

// --------------------------------------------------------------------------
// Plot 4: Hysteresis Loop Scatter
// --------------------------------------------------------------------------
function renderHysteresisChart() {
  const canvas = document.getElementById('hysteresis-chart');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const normals = appState.data.climate_normals;
  const dates = Object.keys(normals).filter(d => d !== '02-29').sort();

  const points = dates.map(d => ({
    x: normals[d].avg_daylight_hrs,
    y: appState.unit === 'C' ? fToC(normals[d].avg_mean) : normals[d].avg_mean,
    date: d
  }));

  if (charts.hysteresis) {
    charts.hysteresis.destroy();
  }

  charts.hysteresis = new Chart(ctx, {
    type: 'scatter',
    data: {
      datasets: [{
        label: 'Annual Cycle (Daylight vs Temp)',
        data: points,
        borderColor: 'rgba(255, 112, 67, 0.6)',
        backgroundColor: 'rgba(255, 112, 67, 0.8)',
        showLine: true,
        borderWidth: 1.5,
        pointRadius: 2,
        pointHoverRadius: 5,
        tension: 0.2
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: (items) => formatDateLabel(`2026-${items[0].raw.date}`),
            label: (item) => `Daylight: ${item.raw.x} hrs, Temp: ${item.raw.y.toFixed(1)}°${appState.unit}`
          }
        }
      },
      scales: {
        x: {
          title: { display: true, text: 'Daylight Duration (Hours)', color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        },
        y: {
          title: { display: true, text: `Daily Mean Temp (°${appState.unit})`, color: '#94a3b8' },
          grid: { color: 'rgba(255, 255, 255, 0.05)' },
          ticks: { color: '#64748b' }
        }
      }
    }
  });
}
