const mongoose = require('mongoose');

const transactionSchema = new mongoose.Schema({
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
    },
    unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },

    mainUnit: { type: mongoose.Schema.Types.ObjectId, ref: 'MainUnit' },

    account: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    billId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SalesBill',
    },
    purchaseBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PurchaseBill',
    },
    purchaseReturnBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PurchaseReturn',
    },
    journalBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'JournalVoucher'
    },
    debitNoteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'DebitNote'
    },
    creditNoteId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CreditNote'
    },
    salesReturnBillId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'SalesReturn'
    },
    paymentAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Payment'
    },
    receiptAccountId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Receipt'
    },
    WSUnit: {
        type: Number, // Alternative unit name (e.g., "Box")
    },
    quantity: {
        type: Number,
        set: function (value) {
            // Calculate quantity based on WSUnit
            // Use default value of 1 for WSUnit if not specified
            const wsUnit = this.WSUnit || 1;
            return wsUnit * value;
        }
    },
    price: {
        type: Number,
        default: 0,
    },
    puPrice: {
        type: Number,
        set: function (value) {
            // Calculate quantity based on WSUnit
            const wsUnit = this.WSUnit || 1;
            return value / wsUnit;
        }
    },
    type: {
        type: String,
        enum: ['Purc', 'PrRt', 'Sale', 'SlRt', 'stockAdjustment', 'Pymt', 'Rcpt', 'Jrnl', 'DrNt', 'CrNt', 'Opening Balance'],
    },
    isType: {
        type: String,
        enum: ['VAT', 'RoundOff', 'Purc', 'PrRt', 'Sale', 'SlRt']
    },
    billNumber: {
        type: Number,
    },
    partyBillNumber: { type: String },
    salesBillNumber: { type: String },
    accountType: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account', // References a specific account (e.g., Cash in Hand, Bank Account)
    },
    purchaseSalesType: {
        type: String,
    },
    purchaseSalesReturnType: {
        type: String
    },
    journalAccountType: {
        type: String
    },
    journalAccountDrCrType: {
        type: String
    },
    drCrNoteAccountType: {
        type: String
    },
    drCrNoteAccountTypes: {
        type: String
    },
    debit: {
        type: Number,
        required: true
    },
    credit: {
        type: Number,
        required: true
    },
    balance: {
        type: Number,
    },
    paymentMode: {
        type: String,
        enum: ['cash', 'credit', 'Payment', 'Receipt', 'Journal', 'Dr Note', 'Cr Note'], // Used for Sales and Purchase transactions
    },
    paymentAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account', // References a specific account (e.g., Cash in Hand, Bank Account)
    },

    receiptAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account'
    },
    debitAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    creditAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account',
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // New field to reference the current fiscal year
    },
    date: { type: Date, default: Date.now() },
    status: { type: String, enum: ['active', 'canceled'], default: 'active' },
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('Transaction', transactionSchema);