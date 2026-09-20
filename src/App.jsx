import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Archive,
  BarChart3,
  CalendarDays,
  Check,
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
  Plus,
  ReceiptText,
  RefreshCcw,
  Settings,
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

const todayIso = (() => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
})();

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
  theme: 'Quiet Cream',
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
  ['Clients', Users],
  ['Groups', FolderOpen],
  ['Payments', CreditCard],
  ['Statements', FileText],
  ['Reports', BarChart3],
  ['Settings', Settings],
];

const themeClass = {
  'Quiet Cream': 'theme-quiet-cream',
  Terracotta: 'theme-terracotta',
  Sage: 'theme-sage',
  Slate: 'theme-slate',
};

const STORAGE_PREFIX = 'quietadmin:';
const STORAGE_KEYS = ['settings', 'clients', 'groups', 'sessions', 'charges', 'payments'];

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

const CSV_HEADER_TO_FIELD = {
  name: 'name', email: 'email', phone: 'phone', type: 'type', 'billing model': 'billingModel',
  'session rate': 'sessionRate', 'monthly fee': 'monthlyFee', 'collection method': 'collectionMethod',
  'schedule type': 'scheduleType', 'session day': 'day', 'session time': 'time',
  'session day 2': 'day2', 'session time 2': 'time2', duration: 'duration',
  'reminder preference': 'reminder', tags: 'tags', 'joining date': 'joiningDate',
  status: 'status', notes: 'notes',
};

function csvEscape(value) {
  const text = value == null ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows) {
  return rows.map((row) => row.map(csvEscape).join(',')).join('\n');
}

