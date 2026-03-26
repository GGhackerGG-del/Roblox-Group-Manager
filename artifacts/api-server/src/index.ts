import { createServer } from "http";
import app from "./app";
import "./bot";
import { setupSignaling } from "./signaling";

const port = Number(process.env["PORT"] || (process.env["NODE_ENV"] === "production" ? "3000" : "8080"));

const server = createServer(app);
setupSignaling(server);

server.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});
