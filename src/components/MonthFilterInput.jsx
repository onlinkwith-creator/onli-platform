import { formatDisplayMonth } from "../utils/date";
import "./MonthFilterInput.css";

function MonthFilterInput({ value, onChange, label = "월 선택" }) {
  const currentMonth = getCurrentMonthValue();
  const nextMonth = getNextMonthValue();

  return (
    <div className="month-filter-input admin-date-filter-group">
      <label>
        <span>{label}</span>
        <input
          aria-label={label}
          type="month"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      </label>
      <div className="month-filter-actions" aria-label="빠른 월 이동">
        <button
          type="button"
          className={value === currentMonth ? "is-active" : ""}
          onClick={() => onChange(currentMonth)}
        >
          이번 달
        </button>
        <button
          type="button"
          className={value === nextMonth ? "is-active" : ""}
          onClick={() => onChange(nextMonth)}
        >
          다음 달
        </button>
        <button
          type="button"
          className={value === "" ? "is-active" : ""}
          onClick={() => onChange("")}
        >
          전체
        </button>
      </div>
      <strong>{value ? formatDisplayMonth(value) : "전체 기간"}</strong>
    </div>
  );
}

function getCurrentMonthValue() {
  const today = new Date();
  return formatMonthValue(today.getFullYear(), today.getMonth() + 1);
}

function getNextMonthValue() {
  const today = new Date();
  return formatMonthValue(today.getFullYear(), today.getMonth() + 2);
}

function formatMonthValue(year, month) {
  const date = new Date(year, month - 1, 1);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}`;
}

export default MonthFilterInput;
