const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User'); // Adjust the path as needed

// Connect to your MongoDB
mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/sales-bill-system')
    .then(() => console.log('MongoDB connected successfully'))
    .catch(err => console.error('MongoDB connection error:', err));

const createDefaultUser = async () => {
    try {
        // Check if default admin user already exists
        const existingUser = await User.findOne({ email: 'admin@example.com' });
        if (existingUser) {
            console.log('Default admin user already exists.');
            return;
        }

        // Hash the default password
        const hashedPassword = await bcrypt.hash('12345', 10); // Use a strong password and hashing

        // Create default admin user
        const defaultUser = new User({
            name: 'System Owner',
            email: 'admin@example.com',
            password: hashedPassword,
            isAdmin: true,
            role: 'ADMINISTRATOR'
        });

        // Save the user to the database
        await defaultUser.save();
        console.log('Default admin user created successfully.');

        // Disconnect from the database
        mongoose.disconnect();
    } catch (error) {
        console.error('Error creating default admin user:', error);
        mongoose.disconnect();
    }
};

// To insert default admin user
createDefaultUser();


//To create a default admin user
//node config/createDefaultUser.js
