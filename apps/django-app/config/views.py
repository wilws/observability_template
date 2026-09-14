from django.http import JsonResponse

from opentelemetry import metrics
from opentelemetry.sdk.metrics import MeterProvider





def ping(request):
    
    meter = metrics.get_meter("django-app")

    ping_requests = meter.create_counter(
        "ping_requests_total",
        description="Number of requests to /ping",
    )
    ping_requests.add(1)
    return JsonResponse({"pong":"Pong! Pong! Pong!"})