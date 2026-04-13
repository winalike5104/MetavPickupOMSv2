import admin from "firebase-admin";
import { Resend } from "resend";
import { DateTime } from "luxon";
import Papa from "papaparse";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

interface OrderReportData {
  OrderID: string;
  Customer: string;
  Warehouse: string;
  Status: string;
  CreatedAt: string;
  ReportType: string;
}

export async function generateAndSendDailyReport(db: admin.firestore.Firestore) {
  console.log("[ReportService] Starting daily report generation...");
  
  try {
    const timezone = "Pacific/Auckland";
    const now = DateTime.now().setZone(timezone);
    const todayStart = now.startOf("day").toISO();
    const fourteenDaysAgo = now.minus({ days: 14 });
    const fourteenDaysAgoStart = fourteenDaysAgo.startOf("day").toISO();
    const fourteenDaysAgoEnd = fourteenDaysAgo.endOf("day").toISO();

    console.log(`[ReportService] Time range: Today Start: ${todayStart}, 14 Days Ago: ${fourteenDaysAgoStart} to ${fourteenDaysAgoEnd}`);

    // 1. New PU: Created today
    const newOrdersSnap = await db.collection("orders")
      .where("createdTime", ">=", todayStart)
      .get();
    
    // 2. Confirmed Pickups: Status changed to 'Picked Up' today
    // We query by statusUpdatedAt and filter by status to avoid composite index requirement
    const confirmedPickupsSnap = await db.collection("orders")
      .where("statusUpdatedAt", ">=", todayStart)
      .get();
    
    const confirmedPickups = confirmedPickupsSnap.docs.filter(doc => doc.data().status === "Picked Up");

    // 3. 14-Day Overdue: Created exactly 14 days ago, not Reviewed or Cancelled
    const overdueSnap = await db.collection("orders")
      .where("createdTime", ">=", fourteenDaysAgoStart)
      .where("createdTime", "<=", fourteenDaysAgoEnd)
      .get();

    const overdueOrders = overdueSnap.docs.filter(doc => {
      const data = doc.data();
      return !["Reviewed", "Cancelled"].includes(data.status);
    });

    // Fetch Report Configuration from Firestore
    const configDoc = await db.collection("settings").doc("report_config").get();
    const config = configDoc.exists ? configDoc.data() : null;

    if (!config || !config.enabled) {
      console.log("[ReportService] Report is disabled in settings.");
      return { success: false, error: "Report disabled" };
    }

    // Process data for CSV and Table
    const reportData: OrderReportData[] = [];
    
    newOrdersSnap.forEach(doc => {
      const data = doc.data();
      reportData.push({
        OrderID: data.bookingNumber || doc.id,
        Customer: data.customerName || "N/A",
        Warehouse: data.warehouseId || "N/A",
        Status: data.status,
        CreatedAt: data.createdTime,
        ReportType: "New PU"
      });
    });

    confirmedPickups.forEach(doc => {
      const data = doc.data();
      reportData.push({
        OrderID: data.bookingNumber || doc.id,
        Customer: data.customerName || "N/A",
        Warehouse: data.warehouseId || "N/A",
        Status: data.status,
        CreatedAt: data.createdTime,
        ReportType: "Confirmed Pickup"
      });
    });

    overdueOrders.forEach(doc => {
      const data = doc.data();
      reportData.push({
        OrderID: data.bookingNumber || doc.id,
        Customer: data.customerName || "N/A",
        Warehouse: data.warehouseId || "N/A",
        Status: data.status,
        CreatedAt: data.createdTime,
        ReportType: "14-Day Overdue"
      });
    });

    // Generate CSV
    let csv = "";
    if (reportData.length > 0) {
      csv = Papa.unparse(reportData);
    } else {
      csv = "OrderID,Customer,Warehouse,Status,CreatedAt,ReportType\n";
    }

    // Generate HTML Table
    const htmlTable = `
      <table border="1" cellpadding="5" style="border-collapse: collapse; width: 100%; max-width: 600px;">
        <thead>
          <tr style="background-color: #f2f2f2;">
            <th>Report Category</th>
            <th>Count</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td>New PU (Created Today)</td>
            <td>${newOrdersSnap.size}</td>
          </tr>
          <tr>
            <td>Confirmed Pickups (Today)</td>
            <td>${confirmedPickups.length}</td>
          </tr>
          <tr>
            <td>14-Day Overdue</td>
            <td>${overdueOrders.length}</td>
          </tr>
        </tbody>
      </table>
    `;

    const toEmails = (config.toEmails || "").split(",").map((e: string) => e.trim()).filter((e: string) => e);
    const ccEmails = (config.ccEmails || "").split(",").map((e: string) => e.trim()).filter((e: string) => e);

    if (toEmails.length === 0) {
      console.warn("[ReportService] No recipient emails configured in settings");
      return { success: false, error: "No recipients" };
    }

    const senderName = config.senderName || "Acapickup WMS";

    // Send Email
    const { data, error } = await resend.emails.send({
      from: `${senderName} <noreply@acapickup.com>`,
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `Daily Business Summary Report - ${now.toFormat("yyyy-MM-dd")}`,
      html: `
        <div style="font-family: sans-serif; color: #333;">
          <h2>Daily Business Summary</h2>
          <p>Here is the automated business summary for <b>${now.toFormat("cccc, dd LLLL yyyy")}</b> (Auckland Time).</p>
          ${htmlTable}
          <p>Please find the detailed CSV report attached.</p>
          <hr />
          <p style="font-size: 12px; color: #777;">This is an automated message from ${senderName}.</p>
        </div>
      `,
      attachments: [
        {
          filename: `business_report_${now.toFormat("yyyyMMdd")}.csv`,
          content: Buffer.from(csv).toString("base64"),
        },
      ],
    });

    if (error) {
      console.error("[ReportService] Resend Error:", error);
      throw error;
    }

    console.log("[ReportService] Report sent successfully:", data?.id);
    return { success: true, message: "Report sent", id: data?.id };

  } catch (err: any) {
    console.error("[ReportService] Failed to generate/send report:", err);
    throw err;
  }
}
