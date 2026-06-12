import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import "./TakeHomeCalculator.css";

const PLATFORM_FEE_RATE = 0.2;

const SETTLEMENT_TYPES = {
  freelancer: {
    label: "개인 프리랜서",
    description: "소득세 3% + 지방소득세 0.3% (총 3.3% 예상 공제)",
    incomeTaxRate: 0.03,
    localIncomeTaxRate: 0.003,
  },
  business: {
    label: "사업자",
    description:
      "원천징수 0원으로 예상되며, 별도 증빙 및 세금계산서·계산서 처리 여부는 개별 조건에 따라 달라질 수 있습니다.",
    incomeTaxRate: 0,
    localIncomeTaxRate: 0,
  },
  exempt: {
    label: "원천징수 비대상",
    description:
      "원천징수 0원으로 예상되며, 실제 비대상 여부는 개별 세무 조건에 따라 달라질 수 있습니다.",
    incomeTaxRate: 0,
    localIncomeTaxRate: 0,
  },
};

const roundWon = (amount) => Math.max(0, Math.round(Number(amount) || 0));

function calculateTakeHome(grossAmount, settlementType = "freelancer") {
  const gross = roundWon(grossAmount);
  const taxRates = SETTLEMENT_TYPES[settlementType] || SETTLEMENT_TYPES.freelancer;
  const platformFee = roundWon(gross * PLATFORM_FEE_RATE);
  const settlementBeforeTax = Math.max(0, gross - platformFee);
  const incomeTax = roundWon(settlementBeforeTax * taxRates.incomeTaxRate);
  const localIncomeTax = roundWon(settlementBeforeTax * taxRates.localIncomeTaxRate);
  const estimatedTakeHome = Math.max(
    0,
    settlementBeforeTax - incomeTax - localIncomeTax
  );

  return {
    gross,
    platformFee,
    settlementBeforeTax,
    incomeTax,
    localIncomeTax,
    estimatedTakeHome,
  };
}

function formatWon(amount) {
  return `${roundWon(amount).toLocaleString("ko-KR")}원`;
}

function TakeHomeCalculator({ initialAmount = 0, className = "" }) {
  const inputId = useId();
  const settlementTypeId = useId();
  const [grossAmount, setGrossAmount] = useState(() => roundWon(initialAmount));
  const [settlementType, setSettlementType] = useState("freelancer");
  const calculation = useMemo(
    () => calculateTakeHome(grossAmount, settlementType),
    [grossAmount, settlementType]
  );

  const handleAmountChange = (event) => {
    const digitsOnly = event.target.value.replace(/\D/g, "");
    setGrossAmount(digitsOnly ? Number(digitsOnly) : 0);
  };

  return (
    <section className={`take-home-calculator ${className}`.trim()}>
      <div className="take-home-heading">
        <span className="take-home-icon" aria-hidden="true">
          <Calculator size={20} />
        </span>
        <div>
          <h2>예상 실수령액 계산기</h2>
          <p>
            통역료와 정산 유형을 입력하면 플랫폼 수수료와 원천징수를 반영한 예상
            수령액을 확인할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="take-home-form">
        <label className="take-home-field" htmlFor={inputId}>
          <span>통역료 총액</span>
          <div className="take-home-amount-input">
            <input
              id={inputId}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="off"
              value={grossAmount ? grossAmount.toLocaleString("ko-KR") : ""}
              onChange={handleAmountChange}
              placeholder="0"
              aria-describedby={`${inputId}-unit`}
            />
            <span id={`${inputId}-unit`}>원</span>
          </div>
        </label>

        <div className="take-home-fixed-rate">
          <span>플랫폼 수수료</span>
          <strong>{PLATFORM_FEE_RATE * 100}%</strong>
        </div>

        <label className="take-home-field" htmlFor={settlementTypeId}>
          <span>정산 유형</span>
          <select
            id={settlementTypeId}
            value={settlementType}
            onChange={(event) => setSettlementType(event.target.value)}
          >
            {Object.entries(SETTLEMENT_TYPES).map(([value, option]) => (
              <option key={value} value={value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
        <p className="take-home-type-description">
          {SETTLEMENT_TYPES[settlementType].description}
        </p>
      </div>

      <div className="take-home-results" aria-live="polite">
        <ResultRow label="통역료 총액" amount={calculation.gross} />
        <ResultRow
          label={`ON-LI 플랫폼 수수료 ${PLATFORM_FEE_RATE * 100}%`}
          amount={calculation.platformFee}
          deduction
        />
        <ResultRow
          label="통역사 세전 정산금"
          amount={calculation.settlementBeforeTax}
          emphasized
        />
        <ResultRow label="소득세 3%" amount={calculation.incomeTax} deduction />
        <ResultRow
          label="지방소득세 0.3%"
          amount={calculation.localIncomeTax}
          deduction
        />
        <ResultRow
          label="예상 실수령액"
          amount={calculation.estimatedTakeHome}
          total
        />
      </div>

      <div className="take-home-notice">
        <p>
          본 계산 결과는 예상 금액이며 실제 정산액을 보증하지 않습니다. 통역사의
          사업자 여부, 거주자 여부, 소득 구분, 원천징수 대상 여부 및 관련 세법에
          따라 실제 지급액과 신고 방식이 달라질 수 있습니다.
        </p>
        <p>
          ON-LI는 기업과 통역사를 연결하고 정산 절차를 지원하는 플랫폼이며, 개별
          이용자의 세무 신고 또는 세금 결과를 보증하지 않습니다.
        </p>
      </div>
    </section>
  );
}

function ResultRow({ label, amount, deduction = false, emphasized = false, total = false }) {
  const displayedAmount = `${deduction && amount > 0 ? "-" : ""}${formatWon(amount)}`;

  return (
    <div
      className={`take-home-result-row${emphasized ? " is-emphasized" : ""}${
        total ? " is-total" : ""
      }`}
    >
      <span>{label}</span>
      <strong>{displayedAmount}</strong>
    </div>
  );
}

export default TakeHomeCalculator;
