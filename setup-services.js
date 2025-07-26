
const oracledb = require('oracledb');
const Minio = require('minio');
const { Web3 } = require('web3');

// Configuration
const dbConfig = {
  user: 'SYSTEM',
  password: 'oracle',
  connectString: 'localhost:1521/FREE'
};

const minioClient = new Minio.Client({
  endPoint: 'localhost',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});

const web3 = new Web3('http://localhost:8545');

async function setupOracle() {
  console.log('🔧 Setting up Oracle Database for Chat App...');
  let connection;
  try {
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    connection = await oracledb.getConnection(dbConfig);
    console.log('✅ Connected to Oracle DB');

    // Create chat application tables
    const tables = [
      `CREATE TABLE users (
        user_id VARCHAR2(50) PRIMARY KEY,
        username VARCHAR2(100) UNIQUE NOT NULL,
        email VARCHAR2(255) UNIQUE NOT NULL,
        password_hash VARCHAR2(255) NOT NULL,
        avatar_url VARCHAR2(500),
        created_at DATE DEFAULT SYSDATE,
        last_seen DATE DEFAULT SYSDATE,
        is_online NUMBER(1) DEFAULT 0
      )`,
      `CREATE TABLE chat_rooms (
        room_id VARCHAR2(50) PRIMARY KEY,
        room_name VARCHAR2(255) NOT NULL,
        description VARCHAR2(1000),
        created_by VARCHAR2(50),
        created_at DATE DEFAULT SYSDATE,
        is_private NUMBER(1) DEFAULT 0,
        room_type VARCHAR2(20) DEFAULT 'public'
      )`,
      `CREATE TABLE messages (
        message_id VARCHAR2(50) PRIMARY KEY,
        room_id VARCHAR2(50),
        user_id VARCHAR2(50),
        content CLOB,
        message_type VARCHAR2(20) DEFAULT 'text',
        file_url VARCHAR2(500),
        blockchain_hash VARCHAR2(255),
        timestamp DATE DEFAULT SYSDATE,
        is_edited NUMBER(1) DEFAULT 0,
        reply_to VARCHAR2(50)
      )`,
      `CREATE TABLE room_members (
        room_id VARCHAR2(50),
        user_id VARCHAR2(50),
        joined_at DATE DEFAULT SYSDATE,
        role VARCHAR2(20) DEFAULT 'member',
        PRIMARY KEY (room_id, user_id)
      )`,
      `CREATE TABLE user_sessions (
        session_id VARCHAR2(100) PRIMARY KEY,
        user_id VARCHAR2(50),
        socket_id VARCHAR2(100),
        created_at DATE DEFAULT SYSDATE,
        last_activity DATE DEFAULT SYSDATE
      )`
    ];

    for (const tableSQL of tables) {
      try {
        await connection.execute(tableSQL);
        console.log(`✅ Created table: ${tableSQL.split(' ')[2]}`);
      } catch (error) {
        if (error.message.includes('ORA-00955')) {
          console.log(`ℹ️  Table ${tableSQL.split(' ')[2]} already exists`);
        } else {
          console.error(`❌ Error creating table: ${error.message}`);
        }
      }
    }

    // Insert default chat rooms and sample data
    const defaultRooms = [
      ['general', 'General Chat', 'Main chat room for everyone', 'public'],
      ['tech', 'Tech Discussion', 'Talk about technology and development', 'public'],
      ['random', 'Random Chat', 'Random discussions and off-topic chat', 'public']
    ];

    for (const room of defaultRooms) {
      try {
        await connection.execute(
          `MERGE INTO chat_rooms r
           USING (SELECT :1 as room_id, :2 as room_name, :3 as description, :4 as room_type FROM dual) src
           ON (r.room_id = src.room_id)
           WHEN NOT MATCHED THEN
             INSERT (room_id, room_name, description, room_type)
             VALUES (src.room_id, src.room_name, src.description, src.room_type)`,
          room
        );
      } catch (error) {
        if (!error.message.includes('ORA-00001')) {
          console.error(`❌ Error inserting room data: ${error.message}`);
        }
      }
    }

    // Create sample users
    const sampleUsers = [
      ['user1', 'Alice', 'alice@example.com', '$2b$10$dummyhash1'],
      ['user2', 'Bob', 'bob@example.com', '$2b$10$dummyhash2'],
      ['user3', 'Charlie', 'charlie@example.com', '$2b$10$dummyhash3']
    ];

    for (const user of sampleUsers) {
      try {
        await connection.execute(
          `MERGE INTO users u
           USING (SELECT :1 as user_id, :2 as username, :3 as email, :4 as password_hash FROM dual) src
           ON (u.user_id = src.user_id)
           WHEN NOT MATCHED THEN
             INSERT (user_id, username, email, password_hash)
             VALUES (src.user_id, src.username, src.email, src.password_hash)`,
          user
        );
      } catch (error) {
        if (!error.message.includes('ORA-00001')) {
          console.error(`❌ Error inserting user data: ${error.message}`);
        }
      }
    }

    await connection.commit();
    console.log('✅ Oracle Database setup complete for Chat App');
  } catch (error) {
    console.error('❌ Oracle setup failed:', error.message);
  } finally {
    if (connection) await connection.close();
  }
}

