# Doctor Slot Booking API

Built with Node.js, Express and MongoDB. Requires Node.js 22+ and a running MongoDB server.

## Run

```powershell
npm ci
Copy-Item .env.example .env
npm start
```

Edit an existing `.env` instead of overwriting it. The API runs at `http://127.0.0.1:3000`.

Copy `.env.example` to `.env` for your local settings. Keep `.env` out of Git because connection strings can contain passwords. The defaults use MongoDB on port 27017 and the `voiceoc_assessment` database.

## Test

```powershell
npm ci  # Install dependencies before the first test run
npm test
```

The six tests cover bookings, retries, slot conflicts and invalid input. MongoDB must be running; the tests start their own HTTP server and clean up a separate test database afterward.

## API

`POST /api/appointments/book` accepts `requestId`, `patientPhone`, `doctorId` and an ISO `slotTime` with timezone.

Returns: **201** new booking, **200** matching retry, **409** conflict, **400** invalid input, **413** oversized body, **500** server error.

The unique `requestId` index provides idempotency: repeating the same request returns the original booking. A separate unique doctor/time index prevents double booking. See `SOLUTION.md` for the explanation and `test/appointments.test.js` for test cases.

Exclude `.env` and `node_modules` from the submission ZIP.
