import admin from "firebase-admin";
import { Resend } from "resend";
import { DateTime } from "luxon";
import Papa from "papaparse";

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

interface OrderReportData {
  Report_Type: string;
  Order_ID: string;
  Customer_Name: string;
  Warehouse_ID: string;
  Current_Status: string;
  Payment_Status: string;
  Items_Summary: string;
  Created_At: string;
  Last_Updated: string;
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
      // Exclude terminal states: Reviewed (Completed) and Cancelled
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
      const items = data.items || [];
      const totalQty = items.reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
      const itemsSummary = `(${totalQty}) ` + items.map((item: any) => `[${item.sku}] ${item.productName} x ${item.qty}`).join('; ');
      reportData.push({
        Report_Type: "NEW_ORDER",
        Order_ID: data.bookingNumber || doc.id,
        Customer_Name: data.customerName || "N/A",
        Warehouse_ID: data.warehouseId || "N/A",
        Current_Status: data.status,
        Payment_Status: data.paymentStatus || "Unpaid",
        Items_Summary: itemsSummary,
        Created_At: data.createdTime,
        Last_Updated: data.statusUpdatedAt || data.createdTime
      });
    });

    confirmedPickups.forEach(doc => {
      const data = doc.data();
      const items = data.items || [];
      const totalQty = items.reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
      const itemsSummary = `(${totalQty}) ` + items.map((item: any) => `[${item.sku}] ${item.productName} x ${item.qty}`).join('; ');
      reportData.push({
        Report_Type: "PICKED_UP",
        Order_ID: data.bookingNumber || doc.id,
        Customer_Name: data.customerName || "N/A",
        Warehouse_ID: data.warehouseId || "N/A",
        Current_Status: data.status,
        Payment_Status: data.paymentStatus || "N/A",
        Items_Summary: itemsSummary,
        Created_At: data.createdTime,
        Last_Updated: data.statusUpdatedAt || data.createdTime
      });
    });

    overdueOrders.forEach(doc => {
      const data = doc.data();
      const items = data.items || [];
      const totalQty = items.reduce((sum: number, item: any) => sum + (item.qty || 0), 0);
      const itemsSummary = `(${totalQty}) ` + items.map((item: any) => `[${item.sku}] ${item.productName} x ${item.qty}`).join('; ');
      reportData.push({
        Report_Type: "OVERDUE",
        Order_ID: data.bookingNumber || doc.id,
        Customer_Name: data.customerName || "N/A",
        Warehouse_ID: data.warehouseId || "N/A",
        Current_Status: data.status,
        Payment_Status: data.paymentStatus || "N/A",
        Items_Summary: itemsSummary,
        Created_At: data.createdTime,
        Last_Updated: data.statusUpdatedAt || data.createdTime
      });
    });

    // Generate CSV
    let csv = "";
    if (reportData.length > 0) {
      csv = Papa.unparse(reportData);
    } else {
      csv = "Report_Type,Order_ID,Customer_Name,Warehouse_ID,Current_Status,Payment_Status,Items_Summary,Created_At,Last_Updated\n";
    }

    const stats = {
      newPU: newOrdersSnap.size,
      confirmed: confirmedPickups.length,
      overdue: overdueOrders.length
    };

    const toEmails = (config.toEmails || "").split(",").map((e: string) => e.trim()).filter((e: string) => e);
    const ccEmails = (config.ccEmails || "").split(",").map((e: string) => e.trim()).filter((e: string) => e);

    if (toEmails.length === 0) {
      console.warn("[ReportService] No recipient emails configured in settings");
      return { success: false, error: "No recipients" };
    }

    const senderName = config.senderName || "Acapickup WMS";
    const reportDateStr = now.toFormat("LLLL dd, yyyy");

    // Send Email
    const { data, error } = await resend.emails.send({
      from: `${senderName} <noreply@acapickup.com>`,
      to: toEmails,
      cc: ccEmails.length > 0 ? ccEmails : undefined,
      subject: `[Acapickup Report] Daily Summary & Data Backup - ${reportDateStr}`,
      html: `
<div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; color: #333; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px; overflow: hidden;">
  
  <div style="background-color: #000000; padding: 25px; text-align: center;">
    <h1 style="color: #ffffff; margin: 0; font-size: 22px; letter-spacing: 1px;">${senderName}</h1>
    <p style="color: #999999; margin: 5px 0 0 0; font-size: 13px;">Auckland Warehouse Daily Summary</p>
  </div>

  <div style="padding: 30px;">
    <p style="font-size: 16px;">Dear Team,</p>
    <p style="font-size: 14px; color: #555; line-height: 1.6;">
      Please find the automated daily business summary for <strong>${reportDateStr}</strong>. This report includes a summary of new orders, completed pickups, and overdue alerts.
    </p>

    <table style="width: 100%; border-collapse: collapse; margin: 25px 0; font-size: 14px;">
      <thead>
        <tr style="background-color: #f8f9fa;">
          <th style="padding: 12px; border: 1px solid #eeeeee; text-align: left;">Key Performance Indicators (KPIs)</th>
          <th style="padding: 12px; border: 1px solid #eeeeee; text-align: center;">Count</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td style="padding: 12px; border: 1px solid #eeeeee;">New Pickup (PU) Orders Created Today</td>
          <td style="padding: 12px; border: 1px solid #eeeeee; text-align: center; font-weight: bold; font-size: 16px;">${stats.newPU}</td>
        </tr>
        <tr>
          <td style="padding: 12px; border: 1px solid #eeeeee;">Confirmed Pickups (Completed Today)</td>
          <td style="padding: 12px; border: 1px solid #eeeeee; text-align: center; font-weight: bold; font-size: 16px; color: #2ecc71;">${stats.confirmed}</td>
        </tr>
        <tr style="background-color: #fff9f9;">
          <td style="padding: 12px; border: 1px solid #eeeeee; color: #e74c3c;">14-Day Overdue Orders (Attention Required)</td>
          <td style="padding: 12px; border: 1px solid #eeeeee; text-align: center; font-weight: bold; font-size: 16px; color: #e74c3c;">${stats.overdue}</td>
        </tr>
      </tbody>
    </table>

    <div style="margin-top: 20px; padding: 15px; background-color: #fcf8e3; border-left: 4px solid #f0ad4e; font-size: 13px; color: #66512c;">
      <strong>Data Backup Info:</strong><br>
      A detailed list of all relevant orders is attached as a <strong>CSV file</strong>. This includes Order IDs, Customer Names, and Status timestamps for your records and system backup.
    </div>
  </div>

  <div style="background-color: #f4f4f4; padding: 20px; text-align: center; font-size: 12px; color: #888; border-top: 1px solid #e0e0e0;">
    <p style="margin: 0;">Location: Auckland Warehouse | Timezone: NZST (UTC+12)</p>
    <p style="margin: 5px 0 0 0;">This is an automated system message. Please do not reply directly to this email.</p>
  </div>
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
