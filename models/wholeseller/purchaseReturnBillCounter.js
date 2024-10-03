const mongoose = require('mongoose');

const purchaseReturnBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const purchaseReturnBillCounter = mongoose.model('purchaseReturnBillCounter', purchaseReturnBillCounterSchema);
module.exports = purchaseReturnBillCounter;
