// ============================================
// SOKOPULSE POS - UNIVERSAL RECEIPT PRINTER
// Supports: Thermal (ESC/POS), Browser, Network
// ============================================

class ReceiptPrinter {
    constructor() {
        this.printer = null;
        this.connected = false;
        this.mode = 'browser'; // browser, usb, bluetooth, network
        this.width = 32; // Default: 58mm thermal
        this.paperWidth = '58mm';
    }

    // ===== CONFIGURE PRINTER =====
    configure(options) {
        if (options.mode) this.mode = options.mode;
        if (options.width) this.width = options.width;
        if (options.paperWidth) this.paperWidth = options.paperWidth;
        console.log('Printer configured:', this.mode, this.paperWidth, this.width + ' chars');
    }

    // ===== CHECK AVAILABLE PRINTERS =====
    async checkPrinters() {
        var available = {
            browser: true,
            usb: 'usb' in navigator,
            bluetooth: 'bluetooth' in navigator,
            network: false
        };
        return available;
    }

    // ===== CONNECT USB THERMAL PRINTER =====
    async connectUSB() {
        try {
            if (!('usb' in navigator)) {
                throw new Error('WebUSB not supported');
            }
            
            this.printer = await navigator.usb.requestDevice({
                filters: [
                    { vendorId: 0x0b05 }, // Epson
                    { vendorId: 0x0416 }, // Bixolon
                    { vendorId: 0x0483 }, // STMicroelectronics
                    { vendorId: 0x1a86 }, // QinHeng (CH340)
                    { vendorId: 0x067b }, // Prolific
                    { vendorId: 0x04b8 }  // Epson
                ]
            });
            
            await this.printer.open();
            await this.printer.selectConfiguration(1);
            await this.printer.claimInterface(0);
            this.connected = true;
            this.mode = 'usb';
            console.log('USB printer connected');
            return true;
        } catch(e) {
            console.error('USB connection failed:', e);
            return false;
        }
    }

    // ===== CONNECT BLUETOOTH PRINTER =====
    async connectBluetooth() {
        try {
            if (!('bluetooth' in navigator)) {
                throw new Error('Web Bluetooth not supported');
            }
            
            const device = await navigator.bluetooth.requestDevice({
                filters: [{ services: ['000018f0-0000-1000-8000-00805f9b34fb'] }],
                optionalServices: ['000018f0-0000-1000-8000-00805f9b34fb']
            });
            
            const server = await device.gatt.connect();
            const service = await server.getPrimaryService('000018f0-0000-1000-8000-00805f9b34fb');
            const characteristic = await service.getCharacteristic('00002af1-0000-1000-8000-00805f9b34fb');
            
            this.printer = characteristic;
            this.connected = true;
            this.mode = 'bluetooth';
            console.log('Bluetooth printer connected');
            return true;
        } catch(e) {
            console.error('Bluetooth connection failed:', e);
            return false;
        }
    }

