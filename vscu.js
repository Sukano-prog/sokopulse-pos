// ============================================================
// SOKOPULSE POS - VSCU CLIENT
// Talks to KRA's local Virtual Sales Control Unit (VSCU JAR)
// ============================================================

const VSCU_CONFIG = {
    // Real VSCU endpoint (KRA jar default)
    endpoint: 'http://localhost:8088',

    // Mock mode - set to true until client has real VSCU JAR running
    mockMode: true,

    // Request timeout (KRA spec: 1000ms for signing, we allow more)
    timeout: 30000,

    // Storage keys
    keyCmc: 'vscu_cmc_key',
    keyInit: 'vscu_initialized'
};

// ============================================================
// INIT - one-time connection setup with VSCU
// ============================================================
async function vscuInit(kraPin, branchId) {
    try {
        const machineId = await getMachineId();
        const dvcSrlNo = machineId; // device serial = stable machine ID

        // Check if already initialized for this device
        const existingCmc = localStorage.getItem(VSCU_CONFIG.keyCmc);
        const existingInit = localStorage.getItem(VSCU_CONFIG.keyInit);
        const existingMachine = localStorage.getItem('vscu_machine_id');

        if (existingCmc && existingInit === 'true' && existingMachine === machineId) {
            console.log('VSCU: already initialized for this device');
            return { success: true, cmcKey: existingCmc, cached: true };
        }

        // New device or first run - initialize
        console.log('VSCU: initializing for device', machineId);

        if (VSCU_CONFIG.mockMode) {
            const mockCmc = 'MOCK-CMC-' + Date.now().toString(36).toUpperCase();
            localStorage.setItem(VSCU_CONFIG.keyCmc, mockCmc);
            localStorage.setItem(VSCU_CONFIG.keyInit, 'true');
            localStorage.setItem('vscu_machine_id', machineId);
            localStorage.setItem('vscu_pin', kraPin || 'P000000000X');
            localStorage.setItem('vscu_branch', branchId || '00');
            console.log('VSCU: mock initialized with key', mockCmc);
            return { success: true, cmcKey: mockCmc, mock: true };
        }

        // Real VSCU call
        const payload = {
            tin: kraPin,
            bhfId: branchId || '00',
            dvcSrlNo: dvcSrlNo,
            dvcNm: 'SokoPulse POS',
            dvcModelNm: 'Web'
        };

        const res = await vscuFetch('/selectInitOsdcInfo', payload);
        if (!res || !res.data || !res.data.info) {
            throw new Error('VSCU init failed: invalid response');
        }

        const cmcKey = res.data.info.cmcKey;
        localStorage.setItem(VSCU_CONFIG.keyCmc, cmcKey);
        localStorage.setItem(VSCU_CONFIG.keyInit, 'true');
        localStorage.setItem('vscu_machine_id', machineId);
        localStorage.setItem('vscu_pin', kraPin);
        localStorage.setItem('vscu_branch', branchId || '00');

        console.log('VSCU: initialized', { pin: kraPin, branch: branchId });
        return { success: true, cmcKey: cmcKey };

    } catch (e) {
        console.error('VSCU init error:', e);
        return { success: false, error: e.message };
    }
}

