const mongoose = require('mongoose');

const creditNoteBillCounterSchema = new mongoose.Schema({
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', unique: true, required: true },
    count: { type: Number, default: 0 },
});

const BillCounter = mongoose.model('creditNoteBillCounter', creditNoteBillCounterSchema);
module.exports = BillCounter;
