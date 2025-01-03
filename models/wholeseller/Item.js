const mongoose = require('mongoose');

// Helper function to calculate default expiry date (2 years from now)
const getDefaultExpiryDate = () => {
    const currentDate = new Date();
    currentDate.setFullYear(currentDate.getFullYear() + 2);
    return currentDate.toISOString().split("T")[0]; // Returns in YYYY-MM-DD format
};

const stockEntrySchema = new mongoose.Schema({
    date: {
        type: Date,
        default: () => new Date().toISOString
    },
    quantity: {
        type: Number,
    },
    batchNumber: {
        type: String,
        default: 'XXX'
    },
    expiryDate: {
        type: String,
        default: getDefaultExpiryDate
    },
    price: { type: Number },
    puPrice: { type: Number },
    mrp: { type: Number },
    marginPercentage: { type: Number },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear'
    }
});


const itemSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true
    },
    hscode: Number,
    category: {
        type: mongoose.Schema.Types.ObjectId, ref: 'Category',
        required: true
    },
    price: Number,
    puPrice: Number,
    unit: {
        type: mongoose.Schema.Types.ObjectId, ref: 'Unit',
        required: true
    },
    vatStatus: {
        type: String,
        required: true,
        enum: ['all', 'vatable', 'vatExempt']
    },
    stock: {
        type: Number,
        default: 0
    }, // Total stock
    openingStockByFiscalYear: [{
        fiscalYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear'
        },
        openingStock: {
            type: Number,
            default: 0
        },
        openingStockBalance: {
            type: Number,
            default: 0
        },
        purchasePrice: {
            type: Number,
            default: 0
        },
        salesPrice: {
            type: Number,
            default: 0
        }
    }],
    minStock: {
        type: Number,
        default: 0
    }, // Minimum stock level
    maxStock: {
        type: Number,
        default: 100
    }, // Maximum stock level
    reorderLevel: {
        type: Number,
        default: 0 // Set a default reorder level or leave it empty for custom levels
    }, // New field for reorder threshold
    uniqueNumber: {
        type: Number,
        unique: true
    }, // 4-digit unique item number
    sales: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'SalesBill'
    }],
    salesReturn: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'SalesReturn'
    }],
    purchase: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill'
    }],
    PurchaseReturn: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseReturns'
    }],
    stockAdjustments: [{
        type: mongoose.Schema.Types.ObjectId, ref: 'StockAdjustment'
    }], // Stock adjustments log
    stockEntries: [stockEntrySchema], // FIFO stock entries
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear', // Reference the current fiscal year
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now()
    } // Field to track item creation time
});

// Ensure unique item names within a company and fiscal year
itemSchema.index({ name: 1, company: 1, fiscalYear: 1 }, { unique: true });

// Pre-save hook to generate a unique 4-digit number for each item
itemSchema.pre('save', async function (next) {
    if (!this.uniqueNumber) {
        let isUnique = false;
        while (!isUnique) {
            // Generate a random 4-digit number
            const randomNum = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number

            // Check if this number is already in use
            const existingItem = await mongoose.model('Item').findOne({ uniqueNumber: randomNum });
            if (!existingItem) {
                // If the number is unique, assign it to the item
                this.uniqueNumber = randomNum;
                isUnique = true;
            }
        }
    }
    next();
});

// // Method to update stock entries
// itemSchema.methods.updateStockEntries = async function (batchNumber, quantity, puPrice, price, expiryDate) {
//     // Find or create stock entry
//     let stockEntry = this.stockEntries.find(entry => entry.batchNumber === batchNumber && entry.expiryDate?.toISOString() === expiryDate?.toISOString());

//     if (stockEntry) {
//         // Update existing stock entry
//         stockEntry.remainingQuantity += quantity;
//     } else {
//         // Add new stock entry
//         stockEntry = {
//             batchNumber,
//             quantity,
//             remainingQuantity: quantity,
//             cost: puPrice,
//             salesPrice: price,
//             expiryDate
//         };
//         this.stockEntries.push(stockEntry);
//     }

//     // Update item-level prices
//     this.puPrice = this.puPrice; // Ensure purchase price is set correctly
//     this.price = this.price; // Ensure sales price is set correctly

//     await this.save();
// };


module.exports = mongoose.model('Item', itemSchema);
