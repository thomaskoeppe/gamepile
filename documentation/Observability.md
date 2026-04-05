# Observability

Both `web` and `worker` services export OpenTelemetry **traces** and **structured logs** via the standard OTLP protocol. Any OTLP-compatible collector works — SigNoz, Grafana Alloy, Grafana Tempo + Loki, Jaeger, the OpenTelemetry Collector, etc.

Observability is **fully optional**. If you omit the OTLP environment variables the services start normally and log to stdout only.

---

## Environment variables

Set these on both the `web` and `worker` services. When using `docker-compose.yml`, put them in `.env`.

```env
# Base OTLP endpoint. The logs exporter appends /v1/logs automatically.
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us2.signoz.cloud/

# Auth headers (comma-separated key=value pairs)
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=your-ingestion-key

# Wire protocol — http/protobuf works with every major collector
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf
```

Optional fine-tuning:

```env
# Override the traces endpoint separately if your collector uses different paths
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://ingest.us2.signoz.cloud/v1/traces

# OTel SDK log verbosity (default: info)
OTEL_LOG_LEVEL=info

# Set to 1 for verbose OTel debug output from the Next.js instrumentation layer
NEXT_OTEL_VERBOSE=0
```

For the worker, there is one additional variable:

```env
# Service name reported in traces and logs (default: gamepile-worker)
OTEL_SERVICE_NAME=gamepile-worker
```

---

## Collector options

### SigNoz Cloud (quickest start)

1. Sign up at [signoz.io/teams](https://signoz.io/teams).
2. Create a new data source and copy your ingestion key.
3. Set the variables above using your region's ingest URL (e.g. `https://ingest.us2.signoz.cloud/`).

### Self-hosted SigNoz

Use the official SigNoz deployment guides — Gamepile does not include its own SigNoz setup:

- Docker: <https://signoz.io/docs/install/docker/>
- Kubernetes: <https://signoz.io/docs/install/kubernetes/local/>

Point `OTEL_EXPORTER_OTLP_ENDPOINT` at your SigNoz collector's OTLP HTTP port (default `4318`).

### Any OTLP collector (Grafana, Jaeger, etc.)

Set `OTEL_EXPORTER_OTLP_ENDPOINT` to your collector's HTTP OTLP receiver. Remove `OTEL_EXPORTER_OTLP_HEADERS` if no auth is required. The `http/protobuf` protocol is the most broadly supported option.

---

## What is exported

| Signal | Web | Worker |
|---|---|---|
| Traces | ✓ (Next.js + manual spans) | ✓ (auto-instrumented + manual spans) |
| Structured logs | ✓ (Pino → OTLP exporter) | ✓ (Pino → OTLP exporter) |

Logs are also written to **stdout** on both services regardless of whether OTLP export is configured. The worker has a `WORKER_LOG_TO_STDOUT` variable (default `true`) to disable this if you only want OTLP output.

---

## Verifying the setup

After setting the environment variables and restarting, check the container logs for a line like:

```
OTel logger initialized { endpoint: "https://..." }
```

Then confirm records appear in your collector's log/trace explorer. If nothing arrives, check:

1. The endpoint URL is reachable from inside the container.
2. The auth headers are correct (no extra spaces or quotes).
3. `OTEL_LOG_LEVEL=debug` for detailed SDK output.
