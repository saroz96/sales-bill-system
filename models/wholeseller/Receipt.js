const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
    billNumber: { type: Number, unique: true, required: true },
    date: { type: Date, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    // notes: { type: String },
    receiptAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account', // References a specific account (e.g., Cash in Hand, Bank Account)
    },
    InstType: {
        type: String,
        enum: ['N/A', 'RTGS', 'Fonepay', 'Cheque', 'Connect-Ips', 'Esewa', 'Khalti']
    },
    InstNo: {
        type: String
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyGroups: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyGroup' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' } // Add company reference for uniqueness
});

// Index to ensure unique account names within a company
receiptSchema.index({ billNumber: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Receipt', receiptSchema);
