// ============================================
// SOKOPULSE POS - OFFLINE SYNC QUEUE
// ============================================

const SYNC_STORE = 'sync_queue';

// ===== SYNC STATE =====
var syncState = {
    isSyncing: false,
    total: 0,
    current: 0,
    succeeded: 0,
    failed: 0,
    lastSyncTime: null,
    lastOnlineTime: null
};

// ===== ADD TO SYNC QUEUE =====
function addToSyncQueue(db, storeName, action, data) {
    return new Promise(function(resolve, reject) {
        var syncItem = {
            store: storeName,
            action: action,
            data: JSON.stringify(data),
            status: 'pending',
            created_at: new Date().toISOString(),
            synced_at: null,
            error: null,
            retry_count: 0
        };
        
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        var store = tx.objectStore(SYNC_STORE);
        var req = store.add(syncItem);
        req.onsuccess = function() {
            console.log('Queued for sync:', action, storeName);
            updateSyncIndicator();
            resolve(req.result);
        };
        req.onerror = function() { reject(req.error); };
    });
}


// ===== SAFE GET SYNC QUEUE (handles missing store) =====
function safeGetSyncQueue(db) {
    return new Promise(function(resolve) {
        if (!db || !db.objectStoreNames) { resolve([]); return; }
        if (!db.objectStoreNames.contains('sync_queue')) {
            console.log('sync_queue store not found - returning empty');
            resolve([]);
            return;
        }
        try {
            var tx = db.transaction('sync_queue', 'readonly');
            var store = tx.objectStore('sync_queue');
            var index = store.index('status');
            var req = index.getAll('pending');
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror = function() { resolve([]); };
        } catch(e) {
            console.log('sync_queue error:', e.message);
            resolve([]);
        }
    });
}

// ===== SAFE GET ALL SYNC ITEMS =====
function safeGetAllSyncItems(db) {
    return new Promise(function(resolve) {
        if (!db || !db.objectStoreNames) { resolve([]); return; }
        if (!db.objectStoreNames.contains('sync_queue')) { resolve([]); return; }
        try {
            var tx = db.transaction('sync_queue', 'readonly');
            var store = tx.objectStore('sync_queue');
            var req = store.getAll();
            req.onsuccess = function() { resolve(req.result || []); };
            req.onerror = function() { resolve([]); };
        } catch(e) {
            console.log('sync_queue error:', e.message);
            resolve([]);
        }
    });
}

// ===== GET PENDING SYNC ITEMS =====
function getPendingSync(db) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readonly');
        var store = tx.objectStore(SYNC_STORE);
        var index = store.index('status');
        var req = index.getAll('pending');
        req.onsuccess = function() { resolve(req.result); };
        req.onerror = function() { reject(req.error); };
    });
}

// ===== GET ALL SYNC ITEMS =====
function getAllSyncItems(db) {
    return safeGetAllSyncItems(db);
}

// ===== MARK SYNCED =====
function markSynced(db, id) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        var store = tx.objectStore(SYNC_STORE);
        var getReq = store.get(id);
        getReq.onsuccess = function() {
            var item = getReq.result;
            if (item) {
                item.status = 'synced';
                item.synced_at = new Date().toISOString();
                var putReq = store.put(item);
                putReq.onsuccess = function() { resolve(); };
                putReq.onerror = function() { reject(putReq.error); };
            } else {
                resolve();
            }
        };
        getReq.onerror = function() { reject(getReq.error); };
    });
}

// ===== MARK FAILED =====
function markFailed(db, id, error) {
    return new Promise(function(resolve, reject) {
        var tx = db.transaction(SYNC_STORE, 'readwrite');
        var store = tx.objectStore(SYNC_STORE);
        var getReq = store.get(id);
        getReq.onsuccess = function() {
            var item = getReq.result;
            if (item) {
                item.status = 'failed';
                item.error = error;
                item.retry_count = (item.retry_count || 0) + 1;
                item.last_attempt = new Date().toISOString();
                var putReq = store.put(item);
                putReq.onsuccess = function() { resolve(); };
                putReq.onerror = function() { reject(putReq.error); };
            } else {
                resolve();
            }
        };
        getReq.onerror = function() { reject(getReq.error); };
    });
}

