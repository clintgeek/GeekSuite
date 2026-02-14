// Handle 404 errors (Not Found)
export const notFound = (req, res, next) => {
    const error = new Error(`Not Found - ${req.originalUrl}`);
    res.status(404);
    next(error);
};

// General error handler
export const errorHandler = (err, req, res, next) => {
    // Sometimes the status code might still be 200 even though there's an error
    const statusCode = res.statusCode === 200 ? 500 : res.statusCode;

    res.status(statusCode);
    res.json({
        message: err.message,
        // Only provide stack trace in development
        stack: process.env.NODE_ENV === 'production' ? null : err.stack,
    });
};