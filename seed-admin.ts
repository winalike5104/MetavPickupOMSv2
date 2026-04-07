import admin from 'firebase-admin';
import bcrypt from 'bcryptjs';
import fs from 'fs';
import path from 'path';

// Full list of 21 permissions from src/types.ts
const PERMISSIONS = [
  'Create Order', 'Edit Order', 'View Orders', 'Search Orders',
  'Add Order Items', 'Edit Order Items',
  'Add Payment', 'Edit Payment', 'View Payment',
  'Print Pick List', 'Confirm Pickup', 'Capture Signature',
  'Review Orders', 'Cancel Orders',
  'View SKU', 'Upload SKU', 'Edit SKU',
  'Manage Users', 'Manage User Groups', 'Manage Stores', 'View Logs'
];

async function seedAdmin() {
  try {
    console.log('🚀 Starting Admin User Seeding...');

    // 1. Initialize Firebase Admin (matching project config)
    const configPath = path.join(process.cwd(), "firebase-applet-config.json");
    let firebaseConfig: any = {};
    if (fs.existsSync(configPath)) {
      firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
    }

    if (!admin.apps.length) {
      if (firebaseConfig.projectId) {
        const adminConfig: any = { projectId: firebaseConfig.projectId };
        if (firebaseConfig.databaseURL) {
          adminConfig.databaseURL = firebaseConfig.databaseURL;
        }
        admin.initializeApp(adminConfig);
        console.log(`📡 Initialized with Project ID: ${firebaseConfig.projectId}`);
      } else {
        admin.initializeApp();
        console.log('📡 Initialized with default credentials');
      }
    }

    const databaseId = firebaseConfig.firestoreDatabaseId;
    const db = admin.firestore(databaseId);

    // 2. Prepare Admin Data
    const username = "windalike5104@gmail.com";
    const adminData = {
      username: username,
      password: bcrypt.hashSync("123456", 10),
      name: "Super Admin",
      roleTemplate: "Admin",
      permissions: PERMISSIONS,
      allowedWarehouses: ["AKL", "CHC"],
      status: "Active",
      updatedAt: new Date().toISOString()
    };

    // 3. Upsert Logic
    const usersRef = db.collection('users');
    const userDocRef = usersRef.doc(username);
    const userDoc = await userDocRef.get();

    if (userDoc.exists) {
      await userDocRef.update(adminData);
      console.log(`📝 Updated existing user: ${username}`);
    } else {
      await userDocRef.set({
        ...adminData,
        createdAt: new Date().toISOString()
      });
      console.log(`✨ Created new user: ${username}`);
    }

    console.log('✅ Admin user created successfully');
    process.exit(0);
  } catch (error: any) {
    console.error('❌ Error seeding admin user:', error.message || error);
    process.exit(1);
  }
}

seedAdmin();
