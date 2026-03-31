export type OrderStatus = 'Created' | 'Picked Up' | 'Reviewed' | 'Cancelled';
export type PaymentStatus = 'Paid' | 'Unpaid';
export type PaymentMethod = 'Cash' | 'EFTPOS' | 'Bank Transfer' | 'Online Payment';
export type UserStatus = 'Active' | 'Disabled';

export interface SKU {
  id?: string;
  sku: string;
  productName: string;
  location: string;
}

export interface Store {
  id?: string;
  storeId: string;
  name: string;
  senderEmail?: string;
  template: {
    subject: string;
    body: string;
  };
  disableEmail?: boolean;
  createdAt?: any;
}

export interface OrderItem {
  sku: string;
  productName?: string;
  location?: string;
  qty: number;
}

export interface EmailLog {
  [type: string]: string; // type (e.g., 'pickup_notification') -> timestamp
}

export interface EmailTemplate {
  id?: string;
  name: string;
  subject: string;
  body: string; // HTML content with {{variables}}
  type: 'pickup_notification' | 'order_created' | 'custom';
  storeName?: string; // Optional: specific to a store
  status?: OrderStatus; // Optional: specific to a status
}

export interface StoreConfig {
  id: string; // Store Name
  senderEmail: string;
  templates?: {
    [key: string]: {
      subject: string;
      body: string;
    };
  };
  autoSend?: boolean;
}

export interface UserGroup {
  id?: string;
  name: string;
  userIds: string[];
}

export interface Notification {
  id?: string;
  recipientUid: string;
  title: string;
  body: string;
  type: 'New Order' | 'Order Picked Up' | 'System';
  orderId?: string;
  isRead: boolean;
  createdAt: string;
}

export interface Order {
  id?: string;
  bookingNumber: string;
  refNumber: string;
  customerName: string;
  customerId: string;
  storeId: string;
  pickupDateScheduled: string;
  createdBy: string;
  creatorEmail?: string;
  creatorUid?: string;
  createdTime: string;
  items: OrderItem[];
  warehouseId: string;
  paymentStatus: PaymentStatus;
  paymentMethod?: PaymentMethod | null;
  paymentTime?: string | null;
  paymentBy?: string | null;
  actualPickupTime?: string | null;
  pickedUpBy?: string | null;
  customerSignature?: string | null;
  status: OrderStatus;
  printedTime?: string | null;
  printedBy?: string | null;
  notes?: string | null;
  notificationRecipients?: string[] | null;
  customerEmail?: string;
  storeName?: string;
  emailStatus?: 'sent' | 'failed' | 'skipped' | null;
  lastEmailSentAt?: string | null;
  lastEmailAttemptAt?: string | null;
  lastEmailError?: string | null;
  sendPickupEmail?: boolean;
  emailLog?: EmailLog;
}

export type AccountType = 'Sales' | 'Reception' | 'Admin';

export interface UserSettings {
  notificationsEnabled: boolean;
  emailNotifications: boolean;
  theme: 'light' | 'dark';
}

export interface UserProfile {
  uid: string;
  username: string;
  email?: string;
  name: string;
  status: UserStatus;
  permissions: string[];
  allowedWarehouses?: string[];
  roleTemplate?: AccountType;
  settings?: UserSettings;
  fcmToken?: string;
}

export interface OperationLog {
  id?: string;
  timestamp: string;
  userId: string;
  userName: string;
  action: string;
  details: string;
  orderId?: string | null;
}

export const PERMISSIONS = [
  'Create Order', 'Edit Order', 'View Orders', 'Search Orders',
  'Add Order Items', 'Edit Order Items',
  'Add Payment', 'Edit Payment', 'View Payment',
  'Print Pick List', 'Confirm Pickup', 'Capture Signature',
  'Review Orders', 'Cancel Orders',
  'View SKU', 'Upload SKU', 'Edit SKU',
  'Manage Users', 'Manage User Groups', 'Manage Stores', 'View Logs'
] as const;

export type Permission = typeof PERMISSIONS[number];

export const ROLE_TEMPLATES = {
  Sales: [
    'Create Order', 'Edit Order', 'Search Orders', 'View Orders',
    'Add Order Items', 'Edit Order Items',
    'Add Payment', 'Edit Payment', 'View Payment',
    'Cancel Orders'
  ],
  Reception: [
    'View Orders', 'Search Orders',
    'Add Payment', 'View Payment',
    'Print Pick List', 'Confirm Pickup', 'Capture Signature'
  ],
  Admin: [...PERMISSIONS]
};
