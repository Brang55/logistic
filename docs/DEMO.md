# Client demo script (about 10 minutes)

Covers every module once: live fleet, load board import, truck-aware dispatch, the driver app with
voice, and traffic alerts. Times assume `SIMULATOR_SPEEDUP=30`.

## Before the demo

1. Reset the data and restart the API so the simulator starts fresh:
   - Local: `cd server && npm run demo:reset -- --yes`, then restart `npm run start:dev`.
   - Server: `docker compose --env-file .env.production -f docker-compose.prod.yml exec api node dist/db/demo-reset.js --yes`
     then `... restart api` (needs `ALLOW_DEMO_RESET=true` and `TELEMATICS_PROVIDER=simulator`).
2. Open two browser windows:
   - **Dispatcher**: normal window, log in as `dispatcher@demo.logistic` (or your admin account).
   - **Driver**: a private/incognito window (or a phone), log in as `g.petrov@demo.logistic`.
     Voice input needs Chrome, Edge or Safari, and HTTPS (or localhost).
   Demo password for the demo accounts: `demo12345`.

## 1. Dashboard (1 min)

- Two trucks are already on the road; loads waiting for a truck; nothing delayed yet.
- **Needs attention** shows "Imported 4 booked loads": loads the company booked on the (demo) EU and US
  freight exchanges were pulled in automatically.

## 2. Live Fleet (2 min)

- Every truck with its heading; **TR-103** is driving from Munich to its Milan pickup and **US-201** is on
  Dallas → Chicago. Parked trucks report a heartbeat, so they show as *Stopped*, not offline.
- Click **TR-103** → specs, live speed, 24-hour track, *Follow on map*.
- Scroll to **Suggested next pickups**: loads ranked by drive time from where TR-103 will be free.

## 3. Load Board (1 min)

- Filter **Europe** + **Reefer**. Each load shows rate, rate per km and the nearest free truck.
- **Import** "Rotterdam → Prague"; the button turns into *Imported · open in Dispatch*.

## 4. Dispatch with truck restrictions (2 min)

- Open **Dispatch**, select **Sofia → Munich** (Electronics, pickup in central Sofia).
- Truck list is sorted by distance to the pickup. Choose **TR-101 (Volvo FH16, 40 t)**:
  the panel lists a *weight limit 3.5 t* restriction and the restricted road is drawn in red.
- Switch to **TR-106 (Sprinter, 3.5 t)**: the same route comes back clean.
  (Mapbox flags restricted roads but does not always detour around them; that is the point to explain.)
- Pick **TR-101**, driver **Georgi Petrov**, any trailer → **Assign**. The truck starts driving within ~15 s.

## 5. Driver app (2 min, driver window)

- **My Trip** now shows *Next: pickup – Sofia*, ETA, shipper contact with tap-to-call, the route and directions.
- Voice (tap the mic, or type): *"I'll be 20 minutes late, the loading dock is busy"* → the app reads back
  the delay → **Confirm**. In the dispatcher window the alert appears immediately (Dashboard / Traffic).
- *"Set the delivery destination to BMW Plant Munich"* → **Confirm** → dispatch gets an *address changed* alert.
- **Confirm pickup** (tap twice).

## 6. Traffic (1 min, dispatcher window)

- Each active trip with the time to its next stop, delay caused by traffic, incidents on the way and any
  delay the driver reported. The monitor re-checks every 5 minutes and raises alerts for growing delays,
  closures and major incidents.

## Talking points

- GPS comes from the trucks' telematics through a webhook (simulated here); Samsara, Geotab, Motive or
  Webfleet adapters plug into the same interface.
- Load boards (DAT, Truckstop, Timocom, Trans.eu) plug in behind the same interface once API access exists.
- Truck routing uses height, width and weight limits from Mapbox; for full HGV rules (axle loads, hazmat
  tunnel codes, truck bans) a truck-specialised router such as HERE can replace it without UI changes.
