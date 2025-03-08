const mongoose = require('mongoose');

const openingBalanceByFiscalYearSchema = new mongoose.Schema({
    date: {
        type: Date,
        default: () => new Date().toISOString
    },
    amount: {
        type: Number,
        default: 0
    },
    type: {
        type: String,
        enum: ['Dr', 'Cr'],
        default: 'Dr'
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear',
        required: true
    }
})
const accountSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
    },
    address: String,
    ward: Number,
    phone: String,
    pan: {
        type: Number,
        min: 9,
    },
    contactperson: String,
    email: {
        type: String,
    },
    uniqueNumber: {
        type: Number,
        unique: true
    }, // 4-digit unique item number
    openingBalanceByFiscalYear: [openingBalanceByFiscalYearSchema],
    openingBalance: {
        fiscalYear: {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'FiscalYear'
        },
        amount: {
            type: Number,
            default: 0
        },
        type: {
            type: String,
            enum: ['Dr', 'Cr'],
            default: 'Dr'
        }
    },
    openingBalanceDate: {
        type: Date,
        default: Date.now()
    },
    companyGroups: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'CompanyGroup',
    },
    date: {
        type: Date,
        default: Date.now
    },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company',
        required: true
    },
    transactions: [  // Changed to an array of references
        {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Transaction'
        }
    ],
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // New field to reference the current fiscal year
    },
    defaultCashAccount: {
        type: Boolean,
        default: false // Flag to mark default cash account
    },
    isActive: { type: Boolean, default: true },
    createdAt: {
        type: Date,
        default: Date.now()
    }
});

// Index to ensure unique account names within a company
accountSchema.index({ name: 1, company: 1, fiscalYear: 1 }, { unique: true });

// Pre-save hook to generate a unique 4-digit number for each account
accountSchema.pre('save', async function (next) {
    if (!this.uniqueNumber) {
        let isUnique = false;
        while (!isUnique) {
            // Generate a random 4-digit number
            const randomNum = Math.floor(1000 + Math.random() * 9000); // Generates a 4-digit number

            // Check if this number is already in use
            const existingAccount = await mongoose.model('Account').findOne({ uniqueNumber: randomNum });
            if (!existingAccount) {
                // If the number is unique, assign it to the item
                this.uniqueNumber = randomNum;
                isUnique = true;
            }
        }
    }
    next();
});

module.exports = mongoose.model('Account', accountSchema);