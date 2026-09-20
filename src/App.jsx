import { useCallback, useEffect, useMemo, useState } from 'react';
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
} from 'lucide-react';
import { useGoogleDrive } from './googleDrive.js';

const GOOGLE_CLIENT_ID = import.meta.env.VITE_GOOGLE_CLIENT_ID || '';

const currency = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const todayIso = '2026-06-10';

const initialSettings = {
  therapistName: 'Arushi',
  practiceName: 'Quiet Room Therapy',
  autoCreateCharges: true,
  lateCancellationHours: 24,
  lateCancellationCharge: 100,
  monthlyStatements: true,
  outstandingReminders: true,
  theme: 'Quiet Cream',
};

const initialClients = [
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

const initialGroups = [
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

const initialSessions = [
  { id: 's1', clientId: 'c1', date: '2026-06-10', time: '10:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's2', clientId: 'c2', date: '2026-06-10', time: '12:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's3', clientId: 'c3', date: '2026-06-10', time: '15:30', duration: 50, status: 'Late Cancel', chargeId: 'ch3' },
  { id: 's4', clientId: 'c1', date: '2026-06-03', time: '10:00', duration: 60, status: 'Present', chargeId: 'ch1' },
  { id: 's5', clientId: 'c2', date: '2026-06-04', time: '12:00', duration: 60, status: 'Present', chargeId: null },
  { id: 's6', clientId: 'c1', date: '2026-06-17', time: '10:00', duration: 60, status: 'Scheduled', chargeId: null },
  { id: 's7', clientId: 'c3', date: '2026-06-20', time: '11:00', duration: 50, status: 'Scheduled', chargeId: null },
  { id: 's8', clientId: 'c2', date: '2026-06-24', time: '12:00', duration: 60, status: 'Scheduled', chargeId: null },
];

const initialCharges = [
  { id: 'ch1', clientId: 'c1', date: '2026-06-03', amount: 2500, reason: 'Session Fee', status: 'Paid' },
  { id: 'ch2', clientId: 'c2', date: '2026-06-01', amount: 12000, reason: 'Subscription Fee', status: 'Partially Paid' },
  { id: 'ch3', clientId: 'c3', date: '2026-06-10', amount: 1500, reason: 'Late Cancellation', status: 'Pending' },
  { id: 'ch4', clientId: 'c1', date: '2026-05-28', amount: 2500, reason: 'Session Fee', status: 'Pending' },
];

const initialPayments = [
  { id: 'p1', clientId: 'c1', date: '2026-06-05', amount: 2000, method: 'UPI', reference: 'UPI-2048', notes: 'Partial payment' },
  { id: 'p2', clientId: 'c2', date: '2026-06-02', amount: 8000, method: 'Bank Transfer', reference: 'NEFT-991', notes: 'June subscription part payment' },
  { id: 'p3', clientId: 'c3', date: '2026-05-31', amount: 6000, method: 'UPI', reference: 'UPI-1180', notes: 'Advance deposit' },
];

const navItems = [
  ['Dashboard', LayoutDashboard],
  ['Clients', Users],
  ['Groups', FolderOpen],
  ['Payments', CreditCard],
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

function formatDate(value, options = { day: '2-digit', month: 'short' }) {
  return toDate(value).toLocaleDateString('en-IN', options);
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
  const [clients, setClients] = usePersistentState('clients', initialClients);
  const [groups, setGroups] = usePersistentState('groups', initialGroups);
  const [sessions, setSessions] = usePersistentState('sessions', initialSessions);
  const [charges, setCharges] = usePersistentState('charges', initialCharges);
  const [payments, setPayments] = usePersistentState('payments', initialPayments);
  const [selectedClientId, setSelectedClientId] = useState('c1');
  const [clientTab, setClientTab] = useState('Overview');
  const [paymentDraft, setPaymentDraft] = useState({ clientId: 'c1', amount: 2500, method: 'UPI', reference: '', notes: '' });
  const [clientDraft, setClientDraft] = useState(emptyClient());
  const [notice, setNotice] = useState('');

  const driveData = useMemo(
    () => ({ settings, clients, groups, sessions, charges, payments }),
    [settings, clients, groups, sessions, charges, payments],
  );

  const applyRemote = useCallback((remote) => {
    if (remote.settings && typeof remote.settings === 'object' && !Array.isArray(remote.settings)) {
      setSettings({ ...initialSettings, ...remote.settings });
    }
    if (Array.isArray(remote.clients)) setClients(remote.clients);
    if (Array.isArray(remote.groups)) setGroups(remote.groups);
    if (Array.isArray(remote.sessions)) setSessions(remote.sessions);
    if (Array.isArray(remote.charges)) setCharges(remote.charges);
    if (Array.isArray(remote.payments)) setPayments(remote.payments);
  }, [setSettings, setClients, setGroups, setSessions, setCharges, setPayments]);

  const drive = useGoogleDrive({ clientId: GOOGLE_CLIENT_ID, data: driveData, applyRemote });

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
    if (!paymentDraft.clientId || amount <= 0) return;
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
    showNotice(`Payment recorded for ${clientById[paymentDraft.clientId].name}.`);
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

  function resetData() {
    if (!window.confirm('Reset all data back to the demo seed? This clears everything saved in this browser.')) return;
    STORAGE_KEYS.forEach((key) => {
      try {
        window.localStorage.removeItem(`${STORAGE_PREFIX}${key}`);
      } catch {
        // Ignore removal failures.
      }
    });
    setSettings(initialSettings);
    setClients(initialClients);
    setSessions(initialSessions);
    setCharges(initialCharges);
    setPayments(initialPayments);
    showNotice('Data reset to demo seed.');
  }

  function exportJson() {
    const payload = { clients, groups, sessions, charges, payments, settings };
    downloadFile('quietadmin-backup.json', JSON.stringify(payload, null, 2), 'application/json');
  }

  function exportClientsCsv() {
    const rows = [
      ['Name', 'Email', 'Phone', 'Type', 'Billing Model', 'Session Rate', 'Status'],
      ...clients.map((client) => [client.name, client.email, client.phone, client.type, client.billingModel, client.sessionRate, client.status]),
    ];
    downloadFile('quietadmin-clients.csv', rows.map((row) => row.join(',')).join('\n'), 'text/csv');
  }

  return (
    <main className={`${themeClass[settings.theme]} min-h-screen bg-[var(--bg)] text-[var(--text)]`}>
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
            <TopBar settings={settings} exportJson={exportJson} drive={drive} />
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

            {activeNav === 'Settings' && <SettingsScreen settings={settings} setSettings={setSettings} resetData={resetData} />}
          </div>
        </section>
      </div>
    </main>
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

function TopBar({ settings, exportJson, drive }) {
  const currentDate = toDate(todayIso).toLocaleDateString('en-IN', { weekday: 'long', month: 'long', day: 'numeric' });
  return (
    <header className="mb-5 flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
      <div>
        <p className="text-sm text-[var(--subtle)]">{settings.practiceName}</p>
        <h2 className="text-2xl font-semibold sm:text-3xl">Good Morning, {settings.therapistName}</h2>
        <p className="mt-1 text-sm text-[var(--subtle)]">{currentDate}</p>
      </div>
      <div className="flex flex-col items-stretch gap-2 md:items-end">
        <div className="flex flex-wrap gap-2">
          <DriveButton drive={drive} />
          <button className="icon-button bg-[var(--primary)] text-white hover:bg-[var(--primary-dark)]" type="button" onClick={exportJson}>
            <Archive size={17} />
            Backup JSON
          </button>
        </div>
        {drive.error && <p className="max-w-xs text-right text-xs text-[var(--accent)]">{drive.error}</p>}
      </div>
    </header>
  );
}

function DriveButton({ drive }) {
  const { status, email, lastSyncedAt, connect, disconnect } = drive;

  if (status === 'connected' || status === 'syncing') {
    const syncedLabel =
      status === 'syncing'
        ? 'Syncing…'
        : lastSyncedAt
          ? `Synced ${new Date(lastSyncedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`
          : 'Synced';
    return (
      <div className="flex items-center gap-2">
        <span className="inline-flex items-center gap-2 rounded-md border border-[var(--line)] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--primary-dark)]" title={email}>
          <Cloud size={17} />
          <span className="max-w-[10rem] truncate">{email || 'Google Drive'}</span>
          <span className="text-[var(--subtle)]">· {syncedLabel}</span>
        </span>
        <button className="icon-button px-3 py-2" type="button" onClick={disconnect} title="Disconnect Google Drive">
          <LogOut size={16} />
        </button>
      </div>
    );
  }

  const connecting = status === 'connecting';
  return (
    <button className="icon-button" type="button" onClick={connect} disabled={connecting} title="Connect Google Drive">
      {status === 'error' ? <CloudOff size={17} /> : <Mail size={17} />}
      {connecting ? 'Connecting…' : 'Connect Google Drive'}
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
        <StatCard title="Outstanding Amount" value={currency.format(stats.outstanding)} icon={WalletCards} />
        <StatCard title="Collected This Month" value={currency.format(stats.collected)} icon={CreditCard} />
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
                      <p className="text-sm text-[var(--subtle)]">Outstanding {currency.format(ledger?.outstanding || 0)}</p>
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
                    <td className="px-3 py-3">{currency.format(ledgerByClient[client.id].outstanding)}</td>
                    <td className="px-3 py-3">{currency.format(ledgerByClient[client.id].credit)}</td>
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

function Clients({ clients, selectedClient, setSelectedClientId, ledgers, sessions, charges, payments, clientTab, setClientTab, clientDraft, setClientDraft, addClient, exportClientsCsv, exportJson }) {
  const selectedSessions = sessions.filter((session) => session.clientId === selectedClient.id);
  const selectedCharges = charges.filter((charge) => charge.clientId === selectedClient.id);
  const selectedPayments = payments.filter((payment) => payment.clientId === selectedClient.id);
  const ledger = ledgers[selectedClient.id];
  const timeline = [
    ...selectedSessions.map((session) => ({ date: session.date, text: `Session ${session.status}` })),
    ...selectedPayments.map((payment) => ({ date: payment.date, text: `Payment ${currency.format(payment.amount)}` })),
    ...selectedCharges.map((charge) => ({ date: charge.date, text: `${charge.reason} ${currency.format(charge.amount)}` })),
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
            <button className="icon-button" type="button">
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
            <h3 className="text-2xl font-semibold">{selectedClient.name}</h3>
            <p className="text-sm text-[var(--subtle)]">{selectedClient.email} - {selectedClient.phone}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            {selectedClient.tags.map((tag) => <span key={tag} className="rounded-md bg-[var(--panel-muted)] px-2 py-1 text-xs font-medium">{tag}</span>)}
          </div>
        </div>
        <Segmented className="mt-4" options={['Overview', 'Sessions', 'Financials', 'Timeline']} value={clientTab} onChange={setClientTab} />
        <div className="mt-5">
          {clientTab === 'Overview' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Outstanding Balance" value={currency.format(ledger.outstanding)} />
              <MiniMetric label="Credit Balance" value={currency.format(ledger.credit)} />
              <MiniMetric label="Attendance Rate" value={`${attendanceFor(selectedSessions)}%`} />
              <MiniMetric label="Reminder Preference" value={selectedClient.reminder} />
              <InfoBlock title="Scheduling" text={`${selectedClient.scheduleType}${selectedClient.day ? ` - ${selectedClient.day} ${selectedClient.time}` : ''}`} />
              <InfoBlock title="Cancellation Rule" text={selectedClient.cancellationRule} />
              <InfoBlock title="Notes" text={selectedClient.notes || 'No notes yet.'} wide />
            </div>
          )}
          {clientTab === 'Sessions' && <SimpleTable headers={['Date', 'Status', 'Charge']} rows={selectedSessions.map((session) => [formatDate(session.date), session.status, session.chargeId ? 'Generated' : '-'])} />}
          {clientTab === 'Financials' && (
            <div className="grid gap-3 sm:grid-cols-2">
              <MiniMetric label="Total Charges" value={currency.format(ledger.totalCharges)} />
              <MiniMetric label="Total Payments" value={currency.format(ledger.totalPayments)} />
              <MiniMetric label="Outstanding" value={currency.format(ledger.outstanding)} />
              <MiniMetric label="Credit Balance" value={currency.format(ledger.credit)} />
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
            <MiniMetric label="Session Fee" value={currency.format(group.sessionFee)} />
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
                  <p className="font-semibold">{currency.format(payment.amount)}</p>
                  <p className="text-sm text-[var(--subtle)]">Outstanding {currency.format(ledgers[payment.clientId]?.outstanding || 0)}</p>
                </div>
              </div>
            );
          })}
        </div>
      </Panel>
    </div>
  );
}

function Reports({ stats, exportJson }) {
  const rows = [
    ['Sessions Scheduled', stats.sessionsScheduled],
    ['Sessions Attended', stats.sessionsAttended],
    ['Attendance %', `${stats.attendanceRate}%`],
    ['Revenue Billed', currency.format(stats.revenueBilled)],
    ['Revenue Collected', currency.format(stats.revenueCollected)],
    ['Outstanding Amount', currency.format(stats.outstanding)],
    ['Credit Balances', currency.format(stats.credit)],
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

function SettingsScreen({ settings, setSettings, resetData }) {
  return (
    <div className="grid gap-5 xl:grid-cols-2">
      <Panel>
        <h3 className="section-title">Practice</h3>
        <div className="mt-4 grid gap-3">
          <Input label="Therapist Name" value={settings.therapistName} onChange={(value) => setSettings({ ...settings, therapistName: value })} />
          <Input label="Practice Name" value={settings.practiceName} onChange={(value) => setSettings({ ...settings, practiceName: value })} />
          <Select label="Theme" value={settings.theme} options={['Quiet Cream', 'Terracotta', 'Sage', 'Slate']} onChange={(value) => setSettings({ ...settings, theme: value })} />
        </div>
        <div className="mt-5 rounded-md border border-[var(--line)] bg-[var(--bg)] p-4">
          <p className="text-sm font-semibold">Local data</p>
          <p className="mt-1 text-sm text-[var(--subtle)]">Saved in this browser and restored on refresh. Reset to return to the demo seed.</p>
          <button className="mt-3 icon-button" type="button" onClick={resetData}>
            <RefreshCcw size={17} />
            Reset demo data
          </button>
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
    duration: 60,
    reminder: 'WhatsApp',
    tags: '',
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
