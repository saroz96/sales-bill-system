const mongoose = require('mongoose');

const debitNoteSchema = new mongoose.Schema({
    billNumber: {
        type: Number,
    },
    date: {
        type: Date,
        required: true,
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
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

debitNoteSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });


module.exports = mongoose.model('DebitNote', debitNoteSchema);
