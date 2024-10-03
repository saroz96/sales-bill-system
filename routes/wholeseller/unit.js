const express = require('express');
const router = express.Router();
const Unit = require('../../models/wholeseller/Unit');
const { ensureAuthenticated, ensureCompanySelected } = require('../../middleware/auth');
const { ensureTradeType } = require('../../middleware/tradeType');



router.get('/units', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const companyId = req.session.currentCompany;
        const currentCompanyName = req.session.currentCompanyName;
        const units = await Unit.find({ company: companyId });
        res.render('wholeseller/unit/units', {
            units,
            companyId,
            currentCompanyName,
            title: 'Item Unit',
            body: 'wholeseller >> item >> unit',
            isAdminOrSupervisor: req.user.isAdmin || req.user.role === 'Supervisor'
        })
    }
})

router.post('/units', ensureAuthenticated, ensureCompanySelected, ensureTradeType, async (req, res) => {
    if (req.tradeType === 'Wholeseller') {

        const { name } = req.body;
        const companyId = req.session.currentCompany;
        const newUnit = new Unit({ name, company: companyId });
        await newUnit.save();
        console.log(newUnit);
        res.redirect('/units');
    }
})

module.exports = router