// ===== PROCESS SYNC QUEUE =====
// Reads pending orders directly from orders table (matches settings)
async function processSyncQueue() {
    if (syncState.isSyncing) {
        console.log('Sync already in progress');
        return syncState;
    }
    
    if (!isOnline()) {
        console.log('Offline - cannot sync');
        return { synced: 0, failed: 0, offline: true };
    }
    
    try {
        var db = await openDB();
        
        // Safe check: does orders store exist?
        if (!db.objectStoreNames.contains('orders')) {
            console.log('orders store not found - nothing to sync');
            updateSyncIndicator();
            return { synced: 0, failed: 0 };
        }
        
        // Read orders with pending etims status
        var orders = await dbGetAll(db, 'orders').catch(function() { return []; });
        if (!orders || orders.length === 0) {
            console.log('No orders in database');
            updateSyncIndicator();
            return { synced: 0, failed: 0 };
        }
        var pending = orders.filter(function(o) { 
            return o.etims_status === 'pending' || o.etims_status === 'failed' || !o.etims_status;
        });
        
        if (pending.length === 0) {
            console.log('No pending orders to sync');
            syncState.lastSyncTime = new Date().toISOString();
            updateSyncIndicator();
            return { synced: 0, failed: 0 };
        }
        
        console.log('Processing ' + pending.length + ' pending orders...');
        
        // Initialize sync state
        syncState.isSyncing = true;
        syncState.total = pending.length;
        syncState.current = 0;
        syncState.succeeded = 0;
        syncState.failed = 0;
        
        showSyncProgress();
        
        // Get business info
        var settings = await dbGetAll(db, 'settings');
        var map = {};
        settings.forEach(function(s) { map[s.key] = s.value; });
        var bizInfo = {
            business_pin: map.business_pin || 'P000000000X',
            storeName: map.storeName || 'SokoPulse',
            storeAddress: map.storeAddress || '',
            storePhone: map.storePhone || ''
        };
        
        for (var i = 0; i < pending.length; i++) {
            var order = pending[i];
            syncState.current = i + 1;
            updateSyncProgress();
            
            try {
                // Send to eTIMS
                var result = await sendInvoiceToEtims(order, bizInfo);
                
                if (result.success) {
                    order.etims_status = 'synced';
                    order.etims_serial = result.cuSerial;
                    order.etims_invoice_no = result.cuInvoiceNo;
                    order.etims_qr = result.qrCode;
                    order.synced_at = new Date().toISOString();
                    syncState.succeeded++;
                } else {
                    order.etims_status = 'failed';
                    order.etims_error = result.error || 'Unknown error';
                    order.last_attempt = new Date().toISOString();
                    syncState.failed++;
                }
                
                // Save the updated order back to the database
                var tx = db.transaction('orders', 'readwrite');
                tx.objectStore('orders').put(order);
                
                // Small delay
                await new Promise(function(r) { setTimeout(r, 300); });
                
            } catch(e) {
                order.etims_status = 'failed';
                order.etims_error = e.message;
                order.last_attempt = new Date().toISOString();
                syncState.failed++;
                
                var tx = db.transaction('orders', 'readwrite');
                tx.objectStore('orders').put(order);
                
                console.error('Failed to sync:', order.order_number, e.message);
            }
        }
        
        // Complete
        syncState.isSyncing = false;
        syncState.lastSyncTime = new Date().toISOString();
        
        hideSyncProgress();
        updateSyncIndicator();
        
        console.log('Sync complete:', syncState.succeeded, 'succeeded,', syncState.failed, 'failed');
        
        return { synced: syncState.succeeded, failed: syncState.failed };
        
    } catch(e) {
        console.error('Error processing sync queue:', e);
        syncState.isSyncing = false;
        hideSyncProgress();
        return { synced: 0, failed: 0, error: e.message };
    }
}

