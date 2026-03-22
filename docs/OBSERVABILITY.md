# Observability with SigNoz

Gamepile supports OpenTelemetry-based observability (traces + logs) from both `web` and `worker` services through environment configuration.

## Supported setup modes

### 1) SigNoz Cloud (recommended)
Use SigNoz Cloud and configure your endpoint + API key in `.env`.

### 2) Self-hosted SigNoz
We do not maintain self-hosted deployment docs in this repository.
Use official SigNoz docs:

- Docker install: <https://signoz.io/docs/install/docker/>
- Kubernetes (local): <https://signoz.io/docs/install/kubernetes/local/>
- SigNoz repository: <https://github.com/SigNoz/signoz>

## Required Gamepile environment variables

Add these to `.env` (or your secret manager). See `.env.example` for the full list with descriptions.

```dotenv
# Base OTLP endpoint for traces and logs export
OTEL_EXPORTER_OTLP_ENDPOINT=https://ingest.us2.signoz.cloud:443

# Explicit traces endpoint (optional, falls back to the base endpoint)
OTEL_EXPORTER_OTLP_TRACES_ENDPOINT=https://ingest.us2.signoz.cloud:443/v1/traces

# Traces protocol
OTEL_EXPORTER_OTLP_TRACES_PROTOCOL=http/protobuf

# Comma-separated key=value auth headers
OTEL_EXPORTER_OTLP_HEADERS=signoz-ingestion-key=your-signoz-ingestion-key

# SDK log verbosity
OTEL_LOG_LEVEL=info
```

## Endpoint format notes

- `OTEL_EXPORTER_OTLP_ENDPOINT` is used as the base URL; the logs exporter appends `/v1/logs`.
- Auth headers are parsed from `OTEL_EXPORTER_OTLP_HEADERS` (comma-separated `key=value` pairs).
- This allows using non-SigNoz OTLP-compatible collectors with the same configuration.

## Quick validation

After setting environment variables and starting Gamepile, check logs for logger initialisation and confirm records arrive in SigNoz Logs Explorer.

## Related docs

- `README.md`
- `.env.example`
