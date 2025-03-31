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
    WSUnit: {
        type: Number, // Alternative unit name (e.g., "Box")
    },
    quantity: {
        type: Number,
    },
    bonus: {
        type: Number,
    },
    batchNumber: {
        type: String,
        default: 'XXX',
    },
    expiryDate: {
        type: String,
        default: getDefaultExpiryDate,
    },
    price: {
        type: Number,
        default: 0,
    },
    puPrice: {
        type: Number,
        default: 0,
    },
    mainUnitPuPrice: {
        type: Number,
        default: 0,
    },
    mrp: {
        type: Number,
        default: 0,
    },
    marginPercentage: { type: Number, default: 0 },
    currency: { type: String },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear'
    },
    uniqueUuId: { type: String },
    purchaseBillId: { type: mongoose.Schema.Types.ObjectId, ref: 'PurchaseBill' } // Add this field
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

    mainUnitPuPrice: {
        type: Number,
        default: 0,
    },

    mainUnit: {
        type: mongoose.Schema.Types.ObjectId, ref: 'MainUnit',
        required: true
    },

    WSUnit: {
        type: Number, // Alternative unit name (e.g., "Box")
        default: 0
    },
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
        default: 0,
        // set: function (value) {
        //     // Calculate stock based on WSUnit and quantity
        //     return this.WSUnit * value;
        // }
    }, // Total stock
    openingStock: {
        type: Number,
        default: 0
    },
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
            type: String,
            default: 0
        },
        purchasePrice: {
            type: String,
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
    }, // Field to track item creation time
    date: { type: Date, default: Date.now() },
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

module.exports = mongoose.model('Item', itemSchema);
