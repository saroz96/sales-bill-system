const mongoose = require('mongoose');

const openingStockSchema = new mongoose.Schema({
    item: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Item',
        required: true
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    },
    quantity: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Ensure that each item-fiscalYear combination is unique
openingStockSchema.index({ item: 1, fiscalYear: 1 }, { unique: true });

module.exports = mongoose.model('OpeningStock', openingStockSchema);
