
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
  connectString: 'localhost:1521/FREE'
};

// MinIO Configuration
const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

// Web3 Configuration (Ganache)
const web3 = new Web3('http://localhost:8545');

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

// Initialize Oracle DB tables
async function initializeDatabase() {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    dbAvailable = true;

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
          room_type VARCHAR2(20) DEFAULT ''public''
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
          edited_at DATE
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

    console.log('Database initialized successfully');
  } catch (error) {
    console.error('Database initialization error:', error);
    console.log('Falling back to in-memory storage for development');
    dbAvailable = false;
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

// Store connected users
const connectedUsers = new Map();

// In-memory storage fallback
const inMemoryUsers = new Map();
const inMemoryMessages = new Map();
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
    
    connectedUsers.set(userData.user_id, {
      user_id: userData.user_id,
      username: userData.username,
      socket_id: socket.id,
      is_online: true
    });
    
    // Broadcast updated user list
    io.emit('users_update', Array.from(connectedUsers.values()));
    console.log(`User ${userData.username} (${userData.user_id}) connected`);
  });

  // Join room
  socket.on('join_room', (roomId) => {
    socket.join(roomId);
    socket.currentRoom = roomId;
    console.log(`User ${socket.username || socket.id} joined room ${roomId}`);
    
    // Notify others in the room
    socket.to(roomId).emit('user_joined_room', {
      user_id: socket.userId,
      username: socket.username,
      room_id: roomId
    });
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
      
      // Generate hash and record on blockchain
      const messageData = {
        message_id: messageId,
        room_id: data.room_id,
        sender_id: data.sender_id,
        content: data.content,
        message_type: data.message_type || 'text',
        created_at: timestamp
      };
      
      const hash = generateMessageHash(messageData);
      const blockchainHash = await recordOnBlockchain(messageId, hash);

      let username = 'Unknown';

      if (dbAvailable) {
        // Save to database with correct parameter mapping
        let connection;
        try {
          connection = await oracledb.getConnection(dbConfig);
          await connection.execute(
            `INSERT INTO messages (message_id, room_id, sender_id, content, message_type, blockchain_hash, created_at)
             VALUES (:message_id, :room_id, :sender_id, :content, :message_type, :blockchain_hash, :created_at)`,
            {
              message_id: messageId,
              room_id: data.room_id,
              sender_id: data.sender_id,
              content: data.content,
              message_type: data.message_type || 'text',
              blockchain_hash: blockchainHash,
              created_at: timestamp
            }
          );
          await connection.commit();

          // Get username for the message
          const userResult = await connection.execute(
            'SELECT username FROM users WHERE user_id = :user_id',
            [data.sender_id]
          );
          
          username = userResult.rows.length > 0 ? userResult.rows[0][0] : 'Unknown';

        } finally {
          if (connection) await connection.close();
        }
      } else {
        // Use in-memory storage
        const roomMessages = inMemoryMessages.get(data.room_id) || [];
        roomMessages.push({
          message_id: messageId,
          room_id: data.room_id,
          sender_id: data.sender_id,
          content: data.content,
          message_type: data.message_type || 'text',
          blockchain_hash: blockchainHash,
          timestamp: timestamp.toISOString(),
          created_at: timestamp.toISOString()
        });
        inMemoryMessages.set(data.room_id, roomMessages);
        
        // Get username from connected users or fallback
        const user = connectedUsers.get(data.sender_id);
        username = user ? user.username : `User-${data.sender_id.substring(0, 8)}`;
      }

      // Broadcast message to room with username
      const fullMessage = {
        message_id: messageId,
        room_id: data.room_id,
        sender_id: data.sender_id,
        user_id: data.sender_id,
        username: username,
        content: data.content,
        message_type: data.message_type || 'text',
        blockchain_hash: blockchainHash,
        timestamp: timestamp.toISOString(),
        created_at: timestamp.toISOString()
      };
      
      io.to(data.room_id).emit('new_message', fullMessage);
      console.log(`Message sent to room ${data.room_id} by ${username}`);

    } catch (error) {
      console.error('Error sending message:', error);
      socket.emit('error', 'Failed to send message');
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
      
      connectedUsers.delete(socket.userId);
      // Broadcast updated user list
      io.emit('users_update', Array.from(connectedUsers.values()));
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
    const { username, email, password } = req.body;
    const userId = uuidv4();
    const hashedPassword = await bcrypt.hash(password, 10);

    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      'INSERT INTO users (user_id, username, email, password_hash) VALUES (:user_id, :username, :email, :password_hash)',
      { user_id: userId, username, email, password_hash: hashedPassword }
    );
    await connection.commit();

    const token = jwt.sign({ user_id: userId, username }, JWT_SECRET);
    res.status(201).json({ token, user: { user_id: userId, username, email } });
  } catch (error) {
    console.error('Registration error:', error);
    res.status(500).json({ error: 'Registration failed' });
  } finally {
    if (connection) await connection.close();
  }
});

