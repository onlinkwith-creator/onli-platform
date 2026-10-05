export function getNewestRequestId(requests) {
  const newest = requests.reduce((latest, request) => {
    if (!latest) return request;
    const timestamp = Date.parse(request.created_at);
    const latestTimestamp = Date.parse(latest.created_at);
    return Number.isFinite(timestamp) && (!Number.isFinite(latestTimestamp) || timestamp > latestTimestamp)
      ? request
      : latest;
  }, null);
  return newest ? String(newest.id) : null;
}

export function isRequestExpanded(requestId, newestRequestId, overrides) {
  return overrides[String(requestId)] ?? String(requestId) === newestRequestId;
}
