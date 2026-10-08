const fields = [
  "event_name", "event_location", "language_direction", "requested_level", "required_level",
  "requested_people_count", "required_count", "preferred_gender", "interpretation_field", "job_field",
  "request_details", "request_detail", "event_start_time", "event_end_time",
];

export function makeRepeatRequestTemplate(request) {
  return Object.fromEntries(fields.filter((key) => request?.[key] != null).map((key) => [key, request[key]]));
}
