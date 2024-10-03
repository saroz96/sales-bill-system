const mongoose = require('mongoose');

const billCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const BillCounter = mongoose.model('BillCounter', billCounterSchema);
module.exports = BillCounter;
