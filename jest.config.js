/**
 * ============================================================
 * Jest Configuration - Testing Framework
 * ============================================================
 * 
 * Configuración profesional para tests unitarios
 * Cubre: Storage, Carrrito, Flujo de Compra, Órdenes
 */

module.exports = {
    displayName: 'RifaPlus Tests',
    testEnvironment: 'jsdom', // Simula navegador para tests de frontend
    
    // Coverage thresholds - Requerimientos de cobertura
    collectCoverageFrom: [
        'js/**/*.js',
        'backend/**/*.js',
        '!js/vendor/**',
        '!js/**/*.worker.js',
        '!**/node_modules/**'
    ],
    
    coverageThreshold: {
        global: {
            branches: 50,
            functions: 50,
            lines: 50,
            statements: 50
        },
        './js/storage-manager.js': {
            branches: 100,
            functions: 100,
            lines: 100,
            statements: 100
        },
        './js/carrito-global.js': {
            branches: 70,
            functions: 70,
            lines: 70,
            statements: 70
        }
    },
    
    // Setup files
    setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
    
    // Transform files
    transform: {
        '^.+\\.js$': 'babel-jest'
    },
    
    // Module paths
    moduleNameMapper: {
        '^@/(.*)$': '<rootDir>/$1'
    },
    
    // Test patterns
    testMatch: [
        '**/__tests__/**/*.test.js',
        '**/?(*.)+(spec|test).js'
    ],
    
    // Ignore patterns
    testPathIgnorePatterns: [
        '/node_modules/',
        '/build/',
        '/.git/'
    ],
    
    // Verbose output
    verbose: true,
    
    // Jest timeout por defecto
    testTimeout: 10000,
    
    // Bail on first error
    bail: false,
    
    // Max workers para parallelization
    maxWorkers: '50%'
};
