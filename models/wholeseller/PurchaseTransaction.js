// const mongoose = require('mongoose');

// const purchaseTransactionSchema = new mongoose.Schema({
//     company: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Company',
//         required: true
//     },
//     item: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Item',
//         required: true
//     },
//     account: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'Account',
//         required: true
//     },
//     billId: {
//         type: mongoose.Schema.Types.ObjectId,
//         ref: 'PurchaseBill',
//         required: true
//     },
//     quantity: {
//         type: Number,
//         required: true
//     },
//     puPrice: {
//         type: Number,
//         required: true
//     },
//     unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit' },
//     // transactionDate: {
//     //     type: Date,
//     //     default: Date.now
//     // },
//     type: {
//         type: String,
//         enum: ['Purchase', 'Sale', 'stockAdjustment'],
//         required: true
//     },
//     billNumber: {
//         type: Number,
//         required: true
//     },
//     partyBillNumber: {
//         type: Number,
//         required: true
//     },
//     accountType: {
//         type: String,
//         required: true
//     },
//     debit: {
//         type: Number,
//         required: true
//     },
//     credit: {
//         type: Number,
//         required: true
//     },
//     balance: {
//         type: Number,
//         required: true
//     },
//     paymentMode: {
//         type: String,
//         enum: ['cash', 'credit'],
//         required: true
//     },
//     date: { type: Date, default: Date.now() },
// });

// module.exports = mongoose.model('PurchaseTransaction', purchaseTransactionSchema);
