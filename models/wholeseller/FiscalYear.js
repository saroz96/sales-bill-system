const mongoose = require('mongoose');

const fiscalYearSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    startDate: {
        type: Date,
        required: true
    },
    endDate: {
        type: Date,
        required: true
    },
    isActive: {
        type: Boolean,
        default: false
    },
    createdAt: {
        type: Date,
        default: Date.now
    },
    dateFormat: {
        type: String, // 'Nepali' or 'English'
        required: true
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    }
});

// Index to ensure unique account names within a company
fiscalYearSchema.index({ name: 1, company: 1 }, { unique: true });
module.exports = mongoose.model('FiscalYear', fiscalYearSchema);
