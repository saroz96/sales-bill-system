const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PurchaseBillSchema = new Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    firstPrinted: {
        type: Boolean,
        default: false
    },
    printCount: {
        type: Number,
        default: 0
    },
    purchaseSalesType: String,
    originalCopies: { type: Number, default: 1 },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    billNumber: { type: Number, required: true },
    partyBillNumber: { type: String },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
    settings: { type: mongoose.Schema.Types.ObjectId, ref: 'Settings' },
    fiscalYear: {
        type: Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
    items: [{
        item: { type: mongoose.Schema.Types.ObjectId, ref: 'Item' },
        unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
        WSUnit: {
            type: Number, // Alternative unit name (e.g., "Box")
        },
        quantity: {
            type: Number,
        },  // Required in item schema
        bonus: {
            type: Number,
        },
        Altbonus: {
            type: Number,
            set: function (value) {
                // Calculate quantity based on WSUnit
                // Use default value of 1 for WSUnit if not specified
                const wsUnit = this.WSUnit || 1;
                return wsUnit * value;
            }
        },  // Required in item schema
        price: {
            type: Number,
        },     // Required in item schema
        puPrice: {
            type: Number,
        },
        mrp: {
            type: Number,
            default: 0,
        },
        marginPercentage: { type: Number, default: 0 },
        currency: {
            type: String,
        },
        //for itemsLedger
        Altquantity: {
            type: Number,
            set: function (value) {
                // Calculate quantity based on WSUnit
                // Use default value of 1 for WSUnit if not specified
                const wsUnit = this.WSUnit || 1;
                return wsUnit * value;
            }
        },  // Required in item schema
        Altprice: {
            type: Number,
            set: function (value) {
                // Calculate quantity based on WSUnit
                const wsUnit = this.WSUnit || 1;
                return value / wsUnit;
            }
        },     // Required in item schema
        AltpuPrice: {
            type: Number,
            set: function (value) {
                // Calculate quantity based on WSUnit
                const wsUnit = this.WSUnit || 1;
                return value / wsUnit;
            }
        },

        batchNumber: { type: String },
        expiryDate: { type: Date },
        vatStatus: {
            type: String,
            required: true,
            enum: ['vatable', 'vatExempt']
        },
        uniqueUuId: { type: String },
    }],
    subTotal: Number,
    nonVatPurchase: Number,
    taxableAmount: Number,
    discountPercentage: Number,
    discountAmount: Number,
    vatPercentage: { type: Number, default: 13 }, // Default value is optional
    vatAmount: Number,
    totalAmount: Number,
    isVatExempt: { type: Boolean, default: false },
    isVatAll: { type: String },
    roundOffAmount: Number,
    paymentMode: String,
    // quantity: Number,
    // puPrice: Number,
    date: { type: Date, default: Date.now() },
    transactionDate: { type: Date, default: Date.now() }

});

PurchaseBillSchema.statics.isEditable = async function (billId) {
    const purchaseBill = await this.findById(billId).populate('items.item');

    if (!purchaseBill) {
        throw new Error('Purchase bill not found')
    }

    for (const purchaseItem of purchaseBill.items) {
        const item = purchaseItem.item;

        // Calculate available stock
        const totalStock = item.stock;
        const usedStock = purchaseItem.quantity; // Quantity being edited or removed

        // Check if the stock is insufficient
        if (totalStock < usedStock) {
            return false;
        }
    }
    return true;
};

// //This means each company can have accounts with the same name, but account names must be unique within a company.
PurchaseBillSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });
// //---------------------------------------------------------------------------------------------------------------


module.exports = mongoose.model('PurchaseBill', PurchaseBillSchema);