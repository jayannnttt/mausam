# Mausam Sense — Weather That Understands Your Day

An independent hackathon prototype that turns weather and pollution forecasts into
**personalized decisions**: the best time to go outside, farm rainfall planning, and
plain-language weather descriptions. Not affiliated with IMD or any government agency.

---

## Quick start

```bash
cd mausam-sense
npm install
npm run dev        # → http://localhost:5173
```

Other scripts:

```bash
npm run build      # type-check + production build to dist/
npm run preview    # serve the production build
npm test           # 51 unit tests (engines, data separation, render smoke)
```

No configuration is required. On first launch you get a 3-step onboarding
(location → interests → units), then the personalized dashboard. Everything is saved
in `localStorage` — no account, no server, no database.

## What's implemented

| Capability | Where | Notes |
|---|---|---|
| Personalized dashboard | `src/components/PersonalizedDashboard.tsx` | Card order follows your selected interests; toggling interests reorders live without changing the underlying observations |
| Current conditions + hourly strip + 7-day forecast | `CurrentWeatherCard.tsx` | Current values labelled as the model's *analysis hour*, clearly separated from forecast values |
| Official-style alerts | `WeatherAlertCard.tsx` | Always pinned high, never hidden by preferences; DEMO warnings carry a loud "NOT AN OFFICIAL BULLETIN" tag |
| **Outdoor Health Intelligence** | `ActivityPlanner.tsx` + `engines/recommendationEngine.ts` | Transparent 0–100 indicative score per hour (air quality, feels-like temperature, UV, rain, wind, humidity, active warnings); recommended window, "why this time?" reasoning, up to 3 comparable windows, real recharts charts |
| **Smart Farming Assistant** | `FarmingAssistant.tsx` + `engines/farmingEngine.ts` | 24/48/72 h rainfall totals, wet-spell detection, daily rain cards, rain-probability + daily-rainfall charts; general summaries kept strictly separate from official advisories |
| **Weather Feel Engine** | `WeatherFeelCard.tsx` + `engines/weatherFeelEngine.ts` | Plain-language labels ("Hot and humid", "Dry heat", "Cool and crisp", …) with every contributing measurement shown and missing variables disclosed, never fabricated |
| Commuting insights | `CommuteCard.tsx` + `engines/commuteEngine.ts` | Rain around commute hours, storms, fog/low visibility, severe heat |
| Settings & persistence | `ProfilePreferences.tsx`, `state/preferencesContext.tsx` | Interests, °C/°F, wind units, 12/24 h, heightened AQ awareness, data mode |
| Onboarding | `Onboarding.tsx` | City search (or manual coordinates), interests, preferences |

## API integrations (actually tested from this environment)

| Provider | Status | Details |
|---|---|---|
| **Open-Meteo Forecast API** | ✅ Tested live — working | Current analysis + hourly (temperature, feels-like, humidity, precipitation probability, precipitation, wind, UV, visibility, weather code) + 7-day daily. Keyless. |
| **Open-Meteo Air Quality API** | ✅ Tested live — working | PM2.5, PM10, ozone, NO₂, US EPA AQI, European AQI. Values are **CAMS model estimates**; US/EU AQI conversions are labelled with their methodology and are **never** presented as India's CPCB AQI. |
| **Open-Meteo Geocoding API** | ✅ Tested live — working | City search for the location selector. |
| **IMD public API** (`api.imd.gov.in/api/v1/…`) | ⚠️ Verified blocked without a key | Every documented endpoint (`districtwarning`, `cityforecast`, `districtrainfall`, …) returns `401 {"error":"API key missing"}` unless IMD issues a key. `src/services/imdService.ts` implements the real adapter (key + district id via env vars, defensive parsing) and otherwise reports an honest "official warnings unavailable" state. **No warnings are ever invented.** |

Data flow: `services/*` fetch and normalize into `WeatherDataset`
(`src/types/weather.ts`) → engines compute insights → components render.
`services/dataOrchestrator.ts` owns the LIVE / DEMO / UNAVAILABLE state machine.

## Demo mode & offline fallback

- Demo fixtures for **Chennai, Bengaluru, Thanjavur** live only in
  `src/services/demoDataService.ts` (synthetic, coherent diurnal curves).
- Every demo dataset is `mode: "DEMO"`; every demo warning/advisory carries
  `isDemo: true` and renders with a DEMO banner. Live and demo values are never
  mixed in one dataset (enforced by tests in `src/services/dataSeparation.test.ts`).
- If live fetching fails in Auto mode, fixture cities fall back to demo with an
  explicit reason; other cities show an UNAVAILABLE card with retry and a
  "switch to demo" action.
- Use the **Auto / Live / Demo** toggle in the header, or Settings → Data mode.

## Environment variables

See `.env.example`. Only IMD integration needs anything, and it is optional:

```
VITE_IMD_API_KEY=        # only if IMD issues you a key
VITE_IMD_DISTRICT_ID=    # numeric IMD district id for the warning endpoint
```

There are no other secrets; Open-Meteo is keyless. Note that any `VITE_`-prefixed
value is visible to end users — for a production deployment, proxy IMD through a
backend instead.

## Tests (51 passing)

```bash
npm test
```

- `engines/recommendationEngine.test.ts` — factor scoring, weight redistribution
  with missing data, warning penalties, activity-specific rankings, window dedupe.
- `engines/weatherFeelEngine.test.ts` — hot/humid vs dry heat vs cool/crisp,
  missing-variable honesty, feels-like fallback, disclaimer.
- `engines/farmingEngine.test.ts` — wet-spell detection, Thanjavur rain scenario,
  no-data handling, advisory separation.
- `services/dataSeparation.test.ts` — demo labelling, no-fixture refusal, live
  failure → demo fallback with reason, mocked live provider normalization with
  zero demo leakage.
- `smoke.test.tsx` — onboarding and dashboard component trees render without errors.

## Design notes

- React 18 + TypeScript + Vite + Tailwind CSS; `recharts` for real interactive
  charts; `lucide-react` for icons.
- Deep-navy palette with sky-blue and restrained amber accents; mobile-first
  responsive layout (single column → 5-column desktop grid).
- Accessibility: labelled controls, `aria-pressed`/`aria-expanded`, keyboard-navigable
  dialogs (Esc closes), visible focus rings, `prefers-reduced-motion` respected.

## Limitations (honest list)

1. **IMD warnings/advisories** need an issued API key; without one the app shows
   "official warnings not checked" instead of alerts. No verified
   agricultural-advisory endpoint exists in IMD's public reference, so official
   advisories are never fabricated.
2. The outdoor score is a **transparent heuristic**, not a validated model or a
   safety/medical guarantee. Pollutant values are model estimates, not monitoring-station
   readings. The UI says so everywhere it matters.
3. AQI shown is US EPA / European (CAMS-based) with explicit methodology labels;
   India's CPCB National AQI is **not** substituted.
4. Demo fixtures assume the demo city's timezone matches for hour alignment and
   cover 3 cities only.
5. The production bundle is ~680 kB (mostly recharts); code-splitting was not a
   priority for the prototype.
6. UV/visibility come from the forecast model only; no separate sunrise/sunset or
   fog model is used.
