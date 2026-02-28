import React, { useState, useEffect, createContext, useContext, useCallback, useMemo } from 'react';
import { api } from './services/mockApi';
import { User, Product, Notification, Role, RequestStatus, PurchasedProduct, Transaction, Review, NotificationSettings } from './types';
import { 
    SunIcon, MoonIcon, BellIcon, UserCircleIcon, 
    CodeBracketIcon, 
    CheckCircleIcon, XCircleIcon,
    HeartIcon, HomeIcon, MagnifyingGlassIcon, PlusIcon, StarIcon,
    ChatBubbleLeftEllipsisIcon, BoltIcon, ChevronRightIcon,
    XIcon, FacebookIcon, LinkedInIcon, LinkIcon,
    EyeIcon, ArrowDownTrayIcon, ShoppingBagIcon, TrashIcon, ClockIcon
} from './components/icons';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { auth, googleProvider } from './services/firebase';
import { signInWithPopup, onAuthStateChanged, signOut } from 'firebase/auth';

// --- CURRENCY UTILITY ---
const formatINR = (amount: number) => {
    return new Intl.NumberFormat('en-IN', {
        style: 'currency',
        currency: 'INR',
        maximumFractionDigits: 0
    }).format(amount);
};

// --- CONTEXTS ---

interface ToastContextType {
    show: (message: string, type?: 'success' | 'error' | 'info') => void;
}
const ToastContext = createContext<ToastContextType | null>(null);
const useToast = () => {
    const context = useContext(ToastContext);
    if (!context) throw new Error("useToast must be used within a ToastProvider");
    return context;
};

type Theme = 'light' | 'dark';
const ThemeContext = createContext<{ theme: Theme; toggleTheme: () => void; } | null>(null);
const useTheme = () => {
    const context = useContext(ThemeContext);
    if (!context) throw new Error("useTheme must be used within a ThemeProvider");
    return context;
}

interface AuthContextType {
    user: User | null;
    login: (email: string, password?: string) => Promise<void>;
    loginWithGoogle: () => Promise<void>;
    register: (name: string, email: string, password?: string) => Promise<void>;
    logout: () => Promise<void>;
    isLoading: boolean;
    updateWishlist: (productId: string) => Promise<void>;
    refreshUser: () => Promise<void>;
    saveFilter: (label: string, searchTerm: string, category: string) => Promise<void>;
    deleteFilter: (id: string) => Promise<void>;
    upgradeToPro: () => Promise<void>;
    updateNotificationSettings: (settings: NotificationSettings) => Promise<void>;
}
const AuthContext = createContext<AuthContextType | null>(null);
const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) throw new Error("useAuth must be used within an AuthProvider");
    return context;
}

// --- PROVIDERS ---

