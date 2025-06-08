import CryptoJS from 'crypto-js';

// Generate a random encryption key for each session
export function generateEncryptionKey(): string {
  return CryptoJS.lib.WordArray.random(256/8).toString();
}

// Encrypt text content before sending to server
export function encryptContent(content: string, key: string): string {
  return CryptoJS.AES.encrypt(content, key).toString();
}

// Decrypt content after receiving from server
export function decryptContent(encryptedContent: string, key: string): string {
  const bytes = CryptoJS.AES.decrypt(encryptedContent, key);
  return bytes.toString(CryptoJS.enc.Utf8);
}

// Hash the filename for privacy while keeping it identifiable to user
export function hashFilename(filename: string, key: string): string {
  const hash = CryptoJS.SHA256(filename + key).toString().substring(0, 8);
  const extension = filename.split('.').pop();
  return `doc_${hash}.${extension}`;
}

// Store encryption keys securely in session storage (cleared on browser close)
export function storeEncryptionKey(documentId: number, key: string): void {
  sessionStorage.setItem(`enc_key_${documentId}`, key);
}

export function getEncryptionKey(documentId: number): string | null {
  return sessionStorage.getItem(`enc_key_${documentId}`);
}

export function removeEncryptionKey(documentId: number): void {
  sessionStorage.removeItem(`enc_key_${documentId}`);
}