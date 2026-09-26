// ============================================
// SOKOPULSE POS - eTIMS INTEGRATION (MOCK)
// ============================================

const ETIMS_CONFIG = {
    apiUrl: 'https://etims-api.kra.go.ke/etims-api',
    mockMode: true
};

// ===== FORMAT INVOICE FOR eTIMS =====
function formatInvoiceForEtims(order, businessInfo) {
    return {
        taxpayerPin: businessInfo.business_pin || 'P000000000X',
        taxpayerName: businessInfo.storeName || 'SokoPulse Store',
        invoiceNumber: order.order_number || 'INV-' + Date.now(),
        invoiceDate: order.date || new Date().toISOString(),
        invoiceType: 'SALE',
        customerPin: order.customer_pin || 'P000000000X',
        customerName: order.customer_name || 'Walk-in Customer',
        items: (order.items || []).map(function(item) {
            // Get product to read tax type
            var product = null;
            if (typeof products !== 'undefined' && products) {
                product = products.find(function(p) { return p.id === item.id || p.name === item.name; });
            }
            var taxType = product ? (product.tax_type || 'VAT') : (item.tax_type || 'VAT');
            var taxRate = taxType === 'VAT' ? 16 : (taxType === 'ZERO' ? 0 : 0);
            
            return {
                itemName: item.name,
                hsCode: product ? (product.hs_code || '0000.00.00') : '0000.00.00',
                quantity: item.qty || 1,
                unitPrice: item.price || 0,
                totalPrice: (item.price || 0) * (item.qty || 1),
                taxType: taxType,
                taxRate: taxRate,
                unitOfMeasure: product ? (product.unit_of_measure || 'pcs') : 'pcs',
                discount: item.discount || 0
            };
        }),
        subtotal: order.subtotal || 0,
        taxAmount: order.tax || 0,
        totalAmount: order.total || 0,
        paymentMethod: order.payment_method || 'Cash'
    };
}

// ===== SEND INVOICE TO eTIMS =====
async function sendInvoiceToEtims(order, businessInfo) {
    if (!isOnline()) {
        await queueTransaction('orders', 'etims_invoice', {
            order: order,
            businessInfo: businessInfo
        });
        return { success: false, queued: true, message: 'Queued for sync when online' };
    }
    
    if (ETIMS_CONFIG.mockMode) {
        return await mockEtimsResponse(order);
    }
    
    try {
        var payload = formatInvoiceForEtims(order, businessInfo);
        var response = await fetch(ETIMS_CONFIG.apiUrl + '/saveInvoice', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + (businessInfo.etims_token || '')
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) throw new Error('eTIMS API error: ' + response.status);
        
        var result = await response.json();
        return {
            success: true,
            cuSerial: result.cuSerial,
            cuInvoiceNo: result.cuInvoiceNo,
            qrCode: result.qrCode,
            message: 'Invoice submitted successfully'
        };
    } catch(e) {
        console.error('eTIMS API error:', e);
        await queueTransaction('orders', 'etims_invoice', {
            order: order,
            businessInfo: businessInfo
        });
        return { success: false, queued: true, error: e.message };
    }
}

// ===== MOCK eTIMS RESPONSE =====
async function mockEtimsResponse(order) {
    await new Promise(function(resolve) { setTimeout(resolve, 500); });
    
    var cuSerial = 'MOCK-CU-' + Date.now().toString(36).toUpperCase().slice(-8);
    var cuInvoiceNo = 'INV-' + Date.now().toString().slice(-8);
    var qrData = JSON.stringify({
        invoiceNo: cuInvoiceNo,
        serial: cuSerial,
        date: new Date().toISOString(),
        amount: order.total || 0,
        pin: 'P000000000X'
    });
    
    console.log('MOCK eTIMS: CU=' + cuSerial + ' Inv=' + cuInvoiceNo);
    
    return {
        success: true,
        cuSerial: cuSerial,
        cuInvoiceNo: cuInvoiceNo,
        qrCode: qrData,
        message: 'Mock invoice submitted'
    };
}

// ===== GET STORE SETTINGS =====
async function getStoreSettings() {
    try {
        var db = await openDB();
        var settings = await dbGetAll(db, 'settings');
        var map = {};
        settings.forEach(function(s) { map[s.key] = s.value; });
        return map;
    } catch(e) {
        return {};
    }
}

// ===== CHECK eTIMS STATUS =====
async function checkEtimsStatus() {
    try {
        var settings = await getStoreSettings();
        if (!settings.business_pin) {
            return { configured: false, message: 'Business KRA PIN not set' };
        }
        if (!settings.etims_username) {
            return { configured: false, message: 'eTIMS credentials not set' };
        }
        return {
            configured: true,
            mockMode: ETIMS_CONFIG.mockMode,
            message: ETIMS_CONFIG.mockMode ? 'Mock mode' : 'Connected'
        };
    } catch(e) {
        return { configured: false, error: e.message };
    }
}

console.log('eTIMS module loaded');
