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
   - **Driver**: a private/incognito window (or a phone), log in as `j.carter@demo.logistic`.
     Voice input needs Chrome, Edge or Safari, and HTTPS (or localhost).
   Demo password for the demo accounts: `demo12345`.
3. Check that `TOMTOM_API_KEY` is set: the API log says `Routing with TomTom (truck)`.

## 1. Dashboard (1 min)

- Two trucks are already on the road; loads waiting for a truck; nothing delayed yet.
- **Needs attention** shows "Imported 4 booked loads": loads the company booked on the (demo) freight
  exchange were pulled in automatically.

## 2. Live Fleet (2 min)

- Every truck with its heading; **US-205** is on Atlanta → Orlando with frozen goods and **US-203** is on
  Los Angeles → Phoenix. Parked trucks report a heartbeat, so they show as *Stopped*, not offline.
- Click **US-205** → specs (13′ 6″ high, 80,000 lb, 5 axles), live speed in mph, 24-hour track, *Follow on map*.
- Scroll to **Suggested next pickups**: loads ranked by truck drive time from where US-205 will be free.

## 3. Load Board (1 min)

- Filter **Reefer**. Each load shows the rate, rate per mile and the nearest free truck.
- **Add to my loads** on "Chicago, IL → Columbus, OH"; the button turns into *Added · assign in Dispatch*.

## 4. Dispatch with truck routing (2 min)

- Open **Dispatch**, select **Dallas → Chicago** (plastic resin, 40,000 lb).
- The truck list is sorted by distance to the pickup. Choose **US-201 (Freightliner Cascadia, 80,000 lb, 5 axles)**:
  the route is calculated for that truck, so it avoids low clearances, weight-limited bridges and roads closed to trucks.
- Switch to **US-210 (Isuzu box truck, 14,500 lb)**: the route and ETA are recalculated for the smaller vehicle.
  A red *Truck restrictions* panel only appears when a restriction can't be avoided, e.g. a delivery inside a restricted zone.
- Pick **US-201**, driver **James Carter**, any trailer → **Assign**. The truck starts driving within ~15 s.

## 5. Driver app (2 min, driver window)

- **My Trip** now shows *Next: pickup – Dallas*, ETA, shipper contact with tap-to-call, the route and turn-by-turn directions in miles.
- Voice (tap the mic, or type): *"I'll be 20 minutes late, the loading dock is busy"* → the app reads back
  the delay → **Confirm**. In the dispatcher window the alert appears immediately (Dashboard / Traffic).
- *"Set the delivery destination to Walmart DC Joliet"* → **Confirm** → dispatch gets an *address changed* alert.
- **Confirm pickup**, then confirm in the dialog.

## 6. Traffic (1 min, dispatcher window)

- Each active trip with the time to its next stop, delay caused by traffic, incidents on the way and any
  delay the driver reported. The monitor re-checks every 5 minutes and raises alerts for growing delays,
  closures and major incidents.

## Talking points

- GPS comes from the trucks' telematics through a webhook (simulated here); Samsara, Geotab, Motive or
  Webfleet adapters plug into the same interface.
- Load boards (DAT, Truckstop) plug in behind the same interface once API access exists.
- Truck routing uses TomTom's truck mode with each truck's height, width, length, weight and axle count, plus live
  traffic. Hazmat classes can be added to the same request once loads record them.
