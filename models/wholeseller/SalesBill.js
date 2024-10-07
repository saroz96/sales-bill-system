const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SalesBillSchema = new Schema({
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
    purchaseSalesType: { type: String, required: true },
    originalCopies: { type: Number, default: 1 },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    billNumber: { type: Number, required: true },
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
        quantity: Number,
        price: Number,
        batchNumber: {
            type: String,
        },
        expiryDate: {
            type: Date // Optional field, used if dealing with perishable goods
        },
        vatStatus: {
            type: String,
            required: true,
            enum: ['vatable', 'vatExempt']
        }
    }],
    subTotal: Number,
    nonVatSales: Number,
    taxableAmount: Number,
    discountPercentage: Number,
    discountAmount: Number,
    vatPercentage: { type: Number, default: 13 }, // Default value is optional
    vatAmount: Number,
    totalAmount: Number,
    isVatExempt: { type: Boolean, default: false },
    roundOffAmount: Number,
    paymentMode: String,
    quantity: Number,
    price: Number,
    // date: { type: String },
    date: { type: Date, default: Date.now() },
    transactionDate: { type: Date, default: Date.now() }

    // oppositeDate: { type: String }
    // romanDate: { type: Date, default: Date.now() }


});

// //This means each company can have accounts with the same name, but account names must be unique within a company.
SalesBillSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });
// //---------------------------------------------------------------------------------------------------------------


module.exports = mongoose.model('SalesBill', SalesBillSchema);