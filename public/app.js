/**
 * WeatherApp frontend — CS445
 *
 * Implements the SRS use cases:
 *   - Search by city (>=2 chars) or 5-digit ZIP
 *   - Render current weather card, 5-day forecast, and color-coded alert banner
 *   - Toggle °C/°F (disabled until data is loaded)
 */

(() => {
  'use strict';

  // ---------- state -----------------------------------------------------
  let currentUnit = 'C';     // 'C' or 'F'
  let weatherData = null;    // last successful payload from /api/weather

  // ---------- element refs ---------------------------------------------
  const $ = (id) => document.getElementById(id);
  const els = {
    form:      $('search-form'),
    input:     $('search-input'),
    searchErr: $('search-error'),
    loader:    $('loader'),
    apiErr:    $('api-error'),
    empty:     $('empty-state'),
    alerts:    $('alerts'),
    card:      $('weather-card'),
    forecast:  $('forecast'),
    forecastGrid: $('forecast-grid'),
    unitC: $('unit-c'),
    unitF: $('unit-f'),
    wc: {
      location: $('wc-location'),
      updated:  $('wc-updated'),
      icon:     $('wc-icon'),
      temp:     $('wc-temp'),
      feels:    $('wc-feels'),
      desc:     $('wc-desc'),
      humidity: $('wc-humidity'),
      wind:     $('wc-wind'),
    }
  };

  // ---------- validation (per SRS) -------------------------------------
  function validateQuery(q) {
    q = (q || '').trim();
    if (!q) return 'Please enter a city or ZIP.';
    if (/^\d/.test(q) && !/^\d{5}$/.test(q)) return 'ZIP must be exactly 5 digits.';
    if (!/^\d/.test(q) && q.length < 2) return 'City must be at least 2 characters.';
    return null;
  }

  // ---------- unit conversion ------------------------------------------
  // Stored values are always Celsius (server returns metric).
  const cToF = (c) => (c * 9) / 5 + 32;
  function displayTemp(celsius) {
    const v = currentUnit === 'C' ? celsius : cToF(celsius);
    return `${Math.round(v)}°${currentUnit}`;
  }

  // ---------- icon helpers ---------------------------------------------
  // OpenWeatherMap icons live at https://openweathermap.org/img/wn/<id>@2x.png
  const iconURL = (id) => `https://openweathermap.org/img/wn/${id}@2x.png`;

  // ---------- search flow ----------------------------------------------
  async function onSearch(e) {
    e.preventDefault();
    const q = els.input.value;
    const err = validateQuery(q);
    showSearchError(err);
    if (err) return;

    showLoader(true);
    showApiError(null);
    try {
      const res = await fetch(`/api/weather?q=${encodeURIComponent(q.trim())}`);
      const data = await res.json();
      if (!res.ok) {
        showApiError(data.message || 'Something went wrong.');
        return;
      }
      weatherData = data;
      render(data);
    } catch (e) {
      showApiError('Service temporarily unavailable.');
    } finally {
      showLoader(false);
    }
  }

  function render(data) {
    els.empty.hidden = true;

    // Current weather card
    els.wc.location.textContent = data.location;
    els.wc.updated.textContent = `Last updated ${new Date(data.timestamp).toLocaleTimeString()}`;
    els.wc.icon.src = iconURL(data.current.icon);
    els.wc.icon.alt = data.current.description;
    els.wc.temp.textContent = displayTemp(data.current.temperature);
    els.wc.feels.textContent = displayTemp(data.current.feelsLike);
    els.wc.desc.textContent = data.current.description;
    els.wc.humidity.textContent = data.current.humidity;
    els.wc.wind.textContent = data.current.windSpeed.toFixed(1);
    els.card.hidden = false;

    // Forecast
    els.forecastGrid.innerHTML = '';
    data.forecast.forEach((d) => {
      const div = document.createElement('div');
      div.className = 'forecast-day';
      div.innerHTML = `
        <div class="date">${formatDate(d.date)}</div>
        <img src="${iconURL(d.icon)}" alt="${d.description}" />
        <div class="temps">
          <span class="high">${displayTemp(d.high)}</span>
          <span class="low">${displayTemp(d.low)}</span>
        </div>
        <div class="muted">${d.description}</div>
      `;
      els.forecastGrid.appendChild(div);
    });
    els.forecast.hidden = false;

    // Alerts
    renderAlerts(data.alerts || []);

    // Enable unit toggle now that data exists
    els.unitC.disabled = false;
    els.unitF.disabled = false;
  }

  function renderAlerts(alerts) {
    els.alerts.innerHTML = '';
    if (!alerts.length) {
      els.alerts.hidden = true;
      return;
    }
    alerts.forEach((a) => {
      const div = document.createElement('div');
      const sev = (a.severity || 'ADVISORY').toLowerCase();
      div.className = `alert ${sev}`;
      div.innerHTML = `
        <h4>${escapeHTML(a.event)} <span class="muted">(${escapeHTML(a.severity)})</span></h4>
        <div class="muted">From ${escapeHTML(a.senderName || 'Unknown')}</div>
        <p>${escapeHTML(a.description || '')}</p>
      `;
      els.alerts.appendChild(div);
    });
    els.alerts.hidden = false;
  }

  function formatDate(iso) {
    const d = new Date(iso + 'T00:00:00');
    return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
  }

  function escapeHTML(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[c]);
  }

  // ---------- unit toggle ----------------------------------------------
  function setUnit(unit) {
    if (!weatherData) return;       // SRS: button does nothing if no data
    if (unit === currentUnit) return;
    currentUnit = unit;
    els.unitC.classList.toggle('active', unit === 'C');
    els.unitF.classList.toggle('active', unit === 'F');
    els.unitC.setAttribute('aria-pressed', unit === 'C');
    els.unitF.setAttribute('aria-pressed', unit === 'F');
    render(weatherData);
  }

  // ---------- UI helpers -----------------------------------------------
  function showSearchError(msg) {
    els.searchErr.textContent = msg || '';
    els.searchErr.hidden = !msg;
  }
  function showApiError(msg) {
    els.apiErr.textContent = msg || '';
    els.apiErr.hidden = !msg;
  }
  function showLoader(on) {
    els.loader.hidden = !on;
  }

  // ---------- wire up ---------------------------------------------------
  els.form.addEventListener('submit', onSearch);
  els.unitC.addEventListener('click', () => setUnit('C'));
  els.unitF.addEventListener('click', () => setUnit('F'));
  // start with toggles disabled until first successful search
  els.unitC.disabled = true;
  els.unitF.disabled = true;
})();
