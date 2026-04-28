import { useEffect, useRef, useState } from 'react';
import { collection, query, where, onSnapshot, doc } from 'firebase/firestore';
import { db } from '../firebase';
import { useAuth } from '../components/AuthProvider';
import { useNavigate } from 'react-router-dom';
import { CN_API_ONLY } from '../constants';

// Sound URL - using a more distinctive and professional digital chime
const NOTIFICATION_SOUND_URL = 'https://assets.mixkit.co/active_storage/sfx/2358/2358-preview.mp3';

export const usePickingNotifications = () => {
  const { user, profile, activeWarehouse } = useAuth();
  const [isInitialized, setIsInitialized] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const knownOrderIds = useRef(new Set<string>());
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const navigate = useNavigate();

  // Check for picking permission
  const hasPickingPermission = profile?.permissions?.includes('view_picking_queue') || 
                               profile?.roleTemplate === 'Admin' || 
                               profile?.roleTemplate === 'Warehouse';

  // Initialize Audio
  useEffect(() => {
    audioRef.current = new Audio(NOTIFICATION_SOUND_URL);
    audioRef.current.load();
  }, []);

  const enableAudio = () => {
    if (audioRef.current) {
      // Play a short silent buffer or the actual sound to unlock
      audioRef.current.muted = true;
      audioRef.current.play().then(() => {
        audioRef.current?.pause();
        if (audioRef.current) {
          audioRef.current.muted = false;
          audioRef.current.currentTime = 0;
        }
        setAudioEnabled(true);
        console.log('🔊 Audio notifications enabled (iOS Optimized)');
      }).catch(err => {
        console.error('❌ Failed to enable audio:', err);
      });
    }
  };

  const triggerNotification = (orderData: any, orderId: string) => {
    // 1. Multi-tab deduplication using localStorage
    const storageKey = `notified_order_${orderId}`;
    const lastNotified = localStorage.getItem(storageKey);
    const now = Date.now();

    // If notified in the last 5 minutes, skip
    if (lastNotified && now - parseInt(lastNotified) < 300000) {
      return;
    }
    localStorage.setItem(storageKey, now.toString());

    // 2. Audio & Vibration Feedback
    if (audioEnabled && audioRef.current) {
      // For iOS, we ensure the audio is reset and played
      audioRef.current.currentTime = 0;
      audioRef.current.play().catch(e => console.warn('Audio play blocked:', e));
    }
    
    // Vibrate on supported devices (Note: iOS Safari does not support navigator.vibrate)
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      navigator.vibrate([200, 100, 200]);
    }

    // 3. System Notification
    if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
      const notification = new window.Notification('New Picking Task', {
        body: `Order ${orderData.bookingNumber} is ready for picking.`,
        icon: '/pwa-192x192.png',
        tag: orderId,
        requireInteraction: true,
      });

      notification.onclick = () => {
        window.focus();
        navigate(`/orders/${orderId}`);
        notification.close();
      };
    }
  };

  useEffect(() => {
    if (CN_API_ONLY) return;
    // Kill switch: if no user, no warehouse, or permission revoked, stop everything
    if (!user || !activeWarehouse || !hasPickingPermission) {
      setIsInitialized(false);
      knownOrderIds.current.clear();
      return;
    }

    console.log('📡 Starting picking queue listener for warehouse:', activeWarehouse);

    const q = query(
      collection(db, 'orders'),
      where('warehouseId', '==', activeWarehouse),
      where('warehouseStatus', '==', 'Pending')
    );

    const unsubscribe = onSnapshot(q, (snapshot) => {
      // Handle initial load
      if (!isInitialized) {
        snapshot.docs.forEach(doc => {
          knownOrderIds.current.add(doc.id);
        });
        setIsInitialized(true);
        console.log(`📦 Initial queue loaded: ${snapshot.size} orders`);
        return;
      }

      // Handle real-time changes
      snapshot.docChanges().forEach(change => {
        const orderId = change.doc.id;
        const orderData = change.doc.data();

        if (change.type === 'added') {
          if (!knownOrderIds.current.has(orderId)) {
            console.log('🔔 New order detected in picking queue:', orderData.bookingNumber);
            triggerNotification(orderData, orderId);
            knownOrderIds.current.add(orderId);
          }
        } else if (change.type === 'removed') {
          knownOrderIds.current.delete(orderId);
        }
      });
    }, (error) => {
      console.error('❌ Picking listener error:', error);
      // If permission error, it might be due to a revoked permission
      if (error.message.includes('permission-denied')) {
        console.warn('⚠️ Permission denied for picking queue. Stopping listener.');
      }
    });

    return () => {
      console.log('🛑 Stopping picking queue listener');
      unsubscribe();
    };
  }, [user?.uid, activeWarehouse, hasPickingPermission, isInitialized]);

  return {
    audioEnabled,
    enableAudio,
    hasPickingPermission,
    requestPermission: () => {
      if (typeof window !== 'undefined' && 'Notification' in window) {
        return window.Notification.requestPermission();
      }
      return Promise.resolve('default' as any);
    }
  };
};