    // ===== FORMAT RECEIPT AS PLAIN TEXT =====
    formatReceipt(data) {
        var w = this.width;
        var line = ''.padEnd(w, '-');
        var dline = ''.padEnd(w, '=');
        
        var text = '';
        
        // Header
        text += dline + '\n';
        text += this.center(data.header, w) + '\n';
        if (data.storeAddress) text += this.center(data.storeAddress, w) + '\n';
        if (data.storePhone) text += this.center('Tel: ' + data.storePhone, w) + '\n';
        if (data.storeEmail) text += this.center(data.storeEmail, w) + '\n';
        text += dline + '\n';
        
        // Order info
        text += 'Order: ' + data.order_number + '\n';
        text += 'Date: ' + new Date(data.date).toLocaleString() + '\n';
        text += 'Cashier: ' + (data.cashier || 'System') + '\n';
        text += 'Customer: ' + (data.customer || 'Walk-in') + '\n';
        
        // Customer KRA PIN (for eTIMS)
        if (data.customer_pin) {
            text += 'Customer PIN: ' + data.customer_pin + '\n';
        }
        
        text += line + '\n';
        
        // Items header
        text += this.pad('ITEM', 14) + this.pad('QTY', 5) + this.pad('PRICE', 7) + this.pad('TOTAL', 7) + '\n';
        text += line + '\n';
        
        // Items
        var items = data.items || [];
        items.forEach(function(item) {
            var name = (item.name || 'Unknown').substring(0, 13);
            var nameStr = name.padEnd(14);
            var qtyStr = String(item.qty || 1).padStart(4) + ' ';
            var priceStr = ('KES' + (item.price || 0).toFixed(2)).padStart(7);
            var totalStr = ('KES' + ((item.price || 0) * (item.qty || 1)).toFixed(2)).padStart(7);
            text += nameStr + qtyStr + priceStr + totalStr + '\n';
        });
        
        text += line + '\n';
        
        // Totals
        text += 'Subtotal:' + ('KES ' + (data.subtotal || 0).toFixed(2)).padStart(w - 10) + '\n';
        if (data.tax && data.tax > 0) {
            text += 'Tax:' + ('KES ' + data.tax.toFixed(2)).padStart(w - 5) + '\n';
        }
        text += 'TOTAL:' + ('KES ' + (data.total || 0).toFixed(2)).padStart(w - 7) + '\n';
        text += line + '\n';
        
        // Payment
        text += 'Payment: ' + (data.payment ? data.payment.method : 'Cash') + '\n';
        if (data.payment && data.payment.amount) {
            text += 'Amount:' + ('KES ' + data.payment.amount.toFixed(2)).padStart(w - 8) + '\n';
        }
        if (data.change && data.change > 0) {
            text += 'Change:' + ('KES ' + data.change.toFixed(2)).padStart(w - 8) + '\n';
        }
        
        // eTIMS Information
        if (data.etims && (data.etims.invoice_no || data.etims.cu_serial)) {
            text += line + '\n';
            text += this.center('eTIMS INFORMATION', w) + '\n';
            if (data.etims.invoice_no) {
                text += 'Invoice No: ' + data.etims.invoice_no + '\n';
            }
            if (data.etims.cu_serial) {
                text += 'CU Serial: ' + data.etims.cu_serial + '\n';
            }
            text += line + '\n';
        }
        
        // QR Code placeholder (for thermal printers with QR support)
        if (data.etims && data.etims.qr_data) {
            text += this.center('[QR CODE]', w) + '\n';
            text += this.center('Scan to verify', w) + '\n';
            text += line + '\n';
        }
        
        // Footer
        text += dline + '\n';
        text += this.center(data.footer || 'Thank You! Come Again', w) + '\n';
        text += dline + '\n';
        
        return text;
    }

    // ===== HELPER: CENTER TEXT =====
    center(text, width) {
        if (!text) return ''.padEnd(width);
        text = String(text);
        if (text.length >= width) return text.substring(0, width);
        var left = Math.floor((width - text.length) / 2);
        return ' '.repeat(left) + text;
    }

    // ===== HELPER: PAD TEXT =====
    pad(text, width) {
        text = String(text || '');
        if (text.length >= width) return text.substring(0, width);
        return text.padEnd(width);
    }

