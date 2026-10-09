import React from "react";
import { POLICY_VERSION } from "../../src/utils/policyVersion.js";
import { renderToStaticMarkup } from "react-dom/server";
import PolicyPage, { POLICY_PAGES } from "../../src/pages/PolicyPage.jsx";
import TermsAgreement, {
  areTermsAgreed,
  initialTermsAgreement,
} from "../../src/components/TermsAgreement.jsx";

export { POLICY_PAGES, POLICY_VERSION, areTermsAgreed, initialTermsAgreement };

export const renderPolicy = (key) => renderToStaticMarkup(
  React.createElement(PolicyPage, { policyKey: key }),
);

export const renderAgreement = (role) => renderToStaticMarkup(
  React.createElement(TermsAgreement, {
    role,
    agreements: initialTermsAgreement,
    onChange() {},
    requireCancelPolicy: true,
  }),
);
