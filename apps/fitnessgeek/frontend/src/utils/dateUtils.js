/**
 * Date utility functions for consistent local timezone handling
 */

/**
 * Get today's date in YYYY-MM-DD format using local timezone
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const getTodayLocal = () => {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Format a Date object to YYYY-MM-DD format using local timezone
 * @param {Date} date - Date object to format
 * @returns {string} Date string in YYYY-MM-DD format
 */
export const formatDateLocal = (date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Parse a date string and return a Date object in local timezone
 * @param {string} dateString - Date string in YYYY-MM-DD format
 * @returns {Date} Date object in local timezone
 */
export const parseDateLocal = (dateString) => {
  const [year, month, day] = dateString.split('-').map(Number);
  return new Date(year, month - 1, day);
};

/**
 * Get the start of day in local timezone for a given date
 * @param {Date|string} date - Date object or date string
 * @returns {Date} Start of day in local timezone
 */
export const getStartOfDayLocal = (date) => {
  const d = typeof date === 'string' ? parseDateLocal(date) : new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Get the end of day in local timezone for a given date
 * @param {Date|string} date - Date object or date string
 * @returns {Date} End of day in local timezone
 */
export const getEndOfDayLocal = (date) => {
  const d = typeof date === 'string' ? parseDateLocal(date) : new Date(date);
  d.setHours(23, 59, 59, 999);
  return d;
};

/**
 * Check if two dates are the same day in local timezone
 * @param {Date|string} date1 - First date
 * @param {Date|string} date2 - Second date
 * @returns {boolean} True if same day
 */
export const isSameDayLocal = (date1, date2) => {
  const d1 = typeof date1 === 'string' ? parseDateLocal(date1) : new Date(date1);
  const d2 = typeof date2 === 'string' ? parseDateLocal(date2) : new Date(date2);

  return d1.getFullYear() === d2.getFullYear() &&
         d1.getMonth() === d2.getMonth() &&
         d1.getDate() === d2.getDate();
};