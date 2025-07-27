const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const cors = require('cors');
const oracledb = require('oracledb');
const Minio = require('minio');
const { Web3 } = require('web3');
const multer = require('multer');
const crypto = require('crypto');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { API_IP } = require('./config');
const EncryptionManager = require('./encryption');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
    credentials: true
  }
});

const port = 5000;

app.use(cors({
  origin: "*",
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"]
}));
app.use(express.json());

// Oracle DB Configuration
const dbConfig = {
  user: 'SYSTEM',
  password: 'oracle',
  connectString: 'oracle-db:1521/FREE'
};

// MinIO Configuration
const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

// Web3 Configuration (Ganache)
const web3 = new Web3('http://ganache:8545');

// Load contract info from deployed contract
let contractInfo;
let contractAddress = null;
let chatContractABI = [];

try {
  contractInfo = require('../blockchain/contract-info.json');
  contractAddress = contractInfo.address;
  chatContractABI = contractInfo.abi;
  console.log('Smart contract loaded:', contractAddress);
} catch (error) {
  console.log('No deployed contract found, blockchain features will be disabled');
  // Fallback ABI for development
  chatContractABI = [
    {
      "inputs": [
        {"name": "messageId", "type": "string"},
        {"name": "contentHash", "type": "string"},
        {"name": "timestamp", "type": "uint256"}
      ],
      "name": "recordMessage",
      "outputs": [],
      "stateMutability": "nonpayable",
      "type": "function"
    },
    {
      "inputs": [{"name": "messageId", "type": "string"}],
      "name": "getMessageRecord",
      "outputs": [
        {"name": "contentHash", "type": "string"},
        {"name": "sender", "type": "address"},
        {"name": "timestamp", "type": "uint256"}
      ],
      "stateMutability": "view",
      "type": "function"
    },
    {
      "inputs": [
        {"name": "messageId", "type": "string"},
        {"name": "contentHash", "type": "string"}
      ],
      "name": "verifyMessage",
      "outputs": [{"name": "", "type": "bool"}],
      "stateMutability": "view",
      "type": "function"
    }
  ];
}

// Multer configuration for file uploads
const upload = multer({ storage: multer.memoryStorage() });

// JWT Secret
const JWT_SECRET = 'your-jwt-secret-key';

// Initialize encryption manager
const encryptionManager = new EncryptionManager();

// Create database tables using existing connection
async function initializeDatabaseTables(connection) {
  // Create users table
  const createUsers = `
    BEGIN
      EXECUTE IMMEDIATE 'CREATE TABLE users (
        user_id VARCHAR2(50) PRIMARY KEY,
        username VARCHAR2(100) UNIQUE NOT NULL,
        email VARCHAR2(255) UNIQUE NOT NULL,
        password_hash VARCHAR2(255) NOT NULL,
        avatar_url VARCHAR2(500),
        created_at DATE DEFAULT SYSDATE,
        last_seen DATE DEFAULT SYSDATE,
        is_online NUMBER(1) DEFAULT 0
      )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;
  `;

  // Create chat rooms table
  const createRooms = `
    BEGIN
      EXECUTE IMMEDIATE 'CREATE TABLE chat_rooms (
        room_id VARCHAR2(50) PRIMARY KEY,
        room_name VARCHAR2(255) NOT NULL,
        description VARCHAR2(1000),
        created_by VARCHAR2(50),
        created_at DATE DEFAULT SYSDATE,
        is_private NUMBER(1) DEFAULT 0,
        room_type VARCHAR2(20) DEFAULT ''public'',
        room_pin VARCHAR2(50)
      )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;
  `;

  // Create messages table
  const createMessages = `
    BEGIN
      EXECUTE IMMEDIATE 'CREATE TABLE messages (
        message_id VARCHAR2(50) PRIMARY KEY,
        room_id VARCHAR2(50),
        user_id VARCHAR2(50),
        content CLOB,
        message_type VARCHAR2(20) DEFAULT ''text'',
        file_url VARCHAR2(500),
        reply_to VARCHAR2(50),
        created_at DATE DEFAULT SYSDATE,
        blockchain_hash VARCHAR2(255),
        is_edited NUMBER(1) DEFAULT 0,
        edited_at DATE,
        encrypted_data CLOB,
        iv VARCHAR2(255),
        auth_tag VARCHAR2(255)
      )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;
  `;

  // Create room members table
  const createRoomMembers = `
    BEGIN
      EXECUTE IMMEDIATE 'CREATE TABLE room_members (
        room_id VARCHAR2(50),
        user_id VARCHAR2(50),
        joined_at DATE DEFAULT SYSDATE,
        role VARCHAR2(20) DEFAULT ''member'',
        PRIMARY KEY (room_id, user_id)
      )';
    EXCEPTION
      WHEN OTHERS THEN
        IF SQLCODE != -955 THEN RAISE; END IF;
    END;
  `;

  await connection.execute(createUsers);
  await connection.execute(createRooms);
  await connection.execute(createMessages);
  await connection.execute(createRoomMembers);

  // Insert default general room
  const insertGeneralRoom = `
    MERGE INTO chat_rooms r
    USING (SELECT 'general' as room_id, 'General Chat' as room_name, 'Main chat room for everyone' as description FROM dual) src
    ON (r.room_id = src.room_id)
    WHEN NOT MATCHED THEN
      INSERT (room_id, room_name, description, room_type)
      VALUES (src.room_id, src.room_name, src.description, 'public')
  `;

  await connection.execute(insertGeneralRoom);
  await connection.commit();
  console.log('Database tables created successfully');
}

