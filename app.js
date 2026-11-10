import express from "express";

function parseBooking(body) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return null;

  const fields = ["requestId", "patientPhone", "doctorId", "slotTime"];
  if (fields.some((field) => typeof body[field] !== "string" || !body[field].trim())) {
    return null;
  }

  const requestId = body.requestId.trim();
  const patientPhone = body.patientPhone.trim();
  const doctorId = body.doctorId.trim();
  const time = body.slotTime.trim();
  const timestamp = /^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/;

  if (!/^\+[1-9]\d{1,14}$/.test(patientPhone) || !timestamp.test(time)) return null;

  const slotTime = new Date(time);
  const datePart = time.split("T")[0];
  const calendarDate = new Date(`${datePart}T00:00:00Z`);
  if (
    !Number.isFinite(slotTime.getTime()) ||
    !Number.isFinite(calendarDate.getTime()) ||
    calendarDate.toISOString().slice(0, 10) !== datePart
  ) {
    return null;
  }

  return { requestId, patientPhone, doctorId, slotTime };
}

function sameBooking(existing, booking) {
  return existing.patientPhone === booking.patientPhone &&
    existing.doctorId === booking.doctorId &&
    existing.slotTime.getTime() === booking.slotTime.getTime();
}

export async function createApp(db) {
  const appointments = db.collection("appointments");

  await appointments.createIndexes([
    { key: { requestId: 1 }, unique: true, name: "unique_request" },
    { key: { doctorId: 1, slotTime: 1 }, unique: true, name: "unique_doctor_slot" },
  ]);

  const app = express();
  app.use(express.json({ limit: "16kb" }));

  app.post("/api/appointments/book", async (req, res) => {
    const booking = parseBooking(req.body);
    if (!booking) {
      return res.status(400).json({
        message: "Provide requestId, patientPhone, doctorId and a valid ISO slotTime with timezone. Phone must include its country code.",
      });
    }

    const appointment = { ...booking, status: "booked", createdAt: new Date() };

    try {
      await appointments.insertOne(appointment);
      return res.status(201).json({ message: "Appointment confirmed", appointment });
    } catch (error) {
      if (error.code !== 11000) throw error;

      // A retry can conflict with either index, so check its request ID first.
      const existing = await appointments.findOne({ requestId: booking.requestId });
      if (existing) {
        if (!sameBooking(existing, booking)) {
          return res.status(409).json({ message: "requestId was already used for different booking details" });
        }
        return res.status(200).json({ message: "Appointment confirmed", appointment: existing });
      }

      return res.status(409).json({ message: "This doctor slot is already reserved or booked" });
    }
  });

  app.use((error, _req, res, _next) => {
    if (error.type === "entity.parse.failed") {
      return res.status(400).json({ message: "Invalid JSON body" });
    }
    if (error.type === "entity.too.large") {
      return res.status(413).json({ message: "Request body is too large" });
    }

    console.error("Booking request failed:", error.name);
    return res.status(500).json({ message: "Unable to book appointment. Please retry with the same requestId." });
  });

  return app;
}
