const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

// Define the user schema
const userSchema = new mongoose.Schema({
    name: { type: String, required: true },
    email: {
        type: String,
        required: true,
        unique: true,
        lowercase: true, // Convert email to lowercase
        trim: true, // Trim whitespace
        match: [/.+@.+\..+/, 'Please enter a valid email address'] // Email validation regex
    },
    password: { type: String, required: true },
    company: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Company'
    },
    fiscalYear: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'FiscalYear' // Reference to the current fiscal year
    },
    isActive: { type: Boolean, default: true },  // User status
    isAdmin: { type: Boolean, default: false },  // Admin flag
    role: {
        type: String,
        enum: ['Admin', 'Sales', 'Purchase', 'Supervisor', 'ADMINISTRATOR'],
        default: 'Sales' // Default role
    }
}, { timestamps: true }); // Add timestamps for createdAt and updatedAt

const User = mongoose.model('User', userSchema);

module.exports = User;
