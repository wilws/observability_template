
import { NodeSDK } from "@opentelemetry/sdk-node";
import { getNodeAutoInstrumentations } from "@opentelemetry/auto-instrumentations-node";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";

import { resourceFromAttributes } from "@opentelemetry/resources";

import { ATTR_SERVICE_NAME } from "@opentelemetry/semantic-conventions";

import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";

import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import {
  BatchLogRecordProcessor,
} from "@opentelemetry/sdk-logs";


const resource = resourceFromAttributes({
    [ATTR_SERVICE_NAME]: "nodejs-app",
  })


/**
 *  Trace Setup
*/

// OTLPTraceExporter is responsible for sending your traces somewhere.
const traceExporter = new OTLPTraceExporter({
  url: "http://localhost:4318/v1/traces",
});


/**
 *  Metric Setup
 */
const metricExporter = new OTLPMetricExporter({
  url: "http://localhost:4318/v1/metrics",
});

const metricReader = new PeriodicExportingMetricReader({
  exporter: metricExporter,
  exportIntervalMillis: 5000,
});

/**
 *  Logging Setup
 */
const logExporter = new OTLPLogExporter({
  url: "http://localhost:4318/v1/logs",
});




// NodeSDK is essentially the main OpenTelemetry configuration for your Node.js application.
// ATTR_SERVICE_NAME is a predefined OpenTelemetry constant.
const sdk = new NodeSDK({

  resource,
  traceExporter,
  metricReader,
  logRecordProcessors: [
    new BatchLogRecordProcessor({
      exporter: logExporter,
    })
  ],

  // Automatically instrument supported Node.js libraries.
  // Without auto-instrumentation, you'd have to manually create spans everywhere.
  instrumentations: [
    getNodeAutoInstrumentations(),
  ],
});


sdk.start();


console.log("OpenTelemetry started");



// without instrumentation you might need:

// const tracer = trace.getTracer("my-app");

// app.get("/users", async (req, res) => {
//   const span = tracer.startSpan("GET /users");

//   // ...

//   span.end();
// });