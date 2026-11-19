import { formatSeatNumber } from '../utils/seatNumber';

/**
 * SeatLedger Professional PDF Receipt & Fee Statement Generator
 * Opens a print-ready vector invoice formatted for A4 PDF download.
 */

export function printFeeReceipt({ fee, student, library }) {
  const receiptNo = `REC-${(fee?._id || Date.now()).toString().slice(-8).toUpperCase()}`;
  const currentDate = new Date().toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  const paymentDate = fee?.paymentDate
    ? new Date(fee.paymentDate).toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : currentDate;

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  const billingMonth = monthNames[(fee?.month || 1) - 1] || 'Current Month';

  const receiptHtml = `
    <!DOCTYPE html>
    <html>
      <head>
        <title>Receipt_${receiptNo}</title>
        <style>
          * { box-sizing: border-box; margin: 0; padding: 0; }
          body {
            font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;
            color: #1e293b;
            background: #fff;
            padding: 30px;
            font-size: 13px;
            line-height: 1.5;
          }
          .invoice-box {
            max-width: 750px;
            margin: auto;
            border: 1px solid #e2e8f0;
            padding: 30px;
            border-radius: 12px;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            border-bottom: 2px solid #4f46e5;
            padding-bottom: 16px;
            margin-bottom: 24px;
          }
          .brand-title {
            font-size: 24px;
            font-weight: 800;
            color: #4f46e5;
            letter-spacing: -0.5px;
          }
          .brand-subtitle {
            font-size: 12px;
            color: #64748b;
            margin-top: 2px;
          }
          .badge {
            display: inline-block;
            padding: 4px 10px;
            background: #ecfdf5;
            color: #059669;
            border: 1px solid #a7f3d0;
            border-radius: 20px;
            font-weight: 700;
            font-size: 11px;
            text-transform: uppercase;
          }
          .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 20px;
            margin-bottom: 24px;
          }
          .card {
            background: #f8fafc;
            border: 1px solid #f1f5f9;
            padding: 14px;
            border-radius: 8px;
          }
          .card-title {
            font-size: 11px;
            font-weight: 700;
            text-transform: uppercase;
            color: #64748b;
            margin-bottom: 6px;
          }
          .card-content {
            font-size: 13px;
          }
          .fee-table {
            width: 100%;
            border-collapse: collapse;
            margin: 20px 0;
          }
          .fee-table th {
            background: #f1f5f9;
            text-align: left;
            padding: 10px 14px;
            font-size: 11px;
            font-weight: 700;
            color: #475569;
            text-transform: uppercase;
          }
          .fee-table td {
            padding: 12px 14px;
            border-bottom: 1px solid #e2e8f0;
          }
          .total-row {
            font-weight: 700;
            font-size: 15px;
            background: #f8fafc;
          }
          .footer {
            margin-top: 30px;
            border-top: 1px dashed #cbd5e1;
            padding-top: 16px;
            display: flex;
            justify-content: space-between;
            align-items: flex-end;
          }
          .signature-box {
            text-align: center;
            width: 160px;
          }
          .signature-line {
            border-bottom: 1px solid #94a3b8;
            height: 40px;
            margin-bottom: 6px;
          }
          @media print {
            body { padding: 0; }
            .invoice-box { border: none; padding: 0; }
            .no-print { display: none; }
          }
        </style>
      </head>
      <body>
        <div class="invoice-box">
          <div class="header">
            <div>
              <h1 class="brand-title">${library?.name || 'SeatLedger Study Point'}</h1>
              <p class="brand-subtitle">${library?.address || 'Library Campus'}, ${library?.city || 'Varanasi'}</p>
              <p class="brand-subtitle">Contact: ${library?.phone || '+91 9876543210'} | ${library?.email || 'admin@library.in'}</p>
            </div>
            <div style="text-align: right;">
              <span class="badge">${fee?.status === 'Paid' ? 'PAID / SETTLED' : 'PARTIAL / DUE'}</span>
              <p style="font-weight: bold; margin-top: 6px;">Receipt #${receiptNo}</p>
              <p style="color: #64748b; font-size: 11px;">Date: ${paymentDate}</p>
            </div>
          </div>

          <div class="meta-grid">
            <div class="card">
              <p class="card-title">Student Information</p>
              <div class="card-content">
                <p><strong>Name:</strong> ${student?.studentName || student?.name || 'Student Member'}</p>
                <p><strong>Father's Name:</strong> ${student?.fatherName || 'N/A'}</p>
                <p><strong>Contact:</strong> ${student?.contactNo || student?.phone || 'N/A'}</p>
                <p><strong>Assigned Seat:</strong> <span style="color: #4f46e5; font-weight: bold;">Seat ${formatSeatNumber(student?.seatNumber || '1')}</span></p>
              </div>
            </div>

            <div class="card">
              <p class="card-title">Slot & Membership Timing</p>
              <div class="card-content">
                <p><strong>Shift / Slots:</strong> ${student?.shift || 'Full Day (24x7)'}</p>
                <p><strong>Billing Month:</strong> ${billingMonth} ${fee?.year || 2026}</p>
                <p><strong>Payment Mode:</strong> ${fee?.paymentMethod || 'Online (Razorpay)'}</p>
                <p><strong>Transaction Ref:</strong> ${fee?.razorpayPaymentId || fee?.razorpayOrderId || 'OFFLINE-COUNTER'}</p>
              </div>
            </div>
          </div>

          <table class="fee-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Seat & Slot Allocation</th>
                <th>Period</th>
                <th style="text-align: right;">Amount</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>Monthly Library Reading Hall Subscription</td>
                <td>Seat ${formatSeatNumber(student?.seatNumber || '1')} (${student?.shift || 'Standard'})</td>
                <td>${billingMonth} ${fee?.year || 2026}</td>
                <td style="text-align: right;">₹${fee?.amountDue || 800}</td>
              </tr>
              <tr class="total-row">
                <td colspan="3" style="text-align: right;">Total Amount Paid:</td>
                <td style="text-align: right; color: #059669;">₹${fee?.amountPaid || fee?.amountDue || 800}</td>
              </tr>
              ${
                fee?.balance > 0
                  ? `
                <tr>
                  <td colspan="3" style="text-align: right; color: #e11d48; font-weight: bold;">Outstanding Balance:</td>
                  <td style="text-align: right; color: #e11d48; font-weight: bold;">₹${fee.balance}</td>
                </tr>
              `
                  : ''
              }
            </tbody>
          </table>

          <div class="footer">
            <div>
              <p style="font-weight: bold; color: #475569;">Computer Generated Digital Invoice</p>
              <p style="font-size: 11px; color: #94a3b8;">SeatLedger SaaS • No signature required</p>
            </div>
            <div class="signature-box">
              <div class="signature-line"></div>
              <p style="font-size: 11px; font-weight: 600; color: #64748b;">Authorized Seal / Stamp</p>
            </div>
          </div>
        </div>

        <script>
          window.onload = function() {
            window.print();
          };
        </script>
      </body>
    </html>
  `;

  const printWindow = window.open('', '_blank', 'width=800,height=900');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(receiptHtml);
    printWindow.document.close();
  } else {
    alert('Please allow pop-ups in your browser to view and download PDF receipt.');
  }
}
