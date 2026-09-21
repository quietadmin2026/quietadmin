import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  Archive,
  BarChart3,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  Clock3,
  CreditCard,
  Download,
  FileJson,
  FolderOpen,
  History,
  Import,
  LayoutDashboard,
  Mail,
  MessageCircle,
  Pencil,
  Plus,
  ReceiptText,
  RefreshCcw,
  RotateCcw,
  Search,
  Settings,
  Trash2,
  Users,
  WalletCards,
  X,
  Cloud,
  CloudOff,
  LogOut,
  FileText,
  Copy,
} from 'lucide-react';
import { useGoogleDrive } from './googleDrive.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const CURRENCY_OPTIONS = ['INR', 'USD', 'EUR', 'GBP', 'AUD', 'CAD', 'SGD', 'AED'];
const CURRENCY_LOCALES = { INR: 'en-IN' };

function makeCurrencyFormatter(code) {
  try {
    return new Intl.NumberFormat(CURRENCY_LOCALES[code] || undefined, {
      style: 'currency',
      currency: code || 'INR',
      currencyDisplay: 'narrowSymbol',
      maximumFractionDigits: 0,
    });
  } catch {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', currencyDisplay: 'narrowSymbol', maximumFractionDigits: 0 });
  }
}

let currencyFormatter = makeCurrencyFormatter('INR');
let activeCurrencyCode = 'INR';

// Called during render from the settings currency so every formatMoney() below
// reflects the therapist's chosen currency.
function setActiveCurrency(code) {
  if (code && code !== activeCurrencyCode) {
    activeCurrencyCode = code;
    currencyFormatter = makeCurrencyFormatter(code);
  }
}

function formatMoney(amount) {
  return currencyFormatter.format(amount || 0);
}

// Today's local date, computed fresh each call. The app keeps this in state and
// refreshes it at midnight / on refocus so a session left open past midnight
// doesn't stay stuck on yesterday (see useToday).
function computeToday() {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}

// A reactive "today" (YYYY-MM-DD) that updates when the local date rolls over:
// a timer fires just after the next midnight, and refocus/visibility acts as a
// backstop for a machine that was asleep. Updating state re-renders date-driven
// views and re-runs the reconcile effects, so the new day fills in on its own.
function useToday() {
  const [today, setToday] = useState(computeToday);
  useEffect(() => {
    let timer;
    const sync = () => setToday((prev) => { const now = computeToday(); return now === prev ? prev : now; });
    const scheduleMidnight = () => {
      const now = new Date();
      const nextMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 5);
      timer = window.setTimeout(() => { sync(); scheduleMidnight(); }, nextMidnight.getTime() - now.getTime());
    };
    scheduleMidnight();
    const onVisible = () => { if (!document.hidden) sync(); };
    window.addEventListener('focus', sync);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('focus', sync);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, []);
  return today;
}

const initialSettings = {
  therapistName: '',
  practiceName: '',
  paymentDetails: '',
  currency: 'INR',
  autoCreateCharges: true,
  lateCancellationHours: 24,
  lateCancellationCharge: 100,
  monthlyStatements: true,
  outstandingReminders: true,
  profileComplete: false,
};

const SAMPLE_CLIENTS = [
  {
    id: 'c1',
    name: 'Meera Shah',
    email: 'meera@example.com',
    phone: '+91 98765 12340',
    type: 'Individual',
    billingModel: 'Per Session',
    sessionRate: 2500,
    monthlyFee: 0,
    collectionMethod: 'Pay After Session',
    scheduleType: 'Recurring',
    day: 'Wednesday',
    time: '10:00',
    duration: 60,
    reminder: 'WhatsApp',
    tags: ['Student', 'Scholarship'],
    notes: 'Prefers morning reminders.',
    status: 'Active',
    cancellationRule: 'Use Practice Default',
  },
  {
    id: 'c2',
    name: 'Kabir Menon',
    email: 'kabir@example.com',
    phone: '+91 99887 11223',
    type: 'Individual',
    billingModel: 'Subscription',
    sessionRate: 0,
    monthlyFee: 12000,
    collectionMethod: 'Monthly Invoice',
    scheduleType: 'Recurring',
    day: 'Wednesday',
    time: '12:00',
    duration: 60,
    reminder: 'Both',
    tags: ['Corporate'],
    notes: 'Monthly invoice on first working day.',
    status: 'Active',
    cancellationRule: 'Use Practice Default',
  },
  {
    id: 'c3',
    name: 'Nisha Rao',
    email: 'nisha@example.com',
    phone: '+91 90000 44556',
    type: 'Supervision',
    billingModel: 'Per Session',
    sessionRate: 3000,
    monthlyFee: 0,
    collectionMethod: 'Advance Deposit',
    scheduleType: 'Manual',
    day: '',
    time: '',
    duration: 50,
    reminder: 'Email',
    tags: ['Referral'],
    notes: 'Usually pays in advance.',
    status: 'Active',
    cancellationRule: 'Custom',
    customLateHours: 12,
    customCharge: 50,
  },
  {
    id: 'c4',
    name: 'Rohan Iyer',
    email: 'rohan@example.com',
    phone: '+91 98888 00011',
    type: 'Individual',
    billingModel: 'Per Session',
    sessionRate: 2200,
    monthlyFee: 0,
    collectionMethod: 'Pay Before Session',
    scheduleType: 'Recurring',
    day: 'Friday',
    time: '17:00',
    duration: 60,
    reminder: 'None',
    tags: ['Pro Bono'],
    notes: 'Reduced fee arrangement.',
    status: 'Archived',
    cancellationRule: 'Use Practice Default',
  },
];

const SAMPLE_GROUPS = [
  {
    id: 'g1',
    name: 'Anxiety Skills Circle',
    type: 'Therapy',
    capacity: 8,
    billingModel: 'Per Session',
    sessionFee: 1200,
    schedule: 'Every Tuesday, 6:00 PM, 90 minutes',
    status: 'Active',
    notes: 'Psychoeducation and practice group.',
    members: ['c1', 'c4'],
  },
  {
    id: 'g2',
    name: 'Peer Supervision Pod',
    type: 'Supervision',
    capacity: 6,
    billingModel: 'Subscription',
    sessionFee: 4500,
    schedule: 'Second Saturday, 11:00 AM, 120 minutes',
    status: 'Active',
    notes: 'Monthly supervision format.',
    members: ['c3'],
  },
];

const SAMPLE_SESSIONS = [
  { id: 's1', clientId: 'c1', date: '2026-06-10', time: '10:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's2', clientId: 'c2', date: '2026-06-10', time: '12:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's3', clientId: 'c3', date: '2026-06-10', time: '15:30', duration: 50, status: 'Late Cancel', chargeId: 'ch3' },
  { id: 's4', clientId: 'c1', date: '2026-06-03', time: '10:00', duration: 60, status: 'Present', chargeId: 'ch1' },
  { id: 's5', clientId: 'c2', date: '2026-06-04', time: '12:00', duration: 60, status: 'Present', chargeId: null },
  { id: 's6', clientId: 'c1', date: '2026-06-17', time: '10:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's7', clientId: 'c3', date: '2026-06-20', time: '11:00', duration: 50, status: 'Scheduled', chargeId: null },
  { id: 's8', clientId: 'c2', date: '2026-06-24', time: '12:00', duration: 60, status: 'Scheduled', chargeId: null },
];

const SAMPLE_CHARGES = [
  { id: 'ch1', clientId: 'c1', date: '2026-06-03', amount: 2500, reason: 'Session Fee', status: 'Paid' },
  { id: 'ch2', clientId: 'c2', date: '2026-06-01', amount: 12000, reason: 'Subscription Fee', status: 'Partially Paid' },
  { id: 'ch3', clientId: 'c3', date: '2026-06-10', amount: 1500, reason: 'Late Cancellation', status: 'Pending' },
  { id: 'ch4', clientId: 'c1', date: '2026-05-28', amount: 2500, reason: 'Session Fee', status: 'Pending' },
];

const SAMPLE_PAYMENTS = [
  { id: 'p1', clientId: 'c1', date: '2026-06-05', amount: 2000, method: 'UPI', reference: 'UPI-2048', notes: 'Partial payment' },
  { id: 'p2', clientId: 'c2', date: '2026-06-02', amount: 8000, method: 'Bank Transfer', reference: 'NEFT-991', notes: 'June subscription part payment' },
  { id: 'p3', clientId: 'c3', date: '2026-05-31', amount: 6000, method: 'UPI', reference: 'UPI-1180', notes: 'Advance deposit' },
];

const navItems = [
  ['Dashboard', LayoutDashboard],
  ['Schedule', CalendarDays],
  ['Clients', Users],
  ['Groups', FolderOpen],
  ['Payments', CreditCard],
  ['Statements', FileText],
  ['Reports', BarChart3],
  ['Settings', Settings],
];

const STORAGE_PREFIX = 'quietadmin:';
const STORAGE_KEYS = ['settings', 'clients', 'groups', 'sessions', 'groupSessions', 'charges', 'payments'];

// Guard against corrupt/legacy data: arrays must stay arrays, settings stays an
// object (merged over defaults so new fields are never missing). Anything of the
// wrong type falls back to the seed instead of crashing the app.
function normalizeData(value, initialValue) {
  if (Array.isArray(initialValue)) return Array.isArray(value) ? value : initialValue;
  if (initialValue && typeof initialValue === 'object') {
    return value && typeof value === 'object' && !Array.isArray(value) ? { ...initialValue, ...value } : initialValue;
  }
  return value ?? initialValue;
}

function usePersistentState(key, initialValue) {
  const storageKey = `${STORAGE_PREFIX}${key}`;
  const [state, setState] = useState(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      return stored !== null ? normalizeData(JSON.parse(stored), initialValue) : initialValue;
    } catch {
      return initialValue;
    }
  });
  useEffect(() => {
    try {
      window.localStorage.setItem(storageKey, JSON.stringify(state));
    } catch {
      // Ignore write failures (private mode, quota, disabled storage).
    }
  }, [storageKey, state]);
  return [state, setState];
}

function toDate(value) {
  return new Date(`${value}T00:00:00`);
}

function greetingFor(date = new Date()) {
  const hour = date.getHours();
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return toDate(value).toLocaleDateString('en-IN', options);
}

function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

function monthLabel(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' });
}

function monthShort(period) {
  const [year, month] = period.split('-').map(Number);
  return new Date(year, month - 1, 1).toLocaleDateString('en-IN', { month: 'short' });
}

function endOfMonthIso(period) {
  const [year, month] = period.split('-').map(Number);
  const last = new Date(year, month, 0).getDate();
  return `${period}-${String(last).padStart(2, '0')}`;
}

