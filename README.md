# Observability Template

A working reference setup for **traces, metrics and logs** across two services, collected by Grafana Alloy and stored in Prometheus, Loki and Tempo.

Built as a learning project: every piece is wired by hand rather than pulled from a preconfigured stack, so the connections between components are visible and editable.

---

## What this demonstrates

Two small services — one Django, one Express — instrumented with OpenTelemetry. Both emit all three signals over OTLP to a single collector, which fans them out to three purpose-built backends. Grafana reads all three.

```
  Django  (:8000)  ──┐                          ┌── Prometheus (:9090)   metrics
                     │                          │
                     ├──→  Alloy (:4318)  ─────→├── Loki       (:3100)   logs
                     │     OTLP receiver        │
  Express (:4999)  ──┘     + fan-out            └── Tempo      (:3200)   traces
                                                         │
                                                         ↓
                                                   Grafana (:3001)
```

The apps run natively on the host. Everything else runs in Docker Compose.

### Why a collector in the middle

Without Alloy, each service would need to know the address of every backend, and every service would change whenever a backend moved. With a collector, apps know one endpoint and the routing lives in one file.

It also gives you a place to batch, transform and sample telemetry before it reaches storage.

### Why three backends

The three signals have genuinely different shapes and costs. Metrics are small pre-aggregated numbers sampled on a timer; traces are detailed trees, often sampled; logs are high-volume text. They want different storage and different retention.

What ties them back together is shared context: every signal carries the same `trace_id` and the same resource attributes, so a metric alert can lead to a trace, and a trace to its log lines.

---

## Ports

| Service | Port | Runs in |
|---|---|---|
| Django | 8000 | host |
| Express | 4999 | host |
| Grafana | 3001 | Docker |
| Alloy — OTLP HTTP | 4318 | Docker |
| Alloy — UI | 12345 | Docker |
| Prometheus | 9090 | Docker |
| Loki | 3100 | Docker |
| Tempo | 3200 | Docker |

Grafana is mapped `3001:3000` — it listens on 3000 inside its container, remapped on the host to stay clear of other services.

---

## Setup

### 1. Start the backends

```bash
docker compose up -d
```

Five containers: Alloy, Prometheus, Loki, Tempo, Grafana. Loki takes about 30 seconds before it accepts writes — it holds a grace period after its ingester comes up.

Check everything is healthy:

```bash
curl localhost:9090/-/ready      # Prometheus
curl localhost:3100/ready        # Loki  — "ready" once the grace period passes
curl localhost:3200/ready        # Tempo
curl localhost:3001/api/health   # Grafana
curl localhost:12345/-/ready     # Alloy
```

Grafana is at **http://localhost:3001** (`admin` / `admin`). All three datasources are provisioned on boot — no manual setup.

### 2. Django service

