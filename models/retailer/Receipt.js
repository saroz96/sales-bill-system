const mongoose = require('mongoose');

const receiptSchema = new mongoose.Schema({
    billNumber: { type: Number, required: true },
    date: { type: Date, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    receiptAccount: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Account', // References a specific account (e.g., Cash in Hand, Bank Account)
    },
    InstType: {
        type: String,
        enum: ['N/A', 'RTGS', 'Fonepay', 'Cheque', 'Connect-Ips', 'Esewa', 'Khalti']
    },
    bankAcc: { type: String },
    InstNo: {
        type: String
    },
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    companyGroups: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyGroup' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, // Add company reference for uniqueness
    description: { type: String },
    status: { type: String, enum: ['active', 'canceled'], default: 'active' },
    isActive: { type: Boolean, default: true },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
});

// Index to ensure unique account names within a company
receiptSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });

module.exports = mongoose.model('Receipt', receiptSchema);
