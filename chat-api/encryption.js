
const crypto = require('crypto');

class EncryptionManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    
    // Use a fixed master key for development, or load from environment
    this.masterKey = process.env.MASTER_KEY ? 
      Buffer.from(process.env.MASTER_KEY, 'hex') : 
      Buffer.from('a'.repeat(64), 'hex'); // Fixed 32-byte key for development
    
    this.roomKeys = new Map(); // Cache for room-specific keys
  }

  // Generate or get a room-specific encryption key
  getRoomKey(roomId) {
    if (!this.roomKeys.has(roomId)) {
      // Derive room key from master key and room ID
      const roomKey = crypto.pbkdf2Sync(roomId, this.masterKey, 100000, this.keyLength, 'sha512');
      this.roomKeys.set(roomId, roomKey);
    }
    return this.roomKeys.get(roomId);
  }

  // Encrypt data for a specific room
  encryptForRoom(data, roomId) {
    try {
      const key = this.getRoomKey(roomId);
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipherGCM(this.algorithm, key, iv);
      
      const dataString = typeof data === 'string' ? data : JSON.stringify(data);
      let encrypted = cipher.update(dataString, 'utf8', 'hex');
      encrypted += cipher.final('hex');
      
      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted,
        iv: iv.toString('hex'),
        authTag: authTag.toString('hex')
      };
    } catch (error) {
      console.error('Encryption error:', error);
      throw new Error('Failed to encrypt data');
    }
  }

  // Decrypt data for a specific room
  decryptForRoom(encryptedData, roomId) {
    try {
      const key = this.getRoomKey(roomId);
      const iv = Buffer.from(encryptedData.iv, 'hex');
      const authTag = Buffer.from(encryptedData.authTag, 'hex');
      
      const decipher = crypto.createDecipherGCM(this.algorithm, key, iv);
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedData.encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');

      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(decrypted);
      } catch (parseError) {
        return decrypted;
      }
    } catch (error) {
      console.error('Decryption error:', error);
      throw new Error('Failed to decrypt data');
    }
  }

  // Encrypt file data
  encryptFile(fileBuffer, roomId) {
    try {
      const key = this.getRoomKey(roomId);
      const iv = crypto.randomBytes(this.ivLength);
      const cipher = crypto.createCipherGCM(this.algorithm, key, iv);

      const encrypted = Buffer.concat([cipher.update(fileBuffer), cipher.final()]);
      const authTag = cipher.getAuthTag();

      return {
        encrypted: encrypted,
        iv: iv,
        authTag: authTag
      };
    } catch (error) {
      console.error('File encryption error:', error);
      throw new Error('Failed to encrypt file');
    }
  }

  // Decrypt file data
  decryptFile(encryptedFileData, roomId) {
    try {
      const key = this.getRoomKey(roomId);
      const decipher = crypto.createDecipherGCM(this.algorithm, key, encryptedFileData.iv);
      decipher.setAuthTag(encryptedFileData.authTag);

      const decrypted = Buffer.concat([
        decipher.update(encryptedFileData.encrypted),
        decipher.final()
      ]);

      return decrypted;
    } catch (error) {
      console.error('File decryption error:', error);
      throw new Error('Failed to decrypt file');
    }
  }
}

module.exports = EncryptionManager;
