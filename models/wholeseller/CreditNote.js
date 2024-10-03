const mongoose = require('mongoose');

const creditNoteSchema = new mongoose.Schema({
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
        required: true,
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
});

module.exports = mongoose.model('CreditNote', creditNoteSchema);