Uses [uv](https://docs.astral.sh/uv/).

```bash
cd apps/django-app
uv venv
source .venv/bin/activate

uv pip install django \
  opentelemetry-sdk \
  opentelemetry-exporter-otlp-proto-http \
  opentelemetry-instrumentation-django

python manage.py runserver
```

Serves `GET /ping/` on port 8000. Python 3.11.

Dependencies are listed here rather than in a `pyproject.toml` — the venv is created with `uv venv` rather than managed as a uv project, so there is no lockfile.

### 3. Express service

```bash
cd apps/nodejs-app
npm install
npm run dev
```

Serves `GET /ping` on port 4999.

### 4. Generate some telemetry

```bash
curl localhost:8000/ping/
curl localhost:4999/ping
```

Then open Grafana and look in Explore.

---

## Verifying the pipeline

Useful when something is not showing up. Check each hop in order rather than guessing.

**Did Alloy receive it?**

```bash
curl -s localhost:12345/metrics | grep receiver_accepted_spans_total
curl -s localhost:12345/metrics | grep receiver_accepted_metric_points_total
curl -s localhost:12345/metrics | grep receiver_accepted_log_records_total
```

**Did Alloy forward it?**

```bash
curl -s localhost:12345/metrics | grep -E "exporter_(sent|send_failed)"
```

Comparing received against sent localises a silent drop faster than reading logs.

**Did the backend store it?**

```bash
# Tempo — search needs an explicit time window
curl -s "localhost:3200/api/search?q=%7B%7D&start=$(( $(date +%s) - 1800 ))&end=$(date +%s)&limit=20"

# Prometheus
curl -s "localhost:9090/api/v1/label/__name__/values"

# Loki
curl -s -G "localhost:3100/loki/api/v1/query_range" \
  --data-urlencode 'query={service_name="django-app"}' \
  --data-urlencode "start=$(( $(date +%s) - 300 ))000000000" \
  --data-urlencode "end=$(date +%s)000000000"
```

Alloy's own UI at **http://localhost:12345** shows the live pipeline graph and per-component health.

---

## Layout

```
.
├── docker-compose.yml
├── observability/
│   ├── alloy/config.alloy          receiver → batch → three exporters
│   ├── prometheus/prometheus.yml
│   ├── loki/loki.yml
│   ├── tempo/tempo.yml
│   └── grafana/provisioning/
│       └── datasources/            loaded by Grafana on boot
└── apps/
    ├── django-app/
    │   └── config/
    │       ├── otel.py             setup_tracing / setup_metric / setup_log
    │       ├── wsgi.py             calls them, before Django loads
    │       └── views.py
    └── nodejs-app/
        └── src/
            ├── otel.ts             NodeSDK, loaded via --import
            └── index.ts
```

---

## How the instrumentation is wired

### Django

All three signals are configured in `config/otel.py` and invoked from `config/wsgi.py`. Order matters:

```python
setup_tracing()
setup_metric()
setup_log()
DjangoInstrumentor().instrument()
application = get_wsgi_application()   # Django loads last
```

Instrumentation has to be attached before `get_wsgi_application()` builds the middleware stack. Called afterwards, it has nothing to hook into and produces no spans — with no error.

Logs are bridged into OpenTelemetry with a `LoggingHandler` on the root logger. That handler is what stamps `trace_id` and `span_id` onto every record emitted inside a span.

Note the root logger's level must permit the records through — a handler set to `INFO` will still see nothing if the logger itself sits at the default `WARNING`.

### Express

`src/otel.ts` builds a `NodeSDK` with a trace exporter, a metric reader and a log record processor. It is loaded ahead of the app:

```
node --import tsx --import ./src/otel.ts ./src/index.ts
```

The preload matters. Auto-instrumentation patches libraries as they are imported, so if Express loads first there is nothing left to patch — again, silently.

The project is ESM (`"type": "module"` in `package.json`), which `--import` requires.

---

## What you get out of the box

Beyond the hand-written counters, auto-instrumentation contributes a lot:

**Both services** — request duration histograms (the basis for p95/p99), active request counts, HTTP status and route attributes.

**Express additionally** — event loop delay percentiles, V8 heap usage, garbage collection durations. These are usually what explain Node latency spikes.

---

## Things worth knowing

**A 200 from the OTLP endpoint means "accepted", not "delivered."** Alloy queues telemetry and forwards it asynchronously. A successful POST tells you nothing about whether the data reached storage — check the destination.

**OpenTelemetry SDKs fail silently by default.** Export errors are swallowed. In Python, `logging.basicConfig(level=logging.DEBUG)` makes them visible, which turns an invisible problem into a readable one.

**Signal paths differ.** `/v1/traces`, `/v1/metrics`, `/v1/logs` — each exporter needs its own, and the HTTP exporters do not append it for you.

**gRPC and HTTP exporters are separate packages.** Only 4318 (HTTP) is published here; importing a `-grpc` exporter and pointing it at 4318 fails in a way that is not obvious from the error.

**Prometheus appends `_total` to monotonic counters.** A metric named `ping_requests` arrives as `ping_requests_total`. Naming it `ping_requests_total` yourself does not double it, but it is worth knowing when queries return nothing.

**Tempo's search API needs an explicit time range.** Without `start` and `end` it can return zero results for data that is definitely stored.

**Loki refuses writes when its filesystem is over 90% full**, and reports it as `rpc error: Ingester is shutting down` — a message with no connection to the actual cause. The real clue is a single `disk usage exceeded threshold, throttling writes` warning in Loki's own logs.

This is why Loki uses a named volume here rather than a bind mount: a bind mount exposes the entire host disk to that check, so a nearly-full laptop silently stops all log ingestion. The named volume keeps the WAL on Docker's own filesystem.

Checking the host's `df` is misleading — macOS and the container report different figures for the same disk. To see what Loki sees:

```bash
docker run --rm -v "$PWD/observability/loki/data:/loki" alpine df -h /loki
```

---

## Possible next steps

**Trace-to-log correlation.** Log records already carry `trace_id`, so Grafana only needs to be told to treat it as a link — `derivedFields` on the Loki datasource and `tracesToLogs` on Tempo. That turns three separate views into one navigable system.

**Dashboards.** Grafana provisions datasources but no saved dashboards. Adding dashboard JSON to `observability/grafana/provisioning/dashboards/` would make them load on boot alongside the datasources.
