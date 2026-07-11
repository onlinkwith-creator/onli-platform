export function cleanCompanyText(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text && !/^\d+$/.test(text) ? text : "";
}

export function cleanCompanyPhone(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return text.replace(/\D/g, "").length >= 8 ? text : "";
}

export function cleanCompanyEmail(value) {
  if (typeof value !== "string") return "";
  const text = value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text) ? text : "";
}

export function normalizeCompanyContact(company = null, request = null) {
  return {
    companyName: cleanCompanyText(company?.company_name),
    contactName: cleanCompanyText(company?.contact_name),
    phone: cleanCompanyPhone(company?.contact_phone),
    email: cleanCompanyEmail(company?.contact_email) || cleanCompanyEmail(request?.email),
    kakaoId: "",
  };
}
