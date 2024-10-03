const mongoose = require('mongoose');

const stockAdjustmentVoucherNumberSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
})

module.exports = mongoose.model('stockAdj_Vouch', stockAdjustmentVoucherNumberSchema)