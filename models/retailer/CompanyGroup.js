const mongoose = require('mongoose');

const companygroupSchema = new mongoose.Schema({
    name: { type: String, required: true },
    type: {
        type: String,
        enum: ['Current Assets',
            'Current Liabilities',
            'Fixed Assets',
            'Loans(Liability)',
            'Capital Account',
            'Revenue Accounts',
            'Primary',
        ],
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }
});


companygroupSchema.index({ name: 1, company: 1 }, { unique: true });

module.exports = mongoose.model('CompanyGroup', companygroupSchema);