// User login
app.post('/api/auth/login', async (req, res) => {
  let connection;
  try {
    const { username, password } = req.body;

    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute(
      'SELECT user_id, username, email, password_hash FROM users WHERE username = :username',
      [username]
    );

    if (result.rows.length === 0) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const user = {
      user_id: result.rows[0][0],
      username: result.rows[0][1],
      email: result.rows[0][2],
      password_hash: result.rows[0][3]
    };

    const validPassword = await bcrypt.compare(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    const token = jwt.sign({ user_id: user.user_id, username: user.username }, JWT_SECRET);
    res.json({ token, user: { user_id: user.user_id, username: user.username, email: user.email } });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Login failed' });
  } finally {
    if (connection) await connection.close();
  }
});

// Get chat rooms
app.get('/api/rooms', authenticateToken, async (req, res) => {
  let connection;
  try {
    connection = await oracledb.getConnection(dbConfig);
    const result = await connection.execute('SELECT * FROM chat_rooms ORDER BY created_at');

    const rooms = result.rows.map(row => ({
      room_id: row[0],
      room_name: row[1],
      description: row[2],
      created_by: row[3],
      created_at: row[4],
      is_private: row[5],
      room_type: row[6]
    }));

    res.json(rooms);
  } catch (error) {
    console.error('Error fetching rooms:', error);
    res.status(500).json({ error: 'Database error' });
  } finally {
    if (connection) await connection.close();
  }
});

// Get messages for a room
app.get('/api/rooms/:roomId/messages', authenticateToken, async (req, res) => {
  try {
    if (dbAvailable) {
      let connection;
      try {
        connection = await oracledb.getConnection(dbConfig);
        const result = await connection.execute(
          `SELECT m.*, u.username 
           FROM messages m 
           JOIN users u ON m.sender_id = u.user_id 
           WHERE m.room_id = :room_id 
           ORDER BY m.created_at DESC 
           FETCH FIRST 50 ROWS ONLY`,
          [req.params.roomId]
        );

        const messages = result.rows.map(row => ({
          message_id: row[0],
          room_id: row[1],
          sender_id: row[2],
          user_id: row[2],
          content: row[3],
          message_type: row[4],
          file_url: row[5],
          reply_to: row[6],
          timestamp: row[7],
          created_at: row[7],
          blockchain_hash: row[8],
          is_edited: row[9],
          edited_at: row[10],
          username: row[11]
        }));

        res.json(messages.reverse());
      } finally {
        if (connection) await connection.close();
      }
    } else {
      // Use in-memory storage
      const roomMessages = inMemoryMessages.get(req.params.roomId) || [];
      res.json(roomMessages);
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

    const bucketName = 'chat-files';
    const fileName = `${Date.now()}_${req.file.originalname}`;
    const messageId = uuidv4();
    const roomId = req.body.room_id || 'general';

    await minioClient.putObject(
      bucketName,
      fileName,
      req.file.buffer,
      req.file.size,
      { 'Content-Type': req.file.mimetype }
    );

    const fileUrl = `http://0.0.0.0:9000/${bucketName}/${fileName}`;
    
    // Save file message to database
    connection = await oracledb.getConnection(dbConfig);
    const timestamp = new Date();
    await connection.execute(
      `INSERT INTO messages (message_id, room_id, sender_id, content, message_type, file_url, created_at)
       VALUES (:message_id, :room_id, :sender_id, :content, :message_type, :file_url, :created_at)`,
      {
        message_id: messageId,
        room_id: roomId,
        sender_id: req.user.user_id,
        content: `Uploaded file: ${req.file.originalname}`,
        message_type: 'file',
        file_url: fileUrl,
        created_at: timestamp
      }
    );
    await connection.commit();

    // Broadcast file message to room
    const fileMessage = {
      message_id: messageId,
      room_id: roomId,
      sender_id: req.user.user_id,
      username: req.user.username,
      content: `Uploaded file: ${req.file.originalname}`,
      message_type: 'file',
      file_url: fileUrl,
      created_at: timestamp
    };
    
    io.to(roomId).emit('new_message', fileMessage);
    console.log(`File message broadcasted to room ${roomId}`);

    res.json({ 
      message: 'File uploaded successfully', 
      url: fileUrl, 
      fileName: req.file.originalname,
      message_id: messageId
    });
  } catch (error) {
    console.error('Upload error:', error);
    res.status(500).json({ error: 'File upload failed' });
  } finally {
    if (connection) await connection.close();
  }
});

// Create chat room
app.post('/api/rooms', authenticateToken, async (req, res) => {
  let connection;
  try {
    const { room_name, description, is_private } = req.body;
    const roomId = uuidv4();

    connection = await oracledb.getConnection(dbConfig);
    await connection.execute(
      'INSERT INTO chat_rooms (room_id, room_name, description, created_by, is_private) VALUES (:room_id, :room_name, :description, :created_by, :is_private)',
      { room_id: roomId, room_name, description, created_by: req.user.user_id, is_private: is_private ? 1 : 0 }
    );

    // Add creator as room member
    await connection.execute(
      'INSERT INTO room_members (room_id, user_id, role) VALUES (:room_id, :user_id, :role)',
      { room_id: roomId, user_id: req.user.user_id, role: 'admin' }
    );

    await connection.commit();
    res.status(201).json({ room_id: roomId, room_name, description, created_by: req.user.user_id });
  } catch (error) {
    console.error('Error creating room:', error);
    res.status(500).json({ error: 'Failed to create room' });
  } finally {
    if (connection) await connection.close();
  }
});

// Get uploaded files
app.get('/api/files', authenticateToken, async (req, res) => {
  try {
    const bucketName = 'chat-files';
    
    // Check if bucket exists
    const bucketExists = await minioClient.bucketExists(bucketName);
    if (!bucketExists) {
      return res.json([]);
    }

    // Get list of objects from MinIO
    const objectsList = [];
    const objectsStream = minioClient.listObjects(bucketName, '', true);
    
    for await (const obj of objectsStream) {
      try {
        // Get object stats to get file size
        const stats = await minioClient.statObject(bucketName, obj.name);
        
        // Extract original filename from the prefixed name (remove timestamp prefix)
        const originalFilename = obj.name.includes('_') ? obj.name.substring(obj.name.indexOf('_') + 1) : obj.name;
        
        objectsList.push({
          file_id: obj.name, // Use object name as file ID
          filename: originalFilename,
          file_size: stats.size,
          file_type: originalFilename.split('.').pop() || 'unknown',
          uploaded_by: 'User', // MinIO doesn't store this info, could be enhanced
          upload_date: stats.lastModified,
          download_url: `http://0.0.0.0:9000/${bucketName}/${obj.name}`
        });
      } catch (objError) {
        console.error(`Error processing object ${obj.name}:`, objError);
        // Continue with other objects even if one fails
      }
    }

    // Sort by upload date (newest first)
    objectsList.sort((a, b) => new Date(b.upload_date) - new Date(a.upload_date));

    res.json(objectsList);
  } catch (error) {
    console.error('Error fetching files from MinIO:', error);
    res.status(500).json({ error: 'MinIO error: ' + error.message });
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
