import { useState, useEffect } from 'react';

// Helper function to format UTC timestamps to IST
function formatIST(dateString) {
    if (!dateString) return 'N/A';
    return new Date(dateString).toLocaleString('en-IN', {
        timeZone: 'Asia/Kolkata',
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true
    });
}

function App() {
    const [stores, setStores] = useState([]);
    const [metrics, setMetrics] = useState({ total: 0, active: 0, provisioning: 0, failed: 0 });
    const [logs, setLogs] = useState([]);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [deleteTarget, setDeleteTarget] = useState(null);
    const [loading, setLoading] = useState(true);

    // Fetch stores, metrics, and logs
    const fetchData = async () => {
        try {
            const [storesRes, metricsRes, logsRes] = await Promise.all([
                fetch('/api/stores'),
                fetch('/api/metrics'),
                fetch('/api/events')
            ]);

            const storesData = await storesRes.json();
            const metricsData = await metricsRes.json();
            const logsData = await logsRes.json();

            setStores(storesData);
            setMetrics(metricsData);
            setLogs(logsData);
            setLoading(false);
        } catch (error) {
            console.error('Failed to fetch data:', error);
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchData();
        const interval = setInterval(fetchData, 5000); // Poll every 5 seconds
        return () => clearInterval(interval);
    }, []);

    return (
        <div className="min-h-screen bg-slate-50 font-sans text-slate-900 pb-12">
            {/* Header */}
            <header className="bg-white border-b border-slate-200 sticky top-0 z-30 backdrop-blur-sm bg-white/95 supports-[backdrop-filter]:bg-white/80">
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-3.5">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="bg-indigo-600 text-white p-2 rounded-lg shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
                                </svg>
                            </div>
                            <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                                WooStore
                            </h1>
                        </div>
                        <button
                            onClick={() => setShowCreateModal(true)}
                            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg font-medium shadow-sm transition-all duration-200 hover:shadow-md flex items-center gap-2 text-sm"
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M10 3a1 1 0 011 1v5h5a1 1 0 110 2h-5v5a1 1 0 11-2 0v-5H4a1 1 0 110-2h5V4a1 1 0 011-1z" clipRule="evenodd" />
                            </svg>
                            <span>New Store</span>
                        </button>
                    </div>
                </div>
            </header>

            {/* Main Content */}
            <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
                {/* Stats Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
                    <MetricCard label="Total Stores" value={metrics.total} type="total" />
                    <MetricCard label="Active" value={metrics.active} type="active" />
                    <MetricCard label="Provisioning" value={metrics.provisioning} type="provisioning" />
                    <MetricCard label="Failed" value={metrics.failed} type="failed" />
                </div>

                {loading ? (
                    <div className="flex flex-col items-center justify-center py-20 min-h-[400px]">
                        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-slate-900 mb-4"></div>
                        <p className="text-slate-500 font-medium">Loading environment...</p>
                    </div>
                ) : (
                    /* Main Two-Column Layout */
                    <div className="grid grid-cols-1 lg:grid-cols-[2.5fr_1fr] gap-8 items-start">
                        {/* Left Column: Stores List (70%) */}
                        <div className="flex flex-col gap-5">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-200/60">
                                <h2 className="text-lg font-bold text-slate-900">Your Stores</h2>
                                <span className="bg-slate-100 text-slate-600 px-2.5 py-0.5 rounded-full text-xs font-semibold shadow-sm border border-slate-200">
                                    {stores.length}
                                </span>
                            </div>

                            {stores.length === 0 ? (
                                <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-16 text-center">
                                    <div className="w-16 h-16 bg-slate-50 rounded-full flex items-center justify-center mx-auto mb-6 border border-slate-100">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-slate-400" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13L5.4 5M7 13l-2.293 2.293c-.63.63-.184 1.707.707 1.707H17m0 0a2 2 0 100 4 2 2 0 000-4zm-8 2a2 2 0 11-4 0 2 2 0 014 0z" />
                                        </svg>
                                    </div>
                                    <h3 className="text-lg font-bold text-slate-900 mb-2">No stores yet</h3>
                                    <p className="text-slate-500 mb-8 max-w-sm mx-auto">Create your first WooCommerce store to get started with the platform.</p>
                                    <button
                                        onClick={() => setShowCreateModal(true)}
                                        className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2.5 rounded-lg font-medium shadow-sm transition-all"
                                    >
                                        Create New Store
                                    </button>
                                </div>
                            ) : (
                                <div className="space-y-4">
                                    {stores.map(store => (
                                        <StoreCard key={store.store_id} store={store} onDelete={setDeleteTarget} />
                                    ))}
                                </div>
                            )}
                        </div>

                        {/* Right Column: Activity Log (30%) */}
                        <div className="flex flex-col gap-4 sticky top-24">
                            <div className="flex items-center justify-between pb-1 border-b border-slate-200/60 h-[34px]">
                                <h2 className="text-lg font-bold text-slate-900">Activity Log</h2>
                            </div>
                            <ActivityLog logs={logs} />
                        </div>
                    </div>
                )}
            </main>

            {/* Modals */}
            {showCreateModal && <CreateStoreModal onClose={() => setShowCreateModal(false)} onSuccess={fetchData} />}
            {deleteTarget && <DeleteModal store={deleteTarget} onClose={() => setDeleteTarget(null)} onSuccess={fetchData} />}
        </div>
    );
}

