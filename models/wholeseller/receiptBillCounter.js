const mongoose = require('mongoose');

const receiptBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const receiptBillCounter = mongoose.model('receiptBillCounter', receiptBillCounterSchema);
module.exports = receiptBillCounter;
