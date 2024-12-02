const mongoose = require('mongoose');

const companySchema = new mongoose.Schema({
    name: String,
    address: String,
    country: String,
    state: String,
    city: String,
    pan: { type: String, max: 9, min: 9 },
    phone: String,
    ward: Number,
    email: String,
    tradeType: {
        type: String,
        required: true,
        enum: ['Wholeseller', 'Retailer', 'Pharmacy', 'Other'] // Add other trade types as needed
    },
    owner: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    users: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }], // Array to hold user IDs

    settings: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Settings'
    },
    dateFormat: {
        type: String,
        enum: ['nepali', 'english'], // Enum to restrict values to 'nepali' or 'english'
    },
    fiscalYear: { type: mongoose.Schema.Types.ObjectId, ref: 'FiscalYear' },
    renewalDate: {
        type: String
    },
    fiscalYearStartDate: {
        type: String
    },
    vatEnabled: {
        type: Boolean,
        default: false // Default is VAT disabled
    },
}, { timestamps: true });

module.exports = mongoose.model('Company', companySchema);
