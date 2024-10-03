const mongoose = require('mongoose');

const stockAdjustmentBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const StockAdjustmentBillCounter = mongoose.model('stockAdjustmentBillCounter', stockAdjustmentBillCounterSchema);
module.exports = StockAdjustmentBillCounter;
