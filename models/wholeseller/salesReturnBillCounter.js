const mongoose = require('mongoose');

const salesReturnBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const SalesReturnBillCounter = mongoose.model('salesReturnBillCounter', salesReturnBillCounterSchema);
module.exports = SalesReturnBillCounter;
