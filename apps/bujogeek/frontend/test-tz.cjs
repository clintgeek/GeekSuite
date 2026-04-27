const { differenceInCalendarDays } = require('date-fns');

// User's browser simulates:
const now = new Date('2026-04-27T17:30:00-05:00'); // 5:30 PM CDT
const due = new Date(now);
due.setHours(9, 0, 0, 0); // 9:00 AM CDT

console.log("Client sends:", due.toISOString()); // Should be 2026-04-27T14:00:00.000Z

// Server receives:
const serverReceivedStr = due.toISOString();
const serverDate = new Date(serverReceivedStr); // Date scalar parseValue

// Server getTasksForDateRange:
const dateStr = '2026-04-27';
const parts = dateStr.split('T')[0].split('-').map(Number);
const startOfDayDate = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2], 0, 0, 0, 0));
const endOfDayDate = new Date(startOfDayDate);
endOfDayDate.setUTCHours(23, 59, 59, 999);

console.log("Server Query Start:", startOfDayDate.toISOString());
console.log("Server Query End:", endOfDayDate.toISOString());

// Is task in range?
console.log("Is Task In Range?", serverDate >= startOfDayDate && serverDate <= endOfDayDate);

// Client receives back:
const clientReceivedDue = new Date(serverDate.toISOString());

const diffDays = differenceInCalendarDays(clientReceivedDue, now);
console.log("Client diffDays:", diffDays);
