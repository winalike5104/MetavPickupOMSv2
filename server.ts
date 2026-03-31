import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import admin from "firebase-admin";
import fs from "fs";
import http from "http";
import { Server } from "socket.io";
import bcrypt from 'bcryptjs';
import firebaseConfig from './firebase-applet-config.json' with { type: 'json' };
import { sendEmail, sendBulkEmails } from './src/lib/mailer';
import { isValidDateString } from './src/lib/firebase';
import { authenticate, loginUser } from './src/lib/auth';
import { SUPER_ADMINS } from './src/lib/auth-shared';

// Helper to write to debug log
const writeDebugLog = (message: string) => {
  const logPath = path.join(process.cwd(), "debug.log");
  const timestamp = new Date().toISOString();
  const logEntry = `[${timestamp}] ${message}\n`;
  fs.appendFileSync(logPath, logEntry);
};

// Initialize Firebase Admin lazily and safely
let db: admin.firestore.Firestore | null = null;
let lastInitError: string | null = null;

const initDb = async () => {
  if (db) return db;
  try {
    if (!admin.apps.length) {
      // 1. Check for explicit service account in environment
      const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
      
      if (serviceAccountJson) {
        try {
          const serviceAccount = JSON.parse(serviceAccountJson);
          admin.initializeApp({
            credential: admin.credential.cert(serviceAccount),
            databaseURL: firebaseConfig.databaseURL
          });
          console.log("🚀 [Server] Firebase Admin SDK initialized with Service Account (God Mode ON)");
        } catch (e: any) {
          console.error("❌ Failed to parse FIREBASE_SERVICE_ACCOUNT_JSON:", e.message);
          // Fallback to other methods if parsing fails
        }
      }

      // 2. Fallback to projectId or default credentials if not already initialized
      if (!admin.apps.length) {
        if (firebaseConfig.projectId) {
          const adminConfig: any = { projectId: firebaseConfig.projectId };
          if (firebaseConfig.databaseURL) {
            adminConfig.databaseURL = firebaseConfig.databaseURL;
          }
          admin.initializeApp(adminConfig);
          console.log("Admin SDK initialized with config project ID:", firebaseConfig.projectId);
        } else {
          try {
            admin.initializeApp();
            console.log("Admin SDK initialized with default ambient credentials");
          } catch (e) {
            throw e;
          }
        }
      }
    }
    
    try {
      // Correct way to get a specific database instance in Firebase Admin SDK
      const databaseId = (firebaseConfig as any).firestoreDatabaseId;
      db = admin.firestore(databaseId); 
      console.log(`Firestore instance created for database: ${databaseId || "(default)"}`);
      lastInitError = null;
    } catch (e: any) {
      console.error("Failed to connect to Firestore:", e.message);
      lastInitError = `Failed to connect to Firestore: ${e.message}`;
      throw e;
    }
    
    return db;
  } catch (error: any) {
    lastInitError = error.message || String(error);
    console.error("CRITICAL: Failed to initialize Firebase Admin:", error);
    return null;
  }
};

// Helper Functions for Backend
const hasPermission = (user: any, permission: string) => {
  const isSuper = SUPER_ADMINS.includes(user.username.toLowerCase());
  if (isSuper) return true;
  return (user.permissions || []).includes(permission);
};

