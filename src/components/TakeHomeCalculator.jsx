import { useId, useMemo, useState } from "react";
import { Calculator } from "lucide-react";
import "./TakeHomeCalculator.css";

const SETTLEMENT_TYPES = {
  freelancer: {
    label: "개인 통역사",
    description: "3.3% 원천징수 후 지급 · 소득세 3% + 지방소득세 0.3%",
    incomeTaxRate: 0.03,
    localIncomeTaxRate: 0.003,
  },
  business: {
    label: "사업자 통역사",
    description: "원천징수 없이 정산 · 사업자 정산 대상",
    incomeTaxRate: 0,
    localIncomeTaxRate: 0,
  },
};

const LEVEL_PAYMENT_GUIDE = [
  { level: "LV1", amount: "180,000원" },
  { level: "LV2", amount: "200,000원" },
  { level: "LV3", amount: "230,000원" },
  { level: "LV4", amount: "245,000원" },
];

const roundWon = (amount) => Math.max(0, Math.round(Number(amount) || 0));

function calculateTakeHome(grossSettlement, settlementType = "freelancer") {
  const settlementBeforeTax = roundWon(grossSettlement);
  const taxRates = SETTLEMENT_TYPES[settlementType] || SETTLEMENT_TYPES.freelancer;
  const incomeTax = roundWon(settlementBeforeTax * taxRates.incomeTaxRate);
  const localIncomeTax = roundWon(settlementBeforeTax * taxRates.localIncomeTaxRate);
  const totalWithholding = incomeTax + localIncomeTax;
  const estimatedTakeHome = Math.max(
    0,
    settlementBeforeTax - totalWithholding
  );

  return {
    settlementBeforeTax,
    incomeTax,
    localIncomeTax,
    totalWithholding,
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
            예정 정산 금액과 정산 유형을 입력하면 공제 예상액을 반영한 입금 금액을
            확인할 수 있습니다.
          </p>
        </div>
      </div>

      <div className="take-home-form">
        <label className="take-home-field" htmlFor={inputId}>
          <span>예정 정산 금액</span>
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
          <small>ON-LI에서 안내받은 통역사 정산 예정 금액을 입력하세요.</small>
          <div className="take-home-level-reference" aria-label="ON-LI 기준 정산 금액">
            <strong>ON-LI 기준 정산 금액</strong>
            <div>
              {LEVEL_PAYMENT_GUIDE.map((item) => (
                <span key={item.level}>
                  <b>{item.level}</b> {item.amount}
                </span>
              ))}
            </div>
          </div>
        </label>

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
        <ResultRow
          label="예정 정산 금액"
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
          label="총 공제 예상액"
          amount={calculation.totalWithholding}
          deduction
        />
        <ResultRow
          label="예상 입금 금액"
          amount={calculation.estimatedTakeHome}
          total
        />
      </div>

      <div className="take-home-notice">
        <p>
          ※ 표시 금액은 예상 금액이며 실제 정산 과정에서 차이가 발생할 수 있습니다.
        </p>
        <p>
          ※ 세금 신고 및 납부 의무는 개인의 상황에 따라 달라질 수 있습니다.
        </p>
        <p>
          ON-LI는 통역 업무 연결 및 정산 지원 플랫폼이며 세무 신고를 대행하지 않습니다.
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