// ===== IS ONLINE =====
function isOnline() {
    return navigator.onLine;
}

// ===== SYNC PROGRESS UI (NON-INTRUSIVE TOAST) =====
function showSyncProgress() {
    var el = document.getElementById('syncProgressToast');
    if (!el) {
        el = document.createElement('div');
        el.id = 'syncProgressToast';
        el.style.cssText = 'position:fixed;top:70px;right:20px;background:white;border-radius:12px;padding:16px 20px;width:320px;max-width:90%;box-shadow:0 10px 30px rgba(0,0,0,0.15);border-left:4px solid #3b82f6;z-index:99999;font-family:Inter,sans-serif;';
        el.innerHTML = 
            '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px;">' +
                '<div style="display:flex;align-items:center;gap:8px;">' +
                    '<div style="width:10px;height:10px;background:#3b82f6;border-radius:50%;animation:pulse 1.5s infinite;"></div>' +
                    '<strong style="color:#0f172a;font-size:14px;">Syncing to eTIMS...</strong>' +
                '</div>' +
            '</div>' +
            '<div style="background:#f1f5f9;border-radius:6px;height:6px;overflow:hidden;margin-bottom:8px;">' +
                '<div id="syncProgressBar" style="height:100%;background:linear-gradient(90deg,#3b82f6,#22c55e);width:0%;transition:width 0.3s;border-radius:6px;"></div>' +
            '</div>' +
            '<div style="display:flex;justify-content:space-between;font-size:12px;color:#64748b;">' +
                '<span id="syncProgressText">0 / 0</span>' +
                '<span><span style="color:#166534;font-weight:600;" id="syncSuccessCount">0</span> ok · <span style="color:#991b1b;font-weight:600;" id="syncFailCount">0</span> failed</span>' +
            '</div>';
        document.body.appendChild(el);
    }
    el.style.display = 'block';
    updateSyncProgress();
}

function updateSyncProgress() {
    var percent = syncState.total > 0 ? (syncState.current / syncState.total) * 100 : 0;
    
    var bar = document.getElementById('syncProgressBar');
    var text = document.getElementById('syncProgressText');
    var pct = document.getElementById('syncProgressPercent');
    var succ = document.getElementById('syncSuccessCount');
    var fail = document.getElementById('syncFailCount');
    
    if (bar) bar.style.width = percent + '%';
    if (text) text.textContent = syncState.current + ' / ' + syncState.total;
    if (pct) pct.textContent = Math.round(percent) + '%';
    if (succ) succ.textContent = syncState.succeeded;
    if (fail) fail.textContent = syncState.failed;
}

function hideSyncProgress() {
    setTimeout(function() {
        var el = document.getElementById('syncProgressToast');
        if (el) {
            el.style.borderLeftColor = syncState.failed > 0 ? '#ef4444' : '#22c55e';
            el.innerHTML = 
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<div style="font-size:20px;font-weight:bold;color:' + (syncState.failed > 0 ? '#ef4444' : '#22c55e') + ';">' + (syncState.failed > 0 ? '!' : '✓') + '</div>' +
                    '<div>' +
                        '<strong style="color:#0f172a;font-size:14px;display:block;">' + (syncState.failed > 0 ? 'Sync Completed' : 'Synced to eTIMS') + '</strong>' +
                        '<span style="color:#64748b;font-size:12px;">' + syncState.succeeded + ' synced' + (syncState.failed > 0 ? ', ' + syncState.failed + ' failed' : '') + '</span>' +
                    '</div>' +
                '</div>';
            
            setTimeout(function() {
                el.style.transition = 'opacity 0.3s';
                el.style.opacity = '0';
                setTimeout(function() { el.style.display = 'none'; el.style.opacity = '1'; }, 300);
            }, 3000);
        }
    }, 300);
}

