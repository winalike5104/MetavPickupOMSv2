import { initializeApp } from 'firebase/app';
import { 
  initializeFirestore, 
  enableIndexedDbPersistence,
  doc,
  getDocFromServer
} from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getMessaging, isSupported } from 'firebase/messaging';
import firebaseConfig from '../firebase-applet-config.json';

// 1. 初始化 App
const app = initializeApp(firebaseConfig);

// 2. 初始化 Firestore
// 保持长轮询，这对 AI Studio 的代理环境非常重要
export const db = initializeFirestore(app, {
  experimentalForceLongPolling: true,
}); 

// 3. 离线持久化 (仅限浏览器环境)
if (typeof window !== 'undefined') {
  enableIndexedDbPersistence(db).catch((err) => {
    if (err.code === 'failed-precondition') {
      console.warn("⚠️ 多标签页打开，仅第一个标签页开启持久化");
    } else if (err.code === 'unimplemented') {
      console.warn("⚠️ 当前浏览器不支持持久化");
    }
  });
}

export const storage = getStorage(app);

// 4. Messaging 消息通知
export let messaging: any = null;
isSupported().then(supported => {
  if (supported && typeof window !== 'undefined') {
    messaging = getMessaging(app);
  }
}).catch(err => console.error("Messaging support check failed:", err));

/**
 * 🚀 纯净版连接测试
 * 不再尝试写入，只做简单的读取探活
 */
const checkFirebaseStatus = async () => {
  try {
    // 仅在浏览器开发环境下运行
    if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
      await getDocFromServer(doc(db, '_connection_test_', 'ping'));
      console.log("✅ [Firebase] Connection Stable.");
    }
  } catch (e) {
    // 即使报错（比如文档不存在）只要不是权限错误，就说明通了
    console.log("ℹ️ [Firebase] Service initialized.");
  }
};

checkFirebaseStatus();