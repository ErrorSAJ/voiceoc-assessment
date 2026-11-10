import { MongoClient } from "mongodb";
import { createApp } from "./app.js";

if (!process.env.MONGODB_URI) {
  throw new Error("MONGODB_URI is required");
}

const client = new MongoClient(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
await client.connect();

let app;
try {
  app = await createApp(client.db(process.env.MONGODB_DB || "voiceoc_assessment"));
} catch (error) {
  await client.close();
  throw error;
}

const server = app.listen(Number(process.env.PORT || 3000), "127.0.0.1", () => {
  console.log(`Server running on port ${server.address().port}`);
});

function shutdown() {
  server.close(async () => {
    await client.close();
    process.exit(0);
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
server.on("error", async (error) => {
  console.error("Server failed to start:", error.code);
  await client.close();
  process.exitCode = 1;
});
