# Pickup Management System - Detailed Test Plan & Test Cases

## 1. Introduction
This document outlines the testing strategy and detailed test cases for the Pickup Management System. The goal is to ensure that all features, security measures, and integrations function correctly and meet user requirements.

## 2. Test Scope
The following modules are within the scope of this test plan:
- Authentication & Authorization (RBAC)
- Dashboard & Announcements
- Order Management (Create, List, Detail, Overdue, History)
- SKU Database Management
- User & Group Management
- Store & SMTP Configuration
- System Logs & Status
- Guest Display & Signature Capture
- Settings & Notifications
- Bulk Data Import

## 3. Test Strategy
- **Functional Testing**: Manual verification of all UI elements and business logic.
- **Security Testing**: Verification of Firebase Auth, Firestore Rules, and Role-Based Access Control.
- **Integration Testing**: Verification of SMTP email delivery and Firebase real-time updates.
- **UI/UX Testing**: Verification of responsive design across different screen sizes.
- **Data Integrity**: Verification of data consistency in Firestore according to the defined schema.

---

## 4. Detailed Test Cases

### 4.1 Authentication & Authorization
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| AUTH-01 | Login | Successful login with valid credentials | User exists in Firebase Auth | 1. Navigate to /login<br>2. Enter valid email and password<br>3. Click Login | User is redirected to Dashboard. |
| AUTH-02 | Login | Failed login with invalid credentials | - | 1. Enter invalid email or password<br>2. Click Login | Error message "Invalid credentials" is displayed. |
| AUTH-03 | RBAC | Access control for restricted pages | User logged in with 'Sales' role | 1. Attempt to navigate to /user-management | User is redirected to Dashboard or shown "Access Denied". |
| AUTH-04 | Logout | Successful logout | User is logged in | 1. Click Logout button in sidebar | User is redirected to /login. |

### 4.2 Dashboard & Announcements
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| DASH-01 | Dashboard | Display order statistics | Orders exist in system | 1. View Dashboard | Stats for Pending, Confirmed, Overdue, and Today's Pickups are accurate. |
| DASH-02 | Announcements | Create/Update announcement | Admin permissions | 1. Edit announcement text<br>2. Click Save | Announcement is updated in real-time for all users. |

### 4.3 Order Management
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| ORD-01 | Create | Create a new pickup order | SKUs exist in database | 1. Fill booking #, customer name, date<br>2. Add items via SKU search<br>3. Click Create | Order is saved; confirmation email is queued. |
| ORD-02 | List | Filter active orders | Multiple orders exist | 1. Search by booking #<br>2. Filter by status 'Pending' | List updates to show only matching orders. |
| ORD-03 | Detail | Confirm an order | Order status is 'Pending' | 1. Open order detail<br>2. Click 'Confirm Order' | Status changes to 'Confirmed'; notification sent. |
| ORD-04 | Pickup | Complete pickup with signature | Order status is 'Confirmed' | 1. Click 'Confirm Pickup'<br>2. Capture signature on Guest Display<br>3. Submit | Status changes to 'Picked Up'; signature saved. |
| ORD-05 | Overdue | Identify overdue orders | Order past scheduled time | 1. Navigate to /overdue-orders | Orders past pickup time are listed correctly. |
| ORD-06 | History | View completed orders | Orders in 'Picked Up' status | 1. Navigate to /history | List shows all non-active orders. |

### 4.4 SKU Database
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| SKU-01 | SKU | Add new SKU | Admin permissions | 1. Click 'Add SKU'<br>2. Enter SKU, Name, Location<br>3. Save | SKU appears in the database and is searchable in Order Create. |
| SKU-02 | SKU | Edit existing SKU | SKU exists | 1. Edit SKU location<br>2. Save | Location is updated across the system. |

### 4.5 User & Group Management
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| USER-01 | User | Create new user | Admin permissions | 1. Enter name, email, role<br>2. Save | User is created in Firestore and can log in (after password set). |
| USER-02 | Group | Create user group | Admin permissions | 1. Enter group name<br>2. Select users<br>3. Save | Group is created for targeted notifications. |

### 4.6 Store & SMTP Configuration
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| STORE-01 | SMTP | Configure store SMTP | Admin permissions | 1. Enter SMTP host, port, user, secret<br>2. Save | SMTP settings are saved securely in Firestore/Secret Manager. |
| STORE-02 | Template | Manage email templates | Admin permissions | 1. Edit 'Order Created' template<br>2. Save | Emails sent for new orders use the updated template. |

### 4.7 Guest Display
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| GUEST-01 | Display | Pair Guest Display | Pairing password set | 1. Open /guest-display<br>2. Enter pairing password | Screen shows "Waiting for Order". |
| GUEST-02 | Signature | Capture signature | Order pushed to guest screen | 1. Sign on screen<br>2. Click Submit | Signature is transmitted back to the Order Detail page. |

### 4.8 Bulk Import
| ID | Module | Description | Pre-conditions | Steps | Expected Result |
|:---|:---|:---|:---|:---|:---|
| IMP-01 | Import | Import orders from CSV | Valid CSV file | 1. Upload CSV<br>2. Map columns<br>3. Process | Orders are created in bulk; errors reported for invalid rows. |

---

## 5. Acceptance Criteria
1. All "Critical" and "High" severity bugs are resolved.
2. 100% of test cases in Section 4 are executed.
3. System response time for data fetching is under 2 seconds.
4. Email delivery success rate is > 99%.
5. Role-based access control strictly prevents unauthorized access.
