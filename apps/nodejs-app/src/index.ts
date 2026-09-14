import express from "express";

const app = express();
const port = 4999;
import { logs } from "@opentelemetry/api-logs";

/**
 *  We dun need that as we are doing global metrics
 */
// import { metrics } from "@opentelemetry/api";
// const meter = metrics.getMeter("nodejs-app");
// const pingCounter = meter.createCounter("ping_requests_from_node_total", {
// description: "Number of requests to /hello",
// });


const logger = logs.getLogger("nodejs-app");

app.get("/ping",(req,res) => {
 
    // pingCounter.add(1);

    logger.emit({
        severityText: "INFO",
        body: "GET /ping",
    });
    res.json({
        message:"pong! pong! pong!"
    })
})


app.get("/users", (_req, res) => {

logger.emit({
    severityText: "INFO",
    body: "GET /users",
});
  res.json({
    users: [],
  });
});

app.get("/orders", (_req, res) => {

logger.emit({
    severityText: "INFO",
    body: "GET /orders",
});
  res.json({
    orders: [],
  });
});

app.listen(port,() =>{
    console.log(`Server running at http://localhost:${port}`);
})