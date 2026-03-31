import { addDoc, collection, serverTimestamp, getDocs, query, where } from 'firebase/firestore';
import { db } from './firebase';
import { UserProfile, Permission, Notification, UserGroup } from './types';

import { format, isValid, parseISO } from 'date-fns';

export const formatDate = (date: any, formatStr: string, fallback = 'N/A'): string => {
  if (!date) return fallback;
  try {
    let d: Date;
    if (typeof date === 'string') {
      d = parseISO(date);
      // If parseISO fails (e.g., for "2026/3/25"), try standard Date constructor
      if (!isValid(d)) {
        d = new Date(date);
      }
    } else {
      d = new Date(date);
    }
    
    if (!isValid(d)) return fallback;
    return format(d, formatStr);
  } catch (err) {
    return fallback;
  }
};

export const logAction = async (user: UserProfile, action: string, details: string, orderId?: string) => {
  try {
    await addDoc(collection(db, 'logs'), {
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

export const hasPermission = (profile: UserProfile | null, permission: Permission, username?: string | null): boolean => {
  if (isSystemAdmin(username)) return true;
  if (!profile) return false;
  if (profile.status === 'Disabled') return false;
  
  // Explicitly deny SKU access for Sales/Reception roles
  if (permission === 'View SKU' && (profile.roleTemplate === 'Sales' || profile.roleTemplate === 'Reception')) {
    return false;
  }

  return (profile.permissions || []).includes(permission);
};

export const isSystemAdmin = (username: string | null | undefined): boolean => {
  if (!username) return false;
  const adminIdentifier = 'windalike5104@gmail.com';
  return username.trim().toLowerCase() === adminIdentifier || username.trim().toLowerCase() === 'admin';
};

export const createNotification = async (
  type: 'New Order' | 'Order Picked Up' | 'System',
  orderId: string,
  bookingNumber: string,
  recipientUids: string[]
) => {
  try {
    const notifications = recipientUids.map(uid => ({
      recipientUid: uid,
      title: type === 'New Order' ? 'New Order Created' : 'Order Picked Up',
      body: type === 'New Order' 
        ? `Order ${bookingNumber} has been created.` 
        : `Order ${bookingNumber} has been picked up.`,
      type,
      orderId,
      isRead: false,
      createdAt: new Date().toISOString()
    }));

    // Add all notifications
    const promises = notifications.map(n => addDoc(collection(db, 'notifications'), n));
    await Promise.all(promises);
  } catch (err) {
    console.error('Error creating notifications:', err);
  }
};

export const resolveRecipients = async (recipientIds: string[]): Promise<string[]> => {
  const uids = new Set<string>();
  const groupIds: string[] = [];
  const individualUids: string[] = [];

  recipientIds.forEach(id => {
    if (id.startsWith('group:')) {
      groupIds.push(id.replace('group:', ''));
    } else {
      individualUids.push(id);
    }
  });

  // Add individual UIDs
  individualUids.forEach(uid => uids.add(uid));

  // Fetch group members
  if (groupIds.length > 0) {
    try {
      const groupsSnap = await getDocs(collection(db, 'userGroups'));
      groupsSnap.docs.forEach(doc => {
        if (groupIds.includes(doc.id)) {
          const groupData = doc.data() as UserGroup;
          (groupData.userIds || []).forEach(uid => uids.add(uid));
        }
      });
    } catch (err) {
      console.error('Error resolving groups:', err);
    }
  }

  return Array.from(uids);
};

export const isAdmin = (profile: UserProfile | null, username?: string | null): boolean => {
  if (isSystemAdmin(username)) return true;
  if (!profile) return false;
  return profile.roleTemplate === 'Admin' || (profile.permissions || []).includes('Manage Users');
};

export const cn = (...inputs: any[]) => {
  return inputs.filter(Boolean).join(' ');
};

export const safeSearch = (value: string | null | undefined, term: string): boolean => {
  if (!term) return true;
  if (!value) return false;
  return value.toLowerCase().includes(term.toLowerCase());
};

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: undefined,
      email: undefined,
      emailVerified: undefined,
      isAnonymous: undefined,
      tenantId: undefined,
      providerInfo: []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}
