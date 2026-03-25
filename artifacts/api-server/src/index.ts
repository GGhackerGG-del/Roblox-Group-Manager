import app from "./app";
import "./bot";

const port = Number(process.env["PORT"] || "8080");

app.listen(port, "0.0.0.0", () => {
  console.log(`Server listening on 0.0.0.0:${port}`);
});
