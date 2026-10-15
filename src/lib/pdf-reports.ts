/**
 * Offline PDF Generation Engine using expo-print and expo-sharing.
 * Generates official hospitality documents entirely on-device without cloud dependencies:
 * 1. Guest Registration Card (GRC) with signature line & statutory declaration
 * 2. Shift Cash Handover & Variance Report
 * 3. Daily Statutory Guest Register (Police Inspection Register)
 */

import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';

export interface GRCData {
  propertyName: string;
  propertyAddress?: string;
  guestName: string;
  phone?: string;
  nationality: string;
  idType: string;
  idLast4?: string;
  roomBed: string;
  checkInDate: string;
  checkOutDate?: string;
  amount: number | string;
  payMode: string;
  // Foreign guest Form C additions
  passportNo?: string;
  visaNo?: string;
  arrivedFrom?: string;
  nextDest?: string;
}

export interface ShiftReportData {
  propertyName: string;
  shiftId: string;
  staffName: string;
  openedAt: string;
  closedAt?: string;
  openingCash: number;
  cashCollected: number;
  upiCollected: number;
  pettyExpenses: number;
  expectedDrawer: number;
  countedCash: number;
  variance: number;
  notes?: string;
}

export interface DailyRegisterRow {
  sNo: number;
  roomBed: string;
  guestName: string;
  nationality: string;
  phone?: string;
  idType: string;
  idLast4?: string;
  checkInTime: string;
  status: string;
}

export interface DailyRegisterData {
  propertyName: string;
  reportDate: string;
  totalGuests: number;
  domesticCount: number;
  foreignCount: number;
  rows: DailyRegisterRow[];
}

/**
 * 1. Generate & Share Guest Registration Card (GRC)
 */