const logAction = async (user: any, action: string, details: string, orderId?: string) => {
  try {
    const currentDb = await initDb();
    if (!currentDb) return;
    await currentDb.collection('logs').add({
      timestamp: new Date().toISOString(),
      userId: user.uid,
      userName: user.name,
      action,
      details,
      orderId: orderId || null
    });
  } catch (error) {
    console.error('Failed to log action:', error);
  }
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { writeLog, readLogs, clearLogs } from './src/lib/logger';

// ... (existing code)

async function startServer() {
  const app = express();
  
  // 1. CORS 配置 (必须在所有路由之前)
  app.use(cors({
    origin: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'x-custom-auth-token', 'x-warehouse-id'],
    credentials: true
  }));

  // 2. JSON 解析 (必须在所有路由之前)
  app.use(express.json({ limit: '10mb' }));

  // 3. 🚨 终极调试：监控所有进入服务器的请求
  app.use((req, res, next) => {
    // 记录所有非静态资源的请求
    if (!req.url.includes('.') && !req.url.startsWith('/@')) {
      writeLog('DEBUG', `📥 Request: ${req.method} ${req.url}`, { headers: req.headers });
    }
    
    // 拦截响应，确保报错时我们能看到
    const originalSend = res.send;
    res.send = function(body) {
      if (res.statusCode >= 400) {
        writeLog('ERROR', `📤 Error Response (${res.statusCode}) for ${req.method} ${req.url}`, { body });
      }
      return originalSend.apply(res, arguments as any);
    };
    next();
  });

  // System Logs Endpoints
  app.get("/api/admin/logs", authenticate, (req: any, res) => {
    const isSuper = SUPER_ADMINS.includes(req.user.username.toLowerCase());
    if (!isSuper) return res.status(403).json({ error: "Forbidden" });
    
    const logs = readLogs(200);
    res.json({ success: true, logs });
  });

  app.post("/api/admin/logs/clear", authenticate, (req: any, res) => {
    const isSuper = SUPER_ADMINS.includes(req.user.username.toLowerCase());
    if (!isSuper) return res.status(403).json({ error: "Forbidden" });
    
    clearLogs();
    res.json({ success: true });
  });

  // ... (existing code)

  const server = http.createServer(app);
  const io = new Server(server, {
    cors: {
      origin: "*",
      methods: ["GET", "POST"]
    }
  });
  const PORT = Number(process.env.PORT) || 3000;

  // Login Endpoint
  app.post("/api/login", async (req, res) => {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Username and password required" });
    }

    try {
      const currentDb = await initDb();
      if (!currentDb) throw new Error("Database not initialized");
      const result = await loginUser(currentDb, { username, password });
      res.json({
        success: true,
        ...result
      });
    } catch (error: any) {
      console.error("Login Error:", error);
      res.status(401).json({ success: false, error: error.message });
    }
  });

  // Helper function to send order notification with checks
  const sendOrderNotification = async (currentDb: admin.firestore.Firestore, orderId: string, type: string, user: any, requestedWh?: string) => {
    try {
      // 1. Fetch order
      const orderDoc = await currentDb.collection("orders").doc(orderId).get();
      if (!orderDoc.exists) throw new Error("Order not found");
      const order = orderDoc.data();

      // 2. Data Isolation Check
      const allowedWarehouses = user.allowedWarehouses || [];
      const isSuper = SUPER_ADMINS.includes(user.username.toLowerCase());

      if (!isSuper) {
        // Must have access to the order's warehouse
        if (!allowedWarehouses.includes('*') && !allowedWarehouses.includes(order?.warehouseId)) {
          throw new Error("Forbidden: You do not have access to this warehouse");
        }
        // If a specific warehouse was selected in the session, it must match the order's warehouse
        if (requestedWh && order?.warehouseId !== requestedWh) {
          throw new Error("Forbidden: Order belongs to a different warehouse than selected");
        }
      }

      // 3. 24-hour check
      const now = new Date().getTime();
      const twentyFourHours = 24 * 60 * 60 * 1000;
      if (order?.emailStatus === 'sent' && order?.lastEmailSentAt) {
        const lastSent = new Date(order.lastEmailSentAt).getTime();
        if ((now - lastSent) <= twentyFourHours) {
          return { success: true, emailStatus: 'skipped', message: "Already sent in last 24h" };
        }
      }

      // 4. Fetch store
      const storeDoc = await currentDb.collection("stores").doc(order?.storeId || order?.storeName).get();
      const storeData = storeDoc.exists ? storeDoc.data() : null;

      // 5. Store disable check
      if (storeData?.disableEmail === true) {
        await currentDb.collection("orders").doc(orderId).update({
          emailStatus: 'skipped',
          lastEmailSentAt: new Date().toISOString(),
          lastEmailError: "Store email sending disabled"
        });
        return { success: true, emailStatus: 'skipped', message: "Email sending disabled for this store" };
      }

      if (!order?.customerEmail) {
        throw new Error("Order has no customer email");
      }

      // 6. Send email
      await sendEmail({
        to: order.customerEmail,
        storeId: order.storeId || order.storeName,
        storeName: storeData?.name || order.storeName,
        senderEmail: storeData?.senderEmail,
        subject: storeData?.template?.subject || "Order Notification",
        body: storeData?.template?.body || "Your order status is {{status}}",
        context: { 
          ...order, 
          status: order.status,
          customerName: order.customerName,
          bookingNumber: order.bookingNumber || order.id,
          pickupDate: order.pickupDateScheduled,
          customer_name: order.customerName,
          booking_number: order.bookingNumber || order.id,
          store_name: storeData?.name || order.storeName || "Our Store",
          warehouse_address: "15 COPSEY PLACE, AVONDALE, AUCKLAND",
          pickup_hours: "Mon-Fri 10am-5pm"
        }
      });

      // 7. Update order on success
      await currentDb.collection("orders").doc(orderId).update({
        [`emailLog.${type}`]: new Date().toISOString(),
        emailStatus: 'sent',
        lastEmailSentAt: new Date().toISOString(),
        lastEmailError: null
      });

      return { success: true, message: "Notification sent", emailStatus: 'sent' };
    } catch (error: any) {
      console.error(`Error processing email for order ${orderId}:`, error);
      // Update order on failure
      await currentDb.collection("orders").doc(orderId).update({
        emailStatus: 'failed',
        lastEmailAttemptAt: new Date().toISOString(),
        lastEmailError: error.message
      });
      throw error;
    }
  };

  // Order Notification Endpoint
  app.post("/api/orders/send-notification", authenticate, async (req: any, res) => {
    console.log(`📧 [API] Entering send-notification. User: ${req.user?.username}, Order: ${req.body?.orderId}`);
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orderId, type = 'pickup_notification' } = req.body;
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Missing orderId" });
      }

      const result = await sendOrderNotification(currentDb, orderId, type, req.user, req.selectedWarehouse);
      return res.json(result);
    } catch (error: any) {
      const stack = error.stack || error;
      console.log("🔥 [SERVER ERROR] send-notification:");
      console.trace(error);
      writeDebugLog(`ERROR send-notification: ${stack}`);
      return res.status(500).json({ success: false, error: error.message, stack: stack });
    }
  });

  // Bulk Order Notification Endpoint
  app.post("/api/orders/bulk-send-notification", authenticate, async (req: any, res) => {
    console.log(`📧 [API] Entering bulk-send-notification. User: ${req.user?.username}, Orders count: ${req.body?.orderIds?.length}`);
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orderIds, type = 'pickup_notification' } = req.body;
      if (!orderIds || !Array.isArray(orderIds)) {
        return res.status(400).json({ success: false, error: "Missing or invalid orderIds" });
      }

      const results = [];
      for (const orderId of orderIds) {
        try {
          const result = await sendOrderNotification(currentDb, orderId, type, req.user, req.selectedWarehouse);
          results.push({ orderId, ...result });
        } catch (error: any) {
          results.push({ orderId, success: false, error: error.message, emailStatus: 'failed' });
        }
        // Add a small delay between sends to avoid rate limits
        await new Promise(resolve => setTimeout(resolve, 500));
      }

      return res.json({ success: true, message: `${results.filter(r => r.emailStatus === 'sent').length} notifications sent, ${results.filter(r => r.emailStatus === 'skipped').length} skipped, ${results.filter(r => r.emailStatus === 'failed').length} failed`, results });
    } catch (error: any) {
      const stack = error.stack || error;
      console.log("🔥 [SERVER ERROR] bulk-send-notification:");
      console.trace(error);
      writeDebugLog(`ERROR bulk-send-notification: ${stack}`);
      return res.status(500).json({ success: false, error: error.message, stack: stack });
    }
  });

  // Create Order Endpoint
  app.post("/api/orders/create", authenticate, async (req: any, res) => {
    console.log("🚀 [API Request]: POST /api/orders/create");
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      console.log("📦 [Incoming Order Data]:", JSON.stringify(req.body, null, 2));
      const { 
        bookingNumber, 
        refNumber, 
        customerName, 
        customerEmail, 
        customerId, 
        storeId, 
        warehouseId, 
        pickupDateScheduled, 
        notes, 
        items, 
        paymentStatus, 
        paymentMethod,
        notificationRecipients 
      } = req.body;

      if (!bookingNumber || typeof bookingNumber !== 'string' || !customerName || !warehouseId) {
        return res.status(400).json({ success: false, error: "Missing required fields or invalid Booking Number." });
      }

      // Check for global uniqueness of bookingNumber
      let bookingDoc;
      console.log("👉 Checking BookingNumber:", `|${bookingNumber}|`);
      try {
        bookingDoc = await currentDb.collection("orders").doc(bookingNumber).get();
      } catch (fsError: any) {
        console.error("🔥 Firestore Read Error:", fsError);
        throw fsError;
      }

      if (bookingDoc.exists) {
        const existingOrder = bookingDoc.data();
        const existingWarehouse = existingOrder?.warehouseId || 'another warehouse';
        return res.status(409).json({ 
          success: false, 
          error: `Booking Number [${bookingNumber}] already exists in ${existingWarehouse}.` 
        });
      }

      // Check for global uniqueness of refNumber if provided
      if (refNumber) {
        const refQuery = await currentDb.collection("orders").where("refNumber", "==", refNumber).limit(1).get();
        if (!refQuery.empty) {
          const existingOrder = refQuery.docs[0].data();
          const existingWarehouse = existingOrder?.warehouseId || 'another warehouse';
          return res.status(409).json({ 
            success: false, 
            error: `Customer Reference [${refNumber}] already exists in ${existingWarehouse}.` 
          });
        }
      }

      const orderData = {
        bookingNumber,
        refNumber: refNumber || null,
        customerName,
        customerEmail: customerEmail || null,
        customerId: customerId || null,
        storeId: storeId || null,
        warehouseId,
        pickupDateScheduled: pickupDateScheduled || null,
        notes: notes || null,
        createdBy: req.user.name || req.user.username,
        creatorEmail: req.user.username,
        creatorUid: req.user.uid,
        createdTime: new Date().toISOString(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        items: items || [],
        paymentStatus,
        paymentMethod: paymentMethod || "Not Specified",
        paymentTime: paymentStatus === 'Paid' ? new Date().toISOString() : null,
        paymentBy: paymentStatus === 'Paid' ? (req.user.name || req.user.username) : null,
        status: 'Created',
        notificationRecipients: notificationRecipients || []
      };

      await currentDb.collection("orders").doc(bookingNumber).set(orderData);

      // Log the action
      try {
        await currentDb.collection("logs").add({
          timestamp: new Date().toISOString(),
          userId: req.user.uid,
          userName: req.user.name || req.user.username,
          action: 'Order Created',
          details: `Created order ${bookingNumber}`,
          orderId: bookingNumber
        });
      } catch (logErr) {
        console.error("Failed to log order creation:", logErr);
      }

      // Handle Notifications
      if (notificationRecipients && Array.isArray(notificationRecipients) && notificationRecipients.length > 0) {
        try {
          const uids = new Set<string>();
          const groupIds: string[] = [];
          const individualUids: string[] = [];

          notificationRecipients.forEach((id: string) => {
            if (id.startsWith('group:')) {
              groupIds.push(id.replace('group:', ''));
            } else {
              individualUids.push(id);
            }
          });

          individualUids.forEach(uid => uids.add(uid));

          if (groupIds.length > 0) {
            const groupsSnap = await currentDb.collection("userGroups").get();
            groupsSnap.docs.forEach(doc => {
              if (groupIds.includes(doc.id)) {
                const groupData = doc.data();
                (groupData.userIds || []).forEach((uid: string) => uids.add(uid));
              }
            });
          }

          const resolvedUids = Array.from(uids);
          const notificationPromises = resolvedUids.map(uid => {
            return currentDb.collection("notifications").add({
              recipientUid: uid,
              title: 'New Order Created',
              body: `Order ${bookingNumber} has been created.`,
              type: 'New Order',
              orderId: bookingNumber,
              isRead: false,
              createdAt: new Date().toISOString()
            });
          });
          await Promise.all(notificationPromises);
        } catch (notifErr) {
          console.error("Failed to create notifications:", notifErr);
        }
      }

      console.log(`Order ${bookingNumber} created by ${req.user.username}`);

      return res.json({ 
        success: true, 
        orderId: bookingNumber,
        id: bookingNumber,
        bookingNumber: bookingNumber
      });
    } catch (error: any) {
      console.log("❌ [Firestore Write Error Detail]:", error); 
      if (error.stack) console.log("📜 [Error Stack]:", error.stack);
      return res.status(500).json({ 
        success: false, 
        error: error.message,
        code: error.code,
        stack: error.stack
      });
    }
  });

  // Update Order Endpoint
  app.post("/api/orders/update", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orderId, updateData } = req.body;
      if (!orderId || !updateData) {
        return res.status(400).json({ success: false, error: "Missing orderId or updateData" });
      }

      const orderRef = currentDb.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      
      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const order = orderDoc.data();
      const isSuper = SUPER_ADMINS.includes(req.user.username.toLowerCase());
      const allowedWarehouses = req.user.allowedWarehouses || [];

      // Data Isolation Check
      if (!isSuper) {
        if (!allowedWarehouses.includes('*') && !allowedWarehouses.includes(order?.warehouseId)) {
          return res.status(403).json({ success: false, error: "Forbidden: Access denied to this warehouse" });
        }
      }

      await orderRef.update({
        ...updateData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedBy: req.user.username
      });

      // Log the action
      try {
        await currentDb.collection("logs").add({
          timestamp: new Date().toISOString(),
          userId: req.user.uid,
          userName: req.user.name || req.user.username,
          action: 'Order Updated',
          details: `Updated order ${orderId}`,
          orderId: orderId
        });
      } catch (logErr) {
        console.error("Failed to log order update:", logErr);
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Order Update Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Delete Order Endpoint
  app.post("/api/orders/delete", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orderId } = req.body;
      if (!orderId) {
        return res.status(400).json({ success: false, error: "Missing orderId" });
      }

      const orderRef = currentDb.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      
      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const order = orderDoc.data();
      const isSuper = SUPER_ADMINS.includes(req.user.username.toLowerCase());
      const allowedWarehouses = req.user.allowedWarehouses || [];

      // Data Isolation Check
      if (!isSuper) {
        if (!allowedWarehouses.includes('*') && !allowedWarehouses.includes(order?.warehouseId)) {
          return res.status(403).json({ success: false, error: "Forbidden: Access denied to this warehouse" });
        }
        // Only Admins can delete orders (or check permissions)
        if (req.user.role !== 'Admin' && !(req.user.permissions || []).includes('Cancel Orders')) {
           return res.status(403).json({ success: false, error: "Forbidden: Insufficient permissions to delete order" });
        }
      }

      await orderRef.delete();

      // Log the action
      try {
        await currentDb.collection("logs").add({
          timestamp: new Date().toISOString(),
          userId: req.user.uid,
          userName: req.user.name || req.user.username,
          action: 'Order Deleted',
          details: `Deleted order ${orderId}`,
          orderId: orderId
        });
      } catch (logErr) {
        console.error("Failed to log order deletion:", logErr);
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Order Deletion Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  /**
   * 🚀 V2 批量更新订单状态
   * 解决前端直接写库权限不足的问题
   */
  app.post("/api/v2/orders/bulk-update-status", authenticate, async (req: any, res) => {
    const { orderIds, status } = req.body;
    const currentDb = await initDb();

    if (!orderIds || !Array.isArray(orderIds) || !status) {
      return res.status(400).json({ success: false, error: "Missing orderIds or status" });
    }

    if (!currentDb) return res.status(503).json({ error: "Database Offline" });

    try {
      const batch = currentDb.batch();
      const timestamp = new Date().toISOString();

      for (const id of orderIds) {
        const orderRef = currentDb.collection("orders").doc(id);
        batch.update(orderRef, {
          status: status,
          updatedAt: timestamp,
          updatedBy: req.user.username // 这里的 req.user 来自我们的 jwt.verify
        });

        // 同时写入操作日志 (复用你之前的 logAction 逻辑)
        const logRef = currentDb.collection("logs").doc();
        batch.set(logRef, {
          timestamp,
          userId: req.user.uid,
          userName: req.user.name || req.user.username,
          action: 'Bulk Status Update',
          details: `Set status to ${status} for order ${id}`,
          orderId: id
        });
      }

      await batch.commit();
      console.log(`✅ [V2 Update] ${orderIds.length} orders updated to ${status} by ${req.user.username}`);
      
      res.json({ success: true, message: `Successfully updated ${orderIds.length} orders` });
    } catch (error: any) {
      console.error("🔥 [V2 Update Error]:", error.message);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Confirm Pickup Endpoint
  app.post("/api/orders/confirm-pickup", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orderId, signatureData } = req.body;
      if (!orderId || !signatureData) {
        return res.status(400).json({ success: false, error: "Missing orderId or signatureData" });
      }

      const orderRef = currentDb.collection("orders").doc(orderId);
      const orderDoc = await orderRef.get();
      
      if (!orderDoc.exists) {
        return res.status(404).json({ success: false, error: "Order not found" });
      }

      const order = orderDoc.data();
      const isSuper = SUPER_ADMINS.includes(req.user.username.toLowerCase());
      const allowedWarehouses = req.user.allowedWarehouses || [];

      // Data Isolation Check
      if (!isSuper) {
        if (!allowedWarehouses.includes('*') && !allowedWarehouses.includes(order?.warehouseId)) {
          return res.status(403).json({ success: false, error: "Forbidden: Access denied to this warehouse" });
        }
      }

      await orderRef.update({
        status: 'Picked Up',
        actualPickupTime: new Date().toISOString(),
        pickedUpBy: req.user.name || req.user.username,
        customerSignature: signatureData,
        updatedAt: new Date().toISOString(),
        updatedBy: req.user.username
      });

      // Log the action
      try {
        await currentDb.collection("logs").add({
          timestamp: new Date().toISOString(),
          userId: req.user.uid,
          userName: req.user.name || req.user.username,
          action: 'Confirm Pickup',
          details: `Confirmed pickup for order ${orderId}`,
          orderId: orderId
        });
      } catch (logErr) {
        console.error("Failed to log pickup confirmation:", logErr);
      }

      return res.json({ success: true });
    } catch (error: any) {
      console.error("Pickup Confirmation Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Bulk Order Creation
  app.post("/api/orders/bulk-create", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { orders } = req.body;
      if (!Array.isArray(orders)) {
        return res.status(400).json({ error: "Invalid orders data" });
      }

      const results = {
        success: 0,
        failed: 0,
        errors: [] as string[]
      };

      const BATCH_SIZE = 50;
      for (let i = 0; i < orders.length; i += BATCH_SIZE) {
        const chunk = orders.slice(i, i + BATCH_SIZE);
        try {
          // Use Admin SDK for transaction
          await currentDb.runTransaction(async (transaction: any) => {
            const preparedOrders = chunk.map(orderData => {
              const bookingNumber = orderData.bookingNumber.trim().toUpperCase();
              const refNumber = orderData.refNumber.trim().toUpperCase();
              return {
                orderData,
                bookingNumber,
                refNumber,
                bKeyRef: currentDb.collection("unique_keys").doc(`bn_${bookingNumber}`),
                rKeyRef: currentDb.collection("unique_keys").doc(`ref_${refNumber}`),
                orderRef: currentDb.collection("orders").doc(bookingNumber)
              };
            });

            // 1. All Reads First
            const bSnaps = await Promise.all(preparedOrders.map(p => transaction.get(p.bKeyRef)));
            const rSnaps = await Promise.all(preparedOrders.map(p => transaction.get(p.rKeyRef)));

            // 2. Validation and Writes
            preparedOrders.forEach((p, index) => {
              if (bSnaps[index].exists) throw new Error(`Booking Number ${p.bookingNumber} already exists`);
              if (rSnaps[index].exists) throw new Error(`Customer Ref ${p.refNumber} already exists`);

              const finalOrderData = {
                ...p.orderData,
                bookingNumber: p.bookingNumber,
                refNumber: p.refNumber,
                createdTime: new Date().toISOString(),
                createdBy: req.user.name || 'System',
                creatorUid: req.user.uid,
                status: 'Created'
              };

              transaction.set(p.bKeyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp() });
              transaction.set(p.rKeyRef, { createdAt: admin.firestore.FieldValue.serverTimestamp() });
              transaction.set(p.orderRef, finalOrderData);
            });
          });
          results.success += chunk.length;
        } catch (err: any) {
          results.failed += chunk.length;
          results.errors.push(err.message);
        }
      }

      res.json(results);
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Store Management
  app.post("/api/stores/save", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const isAdmin = req.user.role === 'Admin' || SUPER_ADMINS.includes(req.user.username.toLowerCase());
      if (!isAdmin && !hasPermission(req.user, 'Manage Stores')) {
        return res.status(403).json({ error: "Permission denied: Admin role required" });
      }

      const storeData = req.body;
      const docId = storeData.id || storeData.storeId;
      
      await currentDb.collection('stores').doc(docId).set({
        ...storeData,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      }, { merge: true });

      await logAction(req.user, 'Store Saved', `Saved store: ${storeData.storeId}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/stores/delete", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const isAdmin = req.user.role === 'Admin' || SUPER_ADMINS.includes(req.user.username.toLowerCase());
      if (!isAdmin && !hasPermission(req.user, 'Manage Stores')) {
        return res.status(403).json({ error: "Permission denied: Admin role required" });
      }

      const { id, storeId } = req.body;
      await currentDb.collection('stores').doc(id).delete();
      await logAction(req.user, 'Store Deleted', `Deleted store: ${storeId}`);
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Groups
  app.post("/api/user-groups/save", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      if (!hasPermission(req.user, 'Manage User Groups')) {
        return res.status(403).json({ error: "Permission denied" });
      }

      const { id, ...data } = req.body;
      const updateData = {
        ...data,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      };

      if (id) {
        await currentDb.collection('userGroups').doc(id).update(updateData);
      } else {
        await currentDb.collection('userGroups').add({
          ...updateData,
          createdAt: admin.firestore.FieldValue.serverTimestamp()
        });
      }

      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  app.post("/api/user-groups/delete", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      if (!hasPermission(req.user, 'Manage User Groups')) {
        return res.status(403).json({ error: "Permission denied" });
      }

      const { id } = req.body;
      await currentDb.collection('userGroups').doc(id).delete();
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // User Settings
  app.post("/api/user/settings", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { settings } = req.body;
      await currentDb.collection('users').doc(req.user.uid).update({ 
        settings,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      await logAction(req.user, 'Update Settings', 'Updated personal settings');
      res.json({ success: true });
    } catch (error: any) {
      res.status(500).json({ error: error.message });
    }
  });

  // Socket.io Logic
  io.on("connection", (socket) => {
    console.log("A user connected:", socket.id);

    // Join a room based on Store ID or Order ID
    socket.on("join-room", (roomId) => {
      socket.join(roomId);
      console.log(`Socket ${socket.id} joined room: ${roomId}`);
    });

    // Operator requests a signature
    socket.on("request-signature", (data) => {
      // data: { orderId, storeId, customerName }
      console.log(`Signature requested for order ${data.orderId} in store ${data.storeId}`);
      io.to(data.storeId).emit("show-signature-pad", data);
    });

    // Guest submits a signature
    socket.on("submit-signature", (data) => {
      // data: { orderId, storeId, signatureData }
      console.log(`Signature submitted for order ${data.orderId}`);
      io.to(data.storeId).emit("signature-received", data);
    });

    // Cancel signature request
    socket.on("cancel-signature", (storeId) => {
      io.to(storeId).emit("reset-guest-display");
    });

    // Presence checks
    socket.on("check-guest-presence", (roomId) => {
      // Forward the check to the room
      socket.to(roomId).emit("check-guest-presence", { from: socket.id, roomId });
    });

    socket.on("guest-online", (roomId) => {
      // Broadcast that a guest is online in this room
      io.to(roomId).emit("guest-online");
    });

    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
    });
  });

  // Unsubscribe endpoint
  app.get("/api/unsubscribe", async (req, res) => {
    const { email, orderId } = req.query;
    console.log(`Unsubscribe request received for email: ${email}, orderId: ${orderId}`);
    
    // In a real app, we would mark this email as unsubscribed in a database
    // For now, we'll just show a confirmation page
    res.send(`
      <html>
        <head>
          <title>Unsubscribed</title>
          <style>
            body { font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; margin: 0; background: #f8fafc; }
            .card { background: white; padding: 2rem; border-radius: 1rem; box-shadow: 0 4px 6px -1px rgb(0 0 0 / 0.1); text-align: center; max-width: 400px; }
            h1 { color: #1e293b; margin-bottom: 1rem; }
            p { color: #64748b; line-height: 1.5; }
          </style>
        </head>
        <body>
          <div class="card">
            <h1>Unsubscribed</h1>
            <p>You have been successfully unsubscribed from pickup notifications for order <strong>${orderId}</strong>.</p>
            <p>If this was a mistake, please contact our support team.</p>
          </div>
        </body>
      </html>
    `);
  });

  app.get("/api/debug/last-error", async (req, res) => {
    const logPath = path.join(process.cwd(), "debug.log");
    if (fs.existsSync(logPath)) {
      const content = fs.readFileSync(logPath, "utf8");
      res.header("Content-Type", "text/plain");
      res.send(content);
    } else {
      res.send("No logs found yet. Try triggering the error first.");
    }
  });

  app.get("/api/debug/firebase", async (req, res) => {
    const currentDb = await initDb();
    res.json({
      initialized: !!currentDb,
      lastError: lastInitError,
      apps: admin.apps.length,
      projectId: admin.app().options.projectId || "ambient",
      databaseId: currentDb ? (currentDb as any)._databaseId : "unknown",
      env: process.env.NODE_ENV,
      hasConfig: fs.existsSync(path.join(process.cwd(), "firebase-applet-config.json"))
    });
  });

  // Initial attempt - don't block startup if it fails
  initDb().then(currentDb => {
    if (currentDb) {
      setupNotificationListener(currentDb);
    }
  }).catch(err => console.error("Initial DB init failed:", err));

  let retryCount = 0;
  const MAX_RETRIES = 10;
  let unsubscribeNotifications: (() => void) | null = null;

  async function setupNotificationListener(currentDb: admin.firestore.Firestore) {
    if (unsubscribeNotifications) {
      unsubscribeNotifications();
      unsubscribeNotifications = null;
    }
    console.log("Setting up Firestore notification listener...");
    const startTime = new Date().toISOString();
    
    try {
      // Check if collection exists by doing a small get first
      // This can help diagnose permission issues early
      await currentDb.collection("notifications").limit(1).get();

      unsubscribeNotifications = currentDb.collection("notifications")
        .where("isRead", "==", false)
        .onSnapshot(async (snapshot) => {
          console.log(`Notification snapshot received: ${snapshot.size} unread notifications`);
          retryCount = 0; // Reset retry count on successful snapshot
          for (const change of snapshot.docChanges()) {
            if (change.type === "added") {
              const notification = change.doc.data();
              // Only process notifications created after the server started to avoid duplicates
              if (notification.createdAt >= startTime) {
                console.log(`Processing new notification: ${change.doc.id}`);
                await sendPushNotification(currentDb, notification);
              }
            }
          }
        }, (error) => {
          console.error("Notification listener error:", error);
          
          // If permission error, log more details
          if (error.message.includes("Missing or insufficient permissions")) {
            console.error("CRITICAL PERMISSION ERROR: The server service account may lack access to the 'notifications' collection.");
            console.error("Check Firestore rules and ensure the collection exists.");
          }

          if (retryCount < MAX_RETRIES) {
            retryCount++;
            const delay = Math.min(1000 * Math.pow(2, retryCount), 60000); // Exponential backoff
            console.log(`Retrying notification listener in ${delay}ms (Attempt ${retryCount}/${MAX_RETRIES})...`);
            setTimeout(() => setupNotificationListener(currentDb), delay);
          } else {
            console.error("MAX_RETRIES reached for notification listener. Stopping retries.");
          }
        });
    } catch (err: any) {
      console.error("Failed to setup notification listener:", err);
      if (err.message.includes("Missing or insufficient permissions")) {
        console.error("Initial permission check failed for 'notifications' collection.");
      }
    }
  }

  async function sendPushNotification(currentDb: admin.firestore.Firestore, notification: any) {
    const { recipientUid, title, body } = notification;
    if (!recipientUid) return;

    try {
      // Get recipient's FCM token
      const userDoc = await currentDb.collection("users").doc(recipientUid).get();
      const userData = userDoc.data();
      const fcmToken = userData?.fcmToken;

      if (fcmToken) {
        const message = {
          notification: {
            title: title || "New Notification",
            body: body || ""
          },
          token: fcmToken,
          webpush: {
            fcmOptions: {
              link: notification.orderId ? `/orders/${notification.orderId}` : "/"
            }
          }
        };

        await admin.messaging().send(message);
        console.log(`Push notification sent to user ${recipientUid}`);
      }
    } catch (error) {
      console.error(`Error sending push notification to user ${recipientUid}:`, error);
    }
  }

  console.log(`ECPP API Key status: ${process.env.ECPP_API_KEY ? "Configured" : "Not Configured"}`);

  // ECPP Push API
  // Accepts: { sku: string, location?: string } OR [{ sku: string, location?: string }, ...]
  // Header: Authorization: <API_KEY>
  app.post("/api/ecpp/push", async (req, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }
    
    const authHeader = req.headers.authorization;
    const apiKey = (process.env.ECPP_API_KEY || process.env.EXTERNAL_API_KEY || "").trim();

    if (!apiKey) {
      return res.status(500).json({ success: false, error: "Server Configuration Error: API Key is not set." });
    }

    const cleanHeader = authHeader ? authHeader.replace("Bearer ", "").trim() : "";
    if (cleanHeader !== apiKey) {
      return res.status(401).json({ success: false, error: "Unauthorized: API Key mismatch." });
    }

    const items = Array.isArray(req.body) ? req.body : [req.body];
    if (items.length === 0) {
      return res.status(400).json({ success: false, error: "Request body is empty" });
    }

    try {
      const skusRef = currentDb.collection("skus");
      const results = {
        received: items.length,
        memoryDuplicates: 0,
        unmodifiedSkipped: 0,
        actuallyProcessed: 0,
        errors: [] as string[]
      };

      // ==========================================
      // 第一重防御：内存去重 (零成本，极速)
      // 应对 ECPP 推送包内部自身的重复数据
      // ==========================================
      const uniqueItemsMap = new Map();
      
      for (const item of items) {
        const rawSku = item.sku || item.SKU;
        if (!rawSku) {
          results.errors.push("Missing SKU for an item");
          continue;
        }
        
        const skuUpper = rawSku.toString().trim().toUpperCase();
        // 如果 payload 里有同一个 SKU 的多条记录，保留最后一条
        if (uniqueItemsMap.has(skuUpper)) {
          results.memoryDuplicates++;
        }
        uniqueItemsMap.set(skuUpper, item);
      }

      const uniqueItems = Array.from(uniqueItemsMap.values());
      const CHUNK_SIZE = 450; // 安全低于 Firestore 500 的限制
      
      // ==========================================
      // 第二重防御：分批处理与数据库严格比对拦截
      // ==========================================
      for (let i = 0; i < uniqueItems.length; i += CHUNK_SIZE) {
        const chunk = uniqueItems.slice(i, i + CHUNK_SIZE);
        const batch = currentDb.batch();
        
        // 1. 构建这一批要查询的文档引用
        const docRefs = chunk.map(item => {
          const skuUpper = (item.sku || item.SKU).toString().trim().toUpperCase();
          const safeDocId = skuUpper.replace(/\//g, '_');
          return skusRef.doc(safeDocId);
        });

        // 2. 批量读取现有数据 (用便宜的 Read 换昂贵的 Write)
        const existingDocs = await currentDb.getAll(...docRefs);

        let updatesInThisBatch = 0;

        for (let j = 0; j < chunk.length; j++) {
          const item = chunk[j];
          
          // 1. 获取推过来的原始数据
          const skuUpper = (item.sku || item.SKU).toString().trim().toUpperCase();
          const safeDocId = skuUpper.replace(/\//g, '_');
          const rawName = (item.productName || item.productname || item.product_name || item.name || "").toString().trim();
          const rawLocation = (item.location || item.Location || "").toString().trim().toUpperCase();

          const currentSnap = existingDocs[j];
          let finalName, finalLocation;
          let needsUpdate = false;

          // 2. 🧠 核心大脑：判断是老数据合并，还是新数据创建
          if (currentSnap.exists) {
            // 【情况 A：老数据存在】
            const dbData = currentSnap.data() || {};
            const dbName = (dbData.productName || "").toString().trim();
            const dbLocation = (dbData.location || "").toString().trim().toUpperCase();

            // 规则：有新值用新值，没新值保老值（绝不触发 Fallback 破坏数据）
            finalName = rawName !== "" ? rawName : dbName;
            finalLocation = rawLocation !== "" ? rawLocation : dbLocation;

            // 对比是否真的发生改变
            if (finalName !== dbName || finalLocation !== dbLocation) {
              needsUpdate = true;
            }
          } else {
            // 【情况 B：完全陌生的新 SKU】
            // 规则：触发 Fallback 自动填充
            finalName = rawName !== "" ? rawName : skuUpper;
            finalLocation = rawLocation !== "" ? rawLocation : "N/A";
            needsUpdate = true; // 新数据必须写入
          }

          // 3. 🛡️ 拦截器执行
          if (!needsUpdate) {
            results.unmodifiedSkipped++;
            continue; // 数据没实质变化，完美拦截！
          }

          // 4. 组装最终安全的数据并写入
          const updateData: any = { 
            sku: skuUpper, // 存入原始 SKU (带斜杠)
            productName: finalName,
            location: finalLocation,
            updatedAt: new Date().toISOString()
          };
          
          batch.set(docRefs[j], updateData, { merge: true });
          updatesInThisBatch++;
          results.actuallyProcessed++;
        }
        
        // 只有当 Batch 里有真实需要更新的数据时才提交
        if (updatesInThisBatch > 0) {
          await batch.commit();
        }
      }

      console.log(`SKU Push Success: Received ${results.received}, Memory Deduped: ${results.memoryDuplicates}, Skipped (Unchanged): ${results.unmodifiedSkipped}, Written: ${results.actuallyProcessed}`);

      return res.json({ 
        success: true, 
        message: `Processed. Skipped ${results.unmodifiedSkipped} unchanged items to save database quotas.`,
        details: results
      });
    } catch (error: any) {
      console.error("ECPP Push Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // ECPP Sync API Placeholder (Original)
  app.post("/api/ecpp/sync", async (req, res) => {
    const authHeader = req.headers.authorization;
    const apiKey = process.env.ECPP_API_KEY;

    if (!apiKey) {
      return res.status(500).json({ 
        success: false, 
        error: "Server Configuration Error: ECPP_API_KEY is not set." 
      });
    }

    if (authHeader !== apiKey && authHeader !== `Bearer ${apiKey}`) {
      return res.status(401).json({ 
        success: false, 
        error: "Unauthorized: Invalid or missing API Key" 
      });
    }

    try {
      console.log("Starting ECPP Sync...");
      // This could trigger a full sync if needed
      res.json({ 
        success: true, 
        message: "ECPP Sync completed successfully",
        timestamp: new Date().toISOString(),
        itemsSynced: 0
      });
    } catch (error: any) {
      console.error("ECPP Sync Error:", error);
      res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin: Update User Password
  app.post("/api/admin/update-password", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      // Check if caller is admin
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admin access required" });
      }

      const { targetUid, newPassword } = req.body;
      if (!targetUid || !newPassword) {
        return res.status(400).json({ success: false, error: "Missing targetUid or newPassword" });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({ success: false, error: "Password must be at least 6 characters" });
      }

      // Hash the new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update the password in Firestore
      await currentDb.collection("users").doc(targetUid).update({
        password: hashedPassword,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });
      
      console.log(`Admin ${req.user.uid} updated password for user ${targetUid}`);
      
      return res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.error("Admin Password Update Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Admin: Create User
  app.post("/api/admin/create-user", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      // Check if caller is admin
      if (req.user.role !== 'Admin') {
        return res.status(403).json({ success: false, error: "Forbidden: Admin access required" });
      }

      const { username, password, name, roleTemplate, permissions, allowedWarehouses } = req.body;
      
      if (!username || !password || !name) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      // Check if user already exists
      const userSnap = await currentDb.collection("users").where("username", "==", username).limit(1).get();
      if (!userSnap.empty) {
        return res.status(400).json({ success: false, error: "Username already exists" });
      }

      // Hash password
      const hashedPassword = await bcrypt.hash(password, 10);

      // Create user in Firestore
      const newUserRef = currentDb.collection("users").doc();
      const newUser = {
        uid: newUserRef.id,
        username,
        password: hashedPassword,
        name,
        roleTemplate: roleTemplate || 'Sales',
        permissions: permissions || [],
        allowedWarehouses: allowedWarehouses || [],
        status: 'Active',
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        settings: {
          notificationsEnabled: true,
          emailNotifications: true,
          theme: 'light'
        }
      };

      await newUserRef.set(newUser);
      
      console.log(`Admin ${req.user.uid} created user ${username}`);
      
      return res.json({ success: true, message: "User created successfully", uid: newUserRef.id });
    } catch (error: any) {
      console.error("Admin Create User Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // User: Update Own Password
  app.post("/api/user/update-password", authenticate, async (req: any, res) => {
    const currentDb = await initDb();
    if (!currentDb) {
      return res.status(503).json({ success: false, error: "Database not initialized" });
    }

    try {
      const { currentPassword, newPassword } = req.body;
      const uid = req.user.uid;

      if (!currentPassword || !newPassword) {
        return res.status(400).json({ success: false, error: "Missing required fields" });
      }

      // Get user from Firestore
      const userDoc = await currentDb.collection("users").doc(uid).get();
      if (!userDoc.exists) {
        return res.status(404).json({ success: false, error: "User not found" });
      }

      const userData = userDoc.data();
      
      // Verify current password
      const isMatch = await bcrypt.compare(currentPassword, userData.password);
      if (!isMatch) {
        return res.status(401).json({ success: false, error: "Current password is incorrect" });
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update password in Firestore
      await currentDb.collection("users").doc(uid).update({
        password: hashedPassword,
        updatedAt: admin.firestore.FieldValue.serverTimestamp()
      });

      console.log(`User ${uid} updated their own password`);
      
      return res.json({ success: true, message: "Password updated successfully" });
    } catch (error: any) {
      console.error("User Password Update Error:", error);
      return res.status(500).json({ success: false, error: error.message });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    
    // Ensure service-worker.js and index.html are never cached
    const noCacheHeaders = (res: any) => {
      res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.setHeader('Pragma', 'no-cache');
      res.setHeader('Expires', '0');
    };

    app.get('/service-worker.js', (req, res, next) => {
      noCacheHeaders(res);
      next();
    });

    app.use(express.static(distPath, {
      setHeaders: (res, path) => {
        if (path.endsWith('.html')) {
          noCacheHeaders(res);
        }
      }
    }));

    // Ensure static assets return 404 if not found, instead of falling back to index.html
    app.get(/\.(js|css|png|jpg|jpeg|gif|ico|svg|woff|woff2|json|txt|map)$/, (req, res) => {
      res.status(404).send('Not Found');
    });

    app.get('*', (req, res) => {
      noCacheHeaders(res);
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // 全局错误处理中间件 - 捕捉所有未处理的异常
  app.use((err: any, req: any, res: any, next: any) => {
    console.log("🔥 [Global Server Error]:", err);
    const stack = err.stack || "No stack trace available";
    console.error(stack);
    res.status(500).json({ 
      success: false, 
      error: err.message || "Internal Server Error",
      stack: stack 
    });
  });

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
