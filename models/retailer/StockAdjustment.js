const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const StockAdjustmentSchema = new Schema({
    items: [
        {
            item: { type: Schema.Types.ObjectId, ref: 'Item', required: true },
            unit: { type: Schema.Types.ObjectId, ref: 'Unit', required: true },
            quantity: { type: Number, required: true },
            batchNumber: { type: String },
            expiryDate: { type: Date },
            puPrice: { type: Number, required: true },
            reason: { type: [String], default: [] }, // Define reason as an array of strings
            vatStatus: {
                type: String,
                required: true,
                enum: ['vatable', 'vatExempt']
            }
        },
    ],
    adjustmentType: { type: String, enum: ['xcess', 'short'], required: true },
    billNumber: { type: Number, required: true },
    date: { type: Date, default: Date.now },
    note: { type: String },
    company: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    isVatExempt: { type: Boolean, default: false },
    isVatAll: { type: String },

    subTotal: { type: Number, default: 0 },
    nonVatAdjustment: { type: Number, default: 0 },
    taxableAmount: { type: Number, default: 0 },
    discountPercentage: { type: Number, default: 0 },
    discountAmount: { type: Number, default: 0 },
    vatPercentage: { type: Number, default: 13 },
    vatAmount: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    isVatExempt: { type: Boolean, default: false },
    roundOffAmount: { type: Number, default: 0 },

    status: { type: String, enum: ['active', 'canceled'], default: 'active' },
    isActive: { type: Boolean, default: true },

    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // New field to reference the current fiscal year
    }
});

StockAdjustmentSchema.index({ billNumber: 1, company: 1, fiscalYear: 1 }, { unique: true });
module.exports = mongoose.model('StockAdjustment', StockAdjustmentSchema);