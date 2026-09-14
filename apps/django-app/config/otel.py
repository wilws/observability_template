from opentelemetry import trace
from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor,ConsoleSpanExporter, SimpleSpanProcessor



'''
GET /api/users
├──(span 1) database query
├──(span 2) call to external API
└──(span 3) response

Each operation is represented by a span.

'''

resource = Resource.create({
    "service.name": "django-app",
    "service.version": "1.0.0",  #optional
    "deployment.environment": "development", #optional
})

def setup_tracing():
    
    print("OTEL SETUP RAN")
    
    # describes who/what produced the telemetry.
    # "These traces came from a service called django-app."


    # engine responsible for creating and managing tracers/spans.
    provider = TracerProvider(resource=resource)
    # provider.add_span_processor(SimpleSpanProcessor(ConsoleSpanExporter()))


    # creates the component that knows where to send your spans.
    exporter = OTLPSpanExporter(
        endpoint="http://localhost:4318/v1/traces",
        # insecure=True,
    )

    
    '''
        You don't generally want your application to send every single span immediately.
        Instead, BatchSpanProcessor collects spans and sends them in batches.

        Conceptually:

        Span 1 ─┐
        Span 2  │
        Span 3  │
        Span 4  ├── BatchSpanProcessor ──► Exporter
        Span 5  │
        Span 6 ─┘

        This is more efficient.
    '''
    provider.add_span_processor(
        BatchSpanProcessor(exporter)
    )


    # tells OpenTelemetry to use this TracerProvider as the application's global tracing provider.
    trace.set_tracer_provider(provider)
    
    
    
from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider
from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter


def setup_metric():
    metric_exporter = OTLPMetricExporter(
        endpoint="http://localhost:4318/v1/metrics",
        # insecure=True,
    )

    metric_reader = PeriodicExportingMetricReader(
        metric_exporter,
        export_interval_millis=5000,
    )

    meter_provider = MeterProvider(
        resource=resource,
        metric_readers=[metric_reader],
    )
    


    metrics.set_meter_provider(meter_provider)
    
    print("METRIC SETUP RAN", flush=True)
    
 
