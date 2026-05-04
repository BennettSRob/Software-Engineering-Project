/**
 * WeatherApp -- CS445 (Oscar Franklin & Bennett Roberts)
 *
 * Express server that:
 *   - Serves the static frontend from /public
 *   - Exposes GET /api/weather?q=<city|zip> which makes three sequential
 *     OpenWeatherMap calls: current weather, 5-day forecast, alerts.
 */

require('dotenv').config();
const path = require('path');
const express = require('express');

const app = express();
const PORT = process.env.PORT || 3000;
const API_KEY = process.env.WEATHER_API_KEY;
const TIMEOUT_MS = Number(process.env.API_TIMEOUT_MS || 5000);
const BASE_URL = 'https://api.openweathermap.org';

// SRS NFR-5: API key must come from the environment.
if (!API_KEY) {
  console.error('ERROR: WEATHER_API_KEY is not set. Add it to .env and restart.');
  process.exit(1);
}

// ---------- middleware ---------------------------------------------------

app.use(express.json());
app.use(express.static(path.join(__dirname, '..', 'public')));

// ---------- helpers ------------------------------------------------------

/** Returns true if `q` looks like a 5-digit US zip code. */
function isZip(q) {
  return /^\d{5}$/.test(q);
}

/** fetch with a hard timeout. Returns parsed JSON or throws an APIError-shaped object. */
async function fetchJSON(url) {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: controller.signal });
    if (!res.ok) {
      const err = new Error(`Upstream ${res.status}`);
      err.statusCode = res.status;
      err.isTimeout = false;
      throw err;
    }
    return await res.json();
  } catch (e) {
    if (e.name === 'AbortError') {
      const err = new Error('Upstream timeout');
      err.statusCode = 503;
      err.isTimeout = true;
      throw err;
    }
    if (!e.statusCode) {
      e.statusCode = 502;
      e.isTimeout = false;
    }
    throw e;
  } finally {
    clearTimeout(t);
  }
}

/**
 * Build the three OpenWeatherMap URLs.
 * SRS calls for exactly three sequential calls: current, forecast, alerts.
 * The current and forecast endpoints accept q/zip directly, and the current
 * response contains coord.lat/lon which we reuse for the alerts (One Call) URL.
 */
function locationParam(q) {
  return isZip(q) ? `zip=${encodeURIComponent(q)},US` : `q=${encodeURIComponent(q)}`;
}
function buildCurrentURL(q) {
  return `${BASE_URL}/data/2.5/weather?${locationParam(q)}&units=metric&appid=${API_KEY}`;
}
function buildForecastURL(q) {
  return `${BASE_URL}/data/2.5/forecast?${locationParam(q)}&units=metric&appid=${API_KEY}`;
}
function buildAlertsURL(lat, lon) {
  // One Call 3.0 -- alerts live here. Free tier allows 1000 calls/day after sign-up.
  return `${BASE_URL}/data/3.0/onecall?lat=${lat}&lon=${lon}&exclude=minutely,hourly,daily,current&units=metric&appid=${API_KEY}`;
}

/** Reduce 3-hour forecast list (40 items) to 5 daily summaries. */
function summarizeForecast(list) {
  const byDay = {};
  for (const item of list) {
    const day = item.dt_txt.slice(0, 10);
    if (!byDay[day]) byDay[day] = { highs: [], lows: [], items: [] };
    byDay[day].highs.push(item.main.temp_max);
    byDay[day].lows.push(item.main.temp_min);
    byDay[day].items.push(item);
  }
  return Object.entries(byDay)
    .slice(0, 5)
    .map(([date, d]) => {
      // pick the noon-ish item for icon/description
      const noon = d.items.find(i => i.dt_txt.endsWith('12:00:00')) || d.items[0];
      return {
        date,
        high: Math.max(...d.highs),
        low: Math.min(...d.lows),
        icon: noon.weather[0].icon,
        description: noon.weather[0].description,
      };
    });
}

/** Crude severity classifier from event text. SRS uses WARNING/WATCH/ADVISORY. */
function classifySeverity(event) {
  const e = (event || '').toLowerCase();
  if (e.includes('warning')) return 'WARNING';
  if (e.includes('watch')) return 'WATCH';
  return 'ADVISORY';
}

// ---------- routes -------------------------------------------------------

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
});

app.get('/api/weather', async (req, res) => {
  const q = (req.query.q || '').trim();

  // SRS REQ-10 / business rule: city >= 2 chars OR zip == 5 digits
  if (!q || (!isZip(q) && q.length < 2)) {
    return res.status(400).json({
      error: 'Invalid query',
      message: 'Enter a city (>=2 chars) or 5-digit ZIP.',
    });
  }

  try {
    // SRS-mandated three sequential calls:
    //   1) current weather    2) 5-day forecast    3) alerts (One Call 3.0)
    const current = await fetchJSON(buildCurrentURL(q));
    const forecast = await fetchJSON(buildForecastURL(q));

    // alerts are best-effort: One Call 3.0 needs the (free-tier) subscription.
    // If it 401s or 403s, we just return [] so the rest of the UI still works.
    let alerts = [];
    try {
      const oc = await fetchJSON(buildAlertsURL(current.coord.lat, current.coord.lon));
      alerts = (oc.alerts || []).map(a => ({
        senderName: a.sender_name,
        event: a.event,
        start: a.start,
        end: a.end,
        description: a.description,
        severity: classifySeverity(a.event),
      }));
    } catch (alertErr) {
      console.warn('[alerts] suppressed:', alertErr.statusCode, alertErr.message);
    }

    const placeLabel = `${current.name}${current.sys && current.sys.country ? ', ' + current.sys.country : ''}`;
    res.json({
      location: placeLabel,
      current: {
        temperature: current.main.temp,
        feelsLike: current.main.feels_like,
        description: current.weather[0].description,
        icon: current.weather[0].icon,
        humidity: current.main.humidity,
        windSpeed: current.wind.speed,
      },
      forecast: summarizeForecast(forecast.list),
      alerts,
      timestamp: new Date().toISOString(),
    });
  } catch (e) {
    console.error('[/api/weather]', e.statusCode, e.message);
    if (e.isTimeout) {
      return res.status(503).json({ error: 'Timeout', message: 'Service temporarily unavailable.' });
    }
    if (e.statusCode === 404) {
      return res.status(404).json({ error: 'Not found', message: 'Location not found. Please try again.' });
    }
    if (e.statusCode === 401) {
      return res.status(401).json({
        error: 'Invalid API key',
        message: 'OpenWeatherMap rejected the API key. Check WEATHER_API_KEY in .env.',
      });
    }
    res.status(502).json({ error: 'Upstream error', message: 'Could not reach weather service.' });
  }
});

app.listen(PORT, () => {
  console.log(`WeatherApp listening on http://localhost:${PORT}`);
});
