export enum Role {
  USER = "user",
  ADMIN = "admin",
}

export enum RequestStatus {
  PENDING = "pending",
  APPROVED = "approved",
  REJECTED = "rejected",
}

export interface SavedFilter {
  id: string;
  label: string;
  searchTerm: string;
  category: string;
}

export interface NotificationSettings {
  emailNotifyApproval: boolean;
  emailNotifyReview: boolean;
  emailNotifyPurchase: boolean;
}

export interface User {
  uid: string;
  name: string;
  email: string;
  bio?: string; // Descriptive agent biography
  role: Role;
  joinedAt: number;
  wishlist: string[];
  savedFilters: SavedFilter[];
  walletBalance: number;
  avatar?: string;
  reputation: number;
  isPro: boolean;
  proExpiry?: number;
  notificationSettings: NotificationSettings;
  // Enhanced Pro Metrics
  proMetrics?: {
    savedFees: number;
    reputationMultiplier: number;
    priorityQueueActive: boolean;
    vaultAccessLevel: number;
  };
}

export interface Transaction {
  id: string;
  userId: string;
  amount: number;
  type: 'deposit' | 'purchase' | 'withdrawal' | 'subscription';
  description: string;
  createdAt: number;
}

export interface Review {
  id: string;
  userId: string;
  userName: string;
  rating: number;
  comment: string;
  createdAt: number;
}

export interface Product {
  id: string;
  title: string;
  description: string;
  price: number;
  previewImage: string;
  images: string[];
  mediafireLink: string;
  approved: boolean;
  sellerId: string;
  sellerName: string;
  category: string;
  tags: string[];
  createdAt: number;
  rating: number;
  reviewCount: number;
  salesCount: number;
  viewCount: number;
  downloadCount: number;
  lastUpdate: number;
  reviews: Review[];
  isPriority?: boolean; // Pro users' products
}

export interface Request {
  id: string;
  userId: string;
  productId: string;
  paymentProof?: string;
  status: RequestStatus;
  approvedAt: number | null;
  createdAt: number;
  isWalletPurchase: boolean;
}

export interface Notification {
  id: string;
  to: string;
  message: string;
  read: boolean;
  createdAt: number;
}

export type PurchasedProduct = Product & {
  purchaseStatus: RequestStatus;
};