// ===== UPDATE SYNC INDICATOR (reads from orders like settings) =====
async function updateSyncIndicator() {
    var el = document.getElementById('syncStatus');
    if (!el) return;
    
    if (syncState.isSyncing) {
        el.textContent = 'Syncing (' + syncState.current + '/' + syncState.total + ')';
        el.style.background = '#dbeafe';
        el.style.color = '#1e40af';
        return;
    }
    
    try {
        var db = await openDB();
        var orders = await dbGetAll(db, 'orders');
        
        var synced = 0, pending = 0, failed = 0;
        orders.forEach(function(o) {
            var status = o.etims_status || 'pending';
            if (status === 'synced') synced++;
            else if (status === 'failed') failed++;
            else pending++;
        });
        
        if (!isOnline()) {
            el.textContent = 'Offline (' + pending + ')';
            el.style.background = '#fee2e2';
            el.style.color = '#991b1b';
            el.title = 'You are offline. ' + pending + ' transaction(s) waiting to sync.';
            el.onclick = showSyncDetails;
            return;
        }
        
        if (pending > 0) {
            el.textContent = 'Sync (' + pending + ')';
            el.style.background = '#fef3c7';
            el.style.color = '#92400e';
            el.title = synced + ' synced, ' + pending + ' pending, ' + failed + ' failed';
            el.onclick = function() { processSyncQueue(); };
        } else if (failed > 0) {
            el.textContent = 'Online \u00b7 ' + failed + ' failed';
            el.style.background = '#fee2e2';
            el.style.color = '#991b1b';
            el.title = failed + ' failed transaction(s) - click to retry';
            el.onclick = function() { retryFailed(); };
        } else {
            el.textContent = 'Synced';
            el.style.background = '#dcfce7';
            el.style.color = '#166534';
            el.title = synced + ' transaction(s) synced to eTIMS';
            el.onclick = showSyncDetails;
        }
    } catch(e) {
        el.textContent = isOnline() ? 'Online' : 'Offline';
        el.style.background = isOnline() ? '#dcfce7' : '#fee2e2';
        el.style.color = isOnline() ? '#166534' : '#991b1b';
    }
}

// ===== RETRY FAILED SYNCS =====
async function retryFailed() {
    if (!confirm('Retry failed transactions?')) return;
    try {
        var db = await openDB();
        var orders = await dbGetAll(db, 'orders');
        var failedOrders = orders.filter(function(o) { return o.etims_status === 'failed'; });
        
        if (failedOrders.length === 0) {
            alert('No failed transactions to retry');
            return;
        }
        
        // Reset failed orders to pending
        for (var i = 0; i < failedOrders.length; i++) {
            failedOrders[i].etims_status = 'pending';
            var tx = db.transaction('orders', 'readwrite');
            tx.objectStore('orders').put(failedOrders[i]);
        }
        
        console.log('Reset ' + failedOrders.length + ' failed orders to pending');
        setTimeout(processSyncQueue, 500);
    } catch(e) {
        alert('Error: ' + e.message);
    }
}

// ===== SHOW SYNC DETAILS =====
async function showSyncDetails() {
    try {
        var db = await openDB();
        var all = await getAllSyncItems(db);
        var pending = all.filter(function(i) { return i.status === 'pending'; });
        var synced = all.filter(function(i) { return i.status === 'synced'; });
        var failed = all.filter(function(i) { return i.status === 'failed'; });
        
        var msg = 'SYNC STATUS\n';
        msg += '============\n';
        msg += 'Status: ' + (isOnline() ? 'Online' : 'Offline') + '\n';
        msg += 'Pending: ' + pending.length + '\n';
        msg += 'Synced: ' + synced.length + '\n';
        msg += 'Failed: ' + failed.length + '\n';
        if (syncState.lastSyncTime) {
            msg += 'Last sync: ' + new Date(syncState.lastSyncTime).toLocaleString() + '\n';
        }
        msg += '\n';
        
        if (pending.length > 0) {
            msg += 'Pending transactions:\n';
            pending.slice(0, 5).forEach(function(item) {
                msg += '- ' + item.action + ' (' + new Date(item.created_at).toLocaleTimeString() + ')\n';
            });
            if (pending.length > 5) msg += '... and ' + (pending.length - 5) + ' more\n';
            msg += '\n';
        }
        
        if (isOnline() && pending.length > 0) {
            if (confirm(msg + '\nSync now?')) {
                processSyncQueue();
            }
        } else {
            alert(msg);
        }
    } catch(e) {
        alert('Error: ' + e.message);
    }
}