function recentMonths(count, fromIso) {
  const [year, month] = fromIso.slice(0, 7).split('-').map(Number);
  const out = [];
  for (let i = 0; i < count; i += 1) {
    const d = new Date(year, month - 1 - i, 1);
    out.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`);
  }
  return out;
}

// Read-only monthly statement for one client: session counts from the schedule,
// money from the ledger (charges/payments), so it always matches Outstanding.
function computeMonthlyStatement(client, period, sessions, charges, payments) {
  const inMonth = (dateStr) => monthKey(dateStr) === period;
  const start = `${period}-01`;
  const eom = endOfMonthIso(period);

  const clientSessions = sessions.filter((s) => s.clientId === client.id);
  const attended = clientSessions.filter((s) => s.status === 'Present' && inMonth(s.date)).length;
  const lateCancels = clientSessions.filter((s) => s.status === 'Late Cancel' && inMonth(s.date)).length;
  const cancellations = clientSessions.filter((s) => s.status === 'Cancelled' && inMonth(s.date)).length;

  const clientCharges = charges.filter((c) => c.clientId === client.id);
  const clientPayments = payments.filter((p) => p.clientId === client.id);
  const monthCharges = clientCharges.filter((c) => inMonth(c.date));
  const monthPayments = clientPayments.filter((p) => inMonth(p.date));
  const sumReason = (list, reason) => list.filter((c) => c.reason === reason).reduce((sum, c) => sum + c.amount, 0);

  const sessionFees = sumReason(monthCharges, 'Session Fee');
  const lateFees = sumReason(monthCharges, 'Late Cancellation');
  const otherCharges = monthCharges
    .filter((c) => c.reason !== 'Session Fee' && c.reason !== 'Late Cancellation')
    .reduce((sum, c) => sum + c.amount, 0);
  const chargesTotal = monthCharges.reduce((sum, c) => sum + c.amount, 0);
  const paymentsTotal = monthPayments.reduce((sum, p) => sum + p.amount, 0);

  const chargesBefore = clientCharges.filter((c) => c.date < start).reduce((sum, c) => sum + c.amount, 0);
  const paymentsBefore = clientPayments.filter((p) => p.date < start).reduce((sum, p) => sum + p.amount, 0);
  const broughtForward = chargesBefore - paymentsBefore;

  const chargesToDate = clientCharges.filter((c) => c.date <= eom).reduce((sum, c) => sum + c.amount, 0);
  const paymentsToDate = clientPayments.filter((p) => p.date <= eom).reduce((sum, p) => sum + p.amount, 0);
  const net = chargesToDate - paymentsToDate;

  return {
    clientId: client.id,
    clientName: client.name,
    reminder: client.reminder,
    period,
    attended,
    lateCancels,
    cancellations,
    sessionFees,
    lateFees,
    otherCharges,
    chargesTotal,
    paymentsTotal,
    broughtForward,
    outstanding: Math.max(net, 0),
    credit: Math.max(-net, 0),
    hasActivity: Boolean(attended || lateCancels || cancellations || monthCharges.length || monthPayments.length),
  };
}

function formatStatementText(statement, settings) {
  const money = (n) => formatMoney(n);
  const label = monthLabel(statement.period);
  const lines = [
    `${settings.practiceName} — Statement for ${label}`,
    '',
    `Hi ${statement.clientName},`,
    `Here is your summary for ${label}:`,
    `- Sessions attended: ${statement.attended} (${money(statement.sessionFees)})`,
  ];
  if (statement.lateCancels) lines.push(`- Late cancellations: ${statement.lateCancels} (${money(statement.lateFees)})`);
  if (statement.cancellations) lines.push(`- Cancellations: ${statement.cancellations}`);
  if (statement.otherCharges) lines.push(`- Other charges: ${money(statement.otherCharges)}`);
  lines.push(`- Payments received: ${money(statement.paymentsTotal)}`);
  if (statement.broughtForward > 0) lines.push(`- Brought forward: ${money(statement.broughtForward)}`);
  if (statement.broughtForward < 0) lines.push(`- Credit brought forward: ${money(-statement.broughtForward)}`);
  lines.push('');
  if (statement.outstanding > 0) {
    lines.push(`Outstanding: ${money(statement.outstanding)}`);
    if (settings.paymentDetails) lines.push(`Pay via ${settings.paymentDetails}`);
  } else if (statement.credit > 0) {
    lines.push(`Credit balance: ${money(statement.credit)}`);
  } else {
    lines.push('Balance settled — thank you!');
  }
  lines.push('', `— ${settings.therapistName}`);
  return lines.join('\n');
}

// A short, gentle nudge for a client who still owes money — separate from the
// full monthly statement above.
function formatReminderText(statement, settings, label) {
  const lines = [
    `${settings.practiceName} — payment reminder`,
    '',
    `Hi ${statement.clientName},`,
    `A gentle reminder that ${formatMoney(statement.outstanding)} is outstanding on your account${label ? ` as of ${label}` : ''}.`,
  ];
  if (settings.paymentDetails) lines.push(`You can pay via ${settings.paymentDetails}.`);
  lines.push('Thank you!', '', `— ${settings.therapistName}`);
  return lines.join('\n');
}

// Deep links that open a prefilled message for the therapist to review and send
// — nothing is sent automatically. wa.me needs a country-code number with no
// punctuation; mailto carries a subject and body.
function whatsappUrl(phone, text) {
  const digits = String(phone || '').replace(/\D/g, '');
  return digits ? `https://wa.me/${digits}?text=${encodeURIComponent(text)}` : '';
}

function mailtoUrl(email, subject, body) {
  if (!email) return '';
  return `mailto:${email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

// --- CSV import/export -------------------------------------------------------

const CLIENT_CSV_COLUMNS = [
  'Name', 'Email', 'Phone', 'Type', 'Billing Model', 'Session Rate', 'Monthly Fee',
  'Collection Method', 'Schedule Type', 'Session Day', 'Session Time',
  'Session Day 2', 'Session Time 2', 'Duration', 'Reminder Preference',
  'Tags', 'Joining Date', 'Status', 'Notes',
];

// A marked, self-documenting example row. The importer skips any row whose Name
// begins with "example", so it can ride along in every export harmlessly.
const CLIENT_CSV_EXAMPLE = [
  'EXAMPLE - edit or delete this row', 'jane@example.com', '+91 90000 00000',
  'Individual', 'Per Session', '2500', '0', 'Pay After Session', 'Recurring',
  'Tuesday', '10:00', 'Friday', '17:00', '60', 'WhatsApp', 'Student;Scholarship',
  '2026-01-15', 'Active', 'Sliding scale; prefers mornings.',
];

const CLIENT_CSV_ENUMS = {
  type: ['Individual', 'Group', 'Supervision'],
  billingModel: ['Per Session', 'Subscription', 'Custom'],
  collectionMethod: ['Pay Before Session', 'Pay After Session', 'Monthly Invoice', 'Advance Deposit'],
  scheduleType: ['Recurring', 'Manual'],
  reminder: ['Email', 'WhatsApp', 'Both', 'None'],
  status: ['Active', 'Archived'],
  day: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'],
};


function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

// RFC-4180-style parser for a chosen delimiter: handles quoted fields with
// embedded delimiters/quotes/newlines. Strips a leading BOM from Excel exports.
function parseDelimited(text, delimiter) {
  const normalized = text.replace(/^﻿/, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < normalized.length; i += 1) {
    const ch = normalized[i];
    if (inQuotes) {
      if (ch === '"') {
        if (normalized[i + 1] === '"') { field += '"'; i += 1; } else { inQuotes = false; }
      } else {
        field += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delimiter) {
      row.push(field);
      field = '';
    } else if (ch === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else {
      field += ch;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

// Detect comma vs tab from the first line so a spreadsheet paste (tab-separated)
// works as well as a downloaded CSV.
function parseTable(text) {
  const firstLine = text.replace(/^﻿/, '').split(/\r?\n/, 1)[0] || '';
  const tabs = (firstLine.match(/\t/g) || []).length;
  const commas = (firstLine.match(/,/g) || []).length;
  return parseDelimited(text, tabs > commas ? '\t' : ',');
}

function clientToCsvRow(client) {
  return [
    client.name || '', client.email || '', client.phone || '', client.type || '', client.billingModel || '',
    client.sessionRate ?? '', client.monthlyFee ?? '', client.collectionMethod || '', client.scheduleType || '',
    client.day || '', client.time || '', client.day2 || '', client.time2 || '', client.duration ?? '', client.reminder || '',
    (client.tags || []).join(';'), client.joiningDate || '', client.status || '', client.notes || '',
  ];
}

function scheduleSummary(client) {
  const slots = [];
  if (client.day) slots.push(`${client.day}${client.time ? ` ${client.time}` : ''}`);
  if (client.day2) slots.push(`${client.day2}${client.time2 ? ` ${client.time2}` : ''}`);
  const base = client.scheduleType || 'Manual';
  return slots.length ? `${base} - ${slots.join(', ')}` : base;
}

// The importable client fields, each with the header names we recognise for it.
// Only Name is required; everything else defaults when blank or unreadable.
const IMPORT_FIELDS = [
  { key: 'name', label: 'Name', kind: 'text', aliases: ['name', 'full name', 'client', 'client name', 'patient'] },
  { key: 'email', label: 'Email', kind: 'text', aliases: ['email', 'email address', 'e mail'] },
  { key: 'phone', label: 'Phone', kind: 'text', aliases: ['phone', 'mobile', 'contact', 'phone number', 'cell', 'mobile number', 'contact number'] },
  { key: 'type', label: 'Type', kind: 'enum', options: CLIENT_CSV_ENUMS.type, def: 'Individual', aliases: ['type', 'client type'] },
  { key: 'billingModel', label: 'Billing Model', kind: 'enum', options: CLIENT_CSV_ENUMS.billingModel, def: 'Per Session', aliases: ['billing model', 'billing', 'plan'] },
  { key: 'sessionRate', label: 'Session Rate', kind: 'number', def: 0, aliases: ['session rate', 'rate', 'fee', 'session fee', 'price', 'amount'] },
  { key: 'monthlyFee', label: 'Monthly Fee', kind: 'number', def: 0, aliases: ['monthly fee', 'subscription fee', 'monthly', 'retainer'] },
  { key: 'collectionMethod', label: 'Collection Method', kind: 'enum', options: CLIENT_CSV_ENUMS.collectionMethod, def: 'Pay After Session', aliases: ['collection method', 'payment timing', 'collection'] },
  { key: 'scheduleType', label: 'Schedule Type', kind: 'enum', options: CLIENT_CSV_ENUMS.scheduleType, def: 'Manual', aliases: ['schedule type', 'schedule'] },
  { key: 'day', label: 'Session Day', kind: 'day', aliases: ['session day', 'day', 'weekday'] },
  { key: 'time', label: 'Session Time', kind: 'time', aliases: ['session time', 'time'] },
  { key: 'day2', label: 'Session Day 2', kind: 'day', aliases: ['session day 2', 'day 2', 'second day'] },
  { key: 'time2', label: 'Session Time 2', kind: 'time', aliases: ['session time 2', 'time 2', 'second time'] },
  { key: 'duration', label: 'Duration', kind: 'number', def: 60, aliases: ['duration', 'length', 'minutes', 'mins'] },
  { key: 'reminder', label: 'Reminder Preference', kind: 'enum', options: CLIENT_CSV_ENUMS.reminder, def: 'None', aliases: ['reminder preference', 'reminder', 'reminders'] },
  { key: 'tags', label: 'Tags', kind: 'tags', aliases: ['tags', 'labels', 'groups'] },
  { key: 'joiningDate', label: 'Joining Date', kind: 'date', aliases: ['joining date', 'start date', 'since', 'joined', 'date joined'] },
  { key: 'status', label: 'Status', kind: 'enum', options: CLIENT_CSV_ENUMS.status, def: 'Active', aliases: ['status', 'active'] },
  { key: 'notes', label: 'Notes', kind: 'text', aliases: ['notes', 'note', 'comments', 'remarks'] },
];

const IMPORT_FIELD_BY_KEY = Object.fromEntries(IMPORT_FIELDS.map((field) => [field.key, field]));

// Header text (any casing/spacing/underscores) → field key.
const IMPORT_ALIAS_TO_KEY = (() => {
  const map = {};
  for (const field of IMPORT_FIELDS) {
    map[field.key] = field.key;
    for (const alias of field.aliases) map[alias] = field.key;
  }
  return map;
})();

// Common human spellings for each enum value, so "1:1", "sub", "weekly" resolve.
const ENUM_SYNONYMS = {
  Individual: ['individual', '1:1', '1-1', 'solo', 'one on one', 'personal', 'indiv'],
  Group: ['group', 'grp'],
  Supervision: ['supervision', 'supervisee', 'supervisor', 'superv'],
  'Per Session': ['per session', 'session', 'pay per session', 'per-session', 'sessional', 'hourly'],
  Subscription: ['subscription', 'monthly', 'retainer', 'package', 'sub'],
  Custom: ['custom', 'other', 'mixed'],
  'Pay Before Session': ['pay before session', 'before', 'advance', 'prepay', 'upfront'],
  'Pay After Session': ['pay after session', 'after', 'postpay', 'on the day'],
  'Monthly Invoice': ['monthly invoice', 'invoice', 'billed monthly'],
  'Advance Deposit': ['advance deposit', 'deposit', 'prepaid'],
  Recurring: ['recurring', 'weekly', 'repeat', 'fixed', 'standing'],
  Manual: ['manual', 'adhoc', 'ad hoc', 'one off', 'one-off', 'as needed'],
  Email: ['email', 'e mail', 'mail'],
  WhatsApp: ['whatsapp', 'wa', 'whats app', 'whatapp'],
  Both: ['both', 'all', 'email and whatsapp'],
  None: ['none', 'no', 'off', 'nil'],
  Active: ['active', 'current', 'yes', 'on', 'ongoing'],
  Archived: ['archived', 'inactive', 'former', 'closed', 'ended', 'past', 'discharged'],
};

const IMPORT_DAYS = CLIENT_CSV_ENUMS.day;

function normalizeHeader(text) {
  return String(text || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');
}

// Auto-map each column of a header row to a field key ('' = unmapped).
function autoMapColumns(headerCells) {
  return headerCells.map((cell) => IMPORT_ALIAS_TO_KEY[normalizeHeader(cell)] || '');
}

function cleanNumber(raw) {
  const stripped = String(raw || '').replace(/[^0-9.\-]/g, '');
  if (stripped === '' || stripped === '-' || stripped === '.') return null;
  const n = Number(stripped);
  return Number.isNaN(n) ? null : n;
}

function matchEnumLoose(raw, options) {
  const target = String(raw || '').trim().toLowerCase();
  if (!target) return null;
  for (const option of options) if (option.toLowerCase() === target) return option;
  for (const option of options) {
    const syns = ENUM_SYNONYMS[option] || [];
    if (syns.includes(target)) return option;
    if (target.length >= 2 && (syns.some((s) => s.includes(target) || target.includes(s)) || option.toLowerCase().includes(target))) return option;
  }
  return null;
}

function matchDay(raw) {
  const target = String(raw || '').trim().toLowerCase();
  if (!target) return '';
  return IMPORT_DAYS.find((day) => day.toLowerCase() === target || day.toLowerCase().startsWith(target.slice(0, 3))) || null;
}

function normalizeTime(raw) {
  const target = String(raw || '').trim();
  if (!target) return '';
  let m = target.match(/^(\d{1,2}):(\d{2})\s*([ap]\.?m\.?)?$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = (m[3] || '').toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (h > 23 || Number(m[2]) > 59) return null;
    return `${String(h).padStart(2, '0')}:${m[2]}`;
  }
  m = target.match(/^(\d{1,2})\s*([ap]\.?m\.?)$/i);
  if (m) {
    let h = Number(m[1]);
    const ap = m[2].toLowerCase();
    if (ap.startsWith('p') && h < 12) h += 12;
    if (ap.startsWith('a') && h === 12) h = 0;
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }
  m = target.match(/^(\d{1,2})$/);
  if (m && Number(m[1]) <= 23) return `${String(Number(m[1])).padStart(2, '0')}:00`;
  return null;
}

function normalizeDate(raw) {
  const target = String(raw || '').trim();
  if (!target) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(target)) return target;
  const m = target.match(/^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{2,4})$/);
  if (m) {
    const y = m[3].length === 2 ? `20${m[3]}` : m[3];
    const a = Number(m[1]);
    const b = Number(m[2]);
    // Ambiguous d/m vs m/d: use whichever is unambiguous, else assume day-first.
    const day = a > 12 ? a : b > 12 ? b : a;
    const mon = a > 12 ? b : b > 12 ? a : b;
    if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
    return `${y}-${String(mon).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parsed = new Date(target);
  return Number.isNaN(parsed.getTime()) ? null : isoOf(parsed);
}

// Build one client from its mapped values. Never fails on a bad cell — it
// defaults and records a warning — so only a missing Name stops a row.
function buildClient(getValue) {
  const warnings = [];
  const enumField = (key, def) => {
    const raw = getValue(key);
    if (!raw) return def;
    const match = matchEnumLoose(raw, IMPORT_FIELD_BY_KEY[key].options);
    if (match) return match;
    warnings.push(`${IMPORT_FIELD_BY_KEY[key].label} “${raw}” not recognised — used ${def}`);
    return def;
  };
  const numField = (key, def) => {
    const raw = getValue(key);
    if (!raw) return def;
    const n = cleanNumber(raw);
    if (n !== null) return n;
    warnings.push(`${IMPORT_FIELD_BY_KEY[key].label} “${raw}” isn’t a number — used ${def}`);
    return def;
  };
  const dayField = (key) => {
    const raw = getValue(key);
    if (!raw) return '';
    const match = matchDay(raw);
    if (match) return match;
    warnings.push(`${IMPORT_FIELD_BY_KEY[key].label} “${raw}” isn’t a weekday — left blank`);
    return '';
  };
  const timeField = (key) => {
    const raw = getValue(key);
    if (!raw) return '';
    const match = normalizeTime(raw);
    if (match !== null) return match;
    warnings.push(`${IMPORT_FIELD_BY_KEY[key].label} “${raw}” isn’t a time — left blank`);
    return '';
  };

  let joiningDate = '';
  const dateRaw = getValue('joiningDate');
  if (dateRaw) {
    const parsed = normalizeDate(dateRaw);
    if (parsed) joiningDate = parsed;
    else warnings.push(`Joining Date “${dateRaw}” isn’t a date — left blank`);
  }
  const rawDuration = numField('duration', 60);

  const client = {
    name: getValue('name').trim(),
    email: getValue('email'),
    phone: getValue('phone'),
    type: enumField('type', 'Individual'),
    billingModel: enumField('billingModel', 'Per Session'),
    sessionRate: numField('sessionRate', 0),
    monthlyFee: numField('monthlyFee', 0),
    collectionMethod: enumField('collectionMethod', 'Pay After Session'),
    scheduleType: enumField('scheduleType', 'Manual'),
    day: dayField('day'),
    time: timeField('time'),
    day2: dayField('day2'),
    time2: timeField('time2'),
    duration: rawDuration > 0 ? rawDuration : 60,
    reminder: enumField('reminder', 'None'),
    tags: getValue('tags') ? getValue('tags').split(/[;,]/).map((t) => t.trim()).filter(Boolean) : [],
    joiningDate,
    notes: getValue('notes'),
    status: enumField('status', 'Active'),
    cancellationRule: 'Use Practice Default',
  };
  return { client, warnings };
}

// Turn parsed rows + a column→field mapping into importable clients. Blank rows
// and the template's EXAMPLE row are ignored; a row with no Name is skipped; a
// name+phone already present (existing or earlier in the file) is a duplicate.
function runClientImport({ rows, mapping, hasHeader, existingClients }) {
  const dataRows = hasHeader ? rows.slice(1) : rows;
  const normName = (s) => (s || '').trim().toLowerCase();
  const normPhone = (s) => (s || '').replace(/\D/g, '');
  const seen = new Set((existingClients || []).map((c) => `${normName(c.name)}|${normPhone(c.phone)}`));
  const accepted = [];
  const skipped = [];
  const stamp = Date.now();

  dataRows.forEach((raw, i) => {
    if (raw.every((cell) => String(cell ?? '').trim() === '')) return;
    const rowNum = i + (hasHeader ? 2 : 1);
    const getValue = (key) => {
      const idx = mapping.indexOf(key);
      return idx >= 0 ? String(raw[idx] ?? '').trim() : '';
    };
    const name = getValue('name').trim();
    if (name.toLowerCase().startsWith('example')) return;
    if (!name) { skipped.push({ row: rowNum, name: '(blank)', reason: 'no Name' }); return; }

    const { client, warnings } = buildClient(getValue);
    const key = `${normName(name)}|${normPhone(client.phone)}`;
    if (seen.has(key)) { skipped.push({ row: rowNum, name, reason: 'duplicate (Name + Phone)' }); return; }
    seen.add(key);
    client.id = `c${stamp}${accepted.length}`;
    accepted.push({ client, warnings });
  });

  return { accepted, skipped };
}

function isInPeriod(date, view, today) {
  const target = toDate(date);
  const start = toDate(today);
  if (view === 'Today') return date === today;
  if (view === 'Week') {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return target >= start && target <= end;
  }
  return target.getFullYear() === start.getFullYear() && target.getMonth() === start.getMonth();
}

// How far ahead recurring clients' weekly slots are materialized into sessions.
const RECURRING_HORIZON_DAYS = 28;
const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

function isoOf(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function isoAddDays(iso, days) {
  const d = toDate(iso);
  d.setDate(d.getDate() + days);
  return isoOf(d);
}

// Monday-anchored start of the week containing `iso`.
function startOfWeekIso(iso) {
  const d = toDate(iso);
  const back = (d.getDay() + 6) % 7; // 0 for Monday … 6 for Sunday
  d.setDate(d.getDate() - back);
  return isoOf(d);
}

// A recurring client's weekly slots: the primary day/time and an optional second.
function clientSlots(client) {
  const slots = [];
  if (client.day && client.time) slots.push({ day: client.day, time: client.time });
  if (client.day2 && client.time2) slots.push({ day: client.day2, time: client.time2 });
  return slots;
}

// Keep the session list in sync with clients' recurring schedules:
//   - materialize any missing weekly slots from today through the horizon,
//   - remove app-generated, still-Scheduled, future sessions that no longer
//     match a valid slot (client archived, made manual, or their day/time moved).
// Only ever touches `auto` sessions that the therapist hasn't acted on; manual
// sessions, past sessions, and anything marked (Present/Cancelled/…) are left
// untouched. Returns the same array reference when nothing changes so callers
// can skip a state update. Session ids are deterministic per (client, date,
// time) so two devices generating the same slot never create a duplicate.
function reconcileRecurringSessions(clients, sessions, today) {
  const horizonEnd = isoAddDays(today, RECURRING_HORIZON_DAYS);
  const clientById = Object.fromEntries(clients.map((client) => [client.id, client]));

  const kept = sessions.filter((session) => {
    const stale = session.auto && session.status === 'Scheduled' && session.date >= today;
    if (!stale) return true;
    const client = clientById[session.clientId];
    if (!client || client.status !== 'Active' || client.scheduleType !== 'Recurring') return false;
    return clientSlots(client).some(
      (slot) => slot.time === session.time && WEEKDAYS[toDate(session.date).getDay()] === slot.day,
    );
  });

  const existing = new Set(kept.map((session) => `${session.clientId}|${session.date}|${session.time}`));
  const additions = [];
  for (const client of clients) {
    if (client.status !== 'Active' || client.scheduleType !== 'Recurring') continue;
    const startIso =
      ISO_DATE.test(client.joiningDate || '') && client.joiningDate > today ? client.joiningDate : today;
    for (const slot of clientSlots(client)) {
      const targetDow = WEEKDAYS.indexOf(slot.day);
      if (targetDow < 0) continue;
      const cursor = toDate(startIso);
      while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
      for (; ; cursor.setDate(cursor.getDate() + 7)) {
        const iso = isoOf(cursor);
        if (iso > horizonEnd) break;
        const key = `${client.id}|${iso}|${slot.time}`;
        if (existing.has(key)) continue;
        existing.add(key);
        additions.push({
          id: `auto-${client.id}-${iso}-${slot.time}`,
          clientId: client.id,
          date: iso,
          time: slot.time,
          duration: Number(client.duration) || 60,
          status: 'Scheduled',
          chargeId: null,
          auto: true,
        });
      }
    }
  }

  if (additions.length === 0 && kept.length === sessions.length) return sessions;
  return kept.concat(additions);
}

// Materialize weekly group meetings the same way individual recurring sessions
// work: for each Active group flagged recurring (with a day + time), fill in a
// group session for each occurrence from today through the horizon. Only auto,
// still-future, *unmarked* group sessions are pruned when a group stops
// recurring or moves its slot — once anyone's attendance is marked (and charges
// may exist) the meeting is left alone. Same-ref when nothing changes.
function reconcileGroupSessions(groups, groupSessions, today) {
  const horizonEnd = isoAddDays(today, RECURRING_HORIZON_DAYS);
  const groupById = Object.fromEntries(groups.map((group) => [group.id, group]));
  // A group's optional run window: no auto meeting before startDate or after endDate.
  const withinWindow = (group, iso) =>
    (!group.startDate || iso >= group.startDate) && (!group.endDate || iso <= group.endDate);
  const matchesSlot = (group, session) =>
    group && group.status === 'Active' && group.recurring && group.day && group.time
    && group.time === session.time && WEEKDAYS[toDate(session.date).getDay()] === group.day
    && withinWindow(group, session.date);

  const kept = groupSessions.filter((session) => {
    const unmarked = Object.keys(session.attendance || {}).length === 0;
    const prunable = session.auto && unmarked && session.date >= today;
    if (!prunable) return true;
    return matchesSlot(groupById[session.groupId], session);
  });

  const existing = new Set(kept.map((session) => `${session.groupId}|${session.date}|${session.time}`));
  const additions = [];
  for (const group of groups) {
    if (group.status !== 'Active' || !group.recurring || !group.day || !group.time) continue;
    const targetDow = WEEKDAYS.indexOf(group.day);
    if (targetDow < 0) continue;
    // Start no earlier than today or the group's start date, and stop at its end.
    const startBound = group.startDate && group.startDate > today ? group.startDate : today;
    const cursor = toDate(startBound);
    while (cursor.getDay() !== targetDow) cursor.setDate(cursor.getDate() + 1);
    for (; ; cursor.setDate(cursor.getDate() + 7)) {
      const iso = isoOf(cursor);
      if (iso > horizonEnd) break;
      if (group.endDate && iso > group.endDate) break;
      const key = `${group.id}|${iso}|${group.time}`;
      if (existing.has(key)) continue;
      existing.add(key);
      additions.push({
        id: `gauto-${group.id}-${iso}-${group.time}`,
        groupId: group.id,
        date: iso,
        time: group.time,
        duration: Number(group.duration) || 60,
        attendance: {},
        auto: true,
      });
    }
  }

  if (additions.length === 0 && kept.length === groupSessions.length) return groupSessions;
  return kept.concat(additions);
}

// Cap how far back a subscription client can be auto-billed on first run, so an
// old joining date can't suddenly generate years of charges.
const SUBSCRIPTION_BACKFILL_MONTHS = 12;

// Shift a YYYY-MM period by n months.
function addMonths(period, n) {
  const [year, month] = period.split('-').map(Number);
  const d = new Date(year, month - 1 + n, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
}

// Inclusive list of YYYY-MM periods from start through end (empty if start > end).
function monthsThrough(start, end) {
  const out = [];
  for (let cursor = start; cursor <= end && out.length <= 240; cursor = addMonths(cursor, 1)) {
    out.push(cursor);
  }
  return out;
}

// Materialize a monthly "Subscription Fee" charge for each active subscription
// client — from their joining month (bounded to a year of back-billing) through
// the current month. Idempotent: a month is skipped when that client already
// has a Subscription Fee charge in it (auto OR manual), so it never duplicates
// and, unlike the session engine, never removes anything — charges are money and
// may already be paid, so a changed plan or fee just stops future generation and
// leaves prior charges to be voided by hand. Same array reference when unchanged.
function reconcileSubscriptionCharges(clients, charges, autoCreate, today) {
  if (!autoCreate) return charges;
  const currentMonth = monthKey(today);
  const floorMonth = addMonths(currentMonth, -SUBSCRIPTION_BACKFILL_MONTHS);

  const billedMonths = {};
  for (const charge of charges) {
    if (charge.reason === 'Subscription Fee') {
      (billedMonths[charge.clientId] ||= new Set()).add(monthKey(charge.date));
    }
  }

  const additions = [];
  for (const client of clients) {
    if (client.status !== 'Active' || client.billingModel !== 'Subscription') continue;
    const fee = Number(client.monthlyFee) || 0;
    if (fee <= 0) continue;
    const joinMonth = ISO_DATE.test(client.joiningDate || '') ? monthKey(client.joiningDate) : currentMonth;
    const start = joinMonth > floorMonth ? joinMonth : floorMonth;
    if (start > currentMonth) continue; // future joining date — nothing to bill yet
    for (const period of monthsThrough(start, currentMonth)) {
      if (billedMonths[client.id]?.has(period)) continue;
      additions.push({
        id: `sub-${client.id}-${period}`,
        clientId: client.id,
        date: `${period}-01`,
        amount: fee,
        reason: 'Subscription Fee',
        status: 'Pending',
        auto: true,
      });
    }
  }

  if (additions.length === 0) return charges;
  return charges.concat(additions);
}

const CHARGE_STATUS_TONE = {
  Paid: 'border-[#bcdcd0] bg-[var(--positive-soft)] text-[#246454]',
  'Partially Paid': 'border-amber-300 bg-amber-50 text-amber-700',
  Pending: 'border-[var(--line)] bg-[var(--panel-muted)] text-[var(--subtle)]',
};

// Apply one client's payments to their charges so every charge shows how much of
// it is settled. A payment aimed at a specific charge (payment.chargeId) pays
// that charge first; whatever is left — plus every untargeted payment — settles
// the oldest open charges first (FIFO). Payments are consumed oldest-first so
// the result is deterministic and mirrors the order money actually arrived.
// Returns { byCharge: { [id]: { paid, balance, status } }, credit }.
function allocateLedger(charges, payments) {
  const byDateThenId = (a, b) =>
    a.date === b.date ? String(a.id).localeCompare(String(b.id)) : a.date.localeCompare(b.date);
  const ordered = charges.slice().sort(byDateThenId);
  const paid = Object.fromEntries(ordered.map((charge) => [charge.id, 0]));
  const balanceOf = (charge) => Math.max(charge.amount - paid[charge.id], 0);

  let pool = 0; // money not yet tied to a charge, waiting for FIFO
  for (const payment of payments.slice().sort(byDateThenId)) {
    let amount = Math.max(Number(payment.amount) || 0, 0);
    // A targeted payment settles its own charge first; overflow joins the pool.
    if (payment.chargeId && paid[payment.chargeId] != null) {
      const target = ordered.find((charge) => charge.id === payment.chargeId);
      const applied = Math.min(amount, balanceOf(target));
      paid[target.id] += applied;
      amount -= applied;
    }
    pool += amount;
  }

  for (const charge of ordered) {
    if (pool <= 0) break;
    const applied = Math.min(pool, balanceOf(charge));
    paid[charge.id] += applied;
    pool -= applied;
  }

  const byCharge = {};
  for (const charge of ordered) {
    const settled = paid[charge.id];
    byCharge[charge.id] = {
      paid: settled,
      balance: Math.max(charge.amount - settled, 0),
      status: settled <= 0 ? 'Pending' : settled >= charge.amount ? 'Paid' : 'Partially Paid',
    };
  }
  return { byCharge, credit: Math.max(pool, 0) };
}

function timeToMinutes(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  return (Number.isFinite(h) ? h : 0) * 60 + (Number.isFinite(m) ? m : 0);
}

// A session only occupies its slot if it will actually happen — a cancelled or
// rescheduled session frees the time and can't clash with anything.
function occupiesSlot(session) {
  return session.status !== 'Cancelled' && session.status !== 'Rescheduled';
}

// Two sessions clash if they fall on the same date and their time ranges (start
// through start + duration) overlap. A solo therapist can only be in one place.
function sessionsClash(a, b) {
  if (a.date !== b.date) return false;
  const aStart = timeToMinutes(a.time);
  const bStart = timeToMinutes(b.time);
  return aStart < bStart + (Number(b.duration) || 60) && bStart < aStart + (Number(a.duration) || 60);
}

// Set of block ids that overlap at least one other block on the same day. Blocks
// are pre-normalized occupancies ({ id, date, time, duration }) — one per 1:1
// session and one per group meeting (a whole group is a single block, so its
// members never clash with each other). Grouped by date to keep the scan tiny.
function findConflicts(blocks) {
  const byDate = {};
  for (const block of blocks) (byDate[block.date] ||= []).push(block);
  const ids = new Set();
  for (const list of Object.values(byDate)) {
    for (let i = 0; i < list.length; i += 1) {
      for (let j = i + 1; j < list.length; j += 1) {
        if (sessionsClash(list[i], list[j])) {
          ids.add(list[i].id);
          ids.add(list[j].id);
        }
      }
    }
  }
  return ids;
}

// The first existing block a candidate {date,time,duration} would clash with,
// skipping the one being moved. Returns the block (which carries a `label` for
// the warning) or null when the slot is free.
function firstClash(blocks, candidate, ignoreId) {
  return blocks.find((block) => block.id !== ignoreId && sessionsClash(block, candidate)) || null;
}

function App() {
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [view, setView] = useState('Today');
  const [settings, setSettings] = usePersistentState('settings', initialSettings);
  const [clients, setClients] = usePersistentState('clients', []);
  const [groups, setGroups] = usePersistentState('groups', []);
  const [sessions, setSessions] = usePersistentState('sessions', []);
  const [groupSessions, setGroupSessions] = usePersistentState('groupSessions', []);
  const [charges, setCharges] = usePersistentState('charges', []);
  const [payments, setPayments] = usePersistentState('payments', []);
  const [selectedClientId, setSelectedClientId] = useState('c1');
  const [clientTab, setClientTab] = useState('Overview');
  const [paymentDraft, setPaymentDraft] = useState({ clientId: 'c1', amount: 2500, method: 'UPI', reference: '', notes: '', chargeId: '' });
  const [clientDraft, setClientDraft] = useState(emptyClient());
  const [toast, setToast] = useState(null); // { id, message, action }
  const toastTimer = useRef(null);
  const today = useToday();

  const driveData = useMemo(
    () => ({ settings, clients, groups, sessions, groupSessions, charges, payments }),
    [settings, clients, groups, sessions, groupSessions, charges, payments],
  );

  const applyRemote = useCallback((remote) => {
    if (remote.settings && typeof remote.settings === 'object' && !Array.isArray(remote.settings)) {
      const merged = { ...initialSettings, ...remote.settings };
      // A therapist who already has a name saved on Drive has set up before,
      // so mark the profile complete even if the file predates the flag.
      const hasProfile = Boolean((merged.therapistName || '').trim()) || remote.settings.profileComplete === true;
      setSettings({ ...merged, profileComplete: hasProfile });
    }
    if (Array.isArray(remote.clients)) setClients(remote.clients);
    if (Array.isArray(remote.groups)) setGroups(remote.groups);
    if (Array.isArray(remote.sessions)) setSessions(remote.sessions);
    if (Array.isArray(remote.groupSessions)) setGroupSessions(remote.groupSessions);
    if (Array.isArray(remote.charges)) setCharges(remote.charges);
    if (Array.isArray(remote.payments)) setPayments(remote.payments);
  }, [setSettings, setClients, setGroups, setSessions, setGroupSessions, setCharges, setPayments]);

  const drive = useGoogleDrive({ clientId: GOOGLE_CLIENT_ID, data: driveData, applyRemote });

  // Returning, already-set-up user: refresh the session in the background so the
  // app opens instantly from cache and syncs when silent auth succeeds.
  useEffect(() => {
    if (settings.profileComplete && drive.configured) drive.trySilent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientById = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);
  const groupById = useMemo(() => Object.fromEntries(groups.map((group) => [group.id, group])), [groups]);

  // Keep upcoming sessions materialized from each recurring client's weekly
  // schedule. Runs on mount and whenever clients change (add, edit a day/time,
  // archive); reads the latest sessions via the functional update so it never
  // needs `sessions` in its deps and can't loop. reconcile is idempotent.
  useEffect(() => {
    setSessions((current) => reconcileRecurringSessions(clients, current, today));
  }, [clients, today, setSessions]);

  // Auto-bill subscription clients a monthly fee (per-session clients are billed
  // on attendance instead). Reads the latest charges via the functional update
  // so it never needs `charges` in its deps and can't loop; reconcile is
  // idempotent and generation-only, so it never touches existing charges.
  useEffect(() => {
    setCharges((current) => reconcileSubscriptionCharges(clients, current, settings.autoCreateCharges, today));
  }, [clients, settings.autoCreateCharges, today, setCharges]);

  // Materialize recurring group meetings, mirroring the individual engine.
  useEffect(() => {
    setGroupSessions((current) => reconcileGroupSessions(groups, current, today));
  }, [groups, today, setGroupSessions]);

  const ledgers = useMemo(() => {
    return clients.map((client) => {
      const totalCharges = charges.filter((charge) => charge.clientId === client.id).reduce((sum, charge) => sum + charge.amount, 0);
      const totalPayments = payments.filter((payment) => payment.clientId === client.id).reduce((sum, payment) => sum + payment.amount, 0);
      return {
        clientId: client.id,
        totalCharges,
        totalPayments,
        outstanding: Math.max(totalCharges - totalPayments, 0),
        credit: Math.max(totalPayments - totalCharges, 0),
      };
    });
  }, [charges, clients, payments]);

  const ledgerByClient = useMemo(() => Object.fromEntries(ledgers.map((ledger) => [ledger.clientId, ledger])), [ledgers]);

  // Per-charge settlement (paid/balance/status) and each client's still-open
  // charges, derived from payments so the picture is always consistent with the
  // ledger totals above and never needs to be written back to storage.
  const allocation = useMemo(() => {
    const chargesByClient = {};
    for (const charge of charges) (chargesByClient[charge.clientId] ||= []).push(charge);
    const paymentsByClient = {};
    for (const payment of payments) (paymentsByClient[payment.clientId] ||= []).push(payment);

    const byCharge = {};
    const openByClient = {};
    for (const client of clients) {
      const clientCharges = chargesByClient[client.id] || [];
      const { byCharge: settled } = allocateLedger(clientCharges, paymentsByClient[client.id] || []);
      Object.assign(byCharge, settled);
      openByClient[client.id] = clientCharges
        .filter((charge) => settled[charge.id]?.balance > 0)
        .sort((a, b) => a.date.localeCompare(b.date));
    }
    return { byCharge, openByClient };
  }, [clients, charges, payments]);

  // One occupancy block per 1:1 session and per group meeting (a whole group is
  // a single block, so its members never clash with each other). Each block
  // carries a label used in the "overlaps X" warning. Powers both the conflict
  // highlighting and the add/reschedule checks.
  const occupancyBlocks = useMemo(() => {
    const blocks = [];
    for (const session of sessions) {
      if (occupiesSlot(session)) {
        blocks.push({ id: session.id, date: session.date, time: session.time, duration: session.duration, label: clientById[session.clientId]?.name || 'Session' });
      }
    }
    for (const gs of groupSessions) {
      blocks.push({ id: gs.id, date: gs.date, time: gs.time, duration: gs.duration, label: groupById[gs.groupId]?.name || 'Group' });
    }
    return blocks;
  }, [sessions, groupSessions, clientById, groupById]);

  // Ids of blocks that overlap another on the same day — surfaced on the
  // dashboard and week view, and checked before adding or rescheduling.
  const conflictIds = useMemo(() => findConflicts(occupancyBlocks), [occupancyBlocks]);

  // Six-month practice trends for the dashboard: money (billed/collected) plus
  // activity (attendance, sessions, late cancels), oldest month first.
  const trends = useMemo(() => {
    const periods = recentMonths(6, today).slice().reverse();
    return periods.map((period) => {
      const eom = endOfMonthIso(period);
      const inMonth = (date) => monthKey(date) === period;
      const monthSessions = sessions.filter((session) => inMonth(session.date));
      const attended = monthSessions.filter((session) => session.status === 'Present').length;
      const chargesToEom = charges.filter((charge) => charge.date <= eom).reduce((sum, charge) => sum + charge.amount, 0);
      const paymentsToEom = payments.filter((payment) => payment.date <= eom).reduce((sum, payment) => sum + payment.amount, 0);
      return {
        period,
        label: monthShort(period),
        billed: charges.filter((charge) => inMonth(charge.date)).reduce((sum, charge) => sum + charge.amount, 0),
        collected: payments.filter((payment) => inMonth(payment.date)).reduce((sum, payment) => sum + payment.amount, 0),
        attended,
        sessions: monthSessions.length,
        attendanceRate: monthSessions.length ? Math.round((attended / monthSessions.length) * 100) : 0,
        lateCancels: monthSessions.filter((session) => session.status === 'Late Cancel').length,
        outstanding: Math.max(chargesToEom - paymentsToEom, 0),
      };
    });
  }, [sessions, charges, payments, today]);

  const goToClient = useCallback((id) => {
    setSelectedClientId(id);
    setClientTab('Overview');
    setActiveNav('Clients');
  }, []);

  const visibleSessions = useMemo(
    () => sessions.filter((session) => isInPeriod(session.date, view, today)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [sessions, view, today],
  );

  const monthSessions = sessions.filter((session) => isInPeriod(session.date, 'Month', today));
  const totalOutstanding = ledgers.reduce((sum, ledger) => sum + ledger.outstanding, 0);
  const totalCredit = ledgers.reduce((sum, ledger) => sum + ledger.credit, 0);
  const collectedThisMonth = payments.filter((payment) => isInPeriod(payment.date, 'Month', today)).reduce((sum, payment) => sum + payment.amount, 0);
  const billedThisMonth = charges.filter((charge) => isInPeriod(charge.date, 'Month', today)).reduce((sum, charge) => sum + charge.amount, 0);
  const attendedThisMonth = monthSessions.filter((session) => session.status === 'Present').length;
  const lateCancelsThisMonth = monthSessions.filter((session) => session.status === 'Late Cancel').length;
  const attendanceRate = monthSessions.length ? Math.round((attendedThisMonth / monthSessions.length) * 100) : 0;
  const selectedClient = clientById[selectedClientId] || clients[0];

  // Toast: a small, self-dismissing acknowledgement in the corner. An optional
  // `action` (e.g. Undo) keeps the toast up a little longer and adds a button.
  function showNotice(message, action = null) {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    const id = Date.now();
    setToast({ id, message, action });
    toastTimer.current = window.setTimeout(() => {
      setToast((current) => (current && current.id === id ? null : current));
    }, action ? 6000 : 3200);
  }

  function dismissToast() {
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    setToast(null);
  }

  function statusSession(sessionId, nextStatus) {
    const session = sessions.find((item) => item.id === sessionId);
    const client = clientById[session.clientId];
    let newCharge = null;

    if (settings.autoCreateCharges && nextStatus === 'Present' && client.billingModel === 'Per Session') {
      newCharge = {
        id: `ch${Date.now()}`,
        clientId: client.id,
        date: session.date,
        amount: client.sessionRate,
        reason: 'Session Fee',
        status: 'Pending',
      };
    }

    if (settings.autoCreateCharges && nextStatus === 'Late Cancel' && client.billingModel === 'Per Session') {
      const percent = client.cancellationRule === 'Custom' ? client.customCharge : settings.lateCancellationCharge;
      newCharge = {
        id: `ch${Date.now()}`,
        clientId: client.id,
        date: session.date,
        amount: Math.round((client.sessionRate * percent) / 100),
        reason: 'Late Cancellation',
        status: 'Pending',
      };
    }

    setSessions((current) =>
      current.map((item) => (item.id === sessionId ? { ...item, status: nextStatus, chargeId: newCharge?.id || item.chargeId } : item)),
    );
    if (newCharge && newCharge.amount > 0) setCharges((current) => [...current, newCharge]);
    showNotice(`${client.name} marked ${nextStatus.toLowerCase()}.`, {
      label: 'Undo',
      onClick: () => undoSession(sessionId),
    });
  }

  function undoSession(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    setSessions((current) => current.map((item) => (item.id === sessionId ? { ...item, status: 'Scheduled', chargeId: null } : item)));
    if (session.chargeId) setCharges((current) => current.filter((charge) => charge.id !== session.chargeId));
    showNotice('Session returned to scheduled.');
  }

  // Move a session to a chosen date/time: the original becomes a 'Rescheduled'
  // record and a fresh, sticky (never auto-pruned) session is created at the new
  // slot. Without an explicit date it defaults to one week ahead, same time.
  // Human-readable warning naming the session a candidate slot would collide
  // with, ending in the caller's verb (e.g. "Add anyway?", "Move anyway?").
  function clashPrompt(clash, question) {
    const when = formatDate(clash.date, { weekday: 'short', day: '2-digit', month: 'short' });
    return `This overlaps ${clash.label || 'another session'} at ${clash.time} on ${when}. ${question}`;
  }

  function reschedule(sessionId, newDate, newTime) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    let date = newDate;
    if (!date) {
      const fallback = new Date(`${session.date}T${session.time || '00:00'}`);
      fallback.setDate(fallback.getDate() + 7);
      date = fallback.toISOString().slice(0, 10);
    }
    const time = newTime || session.time;
    const clash = firstClash(occupancyBlocks, { date, time, duration: session.duration }, sessionId);
    if (clash && !window.confirm(clashPrompt(clash, 'Move anyway?'))) return;
    const replacement = {
      ...session,
      id: `s${Date.now()}`,
      date,
      time,
      status: 'Scheduled',
      chargeId: null,
      auto: false, // a rescheduled slot is a therapist action — never auto-pruned
    };
    setSessions((current) =>
      current.map((item) => (item.id === sessionId ? { ...item, status: 'Rescheduled' } : item)).concat(replacement),
    );
    const client = clientById[session.clientId];
    showNotice(`${client?.name || 'Session'} moved to ${formatDate(date, { weekday: 'short', day: '2-digit', month: 'short' })} ${time}.`);
  }

  // Remove a one-off (manual or rescheduled) session outright, along with any
  // charge it created. Recurring auto sessions are never removed this way — they
  // would just regenerate — so the UI offers this only for non-auto sessions.
  function removeSession(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    if (!session) return;
    setSessions((current) => current.filter((item) => item.id !== sessionId));
    if (session.chargeId) setCharges((current) => current.filter((charge) => charge.id !== session.chargeId));
    showNotice('Session removed.');
  }

  function addSession(draft) {
    if (!draft.clientId || !draft.date || !draft.time) return false;
    const client = clientById[draft.clientId];
    const clash = firstClash(occupancyBlocks, { date: draft.date, time: draft.time, duration: Number(draft.duration) || 60 }, null);
    if (clash && !window.confirm(clashPrompt(clash, 'Add anyway?'))) return false;
    setSessions((current) => [
      ...current,
      {
        id: `s${Date.now()}`,
        clientId: draft.clientId,
        date: draft.date,
        time: draft.time,
        duration: Number(draft.duration) || 60,
        status: 'Scheduled',
        chargeId: null,
      },
    ]);
    showNotice(`Session added for ${client?.name || 'client'}.`);
    return true;
  }

  function recordPayment(event) {
    event.preventDefault();
    const amount = Number(paymentDraft.amount);
    const client = clientById[paymentDraft.clientId];
    if (!client || amount <= 0) return;
    setPayments((current) => [
      ...current,
      {
        id: `p${Date.now()}`,
        clientId: paymentDraft.clientId,
        date: today,
        amount,
        method: paymentDraft.method,
        reference: paymentDraft.reference || 'Manual',
        notes: paymentDraft.notes,
        // Optional target charge; null lets it settle the oldest open charge first.
        chargeId: paymentDraft.chargeId || null,
      },
    ]);
    showNotice(`Payment recorded for ${client.name}.`);
    setPaymentDraft({ ...paymentDraft, amount: 2500, reference: '', notes: '', chargeId: '' });
  }

  function addClient(event) {
    event.preventDefault();
    if (!clientDraft.name.trim()) return;
    const id = `c${Date.now()}`;
    const nextClient = { ...clientDraft, id, tags: clientDraft.tags.split(',').map((tag) => tag.trim()).filter(Boolean) };
    setClients((current) => [...current, nextClient]);
    setSelectedClientId(id);
    setClientDraft(emptyClient());
    showNotice('Client added.');
  }

  function updateClient(next) {
    setClients((current) => current.map((client) => (client.id === next.id ? next : client)));
    showNotice(`${next.name} updated.`);
  }

  function updateCharge(id, patch) {
    setCharges((current) => current.map((charge) => (charge.id === id ? { ...charge, ...patch } : charge)));
    showNotice('Charge updated.');
  }

  // Remove a charge and detach any session that pointed at it, with an Undo that
  // restores both. Daily Drive backups (#3) are the safety net beyond that.
  function deleteCharge(id) {
    const removed = charges.find((charge) => charge.id === id);
    if (!removed) return;
    const linkedSessionIds = sessions.filter((session) => session.chargeId === id).map((session) => session.id);
    setCharges((current) => current.filter((charge) => charge.id !== id));
    if (linkedSessionIds.length) {
      setSessions((current) => current.map((session) => (session.chargeId === id ? { ...session, chargeId: null } : session)));
    }
    showNotice('Charge removed.', {
      label: 'Undo',
      onClick: () => {
        setCharges((current) => (current.some((charge) => charge.id === removed.id) ? current : [...current, removed]));
        if (linkedSessionIds.length) {
          setSessions((current) =>
            current.map((session) => (linkedSessionIds.includes(session.id) ? { ...session, chargeId: removed.id } : session)),
          );
        }
      },
    });
  }

  function addGroup(draft) {
    if (!String(draft.name || '').trim()) return false;
    const group = {
      ...draft,
      id: `g${Date.now()}`,
      name: draft.name.trim(),
      capacity: Number(draft.capacity) || 0,
      sessionFee: Number(draft.sessionFee) || 0,
      members: draft.members || [],
    };
    setGroups((current) => [...current, group]);
    showNotice(`${group.name} created.`);
    return group.id;
  }

  function updateGroup(next) {
    setGroups((current) => current.map((group) => (group.id === next.id ? next : group)));
    showNotice(`${next.name} updated.`);
  }

  // Delete a group. Future/unmarked sessions go with it; any session that already
  // has attendance marked — and the charges it created — is kept for the record.
  function removeGroup(groupId) {
    const group = groups.find((item) => item.id === groupId);
    if (!group) return;
    const marked = groupSessions.filter((s) => s.groupId === groupId && Object.keys(s.attendance || {}).length > 0);
    const message = marked.length
      ? `Delete ${group.name}? ${marked.length} past session${marked.length === 1 ? '' : 's'} with attendance — and their charges — stay on record. Upcoming, unmarked sessions are removed.`
      : `Delete ${group.name}? This can't be undone.`;
    if (!window.confirm(message)) return;
    setGroups((current) => current.filter((item) => item.id !== groupId));
    setGroupSessions((current) => current.filter((s) => s.groupId !== groupId || Object.keys(s.attendance || {}).length > 0));
    showNotice(`${group.name} deleted.`);
  }

  function addGroupSession(draft) {
    if (!draft.groupId || !draft.date || !draft.time) return false;
    const group = groupById[draft.groupId];
    const clash = firstClash(occupancyBlocks, { date: draft.date, time: draft.time, duration: Number(draft.duration) || 60 }, null);
    if (clash && !window.confirm(clashPrompt(clash, 'Add anyway?'))) return false;
    setGroupSessions((current) => [
      ...current,
      {
        id: `gs${Date.now()}`,
        groupId: draft.groupId,
        date: draft.date,
        time: draft.time,
        duration: Number(draft.duration) || 60,
        attendance: {},
      },
    ]);
    showNotice(`Group session added for ${group?.name || 'group'}.`);
    return true;
  }

  // Remove a group session and any per-member charges it generated.
  function removeGroupSession(sessionId) {
    const gs = groupSessions.find((item) => item.id === sessionId);
    if (!gs) return;
    const chargeIds = Object.values(gs.attendance || {}).map((entry) => entry.chargeId).filter(Boolean);
    setGroupSessions((current) => current.filter((item) => item.id !== sessionId));
    if (chargeIds.length) setCharges((current) => current.filter((charge) => !chargeIds.includes(charge.id)));
    showNotice('Group session removed.');
  }

  // Set one member's attendance on a group session. Marking Present bills them
  // for a Per Session group when auto-charges are on: each member is charged their
  // own session rate, falling back to the group's fee when they have no rate set —
  // so the group fee is just a default, and per-client amounts are honored.
  // Any other status — or clearing — drops that bill. status null clears the mark.
  function markGroupAttendance(sessionId, clientId, status) {
    const gs = groupSessions.find((item) => item.id === sessionId);
    if (!gs) return;
    const group = groupById[gs.groupId];
    const prior = gs.attendance?.[clientId] || {};
    const memberRate = Number(clientById[clientId]?.sessionRate) || 0;
    const fee = memberRate > 0 ? memberRate : Number(group?.sessionFee) || 0;
    const bills = settings.autoCreateCharges && group?.billingModel === 'Per Session' && fee > 0;

    let newChargeId = prior.chargeId || null;
    let addCharge = null;
    let removeChargeId = null;
    if (status === 'Present') {
      if (bills && !prior.chargeId) {
        addCharge = { id: `ch${Date.now()}`, clientId, date: gs.date, amount: fee, reason: 'Group Session', status: 'Pending' };
        newChargeId = addCharge.id;
      }
    } else if (prior.chargeId) {
      removeChargeId = prior.chargeId;
      newChargeId = null;
    }

    setGroupSessions((current) =>
      current.map((item) => {
        if (item.id !== sessionId) return item;
        const attendance = { ...(item.attendance || {}) };
        if (status) attendance[clientId] = { status, chargeId: newChargeId };
        else delete attendance[clientId];
        return { ...item, attendance };
      }),
    );
    if (addCharge) setCharges((current) => [...current, addCharge]);
    if (removeChargeId) setCharges((current) => current.filter((charge) => charge.id !== removeChargeId));
  }

  function completeSetup({ therapistName, practiceName, paymentDetails, currency, loadSample }) {
    setSettings((prev) => ({
      ...prev,
      therapistName: therapistName.trim(),
      practiceName: practiceName.trim(),
      paymentDetails: paymentDetails.trim(),
      currency: currency || 'INR',
      profileComplete: true,
    }));
    if (loadSample) {
      setClients(SAMPLE_CLIENTS);
      setGroups(SAMPLE_GROUPS);
      setSessions(SAMPLE_SESSIONS);
      setGroupSessions([]);
      setCharges(SAMPLE_CHARGES);
      setPayments(SAMPLE_PAYMENTS);
      setSelectedClientId(SAMPLE_CLIENTS[0].id);
    }
    showNotice('Welcome to QuietAdmin.');
  }

  function signOut() {
    if (!window.confirm('Sign out? Your data stays safe in Google Drive. This device will sign in again to reload it.')) return;
    drive.disconnect();
    STORAGE_KEYS.forEach((key) => {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // Ignore removal failures; reload still returns to the sign-in screen.
      }
    });
    window.location.reload();
  }

  function loadSampleData() {
    if (!window.confirm('Load sample clients and data? This replaces your current clients, groups, sessions, charges and payments.')) return;
    setClients(SAMPLE_CLIENTS);
    setGroups(SAMPLE_GROUPS);
    setSessions(SAMPLE_SESSIONS);
    setGroupSessions([]);
    setCharges(SAMPLE_CHARGES);
    setPayments(SAMPLE_PAYMENTS);
    setSelectedClientId(SAMPLE_CLIENTS[0].id);
    showNotice('Sample data loaded.');
  }

  function exportJson() {
    const payload = { clients, groups, sessions, groupSessions, charges, payments, settings };
    downloadFile('quietadmin-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportClientsCsv() {
    const rows = [CLIENT_CSV_COLUMNS, CLIENT_CSV_EXAMPLE, ...clients.map(clientToCsvRow)];
    downloadFile('quietadmin-clients.csv', toCsv(rows), 'text/csv');
  }

  function commitImportedClients(list) {
    if (!list.length) return;
    setClients((current) => [...current, ...list]);
    setSelectedClientId(list[0].id);
    showNotice(`Imported ${list.length} client${list.length === 1 ? '' : 's'}.`);
  }

  setActiveCurrency(settings.currency);

  const gate = settings.profileComplete ? 'app' : drive.signedIn ? 'setup' : 'signin';

  if (gate !== 'app') {
    return (
      <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
        {gate === 'signin' ? (
          <SignInScreen drive={drive} />
        ) : (
          <SetupScreen drive={drive} onComplete={completeSetup} />
        )}
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[var(--bg)] text-[var(--text)]">
      <Toast toast={toast} onDismiss={dismissToast} />
      <div className="flex min-h-screen">
        <aside className="hidden w-72 shrink-0 border-r border-[var(--line)] bg-[var(--panel)] px-5 py-6 lg:block">
          <Brand />
          <nav className="mt-8 space-y-1">
            {navItems.map(([label, Icon]) => (
              <button
                key={label}
                type="button"
                onClick={() => setActiveNav(label)}
                className={`flex w-full items-center gap-3 rounded-md px-3 py-3 text-left text-sm font-medium transition ${
                  activeNav === label ? 'bg-[var(--primary)] text-white' : 'text-[var(--subtle)] hover:bg-[var(--panel-muted)] hover:text-[var(--text)]'
                }`}
              >
                <Icon size={18} />
                {label}
              </button>
            ))}
          </nav>
          <div className="mt-8 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Google Drive shape</p>
            {['clients.json', 'groups.json', 'sessions.json', 'groupsessions.json', 'charges.json', 'payments.json', 'settings.json'].map((file) => (
              <div key={file} className="mt-2 flex items-center gap-2 text-sm text-[var(--subtle)]">
                <FileJson size={15} />
                {file}
              </div>
            ))}
          </div>
        </aside>

        <section className="min-w-0 flex-1">
          <MobileNav activeNav={activeNav} setActiveNav={setActiveNav} />
          <div className="mx-auto max-w-7xl px-4 py-5 sm:px-6 lg:px-8">
            <TopBar settings={settings} drive={drive} signOut={signOut} today={today} />

            {activeNav === 'Dashboard' && (
              <Dashboard
                settings={settings}
                view={view}
                setView={setView}
                sessions={visibleSessions}
                clients={clientById}
                clientList={clients}
                ledgerByClient={ledgerByClient}
                conflictIds={conflictIds}
                trends={trends}
                goToClient={goToClient}
                today={today}
                stats={{
                  today: sessions.filter((session) => session.date === today).length,
                  outstanding: totalOutstanding,
                  collected: collectedThisMonth,
                  lateCancels: lateCancelsThisMonth,
                }}
                statusSession={statusSession}
                undoSession={undoSession}
                reschedule={reschedule}
                removeSession={removeSession}
                addSession={addSession}
                setPaymentDraft={setPaymentDraft}
                setActiveNav={setActiveNav}
              />
            )}

            {activeNav === 'Schedule' && (
              <Schedule
                sessions={sessions}
                clients={clientById}
                ledgerByClient={ledgerByClient}
                conflictIds={conflictIds}
                today={today}
                groupSessions={groupSessions}
                groupById={groupById}
                markGroupAttendance={markGroupAttendance}
                removeGroupSession={removeGroupSession}
                statusSession={statusSession}
                undoSession={undoSession}
                reschedule={reschedule}
                removeSession={removeSession}
              />
            )}

            {activeNav === 'Clients' && (
              <Clients
                clients={clients}
                selectedClient={selectedClient}
                setSelectedClientId={setSelectedClientId}
                ledgers={ledgerByClient}
                sessions={sessions}
                charges={charges}
                payments={payments}
                allocation={allocation}
                updateClient={updateClient}
                updateCharge={updateCharge}
                deleteCharge={deleteCharge}
                clientTab={clientTab}
                setClientTab={setClientTab}
                clientDraft={clientDraft}
                setClientDraft={setClientDraft}
                addClient={addClient}
                exportClientsCsv={exportClientsCsv}
                exportJson={exportJson}
                onImport={commitImportedClients}
              />
            )}

            {activeNav === 'Groups' && (
              <Groups
                groups={groups}
                clients={clientById}
                clientList={clients}
                groupSessions={groupSessions}
                settings={settings}
                today={today}
                addGroup={addGroup}
                updateGroup={updateGroup}
                removeGroup={removeGroup}
                addGroupSession={addGroupSession}
                removeGroupSession={removeGroupSession}
                markGroupAttendance={markGroupAttendance}
              />
            )}

            {activeNav === 'Payments' && (
              <Payments
                clients={clients}
                ledgers={ledgerByClient}
                payments={payments}
                charges={charges}
                allocation={allocation}
                paymentDraft={paymentDraft}
                setPaymentDraft={setPaymentDraft}
                recordPayment={recordPayment}
              />
            )}

            {activeNav === 'Statements' && (
              <Statements
                clients={clients}
                sessions={sessions}
                charges={charges}
                payments={payments}
                settings={settings}
                showNotice={showNotice}
                today={today}
              />
            )}

            {activeNav === 'Reports' && (
              <Reports
                stats={{
                  sessionsScheduled: monthSessions.length,
                  sessionsAttended: attendedThisMonth,
                  attendanceRate,
                  revenueBilled: billedThisMonth,
                  revenueCollected: collectedThisMonth,
                  outstanding: totalOutstanding,
                  credit: totalCredit,
                  collectionRate: billedThisMonth ? Math.round((collectedThisMonth / billedThisMonth) * 100) : 0,
                  lateCancels: lateCancelsThisMonth,
                }}
                exportJson={exportJson}
              />
            )}

            {activeNav === 'Settings' && <SettingsScreen settings={settings} setSettings={setSettings} loadSampleData={loadSampleData} exportJson={exportJson} drive={drive} onNotice={showNotice} />}
          </div>
        </section>
      </div>
    </main>
  );
}

function SignInScreen({ drive }) {
  const busy = drive.status === 'connecting' || drive.status === 'syncing';
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 text-center shadow-soft sm:p-8">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-md bg-[var(--primary)] text-white">
          <ReceiptText size={28} />
        </div>
        <h1 className="mt-4 text-2xl font-semibold">QuietAdmin</h1>
        <p className="mt-1 text-sm text-[var(--subtle)]">The admin assistant for therapists.</p>
        <p className="mt-5 text-sm text-[var(--subtle)]">
          Sign in with Google to manage your practice. Your data is stored privately in your own Google Drive.
        </p>
        <button
          type="button"
          className="mt-6 icon-button w-full justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
          onClick={drive.connect}
          disabled={busy || !drive.configured}
        >
          <Mail size={18} />
          {busy ? 'Signing in…' : 'Sign in with Google'}
        </button>
        {!drive.configured && (
          <p className="mt-3 text-xs text-[var(--accent)]">Google sign-in isn’t configured (missing VITE_GOOGLE_CLIENT_ID).</p>
        )}
        {drive.error && <p className="mt-3 text-xs text-[var(--accent)]">{drive.error}</p>}
      </div>
    </div>
  );
}

function SetupScreen({ drive, onComplete }) {
  const [therapistName, setTherapistName] = useState(drive.name || '');
  const [practiceName, setPracticeName] = useState('');
  const [paymentDetails, setPaymentDetails] = useState('');
  const [currency, setCurrency] = useState('INR');
  const [loadSample, setLoadSample] = useState(false);

  function submit(event) {
    event.preventDefault();
    if (!therapistName.trim()) return;
    onComplete({ therapistName, practiceName, paymentDetails, currency, loadSample });
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="max-h-[94vh] w-full max-w-lg overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-6 shadow-soft sm:p-8">
        <div className="flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--primary)] text-white">
            <ReceiptText size={21} />
          </div>
          <div>
            <h2 className="text-2xl font-semibold">Set up your practice</h2>
            <p className="text-sm text-[var(--subtle)]">
              {drive.email ? `Signed in as ${drive.email}. ` : ''}A few details to get started — you can change these later in Settings.
            </p>
          </div>
        </div>

        <form className="mt-5 grid gap-3" onSubmit={submit}>
          <Input label="Your name" value={therapistName} onChange={setTherapistName} />
          <Input label="Practice name" value={practiceName} onChange={setPracticeName} />
          <Input label="Payment details (UPI / bank) — optional" value={paymentDetails} onChange={setPaymentDetails} />
          <Select label="Currency" value={currency} options={CURRENCY_OPTIONS} onChange={setCurrency} />
          <label className="flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3 text-sm">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={loadSample} onChange={(event) => setLoadSample(event.target.checked)} />
            Load sample clients so I can explore first
          </label>
          <button
            type="submit"
            className="icon-button justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
            disabled={!therapistName.trim()}
          >
            Get started
          </button>
        </form>
      </div>
    </div>
  );
}

function ImportOverlay({ children, onClose }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft" onClick={(event) => event.stopPropagation()}>
        {children}
      </div>
    </div>
  );
}

function CloseX({ onClose }) {
  return (
    <button type="button" className="rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]" onClick={onClose} aria-label="Close">
      <X size={18} />
    </button>
  );
}

function ClientImportWizard({ existingClients, onImport, onClose }) {
  const fileRef = useRef(null);
  const [raw, setRaw] = useState('');
  const [paste, setPaste] = useState('');
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState([]);
  const [result, setResult] = useState(null);

  const rows = useMemo(() => (raw ? parseTable(raw).filter((row) => row.some((cell) => String(cell ?? '').trim() !== '')) : []), [raw]);

  useEffect(() => {
    if (!rows.length) { setMapping([]); return; }
    setMapping(hasHeader ? autoMapColumns(rows[0]) : new Array(rows[0].length).fill(''));
  }, [rows, hasHeader]);

  const outcome = useMemo(
    () => (rows.length && mapping.length ? runClientImport({ rows, mapping, hasHeader, existingClients }) : { accepted: [], skipped: [] }),
    [rows, mapping, hasHeader, existingClients],
  );
  const warningRows = outcome.accepted.filter((entry) => entry.warnings.length);
  const nameMapped = mapping.includes('name');

  function loadRaw(text) {
    if (!text.trim()) return;
    setResult(null);
    setHasHeader(true);
    setRaw(text);
  }
  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => loadRaw(String(reader.result || ''));
    reader.readAsText(file);
    event.target.value = '';
  }
  function downloadTemplate(minimal) {
    const template = minimal
      ? [['Name', 'Email', 'Phone'], ['Jane Doe', 'jane@example.com', '+91 90000 00000']]
      : [CLIENT_CSV_COLUMNS, CLIENT_CSV_EXAMPLE];
    downloadFile(minimal ? 'quietadmin-template-basic.csv' : 'quietadmin-template-full.csv', toCsv(template), 'text/csv');
  }
  function doImport() {
    if (!outcome.accepted.length) return;
    onImport(outcome.accepted.map((entry) => entry.client));
    setResult({ imported: outcome.accepted.length, skipped: outcome.skipped, warningRows });
  }

  // 1) Result
  if (result) {
    const warnings = result.warningRows.flatMap((entry) => entry.warnings.map((w) => ({ name: entry.client.name, w }))).slice(0, 8);
    return (
      <ImportOverlay onClose={onClose}>
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">Import complete</h2>
          <CloseX onClose={onClose} />
        </div>
        <p className="mt-2 text-sm">
          Imported <span className="font-semibold">{result.imported}</span> client{result.imported === 1 ? '' : 's'}
          {result.skipped.length ? `, skipped ${result.skipped.length}` : ''}
          {result.warningRows.length ? `, ${result.warningRows.length} with minor fixes` : ''}.
        </p>
        {warnings.length > 0 && (
          <div className="mt-3 rounded-md border border-amber-300 bg-amber-50 p-3">
            <p className="flex items-center gap-1.5 text-sm font-medium text-amber-800"><AlertTriangle size={14} /> Adjusted while importing</p>
            <ul className="mt-1 space-y-0.5 text-xs text-amber-800">
              {warnings.map((item, i) => <li key={i}>{item.name}: {item.w}</li>)}
            </ul>
          </div>
        )}
        {result.skipped.length > 0 && (
          <div className="mt-3 overflow-hidden rounded-md border border-[var(--line)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--subtle)]">
                <tr><th className="px-3 py-2">Row</th><th className="px-3 py-2">Name</th><th className="px-3 py-2">Reason</th></tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {result.skipped.map((item, index) => (
                  <tr key={`${item.row}-${index}`}>
                    <td className="px-3 py-2 text-[var(--subtle)]">{item.row}</td>
                    <td className="px-3 py-2">{item.name}</td>
                    <td className="px-3 py-2 text-[var(--subtle)]">{item.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <button type="button" className="mt-4 icon-button justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" onClick={onClose}>Done</button>
      </ImportOverlay>
    );
  }

  // 2) Source — choose a file or paste
  if (!rows.length) {
    return (
      <ImportOverlay onClose={onClose}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">Import clients</h2>
            <p className="mt-1 text-sm text-[var(--subtle)]">Only a <span className="font-medium">Name</span> is required. Bring any spreadsheet — we’ll match your columns and fill sensible defaults.</p>
          </div>
          <CloseX onClose={onClose} />
        </div>
        <input ref={fileRef} type="file" accept=".csv,.tsv,text/csv,text/tab-separated-values" className="hidden" onChange={handleFile} />
        <button type="button" className="mt-4 icon-button justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" onClick={() => fileRef.current?.click()}>
          <Import size={17} /> Upload a CSV file
        </button>
        <div className="mt-4">
          <p className="text-sm font-medium text-[var(--subtle)]">…or paste rows from Excel / Google Sheets</p>
          <textarea
            value={paste}
            onChange={(event) => setPaste(event.target.value)}
            rows={4}
            placeholder={'Name\tEmail\tPhone\nJane Doe\tjane@example.com\t+91 90000 00000'}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
          />
          <button type="button" className="mt-2 icon-button" onClick={() => loadRaw(paste)} disabled={!paste.trim()}>Use pasted rows</button>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-[var(--line)] pt-3 text-sm text-[var(--subtle)]">
          <span>Templates:</span>
          <button type="button" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline" onClick={() => downloadTemplate(true)}><Download size={14} /> Basic</button>
          <button type="button" className="inline-flex items-center gap-1 font-medium text-[var(--primary)] hover:underline" onClick={() => downloadTemplate(false)}><Download size={14} /> Full</button>
        </div>
      </ImportOverlay>
    );
  }

  // 3) Map columns + preview
  const sampleRow = hasHeader ? rows[1] || [] : rows[0];
  const dupFields = mapping.filter((key, i) => key && mapping.indexOf(key) !== i);
  return (
    <ImportOverlay onClose={onClose}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">Match your columns</h2>
          <p className="mt-1 text-sm text-[var(--subtle)]">{rows.length - (hasHeader ? 1 : 0)} row(s) detected. Confirm how each column maps.</p>
        </div>
        <CloseX onClose={onClose} />
      </div>

      <label className="mt-3 flex w-fit items-center gap-2 text-sm text-[var(--subtle)]">
        <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={hasHeader} onChange={(event) => setHasHeader(event.target.checked)} />
        First row is a header
      </label>

      <div className="mt-3 max-h-64 space-y-1.5 overflow-auto scrollbar-soft rounded-md border border-[var(--line)] bg-[var(--bg)] p-2">
        {rows[0].map((cell, i) => (
          <div key={i} className="flex items-center gap-2 rounded px-2 py-1.5">
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{hasHeader ? cell || `Column ${i + 1}` : `Column ${i + 1}`}</p>
              <p className="truncate text-xs text-[var(--subtle)]">{String(sampleRow[i] ?? '') || '—'}</p>
            </div>
            <select
              value={mapping[i] || ''}
              onChange={(event) => setMapping((current) => { const next = [...current]; next[i] = event.target.value; return next; })}
              className="shrink-0 rounded-md border border-[var(--line)] bg-[var(--panel)] px-2 py-1.5 text-sm text-[var(--text)]"
            >
              <option value="">Ignore</option>
              {IMPORT_FIELDS.map((field) => <option key={field.key} value={field.key}>{field.label}</option>)}
            </select>
          </div>
        ))}
      </div>

      {!nameMapped && (
        <p className="mt-3 flex items-center gap-1.5 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle size={14} /> Map a column to <span className="font-semibold">Name</span> to import.
        </p>
      )}
      {dupFields.length > 0 && (
        <p className="mt-2 text-xs text-[var(--subtle)]">Two columns map to the same field ({dupFields.map((k) => IMPORT_FIELD_BY_KEY[k].label).join(', ')}); the first is used.</p>
      )}

      <p className="mt-3 text-sm">
        Ready to import <span className="font-semibold">{outcome.accepted.length}</span>
        {outcome.skipped.length ? ` · ${outcome.skipped.length} skipped` : ''}
        {warningRows.length ? ` · ${warningRows.length} auto-fixed` : ''}.
      </p>

      <div className="mt-4 flex justify-end gap-2">
        <button type="button" className="icon-button" onClick={() => setRaw('')}>Back</button>
        <button
          type="button"
          className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)] disabled:opacity-50"
          onClick={doImport}
          disabled={outcome.accepted.length === 0}
        >
          <Check size={16} /> Import {outcome.accepted.length} client{outcome.accepted.length === 1 ? '' : 's'}
        </button>
      </div>
    </ImportOverlay>
  );
}

function Brand() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <img src="/brand/QuietAdmin_Icon.svg" alt="QuietAdmin" className="h-10 w-10 rounded-[9px]" />
        <div>
          <h1 className="text-xl font-semibold tracking-normal">QuietAdmin</h1>
          <p className="text-sm text-[var(--subtle)]">The admin assistant for therapists.</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ settings, drive, signOut, today }) {
  const currentDate = toDate(today).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm text-[var(--subtle)]">{settings.practiceName}</p>
        <h2 className="text-2xl font-semibold sm:text-3xl">{greetingFor()}, {settings.therapistName}</h2>
        <p className="mt-1 text-sm text-[var(--subtle)]">{currentDate}</p>
      </div>
      <div className="flex flex-col items-stretch gap-2 md:items-end">
        <div className="flex flex-wrap gap-2">
          <DriveButton drive={drive} />
          {drive.signedIn && (
            <button className="icon-button" type="button" onClick={signOut}>
              <LogOut size={17} />
              Sign out
            </button>
          )}
        </div>
        {drive.error && <p className="max-w-xs text-right text-xs text-[var(--accent)]">{drive.error}</p>}
      </div>
    </header>
  );
}

function DriveButton({ drive }) {
  const { status, signedIn, lastSyncedAt, connect } = drive;

  if (status === 'connecting' || status === 'syncing') {
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--primary-dark)]">
        <Cloud size={17} />
        Syncing…
      </span>
    );
  }

  if (signedIn && status === 'connected') {
    const syncedLabel = lastSyncedAt
      ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
      : 'Synced';
    return (
      <span className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--primary-dark)]">
        <Cloud size={17} />
        {syncedLabel}
      </span>
    );
  }

  // Cached/offline: data is safe locally, but not syncing until re-auth.
  return (
    <button className="icon-button" type="button" onClick={connect} title="Sign in to sync with Google Drive">
      <CloudOff size={17} />
      Sign in to sync
    </button>
  );
}

