/**
 * Global Error Handler Middleware for RifaPlus Backend
 * Centralized error handling for Express.js
 * Logs to console + Sentry + Database
 * 
 * Usage: Add as last middleware in server.js:
 * app.use(errorHandler);
 */

const path = require('path');

class BackendErrorHandler {
    constructor(logger = null) {
        this.logger = logger;
        this.isDevelopment = process.env.NODE_ENV !== 'production';
    }

    /**
     * Express error middleware
     */
    handle() {
        return (err, req, res, next) => {
            const errorInfo = this.normalizeError(err, req);
            
            // Log error
            this.logError(errorInfo);
            
            // Send to Sentry if available
            this.sendToSentry(errorInfo);
            
            // Send to client
            this.sendResponse(res, errorInfo);
        };
    }

    normalizeError(err, req) {
        const errorInfo = {
            timestamp: new Date().toISOString(),
            message: err.message || 'Unknown error',
            type: err.name || 'Error',
            status: err.status || err.statusCode || 500,
            stack: this.isDevelopment ? err.stack : undefined,
            
            // Request context
            method: req.method,
            url: req.originalUrl,
            ip: req.ip,
            userId: req.user?.id,
            
            // Error classification
            isOperational: this.isOperationalError(err),
            isDatabaseError: this.isDatabaseError(err),
            isValidationError: this.isValidationError(err),
        };

        // Add additional context based on error type
        if (err.details) errorInfo.details = err.details;
        if (err.code) errorInfo.code = err.code;
        if (err.statusCode) errorInfo.statusCode = err.statusCode;

        return errorInfo;
    }

    isOperationalError(err) {
        // Expected errors that we can handle gracefully
        return err.isOperational === true || 
               err instanceof ValidationError ||
               err instanceof AuthenticationError ||
               err instanceof AuthorizationError ||
               err instanceof NotFoundError;
    }

    isDatabaseError(err) {
        return err.name === 'DatabaseError' ||
               err.code?.startsWith('PROTOCOL') ||
               err.code === 'ER_';
    }

    isValidationError(err) {
        return err.name === 'ValidationError' ||
               err.statusCode === 400;
    }

    logError(errorInfo) {
        const { message, type, status, method, url, isOperational, isDatabaseError } = errorInfo;

        if (this.isDevelopment) {
            console.group(`❌ [${type}] ${status} ${method} ${url}`);
            console.error(`Message: ${message}`);
            console.error(`Stack:`, errorInfo.stack);
            console.error('Full context:', errorInfo);
            console.groupEnd();
        } else {
            // Production: only log critical errors
            if (!isOperational || isDatabaseError) {
                console.error(`[ERROR] ${status} - ${message}`, {
                    method,
                    url,
                    userId: errorInfo.userId,
                    timestamp: errorInfo.timestamp
                });
            }
        }

        // Log to file in production
        if (!this.isDevelopment && this.logger) {
            const logLevel = isOperational ? 'warn' : 'error';
            this.logger[logLevel](message, errorInfo);
        }
    }

    sendToSentry(errorInfo) {
        try {
            if (typeof Sentry === 'undefined') return;

            const { message, type, status, isOperational, userId } = errorInfo;

            Sentry.captureException(new Error(message), {
                level: isOperational ? 'warning' : 'error',
                tags: {
                    error_type: type,
                    status_code: status,
                    operational: isOperational
                },
                user: userId ? { id: userId } : undefined,
                extra: errorInfo
            });
        } catch (e) {
            console.error('Failed to send error to Sentry:', e);
        }
    }

    sendResponse(res, errorInfo) {
        const { status, message, isOperational, isDatabaseError } = errorInfo;

        // Database errors in production should be generic
        if (isDatabaseError && !this.isDevelopment) {
            return res.status(500).json({
                success: false,
                error: 'Error interno del servidor. Intenta de nuevo más tarde.',
                code: 'INTERNAL_ERROR',
                timestamp: errorInfo.timestamp
            });
        }

        // Operational errors: send meaningful message
        if (isOperational) {
            return res.status(status).json({
                success: false,
                error: message,
                code: errorInfo.code || 'VALIDATION_ERROR',
                timestamp: errorInfo.timestamp
            });
        }

        // Unexpected errors: generic message in production
        if (!this.isDevelopment) {
            return res.status(500).json({
                success: false,
                error: 'Error interno del servidor',
                timestamp: errorInfo.timestamp
            });
        }

        // Development: detailed error
        res.status(status || 500).json({
            success: false,
            error: message,
            type: errorInfo.type,
            stack: errorInfo.stack,
            details: errorInfo.details,
            timestamp: errorInfo.timestamp
        });
    }
}

// Custom error classes
class OperationalError extends Error {
    constructor(message, statusCode = 500, details = null) {
        super(message);
        this.name = this.constructor.name;
        this.statusCode = statusCode;
        this.isOperational = true;
        this.details = details;
        Error.captureStackTrace(this, this.constructor);
    }
}

class ValidationError extends OperationalError {
    constructor(message, details = null) {
        super(message, 400, details);
    }
}

class AuthenticationError extends OperationalError {
    constructor(message = 'No autenticado') {
        super(message, 401);
    }
}

class AuthorizationError extends OperationalError {
    constructor(message = 'No autorizado') {
        super(message, 403);
    }
}

class NotFoundError extends OperationalError {
    constructor(message = 'Recurso no encontrado') {
        super(message, 404);
    }
}

class BadGatewayError extends OperationalError {
    constructor(message = 'Servicio disponible temporalmente', details = null) {
        super(message, 502, details);
    }
}

// Express async wrapper to catch promise rejections
const asyncHandler = (fn) => (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
};

// Export
module.exports = {
    BackendErrorHandler,
    OperationalError,
    ValidationError,
    AuthenticationError,
    AuthorizationError,
    NotFoundError,
    BadGatewayError,
    asyncHandler
};
