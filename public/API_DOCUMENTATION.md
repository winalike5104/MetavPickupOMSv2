# Pickup System API Documentation

This document describes how to push SKU data to the Pickup System from external sources.

## Base URL
`https://acapickup.com`

## Authentication
All requests require an API Key passed in the `Authorization` header.
- Header: `Authorization: Bearer ecpp_sk_8f2a9b4c7d1e6f3a5b0c9d8e7f6a5b4c`

---

## 1. Push SKU Locations
Use this endpoint to update product locations in the warehouse.

- **Endpoint:** `/api/ecpp/push`
- **Method:** `POST`
- **Content-Type:** `application/json`

### Request Body
Accepts a single object or an array of objects. The system uses an **Upsert** logic: if the SKU exists, it updates the record; if not, it creates a new one.

| Field | Type | Required | Description |
| :--- | :--- | :--- | :--- |
| `sku` | String | Yes | Product SKU (Unique Identifier) |
| `location` | String | No | Warehouse location |
| `productName` | String | No | Product name (also accepts `productname`) |

### Example Request
```json
[
  { 
    "sku": "SKU-001", 
    "location": "B-05-C",
    "productName": "Premium Wireless Mouse" 
  },
  { 
    "sku": "SKU-002", 
    "location": "C-10-A" 
  }
]
```

---

## Response Format
Success:
```json
{
  "success": true,
  "message": "Processed 2 items",
  "details": {
    "updated": 2,
    "created": 0,
    "errors": []
  }
}
```

Error:
```json
{
  "success": false,
  "error": "Error message details"
}
```
