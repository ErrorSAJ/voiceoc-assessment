# Full-Stack Developer Technical Assessment

## Problem 1: Doctor Slot Booking

1. **Idempotency (repeated requests):** Repeated taps created duplicate writes, so `requestId` acts as an idempotency key with a unique MongoDB index, letting matching retries return the original booking with HTTP **200** and rejecting changed details with **409**.

2. **Reserved or booked slots:** Two patients could both see a slot as free before either booking was saved, so a unique `(doctorId, slotTime)` index now allows only one booking and returns HTTP **409** for the conflicting request.

3. **Free slots:** A valid request for a free slot is saved in MongoDB with status `booked`, and the API returns HTTP **201** with the booking ID and appointment details.
