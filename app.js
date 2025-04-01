const express = require('express');
const mongoose = require('mongoose');
// require('dotenv').config(); // Make sure to load environment variables
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const { numberToWords } = require('./public/js/helpers');

const passport = require('passport');
const initializePassport = require('./config/passport-config');

const salesBillsRoutes = require('./routes/retailer/SalesBill');
const unitRoutes = require('./routes/retailer/unit');
const accountRoutes = require('./routes/retailer/account');
const companyGroupRoutes = require('./routes/retailer/companyGroup');
const itemsCategoryRoutes = require('./routes/retailer/items_category');
const itemsRoutes = require('./routes/retailer/items');
const transactionRoutes = require('./routes/retailer/transaction');
const indexRoutes = require('./routes/retailer/index');
const usersRoutes = require('./routes/users');
const companyRoutes = require('./routes/companyRoutes');
const stockAdjustmentsRoutes = require('./routes/retailer/stockAdjustments');
const itemsLedgerRoutes = require('./routes/retailer/items-ledger');
const settingsRoutes = require('./routes/retailer/Settings');
const purchaseRoutes = require('./routes/retailer/purchaseBill');
const paymentRoutes = require('./routes/retailer/payment');
const receiptRoutes = require('./routes/retailer/receipt');
const journalVoucherRoutes = require('./routes/retailer/journalVoucher');
const salesReturnRoutes = require('./routes/retailer/salesReturn');
const purchaseReturnRoutes = require('./routes/retailer/purchaseReturn');
const debitNoteRoutes = require('./routes/retailer/debitNote');
const creditNoteRoutes = require('./routes/retailer/creditNote');
const fiscalYearRoutes = require('./routes/retailer/fiscalYear');
const ageingReportRoutes = require('./routes/retailer/ageingReport');
const stockStatusRoutes = require('./routes/retailer/stockStatus');

//Admin Panel
const systemAdminDashboardRoutes = require('./routes/systemAdmin/adminDashboard');

const path = require('path');
const ejsMate = require('ejs-mate');
const setNoCache = require('./middleware/setNoCache');
const AppError = require('./middleware/AppError');

const app = express();

// Initialize Passport
initializePassport(passport);


// const mongoUri = process.env.MONGO_URI; // Access MongoDB URI from the .env file

// mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });

// const db = mongoose.connection;

// db.on("error", console.error.bind(console, "connection error:"));
// db.once("open", () => {
//     console.log("Database connected");
// });

// Connect with database
mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/sales-bill-system');
// mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/Sarathi');
const db = mongoose.connection;
db.on("error", console.error.bind(console, "connection error:"));
db.once("open", () => {
    console.log("Database connected");
});



const sessionConfig = {
    secret: 'thisisnotagoodsecret',
    resave: false,
    saveUninitialized: false,
    serverSelectionTimeoutMS: 5000,
    cookie: {
        httpOnly: true,
        expires: Date.now() + 1000 * 60 * 60 * 24 * 7,
        maxAge: 1000 * 60 * 60 * 24 * 7
    }
};

app.use(session(sessionConfig));
app.use(flash());
app.set('view engine', 'ejs');
app.engine('ejs', ejsMate);
app.set('views', path.join(__dirname, 'views'));

app.use(passport.initialize());
app.use(passport.session());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));
app.use(methodOverride('_method'));

// Flash middleware
app.use((req, res, next) => {
    res.locals.user = req.user;
    res.locals.messages = req.flash('success');
    res.locals.error = req.flash('error');
    next();
});

app.locals.numberToWords = numberToWords;

// Routes
app.use('/', salesBillsRoutes);
app.use('/', unitRoutes);
app.use('/', accountRoutes);
app.use('/', companyGroupRoutes);
app.use('/', itemsCategoryRoutes);
app.use('/', itemsRoutes);
app.use('/api', transactionRoutes);
app.use('/', indexRoutes);
app.use('/', usersRoutes);
app.use('/', companyRoutes);
app.use('/', stockAdjustmentsRoutes);
app.use('/', itemsLedgerRoutes);
app.use('/settings', settingsRoutes);
app.use('/', purchaseRoutes);
app.use('/', paymentRoutes);
app.use('/', receiptRoutes);
app.use('/', journalVoucherRoutes);
app.use('/', salesReturnRoutes);
app.use('/', purchaseReturnRoutes);
app.use('/', debitNoteRoutes);
app.use('/', creditNoteRoutes);
app.use('/', fiscalYearRoutes);
app.use('/', ageingReportRoutes);
app.use('/retailer', stockStatusRoutes);

//Admin Panel
app.use('/', systemAdminDashboardRoutes);

app.all('*', (req, res, next) => {
    res.render('404');
})

app.use((err, req, res, next) => {
    const { statusCode = 500, message = 'Something went wrong' } = err;
    if (statusCode === 404) {
        return res.render('404.ejs', { message });
    }
    // Handle other errors if needed
    res.status(statusCode).send({ status: 'error', message });
});


app.use(setNoCache); //Globally

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