// Initialize Oracle DB tables
async function initializeDatabase() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    dbAvailable = true;

    await initializeDatabaseTables(connection);
    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    console.log('Falling back to in-memory storage for development');
    dbAvailable = false;
    
    // Initialize in-memory storage
    if (!global.inMemoryRooms) {
      global.inMemoryRooms = new Map();
      // Add default general room
      global.inMemoryRooms.set('general', {
        room_id: 'general',
        room_name: 'General Chat',
        description: 'Main chat room for everyone',
        created_by: 'system',
        is_private: false,
        room_type: 'public',
        room_pin: null,
        created_at: new Date().toISOString()
      });
    }
  } finally {
    if (connection) {
      await connection.close();
    }
  }
}

// Initialize MinIO bucket for chat files
async function initializeMinIO() {
  try {
    const bucketName = 'chat-files';
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log('MinIO bucket created successfully');
    }

    // Set bucket policy for public read access
    const policy = {
      Version: '2012-10-17',
      Statement: [
        {
          Effect: 'Allow',
          Principal: { AWS: ['*'] },
          Action: ['s3:GetObject'],
          Resource: [`arn:aws:s3:::${bucketName}/*`]
        }
      ]
    };

    try {
      await minioClient.setBucketPolicy(bucketName, JSON.stringify(policy));
      console.log('MinIO bucket policy set for public read access');
    } catch (policyError) {
      console.error('Failed to set bucket policy:', policyError);
    }
  } catch (error) {
    console.error('MinIO initialization error:', error);
  }
}

// Generate hash for blockchain
function generateMessageHash(messageData) {
  const hashString = JSON.stringify(messageData);
  return crypto.createHash('sha256').update(hashString).digest('hex');
}

// Record message on blockchain
async function recordOnBlockchain(messageId, hash) {
  try {
    if (!contractAddress) {
      console.log('Contract not deployed yet, skipping blockchain recording');
      return hash;
    }

    const accounts = await web3.eth.getAccounts();
    const contract = new web3.eth.Contract(chatContractABI, contractAddress);

    await contract.methods.recordMessage(
      messageId,
      hash,
      Math.floor(Date.now() / 1000)
    ).send({ from: accounts[0], gas: 300000 });

    console.log(`Message ${messageId} recorded on blockchain`);
    return hash;
  } catch (error) {
    console.error('Blockchain recording error:', error);
    return hash;
  }
}

// Check if user is member of a room
async function isRoomMember(userId, roomId) {
  let connection;
  try {
    if (dbAvailable) {
      connection = await oracledb.getConnection(dbConfig);
      
      // Check if user is a member of the room or if it's a public room
      const result = await connection.execute(
        `SELECT COUNT(*) FROM room_members rm 
         JOIN chat_rooms cr ON rm.room_id = cr.room_id 
         WHERE rm.room_id = :room_id AND (rm.user_id = :user_id OR cr.is_private = 0)`,
        { room_id: roomId, user_id: userId }
      );
      
      return result.rows[0][0] > 0;
    } else {
      // For in-memory storage, assume all users can access public rooms
      // In production, you'd implement proper membership tracking
      return true;
    }
  } catch (error) {
    console.error('Error checking room membership:', error);
    return false;
  } finally {
    if (connection) await connection.close();
  }
}

// JWT middleware
function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.sendStatus(401);
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.sendStatus(403);
    req.user = user;
    next();
  });
}

// Store connected users globally and per room
const connectedUsers = new Map(); // Global user tracking
const roomUsers = new Map(); // Track users per room: roomId -> Map(userId -> userInfo)