// RFC-4180-style parser: handles quoted fields, embedded commas/quotes/newlines.
function parseCsv(text) {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
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
    } else if (ch === ',') {
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

function matchEnum(value, options) {
  const target = (value || '').trim().toLowerCase();
  return options.find((option) => option.toLowerCase() === target) || null;
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

// Parse + validate a client CSV into { imported, skipped, error }.
function importClientsCsv(text, existingClients) {
  const rows = parseCsv(text).filter((row) => row.some((cell) => (cell || '').trim() !== ''));
  if (rows.length === 0) return { accepted: [], skipped: [], error: 'The file is empty.' };

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const fieldByCol = header.map((h) => CSV_HEADER_TO_FIELD[h] || null);
  const presentFields = new Set(fieldByCol.filter(Boolean));
  const requiredColumns = [['name', 'Name'], ['phone', 'Phone'], ['type', 'Type'], ['billingModel', 'Billing Model']];
  const missing = requiredColumns.filter(([field]) => !presentFields.has(field)).map(([, label]) => label);
  if (missing.length) return { accepted: [], skipped: [], error: `Missing required column(s): ${missing.join(', ')}.` };

  const dateRe = /^\d{4}-\d{2}-\d{2}$/;
  const timeRe = /^\d{1,2}:\d{2}$/;
  const normName = (s) => (s || '').trim().toLowerCase();
  const normPhone = (s) => (s || '').replace(/\D/g, '');
  const seen = new Set(existingClients.map((c) => `${normName(c.name)}|${normPhone(c.phone)}`));

  const accepted = [];
  const skipped = [];

  for (let r = 1; r < rows.length; r += 1) {
    const raw = rows[r];
    const get = (field) => {
      const idx = fieldByCol.indexOf(field);
      return idx >= 0 ? (raw[idx] ?? '').trim() : '';
    };
    const name = get('name');
    if (name.toLowerCase().startsWith('example')) continue; // skip the template row

    const rowNum = r + 1;
    const reject = (reason) => skipped.push({ row: rowNum, name: name || '(blank)', reason });

    if (!name) { reject('missing Name'); continue; }
    const phone = get('phone');
    if (!phone) { reject('missing Phone'); continue; }
    const type = matchEnum(get('type'), CLIENT_CSV_ENUMS.type);
    if (!type) { reject(`invalid Type "${get('type')}"`); continue; }
    const billingModel = matchEnum(get('billingModel'), CLIENT_CSV_ENUMS.billingModel);
    if (!billingModel) { reject(`invalid Billing Model "${get('billingModel')}"`); continue; }

    const rateStr = get('sessionRate');
    const feeStr = get('monthlyFee');
    const rate = rateStr === '' ? null : Number(rateStr);
    const fee = feeStr === '' ? null : Number(feeStr);
    if (rate !== null && Number.isNaN(rate)) { reject(`Session Rate "${rateStr}" is not a number`); continue; }
    if (fee !== null && Number.isNaN(fee)) { reject(`Monthly Fee "${feeStr}" is not a number`); continue; }
    if (billingModel === 'Per Session' && rate === null) { reject('Session Rate is required for Per Session'); continue; }
    if (billingModel === 'Subscription' && fee === null) { reject('Monthly Fee is required for Subscription'); continue; }
    if (billingModel === 'Custom' && rate === null && fee === null) { reject('Custom needs a Session Rate or Monthly Fee'); continue; }

    let collectionMethod = 'Pay After Session';
    if (get('collectionMethod')) {
      const m = matchEnum(get('collectionMethod'), CLIENT_CSV_ENUMS.collectionMethod);
      if (!m) { reject(`invalid Collection Method "${get('collectionMethod')}"`); continue; }
      collectionMethod = m;
    }
    let scheduleType = 'Manual';
    if (get('scheduleType')) {
      const m = matchEnum(get('scheduleType'), CLIENT_CSV_ENUMS.scheduleType);
      if (!m) { reject(`invalid Schedule Type "${get('scheduleType')}"`); continue; }
      scheduleType = m;
    }
    let day = '';
    if (get('day')) {
      const m = matchEnum(get('day'), CLIENT_CSV_ENUMS.day);
      if (!m) { reject(`invalid Session Day "${get('day')}"`); continue; }
      day = m;
    }
    let day2 = '';
    if (get('day2')) {
      const m = matchEnum(get('day2'), CLIENT_CSV_ENUMS.day);
      if (!m) { reject(`invalid Session Day 2 "${get('day2')}"`); continue; }
      day2 = m;
    }
    const time = get('time');
    if (time && !timeRe.test(time)) { reject(`invalid Session Time "${time}" (use HH:MM)`); continue; }
    const time2 = get('time2');
    if (time2 && !timeRe.test(time2)) { reject(`invalid Session Time 2 "${time2}" (use HH:MM)`); continue; }

    let duration = 60;
    if (get('duration')) {
      const d = Number(get('duration'));
      if (Number.isNaN(d) || d <= 0) { reject(`invalid Duration "${get('duration')}"`); continue; }
      duration = d;
    }
    let reminder = 'None';
    if (get('reminder')) {
      const m = matchEnum(get('reminder'), CLIENT_CSV_ENUMS.reminder);
      if (!m) { reject(`invalid Reminder Preference "${get('reminder')}"`); continue; }
      reminder = m;
    }
    let status = 'Active';
    if (get('status')) {
      const m = matchEnum(get('status'), CLIENT_CSV_ENUMS.status);
      if (!m) { reject(`invalid Status "${get('status')}"`); continue; }
      status = m;
    }
    const joiningDate = get('joiningDate');
    if (joiningDate && !dateRe.test(joiningDate)) { reject(`invalid Joining Date "${joiningDate}" (use YYYY-MM-DD)`); continue; }

    const key = `${normName(name)}|${normPhone(phone)}`;
    if (seen.has(key)) { skipped.push({ row: rowNum, name, reason: 'duplicate (Name + Phone)' }); continue; }
    seen.add(key);

    accepted.push({
      id: `c${Date.now()}${accepted.length}`,
      name,
      email: get('email'),
      phone,
      type,
      billingModel,
      sessionRate: rate ?? 0,
      monthlyFee: fee ?? 0,
      collectionMethod,
      scheduleType,
      day,
      time,
      day2,
      time2,
      duration,
      reminder,
      tags: get('tags') ? get('tags').split(';').map((t) => t.trim()).filter(Boolean) : [],
      joiningDate,
      notes: get('notes'),
      status,
      cancellationRule: 'Use Practice Default',
    });
  }

  return { accepted, skipped, error: null };
}

function isInPeriod(date, view) {
  const target = toDate(date);
  const start = toDate(todayIso);
  if (view === 'Today') return date === todayIso;
  if (view === 'Week') {
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return target >= start && target <= end;
  }
  return target.getFullYear() === start.getFullYear() && target.getMonth() === start.getMonth();
}

function App() {
  const [activeNav, setActiveNav] = useState('Dashboard');
  const [view, setView] = useState('Today');
  const [settings, setSettings] = usePersistentState('settings', initialSettings);
  const [clients, setClients] = usePersistentState('clients', []);
  const [groups, setGroups] = usePersistentState('groups', []);
  const [sessions, setSessions] = usePersistentState('sessions', []);
  const [charges, setCharges] = usePersistentState('charges', []);
  const [payments, setPayments] = usePersistentState('payments', []);
  const [selectedClientId, setSelectedClientId] = useState('c1');
  const [clientTab, setClientTab] = useState('Overview');
  const [paymentDraft, setPaymentDraft] = useState({ clientId: 'c1', amount: 2500, method: 'UPI', reference: '', notes: '' });
  const [clientDraft, setClientDraft] = useState(emptyClient());
  const [notice, setNotice] = useState('');
  const [importResult, setImportResult] = useState(null);

  const driveData = useMemo(
    () => ({ settings, clients, groups, sessions, charges, payments }),
    [settings, clients, groups, sessions, charges, payments],
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
    if (Array.isArray(remote.charges)) setCharges(remote.charges);
    if (Array.isArray(remote.payments)) setPayments(remote.payments);
  }, [setSettings, setClients, setGroups, setSessions, setCharges, setPayments]);

  const drive = useGoogleDrive({ clientId: GOOGLE_CLIENT_ID, data: driveData, applyRemote });

  // Returning, already-set-up user: refresh the session in the background so the
  // app opens instantly from cache and syncs when silent auth succeeds.
  useEffect(() => {
    if (settings.profileComplete && drive.configured) drive.trySilent();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const clientById = useMemo(() => Object.fromEntries(clients.map((client) => [client.id, client])), [clients]);

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

  const visibleSessions = useMemo(
    () => sessions.filter((session) => isInPeriod(session.date, view)).sort((a, b) => `${a.date}${a.time}`.localeCompare(`${b.date}${b.time}`)),
    [sessions, view],
  );

  const monthSessions = sessions.filter((session) => isInPeriod(session.date, 'Month'));
  const totalOutstanding = ledgers.reduce((sum, ledger) => sum + ledger.outstanding, 0);
  const totalCredit = ledgers.reduce((sum, ledger) => sum + ledger.credit, 0);
  const collectedThisMonth = payments.filter((payment) => isInPeriod(payment.date, 'Month')).reduce((sum, payment) => sum + payment.amount, 0);
  const billedThisMonth = charges.filter((charge) => isInPeriod(charge.date, 'Month')).reduce((sum, charge) => sum + charge.amount, 0);
  const attendedThisMonth = monthSessions.filter((session) => session.status === 'Present').length;
  const lateCancelsThisMonth = monthSessions.filter((session) => session.status === 'Late Cancel').length;
  const attendanceRate = monthSessions.length ? Math.round((attendedThisMonth / monthSessions.length) * 100) : 0;
  const selectedClient = clientById[selectedClientId] || clients[0];

  function showNotice(message) {
    setNotice(message);
    window.setTimeout(() => setNotice(''), 2600);
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
    showNotice(`${client.name} marked ${nextStatus.toLowerCase()}.`);
  }

  function undoSession(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    setSessions((current) => current.map((item) => (item.id === sessionId ? { ...item, status: 'Scheduled', chargeId: null } : item)));
    if (session.chargeId) setCharges((current) => current.filter((charge) => charge.id !== session.chargeId));
    showNotice('Session returned to scheduled.');
  }

  function reschedule(sessionId) {
    const session = sessions.find((item) => item.id === sessionId);
    const nextDate = new Date(`${session.date}T${session.time}`);
    nextDate.setDate(nextDate.getDate() + 7);
    const replacement = {
      ...session,
      id: `s${Date.now()}`,
      date: nextDate.toISOString().slice(0, 10),
      status: 'Scheduled',
      chargeId: null,
    };
    setSessions((current) =>
      current.map((item) => (item.id === sessionId ? { ...item, status: 'Rescheduled' } : item)).concat(replacement),
    );
    showNotice('Replacement session created one week ahead.');
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
        date: todayIso,
        amount,
        method: paymentDraft.method,
        reference: paymentDraft.reference || 'Manual',
        notes: paymentDraft.notes,
      },
    ]);
    showNotice(`Payment recorded for ${client.name}.`);
    setPaymentDraft({ ...paymentDraft, amount: 2500, reference: '', notes: '' });
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
    setCharges(SAMPLE_CHARGES);
    setPayments(SAMPLE_PAYMENTS);
    setSelectedClientId(SAMPLE_CLIENTS[0].id);
    showNotice('Sample data loaded.');
  }

  function exportJson() {
    const payload = { clients, groups, sessions, charges, payments, settings };
    downloadFile('quietadmin-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportClientsCsv() {
    const rows = [CLIENT_CSV_COLUMNS, CLIENT_CSV_EXAMPLE, ...clients.map(clientToCsvRow)];
    downloadFile('quietadmin-clients.csv', toCsv(rows), 'text/csv');
  }

  function importCsv(text) {
    const { accepted, skipped, error } = importClientsCsv(text, clients);
    if (!error && accepted.length) {
      setClients((current) => [...current, ...accepted]);
      setSelectedClientId(accepted[0].id);
      showNotice(`Imported ${accepted.length} client${accepted.length === 1 ? '' : 's'}.`);
    }
    setImportResult({ imported: accepted.length, skipped, error });
  }

  setActiveCurrency(settings.currency);

  const gate = settings.profileComplete ? 'app' : drive.signedIn ? 'setup' : 'signin';

  if (gate !== 'app') {
    return (
      <main className={`${themeClass[settings.theme]} min-h-screen bg-[var(--bg)] text-[var(--text)]`}>
        {gate === 'signin' ? (
          <SignInScreen drive={drive} />
        ) : (
          <SetupScreen drive={drive} onComplete={completeSetup} />
        )}
      </main>
    );
  }

  return (
    <main className={`${themeClass[settings.theme]} min-h-screen bg-[var(--bg)] text-[var(--text)]`}>
      {importResult && <ImportSummary result={importResult} onClose={() => setImportResult(null)} />}
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
            {['clients.json', 'groups.json', 'sessions.json', 'charges.json', 'payments.json', 'settings.json'].map((file) => (
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
            <TopBar settings={settings} drive={drive} signOut={signOut} />
            {notice && <div className="mb-4 rounded-md bg-[var(--primary)] px-4 py-3 text-sm font-medium text-white shadow-soft">{notice}</div>}

            {activeNav === 'Dashboard' && (
              <Dashboard
                settings={settings}
                view={view}
                setView={setView}
                sessions={visibleSessions}
                clients={clientById}
                ledgerByClient={ledgerByClient}
                stats={{
                  today: sessions.filter((session) => session.date === todayIso).length,
                  outstanding: totalOutstanding,
                  collected: collectedThisMonth,
                  lateCancels: lateCancelsThisMonth,
                }}
                statusSession={statusSession}
                undoSession={undoSession}
                reschedule={reschedule}
                setPaymentDraft={setPaymentDraft}
                setActiveNav={setActiveNav}
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
                clientTab={clientTab}
                setClientTab={setClientTab}
                clientDraft={clientDraft}
                setClientDraft={setClientDraft}
                addClient={addClient}
                exportClientsCsv={exportClientsCsv}
                exportJson={exportJson}
                importCsv={importCsv}
              />
            )}

            {activeNav === 'Groups' && <Groups groups={groups} clients={clientById} />}

            {activeNav === 'Payments' && (
              <Payments
                clients={clients}
                ledgers={ledgerByClient}
                payments={payments}
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

            {activeNav === 'Settings' && <SettingsScreen settings={settings} setSettings={setSettings} loadSampleData={loadSampleData} exportJson={exportJson} drive={drive} />}
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

function ImportSummary({ result, onClose }) {
  const { imported, skipped, error } = result;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-lg border border-[var(--line)] bg-[var(--panel)] p-5 shadow-soft">
        <h2 className="text-xl font-semibold">{error ? 'Import failed' : 'Import complete'}</h2>
        {error ? (
          <p className="mt-2 text-sm text-[var(--accent)]">{error}</p>
        ) : (
          <>
            <p className="mt-2 text-sm">
              Imported <span className="font-semibold">{imported}</span> client{imported === 1 ? '' : 's'}
              {skipped.length > 0 ? `, skipped ${skipped.length}.` : '.'}
            </p>
            {skipped.length > 0 && (
              <div className="mt-3 overflow-hidden rounded-md border border-[var(--line)]">
                <table className="w-full text-left text-sm">
                  <thead className="bg-[var(--panel-muted)] text-xs uppercase text-[var(--subtle)]">
                    <tr>
                      <th className="px-3 py-2">Row</th>
                      <th className="px-3 py-2">Name</th>
                      <th className="px-3 py-2">Reason</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--line)]">
                    {skipped.map((item, index) => (
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
          </>
        )}
        <button
          type="button"
          className="mt-4 icon-button justify-center bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]"
          onClick={onClose}
        >
          Done
        </button>
      </div>
    </div>
  );
}

function Brand() {
  return (
    <div>
      <div className="flex items-center gap-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-[var(--primary)] text-white">
          <ReceiptText size={21} />
        </div>
        <div>
          <h1 className="text-xl font-semibold tracking-normal">QuietAdmin</h1>
          <p className="text-sm text-[var(--subtle)]">The admin assistant for therapists.</p>
        </div>
      </div>
    </div>
  );
}

function TopBar({ settings, drive, signOut }) {
  const currentDate = toDate(todayIso).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
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

function Dashboard({ settings, view, setView, sessions, clients, ledgerByClient, stats, statusSession, undoSession, reschedule, setPaymentDraft, setActiveNav }) {
  const outstandingClients = Object.values(clients).filter((client) => ledgerByClient[client.id]?.outstanding > 0);
  return (
    <div className="space-y-5">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard title="Today's Sessions" value={stats.today} icon={CalendarDays} />
        <StatCard title="Outstanding Amount" value={formatMoney(stats.outstanding)} icon={WalletCards} />
        <StatCard title="Collected This Month" value={formatMoney(stats.collected)} icon={CreditCard} />
        <StatCard title="Late Cancellations This Month" value={stats.lateCancels} icon={Clock3} />
      </div>

      <section className="grid gap-5 xl:grid-cols-[1.35fr_0.9fr]">
        <Panel>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="section-title">Sessions</h3>
              <p className="section-subtitle">Auto charge is {settings.autoCreateCharges ? 'on' : 'off'}.</p>
            </div>
            <Segmented options={['Today', 'Week', 'Month']} value={view} onChange={setView} />
          </div>
          <div className="mt-4 space-y-3">
            {sessions.map((session) => {
              const client = clients[session.clientId];
              const ledger = ledgerByClient[session.clientId];
              return (
                <article key={session.id} className="rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold">{session.time}</span>
                        <span className="text-sm text-[var(--subtle)]">{formatDate(session.date, { weekday: 'short', day: '2-digit', month: 'short' })}</span>
                        <StatusBadge status={session.status} />
                      </div>
                      <h4 className="mt-1 text-lg font-semibold">{client.name}</h4>
                      <p className="text-sm text-[var(--subtle)]">Outstanding {formatMoney(ledger?.outstanding || 0)}</p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <SmallAction icon={Check} label="Present" onClick={() => statusSession(session.id, 'Present')} />
                      <SmallAction icon={Clock3} label="Late Cancel" onClick={() => statusSession(session.id, 'Late Cancel')} />
                      <SmallAction icon={X} label="Cancel" onClick={() => statusSession(session.id, 'Cancelled')} />
                      <SmallAction icon={CalendarDays} label="Reschedule" onClick={() => reschedule(session.id)} />
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
    </div>
  );
}

function Clients({ clients, selectedClient, setSelectedClientId, ledgers, sessions, charges, payments, clientTab, setClientTab, clientDraft, setClientDraft, addClient, exportClientsCsv, exportJson, importCsv }) {
  const fileInputRef = useRef(null);

  function handleFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => importCsv(String(reader.result || ''));
    reader.readAsText(file);
    event.target.value = ''; // allow re-importing the same file
  }

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
    <div className="grid gap-5 xl:grid-cols-[0.9fr_1.4fr]">
      <Panel>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="section-title">Clients</h3>
            <p className="section-subtitle">Active, archived, billing and cancellation rules.</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInputRef} type="file" accept=".csv,text/csv" className="hidden" onChange={handleFile} />
            <button className="icon-button" type="button" onClick={() => fileInputRef.current?.click()}>
              <Import size={17} />
              Import CSV
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
          <div className="flex flex-wrap gap-2">
            {(selectedClient?.tags || []).map((tag) => <span key={tag} className="rounded-md bg-[var(--panel-muted)] px-2 py-1 text-xs font-medium">{tag}</span>)}
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
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Total Charges" value={formatMoney(ledger.totalCharges)} />
              <MiniMetric label="Total Payments" value={formatMoney(ledger.totalPayments)} />
              <MiniMetric label="Outstanding" value={formatMoney(ledger.outstanding)} />
              <MiniMetric label="Credit Balance" value={formatMoney(ledger.credit)} />
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
  );
}

function Groups({ groups, clients }) {
  return (
    <div className="grid gap-5 lg:grid-cols-2">
      {groups.map((group) => (
        <Panel key={group.id}>
          <div className="flex items-start justify-between gap-4">
            <div>
              <h3 className="text-xl font-semibold">{group.name}</h3>
              <p className="text-sm text-[var(--subtle)]">{group.type} - {group.status}</p>
            </div>
            <StatusBadge status={`${group.members.length}/${group.capacity}`} />
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <MiniMetric label="Billing Model" value={group.billingModel} />
            <MiniMetric label="Session Fee" value={formatMoney(group.sessionFee)} />
            <InfoBlock title="Schedule" text={group.schedule} wide />
            <InfoBlock title="Notes" text={group.notes} wide />
          </div>
          <h4 className="mt-5 font-semibold">Members</h4>
          <div className="mt-2 flex flex-wrap gap-2">
            {group.members.map((id) => <span key={id} className="rounded-md bg-[var(--panel-muted)] px-3 py-2 text-sm">{clients[id]?.name}</span>)}
          </div>
        </Panel>
      ))}
    </div>
  );
}

function Payments({ clients, ledgers, payments, paymentDraft, setPaymentDraft, recordPayment }) {
  return (
    <div className="grid gap-5 xl:grid-cols-[0.8fr_1.2fr]">
      <Panel>
        <h3 className="section-title">Record Payment</h3>
        <p className="section-subtitle">Supports UPI, bank transfer, cash, card and other methods.</p>
        <form className="mt-4 grid gap-3" onSubmit={recordPayment}>
          <Select label="Client" value={paymentDraft.clientId} options={clients.map((client) => client.id)} labels={Object.fromEntries(clients.map((client) => [client.id, client.name]))} onChange={(value) => setPaymentDraft({ ...paymentDraft, clientId: value })} />
          <Input label="Amount" type="number" value={paymentDraft.amount} onChange={(value) => setPaymentDraft({ ...paymentDraft, amount: value })} />
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
            return (
              <div key={payment.id} className="flex flex-col gap-2 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4 sm:flex-row sm:items-center sm:justify-between">
                <div>
                  <p className="font-semibold">{client.name}</p>
                  <p className="text-sm text-[var(--subtle)]">{formatDate(payment.date)} - {payment.method} - {payment.reference}</p>
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

function Statements({ clients, sessions, charges, payments, settings, showNotice }) {
  const months = useMemo(() => recentMonths(6, todayIso), []);
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

  function copyStatement(statement) {
    const text = formatStatementText(statement, settings);
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(text).then(
        () => showNotice(`${statement.clientName}'s statement copied.`),
        () => showNotice('Could not copy — check browser permissions.'),
      );
    } else {
      showNotice('Clipboard not available in this browser.');
    }
  }

  return (
    <div className="space-y-5">
      <Panel>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="section-title">Monthly Statements</h3>
            <p className="section-subtitle">
              Auto-calculated per client. Copy to share on WhatsApp or email — automated sending comes later.
            </p>
          </div>
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

      {visible.length === 0 ? (
        <Panel>
          <p className="text-sm text-[var(--subtle)]">No client activity for {monthLabel(period)}.</p>
        </Panel>
      ) : (
        <div className="grid gap-4 xl:grid-cols-2">
          {visible.map((statement) => (
            <StatementCard key={statement.clientId} statement={statement} onCopy={() => copyStatement(statement)} />
          ))}
        </div>
      )}
    </div>
  );
}

function StatementCard({ statement, onCopy }) {
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

  return (
    <Panel>
      <div className="flex items-start justify-between gap-3">
        <div>
          <h4 className="text-lg font-semibold">{statement.clientName}</h4>
          <p className="text-sm text-[var(--subtle)]">Reminder preference: {statement.reminder || 'None'}</p>
        </div>
        <button className="icon-button px-3 py-2 text-xs" type="button" onClick={onCopy}>
          <Copy size={15} />
          Copy
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

function SettingsScreen({ settings, setSettings, loadSampleData, exportJson, drive }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel>
        <h3 className="section-title">Practice</h3>
        <div className="mt-4 grid gap-3">
          <Input label="Therapist Name" value={settings.therapistName} onChange={(value) => setSettings({ ...settings, therapistName: value })} />
          <Input label="Practice Name" value={settings.practiceName} onChange={(value) => setSettings({ ...settings, practiceName: value })} />
          <Input label="Payment Details (UPI / bank)" value={settings.paymentDetails || ''} onChange={(value) => setSettings({ ...settings, paymentDetails: value })} />
          <Select label="Currency" value={settings.currency || 'INR'} options={CURRENCY_OPTIONS} onChange={(value) => setSettings({ ...settings, currency: value })} />
          <Select label="Theme" value={settings.theme} options={['Quiet Cream', 'Terracotta', 'Sage', 'Slate']} onChange={(value) => setSettings({ ...settings, theme: value })} />
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

function SmallAction({ icon: Icon, label, onClick }) {
  return (
    <button type="button" className="icon-button px-3 py-2 text-xs" onClick={onClick} title={label}>
      <Icon size={15} />
      {label}
    </button>
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
