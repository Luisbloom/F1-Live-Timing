# F1 Live Timing

Live timing dashboard for Formula 1 sessions using the [OpenF1 API](https://openf1.org).

## Stack

- React + TypeScript + Vite
- OpenF1 API (free, real-time, no auth needed)

## Features planned

- [ ] Live driver standings & gaps
- [ ] Lap times per driver
- [ ] Tyre compounds & stint info
- [ ] Race control messages (flags, SC, VSC)
- [ ] Weather data
- [ ] Track map with live car positions

## Setup

```bash
npm install
npm run dev
```

## How it works

During a live session, the app polls OpenF1 every 3 seconds to get updated positions, lap times, and telemetry. Outside of a session it shows the last available session data.

## API reference

Base URL: `https://api.openf1.org/v1`

Key endpoints used:
- `/sessions` — session info
- `/drivers` — driver list
- `/position` — live positions
- `/laps` — lap times & sectors
- `/stints` — tyre data
- `/race_control` — flags & messages
- `/weather` — track conditions
