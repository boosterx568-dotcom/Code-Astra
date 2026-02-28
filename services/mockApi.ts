import { 
  doc, 
  setDoc, 
  getDoc, 
  collection, 
  query, 
  where, 
  getDocs, 
  updateDoc, 
  addDoc, 
  orderBy, 
  increment,
  Timestamp,
  limit
} from 'firebase/firestore';
import { 
  createUserWithEmailAndPassword, 
  signInWithEmailAndPassword 
} from 'firebase/auth';
import { auth, db } from './firebase';
import { 
  Role, 
  RequestStatus, 
  User, 
  Product, 
  Request, 
  Notification, 
  Transaction, 
  SavedFilter, 
  Review, 
  NotificationSettings 
} from '../types';

const defaultSettings: NotificationSettings = {
    emailNotifyApproval: true,
    emailNotifyReview: true,
    emailNotifyPurchase: true
};

export const api = {
  // --- AUTHENTICATION ---
  
  login: async (email: string, password?: string): Promise<User | null> => {
    if (!password) return null;
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return await api.getSellerData(cred.user.uid);
  },

  register: async (name: string, email: string, password?: string): Promise<User | null> => {
    if (!password) return null;
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    const newUser: User = {
        uid: cred.user.uid,
        name,
        email,
        bio: 'initialized agent identity.',
        role: Role.USER,
        joinedAt: Date.now(),
        wishlist: [],
        savedFilters: [],
        walletBalance: 0,
        reputation: 50,
        isPro: false,
        notificationSettings: { ...defaultSettings }
    };
    await setDoc(doc(db, 'users', cred.user.uid), newUser);
    return newUser;
  },

  syncExternalUser: async (firebaseUser: any): Promise<User> => {
    const userDoc = await getDoc(doc(db, 'users', firebaseUser.uid));
    if (userDoc.exists()) {
      return userDoc.data() as User;
    }
    const newUser: User = {
      uid: firebaseUser.uid,
      name: firebaseUser.displayName || 'Cyber Agent',
      email: firebaseUser.email,
      bio: 'Technical recruit in the Codastra network.',
      role: Role.USER,
      joinedAt: Date.now(),
      wishlist: [],
      savedFilters: [],
      walletBalance: 0,
      reputation: 50,
      isPro: false,
      notificationSettings: { ...defaultSettings },
      avatar: firebaseUser.photoURL
    };
    await setDoc(doc(db, 'users', firebaseUser.uid), newUser);
    return newUser;
  },

  // --- USER DATA ---

  getSellerData: async (uid: string): Promise<User | null> => {
    const userDoc = await getDoc(doc(db, 'users', uid));
    return userDoc.exists() ? (userDoc.data() as User) : null;
  },

  updateNotificationSettings: async (userId: string, settings: NotificationSettings): Promise<User | null> => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { notificationSettings: settings });
    return await api.getSellerData(userId);
  },

  upgradeToPro: async (userId: string): Promise<User | null> => {
    const userRef = doc(db, 'users', userId);
    const user = await api.getSellerData(userId);
    if (!user) return null;
    if (user.walletBalance < 999) throw new Error("Insufficient balance for Pro upgrade. Need ₹999.");
    
    await updateDoc(userRef, {
      walletBalance: increment(-999),
      isPro: true,
      proExpiry: Date.now() + (365 * 86400000)
    });

    await addDoc(collection(db, 'transactions'), {
      userId,
      amount: -999,
      type: 'subscription',
      description: 'Elite Pro Subscription (1 Year)',
      createdAt: Date.now()
    });

    return await api.getSellerData(userId);
  },

  // --- PRODUCTS ---

  getPublicProducts: async (filters: { searchTerm?: string; category?: string; sortBy?: string }): Promise<Product[]> => {
    const q = query(collection(db, 'products'), where('approved', '==', true));
    const snapshot = await getDocs(q);
    let products = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));

    if (filters.searchTerm) {
      const term = filters.searchTerm.toLowerCase();
      products = products.filter(p => 
        p.title.toLowerCase().includes(term) || 
        p.category.toLowerCase().includes(term)
      );
    }
    
    if (filters.category && filters.category !== 'All') {
      products = products.filter(p => p.category === filters.category);
    }

    if (filters.sortBy === 'PriceLow') products.sort((a, b) => a.price - b.price);
    else if (filters.sortBy === 'PriceHigh') products.sort((a, b) => b.price - a.price);
    else if (filters.sortBy === 'Newest') products.sort((a, b) => b.createdAt - a.createdAt);
    else products.sort((a, b) => b.salesCount - a.salesCount);

    return products;
  },

  getProductById: async (id: string): Promise<Product | null> => {
    const pDoc = await getDoc(doc(db, 'products', id));
    if (pDoc.exists()) {
      await updateDoc(doc(db, 'products', id), { viewCount: increment(1) });
      return { id: pDoc.id, ...pDoc.data() } as Product;
    }
    return null;
  },

  getUserSubmissions: async (userId: string): Promise<Product[]> => {
    const q = query(collection(db, 'products'), where('sellerId', '==', userId));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  },

  submitProduct: async (userId: string, userName: string, productData: any): Promise<Product> => {
    const user = await api.getSellerData(userId);
    const newProduct = {
      ...productData,
      sellerId: userId,
      sellerName: userName,
      approved: false,
      createdAt: Date.now(),
      rating: 0,
      reviewCount: 0,
      salesCount: 0,
      viewCount: 0,
      downloadCount: 0,
      lastUpdate: Date.now(),
      reviews: [],
      isPriority: user?.isPro || false
    };
    const docRef = await addDoc(collection(db, 'products'), newProduct);
    return { id: docRef.id, ...newProduct } as Product;
  },

  // --- TRANSACTIONS & PURCHASES ---

  addFunds: async (userId: string, amount: number): Promise<number> => {
    const userRef = doc(db, 'users', userId);
    await updateDoc(userRef, { walletBalance: increment(amount) });
    await addDoc(collection(db, 'transactions'), {
      userId,
      amount,
      type: 'deposit',
      description: 'Wallet Deposit via Secure Gateway',
      createdAt: Date.now()
    });
    const updated = await api.getSellerData(userId);
    return updated?.walletBalance || 0;
  },

  getTransactions: async (userId: string): Promise<Transaction[]> => {
    const q = query(collection(db, 'transactions'), where('userId', '==', userId), orderBy('createdAt', 'desc'));
    const snapshot = await getDocs(q);
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Transaction));
  },

  createRequest: async (userId: string, productId: string, paymentProof?: string, isWalletPurchase: boolean = false): Promise<Request> => {
    const user = await api.getSellerData(userId);
    const product = await api.getProductById(productId);
    
    if (!user || !product) throw new Error("Entity missing");

    if (isWalletPurchase) {
      if (user.walletBalance < product.price) throw new Error("Insufficient balance");
      await updateDoc(doc(db, 'users', userId), { walletBalance: increment(-product.price) });
      await updateDoc(doc(db, 'products', productId), { salesCount: increment(1) });
      await addDoc(collection(db, 'transactions'), {
        userId,
        amount: -product.price,
        type: 'purchase',
        description: `Purchased ${product.title}`,
        createdAt: Date.now()
      });
    }

    const newRequest = {
        userId,
        productId,
        paymentProof: paymentProof || '',
        status: isWalletPurchase ? RequestStatus.APPROVED : RequestStatus.PENDING,
        createdAt: Date.now(),
        approvedAt: isWalletPurchase ? Date.now() : null,
        isWalletPurchase
    };
    const docRef = await addDoc(collection(db, 'requests'), newRequest);
    return { id: docRef.id, ...newRequest } as Request;
  },

  getUserPurchases: async (userId: string): Promise<any[]> => {
    const q = query(collection(db, 'requests'), where('userId', '==', userId));
    const snapshot = await getDocs(q);
    const results = await Promise.all(snapshot.docs.map(async (d) => {
        const reqData = d.data() as Request;
        const product = await api.getProductById(reqData.productId);
        if(!product) return null;
        return { ...product, purchaseStatus: reqData.status };
    }));
    return results.filter(p => p !== null);
  },

  getNotifications: async (userId: string): Promise<Notification[]> => {
      const q = query(collection(db, 'notifications'), where('to', '==', userId), orderBy('createdAt', 'desc'), limit(20));
      const snapshot = await getDocs(q);
      return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Notification));
  },

  getAllProductsAdmin: async (): Promise<Product[]> => {
    const snapshot = await getDocs(collection(db, 'products'));
    return snapshot.docs.map(d => ({ id: d.id, ...d.data() } as Product));
  },

  approveProduct: async (productId: string): Promise<boolean> => {
    await updateDoc(doc(db, 'products', productId), { approved: true });
    return true;
  },

  rejectProduct: async (productId: string): Promise<boolean> => {
    // In a real app we might delete or flag it
    await updateDoc(doc(db, 'products', productId), { approved: false, rejected: true });
    return true;
  },

  toggleWishlist: async (userId: string, productId: string): Promise<string[]> => {
    const user = await api.getSellerData(userId);
    if (!user) return [];
    let wishlist = [...(user.wishlist || [])];
    if (wishlist.includes(productId)) wishlist = wishlist.filter(id => id !== productId);
    else wishlist.push(productId);
    await updateDoc(doc(db, 'users', userId), { wishlist });
    return wishlist;
  },

  saveUserFilter: async (userId: string, filter: Omit<SavedFilter, 'id'>): Promise<SavedFilter[]> => {
    const user = await api.getSellerData(userId);
    if (!user) return [];
    const newFilters = [...(user.savedFilters || []), { ...filter, id: `filt${Date.now()}` }];
    await updateDoc(doc(db, 'users', userId), { savedFilters: newFilters });
    return newFilters;
  },

  deleteUserFilter: async (userId: string, filterId: string): Promise<SavedFilter[]> => {
    const user = await api.getSellerData(userId);
    if (!user) return [];
    const filtered = (user.savedFilters || []).filter(f => f.id !== filterId);
    await updateDoc(doc(db, 'users', userId), { savedFilters: filtered });
    return filtered;
  },
};