    // ===== BUILD ESC/POS COMMANDS WITH QR =====
    buildEscPos(data) {
        var encoder = new TextEncoder();
        var commands = [];
        
        // Initialize printer
        commands.push(0x1B, 0x40);
        
        // Center align for header
        commands.push(0x1B, 0x61, 0x01);
        
        // Print header
        commands.push(...encoder.encode(data.header + '\n'));
        if (data.storeAddress) commands.push(...encoder.encode(data.storeAddress + '\n'));
        if (data.storePhone) commands.push(...encoder.encode('Tel: ' + data.storePhone + '\n'));
        
        // Separator
        commands.push(...encoder.encode('================================\n'));
        
        // Left align for order info
        commands.push(0x1B, 0x61, 0x00);
        commands.push(...encoder.encode('Order: ' + data.order_number + '\n'));
        commands.push(...encoder.encode('Date: ' + new Date(data.date).toLocaleString() + '\n'));
        commands.push(...encoder.encode('Cashier: ' + (data.cashier || 'System') + '\n'));
        commands.push(...encoder.encode('Customer: ' + (data.customer || 'Walk-in') + '\n'));
        commands.push(...encoder.encode('--------------------------------\n'));
        
        // Items
        commands.push(...encoder.encode('ITEM          QTY  PRICE   TOTAL\n'));
        commands.push(...encoder.encode('--------------------------------\n'));
        
        (data.items || []).forEach(function(item) {
            var name = (item.name || 'Unknown').substring(0, 13).padEnd(14);
            var qty = String(item.qty || 1).padStart(4) + ' ';
            var price = ('KES' + (item.price || 0).toFixed(2)).padStart(7);
            var total = ('KES' + ((item.price || 0) * (item.qty || 1)).toFixed(2)).padStart(8);
            commands.push(...encoder.encode(name + qty + price + total + '\n'));
        });
        
        commands.push(...encoder.encode('--------------------------------\n'));
        
        // Totals - right align
        commands.push(0x1B, 0x61, 0x02);
        commands.push(...encoder.encode('Subtotal: KES ' + (data.subtotal || 0).toFixed(2) + '\n'));
        if (data.tax > 0) {
            commands.push(...encoder.encode('Tax: KES ' + data.tax.toFixed(2) + '\n'));
        }
        commands.push(0x1B, 0x21, 0x10); // Double height
        commands.push(...encoder.encode('TOTAL: KES ' + (data.total || 0).toFixed(2) + '\n'));
        commands.push(0x1B, 0x21, 0x00); // Normal
        
        // Left align
        commands.push(0x1B, 0x61, 0x00);
        commands.push(...encoder.encode('--------------------------------\n'));
        
        // Payment
        commands.push(...encoder.encode('Payment: ' + (data.payment ? data.payment.method : 'Cash') + '\n'));
        
        // eTIMS Info
        if (data.etims && (data.etims.invoice_no || data.etims.cu_serial)) {
            commands.push(...encoder.encode('--------------------------------\n'));
            commands.push(...encoder.encode('eTIMS INFORMATION\n'));
            if (data.etims.invoice_no) {
                commands.push(...encoder.encode('Invoice No: ' + data.etims.invoice_no + '\n'));
            }
            if (data.etims.cu_serial) {
                commands.push(...encoder.encode('CU Serial: ' + data.etims.cu_serial + '\n'));
            }
        }
        
        // QR Code (ESC/POS native)
        if (data.etims && data.etims.qr_data) {
            commands.push(...this.buildQrCommand(data.etims.qr_data));
        }
        
        // Footer
        commands.push(0x1B, 0x61, 0x01);
        commands.push(...encoder.encode('================================\n'));
        commands.push(...encoder.encode((data.footer || 'Thank You!') + '\n'));
        commands.push(...encoder.encode('================================\n'));
        commands.push(...encoder.encode('\n\n\n'));
        
        // Cut paper
        commands.push(0x1D, 0x56, 0x42, 0x00);
        
        return new Uint8Array(commands);
    }

    // ===== BUILD ESC/POS QR CODE COMMAND =====
    buildQrCommand(qrData) {
        var dataBytes = new TextEncoder().encode(qrData);
        var len = dataBytes.length + 3;
        var pL = len & 0xFF;
        var pH = (len >> 8) & 0xFF;
        
        var commands = [
            // 1. Select QR model (Model 2)
            0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41, 0x32, 0x00,
            // 2. Set module size (3 = small, up to 8 = large)
            0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43, 0x04,
            // 3. Set error correction level (M = 49)
            0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45, 0x31,
            // 4. Store QR data
            0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30
        ];
        
        // Add data bytes
        for (var i = 0; i < dataBytes.length; i++) {
            commands.push(dataBytes[i]);
        }
        
        // 5. Print QR code
        commands.push(0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30);
        
        return commands;
    }