async function setupMinIO() {
  console.log('🔧 Setting up MinIO for Chat Files...');
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const bucketName = 'chat-files';
    const bucketExists = await minioClient.bucketExists(bucketName);
    
    if (!bucketExists) {
      await minioClient.makeBucket(bucketName, 'us-east-1');
      console.log('✅ Created MinIO bucket: chat-files');
    } else {
      console.log('ℹ️  MinIO bucket already exists');
    }
    
    // Set bucket policy for public read access to files
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
      console.log('✅ Set bucket policy for file sharing');
    } catch (policyError) {
      console.log('ℹ️  Bucket policy setting skipped (optional)');
    }
    
    console.log('✅ MinIO setup complete');
  } catch (error) {
    console.error('❌ MinIO setup failed:', error.message);
  }
}

async function setupBlockchain() {
  console.log('🔧 Setting up Blockchain for Message Verification...');
  try {
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    const accounts = await web3.eth.getAccounts();
    console.log('✅ Connected to Ganache');
    console.log(`ℹ️  Available accounts: ${accounts.length}`);
    console.log(`ℹ️  Primary account: ${accounts[0]}`);
    
    // Check account balance
    const balance = await web3.eth.getBalance(accounts[0]);
    console.log(`ℹ️  Account balance: ${web3.utils.fromWei(balance, 'ether')} ETH`);
    
    console.log('⚠️  Smart contract deployment requires manual step');
    console.log('ℹ️  Run: cd blockchain && node deploy.js');
    console.log('ℹ️  This will deploy the ChatContract for message verification');
    
  } catch (error) {
    console.error('❌ Blockchain setup failed:', error.message);
  }
}

async function main() {
  console.log('🚀 Starting Chat Application Setup...\n');
  
  await setupOracle();
  console.log('');
  
  await setupMinIO();
  console.log('');
  
  await setupBlockchain();
  console.log('');
  
  console.log('🎉 Chat Application Setup Complete!');
  console.log('\nNext steps:');
  console.log('1. Deploy chat smart contract: cd blockchain && node deploy.js');
  console.log('2. Update contract address in chat-api/index.js');
  console.log('3. Start the chat services: docker-compose up --build');
  console.log('4. Access the chat app at http://localhost:3000');
  console.log('\nFeatures enabled:');
  console.log('• 💬 Real-time messaging with WebSockets');
  console.log('• 🔗 Blockchain message verification');
  console.log('• 📁 File sharing via MinIO');
  console.log('• 🔒 User authentication and rooms');
}

main().catch(console.error);
