const express = require("express");
const client = require("prom-client");
const crypto = require("crypto");

const app = express();
const port = process.env.PORT || 3000;
const serviceBUrl = process.env.SERVICE_B_URL || "";

const register = new client.Registry();
client.collectDefaultMetrics({ register });

const httpRequestDurationMicroseconds = new client.Histogram({
  name: "http_request_duration_ms",
  help: "Duration of HTTP requests in ms",
  labelNames: ["route", "method", "status_code"],
  buckets: [50, 100, 200, 300, 400, 500, 1000, 2000]
});
register.registerMetric(httpRequestDurationMicroseconds);

app.use((req, res, next) => {
  const start = process.hrtime.bigint();
  const requestId = req.headers["x-request-id"] || crypto.randomUUID();
  res.setHeader("x-request-id", requestId);

  const end = httpRequestDurationMicroseconds.startTimer();
  res.on("finish", () => {
    const durationMs = Number(process.hrtime.bigint() - start) / 1e6;

    end({
      route: req.route ? req.route.path : req.path,
      method: req.method,
      status_code: res.statusCode
    });

    // Emit single-line JSON logs for easy Datadog parsing.
    console.log(
      JSON.stringify({
        level: "info",
        event: "http_request",
        request_id: requestId,
        method: req.method,
        path: req.path,
        status_code: res.statusCode,
        duration_ms: Number(durationMs.toFixed(2)),
        user_agent: req.headers["user-agent"] || "",
        timestamp: new Date().toISOString()
      })
    );
  });
  next();
});

app.get("/", (req, res) => {
  res.json({
    message: "Node app running on EKS with Helm + Argo CD",
    timestamp: new Date().toISOString()
  });
});

app.get("/healthz", (req, res) => {
  res.status(200).send("ok");
});

app.get("/call-service-b", async (req, res) => {
  if (!serviceBUrl) {
    return res.status(500).json({
      error: "SERVICE_B_URL is not configured"
    });
  }

  try {
    const response = await fetch(`${serviceBUrl}/healthz`, {
      headers: {
        "x-request-id": req.headers["x-request-id"] || crypto.randomUUID()
      }
    });

    const body = await response.text();

    return res.status(200).json({
      service_b_url: serviceBUrl,
      service_b_status: response.status,
      service_b_response: body
    });
  } catch (error) {
    return res.status(502).json({
      error: "failed to call service-b",
      details: error.message
    });
  }
});

app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

app.listen(port, () => {
  console.log(`Server listening on port ${port}`);
});