// ============================================================
// FORMAT SALE AS KRA XML
// ============================================================
function vscuFormatInvoice(order, kraPin, branchId) {
    const machineId = localStorage.getItem('machine_id') || 'UNKNOWN';
    const invcNo = (order.order_number || '').replace('ORD-', '') || Date.now().toString();

    // Build items - each line becomes a KRA sale item
    const items = (order.items || []).map(function(item, idx) {
        const qty = parseFloat(item.qty) || 1;
        const unitPrice = parseFloat(item.price) || 0;
        const discount = parseFloat(item.discount) || 0;
        const lineTotal = unitPrice * qty * (1 - discount / 100);

        // Find product for HS code + tax type
        const product = (typeof products !== 'undefined' && products)
            ? products.find(function(p) { return p.id === item.id; })
            : null;

        const taxType = product ? (product.tax_type || 'VAT') : 'VAT';
        const hsCode = product ? (product.hs_code || '0000.00.00') : '0000.00.00';
        const uom = product ? (product.unit_of_measure || 'pcs') : 'pcs';

        // VAT is included in the price in Kenya, extract it
        let taxAmt = 0;
        let netAmt = lineTotal;
        if (taxType === 'VAT') {
            netAmt = lineTotal / 1.16;
            taxAmt = lineTotal - netAmt;
        }

        return {
            itemSeq: idx + 1,
            itemCd: product ? (product.barcode || 'SKU-' + item.id) : 'SKU-' + item.id,
            itemNm: item.name || 'Item',
            bcd: product ? (product.barcode || '') : '',
            pkgUnitCd: uom,
            qtyUnitCd: uom,
            qty: qty,
            prc: unitPrice,
            splyAmt: netAmt,
            dcRt: discount,
            dcAmt: (unitPrice * qty * discount / 100),
            taxTyCd: taxType === 'VAT' ? 'A' : (taxType === 'ZERO' ? 'B' : 'C'),
            // A=Standard VAT, B=Zero-rated, C=Exempt
            totAmt: lineTotal,
            taxAmt: taxAmt
        };
    });

    // Totals
    const totalTaxable = items.filter(function(i) { return i.taxTyCd === 'A'; })
        .reduce(function(s, i) { return s + i.splyAmt; }, 0);
    const totalExempt = items.filter(function(i) { return i.taxTyCd === 'C'; })
        .reduce(function(s, i) { return s + i.splyAmt; }, 0);
    const totalZeroRated = items.filter(function(i) { return i.taxTyCd === 'B'; })
        .reduce(function(s, i) { return s + i.splyAmt; }, 0);
    const totalVAT = items.reduce(function(s, i) { return s + i.taxAmt; }, 0);
    const totalAmount = items.reduce(function(s, i) { return s + i.totAmt; }, 0);

    // Payment type: KRA codes
    // 01=Cash, 02=Credit, 03=Bank/Cash, 04=Bank Transfer, 05=Mobile Money, 06=Card
    const payMap = {
        'cash': '01',
        'credit': '02',
        'bank': '04',
        'mpesa': '05',
        'card': '06'
    };
    const pmtTyCd = payMap[order.payment_method] || '01';

    // Customer details
    const custName = order.customer_name || 'Walk-in Customer';
    const custPin = order.customer_pin || 'P000000000X';

    // Build the invoice object (KRA spec structure)
    return {
        tin: kraPin,
        bhfId: branchId || '00',
        invcNo: parseInt(invcNo) || Date.now(),
        salesTyCd: 'N', // Normal sale
        rcptTyCd: 'S',  // Sale receipt
        pmtTyCd: pmtTyCd,
        salesSttsCd: '02', // Approved (waiting for VSCU confirmation)
        salesDt: formatKraDate(order.date),
        prchrAcptcYn: 'Y',
        remark: order.note || '',
        regrNm: 'SokoPulse',
        regrId: 'POS-01',
        modrNm: 'SokoPulse',
        modrId: 'POS-01',
        itemList: items,
        // Totals
        totalItemCnt: items.length,
        taxblAmtA: totalTaxable,
        taxblAmtB: totalZeroRated,
        taxblAmtC1: 0,
        taxblAmtC2: 0,
        taxblAmtC3: 0,
        taxblAmtD: 0,
        taxRtA: 16,
        taxRtB: 0,
        taxRtC1: 0,
        taxRtC2: 0,
        taxRtC3: 0,
        taxRtD: 0,
        taxAmtA: totalVAT,
        taxAmtB: 0,
        taxAmtC1: 0,
        taxAmtC2: 0,
        taxAmtC3: 0,
        taxAmtD: 0,
        totTaxblAmt: totalTaxable + totalZeroRated,
        totTaxAmt: totalVAT,
        totAmt: totalAmount,
        prchrAcptcYn: 'Y',
        // Customer
        custNm: custName,
        custTin: custPin,
        custBhfId: '00',
        // Device
        dvcSrlNo: machineId
    };
}

