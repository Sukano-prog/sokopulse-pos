// ============================================
// SOKOPULSE POS - PWA INSTALL HELPER
// ============================================

var deferredInstallPrompt = null;

// ===== CAPTURE INSTALL PROMPT =====
window.addEventListener('beforeinstallprompt', function(e) {
    e.preventDefault();
    deferredInstallPrompt = e;
    console.log('PWA: Install prompt captured');
});

// ===== SHOW INSTALL BUTTON =====
function showInstallButton() {
    if (document.getElementById('pwaInstallBtn')) return;
    if (isPWAInstalled()) return;
    if (localStorage.getItem('pwa_install_dismissed') === 'true') return;
    
    var btn = document.createElement('button');
    btn.id = 'pwaInstallBtn';
    btn.innerHTML = 'Install App';
    btn.style.cssText = 'position:fixed;bottom:20px;left:20px;padding:10px 18px;background:#1a3c34;color:white;border:none;border-radius:24px;font-weight:600;font-size:13px;cursor:pointer;box-shadow:0 4px 12px rgba(0,0,0,0.2);z-index:99998;font-family:Inter,sans-serif;display:flex;align-items:center;gap:6px;';
    btn.onclick = function() { installPWA(); };
    document.body.appendChild(btn);
    
    // Auto-hide after 30 seconds if not clicked
    setTimeout(function() {
        if (btn.parentNode) btn.remove();
    }, 30000);
}

// ===== DISMISS INSTALL BUTTON =====
function dismissInstallButton() {
    localStorage.setItem('pwa_install_dismissed', 'true');
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.remove();
}

// ===== INSTALL PWA =====
async function installPWA() {
    if (!deferredInstallPrompt) {
        alert('To install:\n\n• Chrome: Menu (⋮) → Install app\n• Safari iOS: Share → Add to Home Screen\n• Edge: Menu → Apps → Install');
        dismissInstallButton();
        return;
    }
    
    deferredInstallPrompt.prompt();
    var result = await deferredInstallPrompt.userChoice;
    console.log('PWA install choice:', result.outcome);
    
    if (result.outcome === 'accepted') {
        localStorage.setItem('pwa_install_dismissed', 'true');
        var btn = document.getElementById('pwaInstallBtn');
        if (btn) btn.remove();
    }
    deferredInstallPrompt = null;
}

// ===== DETECT INSTALL SUCCESS =====
window.addEventListener('appinstalled', function() {
    console.log('PWA: App installed successfully');
    localStorage.setItem('pwa_install_dismissed', 'true');
    var btn = document.getElementById('pwaInstallBtn');
    if (btn) btn.remove();
});

// ===== CHECK IF ALREADY INSTALLED =====
function isPWAInstalled() {
    return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
}

// ===== SHOW INSTALL BUTTON ON LOAD IF NOT DISMISSED =====
document.addEventListener('DOMContentLoaded', function() {
    if (isPWAInstalled()) return;
    if (localStorage.getItem('pwa_install_dismissed') === 'true') return;
    
    // Only show if the beforeinstallprompt event has fired
    // The button will be shown in beforeinstallprompt handler
    // Do NOT show after a delay
});

console.log('PWA install helper loaded');
