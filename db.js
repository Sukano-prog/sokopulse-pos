// ============================================
// MASTER DATABASE - ONE FILE FOR ALL PAGES
// ============================================
const DB_NAME = 'SokoPulsePOS';
const DB_VERSION = 6;



// ===== IMMEDIATE DATABASE SETUP =====
// This runs as soon as db.js loads
(function() {
    console.log('🔧 Checking database setup...');
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onsuccess = function(e) {
        const db = e.target.result;
        const stores = Array.from(db.objectStoreNames);
        console.log('📋 Current stores:', stores);
        db.close();
    };
    req.onerror = function(e) {
        console.log('⚠️ Database not found, will be created on first use.');
    };
})();

function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = function(e) {
            const db = e.target.result;
            let created = [];
            
            // ALL 8 STORES - CREATED AT ONCE
            const stores = {
                'products': ['name', 'category', 'barcode', 'price'],
                'customers': ['name', 'phone', 'email'],
                'orders': ['order_number', 'customer_id', 'date', 'status'],
                'returns': ['order_number', 'status', 'date'],
                'audit_log': ['user', 'action', 'date'],
                'stock_movements': ['product_id', 'type', 'date'],
                'settings': ['key'],
                'users': ['username', 'role']
            };
            
            for (const [name, indexes] of Object.entries(stores)) {
                if (!db.objectStoreNames.contains(name)) {
                    const store = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                    for (const idx of indexes) {
                        store.createIndex(idx, idx, { unique: false });
                    }
                    created.push(name);
                    console.log('✅ Created store:', name);
                }
            }
            
            if (created.length > 0) {
                console.log('✅ Created stores:', created.join(', '));
            } else {
                console.log('✅ All stores already exist');
            }
        };
        req.onsuccess = e => resolve(e.target.result);
        req.onerror = e => reject(e.target.error);
    });
}

function dbGetAll(db, storeName) {
    return new Promise((resolve, reject) => {
        if (!db.objectStoreNames.contains(storeName)) {
            resolve([]);
            return;
        }
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}
