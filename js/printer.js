// ============================================
// PRINTER MODULE - SokoPulse POS
// Supports: Thermal, ESC/POS, Browser Print
// ============================================

class Printer {
    constructor() {
        this.printer = null;
        this.connected = false;
    }

    // ===== CHECK IF THERMAL PRINTER IS AVAILABLE =====
    isThermalAvailable() {
        // Check for WebUSB (for thermal printers)
        return 'usb' in navigator && typeof navigator.usb.requestDevice === 'function';
    }

    // ===== CONNECT TO THERMAL PRINTER (WebUSB) =====
    async connectThermal() {
        try {
            if (!this.isThermalAvailable()) {
                throw new Error('WebUSB not supported in this browser');
            }

            // Request USB device (filter for thermal printers)
            const filters = [
                { vendorId: 0x0b05 }, // Example: Epson
                { vendorId: 0x0416 }, // Example: Bixolon
                // Add more vendor IDs as needed
            ];

            this.printer = await navigator.usb.requestDevice({ filters });
            await this.printer.open();
            await this.printer.selectConfiguration(1);
            await this.printer.claimInterface(0);
            
            this.connected = true;
            console.log('✅ Thermal printer connected');
            return true;
        } catch (error) {
            console.error('❌ Failed to connect thermal printer:', error);
            return false;
        }
    }

    // ===== PRINT RECEIPT (ESC/POS) =====
    async printReceipt(data) {
        if (!this.connected) {
            // Fallback to browser print
            return this.printToBrowser(data);
        }

        try {
            const encoder = new TextEncoder();
            const commands = [];

            // Initialize printer
            commands.push(0x1B, 0x40); // ESC @

            // Set center alignment
            commands.push(0x1B, 0x61, 0x01); // ESC a 1

            // Print header
            const header = data.header || 'SOKOPULSE POS';
            const headerBytes = encoder.encode(header + '\n');
            commands.push(...headerBytes);

            // Print separator
            commands.push(...encoder.encode('--------------------------------\n'));

            // Set left alignment
            commands.push(0x1B, 0x61, 0x00); // ESC a 0

            // Print items
            if (data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    const line = `${item.name} x${item.qty} = KES ${(item.price * item.qty).toFixed(2)}`;
                    commands.push(...encoder.encode(line + '\n'));
                });
            }

            // Print separator
            commands.push(...encoder.encode('--------------------------------\n'));

            // Print total
            commands.push(0x1B, 0x61, 0x02); // ESC a 2 (right align)
            commands.push(...encoder.encode(`TOTAL: KES ${data.total.toFixed(2)}\n`));

            // Print payment info
            commands.push(0x1B, 0x61, 0x00); // ESC a 0 (left align)
            if (data.payment) {
                commands.push(...encoder.encode(`Payment: ${data.payment.method}\n`));
                commands.push(...encoder.encode(`Amount: KES ${data.payment.amount.toFixed(2)}\n`));
            }

            // Print separator
            commands.push(...encoder.encode('--------------------------------\n'));

            // Print footer
            commands.push(0x1B, 0x61, 0x01); // ESC a 1 (center)
            commands.push(...encoder.encode(data.footer || 'Thank You!\n'));

            // Print date/time
            const now = new Date();
            commands.push(...encoder.encode(now.toLocaleString() + '\n'));

            // Cut paper
            commands.push(0x1D, 0x56, 0x42, 0x00); // GS V B 0 (full cut)

            // Send commands
            await this.printer.transferIn(64, 64); // Wait for ready
            await this.printer.transferOut(new Uint8Array(commands));
            await this.printer.transferIn(64, 64); // Wait for completion

