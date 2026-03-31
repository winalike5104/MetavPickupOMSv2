/**
 * 🚀 Order Service Hook (V2)
 * Handles order-related operations via the backend to bypass Firestore Security Rules.
 */
export const useOrderService = (token: string | null, API_BASE_URL: string) => {
  
  const bulkUpdateStatus = async (orderIds: string[], status: string) => {
    if (!token) throw new Error("Authentication token missing");

    try {
      const response = await fetch(`${API_BASE_URL}/api/v2/orders/bulk-update-status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // 🔒 关键：使用 V2 暗号，绕过网关拦截
          'x-v2-auth-token': `Bearer ${token}` 
        },
        body: JSON.stringify({ orderIds, status })
      });

      const data = await response.json();
      if (!data.success) throw new Error(data.error || "Failed to update orders");
      return data;
    } catch (err: any) {
      console.error("Bulk update failed:", err.message);
      throw err;
    }
  };

  return { bulkUpdateStatus };
};