// ============================================================
// SEND INVOICE TO VSCU
// ============================================================
async function vscuSendInvoice(order) {
    try {
        const kraPin = localStorage.getItem('vscu_pin') || 'P000000000X';
        const branchId = localStorage.getItem('vscu_branch') || '00';
        const cmcKey = localStorage.getItem(VSCU_CONFIG.keyCmc);

        if (!cmcKey) {
            // Try to init first
            const init = await vscuInit(kraPin, branchId);
            if (!init.success) {
                throw new Error('VSCU not initialized: ' + init.error);
            }
        }

        const payload = vscuFormatInvoice(order, kraPin, branchId);

        // Mock mode - simulate response
        if (VSCU_CONFIG.mockMode) {
            const cuSerial = 'MOCK-CU-' + Date.now().toString(36).toUpperCase().slice(-8);
            const cuInvcNo = 'INV-' + (Date.now() % 100000000);
            const qrData = JSON.stringify({
                invoiceNo: cuInvcNo,
                serial: cuSerial,
                date: new Date().toISOString(),
                amount: payload.totAmt,
                pin: kraPin,
                mock: true
            });

            console.log('VSCU: MOCK send', payload);
            return {
                success: true,
                mock: true,
                cuSerial: cuSerial,
                cuInvcNo: cuInvcNo,
                qrCode: qrData,
                invoiceData: payload
            };
        }

        // Real VSCU call
        const res = await vscuFetch('/saveTrnsSalesInvoice', payload, cmcKey);

        if (!res || !res.data) {
            throw new Error('VSCU response empty');
        }

        return {
            success: true,
            cuSerial: res.data.cuSerial || res.data.info?.cuSerial,
            cuInvcNo: res.data.cuInvcNo || res.data.info?.cuInvcNo,
            qrCode: res.data.qrCode || res.data.info?.qrCode,
            receiptSignature: res.data.rcptSign || res.data.info?.rcptSign,
            internalData: res.data.intrlData,
            raw: res
        };

    } catch (e) {
        console.error('VSCU send error:', e);
        return {
            success: false,
            queued: true,
            error: e.message
        };
    }
}

// ============================================================
// LOW-LEVEL FETCH
// ============================================================
async function vscuFetch(path, body, cmcKey) {
    const url = VSCU_CONFIG.endpoint + path;
    const headers = { 'Content-Type': 'application/json' };
    if (cmcKey) headers['cmcKey'] = cmcKey;

    const controller = new AbortController();
    const timeoutId = setTimeout(function() {
        controller.abort();
    }, VSCU_CONFIG.timeout);

    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: headers,
            body: JSON.stringify(body),
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!res.ok) {
            throw new Error('VSCU HTTP ' + res.status);
        }
        return await res.json();
    } catch (e) {
        clearTimeout(timeoutId);
        throw e;
    }
}

// ============================================================
// HELPERS
// ============================================================
function formatKraDate(isoString) {
    const d = isoString ? new Date(isoString) : new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mi = String(d.getMinutes()).padStart(2, '0');
    const ss = String(d.getSeconds()).padStart(2, '0');
    return yyyy + mm + dd + hh + mi + ss;
}

async function vscuStatus() {
    const cmcKey = localStorage.getItem(VSCU_CONFIG.keyCmc);
    const machineId = localStorage.getItem('machine_id');
    const initialized = localStorage.getItem(VSCU_CONFIG.keyInit) === 'true';

    return {
        initialized: initialized,
        mockMode: VSCU_CONFIG.mockMode,
        endpoint: VSCU_CONFIG.endpoint,
        machineId: machineId,
        hasCmcKey: !!cmcKey,
        kraPin: localStorage.getItem('vscu_pin') || null,
        branchId: localStorage.getItem('vscu_branch') || null
    };
}

async function vscuReset() {
    localStorage.removeItem(VSCU_CONFIG.keyCmc);
    localStorage.removeItem(VSCU_CONFIG.keyInit);
    localStorage.removeItem('vscu_machine_id');
    console.log('VSCU: reset complete');
    return true;
}

console.log('VSCU client module loaded (mock mode: ' + VSCU_CONFIG.mockMode + ')');
