const mongoose = require('mongoose');

const openingBalanceByFiscalYearSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: () => new Date().toISOString
    },
    amount: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['Dr', 'Cr'],
        default: 'Dr'
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    }
})
const accountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    address: String,
    ward: Number,
    phone: String,
    pan: {
        type: Number,
        min: 9,
    },
    contactperson: String,
    email: {
        type: String,
    },
    openingBalanceByFiscalYear: [openingBalanceByFiscalYearSchema],
    openingBalance: {
        fiscalYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear'
        },
        amount: {
            type: Number,
            default: 0
        },
        type: {
            type: String,
            enum: ['Dr', 'Cr'],
            default: 'Dr'
        }
    },
    openingBalanceDate: {
        type: Date,
        default: new Date('2023-07-17')
    },
    companyGroups: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CompanyGroup',
    },
    date: {
        type: Date,
        default: Date.now
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    transactions: [  // Changed to an array of references
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        }
    ],
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // New field to reference the current fiscal year
    },
    defaultCashAccount: {
        type: Boolean,
        default: false // Flag to mark default cash account
    },
    isActive: { type: Boolean, default: true },
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

// Index to ensure unique account names within a company
accountSchema.index({ name: 1, company: 1, fiscalYear: 1 }, { unique: true });

module.exports = mongoose.model('Account', accountSchema);