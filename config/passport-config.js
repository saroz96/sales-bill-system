const localStrategy = require('passport-local').Strategy;
const bcrypt = require('bcryptjs');
const User = require('../models/User');

function initialize(passport) {
    const authenticateUser = async (email, password, done) => {
        try {
            // Find user by email
            const user = await User.findOne({ email: email });

            // If no user found, return a message
            if (!user) {
                return done(null, false, { message: 'No user with that email' });
            }

            // Check if the user is active (not deactivated)
            if (!user.isActive) {
                return done(null, false, { message: 'Your account has been deactivated. Please contact the admin.' });
            }

            // Compare the provided password with the stored hashed password
            const isMatch = await bcrypt.compare(password, user.password);

            // If password matches, authenticate the user, otherwise return an error message
            if (isMatch) {
                return done(null, user);
            } else {
                return done(null, false, { message: 'Password incorrect' });
            }
        } catch (e) {
            return done(e);
        }
    };

    // Initialize the local strategy with email as the usernameField
    passport.use(new localStrategy({ usernameField: 'email' }, authenticateUser));

    // Serialize user to store user ID in session
    passport.serializeUser((user, done) => done(null, user.id));

    // Deserialize user to retrieve user information from the session
    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (err) {
            done(err);
        }
    });
}

module.exports = initialize;