const ToastProvider = ({ children }: React.PropsWithChildren) => {
    const [toasts, setToasts] = useState<{ id: number; message: string; type: string }[]>([]);
    const show = (message: string, type = 'info') => {
        const id = Date.now();
        setToasts(prev => [...prev, { id, message, type }]);
        setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 4000);
    };
    return (
        <ToastContext.Provider value={{ show }}>
            {children}
            <div className="fixed top-24 right-4 z-[100] flex flex-col items-end space-y-2 pointer-events-none w-full max-w-[calc(100%-2rem)]">
                <AnimatePresence>
                    {toasts.map(toast => (
                        <motion.div
                            key={toast.id}
                            initial={{ opacity: 0, x: 50, scale: 0.8 }}
                            animate={{ opacity: 1, x: 0, scale: 1 }}
                            exit={{ opacity: 0, scale: 0.8 }}
                            className={`pointer-events-auto px-6 py-4 rounded-3xl shadow-2xl backdrop-blur-2xl border flex items-center space-x-4 ${
                                toast.type === 'error' ? 'bg-red-500/90 border-red-400 text-white' : 
                                toast.type === 'success' ? 'bg-indigo-600/90 border-indigo-400 text-white' : 
                                'bg-white/90 dark:bg-black/90 border-black/10 dark:border-white/10 dark:text-white'
                            }`}
                        >
                            <span className="font-black text-[10px] md:text-xs uppercase tracking-widest italic">{toast.message}</span>
                        </motion.div>
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
};

const ThemeProvider = ({ children }: React.PropsWithChildren) => {
    const [theme, setTheme] = useState<Theme>('light');
    useEffect(() => {
        const storedTheme = localStorage.getItem('theme') as Theme | null;
        const initialTheme = storedTheme || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
        setTheme(initialTheme);
    }, []);
    useEffect(() => {
        document.documentElement.classList.toggle('dark', theme === 'dark');
        localStorage.setItem('theme', theme);
    }, [theme]);
    const toggleTheme = () => setTheme(prev => prev === 'light' ? 'dark' : 'light');
    return <ThemeContext.Provider value={{ theme, toggleTheme }}>{children}</ThemeContext.Provider>;
};

const AuthProvider = ({ children }: React.PropsWithChildren) => {
    const [user, setUser] = useState<User | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const { show } = useToast();

    const refreshUser = useCallback(async () => {
        if (!user) return;
        const updatedUser = await api.getSellerData(user.uid);
        if (updatedUser) {
            setUser(updatedUser);
        }
    }, [user]);

    useEffect(() => {
        const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
            if (firebaseUser) {
                const syncedUser = await api.syncExternalUser(firebaseUser);
                setUser(syncedUser);
            } else {
                setUser(null);
            }
            setIsLoading(false);
        });
        return unsubscribe;
    }, []);
    
    const login = async (email: string, password?: string) => {
        setIsLoading(true);
        try {
            const loggedInUser = await api.login(email, password);
            if (loggedInUser) {
                setUser(loggedInUser);
                show(`Access Authorized: ${loggedInUser.name}`, 'success');
            }
        } catch (e: any) {
            show(e.message || "Invalid credentials.", "error");
        } finally {
            setIsLoading(false);
        }
    };

    const loginWithGoogle = async () => {
        setIsLoading(true);
        try {
            const result = await signInWithPopup(auth, googleProvider);
            const syncedUser = await api.syncExternalUser(result.user);
            setUser(syncedUser);
            show(`Link Established: ${syncedUser.name}`, 'success');
        } catch (error: any) {
            show(`Sync Failed: ${error.message}`, 'error');
        } finally {
            setIsLoading(false);
        }
    };

    const register = async (name: string, email: string, password?: string) => {
        setIsLoading(true);
        try {
            const newUser = await api.register(name, email, password);
            if (newUser) {
                setUser(newUser);
                show(`Registered: ${newUser.name}`, 'success');
            }
        } catch (e: any) {
            show(e.message || "Registration failed.", "error");
        } finally {
            setIsLoading(false);
        }
    };
    
    const logout = async () => {
        await signOut(auth);
        setUser(null);
        show("Session Terminated.");
    };

    const updateWishlist = async (productId: string) => {
        if (!user) return;
        const newWishlist = await api.toggleWishlist(user.uid, productId);
        setUser(prev => prev ? { ...prev, wishlist: newWishlist } : null);
    };

    const saveFilter = async (label: string, searchTerm: string, category: string) => {
      if (!user) return;
      const newFilters = await api.saveUserFilter(user.uid, { label, searchTerm, category });
      setUser(prev => prev ? { ...prev, savedFilters: newFilters } : null);
      show("Macro saved.", "success");
    };

    const deleteFilter = async (id: string) => {
      if (!user) return;
      const newFilters = await api.deleteUserFilter(user.uid, id);
      setUser(prev => prev ? { ...prev, savedFilters: newFilters } : null);
      show("Macro deleted.");
    };

    const upgradeToPro = async () => {
      if (!user) return;
      try {
        const updatedUser = await api.upgradeToPro(user.uid);
        if (updatedUser) {
          setUser(updatedUser);
          show("Elite Pro Activated.", "success");
        }
      } catch (e: any) {
        show(e.message || "Upgrade failed.", "error");
      }
    };

    const updateNotificationSettings = async (settings: NotificationSettings) => {
        if (!user) return;
        try {
            const updatedUser = await api.updateNotificationSettings(user.uid, settings);
            if (updatedUser) {
                setUser(updatedUser);
                show("Settings synced.", "success");
            }
        } catch (e) {
            show("Sync failure.", "error");
        }
    };

    return (
        <AuthContext.Provider value={{ user, login, loginWithGoogle, register, logout, isLoading, updateWishlist, refreshUser, saveFilter, deleteFilter, upgradeToPro, updateNotificationSettings }}>
            {children}
        </AuthContext.Provider>
    );
};

// --- CORE COMPONENTS ---

const SkeletonLoader = ({ count = 3, gridClass = "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8" }) => (
    <div className={gridClass}>
        {Array.from({ length: count }).map((_, i) => (
            <div key={i} className="bg-white dark:bg-[#0a0a0a] rounded-[2rem] overflow-hidden border border-gray-100 dark:border-gray-800/60 animate-pulse h-[400px]" />
        ))}
    </div>
);

const Header = ({ setView, onNotifOpen, currentView }: { setView: (v: any) => void; onNotifOpen: () => void; currentView: string }) => {
    const { user, logout } = useAuth();
    const { theme, toggleTheme } = useTheme();
    const [showUserMenu, setShowUserMenu] = useState(false);
    
    return (
        <header className="fixed top-0 left-0 right-0 z-50 px-4 py-4 md:py-6 pointer-events-none">
            <div className="mx-auto max-w-7xl pointer-events-auto">
                <div className="bg-white/70 dark:bg-[#0a0a0a]/80 backdrop-blur-3xl border border-white/20 dark:border-gray-800/50 rounded-full px-6 h-16 md:h-20 flex items-center justify-between shadow-2xl">
                    <div onClick={() => setView({ page: 'home' })} className="flex items-center space-x-3 cursor-pointer group">
                        <div className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-xl flex items-center justify-center text-white shadow-2xl group-hover:rotate-12 transition-transform"><CodeBracketIcon className="h-6 w-6"/></div>
                        <span className="text-xl md:text-2xl font-black tracking-tighter dark:text-white uppercase italic hidden sm:block">CODASTRA.</span>
                    </div>
                    
                    <nav className="hidden lg:flex items-center bg-gray-100/50 dark:bg-white/5 p-1.5 rounded-full space-x-1 border border-black/5 dark:border-white/5">
                        {['home', 'explore', 'sell'].map(p => (
                            <button key={p} onClick={() => setView({ page: p })} className={`px-6 py-2 text-[10px] font-black uppercase tracking-widest italic rounded-full ${currentView === p ? 'bg-white dark:bg-white/10 text-indigo-600 dark:text-indigo-400' : 'text-gray-500 hover:text-indigo-500'}`}>
                                {p}
                            </button>
                        ))}
                    </nav>

                    <div className="flex items-center space-x-4">
                        <button onClick={toggleTheme} className="p-3 bg-gray-100/50 dark:bg-white/5 rounded-xl text-gray-500 hover:text-indigo-500 transition-all border dark:border-white/5">
                            {theme === 'dark' ? <SunIcon className="w-5 h-5"/> : <MoonIcon className="w-5 h-5"/>}
                        </button>
                        <button onClick={onNotifOpen} className="p-3 bg-gray-100/50 dark:bg-white/5 rounded-xl text-gray-500 hover:text-indigo-500 transition-all border dark:border-white/5 relative">
                            <BellIcon className="w-5 h-5"/>
                            {user && <span className="absolute top-2.5 right-2.5 w-2 h-2 bg-red-500 border-2 border-white dark:border-[#0a0a0a] rounded-full" />}
                        </button>
                        <div className="relative">
                            <button onClick={() => setShowUserMenu(!showUserMenu)} className="w-10 h-10 md:w-12 md:h-12 bg-indigo-600 rounded-full flex items-center justify-center text-white text-lg font-black shadow-xl overflow-hidden">
                                {user ? user.name[0] : <UserCircleIcon className="w-6 h-6"/>}
                            </button>
                            <AnimatePresence>
                                {showUserMenu && (
                                    <motion.div initial={{ opacity: 0, y: 15 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: 10 }} className="absolute right-0 mt-4 w-64 md:w-72 bg-white dark:bg-[#0a0a0a] rounded-[2rem] shadow-2xl border border-gray-100 dark:border-gray-800/60 overflow-hidden p-6 z-50">
                                        {user ? (
                                            <div className="space-y-6">
                                                <div>
                                                    <p className="font-black text-xl dark:text-white uppercase italic truncate">{user.name}</p>
                                                    <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest truncate">{user.email}</p>
                                                </div>
                                                <div className="space-y-1">
                                                    <button onClick={() => { setView({ page: 'profile' }); setShowUserMenu(false); }} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 rounded-2xl italic border dark:border-white/5">Terminal</button>
                                                    <button onClick={() => { setView({ page: 'wallet' }); setShowUserMenu(false); }} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-white/5 rounded-2xl italic border dark:border-white/5">Vault ({formatINR(user.walletBalance)})</button>
                                                    
                                                    {user.role === Role.ADMIN && (
                                                        <button onClick={() => { setView({ page: 'admin-dashboard' }); setShowUserMenu(false); }} className="w-full text-left px-6 py-4 text-[10px] font-black uppercase tracking-widest text-indigo-500 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 rounded-2xl italic border border-indigo-500/20">Admin Terminal</button>
                                                    )}

                                                    <button onClick={async () => { await logout(); setView({ page: 'home' }); setShowUserMenu(false); }} className="w-full text-center py-4 text-[10px] font-black text-red-500 mt-4 border-t dark:border-white/5 uppercase italic">Abort</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="space-y-4 text-center">
                                                <p className="text-xl font-black dark:text-white italic">HANDSHAKE REQUIRED.</p>
                                                <button onClick={() => { setView({ page: 'login' }); setShowUserMenu(false); }} className="w-full py-4 bg-indigo-600 text-white rounded-2xl font-black text-xs uppercase italic">Authorize</button>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </div>
                </div>
            </div>
        </header>
    );
};

const BottomNav = ({ currentView, setView }: { currentView: string; setView: (v: any) => void }) => {
    const navItems = [
        { id: 'home', icon: HomeIcon, label: 'Home' },
        { id: 'explore', icon: MagnifyingGlassIcon, label: 'Vault' },
        { id: 'sell', icon: PlusIcon, label: 'Deploy' },
        { id: 'profile', icon: UserCircleIcon, label: 'Cmd' }
    ];
    return (
        <nav className="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 z-50 w-[calc(100%-2rem)] max-w-md">
            <div className="bg-white/70 dark:bg-[#0a0a0a]/80 backdrop-blur-2xl border border-black/5 dark:border-white/5 rounded-full p-2 flex items-center justify-around shadow-2xl">
                <LayoutGroup id="bottom-nav">
                    {navItems.map(item => {
                        const isActive = currentView === item.id || (item.id === 'profile' && ['profile', 'wishlist', 'wallet', 'transactions'].includes(currentView));
                        const Icon = item.icon;
                        return (
                            <button key={item.id} onClick={() => setView({ page: item.id })} className={`flex-1 relative flex flex-col items-center justify-center h-14 rounded-full transition-all ${isActive ? 'text-white' : 'text-gray-400'}`}>
                                {isActive && (
                                    <motion.div layoutId="bubble" className="absolute inset-0 bg-indigo-600 rounded-full z-0 shadow-lg" transition={{ type: 'spring', bounce: 0.25, duration: 0.6 }} />
                                )}
                                <Icon className="w-5 h-5 relative z-10" />
                                <span className="text-[7px] font-black uppercase tracking-widest mt-0.5 italic relative z-10">{item.label}</span>
                            </button>
                        );
                    })}
                </LayoutGroup>
            </div>
        </nav>
    );
};

// --- SUB-PAGES ---

const HomePage = ({ setView }: { setView: (v: any) => void }) => {
    const [featured, setFeatured] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        api.getPublicProducts({ sortBy: 'Popular' }).then(data => {
            setFeatured(data.slice(0, 3));
            setIsLoading(false);
        });
    }, []);

    return (
        <div className="container mx-auto px-4 pt-32 pb-20">
            <section className="py-20 text-center space-y-12">
                <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
                    <span className="text-[10px] font-black text-indigo-600 uppercase tracking-[0.4em] italic mb-6 block">Elite Logic Marketplace</span>
                    <h1 className="text-6xl md:text-[10rem] font-black dark:text-white leading-[0.8] italic uppercase tracking-tighter mb-8">
                        Logic.<br/>Vault.
                    </h1>
                    <p className="max-w-2xl mx-auto text-gray-500 dark:text-gray-400 font-bold uppercase italic text-xs tracking-widest leading-loose">
                        Secure terminal for high-performance codebases, neural-link assets, and architectural blueprints. Authorized access only.
                    </p>
                </motion.div>
                
                <div className="flex flex-col sm:flex-row items-center justify-center gap-6">
                    <button onClick={() => setView({ page: 'explore' })} className="px-10 py-5 bg-indigo-600 text-white rounded-full font-black text-xs uppercase tracking-widest italic shadow-2xl hover:scale-105 transition-transform flex items-center space-x-3">
                        <span>Enter Vault</span>
                        <ChevronRightIcon className="w-4 h-4" />
                    </button>
                    <button onClick={() => setView({ page: 'sell' })} className="px-10 py-5 bg-white dark:bg-white/5 dark:text-white rounded-full font-black text-xs uppercase tracking-widest italic border border-black/5 dark:border-white/10 hover:bg-gray-50 transition-colors">
                        Deploy Asset
                    </button>
                </div>
            </section>

            <section className="py-20">
                <div className="flex items-center justify-between mb-12">
                    <h2 className="text-3xl font-black dark:text-white italic uppercase tracking-tighter">Prime Signals.</h2>
                    <button onClick={() => setView({ page: 'explore' })} className="text-[10px] font-black text-indigo-600 uppercase tracking-widest italic hover:underline">View All Records</button>
                </div>
                {isLoading ? <SkeletonLoader count={3} /> : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
                        {featured.map(p => (
                            <ProductCard key={p.id} product={p} onSelect={(id) => setView({ page: 'product', id })} onSellerClick={(id) => setView({ page: 'seller-profile', id })} />
                        ))}
                    </div>
                )}
            </section>
        </div>
    );
};

const SellerProfilePage = ({ sellerId, setView }: { sellerId: string; setView: (v: any) => void }) => {
    const [seller, setSeller] = useState<User | null>(null);
    const [products, setProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        const load = async () => {
            const [s, p] = await Promise.all([
                api.getSellerData(sellerId),
                api.getUserSubmissions(sellerId)
            ]);
            setSeller(s);
            setProducts(p.filter(prod => prod.approved));
            setIsLoading(false);
        };
        load();
    }, [sellerId]);

    if (isLoading) return <div className="py-40"><SkeletonLoader count={1} /></div>;
    if (!seller) return <div className="py-40 text-center font-black text-4xl italic uppercase dark:text-white">Agent Not Found</div>;

    return (
        <div className="container mx-auto px-4 py-32 md:py-48">
            <div className="max-w-4xl mx-auto space-y-20">
                <div className="flex flex-col items-center text-center space-y-8">
                    <div className="w-40 h-40 bg-indigo-600 rounded-[3rem] flex items-center justify-center text-6xl font-black text-white shadow-2xl relative">
                        {seller.avatar ? <img src={seller.avatar} className="w-full h-full object-cover rounded-[3rem]" alt={seller.name} /> : seller.name[0]}
                        {seller.isPro && (
                            <div className="absolute -bottom-4 -right-4 bg-yellow-500 text-black px-4 py-2 rounded-2xl text-[10px] font-black uppercase italic shadow-xl border-4 border-white dark:border-[#0a0a0a]">Elite</div>
                        )}
                    </div>
                    <div>
                        <h1 className="text-5xl md:text-7xl font-black dark:text-white italic uppercase tracking-tighter mb-4">{seller.name}</h1>
                        <p className="text-gray-500 dark:text-gray-400 font-medium italic text-lg max-w-xl mx-auto">{seller.bio || "No biography signal detected."}</p>
                    </div>
                    <div className="flex items-center space-x-4">
                        <div className="px-8 py-4 bg-white dark:bg-white/5 rounded-3xl border dark:border-white/5 shadow-xl text-center">
                            <span className="text-[8px] font-black text-gray-400 uppercase block mb-1 tracking-widest">Reputation</span>
                            <span className="text-2xl font-black text-indigo-500 italic">{seller.reputation}%</span>
                        </div>
                        <div className="px-8 py-4 bg-white dark:bg-white/5 rounded-3xl border dark:border-white/5 shadow-xl text-center">
                            <span className="text-[8px] font-black text-gray-400 uppercase block mb-1 tracking-widest">Node Level</span>
                            <span className="text-2xl font-black text-indigo-500 italic">{products.length}</span>
                        </div>
                    </div>
                </div>

                <div>
                    <h2 className="text-3xl font-black dark:text-white italic uppercase tracking-tighter mb-12">Deployed Logic.</h2>
                    {products.length === 0 ? (
                        <p className="text-center py-20 text-xs font-bold text-gray-400 uppercase italic">No active nodal signals.</p>
                    ) : (
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-10">
                            {products.map(p => (
                                <ProductCard key={p.id} product={p} onSelect={(id) => setView({ page: 'product', id })} />
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

const SellPage = ({ setView }: { setView: (v: any) => void }) => {
    const { user } = useAuth();
    const { show } = useToast();
    const [formData, setFormData] = useState({
        title: '',
        description: '',
        price: '',
        category: 'Tools',
        previewImage: '',
        mediafireLink: ''
    });

    if (!user) return <LoginPage setView={setView} redirect={{ page: 'sell' }} />;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        try {
            await api.submitProduct(user.uid, user.name, {
                ...formData,
                price: Number(formData.price),
                images: [],
                tags: []
            });
            show("Node submitted for audit.", "success");
            setView({ page: 'profile' });
        } catch (e: any) {
            show("Deployment failed.", "error");
        }
    };

    return (
        <div className="container mx-auto px-4 py-32 md:py-48 max-w-2xl">
            <h1 className="text-5xl font-black italic uppercase tracking-tighter dark:text-white mb-12">Deploy Asset.</h1>
            <form onSubmit={handleSubmit} className="space-y-6 bg-white dark:bg-[#0a0a0a] p-10 rounded-[3rem] border dark:border-gray-800 shadow-2xl">
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Title</label>
                    <input required type="text" value={formData.title} onChange={e => setFormData({...formData, title: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Description</label>
                    <textarea required value={formData.description} onChange={e => setFormData({...formData, description: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600 min-h-[150px]" />
                </div>
                <div className="grid grid-cols-2 gap-6">
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Valuation (INR)</label>
                        <input required type="number" value={formData.price} onChange={e => setFormData({...formData, price: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600" />
                    </div>
                    <div className="space-y-2">
                        <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Category</label>
                        <select value={formData.category} onChange={e => setFormData({...formData, category: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600">
                            {['Entertainment', 'Finance', 'Education', 'Tools', 'Gaming'].map(c => <option key={c} value={c}>{c}</option>)}
                        </select>
                    </div>
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Preview Image URL</label>
                    <input required type="url" value={formData.previewImage} onChange={e => setFormData({...formData, previewImage: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600" />
                </div>
                <div className="space-y-2">
                    <label className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Asset Link</label>
                    <input required type="url" value={formData.mediafireLink} onChange={e => setFormData({...formData, mediafireLink: e.target.value})} className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 dark:text-white font-bold italic outline-none focus:ring-2 focus:ring-indigo-600" />
                </div>
                <button type="submit" className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xl uppercase italic shadow-2xl hover:bg-indigo-700 transition-all mt-6">Submit for Audit</button>
            </form>
        </div>
    );
};

const ExplorePage = ({ setView }: { setView: (v: any) => void }) => {
    const [products, setProducts] = useState<Product[]>([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [category, setCategory] = useState('All');
    const [sortBy, setSortBy] = useState('Popular');
    const [isLoading, setIsLoading] = useState(true);

    const categories = ['All', 'Entertainment', 'Finance', 'Education', 'Tools', 'Gaming'];
    const sortOptions = [
        { label: 'Popularity', value: 'Popular' },
        { label: 'Newest', value: 'Newest' },
        { label: 'Price: Low-High', value: 'PriceLow' },
        { label: 'Price: High-Low', value: 'PriceHigh' },
    ];

    useEffect(() => {
        setIsLoading(true);
        api.getPublicProducts({ searchTerm, category, sortBy }).then(data => {
            setProducts(data);
            setIsLoading(false);
        });
    }, [searchTerm, category, sortBy]);

    return (
        <div className="container mx-auto px-4 py-24 md:py-32">
            <h1 className="text-7xl md:text-9xl font-black dark:text-white tracking-tighter italic uppercase leading-none mb-16">Vault.</h1>
            <div className="space-y-8 mb-16">
                <div className="relative group">
                    <MagnifyingGlassIcon className="absolute left-10 top-1/2 -translate-y-1/2 w-8 h-8 text-gray-400 group-focus-within:text-indigo-600 transition-colors" />
                    <input type="text" value={searchTerm} onChange={e => setSearchTerm(e.target.value)} placeholder="Searching records..." className="w-full pl-24 pr-10 py-8 rounded-[2.5rem] bg-white dark:bg-[#121212] border dark:border-gray-800 dark:text-white text-2xl font-bold uppercase italic shadow-xl focus:ring-4 focus:ring-indigo-600/20 outline-none transition-all" />
                </div>
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-8">
                    <div className="flex flex-wrap gap-3">
                        {categories.map(cat => (
                            <button key={cat} onClick={() => setCategory(cat)} className={`px-6 py-3 rounded-2xl text-[10px] font-black uppercase tracking-widest italic transition-all border ${category === cat ? 'bg-indigo-600 border-indigo-600 text-white shadow-lg' : 'bg-white dark:bg-white/5 dark:text-white border-black/5 dark:border-white/5 hover:border-indigo-600'}`}>{cat}</button>
                        ))}
                    </div>
                    <div className="flex items-center space-x-4 bg-white dark:bg-[#121212] p-2 rounded-2xl border dark:border-gray-800 shadow-lg">
                        <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic ml-4">Sequence:</span>
                        <select 
                            value={sortBy} 
                            onChange={e => setSortBy(e.target.value)}
                            className="bg-transparent dark:text-white font-black uppercase text-[10px] italic py-2 pr-4 outline-none appearance-none cursor-pointer"
                        >
                            {sortOptions.map(opt => (
                                <option key={opt.value} value={opt.value} className="bg-white dark:bg-[#0a0a0a]">{opt.label}</option>
                            ))}
                        </select>
                    </div>
                </div>
            </div>
            {isLoading ? <SkeletonLoader count={6} /> : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-12">
                    {products.map(p => (
                        <ProductCard key={p.id} product={p} onSelect={(id) => setView({ page: 'product', id })} onSellerClick={(id) => setView({ page: 'seller-profile', id })} />
                    ))}
                </div>
            )}
        </div>
    );
};

const ProductPage = ({ productId, setView }: { productId: string; setView: (v: any) => void }) => {
    const { user, refreshUser } = useAuth();
    const { show } = useToast();
    const [product, setProduct] = useState<Product | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [activeImageIndex, setActiveImageIndex] = useState(0);

    const loadProduct = useCallback(async () => {
        const p = await api.getProductById(productId);
        setProduct(p);
        setIsLoading(false);
    }, [productId]);

    useEffect(() => { loadProduct(); }, [loadProduct]);

    const allImages = useMemo(() => {
        if (!product) return [];
        const combined = [product.previewImage, ...(product.images || [])];
        return Array.from(new Set(combined)).filter(Boolean);
    }, [product]);

    const handleShare = (platform: string) => {
        const url = window.location.href;
        const text = `Explore node ${product?.title} on Codastra`;
        if (platform === 'x') window.open(`https://twitter.com/intent/tweet?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`, '_blank');
        if (platform === 'facebook') window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`, '_blank');
        if (platform === 'linkedin') window.open(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`, '_blank');
        if (platform === 'copy') {
            navigator.clipboard.writeText(url);
            show("Endpoint copied.", "success");
        }
    };

    const handlePurchase = async () => {
        if (!user) return setView({ page: 'login', redirect: { page: 'product', id: productId } });
        try {
            await api.createRequest(user.uid, productId, undefined, true);
            show("Acquisition complete.", "success");
            refreshUser();
            loadProduct();
        } catch (e: any) {
            show(e.message || "Acquisition failed.", "error");
        }
    };

    if (isLoading) return <div className="py-40"><SkeletonLoader count={1} /></div>;
    if (!product) return <div className="py-40 text-center font-black text-4xl italic uppercase dark:text-white">Not Found</div>;

    return (
        <div className="container mx-auto px-4 py-24 md:py-40">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-12 md:gap-20">
                <div className="lg:col-span-8 space-y-12">
                    <div className="space-y-6">
                        <div className="aspect-video rounded-[3rem] overflow-hidden shadow-2xl border dark:border-white/10 relative group bg-black">
                            <AnimatePresence mode="wait">
                                <motion.img 
                                    key={allImages[activeImageIndex]}
                                    src={allImages[activeImageIndex]} 
                                    initial={{ opacity: 0 }}
                                    animate={{ opacity: 1 }}
                                    exit={{ opacity: 0 }}
                                    transition={{ duration: 0.4 }}
                                    className="w-full h-full object-contain md:object-cover" 
                                    alt={product.title} 
                                />
                            </AnimatePresence>
                            
                            <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent pointer-events-none" />
                            
                            <div className="absolute bottom-10 left-10 right-10 pointer-events-none">
                                <div className="flex items-center space-x-3 mb-4">
                                    <span className="px-4 py-1.5 bg-indigo-600 rounded-full text-[10px] font-black uppercase tracking-widest text-white italic shadow-lg">{product.category}</span>
                                    {product.isPriority && <span className="px-4 py-1.5 bg-yellow-500 rounded-full text-[10px] font-black uppercase tracking-widest text-black italic shadow-lg">Elite Choice</span>}
                                </div>
                                <h1 className="text-4xl md:text-6xl font-black text-white italic uppercase tracking-tighter">{product.title}</h1>
                            </div>
                        </div>

                        {allImages.length > 1 && (
                            <div className="flex items-center space-x-4 overflow-x-auto pb-4 no-scrollbar scroll-smooth">
                                {allImages.map((img, idx) => (
                                    <button 
                                        key={idx}
                                        onClick={() => setActiveImageIndex(idx)}
                                        className={`relative w-24 h-24 md:w-32 md:h-32 rounded-3xl overflow-hidden border-2 transition-all shrink-0 ${activeImageIndex === idx ? 'border-indigo-600 scale-105 shadow-xl' : 'border-transparent opacity-60 hover:opacity-100 hover:scale-105'}`}
                                    >
                                        <img src={img} className="w-full h-full object-cover" alt={`${product.title} gallery ${idx}`} />
                                    </button>
                                ))}
                            </div>
                        )}
                    </div>

                    <div className="bg-white dark:bg-[#0a0a0a] p-10 rounded-[3rem] border dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-10">
                            <h2 className="text-2xl font-black dark:text-white italic uppercase tracking-widest">Nodal Intelligence.</h2>
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Live Metrics</span>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
                            <div className="p-8 bg-gray-50 dark:bg-white/5 rounded-3xl border dark:border-white/5 text-center group hover:bg-indigo-500 transition-all duration-500">
                                <div className="w-12 h-12 bg-indigo-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-white/20 transition-colors">
                                    <EyeIcon className="w-6 h-6 text-indigo-500 group-hover:text-white" />
                                </div>
                                <span className="text-3xl font-black dark:text-white group-hover:text-white italic">{product.viewCount.toLocaleString()}</span>
                            </div>
                            <div className="p-8 bg-gray-50 dark:bg-white/5 rounded-3xl border dark:border-white/5 text-center group hover:bg-violet-500 transition-all duration-500">
                                <div className="w-12 h-12 bg-violet-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-white/20 transition-colors">
                                    <ShoppingBagIcon className="w-6 h-6 text-violet-500 group-hover:text-white" />
                                </div>
                                <span className="text-3xl font-black dark:text-white group-hover:text-white italic">{product.salesCount.toLocaleString()}</span>
                            </div>
                            <div className="p-8 bg-gray-50 dark:bg-white/5 rounded-3xl border dark:border-white/5 text-center group hover:bg-fuchsia-500 transition-all duration-500">
                                <div className="w-12 h-12 bg-fuchsia-600/10 rounded-2xl flex items-center justify-center mx-auto mb-6 group-hover:bg-white/20 transition-colors">
                                    <ArrowDownTrayIcon className="w-6 h-6 text-fuchsia-500 group-hover:text-white" />
                                </div>
                                <span className="text-3xl font-black dark:text-white group-hover:text-white italic">{product.downloadCount.toLocaleString()}</span>
                            </div>
                        </div>
                    </div>

                    <div className="bg-white dark:bg-[#0a0a0a] p-10 rounded-[3rem] border dark:border-gray-800 shadow-2xl">
                        <h2 className="text-2xl font-black dark:text-white italic uppercase mb-8 tracking-widest">Logic Specs.</h2>
                        <p className="text-gray-500 dark:text-gray-400 text-lg leading-relaxed font-medium mb-12">{product.description}</p>
                    </div>

                    <div className="bg-white dark:bg-[#0a0a0a] p-10 rounded-[3rem] border dark:border-gray-800 shadow-2xl">
                        <div className="flex items-center justify-between mb-10">
                            <h2 className="text-2xl font-black dark:text-white italic uppercase tracking-widest">Integrity Audit.</h2>
                            <div className="flex items-center space-x-2">
                                <StarIcon className="w-5 h-5 text-yellow-500" />
                                <span className="text-2xl font-black dark:text-white italic">{product.rating.toFixed(1)}</span>
                            </div>
                        </div>
                        {product.reviews.length === 0 ? (
                            <p className="text-center py-10 text-xs font-bold text-gray-400 uppercase italic">No audit signals received yet.</p>
                        ) : (
                            <div className="space-y-6">
                                {product.reviews.map(review => (
                                    <div key={review.id} className="p-8 bg-gray-50 dark:bg-white/5 rounded-[2.5rem] border dark:border-white/5">
                                        <div className="flex items-center justify-between mb-4">
                                            <span className="text-[10px] font-black dark:text-white uppercase italic">{review.userName}</span>
                                            <div className="flex items-center space-x-1">
                                                {Array.from({ length: 5 }).map((_, i) => (
                                                    <StarIcon key={i} className={`w-3 h-3 ${i < review.rating ? 'text-yellow-500' : 'text-gray-300 dark:text-white/10'}`} />
                                                ))}
                                            </div>
                                        </div>
                                        <p className="text-gray-500 dark:text-gray-400 text-sm leading-relaxed font-medium italic">"{review.comment}"</p>
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>

                <div className="lg:col-span-4 space-y-10">
                    <div className="bg-white dark:bg-[#0a0a0a] p-10 rounded-[3rem] border dark:border-gray-800 shadow-2xl sticky top-32">
                        <div className="flex items-center justify-between mb-8">
                            <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Acquisition Fee</span>
                            <span className="text-5xl font-black dark:text-white italic tracking-tighter">{formatINR(product.price)}</span>
                        </div>
                        <button onClick={handlePurchase} className="w-full py-6 bg-indigo-600 text-white rounded-[2rem] font-black text-xl uppercase italic shadow-2xl hover:bg-indigo-700 transition-all mb-8 flex items-center justify-center space-x-3">
                            <span>Acquire Node</span>
                            <BoltIcon className="w-6 h-6" />
                        </button>
                        
                        <div 
                          onClick={() => setView({ page: 'seller-profile', id: product.sellerId })}
                          className="mt-10 pt-8 border-t dark:border-white/5 flex items-center space-x-4 cursor-pointer group hover:bg-gray-50 dark:hover:bg-white/5 p-2 rounded-2xl transition-colors"
                        >
                            <div className="w-12 h-12 rounded-2xl bg-indigo-600 flex items-center justify-center text-white text-xl font-black italic shadow-lg">{product.sellerName[0]}</div>
                            <div>
                                <p className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Authorized Seller</p>
                                <p className="text-sm font-black dark:text-white uppercase italic group-hover:text-indigo-600 transition-colors">{product.sellerName}</p>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const ProductCard: React.FC<{ 
    product: Product; 
    onSelect: (id: string) => void; 
    onSellerClick?: (id: string) => void 
}> = ({ product, onSelect, onSellerClick }) => {
    return (
        <motion.div 
            whileHover={{ y: -10 }}
            onClick={() => onSelect(product.id)}
            className="bg-white dark:bg-[#0a0a0a] rounded-[2.5rem] overflow-hidden border border-gray-100 dark:border-gray-800/60 shadow-xl cursor-pointer group"
        >
            <div className="aspect-[4/3] relative overflow-hidden">
                <img src={product.previewImage} alt={product.title} className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-110" />
                <div className="absolute top-6 right-6 px-4 py-2 bg-white/90 dark:bg-black/80 backdrop-blur-md rounded-full border border-black/5 dark:border-white/10 shadow-lg">
                    <span className="text-xs font-black italic uppercase tracking-wider dark:text-white">{formatINR(product.price)}</span>
                </div>
            </div>
            <div className="p-8 space-y-4">
                <div className="flex items-center justify-between">
                    <span className="text-[10px] font-black text-indigo-600 dark:text-indigo-400 uppercase tracking-widest italic">{product.category}</span>
                    <div className="flex items-center space-x-1">
                        <StarIcon className="w-3 h-3 text-yellow-500" />
                        <span className="text-[10px] font-black dark:text-white italic">{product.rating.toFixed(1)}</span>
                    </div>
                </div>
                <h3 className="text-xl font-black dark:text-white italic uppercase tracking-tighter leading-tight group-hover:text-indigo-600 transition-colors">{product.title}</h3>
                <div 
                    onClick={(e) => {
                        if (onSellerClick) {
                            e.stopPropagation();
                            onSellerClick(product.sellerId);
                        }
                    }}
                    className="flex items-center space-x-2 pt-2 border-t dark:border-white/5 group/seller"
                >
                    <div className="w-6 h-6 bg-gray-100 dark:bg-white/5 rounded-full flex items-center justify-center text-[8px] font-black dark:text-gray-400 italic">
                        {product.sellerName[0]}
                    </div>
                    <span className="text-[10px] font-bold text-gray-400 uppercase italic truncate">{product.sellerName}</span>
                </div>
            </div>
        </motion.div>
    );
};

const LoginPage = ({ setView, redirect }: { setView: (v: any) => void; redirect?: any }) => {
    const { login, loginWithGoogle, register } = useAuth();
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [name, setName] = useState('');
    const [isReg, setIsReg] = useState(false);

    return (
        <div className="container mx-auto px-4 py-40 flex justify-center">
            <div className="w-full max-w-md bg-white dark:bg-[#0a0a0a] rounded-[3rem] p-12 border dark:border-gray-800 shadow-2xl">
                <h1 className="text-4xl font-black italic uppercase dark:text-white mb-8 text-center">{isReg ? 'Register' : 'Authorize'}</h1>
                <div className="space-y-4">
                    {isReg && <input type="text" placeholder="Full Name" className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 border-none dark:text-white font-bold italic" value={name} onChange={e => setName(e.target.value)} />}
                    <input type="email" placeholder="Agent Email" className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 border-none dark:text-white font-bold italic" value={email} onChange={e => setEmail(e.target.value)} />
                    <input type="password" placeholder="Key Phrase" className="w-full px-8 py-5 rounded-2xl bg-gray-50 dark:bg-white/5 border-none dark:text-white font-bold italic" value={password} onChange={e => setPassword(e.target.value)} />
                    <button onClick={async () => { 
                      if (isReg) await register(name, email, password);
                      else await login(email, password); 
                      setView(redirect || { page: 'home' }); 
                    }} className="w-full py-5 bg-indigo-600 text-white rounded-2xl font-black text-lg uppercase italic shadow-xl">{isReg ? 'Create Identity' : 'Handshake'}</button>
                    <button onClick={loginWithGoogle} className="w-full py-5 border dark:border-white/10 dark:text-white rounded-2xl flex items-center justify-center space-x-3 italic text-xs font-black uppercase">
                        <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/hf/google.svg" className="w-5 h-5" alt="G" />
                        <span>Google Neural Link</span>
                    </button>
                    <button onClick={() => setIsReg(!isReg)} className="w-full text-[10px] font-black uppercase text-gray-400 italic text-center">Switch to {isReg ? 'Login' : 'Registration'}</button>
                </div>
            </div>
        </div>
    );
};

const DashboardPage = ({ setView }: { setView: (v: any) => void }) => {
    const { user, logout, upgradeToPro } = useAuth();
    const [purchases, setPurchases] = useState<any[]>([]);

    useEffect(() => {
        if (user) {
            api.getUserPurchases(user.uid).then(setPurchases);
        }
    }, [user]);

    if (!user) return <LoginPage setView={setView} />;

    return (
        <div className="container mx-auto px-4 py-32 md:py-48">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-16">
                <div className="lg:col-span-4 space-y-12">
                    <div className="bg-white dark:bg-[#0a0a0a] rounded-[3rem] p-12 border dark:border-gray-800 shadow-2xl text-center">
                        <div className="w-32 h-32 bg-indigo-600 rounded-full mx-auto mb-8 flex items-center justify-center text-4xl font-black text-white shadow-2xl relative overflow-hidden">
                            {user.avatar ? <img src={user.avatar} className="w-full h-full object-cover" /> : user.name[0]}
                        </div>
                        <h2 className="text-3xl font-black dark:text-white italic uppercase tracking-tighter mb-2">{user.name}</h2>
                        <p className="text-[10px] text-gray-400 font-bold uppercase tracking-widest mb-8">{user.email}</p>
                        
                        <div className="grid grid-cols-2 gap-4 mb-8">
                            <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-[2rem] border dark:border-white/5">
                                <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Reputation</span>
                                <span className="text-xl font-black text-indigo-600 italic">{user.reputation}%</span>
                            </div>
                            <div className="p-6 bg-gray-50 dark:bg-white/5 rounded-[2rem] border dark:border-white/5">
                                <span className="text-[8px] font-black text-gray-400 uppercase block mb-1">Vault</span>
                                <span className="text-xl font-black text-indigo-600 italic">{formatINR(user.walletBalance)}</span>
                            </div>
                        </div>

                        {!user.isPro ? (
                            <button onClick={upgradeToPro} className="w-full py-4 bg-gradient-to-r from-yellow-500 to-orange-500 text-black rounded-2xl font-black text-xs uppercase italic shadow-xl mb-4">Upgrade to Elite (₹999/yr)</button>
                        ) : (
                            <div className="px-4 py-2 bg-indigo-600/10 border border-indigo-600/20 rounded-xl text-indigo-600 text-[10px] font-black uppercase italic mb-4">Elite Pro Active</div>
                        )}
                    </div>
                    
                    <button onClick={async () => { await logout(); setView({ page: 'home' }); }} className="w-full py-6 bg-red-500/10 text-red-500 rounded-[2rem] font-black text-sm uppercase italic border border-red-500/20">Terminate Link</button>
                </div>
                
                <div className="lg:col-span-8 space-y-16">
                    <div>
                        <h3 className="text-4xl font-black dark:text-white italic uppercase tracking-tighter mb-10">Active Acquisitions.</h3>
                        <div className="space-y-6">
                            {purchases.length === 0 ? (
                                <p className="text-gray-400 font-bold italic uppercase text-xs tracking-widest">No active codebases.</p>
                            ) : (
                                purchases.map(p => (
                                    <div key={p.id} className="bg-white dark:bg-[#0a0a0a] p-8 rounded-[2.5rem] border dark:border-gray-800 flex items-center justify-between shadow-xl">
                                        <div className="flex items-center space-x-6">
                                            <div className="w-16 h-16 rounded-2xl overflow-hidden shadow-lg border dark:border-white/10">
                                                <img src={p.previewImage} className="w-full h-full object-cover" />
                                            </div>
                                            <div>
                                                <h4 className="text-xl font-black dark:text-white italic uppercase tracking-tighter">{p.title}</h4>
                                                <span className={`text-[8px] font-black uppercase tracking-widest italic ${p.purchaseStatus === 'approved' ? 'text-green-500' : 'text-yellow-500'}`}>{p.purchaseStatus}</span>
                                            </div>
                                        </div>
                                        <button onClick={() => setView({ page: 'product', id: p.id })} className="p-4 bg-gray-50 dark:bg-white/5 rounded-2xl dark:text-white hover:bg-indigo-600 hover:text-white transition-all">
                                            <ChevronRightIcon className="w-5 h-5" />
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const AdminDashboardPage = ({ setView }: { setView: (v: any) => void }) => {
    const { user } = useAuth();
    const { show } = useToast();
    const [pendingProducts, setPendingProducts] = useState<Product[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    const loadPending = useCallback(async () => {
        setIsLoading(true);
        const all = await api.getAllProductsAdmin();
        setPendingProducts(all.filter(p => !p.approved));
        setIsLoading(false);
    }, []);

    useEffect(() => {
        if (!user || user.role !== Role.ADMIN) {
            setView({ page: 'home' });
            return;
        }
        loadPending();
    }, [user, loadPending, setView]);

    const handleApprove = async (id: string) => {
        try {
            await api.approveProduct(id);
            show("Node Authorized.", "success");
            loadPending();
        } catch (e: any) {
            show("Authorization failure.", "error");
        }
    };

    const handleReject = async (id: string) => {
        try {
            await api.rejectProduct(id);
            show("Node Decommissioned.", "error");
            loadPending();
        } catch (e: any) {
            show("Decommission failure.", "error");
        }
    };

    if (isLoading) return <div className="py-40"><SkeletonLoader count={1} /></div>;

    return (
        <div className="container mx-auto px-4 py-32 md:py-48">
            <div className="flex flex-col md:flex-row md:items-end justify-between mb-16 gap-6">
                <div>
                    <h1 className="text-5xl md:text-8xl font-black dark:text-white italic uppercase tracking-tighter">Audit Queue.</h1>
                </div>
                <div className="px-6 py-3 bg-white dark:bg-white/5 rounded-2xl border dark:border-white/5 flex items-center space-x-4 shadow-xl">
                    <span className="text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Awaiting Clearance:</span>
                    <span className="text-2xl font-black text-indigo-500 italic">{pendingProducts.length}</span>
                </div>
            </div>

            <div className="bg-white dark:bg-[#0a0a0a] rounded-[3.5rem] border dark:border-gray-800 shadow-2xl overflow-hidden">
                {pendingProducts.length === 0 ? (
                    <div className="py-32 text-center">
                        <p className="text-sm font-black text-gray-400 uppercase tracking-widest italic">All nodal signals are clear.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-left">
                            <thead className="border-b dark:border-white/5">
                                <tr className="bg-gray-50/50 dark:bg-white/5">
                                    <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Signal Identity</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Valuation</th>
                                    <th className="px-8 py-6 text-[10px] font-black text-gray-400 uppercase tracking-widest italic">Actions</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y dark:divide-white/5">
                                {pendingProducts.map(p => (
                                    <tr key={p.id} className="hover:bg-gray-50/30 dark:hover:bg-white/[0.02] transition-colors">
                                        <td className="px-8 py-6 flex items-center space-x-4">
                                            <div className="w-12 h-12 rounded-xl overflow-hidden shadow-lg border dark:border-white/10">
                                                <img src={p.previewImage} alt={p.title} className="w-full h-full object-cover" />
                                            </div>
                                            <span className="font-black dark:text-white uppercase italic">{p.title}</span>
                                        </td>
                                        <td className="px-8 py-6 font-black dark:text-white italic">{formatINR(p.price)}</td>
                                        <td className="px-8 py-6 flex items-center space-x-3">
                                            <button onClick={() => handleApprove(p.id)} className="p-3 bg-green-500/10 text-green-500 rounded-xl hover:bg-green-500 hover:text-white transition-all border border-green-500/20"><CheckCircleIcon className="w-5 h-5" /></button>
                                            <button onClick={() => handleReject(p.id)} className="p-3 bg-red-500/10 text-red-500 rounded-xl hover:bg-red-500 hover:text-white transition-all border border-red-500/20"><TrashIcon className="w-5 h-5" /></button>
                                            <button onClick={() => setView({ page: 'product', id: p.id })} className="p-3 bg-gray-100 dark:bg-white/5 rounded-xl"><MagnifyingGlassIcon className="w-5 h-5" /></button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>
        </div>
    );
};

const MainApp = () => {
    const [view, setView] = useState<{ page: string; id?: string; redirect?: any }>({ page: 'home' });
    const [notifOpen, setNotifOpen] = useState(false);
    const { isLoading } = useAuth();

    useEffect(() => { window.scrollTo(0, 0); }, [view]);

    const renderPage = () => {
        if (isLoading) return <div className="min-h-screen flex items-center justify-center"><div className="w-12 h-12 border-4 border-indigo-600 border-t-transparent rounded-full animate-spin" /></div>;
        switch (view.page) {
            case 'home': return <HomePage setView={setView} />;
            case 'explore': return <ExplorePage setView={setView} />;
            case 'sell': return <SellPage setView={setView} />;
            case 'product': return <ProductPage productId={view.id!} setView={setView} />;
            case 'login': return <LoginPage setView={setView} redirect={view.redirect} />;
            case 'profile': return <DashboardPage setView={setView} />;
            case 'seller-profile': return <SellerProfilePage sellerId={view.id!} setView={setView} />;
            case 'admin-dashboard': return <AdminDashboardPage setView={setView} />;
            default: return <HomePage setView={setView} />;
        }
    };

    return (
        <div className="min-h-screen bg-gray-50 dark:bg-[#0a0a0a] transition-colors duration-500 pb-24 lg:pb-0">
            <Header setView={setView} onNotifOpen={() => setNotifOpen(true)} currentView={view.page} />
            <AnimatePresence mode="wait">
                <motion.div key={view.page + (view.id || '')} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                    {renderPage()}
                </motion.div>
            </AnimatePresence>
            <BottomNav currentView={view.page} setView={setView} />
            <footer className="py-20 border-t dark:border-white/5 bg-white dark:bg-[#0a0a0a] text-center">
                <p className="text-[10px] font-black uppercase tracking-[0.4em] text-gray-400 italic">Authorized Logic Vault // Codastra Elite</p>
            </footer>
        </div>
    );
};

const App = () => (
    <ThemeProvider>
        <ToastProvider>
            <AuthProvider>
                <MainApp />
            </AuthProvider>
        </ToastProvider>
    </ThemeProvider>
);

export default App;