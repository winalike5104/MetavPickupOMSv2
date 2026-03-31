import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import { Response, NextFunction } from 'express';
import { SUPER_ADMINS, isSuperAdmin } from './auth-shared';

const JWT_SECRET = process.env.JWT_SECRET || 'aca-pickup-secret-key-2026';

/**
 * Generates a JWT token valid for 30 days.
 */
export const generateToken = (payload: any) => {
  if (!JWT_SECRET) {
    throw new Error("Internal Server Error: Auth configuration missing");
  }
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '30d' });
};

/**
 * Middleware to authenticate JWT and parse user info.
 */
import { writeLog } from './logger';

// ... (existing code)

export const authenticate = (req: any, res: Response, next: NextFunction) => {
  // 1. OPTIONS 预检请求直接放行
  if (req.method === 'OPTIONS') {
    return next();
  }

  // 2. 尝试从多个可能的 Key 中读取（防止网关改名或大小写问题）
  const authHeader = 
    req.headers['x-v2-auth-token'] as string ||
    req.headers['authorization'] as string;

  // 🔍 [核心调试] 在服务器终端打印出收到的所有 Header
  if (!authHeader) {
    const receivedKeys = Object.keys(req.headers);
    console.error(`🔥 [AUTH FAIL] No token found in headers for ${req.method} ${req.path}!`);
    console.log("🔍 Received Headers:", JSON.stringify(req.headers, null, 2));
    writeLog('WARN', `Missing token for ${req.method} ${req.path}`, { headers: req.headers });
    
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Missing token',
      debug: {
        received_keys: receivedKeys,
        msg: "I looked for 'x-v2-auth-token' and 'authorization' but they are not here."
      }
    });
  }

  // 3. 剥离 Bearer 前缀
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : authHeader;
  
  // 4. 检查剥离后是否为空
  if (!token || token === 'null' || token === 'undefined') {
    writeLog('WARN', 'Invalid token format', { token });
    return res.status(401).json({ 
      success: false, 
      error: 'Unauthorized: Invalid token format',
      received_headers: Object.keys(req.headers)
    });
  }

  try {
    // 5. 使用 JWT 校验
    const decoded = jwt.verify(token, JWT_SECRET) as any;
    req.user = decoded;
    
    // Extract and validate warehouse if provided
    const warehouseId = req.headers['x-warehouse-id'];
    if (warehouseId) {
      const isSuper = SUPER_ADMINS.includes(decoded.username.toLowerCase());
      if (!isSuper && !decoded.allowedWarehouses.includes(warehouseId)) {
        writeLog('WARN', `User ${decoded.username} denied access to warehouse ${warehouseId}`);
        return res.status(403).json({ success: false, error: 'Forbidden: You do not have access to this warehouse' });
      }
      req.selectedWarehouse = warehouseId;
    }
    
    next();
  } catch (err: any) {
    console.error(`🔥 [JWT ERROR] for ${req.method} ${req.path}:`, err.message);
    writeLog('ERROR', 'JWT Verify Error', { message: err.message, token: token.substring(0, 10) + '...' });
    return res.status(403).json({ 
      success: false, 
      error: `Forbidden: ${err.message}`
    });
  }
};

/**
 * Login logic: validates username/password using Admin SDK.
 * @param db - The firebase-admin firestore instance
 */
export const loginUser = async (db: any, { username, password }: any) => {
  // Admin SDK uses .doc() and .get()
  const userRef = db.collection('users').doc(username);
  const userDoc = await userRef.get();
  
  if (!userDoc.exists) {
    // Fallback to query if document ID is not the username
    const userQuery = await db.collection('users').where('username', '==', username).limit(1).get();
    
    if (userQuery.empty) {
      throw new Error('Invalid username or password');
    }
    
    const foundDoc = userQuery.docs[0];
    const foundData = foundDoc.data();
    console.log('Fetched User Data (via query):', foundData);
    return processUserLogin(foundDoc, foundData, password);
  }

  const userData = userDoc.data();
  console.log('Fetched User Data (via doc ID):', userData);
  return processUserLogin(userDoc, userData, password);
};

const processUserLogin = async (userDoc: any, userData: any, password: any) => {
  if (userData.status === 'Disabled') {
    throw new Error('Account disabled');
  }

  if (!userData.password) {
    console.error(`User ${userData.username || userDoc.id} found but has no password field in database.`);
    throw new Error('Invalid user configuration: No password found in database');
  }

  const isPasswordValid = await bcrypt.compare(password, userData.password);
  if (!isPasswordValid) {
    throw new Error('Invalid username or password');
  }

  const isSuper = isSuperAdmin(userData.username || userDoc.id);
  const role = isSuper ? 'Admin' : (userData.roleTemplate || 'User');

  const payload = {
    uid: userDoc.id,
    username: userData.username || userDoc.id,
    name: userData.name || userData.username || userDoc.id,
    role: role,
    permissions: userData.permissions || [],
    allowedWarehouses: isSuper ? ['*'] : (userData.allowedWarehouses || [])
  };

  const token = generateToken(payload);

  return {
    token,
    user: payload
  };
};
