const express = require("express");

const app = express();
const port = process.env.PORT || 3000;

app.get("/", (req, res) => {
  res.json({
    service: "service-b",
    message: "hello from service-b",
    timestamp: new Date().toISOString()
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

app.listen(port, () => {
  console.log(`service-b listening on ${port}`);
});
