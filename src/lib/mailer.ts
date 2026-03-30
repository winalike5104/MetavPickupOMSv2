import nodemailer from 'nodemailer';
import Handlebars from 'handlebars';
import { v4 as uuidv4 } from 'uuid';

// Resend SMTP Configuration
const smtpHost = "smtp.resend.com";
const smtpPort = 465; // SSL
const smtpUser = "resend";
const smtpPass = process.env.RESEND_API_KEY; // re_ API Key from environment

if (!smtpPass) {
  console.warn("WARNING: RESEND_API_KEY is not set in environment variables.");
}

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: true, // SSL
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

interface EmailOptions {
  to: string;
  storeId: string;
  storeName: string;
  subject: string;
  body: string;
  context?: any;
  senderEmail?: string; // From database
}

const SHOP_EMAIL_MAPPING: Record<string, string> = {
  'GALLOP': 'gallopautoparts@acapickup.com',
  'RAMAUTO': 'ram_auto@acapickup.com',
  'NZONLINE': 'nzonline_autoparts@acapickup.com',
  'MACHTER': 'machter_nz@acapickup.com',
  'ATP': 'atpautoparts@acapickup.com',
  'MOVINGTIME': 'movingtime_nz@acapickup.com',
  'NZWHOLESALE': 'nzwholesales888@acapickup.com',
  'WINDALIKE': 'windalike5104@acapickup.com'
};

/**
 * Sends a single email with dynamic sender and Reply-To based on storeId.
 */
export const sendEmail = async (options: EmailOptions) => {
  const { to, storeId, storeName, subject, body, context, senderEmail } = options;

  // Compile template if context is provided
  let html = body;
  let finalSubject = subject;
  if (context) {
    try {
      console.log("🚀 [Mailer] Compiling template. Body length:", body.length);
      const bodyTemplate = Handlebars.compile(body);
      const subjectTemplate = Handlebars.compile(subject);
      
      // 🛡️ 增强 Context：自动支持下划线格式，兼容不同风格的模板
      const enhancedContext = {
        ...context,
        customer_name: context.customerName || context.name,
        booking_number: context.bookingNumber || context.id,
        store_name: storeName || context.storeName || context.storeId,
        warehouse_address: context.warehouse_address || "15 COPSEY PLACE, AVONDALE, AUCKLAND",
        pickup_hours: context.pickup_hours || "Mon-Fri 10am-5pm"
      };

      // 🔍 [DEBUG] 看看传进来的 Context 到底长什么样
      console.log("🚀 [Mailer] Rendering with enhanced context keys:", Object.keys(enhancedContext));
      console.log("🚀 [Mailer] Context sample (status):", enhancedContext.status);

      html = bodyTemplate(enhancedContext);
      finalSubject = subjectTemplate(enhancedContext);
      
      // 🔍 [DEBUG] 看看渲染后的结果
      console.log("📝 [Mailer] Rendered Preview (first 100 chars):", html.substring(0, 100));
      if (html.includes('{{')) {
        console.warn("⚠️ [Mailer] Warning: Rendered HTML still contains '{{'. Some variables might not have been replaced.");
      }
    } catch (renderError) {
      console.error("🔥 Handlebars Render Error:", renderError);
      // 渲染失败时回退到原始文本
      html = body;
      finalSubject = subject;
    }
  }

  // Priority logic for sender email:
  // 1. Database (senderEmail)
  // 2. Code Default (SHOP_EMAIL_MAPPING)
  // 3. Global Secret (SMTP_SENDER)
  // 4. Fallback (storeId@acapickup.com)
  const sanitizedStoreId = storeId.toUpperCase().replace(/\s+/g, '_');
  const codeDefaultEmail = SHOP_EMAIL_MAPPING[sanitizedStoreId];
  const globalSenderEmail = process.env.SMTP_SENDER;

  const fromEmail = senderEmail || codeDefaultEmail || globalSenderEmail || `${storeId.toLowerCase()}@acapickup.com`;
  const from = `"${storeName}" <${fromEmail}>`;
  const replyTo = fromEmail;

  const mailOptions = {
    from,
    to,
    replyTo,
    subject: finalSubject,
    html,
    text: body, // 作为备用纯文本
    messageId: `<${uuidv4()}@acapickup.com>`,
  };

  return transporter.sendMail(mailOptions);
};

/**
 * Sends bulk emails with a 500ms delay between each to prevent spam filters.
 */
export const sendBulkEmails = async (tasks: EmailOptions[]) => {
  const results = [];
  for (const task of tasks) {
    try {
      const result = await sendEmail(task);
      results.push({ success: true, result });
    } catch (error) {
      console.error(`Failed to send email to ${task.to}:`, error);
      results.push({ success: false, error });
    }
    // 500ms delay as requested
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  return results;
};
