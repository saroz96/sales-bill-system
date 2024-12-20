const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const SettingsSchema = new Schema({
    companyId: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    userId: {
        type: Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    roundOffSales: {
        type: Boolean,
        default: false
    },
    roundOffPurchase: {
        type: Boolean,
        default: false
    },
    roundOffSalesReturn: {
        type: Boolean,
        default: false
    },
    roundOffPurchaseReturn: {
        type: Boolean,
        default: false
    },
    displayTransactions: {
        type: Boolean,
        default: false
    },
    displayTransactionsForPurchase: {
        type: Boolean,
        default: false
    },
    displayTransactionsForSalesReturn: {
        type: Boolean,
        default: false
    },
    displayTransactionsForPurchaseReturn: {
        type: Boolean,
        default: false
    },
    value: {
        type: mongoose.Schema.Types.Mixed
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear', // Reference the current fiscal year
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
});

// Create a unique compound index for company
SettingsSchema.index({ company: 1 }, { unique: true });

module.exports = mongoose.model('Settings', SettingsSchema);
