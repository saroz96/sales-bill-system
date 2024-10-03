const mongoose = require('mongoose');

const purchaseBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const BillCounter = mongoose.model('PurchaseBillCounter', purchaseBillCounterSchema);
module.exports = BillCounter;
