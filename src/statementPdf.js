import { jsPDF } from 'jspdf';

// jsPDF's built-in fonts are Latin-1 only, so the narrow ₹ glyph won't render.
// Use the ISO code form ("INR 1,500") — safe across every currency and font.
function makeMoney(code) {
  const locale = code === 'INR' ? 'en-IN' : 'en-US';
  let fmt;
  try {
    fmt = new Intl.NumberFormat(locale, { style: 'currency', currency: code || 'INR', currencyDisplay: 'code', maximumFractionDigits: 0 });
  } catch {
    fmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'INR', currencyDisplay: 'code', maximumFractionDigits: 0 });
  }
  return (amount) => fmt.format(amount || 0);
}

// Render one statement onto the document starting at the top of the current
// page. Returns nothing; the caller manages pages and saving.
function renderStatement(doc, statement, settings, label, money) {
  const marginX = 20;
  const rightX = 190;
  let y = 24;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(18);
  doc.text(settings.practiceName || 'Practice', marginX, y);

  if (settings.therapistName) {
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(11);
    doc.setTextColor(110);
    doc.text(settings.therapistName, marginX, y);
    doc.setTextColor(30);
  }

  y += 6;
  doc.setDrawColor(210);
  doc.line(marginX, y, rightX, y);

  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text(`Statement — ${label}`, marginX, y);

  y += 7;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  doc.text(`Prepared for: ${statement.clientName}`, marginX, y);
  y += 6;
  doc.setTextColor(110);
  doc.text(`Generated: ${new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })}`, marginX, y);
  doc.setTextColor(30);

  y += 12;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.text('Summary', marginX, y);
  y += 2;
  doc.setDrawColor(230);
  doc.line(marginX, y, rightX, y);
  y += 8;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(11);
  const row = (labelText, valueText) => {
    doc.setTextColor(90);
    doc.text(labelText, marginX, y);
    doc.setTextColor(30);
    doc.text(String(valueText), rightX, y, { align: 'right' });
    y += 8;
  };

  row('Sessions attended', `${statement.attended}  ·  ${money(statement.sessionFees)}`);
  if (statement.lateCancels) row('Late cancellations', `${statement.lateCancels}  ·  ${money(statement.lateFees)}`);
  if (statement.cancellations) row('Cancellations', String(statement.cancellations));
  if (statement.otherCharges) row('Other charges', money(statement.otherCharges));
  row('Payments received', money(statement.paymentsTotal));
  if (statement.broughtForward > 0) row('Brought forward', money(statement.broughtForward));
  if (statement.broughtForward < 0) row('Credit brought forward', money(-statement.broughtForward));

  y += 2;
  doc.setDrawColor(210);
  doc.line(marginX, y, rightX, y);
  y += 10;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  if (statement.outstanding > 0) {
    doc.text('Outstanding', marginX, y);
    doc.text(money(statement.outstanding), rightX, y, { align: 'right' });
    if (settings.paymentDetails) {
      y += 9;
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(10);
      doc.setTextColor(90);
      doc.text(`Pay via ${settings.paymentDetails}`, marginX, y);
      doc.setTextColor(30);
    }
  } else if (statement.credit > 0) {
    doc.text('Credit balance', marginX, y);
    doc.text(money(statement.credit), rightX, y, { align: 'right' });
  } else {
    doc.text('Balance settled — thank you!', marginX, y);
  }
}

function fileStamp(name, label) {
  const slug = String(name || 'statement').trim().replace(/[^\w]+/g, '-').replace(/^-|-$/g, '') || 'statement';
  const month = String(label || '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  return `statement-${slug}${month ? `-${month}` : ''}.pdf`;
}

// One client's statement as a downloaded PDF.
export function downloadStatementPdf(statement, settings, label) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const money = makeMoney(settings.currency);
  renderStatement(doc, statement, settings, label, money);
  doc.save(fileStamp(statement.clientName, label));
}

// Every visible statement as one multi-page PDF, one client per page.
export function downloadStatementsPdf(statements, settings, label) {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  const money = makeMoney(settings.currency);
  statements.forEach((statement, index) => {
    if (index > 0) doc.addPage();
    renderStatement(doc, statement, settings, label, money);
  });
  const month = String(label || '').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '');
  doc.save(`statements-${month || 'all'}.pdf`);
}
