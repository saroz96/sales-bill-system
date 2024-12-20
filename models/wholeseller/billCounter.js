// const mongoose = require('mongoose');

// const billCounterSchema = new mongoose.Schema({
//     company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
//     count: { type: Number, default: 0 },
// });

// const BillCounter = mongoose.model('BillCounter', billCounterSchema);
// module.exports = BillCounter;
const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const billCounterSchema = new Schema({
    company: {
        type: Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    fiscalYear: {
        type: Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
    transactionType: {
        type: String, // e.g., 'sales', 'purchase', 'salesReturn', 'purchaseReturn', etc.
        required: true
    },
    currentBillNumber: {
        type: Number,
        default: 0 // Start at 1 for the new fiscal year
    },
});

// Create a compound index to enforce uniqueness within company, fiscal year, and transaction type
billCounterSchema.index({ company: 1, fiscalYear: 1, transactionType: 1 }, { unique: true });

const BillCounter = mongoose.model('BillCounter', billCounterSchema);
module.exports = BillCounter;