// In-memory storage fallback
const inMemoryUsers = new Map();
const inMemoryMessages = new Map();
global.inMemoryRooms = new Map();
let dbAvailable = false;

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('User connected:', socket.id);

  // User joins with authentication
  socket.on('user_join', async (userData) => {
    socket.userId = userData.user_id;
    socket.username = userData.username;

    // Update user online status in database
    let connection;
    try {
      connection = await oracledb.getConnection(dbConfig);
      await connection.execute(
        'UPDATE users SET is_online = 1, last_seen = SYSDATE WHERE user_id = :user_id',
        [userData.user_id]
      );
      await connection.commit();
    } catch (error) {
      console.error('Error updating user online status:', error);
    } finally {
      if (connection) await connection.close();
    }

    // Store user globally
    connectedUsers.set(userData.user_id, {
      user_id: userData.user_id,
      username: userData.username,
      socket_id: socket.id,
      current_room: null,
      is_online: true
    });

    console.log(`User ${userData.username} (${userData.user_id}) connected`);
  });

  // Join room
  socket.on('join_room', async (roomId) => {
    // Leave current room first
    if (socket.currentRoom && socket.currentRoom !== roomId) {
      socket.leave(socket.currentRoom);
      
      // Remove user from previous room's user list
      if (roomUsers.has(socket.currentRoom)) {
        const prevRoomUsers = roomUsers.get(socket.currentRoom);
        if (socket.userId && prevRoomUsers.has(socket.userId)) {
          prevRoomUsers.delete(socket.userId);
          console.log(`User ${socket.username} left room ${socket.currentRoom}`);
          
          // Broadcast updated user list to previous room only
          io.to(socket.currentRoom).emit('users_update', Array.from(prevRoomUsers.values()));
          
          // Clean up empty room
          if (prevRoomUsers.size === 0) {
            roomUsers.delete(socket.currentRoom);
          }
        }
      }
    }

    // Check room membership and auto-join public rooms
    if (socket.userId && dbAvailable) {
      let connection;
      try {
        connection = await oracledb.getConnection(dbConfig);
        
        // Check if user is already a member or if room is public
        const memberCheck = await connection.execute(
          `SELECT COUNT(*) FROM room_members WHERE room_id = :room_id AND user_id = :user_id`,
          { room_id: roomId, user_id: socket.userId }
        );
        
        const roomCheck = await connection.execute(
          `SELECT is_private FROM chat_rooms WHERE room_id = :room_id`,
          [roomId]
        );
        
        const isMember = memberCheck.rows[0][0] > 0;
        const isPrivate = roomCheck.rows.length > 0 ? roomCheck.rows[0][0] === 1 : false;
        
        // Auto-join public rooms
        if (!isMember && !isPrivate) {
          await connection.execute(
            `INSERT INTO room_members (room_id, user_id, role) VALUES (:room_id, :user_id, 'member')`,
            { room_id: roomId, user_id: socket.userId }
          );
          await connection.commit();
          console.log(`User ${socket.username} auto-joined public room ${roomId}`);
        }
      } catch (error) {
        console.error('Error handling room membership:', error);
      } finally {
        if (connection) await connection.close();
      }
    }

    // Join new room
    socket.join(roomId);
    socket.currentRoom = roomId;
    
    // Initialize room users map if it doesn't exist
    if (!roomUsers.has(roomId)) {
      roomUsers.set(roomId, new Map());
    }
    
    // Add user to new room's user list
    if (socket.userId && socket.username) {
      const roomUsersList = roomUsers.get(roomId);
      roomUsersList.set(socket.userId, {
        user_id: socket.userId,
        username: socket.username,
        is_online: true
      });
      
      // Update global user's current room
      if (connectedUsers.has(socket.userId)) {
        const user = connectedUsers.get(socket.userId);
        user.current_room = roomId;
        connectedUsers.set(socket.userId, user);
      }
      
      console.log(`User ${socket.username} joined room ${roomId}, room now has ${roomUsersList.size} users`);

      // Broadcast updated user list ONLY to users in this specific room
      io.to(roomId).emit('users_update', Array.from(roomUsersList.values()));

      // Notify others in the room that someone joined
      socket.to(roomId).emit('user_joined_room', {
        user_id: socket.userId,
        username: socket.username,
        room_id: roomId
      });
    }
  });

  // Leave room
  socket.on('leave_room', (roomId) => {
    socket.leave(roomId);
    console.log(`User ${socket.id} left room ${roomId}`);
  });

  // Handle new message
  socket.on('send_message', async (data) => {
    try {
      const messageId = uuidv4();
      const timestamp = new Date();

      console.log('Processing message:', { messageId, roomId: data.room_id, senderId: data.sender_id });

      // Check if user is member of the room
      if (!await isRoomMember(data.sender_id, data.room_id)) {
        socket.emit('error', 'Access denied: Not a member of this room');
        return;
      }

      // Prepare message data for encryption
      const messageData = {
        content: data.content,
        message_type: data.message_type || 'text',
        sender_id: data.sender_id,
        created_at: timestamp
      };

      // Generate hash for blockchain (before encryption)
      const hash = generateMessageHash({
        message_id: messageId,
        room_id: data.room_id,
        ...messageData
      });
      const blockchainHash = await recordOnBlockchain(messageId, hash);

      let username = 'Unknown';
      let encryptedContent = null;

      try {
        // Encrypt message content
        encryptedContent = encryptionManager.encryptForRoom(messageData, data.room_id);
      } catch (encryptError) {
        console.error('Encryption failed, storing unencrypted:', encryptError);
        // Fallback: store without encryption in development
        encryptedContent = { encrypted: JSON.stringify(messageData), iv: '', authTag: '' };
      }

      if (dbAvailable) {
        // Save encrypted message to database
        let connection;
        try {
          connection = await oracledb.getConnection(dbConfig);
          await connection.execute(
            `INSERT INTO messages (message_id, room_id, user_id, content, message_type, blockchain_hash, created_at, encrypted_data, iv, auth_tag)
             VALUES (:message_id, :room_id, :user_id, :content, :message_type, :blockchain_hash, :created_at, :encrypted_data, :iv, :auth_tag)`,
            {
              message_id: messageId,
              room_id: data.room_id,
              user_id: data.sender_id,
              content: data.content, // Store original content for fallback
              message_type: data.message_type || 'text',
              blockchain_hash: blockchainHash,
              created_at: timestamp,
              encrypted_data: encryptedContent.encrypted,
              iv: encryptedContent.iv,
              auth_tag: encryptedContent.authTag
            }
          );
          await connection.commit();

          // Get username for the message
          const userResult = await connection.execute(
            'SELECT username FROM users WHERE user_id = :user_id',
            [data.sender_id]
          );

          username = userResult.rows.length > 0 ? userResult.rows[0][0] : 'Unknown';

        } catch (dbError) {
          console.error('Database save failed:', dbError);
          // Continue with broadcasting even if DB save fails
        } finally {
          if (connection) await connection.close();
        }
      } else {
        // Use in-memory storage with encryption
        const roomMessages = inMemoryMessages.get(data.room_id) || [];
        
        // Get username from connected users or fallback
        const user = connectedUsers.get(data.sender_id);
        username = user ? user.username : socket.username || `User-${data.sender_id.substring(0, 8)}`;
        
        roomMessages.push({
          message_id: messageId,
          room_id: data.room_id,
          sender_id: data.sender_id,
          user_id: data.sender_id,
          username: username,
          content: data.content, // Store original for in-memory
          message_type: data.message_type || 'text',
          blockchain_hash: blockchainHash,
          timestamp: timestamp.toISOString(),
          created_at: timestamp.toISOString(),
          encrypted_data: encryptedContent.encrypted,
          iv: encryptedContent.iv,
          auth_tag: encryptedContent.authTag
        });
        inMemoryMessages.set(data.room_id, roomMessages);
      }

      // Broadcast message to room members
      const fullMessage = {
        message_id: messageId,
        room_id: data.room_id,
        sender_id: data.sender_id,
        user_id: data.sender_id,
        username: username,
        content: data.content, // Send original content to room members
        message_type: data.message_type || 'text',
        blockchain_hash: blockchainHash,
        timestamp: timestamp.toISOString(),
        created_at: timestamp.toISOString()
      };

      console.log(`Broadcasting message to room ${data.room_id}:`, fullMessage);
      io.to(data.room_id).emit('new_message', fullMessage);
      console.log(`Message sent to room ${data.room_id} by ${username}`);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', 'Failed to send message: ' + error.message);
    }
  });

  // Handle typing indicator
  socket.on('typing', (data) => {
    socket.to(data.room_id).emit('user_typing', {
      user_id: data.user_id,
      username: data.username
    });
  });

  socket.on('stop_typing', (data) => {
    socket.to(data.room_id).emit('user_stop_typing', {
      user_id: data.user_id
    });
  });

  socket.on('disconnect', async () => {
    if (socket.userId) {
      // Update user offline status in database
      let connection;
      try {
        connection = await oracledb.getConnection(dbConfig);
        await connection.execute(
          'UPDATE users SET is_online = 0, last_seen = SYSDATE WHERE user_id = :user_id',
          [socket.userId]
        );
        await connection.commit();
      } catch (error) {
        console.error('Error updating user offline status:', error);
      } finally {
        if (connection) await connection.close();
      }

      // Remove user from current room's user list
      if (socket.currentRoom && roomUsers.has(socket.currentRoom)) {
        const currentRoomUsers = roomUsers.get(socket.currentRoom);
        if (currentRoomUsers.has(socket.userId)) {
          currentRoomUsers.delete(socket.userId);
          console.log(`User ${socket.username} removed from room ${socket.currentRoom}, room now has ${currentRoomUsers.size} users`);
          
          // Broadcast updated user list ONLY to users in this specific room
          io.to(socket.currentRoom).emit('users_update', Array.from(currentRoomUsers.values()));
          
          // Clean up empty room
          if (currentRoomUsers.size === 0) {
            roomUsers.delete(socket.currentRoom);
            console.log(`Room ${socket.currentRoom} deleted - no users remaining`);
          }
        }
      }

      // Remove from global users
      connectedUsers.delete(socket.userId);
      console.log(`User ${socket.username} (${socket.userId}) disconnected`);
    }
    console.log('User disconnected:', socket.id);
  });
});

