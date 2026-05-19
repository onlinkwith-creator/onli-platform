import { useRef } from "react";
import {
  addDays,
  formatDisplayDate,
  formatDisplayDateRange,
  normalizeDateToISO,
} from "../utils/date";
import "./DateRangeInput.css";

function DateRangeInput({
  startDate,
  endDate,
  onChange,
  singleDateMode = false,
  showQuickButtons = false,
  label = "행사 기간",
  required = false,
  error = "",
}) {
  const startInputRef = useRef(null);
  const endInputRef = useRef(null);
  const normalizedStart = normalizeDateToISO(startDate);
  const normalizedEnd = normalizeDateToISO(endDate);
  const validationMessage = error || getValidationMessage({
    startDate: normalizedStart,
    endDate: normalizedEnd,
    required,
    singleDateMode,
  });

  const updateRange = (nextStartDate, nextEndDate = nextStartDate) => {
    onChange({
      startDate: nextStartDate,
      endDate: singleDateMode ? nextStartDate : nextEndDate,
    });
  };

  const openPicker = (ref) => {
    const input = ref.current;
    if (!input) return;
    if (typeof input.showPicker === "function") {
      input.showPicker();
      return;
    }
    input.click();
    input.focus();
  };

  const applyQuickRange = (days) => {
    if (!normalizedStart) return;
    updateRange(normalizedStart, addDays(normalizedStart, days - 1));
  };

  return (
    <div className={`date-range-input${validationMessage ? " has-error" : ""}`}>
      <div className="date-range-head">
        <span>{label}</span>
        <strong>{formatDisplayDateRange(normalizedStart, normalizedEnd)}</strong>
      </div>

      <div className="date-range-fields">
        <DatePickerButton
          inputRef={startInputRef}
          label={singleDateMode ? "날짜" : "시작일"}
          value={normalizedStart}
          onClick={() => openPicker(startInputRef)}
          onChange={(value) => updateRange(value, normalizedEnd || value)}
        />
        {!singleDateMode && (
          <DatePickerButton
            inputRef={endInputRef}
            label="종료일"
            value={normalizedEnd}
            onClick={() => openPicker(endInputRef)}
            onChange={(value) => updateRange(normalizedStart, value)}
          />
        )}
      </div>

      {showQuickButtons && !singleDateMode && (
        <div className="date-range-quick" aria-label="빠른 기간 선택">
          {[1, 2, 3].map((days) => (
            <button
              key={days}
              type="button"
              disabled={!normalizedStart}
              onClick={() => applyQuickRange(days)}
            >
              {days === 1 ? "하루 일정" : `${days}일 일정`}
            </button>
          ))}
        </div>
      )}

      {validationMessage && <p className="date-range-error">{validationMessage}</p>}
    </div>
  );
}

function DatePickerButton({ inputRef, label, value, onClick, onChange }) {
  return (
    <div className="date-picker-card">
      <span>{label}</span>
      <button type="button" onClick={onClick}>
        {value ? formatDisplayDate(value) : `${label} 선택`}
      </button>
      <input
        ref={inputRef}
        tabIndex={-1}
        type="date"
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        aria-hidden="true"
      />
    </div>
  );
}

function getValidationMessage({ startDate, endDate, required, singleDateMode }) {
  if (!required) return "";
  if (!startDate) return "시작일을 선택해주세요.";
  if (!singleDateMode && !endDate) return "종료일을 선택해주세요.";
  if (!singleDateMode && endDate < startDate) {
    return "종료일은 시작일보다 빠를 수 없습니다.";
  }
  return "";
}

export default DateRangeInput;
