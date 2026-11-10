import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { once } from "node:events";
import { after, before, beforeEach, test } from "node:test";
import { MongoClient } from "mongodb";
import { createApp } from "../app.js";

let client;
let db;
let appointments;
let server;
let baseUrl;

const booking = {
  requestId: "req_abc123",
  patientPhone: "+19876543210",
  doctorId: "doc_101",
  slotTime: "2026-10-25T10:00:00Z",
};

async function post(payload) {
  const response = await fetch(`${baseUrl}/api/appointments/book`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  return { status: response.status, body: await response.json() };
}

before(async () => {
  client = new MongoClient(process.env.TEST_MONGODB_URI || "mongodb://127.0.0.1:27017", {
    serverSelectionTimeoutMS: 5000,
  });
  await client.connect();
  db = client.db(`voiceoc_test_${randomUUID().replaceAll("-", "")}`);
  appointments = db.collection("appointments");
  const app = await createApp(db);
  server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

beforeEach(async () => {
  await appointments.deleteMany({});
});

after(async () => {
  try {
    if (server) {
      await new Promise((resolve, reject) => {
        server.close((error) => error ? reject(error) : resolve());
      });
    }
    if (db) await db.dropDatabase();
  } finally {
    if (client) await client.close();
  }
});

test("book a slot and retry", async () => {
  const first = await post(booking);
  assert.equal(first.status, 201);
  assert.equal(first.body.appointment.status, "booked");
  assert.ok(first.body.appointment._id);

  const retry = await post(booking);
  assert.equal(retry.status, 200);
  assert.deepEqual(retry.body, first.body);
  assert.equal(await appointments.countDocuments(), 1);
});

test("handle repeated clicks", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => post(booking)));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 200).length, 19);
  assert.equal(new Set(results.map((result) => result.body.appointment._id)).size, 1);
  assert.equal(await appointments.countDocuments(), 1);
});

test("prevent double booking", async () => {
  const results = await Promise.all(Array.from({ length: 20 }, (_, index) => post({
    ...booking,
    requestId: `req_${index}`,
    patientPhone: `+1987654${String(index).padStart(4, "0")}`,
  })));
  assert.equal(results.filter((result) => result.status === 201).length, 1);
  assert.equal(results.filter((result) => result.status === 409).length, 19);
  assert.ok(results.filter((result) => result.status === 409)
    .every((result) => result.body.message.includes("reserved or booked")));
  assert.equal(await appointments.countDocuments(), 1);
});

test("reject reserved slots", async () => {
  await appointments.insertOne({
    ...booking,
    requestId: "reservation_1",
    slotTime: new Date(booking.slotTime),
    status: "reserved",
  });
  const result = await post(booking);
  assert.equal(result.status, 409);
  assert.match(result.body.message, /reserved or booked/);
  assert.equal(await appointments.countDocuments(), 1);
});

test("reject changed details on retry", async () => {
  const first = await post(booking);
  for (const change of [
    { patientPhone: "+19876543211" },
    { doctorId: "doc_202" },
    { slotTime: "2026-10-25T11:00:00Z" },
  ]) {
    const result = await post({ ...booking, ...change });
    assert.equal(result.status, 409);
    assert.match(result.body.message, /requestId/);
  }
  assert.deepEqual((await post(booking)).body, first.body);
  assert.equal(await appointments.countDocuments(), 1);
});

test("reject invalid input", async () => {
  for (const payload of [
    {},
    { ...booking, requestId: "" },
    { ...booking, doctorId: 123 },
    { ...booking, patientPhone: "invalid" },
    { ...booking, slotTime: "not-a-date" },
  ]) {
    assert.equal((await post(payload)).status, 400);
  }
  assert.equal(await appointments.countDocuments(), 0);
});