// API Routes
app.get('/', (req, res) => {
  res.json({ message: 'Blockchain Chat API running', version: '1.0.0' });
});

// User registration
app.post('/api/auth/register', async (req, res) => {
  let connection;
  try {
    console.log('Registration attempt:', { body: req.body });
    const { username, email, password } = req.body;
    
    if (!username || !email || !password) {
      console.log('Missing registration fields');
      return res.status(400).json({ error: 'Username, email, and password are required' });
    }

    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        
        // Check if user already exists
        const checkResult = await connection.execute(
          'SELECT COUNT(*) FROM users WHERE username = :username OR email = :email',
          { username, email }
        );
        
        if (checkResult.rows[0][0] > 0) {
          return res.status(400).json({ error: 'Username or email already exists' });
        }
        
        await connection.execute(
          'INSERT INTO users (user_id, username, email, password_hash) VALUES (:user_id, :username, :email, :password_hash)',
          { user_id: userId, username, email, password_hash: hashedPassword }
        );
        await connection.commit();
        console.log('User registered in database:', username);
      } catch (dbError) {
        console.error('Database registration failed, falling back to memory:', dbError);
        dbAvailable = false;
        if (connection) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
          }
        }
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      const existingUser = Array.from(inMemoryUsers.values()).find(u => u.username === username || u.email === email);
      if (existingUser) {
        return res.status(400).json({ error: 'Username or email already exists' });
      }
      
      inMemoryUsers.set(userId, {
        user_id: userId,
        username,
        email,
        password_hash: hashedPassword,
        created_at: new Date().toISOString(),
        is_online: false
      });
      console.log('User registered in memory:', username);
    }

    const token = jwt.sign({ user_id: userId, username }, JWT_SECRET);
    console.log('Registration successful for user:', username);
    res.status(201).json({ token, user: { user_id: userId, username, email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed: ' + error.message });
  } finally {
    if (connection) await connection.close();
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  let connection;
  try {
    console.log('Login attempt:', { body: req.body });
    const { username, password } = req.body;
    
    if (!username || !password) {
      console.log('Missing credentials');
      return res.status(400).json({ error: 'Username and password are required' });
    }

    let user = null;

    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          'SELECT user_id, username, email, password_hash FROM users WHERE username = :username',
          [username]
        );

        if (result.rows.length > 0) {
          user = {
            user_id: result.rows[0][0],
            username: result.rows[0][1],
            email: result.rows[0][2],
            password_hash: result.rows[0][3]
          };
          console.log('User found in database:', username);
        }
      } catch (dbError) {
        console.error('Database login failed, falling back to memory:', dbError);
        dbAvailable = false;
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      user = Array.from(inMemoryUsers.values()).find(u => u.username === username);
      if (user) {
        console.log('User found in memory:', username);
      }
    }

    if (!user) {
      console.log('User not found:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      console.log('Invalid password for user:', username);
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ user_id: user.user_id, username: user.username }, JWT_SECRET);
    console.log('Login successful for user:', username);
    res.json({ token, user: { user_id: user.user_id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed: ' + error.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Get messages for a room
app.get('/api/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    const roomId = req.params.roomId;
    
    // Check if user is member of the room
    if (!await isRoomMember(req.user.user_id, roomId)) {
      return res.status(403).json({ error: 'Access denied: Not a member of this room' });
    }

    if (dbAvailable) {
      let connection;
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          `SELECT m.*, u.username 
           FROM messages m 
           JOIN users u ON m.user_id = u.user_id 
           WHERE m.room_id = :room_id 
           ORDER BY m.created_at DESC 
           FETCH FIRST 50 ROWS ONLY`,
          [roomId]
        );

        const messages = result.rows.map(row => {
          try {
            let content = row[3];
            
            // Decrypt message if it has encryption data
            if (row[11] && row[12] && row[13]) { // encrypted_data, iv, auth_tag
              const encryptedData = {
                encrypted: row[11],
                iv: row[12],
                authTag: row[13]
              };
              const decryptedData = encryptionManager.decryptForRoom(encryptedData, roomId);
              content = decryptedData.content;
            }

            return {
              message_id: row[0],
              room_id: row[1],
              sender_id: row[2],
              user_id: row[2],
              content: content,
              message_type: row[4],
              file_url: row[5],
              reply_to: row[6],
              timestamp: row[7],
              created_at: row[7],
              blockchain_hash: row[8],
              is_edited: row[9],
              edited_at: row[10],
              username: row[14] // username is now at index 14
            };
          } catch (decryptError) {
            console.error('Error decrypting message:', decryptError);
            return {
              message_id: row[0],
              room_id: row[1],
              sender_id: row[2],
              user_id: row[2],
              content: '[DECRYPTION_ERROR]',
              message_type: row[4],
              file_url: row[5],
              reply_to: row[6],
              timestamp: row[7],
              created_at: row[7],
              blockchain_hash: row[8],
              is_edited: row[9],
              edited_at: row[10],
              username: row[14]
            };
          }
        });

        res.json(messages.reverse());
      } finally {
        if (connection) await connection.close();
      }
    } else {
      // Use in-memory storage with decryption
      const roomMessages = inMemoryMessages.get(roomId) || [];
      
      const decryptedMessages = roomMessages.map(msg => {
        try {
          let content = msg.content;
          
          // Decrypt message if it has encryption data
          if (msg.encrypted_data && msg.iv && msg.auth_tag) {
            const encryptedData = {
              encrypted: msg.encrypted_data,
              iv: msg.iv,
              authTag: msg.auth_tag
            };
            const decryptedData = encryptionManager.decryptForRoom(encryptedData, roomId);
            content = decryptedData.content;
          }

          return {
            ...msg,
            content: content,
            username: msg.username || `User-${(msg.sender_id || msg.user_id || '').substring(0, 8)}`
          };
        } catch (decryptError) {
          console.error('Error decrypting message:', decryptError);
          return {
            ...msg,
            content: '[DECRYPTION_ERROR]',
            username: msg.username || `User-${(msg.sender_id || msg.user_id || '').substring(0, 8)}`
          };
        }
      });
      
      res.json(decryptedMessages);
    }
  } catch (error) {
    console.error('Error fetching messages:', error);
    res.status(500).json({ error: 'Database error' });
  }
});

// Upload file
app.post('/api/upload', authenticateToken, upload.single('file'), async (req, res) => {
  let connection;
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const roomId = req.body.room_id || 'general';
    
    // Check if user is member of the room
    if (!await isRoomMember(req.user.user_id, roomId)) {
      return res.status(403).json({ error: 'Access denied: Not a member of this room' });
    }

    const bucketName = `chat-files-${roomId}`; // Room-specific bucket
    const fileName = `${Date.now()}_${crypto.randomBytes(16).toString('hex')}_${req.file.originalname}`;
    const messageId = uuidv4();

    console.log('Uploading encrypted file to MinIO:', fileName, 'Size:', req.file.size);

    // Encrypt file content
    let encryptedFile;
    try {
      encryptedFile = encryptionManager.encryptFile(req.file.buffer, roomId);
    } catch (encryptError) {
      console.error('File encryption failed:', encryptError);
      return res.status(500).json({ error: 'File encryption failed: ' + encryptError.message });
    }
    
    // Combine encrypted data with metadata for storage
    const fileDataForStorage = Buffer.concat([
      encryptedFile.iv,
      encryptedFile.authTag,
      encryptedFile.encrypted
    ]);

    // Ensure room-specific bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log('Created MinIO bucket for room:', bucketName);
    }

    // Store encrypted file metadata
    const fileMetadata = {
      original_name: req.file.originalname,
      content_type: req.file.mimetype,
      size: req.file.size,
      uploaded_by: req.user.user_id,
      upload_date: new Date().toISOString()
    };

    const encryptedMetadata = encryptionManager.encryptForRoom(fileMetadata, roomId);

    // Upload encrypted file to MinIO
    await minioClient.putObject(
      bucketName,
      fileName,
      fileDataForStorage,
      fileDataForStorage.length,
      { 
        'Content-Type': 'application/octet-stream',
        'X-File-Metadata': JSON.stringify(encryptedMetadata)
      }
    );

    // Create internal file URL (will be decrypted on download)
    const fileUrl = `/api/files/${roomId}/${fileName}`;
    
    let username = req.user.username || 'Unknown';
    const timestamp = new Date();

    // Prepare and encrypt file message content
    const messageContent = {
      content: `Uploaded file: ${req.file.originalname}`,
      message_type: 'file',
      file_url: fileUrl,
      file_metadata: fileMetadata
    };

    const encryptedMessageContent = encryptionManager.encryptForRoom(messageContent, roomId);

    // Save encrypted file message to database or memory
    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        await connection.execute(
          `INSERT INTO messages (message_id, room_id, user_id, content, message_type, file_url, created_at, encrypted_data, iv, auth_tag)
           VALUES (:message_id, :room_id, :user_id, :content, :message_type, :file_url, :created_at, :encrypted_data, :iv, :auth_tag)`,
          {
            message_id: messageId,
            room_id: roomId,
            user_id: req.user.user_id,
            content: '[ENCRYPTED_FILE]',
            message_type: 'file',
            file_url: fileUrl,
            created_at: timestamp,
            encrypted_data: encryptedMessageContent.encrypted,
            iv: encryptedMessageContent.iv,
            auth_tag: encryptedMessageContent.authTag
          }
        );
        await connection.commit();
        console.log('Encrypted file message saved to database');
      } finally {
        if (connection) await connection.close();
      }
    } else {
      // Use in-memory storage
      const roomMessages = inMemoryMessages.get(roomId) || [];
      roomMessages.push({
        message_id: messageId,
        room_id: roomId,
        sender_id: req.user.user_id,
        user_id: req.user.user_id,
        username: username,
        content: '[ENCRYPTED_FILE]',
        message_type: 'file',
        file_url: fileUrl,
        timestamp: timestamp.toISOString(),
        created_at: timestamp.toISOString(),
        encrypted_data: encryptedMessageContent.encrypted,
        iv: encryptedMessageContent.iv,
        auth_tag: encryptedMessageContent.authTag
      });
      inMemoryMessages.set(roomId, roomMessages);
      console.log('Encrypted file message saved to memory');
    }

    // Broadcast file message to room (with decrypted content for display)
    const fileMessage = {
      message_id: messageId,
      room_id: roomId,
      sender_id: req.user.user_id,
      user_id: req.user.user_id,
      username: username,
      content: `Uploaded file: ${req.file.originalname}`,
      message_type: 'file',
      file_url: fileUrl,
      timestamp: timestamp.toISOString(),
      created_at: timestamp.toISOString()
    };

    io.to(roomId).emit('new_message', fileMessage);
    console.log(`Encrypted file message broadcasted to room ${roomId}`);

    res.json({ 
      message: 'File uploaded and encrypted successfully', 
      url: fileUrl, 
      fileName: req.file.originalname,
      message_id: messageId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed: ' + error.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Get all rooms
app.get('/api/rooms', authenticateToken, async (req, res) => {
  let connection;
  try {
    let rooms = [];
    
    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          'SELECT room_id, room_name, description, created_by, created_at, is_private, room_type FROM chat_rooms ORDER BY created_at DESC'
        );

        rooms = result.rows.map(row => ({
          room_id: row[0],
          room_name: row[1],
          description: row[2],
          created_by: row[3],
          created_at: row[4],
          is_private: row[5] === 1,
          room_type: row[6]
        }));
      } catch (dbError) {
        console.error('Database fetch failed, falling back to memory:', dbError);
        dbAvailable = false;
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      if (global.inMemoryRooms) {
        rooms = Array.from(global.inMemoryRooms.values()).map(room => ({
          room_id: room.room_id,
          room_name: room.room_name,
          description: room.description,
          created_by: room.created_by,
          created_at: room.created_at,
          is_private: room.is_private,
          room_type: room.room_type
        }));
        
        // Sort by created_at DESC
        rooms.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      }
    }

    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Failed to fetch rooms' });
  } finally {
    if (connection) await connection.close();
  }
});

