/**
 * Jest Setup File
 * Configuración global para todos los tests
 */

// Polyfills para jsdom
Object.defineProperty(window, 'matchMedia', {
    writable: true,
    value: jest.fn().mockImplementation(query => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jest.fn(),
        removeListener: jest.fn(),
        addEventListener: jest.fn(),
        removeEventListener: jest.fn(),
        dispatchEvent: jest.fn(),
    })),
});

// Mock localStorage para tests
const localStorageMock = {
    getItem: jest.fn(),
    setItem: jest.fn(),
    removeItem: jest.fn(),
    clear: jest.fn(),
};
global.localStorage = localStorageMock;

// Mock sessionStorage
global.sessionStorage = localStorageMock;

// Mock fetch (para tests de API)
global.fetch = jest.fn();

// Suppress console errors en tests a menos que sea necesario
global.console = {
    ...console,
    error: jest.fn(),
    warn: jest.fn(),
};

// Timeout global para tests
jest.setTimeout(10000);

// Reset mocks después de cada test
afterEach(() => {
    jest.clearAllMocks();
});
