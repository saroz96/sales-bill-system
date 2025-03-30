// testData.js

const mongoose = require('mongoose');
const Stock = require('./models/Stock'); // Adjust the path as needed
const Item = require('./models/Item');   // Adjust the path as needed

const DB_URI = 'mongodb://localhost:27017/yourDatabase'; // Replace with your database URI

async function seedDatabase() {
    try {
        // Connect to MongoDB
        // await mongoose.connect(DB_URI, { useNewUrlParser: true, useUnifiedTopology: true });
        //--Connect with database--//
        mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi');
        //--Connect with database--//

        // Example Item ID to use (make sure this ID exists in your Item collection)
        const itemId = '66a9155ec228effb04104b7f'; // Replace with a valid item ID

        // Insert test stock data
        const testStock = new Stock({
            item: itemId,
            quantity: 10,
            date: new Date('2024-07-01') // Test with a known date
        });

        await testStock.save();

        console.log('Test stock data inserted successfully');

        // Close the connection
        await mongoose.disconnect();
    } catch (err) {
        console.error('Error inserting test data:', err);
        process.exit(1);
    }
}

seedDatabase();
