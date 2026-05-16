'use client';

/**
 * ThaiDatePicker — wraps antd DatePicker with Buddhist Era (พ.ศ.) locale.
 *
 * Props:
 *   value   — ISO date string YYYY-MM-DD (ค.ศ.)
 *   onChange — called with ISO date string YYYY-MM-DD (or '' when cleared)
 *
 * Internal rendering uses dayjs buddhist-era plugin, so the picker
 * shows พ.ศ. year and Thai month names; the value exchanged with the
 * parent is always standard ค.ศ. ISO.
 */

import { DatePicker } from 'antd';
import type { Dayjs } from 'dayjs';
import dayjs from 'dayjs';
import buddhistEra from 'dayjs/plugin/buddhistEra';
import 'dayjs/locale/th';
import th from 'antd/es/date-picker/locale/th_TH';

dayjs.extend(buddhistEra);
dayjs.locale('th');

/** Override yearFormat/cellYearFormat with BBBB so the picker shows พ.ศ. */
const buddhistLocale: typeof th = {
  ...th,
  lang: {
    ...th.lang,
    fieldDateFormat: 'D MMM BBBB',
    fieldDateTimeFormat: 'D MMM BBBB HH:mm:ss',
    yearFormat: 'BBBB',
    cellYearFormat: 'BBBB',
  },
};

export interface ThaiDatePickerProps {
  /** ISO date string YYYY-MM-DD */
  value?: string;
  onChange?: (iso: string) => void;
  placeholder?: string;
  /** Extra CSS class applied to the antd DatePicker wrapper */
  className?: string;
  required?: boolean;
  disabled?: boolean;
  /** Minimum date (ISO YYYY-MM-DD) */
  minDate?: string;
  /** Maximum date (ISO YYYY-MM-DD) */
  maxDate?: string;
}

export function ThaiDatePicker({
  value,
  onChange,
  placeholder = 'เลือกวันที่',
  className,
  required,
  disabled,
  minDate,
  maxDate,
}: ThaiDatePickerProps) {
  const dayjsValue = value ? dayjs(value) : null;

  function handleChange(date: Dayjs | null) {
    onChange?.(date ? date.format('YYYY-MM-DD') : '');
  }

  function disabledDate(d: Dayjs) {
    if (minDate && d.isBefore(dayjs(minDate), 'day')) return true;
    if (maxDate && d.isAfter(dayjs(maxDate), 'day')) return true;
    return false;
  }

  return (
    <DatePicker
      locale={buddhistLocale}
      value={dayjsValue}
      onChange={handleChange}
      placeholder={placeholder}
      format={(d) => d.format('D MMM BBBB')}
      required={required}
      disabled={disabled}
      disabledDate={minDate || maxDate ? disabledDate : undefined}
      style={{ width: '100%' }}
      className={className}
    />
  );
}