export async function exportGuestRegistrationCardPDF(data: GRCData): Promise<void> {
  const maskedId = data.idLast4 ? `XXXX-XXXX-${data.idLast4}` : 'Verified on File';

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Guest Registration Card</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 24px; margin: 0; line-height: 1.5; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 18px; }
          .hotel-name { font-size: 22px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.5px; color: #0f172a; }
          .hotel-sub { font-size: 12px; color: #64748b; margin-top: 2px; }
          .title-badge { display: inline-block; background: #0f172a; color: #ffffff; font-size: 11px; font-weight: 700; padding: 3px 12px; border-radius: 4px; margin-top: 6px; letter-spacing: 1px; }
          .grid { display: table; width: 100%; border-collapse: collapse; margin-bottom: 14px; }
          .row { display: table-row; }
          .cell-label { display: table-cell; width: 25%; font-weight: 700; color: #475569; padding: 6px 8px; border: 1px solid #cbd5e1; background: #f8fafc; font-size: 11.5px; text-transform: uppercase; }
          .cell-val { display: table-cell; width: 25%; padding: 6px 8px; border: 1px solid #cbd5e1; font-size: 12.5px; }
          .section-title { font-size: 13px; font-weight: 700; color: #0f172a; margin: 14px 0 6px; text-transform: uppercase; border-left: 3px solid #2563eb; padding-left: 6px; }
          .declaration { font-size: 10.5px; color: #64748b; border: 1px dashed #cbd5e1; padding: 10px; border-radius: 4px; margin-top: 16px; text-align: justify; }
          .sig-row { display: table; width: 100%; margin-top: 36px; }
          .sig-box { display: table-cell; width: 50%; vertical-align: bottom; }
          .sig-line { border-top: 1px solid #475569; width: 80%; margin-top: 40px; padding-top: 4px; font-size: 11px; font-weight: 600; color: #334155; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="hotel-name">${data.propertyName}</div>
          <div class="hotel-sub">${data.propertyAddress || 'Goa, India'} • Guest Check-In Record</div>
          <div class="title-badge">GUEST REGISTRATION CARD (GRC)</div>
        </div>

        <div class="section-title">1. Guest Particulars</div>
        <div class="grid">
          <div class="row">
            <div class="cell-label">Guest Full Name</div>
            <div class="cell-val" style="font-weight: 700;">${data.guestName}</div>
            <div class="cell-label">Mobile Number</div>
            <div class="cell-val">${data.phone || 'N/A'}</div>
          </div>
          <div class="row">
            <div class="cell-label">Nationality</div>
            <div class="cell-val">${data.nationality}</div>
            <div class="cell-label">ID Document Type</div>
            <div class="cell-val">${data.idType}</div>
          </div>
          <div class="row">
            <div class="cell-label">Masked ID Number</div>
            <div class="cell-val" style="font-family: monospace;">${maskedId}</div>
            <div class="cell-label">Room / Bed Assigned</div>
            <div class="cell-val" style="font-weight: 700; color: #2563eb;">${data.roomBed}</div>
          </div>
        </div>

        <div class="section-title">2. Stay & Billing Details</div>
        <div class="grid">
          <div class="row">
            <div class="cell-label">Check-In Date/Time</div>
            <div class="cell-val">${data.checkInDate}</div>
            <div class="cell-label">Expected Checkout</div>
            <div class="cell-val">${data.checkOutDate || 'Standard 11:00 AM'}</div>
          </div>
          <div class="row">
            <div class="cell-label">Tariff Amount</div>
            <div class="cell-val" style="font-weight: 700;">₹${Number(data.amount).toLocaleString('en-IN')}</div>
            <div class="cell-label">Payment Method</div>
            <div class="cell-val" style="text-transform: uppercase;">${data.payMode}</div>
          </div>
        </div>

        ${data.nationality !== 'India' && data.passportNo ? `
        <div class="section-title">3. Foreign National Particulars (Form C)</div>
        <div class="grid">
          <div class="row">
            <div class="cell-label">Passport Number</div>
            <div class="cell-val">${data.passportNo}</div>
            <div class="cell-label">Visa Number</div>
            <div class="cell-val">${data.visaNo || 'N/A'}</div>
          </div>
          <div class="row">
            <div class="cell-label">Arrived From</div>
            <div class="cell-val">${data.arrivedFrom || 'N/A'}</div>
            <div class="cell-label">Next Destination</div>
            <div class="cell-val">${data.nextDest || 'N/A'}</div>
          </div>
        </div>
        ` : ''}

        <div class="declaration">
          <b>Statutory Declaration:</b> I hereby declare that the particulars furnished above are true and correct to the best of my knowledge. I agree to abide by the property house rules and the laws of India. Government photo ID has been furnished solely for statutory police registration compliance.
        </div>

        <div class="sig-row">
          <div class="sig-box">
            <div class="sig-line">Guest Signature</div>
          </div>
          <div class="sig-box" style="text-align: right;">
            <div class="sig-line" style="margin-left: auto;">Authorized Front Desk / Duty Manager</div>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 2. Generate & Share Shift Cash & Turnover Report
 */
export async function exportShiftReportPDF(data: ShiftReportData): Promise<void> {
  const isBalanced = Math.abs(data.variance) <= 50;

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Shift Cash Report</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 24px; margin: 0; font-size: 13px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 20px; }
          .hotel-name { font-size: 20px; font-weight: 800; text-transform: uppercase; }
          .title { font-size: 13px; font-weight: 700; color: #2563eb; letter-spacing: 0.5px; }
          .table { width: 100%; border-collapse: collapse; margin-top: 14px; }
          .table th, .table td { border: 1px solid #cbd5e1; padding: 8px 12px; text-align: left; }
          .table th { background: #f8fafc; font-weight: 700; color: #475569; font-size: 11px; text-transform: uppercase; }
          .num { text-align: right; font-family: monospace; font-size: 13px; }
          .total-row td { font-weight: 700; background: #f1f5f9; }
          .badge-ok { color: #16a34a; font-weight: 700; }
          .badge-bad { color: #dc2626; font-weight: 700; }
          .sig-row { display: table; width: 100%; margin-top: 40px; }
          .sig-box { display: table-cell; width: 50%; }
          .sig-line { border-top: 1px solid #475569; width: 75%; margin-top: 40px; font-size: 11px; font-weight: 600; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="hotel-name">${data.propertyName}</div>
          <div class="title">FRONT DESK SHIFT CASH & TURNOVER REPORT</div>
          <div style="font-size: 11px; color: #64748b; margin-top: 4px;">Shift ID: ${data.shiftId.slice(0, 8)} • Duty Staff: ${data.staffName}</div>
        </div>

        <div>
          <b>Opened At:</b> ${new Date(data.openedAt).toLocaleString('en-IN')}<br/>
          <b>Closed At:</b> ${data.closedAt ? new Date(data.closedAt).toLocaleString('en-IN') : 'Open Shift'}
        </div>

        <table class="table">
          <thead>
            <tr>
              <th>Cash Reconciliation Line Item</th>
              <th style="text-align: right;">Amount (INR)</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>1. Opening Float (Cash Drawer at Start)</td>
              <td class="num">₹${data.openingCash.toFixed(2)}</td>
            </tr>
            <tr>
              <td>2. Cash Collected from Guest Stays</td>
              <td class="num" style="color: #16a34a;">+ ₹${data.cashCollected.toFixed(2)}</td>
            </tr>
            <tr>
              <td>3. UPI / Digital Collections (Direct to Bank)</td>
              <td class="num" style="color: #64748b;">(₹${data.upiCollected.toFixed(2)})</td>
            </tr>
            <tr>
              <td>4. Petty Cash Outflows & Vendor Expenses</td>
              <td class="num" style="color: #dc2626;">- ₹${data.pettyExpenses.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Expected Cash in Drawer (1 + 2 - 4)</td>
              <td class="num">₹${data.expectedDrawer.toFixed(2)}</td>
            </tr>
            <tr>
              <td>Physical Cash Counted at Close</td>
              <td class="num" style="font-weight: 700;">₹${data.countedCash.toFixed(2)}</td>
            </tr>
            <tr class="total-row">
              <td>Net Cash Variance</td>
              <td class="num ${isBalanced ? 'badge-ok' : 'badge-bad'}">
                ${data.variance >= 0 ? '+' : ''}₹${data.variance.toFixed(2)}
                (${isBalanced ? 'BALANCED' : data.variance < 0 ? 'SHORTAGE' : 'SURPLUS'})
              </td>
            </tr>
          </tbody>
        </table>

        ${data.notes ? `<div style="margin-top: 14px; font-size: 11.5px; color: #475569;"><b>Notes:</b> ${data.notes}</div>` : ''}

        <div class="sig-row">
          <div class="sig-box">
            <div class="sig-line">Cashier / Staff Handing Over (${data.staffName})</div>
          </div>
          <div class="sig-box" style="text-align: right;">
            <div class="sig-line" style="margin-left: auto;">Relieving Staff / Property Owner</div>
          </div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}

/**
 * 3. Generate & Share Daily Police Inspection Register PDF
 */
export async function exportDailyRegisterPDF(data: DailyRegisterData): Promise<void> {
  const rowsHtml = data.rows.map(r => `
    <tr>
      <td style="text-align: center;">${r.sNo}</td>
      <td style="font-weight: 700;">${r.roomBed}</td>
      <td style="font-weight: 600;">${r.guestName}</td>
      <td>${r.nationality}</td>
      <td>${r.phone || '—'}</td>
      <td>${r.idType}</td>
      <td style="font-family: monospace;">${r.idLast4 ? `...${r.idLast4}` : 'Verified'}</td>
      <td>${r.checkInTime}</td>
      <td style="font-weight: 600; text-transform: uppercase;">${r.status}</td>
    </tr>
  `).join('');

  const html = `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>Daily Guest Register</title>
        <style>
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; color: #1e293b; padding: 20px; margin: 0; font-size: 11px; }
          .header { text-align: center; border-bottom: 2px solid #0f172a; padding-bottom: 10px; margin-bottom: 12px; }
          .hotel-name { font-size: 18px; font-weight: 800; text-transform: uppercase; }
          .reg-title { font-size: 12px; font-weight: 700; color: #0f172a; margin-top: 2px; }
          .summary-bar { background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 4px; padding: 8px 12px; font-size: 11px; display: table; width: 100%; margin-bottom: 12px; }
          .sum-cell { display: table-cell; }
          .table { width: 100%; border-collapse: collapse; }
          .table th, .table td { border: 1px solid #cbd5e1; padding: 6px 8px; text-align: left; }
          .table th { background: #f1f5f9; font-weight: 700; color: #334155; font-size: 10px; text-transform: uppercase; }
          .footer { margin-top: 30px; display: table; width: 100%; }
          .footer-cell { display: table-cell; width: 50%; font-size: 10px; color: #64748b; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="hotel-name">${data.propertyName}</div>
          <div class="reg-title">DAILY GUEST REGISTER (STATUTORY INSPECTION RECORD)</div>
          <div style="font-size: 10px; color: #64748b;">Record Date: ${data.reportDate} • Maintained under State Police Hotel Inspection Regulations</div>
        </div>

        <div class="summary-bar">
          <div class="sum-cell"><b>Total In-House Guests:</b> ${data.totalGuests}</div>
          <div class="sum-cell"><b>Domestic Guests:</b> ${data.domesticCount}</div>
          <div class="sum-cell"><b>Foreign Nationals (Form C):</b> ${data.foreignCount}</div>
        </div>

        <table class="table">
          <thead>
            <tr>
              <th style="width: 30px; text-align: center;">S.No</th>
              <th>Room / Bed</th>
              <th>Guest Name</th>
              <th>Nationality</th>
              <th>Mobile</th>
              <th>ID Type</th>
              <th>Masked ID</th>
              <th>Check-In</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml.length > 0 ? rowsHtml : '<tr><td colspan="9" style="text-align: center; color: #94a3b8; padding: 20px;">No registered stays recorded for this period.</td></tr>'}
          </tbody>
        </table>

        <div class="footer">
          <div class="footer-cell">Verified by: Property Front Desk Operations</div>
          <div class="footer-cell" style="text-align: right;">Generated via LogStay Mobile Engine (Offline)</div>
        </div>
      </body>
    </html>
  `;

  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, { UTI: '.pdf', mimeType: 'application/pdf' });
  }
}