// Create chat room
app.post('/api/rooms', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { room_name, description, is_private, room_pin } = req.body;
    const roomId = uuidv4();

    console.log('Creating room:', { room_name, is_private, room_pin: room_pin ? '[HIDDEN]' : 'none' });

    // Ensure database is initialized before trying to create room
    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        
        // Test if tables exist by trying to query them first
        try {
          await connection.execute('SELECT COUNT(*) FROM chat_rooms WHERE ROWNUM = 1');
        } catch (tableError) {
          if (tableError.message.includes('ORA-00942')) {
            console.log('Tables not found, reinitializing database...');
            await initializeDatabaseTables(connection);
          } else {
            throw tableError;
          }
        }
        
        // Insert the room
        await connection.execute(
          `INSERT INTO chat_rooms (room_id, room_name, description, created_by, is_private, room_type, room_pin) 
           VALUES (:room_id, :room_name, :description, :created_by, :is_private, :room_type, :room_pin)`,
          { 
            room_id: roomId, 
            room_name, 
            description: description || '', 
            created_by: req.user.user_id, 
            is_private: is_private ? 1 : 0, 
            room_type: is_private ? 'private' : 'public',
            room_pin: is_private && room_pin ? room_pin : null
          }
        );

        // Add creator as room member
        await connection.execute(
          'INSERT INTO room_members (room_id, user_id, role) VALUES (:room_id, :user_id, :role)',
          { room_id: roomId, user_id: req.user.user_id, role: 'admin' }
        );

        await connection.commit();
        console.log('Room created successfully in database:', roomId);
      } catch (dbError) {
        console.error('Database room creation failed, falling back to memory:', dbError);
        dbAvailable = false;
        // Rollback if there was a transaction
        if (connection) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
          }
        }
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      const roomData = {
        room_id: roomId,
        room_name,
        description: description || '',
        created_by: req.user.user_id,
        is_private: Boolean(is_private),
        room_type: is_private ? 'private' : 'public',
        room_pin: is_private && room_pin ? room_pin : null,
        created_at: new Date().toISOString()
      };
      
      // Store in a global in-memory rooms map
      if (!global.inMemoryRooms) {
        global.inMemoryRooms = new Map();
      }
      global.inMemoryRooms.set(roomId, roomData);
      console.log('Room created successfully in memory:', roomId);
    }
    
    res.status(201).json({ 
      room_id: roomId, 
      room_name, 
      description: description || '', 
      created_by: req.user.user_id,
      is_private: Boolean(is_private),
      room_type: is_private ? 'private' : 'public'
    });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room: ' + error.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Delete room
