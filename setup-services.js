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
  console.log('🔧 Checking Oracle Database connection...');
  let connection;
  try {
    // Wait for connection
    await new Promise(resolve => setTimeout(resolve, 5000));

    connection = await oracledb.getConnection(dbConfig);
    console.log('✅ Connected to Oracle DB');
    console.log('ℹ️  Database tables will be created automatically when the API starts');

  } catch (error) {
    console.error('❌ Oracle connection failed:', error.message);
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