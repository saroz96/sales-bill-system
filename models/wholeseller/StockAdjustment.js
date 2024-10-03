const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StockAdjustmentSchema = new Schema({
    item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
    billNumber: { type: Number, required: true },
    unit: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
    quantity: { type: Number, required: true },
    puPrice: { type: Number, required: true },
    adjustmentType: { type: String, enum: ['xcess', 'short'], required: true },
    // date: { type: Date, default: Date.now() },
    date: { type: Date, default: Date.now(), required: true },
    reason: { type: [String], default: [] }, // Define reason as an array of strings
    note: { type: String, required: true },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },

    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // New field to reference the current fiscal year
    }
});

module.exports = mongoose.model('StockAdjustment', StockAdjustmentSchema);