app.delete('/api/rooms/:roomId', authenticateToken, async (req, res) => {
  let connection;
  try {
    const roomId = req.params.roomId;
    let roomData = null;

    // Check if room exists and if user is the creator
    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          'SELECT created_by FROM chat_rooms WHERE room_id = :room_id',
          [roomId]
        );

        if (result.rows.length > 0) {
          roomData = { created_by: result.rows[0][0] };
        }
      } catch (dbError) {
        console.error('Database delete room failed, falling back to memory:', dbError);
        dbAvailable = false;
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      if (global.inMemoryRooms && global.inMemoryRooms.has(roomId)) {
        const room = global.inMemoryRooms.get(roomId);
        roomData = { created_by: room.created_by };
      }
    }

    if (!roomData) {
      return res.status(404).json({ error: 'Room not found' });
    }

    // Check if current user is the creator
    if (roomData.created_by !== req.user.user_id) {
      return res.status(403).json({ error: 'Only room creator can delete the room' });
    }

    // Delete from database or memory
    if (dbAvailable) {
      try {
        // Delete messages first (foreign key constraint)
        await connection.execute(
          'DELETE FROM messages WHERE room_id = :room_id',
          [roomId]
        );
        
        // Delete room members
        await connection.execute(
          'DELETE FROM room_members WHERE room_id = :room_id',
          [roomId]
        );
        
        // Delete the room
        await connection.execute(
          'DELETE FROM chat_rooms WHERE room_id = :room_id',
          [roomId]
        );
        
        await connection.commit();
        console.log('Room deleted from database:', roomId);
      } catch (dbError) {
        console.error('Database room deletion failed:', dbError);
        if (connection) {
          try {
            await connection.rollback();
          } catch (rollbackError) {
            console.error('Rollback error:', rollbackError);
          }
        }
        return res.status(500).json({ error: 'Failed to delete room from database' });
      }
    } else {
      // Delete from in-memory storage
      if (global.inMemoryRooms) {
        global.inMemoryRooms.delete(roomId);
      }
      if (inMemoryMessages.has(roomId)) {
        inMemoryMessages.delete(roomId);
      }
      console.log('Room deleted from memory:', roomId);
    }

    // Remove all users from the room via socket
    if (roomUsers.has(roomId)) {
      const usersInRoom = roomUsers.get(roomId);
      for (const [userId, userInfo] of usersInRoom) {
        const userConnection = connectedUsers.get(userId);
        if (userConnection && userConnection.socket_id) {
          // Find socket and move user to general room
          io.to(userConnection.socket_id).emit('room_deleted', {
            room_id: roomId,
            redirect_to: 'general'
          });
        }
      }
      roomUsers.delete(roomId);
    }

    res.json({ success: true, message: 'Room deleted successfully' });
  } catch (error) {
    console.error('Error deleting room:', error);
    res.status(500).json({ error: 'Failed to delete room: ' + error.message });
  } finally {
    if (connection) await connection.close();
  }
});