            console.log('✅ Receipt printed successfully');
            return true;
        } catch (error) {
            console.error('❌ Thermal print failed:', error);
            // Fallback to browser print
            return this.printToBrowser(data);
        }
    }

    // ===== BROWSER PRINT (Fallback) =====
    printToBrowser(data) {
        try {
            const printWindow = window.open('', '_blank', 'width=400,height=600');
            if (!printWindow) {
                alert('Please allow popups to print receipts');
                return false;
            }

            // Build receipt HTML
            let html = `
            <!DOCTYPE html>
            <html>
            <head>
                <title>Receipt</title>
                <style>
                    body { font-family: 'Courier New', monospace; width: 300px; margin: 0 auto; padding: 20px; }
                    .header { text-align: center; font-size: 20px; font-weight: bold; }
                    .separator { border-top: 1px dashed #000; margin: 10px 0; }
                    .item { display: flex; justify-content: space-between; font-size: 14px; }
                    .total { font-weight: bold; font-size: 16px; text-align: right; }
                    .footer { text-align: center; margin-top: 20px; }
                    .date { font-size: 12px; text-align: center; color: #666; }
                    @media print {
                        body { margin: 0; padding: 10px; }
                        .no-print { display: none; }
                    }
                </style>
            </head>
            <body>
                <div class="header">${data.header || 'SOKOPULSE POS'}</div>
                <div class="date">${new Date().toLocaleString()}</div>
                <div class="separator"></div>
            `;

            // Items
            if (data.items && data.items.length > 0) {
                data.items.forEach(item => {
                    html += `
                    <div class="item">
                        <span>${item.name} x${item.qty}</span>
                        <span>KES ${(item.price * item.qty).toFixed(2)}</span>
                    </div>
                    `;
                });
            }

            html += `
                <div class="separator"></div>
                <div class="total">TOTAL: KES ${data.total.toFixed(2)}</div>
            `;

            if (data.payment) {
                html += `
                    <div>Payment: ${data.payment.method}</div>
                    <div>Amount: KES ${data.payment.amount.toFixed(2)}</div>
                `;
            }

            if (data.change !== undefined) {
                html += `<div>Change: KES ${data.change.toFixed(2)}</div>`;
            }

            html += `
                <div class="separator"></div>
                <div class="footer">${data.footer || 'Thank You! Come Again'}</div>
                <div style="text-align:center;font-size:12px;color:#999;margin-top:10px;">
                    ${data.order_number || ''}
                </div>
                <div class="no-print" style="text-align:center;margin-top:20px;">
                    <button onclick="window.print()" style="padding:10px 30px;background:#1a3c34;color:white;border:none;border-radius:8px;cursor:pointer;font-size:14px;">
                        🖨️ Print Receipt
                    </button>
                    <button onclick="window.close()" style="padding:10px 30px;background:#e2e8f0;color:#0f172a;border:none;border-radius:8px;cursor:pointer;font-size:14px;margin-left:10px;">
                        Close
                    </button>
                </div>
            </body>
            </html>
            `;

            printWindow.document.write(html);
            printWindow.document.close();

            // Auto print after a short delay
            setTimeout(() => {
                printWindow.print();
            }, 500);

            return true;
        } catch (error) {
            console.error('❌ Browser print failed:', error);
            alert('Print failed: ' + error.message);
            return false;
        }
    }

    // ===== PRINT TEST =====
    async testPrint() {
        const testData = {
            header: 'TEST PRINT',
            items: [
                { name: 'Test Item 1', qty: 1, price: 100 },
                { name: 'Test Item 2', qty: 2, price: 50 }
            ],
            total: 200,
            payment: { method: 'Cash', amount: 200 },
            footer: 'Test Print Successful!'
        };

        return this.printReceipt(testData);
    }

    // ===== DISCONNECT =====
    async disconnect() {
        if (this.printer && this.connected) {
            try {
                await this.printer.close();
                this.connected = false;
                console.log('✅ Printer disconnected');
            } catch (error) {
                console.error('❌ Error disconnecting:', error);
            }
        }
    }
}

// ===== CREATE GLOBAL INSTANCE =====
const posPrinter = new Printer();

// ===== EXPOSE FUNCTIONS =====
window.printReceipt = function(data) {
    return posPrinter.printReceipt(data);
};

window.testPrint = function() {
    return posPrinter.testPrint();
};

window.connectPrinter = function() {
    return posPrinter.connectThermal();
};

console.log('🖨️ Printer module loaded successfully!');
