// ============================================
// MASTER DATABASE - ONE FILE FOR ALL PAGES
// ============================================
const DB_NAME = 'SokoPulsePOS';
const DB_VERSION = 6;

// ===== AUTO-CREATE DATABASE ON LOAD =====
(function() {
    console.log('🔧 Checking database...');
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = function(e) {
        const db = e.target.result;
        const stores = {
            'products': ['name', 'category', 'barcode', 'price'],
            'customers': ['name', 'phone', 'email'],
            'orders': ['order_number', 'customer_id', 'date', 'status'],
            'returns': ['order_number', 'status', 'date'],
            'audit_log': ['user', 'action', 'date'],
            'stock_movements': ['product_id', 'type', 'date'],
            'settings': ['key'],
            'users': ['username', 'role'],
            'categories': ['name', 'parent_id'],
            'revoked_licenses': ['key', 'machine_id']
        };
        for (const [name, indexes] of Object.entries(stores)) {
            if (!db.objectStoreNames.contains(name)) {
                const store = db.createObjectStore(name, { keyPath: 'id', autoIncrement: true });
                for (const idx of indexes) {
                    store.createIndex(idx, idx, { unique: false });
                }
                console.log('✅ Created store:', name);
            }
        }
    };
    req.onsuccess = function() {
        console.log('✅ Database ready');
        req.result.close();
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
                'users': ['username', 'role'],
                'revoked_licenses': ['key', 'machine_id'],
                'categories': ['name', 'parent_id']
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
