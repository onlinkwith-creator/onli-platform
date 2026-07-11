import { getCompanyDisplayData } from "../utils/getCompanyDisplayData";

export async function fetchRequestRows(client, { requestIds } = {}) {
  let query = client.from("requests").select("*");
  if (Array.isArray(requestIds)) {
    if (requestIds.length === 0) return [];
    query = query.in("id", requestIds);
  } else {
    query = query.order("created_at", { ascending: false, nullsFirst: false });
  }
  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

export async function fetchRequestBusinessProfile(client, request) {
  if (!request?.company_auth_user_id) return null;
  const { data, error } = await client
    .from("businesses")
    .select("*")
    .eq("auth_user_id", request.company_auth_user_id)
    .maybeSingle();
  if (error) throw error;
  return data || null;
}

export function normalizeRequestDetail(request, businessProfile = null, companyLoadError = null) {
  if (!request) return null;
  const contact = getCompanyDisplayData({ request, businessProfile });
  return {
    request,
    title: request.event_name || "",
    requestNumber: request.request_no || "",
    businessProfile,
    companyLoadError,
    company: { name: contact.companyName },
    contact: {
      name: contact.contactName,
      phone: contact.contactPhone,
      email: contact.contactEmail,
      kakaoId: contact.kakaoId,
    },
    schedule: {
      location: request.event_location || "",
      startDate: request.start_date || request.event_date || "",
      endDate: request.end_date || request.start_date || request.event_date || "",
    },
  };
}

export async function fetchRequestDetail(client, requestId) {
  const rows = await fetchRequestRows(client, { requestIds: [requestId] });
  const request = rows[0] || null;
  if (!request) return null;
  try {
    const businessProfile = await fetchRequestBusinessProfile(client, request);
    if (request.company_auth_user_id && !businessProfile) {
      return normalizeRequestDetail(request, null, new Error("Linked business profile was not returned"));
    }
    return normalizeRequestDetail(request, businessProfile);
  } catch (error) {
    return normalizeRequestDetail(request, null, error);
  }
}
