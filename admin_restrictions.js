// ============================================
// ADMIN ACCESS CONTROL - COMPLETE
// ============================================

function isAdmin() {
    try {
        const user = JSON.parse(localStorage.getItem('pos_user') || '{}');
        return user.role === 'admin';
    } catch(e) {
        return false;
    }
}

function getCurrentUser() {
    try {
        return JSON.parse(localStorage.getItem('pos_user') || '{}');
    } catch(e) {
        return { username: 'unknown', role: 'user' };
    }
}

function requireAdmin(action) {
    if (!isAdmin()) {
        alert('❌ Access Denied!\n\n' + action + ' requires administrator privileges.');
        return false;
    }
    return true;
}

function checkAdminPage() {
    if (!isAdmin()) {
        document.body.innerHTML = `
            <div style="display:flex;justify-content:center;align-items:center;height:100vh;background:#f8fafc;font-family:Inter,sans-serif;">
                <div style="text-align:center;padding:40px;background:white;border-radius:12px;box-shadow:0 4px 12px rgba(0,0,0,0.1);max-width:400px;">
                    <div style="font-size:64px;margin-bottom:16px;">🔒</div>
                    <h2 style="color:#0f172a;margin-bottom:8px;">Access Denied</h2>
                    <p style="color:#64748b;margin-bottom:20px;">This page requires administrator privileges.</p>
                    <button onclick="window.location.href='pos.html'" style="padding:12px 24px;background:#1a3c34;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;font-weight:600;">
                        Go to POS
                    </button>
                </div>
            </div>
        `;
        return false;
    }
    return true;
}

// Admin-only actions that need protection
function adminDelete(action, itemName) {
    if (!requireAdmin('Deleting ' + itemName)) return false;
    return confirm('⚠️ Are you sure you want to delete ' + itemName + '?\n\nThis action cannot be undone!');
}

function adminApprove(action, itemName) {
    if (!requireAdmin('Approving ' + itemName)) return false;
    return true;
}

function adminPriceChange(currentPrice, newPrice) {
    if (!isAdmin()) {
        alert('❌ Price cannot go down!\nCurrent: KES ' + currentPrice.toFixed(2) + '\nNew: KES ' + newPrice.toFixed(2) + '\n\nOnly admin can lower prices.');
        return false;
    }
    if (newPrice < currentPrice) {
        return confirm('⚠️ You are about to LOWER the price from KES ' + currentPrice.toFixed(2) + ' to KES ' + newPrice.toFixed(2) + '\n\nAre you sure?');
    }
    return true;
}