function MobileNav({ activeNav, setActiveNav }) {
  return (
    <div className="sticky top-0 z-20 border-b border-[var(--line)] bg-[var(--panel)]/95 px-4 py-3 backdrop-blur lg:hidden">
      <Brand />
      <div className="mt-3 flex gap-2 overflow-x-auto scrollbar-soft">
        {navItems.map(([label, Icon]) => (
          <button
            key={label}
            type="button"
            onClick={() => setActiveNav(label)}
            className={`flex shrink-0 items-center gap-2 rounded-md px-3 py-2 text-sm ${
              activeNav === label ? 'bg-[var(--primary)] text-white' : 'bg-[var(--bg)] text-[var(--subtle)]'
            }`}
          >
            <Icon size={16} />
            {label}
          </button>
        ))}
      </div>
    </div>
  );
}

// Catmull-Rom → cubic bezier, for calm curves through the data points.
function buildSmoothPath(points) {
  if (points.length === 0) return '';
  if (points.length === 1) return `M ${points[0].x},${points[0].y}`;
  let d = `M ${points[0].x.toFixed(1)},${points[0].y.toFixed(1)}`;
  for (let i = 0; i < points.length - 1; i += 1) {
    const p0 = points[i - 1] || points[i];
    const p1 = points[i];
    const p2 = points[i + 1];
    const p3 = points[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x.toFixed(1)},${c1y.toFixed(1)} ${c2x.toFixed(1)},${c2y.toFixed(1)} ${p2.x.toFixed(1)},${p2.y.toFixed(1)}`;
  }
  return d;
}

// Month-over-month change for a trend tile. `mode` is 'pct' (relative) or
// 'points' (absolute, for percentages); `goodUp` says whether rising is good,
// which sets the colour independently of the arrow direction.
function deltaInfo(series, { mode, goodUp }) {
  const last = series[series.length - 1] || 0;
  const prev = series[series.length - 2] || 0;
  const diff = last - prev;
  if (mode === 'points') {
    if (diff === 0) return { delta: 'No change', tone: 'flat' };
    return { delta: `${diff > 0 ? '+' : ''}${diff} pts`, tone: (diff > 0) === goodUp ? 'up' : 'down', increased: diff > 0 };
  }
  if (prev === 0) {
    if (last === 0) return { delta: 'No change', tone: 'flat' };
    return { delta: 'New', tone: goodUp ? 'up' : 'down', increased: true };
  }
  const pct = Math.round((diff / prev) * 100);
  if (pct === 0) return { delta: 'No change', tone: 'flat' };
  return { delta: `${pct > 0 ? '+' : ''}${pct}%`, tone: (pct > 0) === goodUp ? 'up' : 'down', increased: pct > 0 };
}

function Sparkline({ values }) {
  const w = 88;
  const h = 30;
  const pad = 3;
  const max = Math.max(1, ...values);
  const n = values.length;
  const points = values.map((v, i) => ({
    x: pad + (w - 2 * pad) * (n > 1 ? i / (n - 1) : 0.5),
    y: pad + (h - 2 * pad) * (1 - v / max),
  }));
  const last = points[points.length - 1];
  return (
    <svg viewBox={`0 0 ${w} ${h}`} width={w} height={h} className="shrink-0" aria-hidden="true">
      <path d={buildSmoothPath(points)} fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      {last && <circle cx={last.x} cy={last.y} r="2.5" style={{ fill: 'var(--primary)' }} />}
    </svg>
  );
}

function TrendTile({ label, value, series, delta, tone, increased }) {
  const toneClass =
    tone === 'up'
      ? 'text-[#246454] bg-[var(--positive-soft)] border-[#bcdcd0]'
      : tone === 'down'
        ? 'text-red-700 bg-red-50 border-red-200'
        : 'text-[var(--subtle)] bg-[var(--panel-muted)] border-[var(--line)]';
  const Arrow = increased ? ArrowUpRight : ArrowDownRight;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--bg)] p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">{label}</p>
      <div className="mt-1 flex items-end justify-between gap-2">
        <p className="text-2xl font-semibold leading-none">{value}</p>
        <Sparkline values={series} />
      </div>
      <span className={`mt-2 inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-xs font-medium ${toneClass}`}>
        {tone !== 'flat' && <Arrow size={12} />}
        {delta}
      </span>
    </div>
  );
}

function TrendChart({ data }) {
  const W = 640;
  const H = 200;
  const padL = 16;
  const padR = 18;
  const padT = 28;
  const padB = 26;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const n = data.length;
  const collected = data.map((d) => d.collected);
  const billed = data.map((d) => d.billed);
  const max = Math.max(1, ...collected, ...billed);
  const xAt = (i) => padL + (n > 1 ? (plotW * i) / (n - 1) : plotW / 2);
  const yAt = (v) => padT + plotH * (1 - v / max);
  const cPts = collected.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const bPts = billed.map((v, i) => ({ x: xAt(i), y: yAt(v) }));
  const cLine = buildSmoothPath(cPts);
  const baseline = padT + plotH;
  const area = cPts.length ? `${cLine} L ${cPts[cPts.length - 1].x.toFixed(1)},${baseline} L ${cPts[0].x.toFixed(1)},${baseline} Z` : '';
  const gridY = [0, max / 2, max].map((v) => yAt(v));
  const lastC = cPts[cPts.length - 1];
  const lastVal = collected[collected.length - 1] || 0;
  const labelX = Math.min(Math.max(lastC?.x || 0, padL + 28), W - padR - 28);
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Collected and billed revenue over the last six months">
      <defs>
        <linearGradient id="qaTrendFill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: 'var(--primary)', stopOpacity: 0.2 }} />
          <stop offset="100%" style={{ stopColor: 'var(--primary)', stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      {gridY.map((yy, i) => (
        <line key={yy} x1={padL} y1={yy} x2={W - padR} y2={yy} style={{ stroke: 'var(--line)' }} strokeWidth="1" opacity={i === 0 ? 0.9 : 0.45} />
      ))}
      {area && <path d={area} fill="url(#qaTrendFill)" />}
      {buildSmoothPath(bPts) && (
        <path d={buildSmoothPath(bPts)} fill="none" style={{ stroke: 'var(--accent)' }} strokeWidth="1.5" strokeDasharray="4 4" strokeLinecap="round" opacity="0.75" />
      )}
      {cLine && <path d={cLine} fill="none" style={{ stroke: 'var(--primary)' }} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />}
      {lastC && (
        <>
          <circle cx={lastC.x} cy={lastC.y} r="6" style={{ fill: 'var(--panel)' }} />
          <circle cx={lastC.x} cy={lastC.y} r="3.5" style={{ fill: 'var(--primary)' }} />
          <text x={labelX} y={Math.max(lastC.y - 12, 12)} textAnchor="middle" style={{ fill: 'var(--text)' }} fontSize="12" fontWeight="600">
            {formatMoney(lastVal)}
          </text>
        </>
      )}
      {data.map((d, i) => (
        <text key={d.period} x={xAt(i)} y={H - 8} textAnchor="middle" style={{ fill: 'var(--subtle)' }} fontSize="10" letterSpacing="0.06em">
          {d.label.toUpperCase()}
        </text>
      ))}
    </svg>
  );
}

function TrendsPanel({ trends }) {
  const last = trends[trends.length - 1] || {};
  const tiles = [
    { label: 'Attendance', value: `${last.attendanceRate || 0}%`, series: trends.map((t) => t.attendanceRate), ...deltaInfo(trends.map((t) => t.attendanceRate), { mode: 'points', goodUp: true }) },
    { label: 'Sessions attended', value: last.attended || 0, series: trends.map((t) => t.attended), ...deltaInfo(trends.map((t) => t.attended), { mode: 'pct', goodUp: true }) },
    { label: 'Late cancellations', value: last.lateCancels || 0, series: trends.map((t) => t.lateCancels), ...deltaInfo(trends.map((t) => t.lateCancels), { mode: 'pct', goodUp: false }) },
  ];
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Trends</h3>
          <p className="section-subtitle">Revenue and activity over the last 6 months</p>
        </div>
        <div className="flex items-center gap-4 text-xs text-[var(--subtle)]">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--primary)' }} />Collected</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-full" style={{ background: 'var(--accent)' }} />Billed</span>
        </div>
      </div>
      <div className="mt-4">
        <TrendChart data={trends} />
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        {tiles.map((tile) => <TrendTile key={tile.label} {...tile} />)}
      </div>
    </Panel>
  );
}

function ClientSearch({ clientList, ledgerByClient, goToClient }) {
  const [query, setQuery] = useState('');
  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? clientList
        .filter((client) =>
          [client.name, client.email, client.phone, ...(client.tags || [])]
            .filter(Boolean)
            .some((field) => String(field).toLowerCase().includes(trimmed)),
        )
        .slice(0, 6)
    : [];

  function choose(id) {
    setQuery('');
    goToClient(id);
  }

  return (
    <div className="relative">
      <div className="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-3 py-2.5 shadow-soft">
        <Search size={17} className="shrink-0 text-[var(--subtle)]" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && results[0]) choose(results[0].id);
            if (event.key === 'Escape') setQuery('');
          }}
          placeholder="Search clients by name, email, phone or tag…"
          className="w-full bg-transparent text-sm text-[var(--text)] outline-none placeholder:text-[var(--subtle)]"
          aria-label="Search clients"
        />
        {query && (
          <button type="button" className="shrink-0 text-[var(--subtle)] hover:text-[var(--text)]" onClick={() => setQuery('')} aria-label="Clear search">
            <X size={16} />
          </button>
        )}
      </div>
      {trimmed && (
        <div className="absolute z-30 mt-2 w-full overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--panel)] shadow-soft">
          {results.length === 0 ? (
            <p className="px-4 py-3 text-sm text-[var(--subtle)]">No clients match “{query}”.</p>
          ) : (
            results.map((client) => {
              const outstanding = ledgerByClient[client.id]?.outstanding || 0;
              return (
                <button
                  key={client.id}
                  type="button"
                  onClick={() => choose(client.id)}
                  className="flex w-full items-center justify-between gap-3 px-4 py-2.5 text-left transition hover:bg-[var(--panel-muted)]"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">{client.name}</span>
                    <span className="block truncate text-xs text-[var(--subtle)]">{client.email || client.phone || client.type}</span>
                  </span>
                  <span className="shrink-0 text-xs text-[var(--subtle)]">{outstanding > 0 ? `${formatMoney(outstanding)} due` : client.status}</span>
                </button>
              );
            })
          )}
        </div>
      )}
    </div>
  );
}

function Dashboard({ settings, view, setView, sessions, clients, clientList, ledgerByClient, conflictIds, trends, goToClient, today, stats, statusSession, undoSession, reschedule, removeSession, addSession, setPaymentDraft, setActiveNav }) {
  const outstandingClients = Object.values(clients).filter((client) => ledgerByClient[client.id]?.outstanding > 0);
  const activeClients = Object.values(clients).filter((client) => client.status === 'Active');
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState({ clientId: '', date: today, time: '10:00', duration: 60 });
  const [modalSession, setModalSession] = useState(null);

  function submitSession(event) {
    event.preventDefault();
    const clientId = draft.clientId || activeClients[0]?.id || '';
    if (addSession({ ...draft, clientId })) {
      setAdding(false);
      setDraft({ clientId: '', date: today, time: '10:00', duration: 60 });
    }
  }

  return (
    <div className="space-y-5">
      <ClientSearch clientList={clientList} ledgerByClient={ledgerByClient} goToClient={goToClient} />
      {settings.outstandingReminders && outstandingClients.length > 0 && (
        <button
          type="button"
          onClick={() => setActiveNav('Statements')}
          className="flex w-full items-center gap-3 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-4 py-3 text-left transition hover:brightness-95"
        >
          <Mail size={18} className="shrink-0 text-[var(--primary)]" />
          <span className="text-sm">
            <span className="font-semibold">{outstandingClients.length} client{outstandingClients.length === 1 ? '' : 's'} with {formatMoney(stats.outstanding)} outstanding.</span>{' '}
            <span className="text-[var(--subtle)]">Review statements and send reminders →</span>
          </span>
        </button>
      )}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Today's Sessions" value={stats.today} icon={CalendarDays} />
        <StatCard title="Outstanding Amount" value={formatMoney(stats.outstanding)} icon={WalletCards} />
        <StatCard title="Collected This Month" value={formatMoney(stats.collected)} icon={CreditCard} />
        <StatCard title="Late Cancellations This Month" value={stats.lateCancels} icon={Clock3} />
      </div>

      <TrendsPanel trends={trends} />

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="section-title">Sessions</h3>
              <p className="section-subtitle">Recurring clients fill in automatically. Auto charge is {settings.autoCreateCharges ? 'on' : 'off'}.</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Segmented options={['Today', 'Week', 'Month']} value={view} onChange={setView} />
              <button
                type="button"
                className={`icon-button px-3 py-2 text-xs${adding ? ' is-active' : ''}`}
                onClick={() => setAdding((open) => !open)}
              >
                <Plus size={15} />
                Add session
              </button>
            </div>
          </div>

          {adding && (
            <form onSubmit={submitSession} className="mt-4 grid gap-3 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4 sm:grid-cols-2">
              {activeClients.length === 0 ? (
                <p className="text-sm text-[var(--subtle)] sm:col-span-2">Add an active client first, then you can schedule a session.</p>
              ) : (
                <>
                  <Select
                    label="Client"
                    value={draft.clientId || activeClients[0].id}
                    options={activeClients.map((client) => client.id)}
                    labels={Object.fromEntries(activeClients.map((client) => [client.id, client.name]))}
                    onChange={(value) => setDraft((current) => ({ ...current, clientId: value }))}
                  />
                  <Input label="Date" type="date" value={draft.date} onChange={(value) => setDraft((current) => ({ ...current, date: value }))} />
                  <Input label="Time" type="time" value={draft.time} onChange={(value) => setDraft((current) => ({ ...current, time: value }))} />
                  <Input label="Duration (min)" type="number" value={draft.duration} onChange={(value) => setDraft((current) => ({ ...current, duration: value }))} />
                  <div className="flex gap-2 sm:col-span-2">
                    <button type="submit" className="rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]">Add session</button>
                    <button type="button" className="icon-button px-4 py-2 text-sm" onClick={() => setAdding(false)}>Cancel</button>
                  </div>
                </>
              )}
            </form>
          )}

          <div className="mt-4 space-y-3">
            {sessions.length === 0 && (
              <p className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--subtle)]">
                No sessions for {view === 'Today' ? 'today' : `this ${view.toLowerCase()}`}. Recurring clients appear here automatically, or use Add session.
              </p>
            )}
            {sessions.map((session) => {
              const client = clients[session.clientId];
              if (!client) return null;
              const ledger = ledgerByClient[session.clientId];
              const conflict = conflictIds?.has(session.id);
              return (
                <article key={session.id} className={`rounded-md border bg-[var(--bg)] p-4 ${conflict ? 'border-red-300' : 'border-[var(--line)]'}`}>
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{session.time}</span>
                        <span className="text-sm text-[var(--subtle)]">{formatDate(session.date, { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                        <StatusBadge status={session.status} />
                        {conflict && <ConflictBadge />}
                      </div>
                      <h4 className="mt-1 text-lg font-semibold">{client.name}</h4>
                      <p className="text-sm text-[var(--subtle)]">Outstanding {formatMoney(ledger?.outstanding || 0)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SmallAction icon={Check} label="Present" active={session.status === 'Present'} onClick={() => statusSession(session.id, 'Present')} />
                      <SmallAction icon={Clock3} label="Late Cancel" active={session.status === 'Late Cancel'} onClick={() => statusSession(session.id, 'Late Cancel')} />
                      <SmallAction icon={X} label="Cancel" active={session.status === 'Cancelled'} onClick={() => statusSession(session.id, 'Cancelled')} />
                      <SmallAction icon={CalendarDays} label="Reschedule" active={session.status === 'Rescheduled'} onClick={() => setModalSession(session)} />
                      <SmallAction icon={RefreshCcw} label="Undo" onClick={() => undoSession(session.id)} />
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        </Panel>

        <Panel>
          <h3 className="section-title">Money</h3>
          <p className="section-subtitle">Clients with open balances and quick follow-up actions.</p>
          <div className="mt-4 overflow-hidden rounded-md border border-[var(--line)]">
            <table className="w-full text-left text-sm">
              <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--subtle)]">
                <tr>
                  <th className="px-3 py-3">Client</th>
                  <th className="px-3 py-3">Outstanding</th>
                  <th className="px-3 py-3">Credit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--line)]">
                {outstandingClients.map((client) => (
                  <tr key={client.id} className="bg-[var(--panel)]">
                    <td className="px-3 py-3 font-medium">{client.name}</td>
                    <td className="px-3 py-3">{formatMoney(ledgerByClient[client.id].outstanding)}</td>
                    <td className="px-3 py-3">{formatMoney(ledgerByClient[client.id].credit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mt-4 grid gap-2 sm:grid-cols-3">
            <button className="icon-button" type="button" onClick={() => { setPaymentDraft((draft) => ({ ...draft, clientId: outstandingClients[0]?.id || 'c1' })); setActiveNav('Payments'); }}>
              <CreditCard size={17} />
              Record Payment
            </button>
            <button className="icon-button" type="button">
              <MessageCircle size={17} />
              Send Reminder
            </button>
            <button className="icon-button" type="button" onClick={() => setActiveNav('Clients')}>
              <History size={17} />
              Timeline
            </button>
          </div>
        </Panel>
      </section>

      {modalSession && (
        <SessionModal
          session={modalSession}
          client={clients[modalSession.clientId]}
          ledger={ledgerByClient[modalSession.clientId]}
          statusSession={statusSession}
          undoSession={undoSession}
          reschedule={reschedule}
          removeSession={removeSession}
          onClose={() => setModalSession(null)}
        />
      )}
    </div>
  );
}

// Subtle, theme-friendly tint per status so the week reads at a glance.
const STATUS_TONE = {
  Scheduled: { chip: 'border-[var(--line)] bg-[var(--panel)]', dot: 'bg-[var(--primary)]' },
  Present: { chip: 'border-[#bcdcd0] bg-[var(--positive-soft)]', dot: 'bg-[var(--positive)]' },
  'Late Cancel': { chip: 'border-amber-300 bg-amber-50', dot: 'bg-amber-500' },
  Cancelled: { chip: 'border-[var(--line)] bg-[var(--panel-muted)] opacity-70', dot: 'bg-[var(--subtle)]' },
  Rescheduled: { chip: 'border-[var(--line)] bg-[var(--panel-muted)] opacity-70', dot: 'bg-[var(--subtle)]' },
};

function Schedule({ sessions, clients, ledgerByClient, conflictIds, today, groupSessions, groupById, markGroupAttendance, removeGroupSession, statusSession, undoSession, reschedule, removeSession }) {
  const [weekStart, setWeekStart] = useState(() => startOfWeekIso(today));
  const [modalSession, setModalSession] = useState(null);
  const [groupModalId, setGroupModalId] = useState(null);

  const days = Array.from({ length: 7 }, (_, i) => isoAddDays(weekStart, i));
  const weekEnd = days[6];
  const byDay = useMemo(() => {
    const map = Object.fromEntries(days.map((iso) => [iso, []]));
    for (const session of sessions) if (session.date in map) map[session.date].push(session);
    for (const gs of (groupSessions || [])) if (gs.date in map) map[gs.date].push(gs);
    for (const iso of days) map[iso].sort((a, b) => a.time.localeCompare(b.time));
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions, groupSessions, weekStart]);

  const weekConflicts = days.reduce((count, iso) => count + byDay[iso].filter((item) => conflictIds?.has(item.id)).length, 0);
  const rangeLabel = `${formatDate(weekStart, { day: '2-digit', month: 'short' })} – ${formatDate(weekEnd, { day: '2-digit', month: 'short' })}`;
  const modalGroup = groupModalId ? (groupSessions || []).find((gs) => gs.id === groupModalId) : null;

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="section-title">Schedule</h3>
            <p className="section-subtitle">{rangeLabel} · tap a session or group to mark, reschedule or remove it.</p>
            {weekConflicts > 0 && (
              <p className="mt-1 inline-flex items-center gap-1 text-sm font-medium text-red-700">
                <AlertTriangle size={14} />
                {weekConflicts} overlapping session{weekConflicts === 1 ? '' : 's'} this week
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setWeekStart(isoAddDays(weekStart, -7))} aria-label="Previous week">
              <ChevronLeft size={16} />
            </button>
            <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setWeekStart(startOfWeekIso(today))}>
              This week
            </button>
            <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setWeekStart(isoAddDays(weekStart, 7))} aria-label="Next week">
              <ChevronRight size={16} />
            </button>
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-7">
          {days.map((iso) => {
            const isToday = iso === today;
            const dayed = byDay[iso];
            return (
              <div key={iso} className={`rounded-md border p-2 ${isToday ? 'border-[var(--primary)] bg-[var(--bg)]' : 'border-[var(--line)] bg-[var(--panel)]'}`}>
                <div className="mb-2 flex items-baseline justify-between px-1">
                  <span className={`text-xs font-semibold uppercase tracking-wide ${isToday ? 'text-[var(--primary)]' : 'text-[var(--subtle)]'}`}>
                    {formatDate(iso, { weekday: 'short' })}
                  </span>
                  <span className={`text-sm font-semibold ${isToday ? 'text-[var(--primary)]' : ''}`}>{formatDate(iso, { day: '2-digit' })}</span>
                </div>
                <div className="space-y-2">
                  {dayed.length === 0 && <p className="px-1 py-3 text-center text-xs text-[var(--subtle)]">—</p>}
                  {dayed.map((item) => {
                    const conflict = conflictIds?.has(item.id);
                    if (item.groupId) {
                      const group = groupById?.[item.groupId];
                      return (
                        <button
                          key={item.id}
                          type="button"
                          onClick={() => setGroupModalId(item.id)}
                          className={`w-full rounded-md border border-[var(--accent)] bg-[var(--accent-soft)] px-2 py-1.5 text-left transition hover:brightness-95${conflict ? ' ring-2 ring-red-400' : ''}`}
                        >
                          <span className="flex items-center gap-1.5">
                            <Users size={12} className="shrink-0 text-[var(--accent)]" />
                            <span className="text-xs font-semibold">{item.time}</span>
                            {conflict && <AlertTriangle size={12} className="ml-auto shrink-0 text-red-600" />}
                          </span>
                          <span className="mt-0.5 block truncate text-sm font-medium">{group?.name || 'Group'}</span>
                        </button>
                      );
                    }
                    const client = clients[item.clientId];
                    if (!client) return null;
                    const tone = STATUS_TONE[item.status] || STATUS_TONE.Scheduled;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setModalSession(item)}
                        className={`w-full rounded-md border px-2 py-1.5 text-left transition hover:brightness-95 ${tone.chip}${conflict ? ' ring-2 ring-red-400' : ''}`}
                      >
                        <span className="flex items-center gap-1.5">
                          <span className={`h-2 w-2 shrink-0 rounded-full ${tone.dot}`} />
                          <span className="text-xs font-semibold">{item.time}</span>
                          {conflict && <AlertTriangle size={12} className="ml-auto shrink-0 text-red-600" />}
                        </span>
                        <span className="mt-0.5 block truncate text-sm font-medium">{client.name}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </Panel>

      {modalSession && (
        <SessionModal
          session={modalSession}
          client={clients[modalSession.clientId]}
          ledger={ledgerByClient[modalSession.clientId]}
          statusSession={statusSession}
          undoSession={undoSession}
          reschedule={reschedule}
          removeSession={removeSession}
          onClose={() => setModalSession(null)}
        />
      )}

      {modalGroup && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={() => setGroupModalId(null)}>
          <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft" onClick={(event) => event.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">{groupById?.[modalGroup.groupId]?.name || 'Group'}</h2>
              <CloseX onClose={() => setGroupModalId(null)} />
            </div>
            <GroupSessionCard
              session={modalGroup}
              group={groupById?.[modalGroup.groupId] || { members: [] }}
              clients={clients}
              onMark={markGroupAttendance}
              onRemove={(id) => { removeGroupSession(id); setGroupModalId(null); }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function SessionModal({ session, client, ledger, statusSession, undoSession, reschedule, removeSession, onClose }) {
  const [date, setDate] = useState(() => isoAddDays(session.date, 7));
  const [time, setTime] = useState(session.time);
  const runAndClose = (fn) => {
    fn();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-semibold">{client?.name || 'Session'}</h2>
            <p className="mt-1 text-sm text-[var(--subtle)]">
              {formatDate(session.date, { weekday: 'long', day: '2-digit', month: 'short' })} · {session.time} · {session.duration || 60} min
            </p>
          </div>
          <button type="button" className="rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-3 flex items-center gap-3">
          <StatusBadge status={session.status} />
          <span className="text-sm text-[var(--subtle)]">Outstanding {formatMoney(ledger?.outstanding || 0)}</span>
        </div>

        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Attendance</p>
          <div className="mt-2 flex flex-wrap gap-2">
            <SmallAction icon={Check} label="Present" active={session.status === 'Present'} onClick={() => runAndClose(() => statusSession(session.id, 'Present'))} />
            <SmallAction icon={Clock3} label="Late Cancel" active={session.status === 'Late Cancel'} onClick={() => runAndClose(() => statusSession(session.id, 'Late Cancel'))} />
            <SmallAction icon={X} label="Cancel" active={session.status === 'Cancelled'} onClick={() => runAndClose(() => statusSession(session.id, 'Cancelled'))} />
            {session.status !== 'Scheduled' && (
              <SmallAction icon={RefreshCcw} label="Undo" onClick={() => runAndClose(() => undoSession(session.id))} />
            )}
          </div>
        </div>

        <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--subtle)]">Reschedule</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <Input label="New date" type="date" value={date} onChange={setDate} />
            <Input label="New time" type="time" value={time} onChange={setTime} />
          </div>
          <button
            type="button"
            className="mt-3 w-full rounded-md bg-[var(--primary)] px-4 py-2 text-sm font-semibold text-white hover:bg-[var(--primary-dark)]"
            onClick={() => runAndClose(() => reschedule(session.id, date, time))}
          >
            Move session
          </button>
        </div>

        {!session.auto && (
          <button
            type="button"
            className="mt-4 text-sm font-medium text-[var(--accent)] hover:underline"
            onClick={() => {
              if (window.confirm('Remove this session? This cannot be undone.')) runAndClose(() => removeSession(session.id));
            }}
          >
            Remove session
          </button>
        )}
      </div>
    </div>
  );
}

function Clients({ clients, selectedClient, setSelectedClientId, ledgers, sessions, charges, payments, allocation, updateClient, updateCharge, deleteCharge, clientTab, setClientTab, clientDraft, setClientDraft, addClient, exportClientsCsv, exportJson, onImport }) {
  const [editingClient, setEditingClient] = useState(null);
  const [editingCharge, setEditingCharge] = useState(null);
  const [importOpen, setImportOpen] = useState(false);

  const selectedSessions = selectedClient ? sessions.filter((session) => session.clientId === selectedClient.id) : [];
  const selectedCharges = selectedClient ? charges.filter((charge) => charge.clientId === selectedClient.id) : [];
  const selectedPayments = selectedClient ? payments.filter((payment) => payment.clientId === selectedClient.id) : [];
  const ledger = selectedClient ? ledgers[selectedClient.id] : null;
  const timeline = [
    ...selectedSessions.map((session) => ({ date: session.date, text: `Session ${session.status}` })),
    ...selectedPayments.map((payment) => ({ date: payment.date, text: `Payment ${formatMoney(payment.amount)}` })),
    ...selectedCharges.map((charge) => ({ date: charge.date, text: `${charge.reason} ${formatMoney(charge.amount)}` })),
  ].sort((a, b) => a.date.localeCompare(b.date));

  return (
    <>
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-title">Clients</h3>
            <p className="section-subtitle">Active, archived, billing and cancellation rules.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="icon-button" type="button" onClick={() => setImportOpen(true)}>
              <Import size={17} />
              Import
            </button>
            <button className="icon-button" type="button" onClick={exportClientsCsv}>
              <Download size={17} />
              Export CSV
            </button>
            <button className="icon-button" type="button" onClick={exportJson}>
              <Archive size={17} />
              Backup
            </button>
          </div>
        </div>
        <div className="mt-4 space-y-2">
          {clients.map((client) => (
            <button
              key={client.id}
              type="button"
              onClick={() => setSelectedClientId(client.id)}
              className={`w-full rounded-md border p-3 text-left transition ${
                selectedClient.id === client.id ? 'border-[var(--primary)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--panel-muted)]'
              }`}
            >
              <div className="flex items-center justify-between gap-3">
                <span className="font-semibold">{client.name}</span>
                <StatusBadge status={client.status} />
              </div>
              <p className="mt-1 text-sm text-[var(--subtle)]">{client.billingModel} - {client.collectionMethod}</p>
            </button>
          ))}
        </div>
        <form className="mt-5 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4" onSubmit={addClient}>
          <h4 className="font-semibold">Add Client</h4>
          <div className="mt-3 grid gap-3">
            <Input label="Name" value={clientDraft.name} onChange={(value) => setClientDraft({ ...clientDraft, name: value })} />
            <Input label="Email" value={clientDraft.email} onChange={(value) => setClientDraft({ ...clientDraft, email: value })} />
            <Input label="Phone" value={clientDraft.phone} onChange={(value) => setClientDraft({ ...clientDraft, phone: value })} />
            <Select label="Type" value={clientDraft.type} options={['Individual', 'Group', 'Supervision']} onChange={(value) => setClientDraft({ ...clientDraft, type: value })} />
            <Select label="Billing Model" value={clientDraft.billingModel} options={['Per Session', 'Subscription', 'Custom']} onChange={(value) => setClientDraft({ ...clientDraft, billingModel: value })} />
            <Input label="Session Rate" type="number" value={clientDraft.sessionRate} onChange={(value) => setClientDraft({ ...clientDraft, sessionRate: Number(value) })} />
            <Input label="Tags" value={clientDraft.tags} onChange={(value) => setClientDraft({ ...clientDraft, tags: value })} />
          </div>
          <button className="mt-3 icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" type="submit">
            <Plus size={17} />
            Add Client
          </button>
        </form>
      </Panel>

      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <h3 className="text-2xl font-semibold">{selectedClient ? selectedClient.name : 'No clients yet'}</h3>
            <p className="text-sm text-[var(--subtle)]">
              {selectedClient ? `${selectedClient.email} - ${selectedClient.phone}` : 'Add your first client with the form on the left.'}
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            {(selectedClient?.tags || []).map((tag) => <span key={tag} className="rounded-md bg-[var(--panel-muted)] px-2 py-1 text-xs font-medium">{tag}</span>)}
            {selectedClient && (
              <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setEditingClient(selectedClient)}>
                <Pencil size={14} />
                Edit
              </button>
            )}
          </div>
        </div>
        <Segmented className="mt-4" options={['Overview', 'Sessions', 'Financials', 'Timeline']} value={clientTab} onChange={setClientTab} />
        <div className="mt-5">
          {clientTab === 'Overview' && selectedClient && ledger && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Outstanding Balance" value={formatMoney(ledger.outstanding)} />
              <MiniMetric label="Credit Balance" value={formatMoney(ledger.credit)} />
              <MiniMetric label="Attendance Rate" value={`${attendanceFor(selectedSessions)}%`} />
              <MiniMetric label="Reminder Preference" value={selectedClient.reminder} />
              <MiniMetric label="Joining Date" value={selectedClient.joiningDate || '—'} />
              <InfoBlock title="Scheduling" text={scheduleSummary(selectedClient)} />
              <InfoBlock title="Cancellation Rule" text={selectedClient.cancellationRule} />
              <InfoBlock title="Notes" text={selectedClient.notes || 'No notes yet.'} wide />
            </div>
          )}
          {clientTab === 'Sessions' && <SimpleTable headers={['Date', 'Status', 'Charge']} rows={selectedSessions.map((session) => [formatDate(session.date), session.status, session.chargeId ? 'Generated' : '-'])} />}
          {clientTab === 'Financials' && selectedClient && ledger && (
            <div className="space-y-4">
              <div className="grid gap-3 sm:grid-cols-2">
                <MiniMetric label="Total Charges" value={formatMoney(ledger.totalCharges)} />
                <MiniMetric label="Total Payments" value={formatMoney(ledger.totalPayments)} />
                <MiniMetric label="Outstanding" value={formatMoney(ledger.outstanding)} />
                <MiniMetric label="Credit Balance" value={formatMoney(ledger.credit)} />
              </div>
              <div>
                <p className="mb-2 text-sm font-semibold">Charges</p>
                {selectedCharges.length === 0 ? (
                  <p className="text-sm text-[var(--subtle)]">No charges for this client yet.</p>
                ) : (
                  <SimpleTable
                    headers={['Date', 'Reason', 'Amount', 'Paid', 'Balance', 'Status', '']}
                    rows={selectedCharges
                      .slice()
                      .sort((a, b) => b.date.localeCompare(a.date))
                      .map((charge) => {
                        const settled = allocation?.byCharge[charge.id] || {
                          paid: 0,
                          balance: charge.amount,
                          status: 'Pending',
                        };
                        return [
                          formatDate(charge.date),
                          charge.reason,
                          formatMoney(charge.amount),
                          formatMoney(settled.paid),
                          formatMoney(settled.balance),
                          <ChargeStatusBadge key="s" status={settled.status} />,
                          <div key="a" className="flex justify-end gap-1">
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-[var(--subtle)] hover:bg-[var(--panel-muted)] hover:text-[var(--text)]"
                              onClick={() => setEditingCharge(charge)}
                              title="Edit charge"
                              aria-label="Edit charge"
                            >
                              <Pencil size={15} />
                            </button>
                            <button
                              type="button"
                              className="rounded-md p-1.5 text-[var(--subtle)] hover:bg-[var(--panel-muted)] hover:text-[var(--accent)]"
                              onClick={() => {
                                if (window.confirm(`Remove this ${charge.reason} charge of ${formatMoney(charge.amount)}?`)) deleteCharge(charge.id);
                              }}
                              title="Remove charge"
                              aria-label="Remove charge"
                            >
                              <Trash2 size={15} />
                            </button>
                          </div>,
                        ];
                      })}
                  />
                )}
              </div>
            </div>
          )}
          {clientTab === 'Timeline' && (
            <div className="space-y-3">
              {timeline.map((item, index) => (
                <div key={`${item.date}-${index}`} className="flex gap-3 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3">
                  <History className="mt-0.5 text-[var(--primary)]" size={17} />
                  <div>
                    <p className="font-medium">{formatDate(item.date)}</p>
                    <p className="text-sm text-[var(--subtle)]">{item.text}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Panel>
    </div>
    {editingClient && (
      <ClientEditModal
        client={editingClient}
        onSave={updateClient}
        onClose={() => setEditingClient(null)}
      />
    )}
    {editingCharge && (
      <ChargeEditModal
        charge={editingCharge}
        onSave={updateCharge}
        onClose={() => setEditingCharge(null)}
      />
    )}
    {importOpen && (
      <ClientImportWizard
        existingClients={clients}
        onImport={onImport}
        onClose={() => setImportOpen(false)}
      />
    )}
    </>
  );
}

function ClientEditModal({ client, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({
    ...client,
    tags: Array.isArray(client.tags) ? client.tags.join(', ') : client.tags || '',
  }));
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const dayOptions = ['', ...WEEKDAYS];
  const dayLabels = { '': '—' };

  function submit(event) {
    event.preventDefault();
    if (!String(draft.name).trim()) return;
    onSave({
      ...draft,
      name: String(draft.name).trim(),
      sessionRate: Number(draft.sessionRate) || 0,
      monthlyFee: Number(draft.monthlyFee) || 0,
      duration: Number(draft.duration) || 60,
      tags: String(draft.tags).split(',').map((tag) => tag.trim()).filter(Boolean),
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">Edit {client.name || 'client'}</h2>
          <button type="button" className="rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={draft.name} onChange={(value) => set({ name: value })} />
          <Select label="Status" value={draft.status} options={['Active', 'Archived']} onChange={(value) => set({ status: value })} />
          <Input label="Email" value={draft.email || ''} onChange={(value) => set({ email: value })} />
          <Input label="Phone" value={draft.phone || ''} onChange={(value) => set({ phone: value })} />
          <Select label="Type" value={draft.type} options={['Individual', 'Group', 'Supervision']} onChange={(value) => set({ type: value })} />
          <Select label="Billing Model" value={draft.billingModel} options={['Per Session', 'Subscription', 'Custom']} onChange={(value) => set({ billingModel: value })} />
          <Input label="Session Rate" type="number" value={draft.sessionRate} onChange={(value) => set({ sessionRate: value })} />
          <Input label="Monthly Fee" type="number" value={draft.monthlyFee} onChange={(value) => set({ monthlyFee: value })} />
          <Select label="Collection Method" value={draft.collectionMethod} options={CLIENT_CSV_ENUMS.collectionMethod} onChange={(value) => set({ collectionMethod: value })} />
          <Select label="Schedule Type" value={draft.scheduleType} options={['Recurring', 'Manual']} onChange={(value) => set({ scheduleType: value })} />
          <Select label="Session Day" value={draft.day || ''} options={dayOptions} labels={dayLabels} onChange={(value) => set({ day: value })} />
          <Input label="Session Time" type="time" value={draft.time || ''} onChange={(value) => set({ time: value })} />
          <Select label="Session Day 2" value={draft.day2 || ''} options={dayOptions} labels={dayLabels} onChange={(value) => set({ day2: value })} />
          <Input label="Session Time 2" type="time" value={draft.time2 || ''} onChange={(value) => set({ time2: value })} />
          <Input label="Duration (min)" type="number" value={draft.duration} onChange={(value) => set({ duration: value })} />
          <Select label="Reminder" value={draft.reminder} options={['WhatsApp', 'Email', 'Both', 'None']} onChange={(value) => set({ reminder: value })} />
          <Select label="Cancellation Rule" value={draft.cancellationRule} options={['Use Practice Default', 'Custom']} onChange={(value) => set({ cancellationRule: value })} />
          <Input label="Joining Date" type="date" value={draft.joiningDate || ''} onChange={(value) => set({ joiningDate: value })} />
          <Input label="Tags (comma separated)" value={draft.tags} onChange={(value) => set({ tags: value })} />
        </div>

        <label className="mt-3 block">
          <span className="text-sm font-medium text-[var(--subtle)]">Notes</span>
          <textarea
            value={draft.notes || ''}
            onChange={(event) => set({ notes: event.target.value })}
            rows={3}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]">
            <Check size={16} />
            Save changes
          </button>
        </div>
      </form>
    </div>
  );
}

function ChargeEditModal({ charge, onSave, onClose }) {
  const [date, setDate] = useState(charge.date);
  const [amount, setAmount] = useState(charge.amount);
  const [reason, setReason] = useState(charge.reason);

  function submit(event) {
    event.preventDefault();
    if (!String(reason).trim() || Number(amount) <= 0) return;
    onSave(charge.id, { date, amount: Number(amount), reason: String(reason).trim() });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="w-full max-w-md rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">Edit charge</h2>
          <button type="button" className="rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>
        <div className="mt-4 grid gap-3">
          <Input label="Date" type="date" value={date} onChange={setDate} />
          <Input label="Amount" type="number" value={amount} onChange={setAmount} />
          <Input label="Reason" value={reason} onChange={setReason} />
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]">
            <Check size={16} />
            Save charge
          </button>
        </div>
      </form>
    </div>
  );
}

function emptyGroup() {
  return { name: '', type: 'Therapy', capacity: 8, billingModel: 'Per Session', sessionFee: 1200, schedule: '', status: 'Active', notes: '', members: [], recurring: false, day: '', time: '', duration: 90, startDate: '', endDate: '' };
}

function GroupSessionCard({ session, group, clients, onMark, onRemove }) {
  const members = group.members || [];
  const presentCount = members.filter((id) => session.attendance?.[id]?.status === 'Present').length;
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="font-semibold">{formatDate(session.date, { weekday: 'short', day: '2-digit', month: 'short' })} · {session.time}</p>
          <p className="text-sm text-[var(--subtle)]">{session.duration || 60} min · {presentCount}/{members.length} present</p>
        </div>
        <button
          type="button"
          className="rounded-md p-1.5 text-[var(--subtle)] hover:bg-[var(--panel-muted)] hover:text-[var(--accent)]"
          onClick={() => { if (window.confirm('Remove this group session and any charges it created?')) onRemove(session.id); }}
          title="Remove session"
          aria-label="Remove session"
        >
          <Trash2 size={15} />
        </button>
      </div>
      <div className="mt-3 space-y-2">
        {members.length === 0 && <p className="text-sm text-[var(--subtle)]">No members in this group yet — add some from Edit.</p>}
        {members.map((id) => {
          const client = clients[id];
          if (!client) return null;
          const status = session.attendance?.[id]?.status;
          return (
            <div key={id} className="flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--panel)] p-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="flex items-center gap-2 text-sm font-medium">
                {client.name}
                {status && <StatusBadge status={status} />}
              </span>
              <div className="flex flex-wrap gap-1.5">
                <SmallAction icon={Check} label="Present" active={status === 'Present'} onClick={() => onMark(session.id, id, 'Present')} />
                <SmallAction icon={Clock3} label="Late Cancel" active={status === 'Late Cancel'} onClick={() => onMark(session.id, id, 'Late Cancel')} />
                <SmallAction icon={X} label="Absent" active={status === 'Absent'} onClick={() => onMark(session.id, id, 'Absent')} />
                {status && <SmallAction icon={RefreshCcw} label="Clear" onClick={() => onMark(session.id, id, null)} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Groups({ groups, clients, clientList, groupSessions, settings, today, addGroup, updateGroup, removeGroup, addGroupSession, removeGroupSession, markGroupAttendance }) {
  const [selectedId, setSelectedId] = useState(groups[0]?.id || null);
  const [editing, setEditing] = useState(null); // a group object, or 'new'
  const [draft, setDraft] = useState({ date: today, time: '18:00', duration: 90 });

  const selected = groups.find((group) => group.id === selectedId) || groups[0] || null;
  const sessions = useMemo(
    () => groupSessions
      .filter((session) => session.groupId === selected?.id)
      .sort((a, b) => `${b.date}${b.time}`.localeCompare(`${a.date}${a.time}`)),
    [groupSessions, selected],
  );

  function submitSession(event) {
    event.preventDefault();
    if (!selected) return;
    if (addGroupSession({ ...draft, groupId: selected.id })) setDraft({ date: today, time: '18:00', duration: 90 });
  }

  return (
    <>
      <div className="grid gap-5 xl:grid-cols-[0.85fr_1.6fr]">
        <Panel>
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="section-title">Groups</h3>
              <p className="section-subtitle">Therapy and supervision groups.</p>
            </div>
            <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setEditing('new')}>
              <Plus size={15} />
              New group
            </button>
          </div>
          <div className="mt-4 space-y-2">
            {groups.length === 0 && (
              <p className="text-sm text-[var(--subtle)]">No groups yet. Create one to schedule sessions and track attendance.</p>
            )}
            {groups.map((group) => (
              <button
                key={group.id}
                type="button"
                onClick={() => setSelectedId(group.id)}
                className={`w-full rounded-md border p-3 text-left transition ${
                  selected?.id === group.id ? 'border-[var(--primary)] bg-[var(--accent-soft)]' : 'border-[var(--line)] bg-[var(--bg)] hover:bg-[var(--panel-muted)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <span className="font-semibold">{group.name}</span>
                  <StatusBadge status={`${group.members.length}/${group.capacity}`} />
                </div>
                <p className="mt-1 text-sm text-[var(--subtle)]">{group.type} · {group.status}</p>
              </button>
            ))}
          </div>
        </Panel>

        <Panel>
          {!selected ? (
            <p className="text-sm text-[var(--subtle)]">Select or create a group to manage its sessions.</p>
          ) : (
            <>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-2xl font-semibold">{selected.name}</h3>
                  <p className="text-sm text-[var(--subtle)]">{selected.type} · {selected.status}</p>
                </div>
                <div className="flex items-center gap-2">
                  <button type="button" className="icon-button px-3 py-2 text-xs" onClick={() => setEditing(selected)}>
                    <Pencil size={14} />
                    Edit
                  </button>
                  <button
                    type="button"
                    className="icon-button px-3 py-2 text-xs text-red-700 hover:bg-red-50"
                    onClick={() => removeGroup(selected.id)}
                  >
                    <Trash2 size={14} />
                    Delete
                  </button>
                </div>
              </div>
              <div className="mt-4 grid gap-3 sm:grid-cols-3">
                <MiniMetric label="Billing" value={selected.billingModel} />
                <MiniMetric label="Default Fee" value={formatMoney(selected.sessionFee)} />
                <MiniMetric label="Members" value={`${selected.members.length}/${selected.capacity}`} />
              </div>
              {(() => {
                const scheduleText = selected.recurring && selected.day && selected.time
                  ? `Weekly · ${selected.day} ${selected.time} · ${selected.duration || 90} min`
                  : selected.schedule;
                const fmt = (iso) => formatDate(iso, { day: '2-digit', month: 'short', year: 'numeric' });
                const windowText = selected.startDate || selected.endDate
                  ? `${selected.startDate ? `From ${fmt(selected.startDate)}` : 'Open start'}${selected.endDate ? ` · Until ${fmt(selected.endDate)}` : ''}`
                  : '';
                if (!scheduleText && !windowText && !selected.notes) return null;
                return (
                  <div className="mt-3 grid gap-3 sm:grid-cols-2">
                    {scheduleText && <InfoBlock title="Schedule" text={scheduleText} />}
                    {windowText && <InfoBlock title="Runs" text={windowText} />}
                    {selected.notes && <InfoBlock title="Notes" text={selected.notes} />}
                  </div>
                );
              })()}
              <div className="mt-3 flex flex-wrap gap-2">
                {selected.members.map((id) => (
                  <span key={id} className="rounded-md bg-[var(--panel-muted)] px-3 py-1.5 text-sm">{clients[id]?.name || 'Unknown'}</span>
                ))}
              </div>

              <h4 className="mt-6 font-semibold">Sessions</h4>
              <p className="mt-1 text-sm text-[var(--subtle)]">Marking a member present bills their own session rate, or the group fee if they have none. Auto charge is {settings.autoCreateCharges ? 'on' : 'off'}.</p>
              <form onSubmit={submitSession} className="mt-3 grid gap-3 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3 sm:grid-cols-4">
                <Input label="Date" type="date" value={draft.date} onChange={(value) => setDraft((current) => ({ ...current, date: value }))} />
                <Input label="Time" type="time" value={draft.time} onChange={(value) => setDraft((current) => ({ ...current, time: value }))} />
                <Input label="Duration (min)" type="number" value={draft.duration} onChange={(value) => setDraft((current) => ({ ...current, duration: value }))} />
                <div className="flex items-end">
                  <button type="submit" className="icon-button w-full justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]">
                    <Plus size={16} />
                    Add session
                  </button>
                </div>
              </form>

              <div className="mt-4 space-y-3">
                {sessions.length === 0 && (
                  <p className="rounded-md border border-dashed border-[var(--line)] bg-[var(--bg)] px-4 py-6 text-center text-sm text-[var(--subtle)]">No sessions yet. Add one above.</p>
                )}
                {sessions.map((session) => (
                  <GroupSessionCard
                    key={session.id}
                    session={session}
                    group={selected}
                    clients={clients}
                    onMark={markGroupAttendance}
                    onRemove={removeGroupSession}
                  />
                ))}
              </div>
            </>
          )}
        </Panel>
      </div>

      {editing && (
        <GroupEditModal
          group={editing === 'new' ? emptyGroup() : editing}
          clientList={clientList}
          isNew={editing === 'new'}
          onSave={(next) => {
            if (editing === 'new') {
              const id = addGroup(next);
              if (id) setSelectedId(id);
            } else {
              updateGroup(next);
            }
          }}
          onClose={() => setEditing(null)}
        />
      )}
    </>
  );
}

