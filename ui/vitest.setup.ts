import '@testing-library/jest-dom';
import './src/i18n';
import { webcrypto } from 'node:crypto';

// Polyfill do Web Crypto API (SubtleCrypto / SHA-256) para o ambiente jsdom
if (typeof window !== 'undefined' && !window.crypto?.subtle) {
    Object.defineProperty(window, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
    });
}

if (!globalThis.crypto?.subtle) {
    Object.defineProperty(globalThis, 'crypto', {
        value: webcrypto,
        writable: true,
        configurable: true,
    });
}

// Garante que process.env exista em todos os contextos de teste
if (typeof process === 'undefined') {
    (globalThis as unknown as { process: { env: Record<string, string> } }).process = {
        env: { NODE_ENV: 'test' },
    };
}