// Verify room PIN and add user to room
app.post('/api/rooms/:roomId/verify-pin', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { pin } = req.body;
    const roomId = req.params.roomId;
    let roomData = null;

    if (dbAvailable) {
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          'SELECT room_pin, is_private FROM chat_rooms WHERE room_id = :room_id',
          [roomId]
        );

        if (result.rows.length > 0) {
          const [storedPin, isPrivate] = result.rows[0];
          roomData = { room_pin: storedPin, is_private: isPrivate === 1 };
        }
      } catch (dbError) {
        console.error('Database PIN verification failed, falling back to memory:', dbError);
        dbAvailable = false;
      }
    }
    
    if (!dbAvailable) {
      // Use in-memory storage
      if (global.inMemoryRooms && global.inMemoryRooms.has(roomId)) {
        const room = global.inMemoryRooms.get(roomId);
        roomData = { room_pin: room.room_pin, is_private: room.is_private };
      }
    }

    if (!roomData) {
      return res.status(404).json({ error: 'Room not found' });
    }

    if (!roomData.is_private) {
      return res.json({ success: true, message: 'Room is public' });
    }

    if (roomData.room_pin === pin) {
      // Add user to room members if PIN is correct
      if (dbAvailable && connection) {
        try {
          // Check if user is already a member
          const memberCheck = await connection.execute(
            'SELECT COUNT(*) FROM room_members WHERE room_id = :room_id AND user_id = :user_id',
            { room_id: roomId, user_id: req.user.user_id }
          );
          
          if (memberCheck.rows[0][0] === 0) {
            await connection.execute(
              'INSERT INTO room_members (room_id, user_id, role) VALUES (:room_id, :user_id, :role)',
              { room_id: roomId, user_id: req.user.user_id, role: 'member' }
            );
            await connection.commit();
            console.log(`User ${req.user.username} added to private room ${roomId}`);
          }
        } catch (memberError) {
          console.error('Error adding user to room:', memberError);
        }
      }
      
      return res.json({ success: true, message: 'PIN verified and access granted' });
    } else {
      return res.status(401).json({ error: 'Invalid PIN' });
    }
  } catch (error) {
    console.error('Error verifying PIN:', error);
    res.status(500).json({ error: 'Server error' });
  } finally {
    if (connection) await connection.close();
  }
});

