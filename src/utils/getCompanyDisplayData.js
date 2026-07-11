function readText(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

// Keep the admin request-detail precedence: current business profile first,
// then the request snapshot captured when the request was submitted.
export function getCompanyDisplayData(requestDetail) {
  const request = requestDetail?.request || requestDetail || {};
  const business = requestDetail?.businessProfile || null;

  return {
    companyName: readText(business?.company_name) || readText(request.company_name),
    contactName:
      readText(business?.contact_name) ||
      readText(request.contact_name) ||
      readText(request.manager_name),
    contactPhone: readText(business?.contact_phone) || readText(request.phone),
    contactEmail: readText(business?.contact_email) || readText(request.email),
    // Neither production businesses nor requests currently has a Kakao column.
    kakaoId: "",
  };
}