// ===== ONLINE REMINDER =====
function setupOnlineReminder() {
    // Check if we have pending items and are online
    setInterval(async function() {
        if (!isOnline()) return;
        
        try {
            var db = await openDB();
            var pending = await getPendingSync(db);
            
            if (pending.length > 0 && !syncState.isSyncing) {
                console.log('Auto-syncing ' + pending.length + ' pending items...');
                processSyncQueue();
            }
        } catch(e) {
            // Ignore
        }
    }, 30000); // Check every 30 seconds
    
    // Also check when coming back online
    window.addEventListener('online', async function() {
        console.log('Back online - checking pending items...');
        syncState.lastOnlineTime = new Date().toISOString();
        updateSyncIndicator();
        
        // Check if we have pending items
        try {
            var db = await openDB();
            var pending = await getPendingSync(db);
            if (pending.length > 0) {
                console.log('Found ' + pending.length + ' pending items - starting auto-sync...');
                setTimeout(processSyncQueue, 1500);
            }
        } catch(e) {
            // Fallback - just try syncing
            setTimeout(processSyncQueue, 1000);
        }
    });
    
    window.addEventListener('offline', function() {
        console.log('Offline - transactions will be queued');
        updateSyncIndicator();
    });
    
    // Initial check
    updateSyncIndicator();
}



// ===== QUEUE A TRANSACTION =====
async function queueTransaction(storeName, action, data) {
    try {
        var db = await openDB();
        await addToSyncQueue(db, storeName, action, data);
        console.log('Transaction queued for sync');
        updateSyncIndicator();
        return true;
    } catch(e) {
        console.error('Error queuing transaction:', e);
        return false;
    }
}

// ===== GET SYNC STATUS =====
async function getSyncStatus() {
    try {
        var db = await openDB();
        var pending = await getPendingSync(db);
        var all = await getAllSyncItems(db);
        return {
            pending: pending.length,
            synced: all.filter(function(i) { return i.status === 'synced'; }).length,
            failed: all.filter(function(i) { return i.status === 'failed'; }).length,
            online: isOnline(),
            isSyncing: syncState.isSyncing,
            lastSyncTime: syncState.lastSyncTime,
            items: pending
        };
    } catch(e) {
        return { pending: 0, online: isOnline(), error: e.message };
    }
}

// ===== SHOW PENDING NOTIFICATION =====
async function showPendingNotification() {
    if (!isOnline()) return;
    
    try {
        var db = await openDB();
        var pending = await getPendingSync(db);
        
        if (pending.length > 0 && !syncState.isSyncing) {
            // Show subtle notification
            var notification = document.createElement('div');
            notification.style.cssText = 'position:fixed;bottom:20px;right:20px;background:#1a3c34;color:white;padding:16px 20px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,0.3);z-index:99998;display:flex;align-items:center;gap:12px;cursor:pointer;max-width:300px;';
            notification.innerHTML = 
                '<div style="font-size:20px;font-weight:bold;">i</div>' +
                '<div>' +
                    '<div style="font-weight:600;font-size:14px;">Go online to sync</div>' +
                    '<div style="font-size:12px;opacity:0.8;">' + pending.length + ' transaction(s) waiting</div>' +
                '</div>';
            notification.onclick = function() {
                notification.remove();
                processSyncQueue();
            };
            document.body.appendChild(notification);
            
            // Auto-dismiss after 10 seconds
            setTimeout(function() {
                if (notification.parentNode) notification.remove();
            }, 10000);
        }
    } catch(e) {
        // Ignore
    }
}

// ===== INIT =====
document.addEventListener('DOMContentLoaded', function() {
    setupOnlineReminder();
    setTimeout(showPendingNotification, 3000);
    console.log('Sync queue module initialized');
});

console.log('Sync queue module loaded');
