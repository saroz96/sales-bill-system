// errorMiddleware.js
function AppError(err, req, res, next) {
    console.error(err); // Log the error for debugging

    // Set the response status code and send the error message
    if (err.status) {
        res.status(err.status).json({ error: err.message });
    } else {
        res.status(500).json({ error: 'Internal Server Error' });
    }
}

// Export the middleware
module.exports = AppError;
