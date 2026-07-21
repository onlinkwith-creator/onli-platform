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
  if (!request?.company_id && !request?.company_auth_user_id) return null;
  let query = client.from("businesses").select("*");
  query = request.company_id
    ? query.eq("id", request.company_id)
    : query.eq("auth_user_id", request.company_auth_user_id);
  const { data, error } = await query.maybeSingle();
  if (error) throw error;
  return data || null;
}

export function applyCurrentBusinessToRequest(request, businessProfile = null) {
  if (!request || !businessProfile) return request;
  return {
    ...request,
    company_id: businessProfile.id ?? request.company_id ?? null,
    company_auth_user_id:
      businessProfile.auth_user_id ?? request.company_auth_user_id ?? null,
    company_name: businessProfile.company_name || "",
    contact_name: businessProfile.contact_name || "",
    manager_name: businessProfile.contact_name || request.manager_name || "",
    contact_email: businessProfile.contact_email || "",
    company_email: businessProfile.contact_email || "",
    email: businessProfile.contact_email || request.email || "",
    contact_phone: businessProfile.contact_phone || "",
    phone: businessProfile.contact_phone || "",
    business_number: businessProfile.business_number || "",
    company_country: businessProfile.country || "",
    business_profile: businessProfile,
  };
}

export function applyCurrentBusinessesToRequests(requests = [], businesses = []) {
  const byId = new Map();
  const byAuthUserId = new Map();
  businesses.forEach((business) => {
    if (business?.id != null) byId.set(String(business.id), business);
    if (business?.auth_user_id) byAuthUserId.set(String(business.auth_user_id), business);
  });
  return requests.map((request) => {
    const business = request?.company_id != null
      ? byId.get(String(request.company_id))
      : byAuthUserId.get(String(request?.company_auth_user_id || ""));
    return applyCurrentBusinessToRequest(request, business || null);
  });
}

export function normalizeRequestDetail(request, businessProfile = null, companyLoadError = null) {
  if (!request) return null;
  const currentRequest = applyCurrentBusinessToRequest(request, businessProfile);
  const contact = getCompanyDisplayData({ request: currentRequest, businessProfile });
  return {
    request: currentRequest,
    title: currentRequest.event_name || "",
    requestNumber: currentRequest.request_no || "",
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
      location: currentRequest.event_location || "",
      startDate: currentRequest.start_date || currentRequest.event_date || "",
      endDate: currentRequest.end_date || currentRequest.start_date || currentRequest.event_date || "",
    },
  };
}

export async function fetchRequestDetail(client, requestId) {
  const rows = await fetchRequestRows(client, { requestIds: [requestId] });
  const request = rows[0] || null;
  if (!request) return null;
  try {
    const businessProfile = await fetchRequestBusinessProfile(client, request);
    if ((request.company_id || request.company_auth_user_id) && !businessProfile) {
      return normalizeRequestDetail(request, null, new Error("Linked business profile was not returned"));
    }
    return normalizeRequestDetail(request, businessProfile);
  } catch (error) {
    return normalizeRequestDetail(request, null, error);
  }
}
