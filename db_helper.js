// ===== DATABASE HELPER =====
const DB_NAME = 'SokoPulsePOS';
const DB_VERSION = 6;

function openDB() {
    return new Promise(function(resolve, reject) {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onsuccess = function(e) { resolve(e.target.result); };
        req.onerror = function(e) { reject(e.target.error); };
        req.onupgradeneeded = function(e) {
            const db = e.target.result;
            const stores = {
                'products': ['name', 'category', 'barcode'],
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
                    console.log('✅ Created store: ' + name);
                }
            }
        };
    });
}

// Helper functions
function dbAdd(db, storeName, data) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.add(data);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function dbPut(db, storeName, data) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.put(data);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function dbGet(db, storeName, id) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.get(id);
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function dbGetAll(db, storeName) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readonly');
        const store = tx.objectStore(storeName);
        const req = store.getAll();
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

function dbDelete(db, storeName, id) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.delete(id);
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
    });
}

function dbClear(db, storeName) {
    return new Promise(function(resolve, reject) {
        const tx = db.transaction(storeName, 'readwrite');
        const store = tx.objectStore(storeName);
        const req = store.clear();
        req.onsuccess = function() { resolve(); };
        req.onerror = function() { reject(req.error); };
    });
}
