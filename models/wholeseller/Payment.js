const mongoose = require('mongoose');

const paymentSchema = new mongoose.Schema({
    billNumber: { type: Number, unique: true, required: true },
    date: { type: Date, required: true },
    account: { type: mongoose.Schema.Types.ObjectId, ref: 'Account' },
    debit: { type: Number, default: 0 },
    credit: { type: Number, default: 0 },
    paymentAccount: {
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
    description: { type: String },
    companyGroups: { type: mongoose.Schema.Types.ObjectId, ref: 'CompanyGroup' },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' }, // Add company reference for uniqueness
    status: { type: String, enum: ['active', 'canceled'], default: 'active' },
    isActive: { type: Boolean, default: true }
});

// Index to ensure unique account names within a company
paymentSchema.index({ billNumber: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('Payment', paymentSchema);
