import "./TermsAgreement.css";

const policyLinks = [
  { href: "/privacy", label: "개인정보 처리방침" },
  { href: "/terms", label: "이용약관" },
];

const rolePolicyLinks = {
  interpreter: { href: "/interpreter-policy", label: "통역사 활동 약관" },
  client: { href: "/client-policy", label: "기업 의뢰 약관" },
};

const cancelPolicyLink = { href: "/terms#cancel-policy", label: "취소 및 노쇼 규정" };

function TermsAgreement({
  agreements,
  className = "",
  onChange,
  requireCancelPolicy = false,
  role = "client",
}) {
  const rolePolicy = rolePolicyLinks[role] || rolePolicyLinks.client;

  return (
    <div className={`terms-agreement ${className}`.trim()}>
      <label className="terms-agreement-row">
        <input
          type="checkbox"
          checked={agreements.agreedPolicy}
          onChange={(event) => onChange("agreedPolicy", event.target.checked)}
        />
        <span>
          <TermsLink href={policyLinks[0].href}>{policyLinks[0].label}</TermsLink>
          {" 및 "}
          <TermsLink href={policyLinks[1].href}>{policyLinks[1].label}</TermsLink>
          에 동의합니다.
        </span>
      </label>
      <label className="terms-agreement-row">
        <input
          type="checkbox"
          checked={agreements.agreedTerms}
          onChange={(event) => onChange("agreedTerms", event.target.checked)}
        />
        <span>
          <TermsLink href={rolePolicy.href}>{rolePolicy.label}</TermsLink>
          에 동의합니다.
        </span>
      </label>
      {requireCancelPolicy && (
        <label className="terms-agreement-row">
          <input
            type="checkbox"
            checked={agreements.agreedCancelPolicy}
            onChange={(event) => onChange("agreedCancelPolicy", event.target.checked)}
          />
          <span>
            <TermsLink href={cancelPolicyLink.href}>{cancelPolicyLink.label}</TermsLink>
            에 동의합니다.
          </span>
        </label>
      )}
    </div>
  );
}

function TermsLink({ children, href }) {
  return (
    <a href={href} target="_blank" rel="noreferrer">
      {children}
    </a>
  );
}

export function areTermsAgreed(agreements, { requireCancelPolicy = false } = {}) {
  return Boolean(
    agreements.agreedPolicy &&
      agreements.agreedTerms &&
      (!requireCancelPolicy || agreements.agreedCancelPolicy)
  );
}

export const initialTermsAgreement = {
  agreedPolicy: false,
  agreedTerms: false,
  agreedCancelPolicy: false,
};

export default TermsAgreement;