// Activity Log Component (Content Only)
function ActivityLog({ logs }) {
    if (!logs || logs.length === 0) {
        return (
            <div className="bg-white border border-slate-200 rounded-xl p-8 text-center shadow-sm">
                <p className="text-slate-400 text-sm">No recent activity</p>
            </div>
        );
    }

    return (
        <div className="bg-white border border-slate-200 rounded-xl shadow-sm ring-1 ring-slate-200/50 overflow-hidden flex flex-col max-h-[calc(100vh-180px)]">
            <div className="flex-1 min-h-0 overflow-y-auto custom-scrollbar p-0">
                {logs.map((log, i) => (
                    <div key={i} className="p-4 border-b border-slate-100 last:border-0 hover:bg-slate-50/80 transition-colors group">
                        <div className="flex justify-between items-start gap-3 mb-1.5">
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-wider border ${log.severity === 'error' ? 'bg-red-50 text-red-700 border-red-100' :
                                log.severity === 'warning' ? 'bg-amber-50 text-amber-700 border-amber-100' :
                                    log.severity === 'success' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
                                        'bg-slate-50 text-slate-600 border-slate-200'
                                }`}>
                                {log.event_type}
                            </span>
                            <span className="text-[10px] text-slate-400 font-mono whitespace-nowrap group-hover:text-slate-500 transition-colors">
                                {new Date(log.created_at).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}
                            </span>
                        </div>
                        <p className="text-xs text-slate-700 font-medium leading-relaxed">
                            {log.message}
                        </p>
                        {log.store_name && (
                            <div className="mt-2 flex items-center gap-1.5">
                                <div className="w-1 h-1 rounded-full bg-slate-300"></div>
                                <p className="text-[10px] text-slate-400 font-medium uppercase tracking-wide">{log.store_name}</p>
                            </div>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Metric Card Component
function MetricCard({ label, value, type }) {
    const styles = {
        total: { border: 'border-slate-200', text: 'text-slate-600', value: 'text-slate-900', bg: 'bg-white' },
        active: { border: 'border-emerald-100', text: 'text-emerald-700', value: 'text-emerald-900', bg: 'bg-emerald-50/30' },
        provisioning: { border: 'border-amber-100', text: 'text-amber-700', value: 'text-amber-900', bg: 'bg-amber-50/30' },
        failed: { border: 'border-red-100', text: 'text-red-700', value: 'text-red-900', bg: 'bg-red-50/30' }
    };

    const s = styles[type] || styles.total;

    return (
        <div className={`${s.bg} border ${s.border} rounded-xl p-5 shadow-sm`}>
            <p className={`text-xs font-bold uppercase tracking-wider ${s.text} mb-2`}>{label}</p>
            <p className={`text-2xl font-bold ${s.value} tracking-tight`}>{value}</p>
        </div>
    );
}

// Store Card Component
function StoreCard({ store, onDelete }) {
    const getStatusStyle = () => {
        const s = store.status.toLowerCase();
        if (s.includes('provision') || s.includes('deploy') || s.includes('creat')) return 'bg-amber-50 text-amber-700 border-amber-200 ring-amber-100';
        if (s === 'ready') return 'bg-emerald-50 text-emerald-700 border-emerald-200 ring-emerald-100';
        if (s === 'failed') return 'bg-red-50 text-red-700 border-red-200 ring-red-100';
        if (s.includes('delet')) return 'bg-slate-50 text-slate-600 border-slate-200 ring-slate-100';
        return 'bg-slate-50 text-slate-700 border-slate-200';
    };

    const statusStyle = getStatusStyle();
    const isReady = store.status.toLowerCase() === 'ready';
    const isProvisioning = store.status.toLowerCase().includes('provision');

    return (
        <div className="bg-white rounded-xl shadow-sm border border-slate-200 p-5 hover:shadow-md hover:border-indigo-100 transition-all duration-200 group relative overflow-hidden">
            {isProvisioning && (
                <div className="absolute top-0 left-0 w-full h-1 bg-amber-100">
                    <div className="h-full bg-amber-500 animate-progress-indeterminate"></div>
                </div>
            )}

            <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
                <div className="flex items-start gap-4">
                    <div className="w-12 h-12 rounded-lg bg-indigo-50 flex items-center justify-center border border-indigo-100 text-xl shadow-sm shrink-0">
                        🛍️
                    </div>
                    <div>
                        <div className="flex items-center gap-3">
                            <h3 className="text-base font-bold text-slate-900 leading-tight">{store.name}</h3>
                            <div className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wide border ${statusStyle}`}>
                                {store.status}
                            </div>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-slate-500 mt-1.5 font-medium">
                            <span className="font-mono bg-slate-50 px-1.5 py-0.5 rounded border border-slate-100 text-slate-400">ID: {store.store_id}</span>
                            <span>•</span>
                            <span>{formatIST(store.created_at)}</span>
                        </div>
                    </div>
                </div>

                <div className="flex items-center gap-2 w-full sm:w-auto mt-2 sm:mt-0">
                    {isReady && (
                        <>
                            <a
                                href={store.url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-indigo-300 hover:text-indigo-600 text-slate-700 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-center transition-all shadow-sm hover:shadow active:translate-y-0.5 flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                                </svg>
                                Storefront
                            </a>
                            <a
                                href={store.admin_url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="flex-1 sm:flex-none bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-600 px-3 py-2 rounded-lg text-xs font-bold uppercase tracking-wide text-center transition-all shadow-sm flex items-center justify-center gap-2"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                                </svg>
                                Admin
                            </a>
                        </>
                    )}
                    <button
                        onClick={() => onDelete(store)}
                        className={`p-2 rounded-lg transition-colors ml-1 ${isReady ? 'text-slate-300 hover:text-red-600 hover:bg-red-50' : 'text-slate-300 hover:text-red-500'}`}
                        title="Delete store"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </button>
                </div>
            </div>
            {isReady && store.admin_password && (
                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between group/pass">
                    <div className="flex items-center gap-2 text-xs">
                        <span className="text-slate-400 font-medium">🔑 Admin Password:</span>
                        <code className="font-mono text-slate-600 bg-slate-50 px-2 py-1 rounded border border-slate-100 select-all">{store.admin_password}</code>
                    </div>
                    <button
                        onClick={() => {
                            navigator.clipboard.writeText(store.admin_password);
                        }}
                        className="text-slate-300 hover:text-indigo-600 transition-colors p-1 rounded hover:bg-indigo-50"
                        title="Copy password"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                        </svg>
                    </button>
                </div>
            )}


            {
                store.error && (
                    <div className="mt-3 bg-red-50/50 border border-red-100 rounded-lg p-2.5 text-xs text-red-600 font-mono">
                        <span className="font-bold">Error:</span> {store.error}
                    </div>
                )
            }
        </div>

    );
}

// Create Store Modal
function CreateStoreModal({ onClose, onSuccess }) {
    const [name, setName] = useState('');
    const [type, setType] = useState('woocommerce');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            const response = await fetch('/api/stores', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name, type })
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Failed to create store');
            }

            onSuccess();
            onClose();
        } catch (err) {
            setError(err.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 animate-scale-in border border-slate-100">
                <div className="flex items-center justify-between mb-8">
                    <div>
                        <h2 className="text-xl font-bold text-slate-900">Create New Store</h2>
                        <p className="text-slate-500 text-sm mt-1">Deploy a new e-commerce environment</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-full p-2 transition-colors"
                    >
                        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M6 18L18 6M6 6l12 12"></path></svg>
                    </button>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Store Name
                        </label>
                        <input
                            type="text"
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            className="w-full px-4 py-3 border border-slate-200 rounded-xl focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-all placeholder:text-slate-400"
                            placeholder="e.g. My Tech Startup"
                            autoFocus
                            required
                            minLength={2}
                        />
                    </div>

                    <div className="mb-6">
                        <label className="block text-sm font-semibold text-slate-700 mb-2">
                            Platform
                        </label>
                        <div className="grid grid-cols-2 gap-3">
                            <button
                                type="button"
                                onClick={() => setType('woocommerce')}
                                className={`p-4 border rounded-xl text-left transition-all ${type === 'woocommerce'
                                    ? 'border-indigo-600 bg-indigo-50 ring-1 ring-indigo-600'
                                    : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50'
                                    }`}
                            >
                                <div className="font-bold text-slate-900 text-sm">WooCommerce</div>
                                <div className="text-xs text-slate-500 mt-1">Standard Stack</div>
                            </button>
                            <button
                                type="button"
                                disabled
                                className="p-4 border border-slate-100 rounded-xl text-left opacity-60 cursor-not-allowed bg-slate-50"
                            >
                                <div className="font-bold text-slate-400 text-sm">Medusa</div>
                                <div className="text-xs text-slate-400 mt-1">Coming 2026</div>
                            </button>
                        </div>
                    </div>

                    <div className="mb-8 bg-indigo-50/50 border border-indigo-100 rounded-xl p-4 flex gap-3 items-start">
                        <span className="text-indigo-500 mt-0.5">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                        </span>
                        <p className="text-sm text-indigo-900 leading-relaxed">
                            Provisioning usually takes <strong>2-3 minutes</strong>. We'll setup the database, file system, and auto-configure SSL.
                        </p>
                    </div>

                    {error && (
                        <div className="mb-6 bg-red-50 border border-red-200 rounded-xl p-4 text-sm text-red-700 flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                            </svg>
                            {error}
                        </div>
                    )}

                    <div className="flex gap-4">
                        <button
                            type="button"
                            onClick={onClose}
                            className="px-6 py-3 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                            disabled={loading}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            className="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-3 rounded-xl font-semibold shadow-md transition-all disabled:opacity-70 disabled:cursor-wait flex items-center justify-center gap-2"
                            disabled={loading}
                        >
                            {loading ? (
                                <>
                                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                                    <span>Deploying...</span>
                                </>
                            ) : (
                                <>
                                    <span>Deploy Store</span>
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 7l5 5m0 0l-5 5m5-5H6" />
                                    </svg>
                                </>
                            )}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

// Delete Confirmation Modal
function DeleteModal({ store, onClose, onSuccess }) {
    const [loading, setLoading] = useState(false);

    const handleDelete = async () => {
        setLoading(true);
        try {
            const response = await fetch(`/api/stores/${store.store_id}`, {
                method: 'DELETE'
            });

            if (!response.ok) {
                throw new Error('Failed to delete store');
            }

            onSuccess();
            onClose();
        } catch (error) {
            console.error('Delete failed:', error);
            alert('Failed to delete store: ' + error.message);
            setLoading(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm flex items-center justify-center p-4 z-50 animate-fade-in">
            <div className="bg-white rounded-2xl shadow-2xl max-w-sm w-full p-6 animate-scale-in border border-slate-100">
                <div className="text-center mb-6">
                    <div className="w-14 h-14 bg-red-50 rounded-full flex items-center justify-center mx-auto mb-4 border border-red-100">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                        </svg>
                    </div>
                    <h2 className="text-xl font-bold text-slate-900 mb-2">Delete Store?</h2>
                    <p className="text-slate-500 mb-1 leading-relaxed">
                        Are you sure you want to delete <strong className="text-slate-900">{store.name}</strong>?
                    </p>
                </div>

                <div className="bg-red-50 border border-red-100 rounded-xl p-4 mb-8 text-left">
                    <h4 className="text-xs font-bold text-red-800 uppercase tracking-wide mb-2">⚠️ Destructive Action</h4>
                    <ul className="text-xs text-red-700 space-y-1.5 list-disc list-inside">
                        <li>Deletes WordPress installation</li>
                        <li>Wipes all database data</li>
                        <li>Removes all products & orders</li>
                    </ul>
                </div>

                <div className="flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-3 border border-slate-200 rounded-xl font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
                        disabled={loading}
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleDelete}
                        className="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-xl font-semibold shadow-sm transition-all disabled:opacity-70"
                        disabled={loading}
                    >
                        {loading ? 'Deleting...' : 'Confirm Delete'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default App;
