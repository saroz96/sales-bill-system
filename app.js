const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const session = require('express-session');
const flash = require('connect-flash');
const methodOverride = require('method-override');
const { numberToWords } = require('./public/js/helpers');

const passport = require('passport');
const initializePassport = require('./config/passport-config');

const salesBillsRoutes = require('./routes/wholeseller/SalesBill');
const unitRoutes = require('./routes/wholeseller/unit');
const accountRoutes = require('./routes/wholeseller/account');
const companyGroupRoutes = require('./routes/wholeseller/companyGroup');
const itemsCategoryRoutes = require('./routes/wholeseller/items_category');
const itemsRoutes = require('./routes/wholeseller/items');
const transactionRoutes = require('./routes/wholeseller/transaction');
const indexRoutes = require('./routes/wholeseller/index');
const usersRoutes = require('./routes/users');
const companyRoutes = require('./routes/companyRoutes');
const stockAdjustmentsRoutes = require('./routes/wholeseller/stockAdjustments');
const itemsLedgerRoutes = require('./routes/wholeseller/items-ledger');
const settingsRoutes = require('./routes/wholeseller/Settings');
const purchaseRoutes = require('./routes/wholeseller/purchaseBill');
const paymentRoutes = require('./routes/wholeseller/payment');
const receiptRoutes = require('./routes/wholeseller/receipt');
const journalVoucherRoutes = require('./routes/wholeseller/journalVoucher');
const salesReturnRoutes = require('./routes/wholeseller/salesReturn');
const purchaseReturnRoutes = require('./routes/wholeseller/purchaseReturn');
const debitNoteRoutes = require('./routes/wholeseller/debitNote');
const creditNoteRoutes = require('./routes/wholeseller/creditNote');
const fiscalYearRoutes = require('./routes/wholeseller/fiscalYear');
const ageingReportRoutes = require('./routes/wholeseller/ageingReport');

//Admin Panel
const systemAdminDashboardRoutes = require('./routes/systemAdmin/adminDashboard');

const path = require('path');
const ejsMate = require('ejs-mate');

const app = express();

// Initialize Passport
initializePassport(passport);

// Connect with database
mongoose.connect('mongodb+srv://saroj:12345@cluster0.vgu4kmg.mongodb.net/sales-bill-system');
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

//Admin Panel
app.use('/', systemAdminDashboardRoutes);

// Start the server
app.listen(3000, () => {
    console.log('Server is running on port 3000');
});
