const mongoose = require('mongoose');

const journalVoucherSchema = new mongoose.Schema({
    billNumber: {
        type: Number,
    },
    date: {
        type: Date,
        required: true,
    },
    debitAccounts: [
        {
            account: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Account',
                required: true,
            },
            debit: {
                type: Number,
                required: true,
            }
        }
    ],
    creditAccounts: [
        {
            account: {
                type: mongoose.Schema.Types.ObjectId,
                ref: 'Account',
                required: true,
            },
            credit: {
                type: Number,
                required: true,
            }
        }
    ],

    description: {
        type: String,
    },
    user: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true,
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true,
    },
    status: { type: String, enum: ['active', 'canceled'], default: 'active' },
    isActive: { type: Boolean, default: true }
});

module.exports = mongoose.model('JournalVoucher', journalVoucherSchema);
