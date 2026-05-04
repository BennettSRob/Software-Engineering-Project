# WeatherApp

CS445 -- Oscar Franklin and Bennett Roberts.

A small web app that searches OpenWeatherMap for current weather, a 5-day forecast, and any alerts for a city or ZIP. Includes a Celsius/Fahrenheit toggle.

## Stack

Node.js + Express on the back end. Plain HTML, CSS, and JavaScript on the front end.

## Setup

1. Install dependencies:
   ```
   npm install
   ```
2. Open `.env` and paste your OpenWeatherMap key into the `WEATHER_API_KEY=` line.
3. Run:
   ```
   npm start
   ```
4. Open http://localhost:3000 in a browser.

## Files

- `server/server.js` - Express server and `/api/weather` route
- `public/index.html` - page layout
- `public/styles.css` - styles
- `public/app.js` - search, render, unit toggle
- `.env` - your API key (not committed)
- `.gitignore` - keeps `.env` and `node_modules` out of git

## Endpoints

- `GET /api/health` - returns ok
- `GET /api/weather?q=<city or 5-digit ZIP>` - returns weather JSON