    // ===== PRINT VIA USB =====
    async printUSB(data) {
        var commands = this.buildEscPos(data);
        await this.printer.transferOut(1, commands);
        console.log('Printed via USB');
    }

    // ===== PRINT VIA BLUETOOTH =====
    async printBluetooth(data) {
        var text = this.formatReceipt(data);
        var encoder = new TextEncoder();
        var bytes = encoder.encode(text);
        
        // Bluetooth BLE has 20-byte limit per write
        for (var i = 0; i < bytes.length; i += 20) {
            var chunk = bytes.slice(i, i + 20);
            await this.printer.writeValue(chunk);
        }
        console.log('Printed via Bluetooth');
    }

    // ===== PRINT VIA BROWSER =====
    printBrowser(data) {
        var printWindow = window.open('', '_blank', 'width=400,height=600');
        if (!printWindow) {
            alert('Please allow popups to print');
            return false;
        }
        
        var text = this.formatReceipt(data);
        
        // Build HTML with QR code if available
        var qrHtml = '';
        if (data.etims && data.etims.qr_data) {
            qrHtml = '<div style="text-align:center;margin:10px 0;">' +
                '<img src="https://api.qrserver.com/v1/create-qr-code/?size=120x120&data=' + 
                encodeURIComponent(data.etims.qr_data) + 
                '" style="width:100px;height:100px;" />' +
                '<div style="font-size:10px;">Scan to verify</div>' +
                '</div>';
        }
        
        var html = '<html><head><title>Receipt</title>' +
            '<style>' +
            'body{font-family:"Courier New",monospace;font-size:12px;padding:10px;white-space:pre-wrap;background:white;margin:0;}' +
            '@media print{body{padding:5px;}@page{margin:0.3cm;}}' +
            '</style></head><body>' +
            text + qrHtml +
            '</body></html>';
        
        printWindow.document.write(html);
        printWindow.document.close();
        
        setTimeout(function() {
            printWindow.print();
        }, 500);
        
        return true;
    }

    // ===== MAIN PRINT FUNCTION =====
    async print(data) {
        try {
            if (this.mode === 'usb' && this.printer) {
                await this.printUSB(data);
            } else if (this.mode === 'bluetooth' && this.printer) {
                await this.printBluetooth(data);
            } else {
                this.printBrowser(data);
            }
            return true;
        } catch(e) {
            console.error('Print failed:', e);
            // Fallback to browser
            this.printBrowser(data);
            return false;
        }
    }

    // ===== TEST PRINT =====
    async testPrint() {
        var testData = {
            header: 'TEST PRINT',
            storeAddress: 'Test Location',
            storePhone: '0700000000',
            order_number: 'TEST-001',
            date: new Date().toISOString(),
            cashier: 'System',
            customer: 'Test Customer',
            items: [
                { name: 'Test Item 1', qty: 1, price: 100 },
                { name: 'Test Item 2', qty: 2, price: 50 }
            ],
            subtotal: 200,
            tax: 32,
            total: 232,
            payment: { method: 'Cash', amount: 232 },
            change: 0,
            etims: {
                invoice_no: 'TEST-INV-001',
                cu_serial: 'TEST-CU-001',
                qr_data: 'https://example.com/test'
            },
            footer: 'Test Successful'
        };
        
        return this.print(testData);
    }
}

// ===== CREATE GLOBAL INSTANCE =====
var posPrinter = new ReceiptPrinter();

// ===== EXPOSE GLOBAL FUNCTIONS =====
window.printReceipt = function(data) {
    return posPrinter.print(data);
};

window.testPrint = function() {
    return posPrinter.testPrint();
};

window.connectUSBPrinter = function() {
    return posPrinter.connectUSB();
};

window.connectBluetoothPrinter = function() {
    return posPrinter.connectBluetooth();
};

window.configurePrinter = function(options) {
    return posPrinter.configure(options);
};

console.log('Universal printer module loaded');
