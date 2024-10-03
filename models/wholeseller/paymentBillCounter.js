const mongoose = require('mongoose');

const paymentBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const paymentBillCounter = mongoose.model('paymentBillCounter', paymentBillCounterSchema);
module.exports = paymentBillCounter;