function GroupEditModal({ group, clientList, isNew, onSave, onClose }) {
  const [draft, setDraft] = useState(() => ({ ...group, members: group.members || [] }));
  const set = (patch) => setDraft((current) => ({ ...current, ...patch }));
  const toggleMember = (id) =>
    setDraft((current) => {
      const members = current.members || [];
      return { ...current, members: members.includes(id) ? members.filter((m) => m !== id) : [...members, id] };
    });

  function submit(event) {
    event.preventDefault();
    if (!String(draft.name).trim()) return;
    if (draft.startDate && draft.endDate && draft.endDate < draft.startDate) {
      window.alert('End date is before the start date.');
      return;
    }
    onSave({
      ...draft,
      name: String(draft.name).trim(),
      capacity: Number(draft.capacity) || 0,
      sessionFee: Number(draft.sessionFee) || 0,
      duration: Number(draft.duration) || 90,
    });
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onClick={onClose}>
      <form
        className="max-h-[88vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft"
        onClick={(event) => event.stopPropagation()}
        onSubmit={submit}
      >
        <div className="flex items-start justify-between gap-3">
          <h2 className="text-xl font-semibold">{isNew ? 'New group' : `Edit ${group.name}`}</h2>
          <button type="button" className="rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]" onClick={onClose} aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Input label="Name" value={draft.name} onChange={(value) => set({ name: value })} />
          <Select label="Status" value={draft.status} options={['Active', 'Archived']} onChange={(value) => set({ status: value })} />
          <Select label="Type" value={draft.type} options={['Therapy', 'Supervision', 'Support', 'Other']} onChange={(value) => set({ type: value })} />
          <Input label="Capacity" type="number" value={draft.capacity} onChange={(value) => set({ capacity: value })} />
          <Select label="Billing Model" value={draft.billingModel} options={['Per Session', 'Subscription']} onChange={(value) => set({ billingModel: value })} />
          <Input label="Default Session Fee" type="number" value={draft.sessionFee} onChange={(value) => set({ sessionFee: value })} />
        </div>
        <p className="mt-1 text-xs text-[var(--subtle)]">Each member is billed their own session rate; this fee is used only for members with no rate set.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Input label="Start date" type="date" value={draft.startDate || ''} onChange={(value) => set({ startDate: value })} />
          <Input label="End date (optional)" type="date" value={draft.endDate || ''} onChange={(value) => set({ endDate: value })} />
        </div>
        <p className="mt-1 text-xs text-[var(--subtle)]">Weekly meetings and billing only begin on the start date. Leave the end date blank to keep the group running.</p>
        <div className="mt-3 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3">
          <label className="flex items-center gap-2 text-sm font-medium">
            <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={!!draft.recurring} onChange={(event) => set({ recurring: event.target.checked })} />
            Recurring weekly
          </label>
          {draft.recurring && (
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              <Select label="Day" value={draft.day || ''} options={['', ...WEEKDAYS]} labels={{ '': '—' }} onChange={(value) => set({ day: value })} />
              <Input label="Time" type="time" value={draft.time || ''} onChange={(value) => set({ time: value })} />
              <Input label="Duration (min)" type="number" value={draft.duration} onChange={(value) => set({ duration: value })} />
            </div>
          )}
          <p className="mt-2 text-xs text-[var(--subtle)]">When on, weekly meetings fill into the calendar automatically for the next few weeks — mark attendance as they happen.</p>
        </div>
        <label className="mt-3 block">
          <span className="text-sm font-medium text-[var(--subtle)]">Notes</span>
          <textarea
            value={draft.notes || ''}
            onChange={(event) => set({ notes: event.target.value })}
            rows={2}
            className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
          />
        </label>

        <div className="mt-4">
          <p className="text-sm font-medium text-[var(--subtle)]">Members</p>
          {clientList.length === 0 ? (
            <p className="mt-1 text-sm text-[var(--subtle)]">Add clients first, then you can put them in a group.</p>
          ) : (
            <div className="mt-2 grid max-h-48 gap-1 overflow-auto scrollbar-soft rounded-md border border-[var(--line)] bg-[var(--bg)] p-2 sm:grid-cols-2">
              {clientList.map((client) => (
                <label key={client.id} className="flex items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-[var(--panel-muted)]">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-[var(--primary)]"
                    checked={(draft.members || []).includes(client.id)}
                    onChange={() => toggleMember(client.id)}
                  />
                  {client.name}
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button type="button" className="icon-button" onClick={onClose}>Cancel</button>
          <button type="submit" className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]">
            <Check size={16} />
            {isNew ? 'Create group' : 'Save changes'}
          </button>
        </div>
      </form>
    </div>
  );
}

function Payments({ clients, ledgers, payments, charges, allocation, paymentDraft, setPaymentDraft, recordPayment }) {
  const openCharges = allocation?.openByClient[paymentDraft.clientId] || [];
  const applyOptions = ['', ...openCharges.map((charge) => charge.id)];
  const applyLabels = {
    '': 'Oldest unpaid first',
    ...Object.fromEntries(
      openCharges.map((charge) => {
        const balance = allocation?.byCharge[charge.id]?.balance ?? charge.amount;
        return [charge.id, `${charge.reason} — ${formatMoney(balance)} (${formatDate(charge.date)})`];
      }),
    ),
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel>
        <h3 className="section-title">Record Payment</h3>
        <p className="section-subtitle">Supports UPI, bank transfer, cash, card and other methods.</p>
        <form className="mt-4 grid gap-3" onSubmit={recordPayment}>
          <Select
            label="Client"
            value={paymentDraft.clientId}
            options={clients.map((client) => client.id)}
            labels={Object.fromEntries(clients.map((client) => [client.id, client.name]))}
            onChange={(value) => setPaymentDraft({ ...paymentDraft, clientId: value, chargeId: '' })}
          />
          <Input label="Amount" type="number" value={paymentDraft.amount} onChange={(value) => setPaymentDraft({ ...paymentDraft, amount: value })} />
          <Select
            label="Apply to"
            value={applyOptions.includes(paymentDraft.chargeId) ? paymentDraft.chargeId : ''}
            options={applyOptions}
            labels={applyLabels}
            onChange={(value) => setPaymentDraft({ ...paymentDraft, chargeId: value })}
          />
          <Select label="Method" value={paymentDraft.method} options={['UPI', 'Bank Transfer', 'Cash', 'Card', 'Other']} onChange={(value) => setPaymentDraft({ ...paymentDraft, method: value })} />
          <Input label="Reference Number" value={paymentDraft.reference} onChange={(value) => setPaymentDraft({ ...paymentDraft, reference: value })} />
          <Input label="Notes" value={paymentDraft.notes} onChange={(value) => setPaymentDraft({ ...paymentDraft, notes: value })} />
          <button className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" type="submit">
            <CreditCard size={17} />
            Save Payment
          </button>
        </form>
      </Panel>
      <Panel>
        <h3 className="section-title">Payment Ledger</h3>
        <div className="mt-4 space-y-3">
          {payments.slice().reverse().map((payment) => {
            const client = clients.find((item) => item.id === payment.clientId);
            const target = payment.chargeId
              ? charges.find((charge) => charge.id === payment.chargeId)
              : null;
            return (
              <div key={payment.id} className="flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{client.name}</p>
                  <p className="text-sm text-[var(--subtle)]">{formatDate(payment.date)} - {payment.method} - {payment.reference}</p>
                  <p className="text-xs text-[var(--subtle)]">{target ? `Applied to ${target.reason}` : 'Oldest unpaid first'}</p>
                </div>
                <div className="text-left sm:text-right">
                  <p className="font-semibold">{formatMoney(payment.amount)}</p>
                  <p className="text-sm text-[var(--subtle)]">Outstanding {formatMoney(ledgers[payment.clientId]?.outstanding || 0)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Statements({ clients, sessions, charges, payments, settings, showNotice, today }) {
  const months = useMemo(() => recentMonths(6, today), [today]);
  const [period, setPeriod] = useState(months[0]);
  const [showEmpty, setShowEmpty] = useState(false);

  const activeClients = useMemo(() => clients.filter((client) => client.status === 'Active'), [clients]);
  const statements = useMemo(
    () => activeClients.map((client) => computeMonthlyStatement(client, period, sessions, charges, payments)),
    [activeClients, period, sessions, charges, payments],
  );
  const visible = showEmpty ? statements : statements.filter((statement) => statement.hasActivity);

  const totals = statements.reduce(
    (acc, statement) => ({
      billed: acc.billed + statement.chargesTotal,
      collected: acc.collected + statement.paymentsTotal,
      outstanding: acc.outstanding + statement.outstanding,
      active: acc.active + (statement.hasActivity ? 1 : 0),
    }),
    { billed: 0, collected: 0, outstanding: 0, active: 0 },
  );

  const clientById = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);
  const periodLabel = monthLabel(period);
  const owing = visible.filter((statement) => statement.outstanding > 0);

  function copyText(text, doneMessage) {
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showNotice(doneMessage),
        () => showNotice('Could not copy — check browser permissions.'),
      );
    } else {
      showNotice('Clipboard not available in this browser.');
    }
  }

  function copyStatement(statement) {
    copyText(formatStatementText(statement, settings), `${statement.clientName}'s statement copied.`);
  }

  // jsPDF is loaded on demand so it never weighs down the initial app load.
  async function downloadPdf(statement) {
    try {
      const mod = await import('./statementPdf.js');
      mod.downloadStatementPdf(statement, settings, periodLabel);
    } catch {
      showNotice('Could not build the PDF. Please try again.');
    }
  }

  async function downloadAllPdf() {
    if (visible.length === 0) return;
    try {
      const mod = await import('./statementPdf.js');
      mod.downloadStatementsPdf(visible, settings, periodLabel);
      showNotice(`Downloaded ${visible.length} statement${visible.length === 1 ? '' : 's'}.`);
    } catch {
      showNotice('Could not build the PDF. Please try again.');
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="section-title">Monthly Statements</h3>
            <p className="section-subtitle">
              Auto-calculated per client. Download a PDF or share a prefilled message on WhatsApp or email.
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-end">
            <button
              type="button"
              className="icon-button"
              onClick={downloadAllPdf}
              disabled={visible.length === 0}
            >
              <Download size={17} />
              Download all
            </button>
            <div className="w-full sm:w-56">
              <Select
                label="Month"
                value={period}
                options={months}
                labels={Object.fromEntries(months.map((m) => [m, monthLabel(m)]))}
                onChange={setPeriod}
              />
            </div>
          </div>
        </div>
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <MiniMetric label="Clients with Activity" value={totals.active} />
          <MiniMetric label="Revenue Billed" value={formatMoney(totals.billed)} />
          <MiniMetric label="Revenue Collected" value={formatMoney(totals.collected)} />
          <MiniMetric label="Outstanding" value={formatMoney(totals.outstanding)} />
        </div>
        <label className="mt-4 flex w-fit items-center gap-2 text-sm text-[var(--subtle)]">
          <input type="checkbox" className="h-4 w-4 accent-[var(--primary)]" checked={showEmpty} onChange={(event) => setShowEmpty(event.target.checked)} />
          Show clients with no activity this month
        </label>
      </Panel>

      {settings.outstandingReminders && owing.length > 0 && (
        <Panel>
          <h3 className="section-title">Outstanding reminders</h3>
          <p className="section-subtitle">{owing.length} client{owing.length === 1 ? '' : 's'} with a balance for {periodLabel}. Send a gentle nudge.</p>
          <div className="mt-4 space-y-2">
            {owing.map((statement) => {
              const client = clientById[statement.clientId];
              const text = formatReminderText(statement, settings, periodLabel);
              const subject = `Payment reminder — ${settings.practiceName}`;
              return (
                <div key={statement.clientId} className="flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <p className="font-semibold">{statement.clientName}</p>
                    <p className="text-sm text-[var(--subtle)]">Outstanding {formatMoney(statement.outstanding)}</p>
                  </div>
                  <ShareActions
                    waUrl={whatsappUrl(client?.phone, text)}
                    mailUrl={mailtoUrl(client?.email, subject, text)}
                    onCopy={() => copyText(text, `${statement.clientName}'s reminder copied.`)}
                  />
                </div>
              );
            })}
          </div>
        </Panel>
      )}

      {visible.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--subtle)]">No client activity for {monthLabel(period)}.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((statement) => (
            <StatementCard
              key={statement.clientId}
              statement={statement}
              client={clientById[statement.clientId]}
              settings={settings}
              periodLabel={periodLabel}
              onCopy={() => copyStatement(statement)}
              onDownloadPdf={() => downloadPdf(statement)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// Share row reused by statement cards and outstanding reminders. WhatsApp and
// email are prefilled deep links (the therapist reviews and sends); a channel is
// disabled when the client has no phone/email for it.
function ShareActions({ waUrl, mailUrl, onCopy }) {
  const linkClass = 'icon-button px-3 py-2 text-xs';
  const disabledClass = 'icon-button px-3 py-2 text-xs pointer-events-none opacity-40';
  return (
    <div className="flex flex-wrap gap-2">
      <a
        className={waUrl ? linkClass : disabledClass}
        href={waUrl || undefined}
        target="_blank"
        rel="noopener noreferrer"
        aria-disabled={!waUrl}
        title={waUrl ? 'Open WhatsApp' : 'No phone number on file'}
      >
        <MessageCircle size={15} />
        WhatsApp
      </a>
      <a
        className={mailUrl ? linkClass : disabledClass}
        href={mailUrl || undefined}
        aria-disabled={!mailUrl}
        title={mailUrl ? 'Open email' : 'No email on file'}
      >
        <Mail size={15} />
        Email
      </a>
      <button className="icon-button px-3 py-2 text-xs" type="button" onClick={onCopy}>
        <Copy size={15} />
        Copy
      </button>
    </div>
  );
}

function StatementCard({ statement, client, settings, periodLabel, onCopy, onDownloadPdf }) {
  const money = (n) => formatMoney(n);
  const rows = [['Sessions attended', `${statement.attended} · ${money(statement.sessionFees)}`]];
  if (statement.lateCancels) rows.push(['Late cancellations', `${statement.lateCancels} · ${money(statement.lateFees)}`]);
  if (statement.cancellations) rows.push(['Cancellations', `${statement.cancellations}`]);
  if (statement.otherCharges) rows.push(['Other charges', money(statement.otherCharges)]);
  rows.push(['Payments received', money(statement.paymentsTotal)]);
  if (statement.broughtForward > 0) rows.push(['Brought forward', money(statement.broughtForward)]);
  if (statement.broughtForward < 0) rows.push(['Credit brought forward', money(-statement.broughtForward)]);

  const closing =
    statement.outstanding > 0
      ? ['Outstanding', money(statement.outstanding)]
      : statement.credit > 0
        ? ['Credit balance', money(statement.credit)]
        : ['Balance', 'Settled'];

  const shareText = formatStatementText(statement, settings);
  const subject = `Statement for ${periodLabel} — ${settings.practiceName}`;

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">{statement.clientName}</h4>
          <p className="text-sm text-[var(--subtle)]">Reminder preference: {statement.reminder || 'None'}</p>
        </div>
        <button className="icon-button px-3 py-2 text-xs" type="button" onClick={onDownloadPdf}>
          <Download size={15} />
          PDF
        </button>
      </div>
      <div className="mt-4 divide-y divide-[var(--line)] rounded-md border border-[var(--line)]">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="text-[var(--subtle)]">{label}</span>
            <span className="font-medium">{value}</span>
          </div>
        ))}
        <div className="flex items-center justify-between bg-[var(--panel-muted)] px-3 py-2.5 text-sm font-semibold">
          <span>{closing[0]}</span>
          <span>{closing[1]}</span>
        </div>
      </div>
      <div className="mt-3">
        <ShareActions
          waUrl={whatsappUrl(client?.phone, shareText)}
          mailUrl={mailtoUrl(client?.email, subject, shareText)}
          onCopy={onCopy}
        />
      </div>
    </Panel>
  );
}

function Reports({ stats, exportJson }) {
  const rows = [
    ['Sessions Scheduled', stats.sessionsScheduled],
    ['Sessions Attended', stats.sessionsAttended],
    ['Attendance %', `${stats.attendanceRate}%`],
    ['Revenue Billed', formatMoney(stats.revenueBilled)],
    ['Revenue Collected', formatMoney(stats.revenueCollected)],
    ['Outstanding Amount', formatMoney(stats.outstanding)],
    ['Credit Balances', formatMoney(stats.credit)],
    ['Collection Rate', `${stats.collectionRate}%`],
    ['Late Cancellations', stats.lateCancels],
  ];
  return (
    <Panel>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="section-title">Monthly Overview</h3>
          <p className="section-subtitle">June 2026 operating snapshot.</p>
        </div>
        <button className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" type="button" onClick={exportJson}>
          <Download size={17} />
          JSON Backup
        </button>
      </div>
      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {rows.map(([label, value]) => <MiniMetric key={label} label={label} value={value} />)}
      </div>
    </Panel>
  );
}

function SettingsScreen({ settings, setSettings, loadSampleData, exportJson, drive, onNotice }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel>
        <h3 className="section-title">Practice</h3>
        <div className="mt-4 grid gap-3">
          <Input label="Therapist Name" value={settings.therapistName} onChange={(value) => setSettings({ ...settings, therapistName: value })} />
          <Input label="Practice Name" value={settings.practiceName} onChange={(value) => setSettings({ ...settings, practiceName: value })} />
          <Input label="Payment Details (UPI / bank)" value={settings.paymentDetails || ''} onChange={(value) => setSettings({ ...settings, paymentDetails: value })} />
          <Select label="Currency" value={settings.currency || 'INR'} options={CURRENCY_OPTIONS} onChange={(value) => setSettings({ ...settings, currency: value })} />
        </div>
        <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
          <p className="text-sm font-semibold">Account &amp; data</p>
          <p className="mt-1 text-sm text-[var(--subtle)]">
            {drive?.signedIn ? `Signed in as ${drive.email}. ` : ''}Data is stored in your own Google Drive and cached in this browser.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button className="icon-button" type="button" onClick={exportJson}>
              <Archive size={17} />
              Backup JSON
            </button>
            <button className="icon-button" type="button" onClick={loadSampleData}>
              <RefreshCcw size={17} />
              Load sample data
            </button>
          </div>
        </div>
        <BackupManager drive={drive} onNotice={onNotice} />
      </Panel>
      <Panel>
        <h3 className="section-title">Billing and Reminders</h3>
        <div className="mt-4 grid gap-4">
          <Toggle label="Auto Create Charges" checked={settings.autoCreateCharges} onChange={(checked) => setSettings({ ...settings, autoCreateCharges: checked })} />
          <Select label="Late Cancellation Threshold" value={String(settings.lateCancellationHours)} options={['12', '24', '48']} labels={{ 12: '12 Hours', 24: '24 Hours', 48: '48 Hours' }} onChange={(value) => setSettings({ ...settings, lateCancellationHours: Number(value) })} />
          <Select label="Late Cancellation Charge" value={String(settings.lateCancellationCharge)} options={['0', '50', '100']} labels={{ 0: '0%', 50: '50%', 100: '100%' }} onChange={(value) => setSettings({ ...settings, lateCancellationCharge: Number(value) })} />
          <Toggle label="Monthly Statements" checked={settings.monthlyStatements} onChange={(checked) => setSettings({ ...settings, monthlyStatements: checked })} />
          <Toggle label="Outstanding Reminders" checked={settings.outstandingReminders} onChange={(checked) => setSettings({ ...settings, outstandingReminders: checked })} />
        </div>
      </Panel>
    </div>
  );
}

function formatBackupTime(ms) {
  return new Date(ms).toLocaleString('en-IN', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function BackupManager({ drive, onNotice }) {
  const signedIn = Boolean(drive?.signedIn);
  const [open, setOpen] = useState(false);
  const [backups, setBackups] = useState(null); // null = not loaded yet
  const [loading, setLoading] = useState(false);
  const [restoringId, setRestoringId] = useState('');

  const refresh = useCallback(async () => {
    if (!signedIn) return;
    setLoading(true);
    try {
      setBackups(await drive.listBackups());
    } catch {
      setBackups([]);
    } finally {
      setLoading(false);
    }
  }, [drive, signedIn]);

  useEffect(() => {
    if (open && backups === null) refresh();
  }, [open, backups, refresh]);

  async function handleBackupNow() {
    const result = await drive.backupNow();
    if (result.ok) {
      onNotice?.('Backup saved to Drive.');
      setBackups(null); // force a fresh list next time it opens
      if (open) refresh();
    } else {
      onNotice?.(result.error || 'Backup failed.');
    }
  }

  async function handleRestore(backup) {
    const when = backup.createdAt ? formatBackupTime(backup.createdAt) : backup.name;
    if (
      !window.confirm(
        `Restore the backup from ${when}? This replaces all current clients, sessions, charges and payments with that snapshot.`,
      )
    ) {
      return;
    }
    setRestoringId(backup.id);
    const result = await drive.restoreBackup(backup.id);
    setRestoringId('');
    onNotice?.(result.ok ? `Restored backup from ${when}.` : result.error || 'Restore failed.');
  }

  return (
    <div className="mt-4 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
      <p className="text-sm font-semibold">Dated Drive backups</p>
      <p className="mt-1 text-sm text-[var(--subtle)]">
        {signedIn
          ? drive.lastBackupAt
            ? `Last backup ${formatBackupTime(drive.lastBackupAt)}. `
            : 'No backup yet. '
          : 'Sign in to Google Drive to enable backups. '}
        A snapshot is saved automatically once a day; the newest 30 are kept.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        <button className="icon-button" type="button" onClick={handleBackupNow} disabled={!signedIn || drive.backingUp}>
          <Cloud size={17} />
          {drive.backingUp ? 'Backing up…' : 'Back up now'}
        </button>
        <button
          className="icon-button"
          type="button"
          onClick={() => setOpen((value) => !value)}
          disabled={!signedIn}
          aria-expanded={open}
        >
          <History size={17} />
          {open ? 'Hide backups' : 'Restore from backup'}
        </button>
      </div>
      {open && (
        <div className="mt-3">
          {loading && <p className="text-sm text-[var(--subtle)]">Loading backups…</p>}
          {!loading && backups && backups.length === 0 && (
            <p className="text-sm text-[var(--subtle)]">No backups found yet.</p>
          )}
          {!loading && backups && backups.length > 0 && (
            <ul className="scrollbar-soft max-h-64 space-y-1 overflow-auto rounded-md border border-[var(--line)] bg-[var(--panel)] p-2">
              {backups.map((backup) => (
                <li key={backup.id} className="flex items-center justify-between gap-3 rounded px-2 py-2 text-sm">
                  <span className="flex items-center gap-2 text-[var(--text)]">
                    <Clock3 size={14} className="text-[var(--subtle)]" />
                    {backup.createdAt ? formatBackupTime(backup.createdAt) : backup.name}
                  </span>
                  <button
                    type="button"
                    className="inline-flex shrink-0 items-center gap-1 text-sm font-semibold text-[var(--primary)] hover:underline disabled:opacity-50"
                    onClick={() => handleRestore(backup)}
                    disabled={Boolean(restoringId)}
                  >
                    <RotateCcw size={14} />
                    {restoringId === backup.id ? 'Restoring…' : 'Restore'}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function Panel({ children }) {
  return <section className="surface rounded-md border p-4 shadow-soft sm:p-5">{children}</section>;
}

function StatCard({ title, value, icon: Icon }) {
  return (
    <Panel>
      <div className="flex items-center justify-between gap-4">
        <div>
          <p className="text-sm text-[var(--subtle)]">{title}</p>
          <p className="mt-2 text-2xl font-semibold">{value}</p>
        </div>
        <div className="grid h-11 w-11 place-items-center rounded-md bg-[var(--accent-soft)] text-[var(--primary)]">
          <Icon size={21} />
        </div>
      </div>
    </Panel>
  );
}

function MiniMetric({ label, value }) {
  return (
    <div className="rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
      <p className="text-sm text-[var(--subtle)]">{label}</p>
      <p className="mt-1 break-words text-xl font-semibold">{value}</p>
    </div>
  );
}

function InfoBlock({ title, text, wide }) {
  return (
    <div className={`rounded-md border border-[var(--line)] bg-[var(--bg)] p-4 ${wide ? 'sm:col-span-2' : ''}`}>
      <p className="text-sm font-semibold">{title}</p>
      <p className="mt-1 text-sm text-[var(--subtle)]">{text}</p>
    </div>
  );
}

function Segmented({ options, value, onChange, className = '' }) {
  return (
    <div className={`inline-flex rounded-md border border-[var(--line)] bg-[var(--bg)] p-1 ${className}`}>
      {options.map((option) => (
        <button
          key={option}
          type="button"
          onClick={() => onChange(option)}
          className={`rounded px-3 py-2 text-sm font-medium transition ${value === option ? 'bg-[var(--primary)] text-white' : 'text-[var(--subtle)] hover:text-[var(--text)]'}`}
        >
          {option}
        </button>
      ))}
    </div>
  );
}

function StatusBadge({ status }) {
  return <span className="rounded-md bg-[var(--panel-muted)] px-2 py-1 text-xs font-semibold text-[var(--subtle)]">{status}</span>;
}

function ChargeStatusBadge({ status }) {
  const tone = CHARGE_STATUS_TONE[status] || CHARGE_STATUS_TONE.Pending;
  return <span className={`inline-block rounded-md border px-2 py-1 text-xs font-semibold ${tone}`}>{status}</span>;
}

function ConflictBadge() {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-red-300 bg-red-50 px-2 py-1 text-xs font-semibold text-red-700">
      <AlertTriangle size={13} />
      Clash
    </span>
  );
}

function SmallAction({ icon: Icon, label, onClick, active = false }) {
  return (
    <button
      type="button"
      className={`icon-button px-3 py-2 text-xs${active ? ' is-active' : ''}`}
      onClick={onClick}
      title={label}
      aria-pressed={active}
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

function Toast({ toast, onDismiss }) {
  if (!toast) return null;
  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center px-4 pb-5 sm:inset-x-auto sm:right-6 sm:justify-end">
      <div
        key={toast.id}
        role="status"
        aria-live="polite"
        className="toast-enter pointer-events-auto flex w-full max-w-sm items-center gap-3 rounded-lg border border-[var(--line)] bg-[var(--panel)] px-4 py-3 shadow-soft"
      >
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--primary)] text-white">
          <Check size={16} />
        </span>
        <p className="min-w-0 flex-1 text-sm font-medium text-[var(--text)]">{toast.message}</p>
        {toast.action && (
          <button
            type="button"
            className="shrink-0 text-sm font-semibold text-[var(--primary)] hover:underline"
            onClick={() => {
              toast.action.onClick();
              onDismiss();
            }}
          >
            {toast.action.label}
          </button>
        )}
        <button
          type="button"
          className="shrink-0 rounded-md p-1 text-[var(--subtle)] hover:bg-[var(--panel-muted)]"
          onClick={onDismiss}
          aria-label="Dismiss"
        >
          <X size={15} />
        </button>
      </div>
    </div>
  );
}

function Input({ label, value, onChange, type = 'text' }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--subtle)]">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
      />
    </label>
  );
}

function Select({ label, value, options, labels = {}, onChange }) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-[var(--subtle)]">{label}</span>
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="mt-1 w-full rounded-md border border-[var(--line)] bg-[var(--panel)] px-3 py-2 text-sm text-[var(--text)]"
      >
        {options.map((option) => <option key={option} value={option}>{labels[option] || option}</option>)}
      </select>
    </label>
  );
}

function Toggle({ label, checked, onChange }) {
  return (
    <label className="flex items-center justify-between gap-4 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
      <span className="font-medium">{label}</span>
      <input className="h-5 w-5 accent-[var(--primary)]" type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </label>
  );
}

function SimpleTable({ headers, rows }) {
  return (
    <div className="overflow-hidden rounded-md border border-[var(--line)]">
      <table className="w-full text-left text-sm">
        <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--subtle)]">
          <tr>{headers.map((header) => <th key={header} className="px-3 py-3">{header}</th>)}</tr>
        </thead>
        <tbody className="divide-y divide-[var(--line)]">
          {rows.map((row, index) => <tr key={index}>{row.map((cell, cellIndex) => <td key={cellIndex} className="px-3 py-3">{cell}</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  );
}

function attendanceFor(sessions) {
  if (!sessions.length) return 0;
  return Math.round((sessions.filter((session) => session.status === 'Present').length / sessions.length) * 100);
}

function emptyClient() {
  return {
    name: '',
    email: '',
    phone: '',
    type: 'Individual',
    billingModel: 'Per Session',
    sessionRate: 2500,
    monthlyFee: 0,
    collectionMethod: 'Pay After Session',
    scheduleType: 'Manual',
    day: '',
    time: '',
    day2: '',
    time2: '',
    duration: 60,
    reminder: 'WhatsApp',
    tags: '',
    joiningDate: '',
    notes: '',
    status: 'Active',
    cancellationRule: 'Use Practice Default',
  };
}

function downloadFile(filename, content, type) {
  const blob = new Blob([content], { type });
  const href = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = href;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(href);
}

export default App;
