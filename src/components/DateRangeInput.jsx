import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { ko } from "react-day-picker/locale";
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
  timeValue = null,
  onTimeChange,
  allowClear = false,
}) {
  const pickerRef = useRef(null);
  const calendarRef = useRef(null);
  const draftStartRef = useRef(null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [popoverStyle, setPopoverStyle] = useState(null);
  const normalizedStart = normalizeDateToISO(startDate);
  const normalizedEnd = normalizeDateToISO(endDate);
  const selectedRange = useMemo(
    () => ({
      from: dateFromISO(normalizedStart),
      to: singleDateMode ? dateFromISO(normalizedStart) : dateFromISO(normalizedEnd),
    }),
    [normalizedEnd, normalizedStart, singleDateMode]
  );
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

  const applyQuickRange = (days) => {
    if (!normalizedStart) return;
    updateRange(normalizedStart, addDays(normalizedStart, days - 1));
  };

  const applyWeekRange = (weekOffset) => {
    const { start, end } = getWeekRange(weekOffset);
    updateRange(start, end);
  };

  const handlePickerToggle = () => {
    setIsPickerOpen((current) => {
      if (!current) draftStartRef.current = null;
      return !current;
    });
  };

  const updatePopoverPosition = useCallback(() => {
    if (!pickerRef.current) return;
    const anchor = pickerRef.current.getBoundingClientRect();
    const viewportGap = 12;
    const width = Math.min(356, window.innerWidth - viewportGap * 2);
    const height = calendarRef.current?.offsetHeight || (timeValue !== null ? 440 : 380);
    const spaceBelow = window.innerHeight - anchor.bottom - viewportGap;
    const openAbove = spaceBelow < height && anchor.top > spaceBelow;
    const top = openAbove
      ? Math.max(viewportGap, anchor.top - height - 10)
      : Math.max(
          viewportGap,
          Math.min(anchor.bottom + 10, window.innerHeight - height - viewportGap)
        );
    const left = Math.min(
      Math.max(viewportGap, anchor.left),
      window.innerWidth - width - viewportGap
    );

    setPopoverStyle({ top, left, width });
  }, [timeValue]);

  const handleSelect = (range, selectedDay) => {
    const selectedDate = isoFromDate(selectedDay);

    if (!singleDateMode && selectedDate) {
      if (!draftStartRef.current) {
        draftStartRef.current = selectedDate;
        updateRange(selectedDate, "");
        return;
      }

      const rangeStart = draftStartRef.current;
      const rangeEnd = selectedDate;
      const [nextStartDate, nextEndDate] =
        rangeEnd < rangeStart ? [rangeEnd, rangeStart] : [rangeStart, rangeEnd];

      draftStartRef.current = null;
      updateRange(nextStartDate, nextEndDate);
      setIsPickerOpen(false);
      return;
    }

    const nextStartDate = isoFromDate(range?.from);
    const nextEndDate = singleDateMode
      ? nextStartDate
      : isoFromDate(range?.to) || (range?.from ? "" : "");

    updateRange(nextStartDate, nextEndDate);

    if ((singleDateMode && timeValue === null) || (!singleDateMode && nextStartDate && nextEndDate)) {
      setIsPickerOpen(false);
    }
  };

  useEffect(() => {
    if (!isPickerOpen) return undefined;

    const handlePointerDown = (event) => {
      if (pickerRef.current?.contains(event.target) || calendarRef.current?.contains(event.target)) return;
      draftStartRef.current = null;
      setIsPickerOpen(false);
    };

    const handleKeyDown = (event) => {
      if (event.key !== "Escape") return;
      draftStartRef.current = null;
      setIsPickerOpen(false);
    };

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [isPickerOpen]);

  useLayoutEffect(() => {
    if (!isPickerOpen) return undefined;

    updatePopoverPosition();
    const frame = window.requestAnimationFrame(updatePopoverPosition);
    const handleViewportChange = () => updatePopoverPosition();
    window.addEventListener("resize", handleViewportChange);
    window.addEventListener("scroll", handleViewportChange, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", handleViewportChange);
      window.removeEventListener("scroll", handleViewportChange, true);
    };
  }, [isPickerOpen, updatePopoverPosition]);

  return (
    <div className={`date-range-input${validationMessage ? " has-error" : ""}`}>
      <div className="date-range-head">
        <span>{label}</span>
        <strong>
          선택 결과: {formatDisplayDateRange(normalizedStart, normalizedEnd)}
          {singleDateMode && timeValue ? ` ${timeValue}` : ""}
        </strong>
      </div>

      <div className="date-range-picker-shell" ref={pickerRef}>
        <div className="date-range-fields">
          <DatePickerButton
            label={singleDateMode ? "날짜" : "시작일"}
            value={normalizedStart}
            active={isPickerOpen}
            onClick={handlePickerToggle}
          />
          {!singleDateMode && (
            <DatePickerButton
              label="종료일"
              value={normalizedEnd}
              active={isPickerOpen}
              onClick={handlePickerToggle}
            />
          )}
        </div>

        {isPickerOpen && popoverStyle && createPortal(
          <div
            ref={calendarRef}
            className="date-range-calendar-panel is-portal"
            style={popoverStyle}
            role="dialog"
            aria-label={`${label} 선택`}
          >
            <DayPicker
              mode="range"
              locale={ko}
              selected={selectedRange.from ? selectedRange : undefined}
              defaultMonth={selectedRange.from || new Date()}
              onSelect={handleSelect}
              numberOfMonths={1}
              weekStartsOn={1}
              fixedWeeks
              showOutsideDays
            />
            {singleDateMode && timeValue !== null && (
              <div className="date-picker-card date-picker-time-control">
                <span>시간</span>
                <input
                  type="time"
                  value={timeValue}
                  onChange={(event) => onTimeChange?.(event.target.value)}
                  aria-label={`${label} 시간`}
                />
              </div>
            )}
            {allowClear && normalizedStart && (
              <button
                type="button"
                className="date-range-clear"
                onClick={() => {
                  updateRange("", "");
                  setIsPickerOpen(false);
                }}
              >
                날짜 초기화
              </button>
            )}
          </div>
        , document.body)}
      </div>

      {showQuickButtons && !singleDateMode && (
        <div className="date-range-quick" aria-label="빠른 기간 선택">
          {[1, 2, 3].map((days) => (
            <button
              key={days}
              type="button"
              disabled={!normalizedStart}
              className={isMatchingRange(normalizedStart, normalizedEnd, days) ? "is-active" : ""}
              onClick={() => applyQuickRange(days)}
            >
              {days === 1 ? "하루 일정" : `${days}일 일정`}
            </button>
          ))}
          <button type="button" onClick={() => applyWeekRange(0)}>
            이번 주
          </button>
          <button type="button" onClick={() => applyWeekRange(1)}>
            다음 주
          </button>
        </div>
      )}

      {validationMessage && <p className="date-range-error">{validationMessage}</p>}
    </div>
  );
}

function DatePickerButton({ label, value, active, onClick }) {
  return (
    <div className="date-picker-card">
      <span>{label}</span>
      <button
        type="button"
        className={active ? "is-active" : ""}
        onClick={onClick}
        aria-expanded={active}
      >
        {value ? formatDisplayDate(value) : `${label} 선택`}
      </button>
    </div>
  );
}

function getValidationMessage({ startDate, endDate, required, singleDateMode }) {
  if (!required) return "";
  if (!startDate) return "행사 시작일을 선택해주세요.";
  if (!singleDateMode && !endDate) return "행사 종료일을 선택해주세요.";
  if (!singleDateMode && endDate < startDate) {
    return "종료일은 시작일보다 빠를 수 없습니다.";
  }
  return "";
}

function dateFromISO(dateValue) {
  const isoDate = normalizeDateToISO(dateValue);
  if (!isoDate) return undefined;

  const [year, month, day] = isoDate.split("-").map(Number);
  return new Date(year, month - 1, day);
}

function isoFromDate(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) return "";

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

function getWeekRange(weekOffset) {
  const today = new Date();
  const day = today.getDay() || 7;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  start.setDate(today.getDate() - day + 1 + weekOffset * 7);

  const end = new Date(start);
  end.setDate(start.getDate() + 6);

  return {
    start: isoFromDate(start),
    end: isoFromDate(end),
  };
}

function isMatchingRange(startDate, endDate, days) {
  if (!startDate || !endDate) return false;
  return endDate === addDays(startDate, days - 1);
}

export default DateRangeInput;
