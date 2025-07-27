
const crypto = require('crypto');

class EncryptionManager {
  constructor() {
    this.algorithm = 'aes-256-gcm';
    this.keyLength = 32; // 256 bits
    this.ivLength = 16;  // 128 bits
    this.tagLength = 16; // 128 bits
    
    // In production, these should be loaded from secure environment variables
    this.masterKey = process.env.MASTER_KEY || crypto.randomBytes(this.keyLength);
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
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(roomId, 'utf8'));

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
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from(roomId, 'utf8'));
      decipher.setAuthTag(Buffer.from(encryptedData.authTag, 'hex'));

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
      const cipher = crypto.createCipher(this.algorithm, key);
      cipher.setAAD(Buffer.from(roomId, 'utf8'));

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
      const decipher = crypto.createDecipher(this.algorithm, key);
      decipher.setAAD(Buffer.from(roomId, 'utf8'));
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
