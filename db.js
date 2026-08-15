// ============================================
// MASTER DATABASE - ONE FILE FOR ALL PAGES
// ============================================
const DB_NAME = 'SokoPulsePOS';
const DB_VERSION = 7;

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




// ===== LICENSE PASSWORD SYSTEM =====
const LICENSE_PASSWORD = 'SokoPulse2026'; // Change this monthly

function verifyLicensePassword(password) {
    return password === LICENSE_PASSWORD;
}

function checkLicenseStatus() {
    const stored = localStorage.getItem('license_verified');
    const verifiedDate = localStorage.getItem('license_verified_date');
    
    if (!stored || !verifiedDate) {
        return false;
    }
    
    // Check if password was verified in the last 30 days
    const verified = new Date(verifiedDate);
    const now = new Date();
    const daysDiff = (now - verified) / (1000 * 60 * 60 * 24);
    
    // Force re-verification after 30 days
    if (daysDiff > 30) {
        localStorage.removeItem('license_verified');
        localStorage.removeItem('license_verified_date');
        return false;
    }
    
    return stored === 'true';
}

function setLicenseVerified() {
    localStorage.setItem('license_verified', 'true');
    localStorage.setItem('license_verified_date', new Date().toISOString());
}
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