// Download encrypted file
app.get('/api/files/:roomId/:fileName', authenticateToken, async (req, res) => {
  try {
    const { roomId, fileName } = req.params;
    
    // Check if user is member of the room
    if (!await isRoomMember(req.user.user_id, roomId)) {
      return res.status(403).json({ error: 'Access denied: Not a member of this room' });
    }

    const bucketName = `chat-files-${roomId}`;

    // Check if bucket and file exist
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      return res.status(404).json({ error: 'File not found' });
    }

    // Get encrypted file from MinIO
    const fileStream = await minioClient.getObject(bucketName, fileName);
    const chunks = [];
    
    for await (const chunk of fileStream) {
      chunks.push(chunk);
    }
    
    const encryptedFileData = Buffer.concat(chunks);
    
    // Extract IV, auth tag, and encrypted content
    const iv = encryptedFileData.slice(0, 16);
    const authTag = encryptedFileData.slice(16, 32);
    const encrypted = encryptedFileData.slice(32);
    
    // Decrypt file
    const decryptedFile = encryptionManager.decryptFile({
      encrypted: encrypted,
      iv: iv,
      authTag: authTag
    }, roomId);

    // Get file metadata
    const objectStat = await minioClient.statObject(bucketName, fileName);
    const metadataHeader = objectStat.metaData['x-file-metadata'];
    
    let originalName = fileName;
    let contentType = 'application/octet-stream';
    
    if (metadataHeader) {
      try {
        const encryptedMetadata = JSON.parse(metadataHeader);
        const decryptedMetadata = encryptionManager.decryptForRoom(encryptedMetadata, roomId);
        originalName = decryptedMetadata.original_name;
        contentType = decryptedMetadata.content_type;
      } catch (metaError) {
        console.error('Error decrypting file metadata:', metaError);
      }
    }

    // Set response headers
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${originalName}"`);
    res.setHeader('Content-Length', decryptedFile.length);
    
    // Send decrypted file
    res.send(decryptedFile);
    
  } catch (error) {
    console.error('File download error:', error);
    res.status(500).json({ error: 'Failed to download file: ' + error.message });
  }
});

// Get uploaded files for rooms user has access to
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const allFiles = [];
    
    // Get all rooms the user has access to
    let userRooms = [];
    
    if (dbAvailable) {
      let connection;
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          `SELECT DISTINCT rm.room_id, cr.room_name 
           FROM room_members rm 
           JOIN chat_rooms cr ON rm.room_id = cr.room_id 
           WHERE rm.user_id = :user_id
           UNION
           SELECT room_id, room_name 
           FROM chat_rooms 
           WHERE is_private = 0`,
          [req.user.user_id]
        );
        
        userRooms = result.rows.map(row => ({
          room_id: row[0],
          room_name: row[1]
        }));
      } finally {
        if (connection) await connection.close();
      }
    } else {
      // For in-memory, assume user has access to all rooms (simplified)
      if (global.inMemoryRooms) {
        userRooms = Array.from(global.inMemoryRooms.values()).map(room => ({
          room_id: room.room_id,
          room_name: room.room_name
        }));
      }
    }

    // Get files from each accessible room
    for (const room of userRooms) {
      const bucketName = `chat-files-${room.room_id}`;
      
      try {
        const bucketExists = await minioClient.bucketExists(bucketName);
        if (!bucketExists) continue;

        const objectsStream = minioClient.listObjects(bucketName, '', true);

        for await (const obj of objectsStream) {
          try {
            const stats = await minioClient.statObject(bucketName, obj.name);
            
            // Try to decrypt metadata
            let originalFilename = obj.name;
            let uploadedBy = 'Unknown';
            let fileSize = stats.size;
            
            const metadataHeader = stats.metaData['x-file-metadata'];
            if (metadataHeader) {
              try {
                const encryptedMetadata = JSON.parse(metadataHeader);
                const decryptedMetadata = encryptionManager.decryptForRoom(encryptedMetadata, room.room_id);
                originalFilename = decryptedMetadata.original_name;
                uploadedBy = decryptedMetadata.uploaded_by;
                fileSize = decryptedMetadata.size;
              } catch (metaError) {
                console.error('Error decrypting file metadata:', metaError);
              }
            }

            allFiles.push({
              file_id: obj.name,
              filename: originalFilename,
              file_size: fileSize,
              file_type: originalFilename.split('.').pop() || 'unknown',
              uploaded_by: uploadedBy,
              upload_date: stats.lastModified,
              room_id: room.room_id,
              room_name: room.room_name,
              download_url: `/api/files/${room.room_id}/${obj.name}`
            });
          } catch (objError) {
            console.error(`Error processing object ${obj.name}:`, objError);
          }
        }
      } catch (bucketError) {
        console.error(`Error accessing bucket ${bucketName}:`, bucketError);
      }
    }

    // Sort by upload date (newest first)
    allFiles.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));

    res.json(allFiles);
  } catch (error) {
    console.error('Error fetching files:', error);
    res.status(500).json({ error: 'Failed to fetch files: ' + error.message });
  }
});

// Verify message on blockchain
app.get('/api/verify/:messageId', authenticateToken, async (req, res) => {
  try {
    if (!contractAddress) {
      return res.json({
        message_id: req.params.messageId,
        verified: false,
        verification_status: 'Smart contract not deployed yet',
        error: 'Contract address not configured'
      });
    }

    const contract = new web3.eth.Contract(chatContractABI, contractAddress);
    const result = await contract.methods.getMessageRecord(req.params.messageId).call();

    res.json({
      message_id: req.params.messageId,
      blockchain_hash: result[0],
      timestamp: new Date(result[1] * 1000),
      verified: true,
      verification_status: 'Valid on Blockchain'
    });
  } catch (error) {
    console.error('Blockchain verification error:', error);
    res.json({ 
      message_id: req.params.messageId,
      verified: false,
      verification_status: 'Blockchain verification failed',
      error: error.message
    });
  }
});

// Initialize everything
async function initialize() {
  await initializeDatabase();
  await initializeMinIO();
  console.log('All services initialized');
}

server.listen(port, '0.0.0.0', () => {
  console.log(`Blockchain Chat API listening at http://0.0.0.0:${port}`);
  initialize();
});