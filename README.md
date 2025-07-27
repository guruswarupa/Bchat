
# BChat - Blockchain-Powered Chat Application

A modern, secure chat application built with blockchain technology for message verification, real-time communication, and file sharing capabilities.

## 🚀 Project Overview

BChat is a full-stack decentralized chat application that combines traditional real-time messaging with blockchain technology for enhanced security and message verification. The application features user authentication, room-based messaging, file sharing, and smart contract integration for message immutability.

### Key Features

- **Real-time Messaging**: WebSocket-based instant messaging with Socket.IO
- **Blockchain Verification**: Smart contract integration for message authenticity
- **User Authentication**: JWT-based secure login and registration
- **Room Management**: Create public/private rooms with PIN protection
- **File Sharing**: Upload and share files with MinIO object storage
- **Database Integration**: Oracle Database with in-memory fallback
- **Responsive Design**: Mobile-friendly interface with dark theme

## 🏗️ Architecture

The application consists of four main components:

### 1. Frontend (Next.js + React)
- **Location**: `/frontend`
- **Technology**: Next.js 14, React, TypeScript, Tailwind CSS
- **Port**: 3000
- **Features**:
  - Real-time chat interface
  - User authentication forms
  - Room management UI
  - File upload functionality
  - Mobile-responsive design

### 2. Backend API (Node.js + Express)
- **Location**: `/chat-api`
- **Technology**: Node.js, Express, Socket.IO
- **Port**: 5000
- **Features**:
  - RESTful API endpoints
  - WebSocket server for real-time communication
  - JWT authentication middleware
  - File upload handling
  - Database operations

### 3. Smart Contract (Solidity)
- **Location**: `/blockchain`
- **Technology**: Solidity, Web3.js
- **Network**: Ganache (local blockchain)
- **Features**:
  - Message hash storage
  - Message verification
  - Immutable record keeping

### 4. Infrastructure Services
- **Oracle Database**: User and message data storage
- **MinIO**: File storage and retrieval
- **Ganache**: Local Ethereum blockchain

## 🛠️ Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Socket.IO Client**: Real-time communication

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: WebSocket implementation
- **JWT**: Authentication tokens
- **Multer**: File upload middleware

### Database & Storage
- **Oracle Database Free**: Primary database
- **MinIO**: S3-compatible object storage
- **In-memory fallback**: Development mode

### Blockchain
- **Solidity**: Smart contract language
- **Web3.js**: Ethereum JavaScript API
- **Ganache**: Local blockchain for development

## 📋 Prerequisites

Before running the application, ensure you have:

- Node.js (v18 or higher)
- Docker and Docker Compose
- Git

## 🚀 How to Run the Application

### Method 1: Using Docker Compose (Recommended)

1. **Clone and navigate to the project**:
   ```bash
   git clone https://github.com/guruswarupa/Bchat
   cd Bchat
   npm i
   cd blockchain
   npm i
   cd ..
   cd chat-api
   npm i
   cd ..
   cd frontend
   npm i
   ```

2. **Start all services**:
   ```bash
   docker-compose up -d
   ```
   
#### Backend API (chat-api/index.js)
```javascript
// Database Configuration
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

// Web3 Configuration
const web3 = new Web3('http://ganache:8545');
```

#### Docker Services (docker-compose.yml)
- **Oracle DB**: Port 1521, Password: `oracle`
- **MinIO**: Port 9000, Access: `minioadmin/minioadmin`
- **Ganache**: Port 8545, 10 deterministic accounts
- **Frontend**: Port 3000
- **Backend**: Port 5000

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### Rooms
- `GET /api/rooms` - Get all chat rooms
- `POST /api/rooms` - Create new room
- `DELETE /api/rooms/:roomId` - Delete room
- `POST /api/rooms/:roomId/verify-pin` - Verify room PIN

### Messages
- `GET /api/rooms/:roomId/messages` - Get room messages
- Socket events: `send_message`, `new_message`, `join_room`

### Files
- `POST /api/upload` - Upload file
- `GET /api/files` - List uploaded files

### Blockchain
- `GET /api/verify/:messageId` - Verify message on blockchain

## 🔐 Security Features

### Authentication
- JWT tokens for session management
- Bcrypt password hashing
- Protected API routes

### Message Verification
- SHA-256 content hashing
- Blockchain immutable storage
- Smart contract verification

### Room Security
- Private rooms with PIN protection
- User role management
- Room creator privileges

## 🌐 How It Works

### Message Flow
1. **User sends message** → Frontend captures input
2. **Socket emission** → Message sent via WebSocket
3. **Backend processing** → Message saved to database
4. **Hash generation** → SHA-256 hash created
5. **Blockchain recording** → Hash stored in smart contract
6. **Real-time broadcast** → Message sent to all room users

### User Authentication
1. **Registration/Login** → Credentials verified
2. **JWT generation** → Token created and stored
3. **Socket connection** → User joins with authentication
4. **Room access** → PIN verification for private rooms

### File Sharing
1. **File selection** → User chooses file
2. **Upload to MinIO** → File stored in object storage
3. **Database record** → File message created
4. **URL generation** → Download link provided
5. **Message broadcast** → File message sent to room

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Ensure Oracle container is running: `docker-compose ps`
   - Check logs: `docker-compose logs oracle-db`
   - App falls back to in-memory storage automatically

2. **Smart Contract Not Deployed**:
   - Run: `cd blockchain && npm run deploy`
   - Check Ganache is running on port 8545

3. **File Upload Issues**:
   - Verify MinIO is accessible at localhost:9000
   - Check bucket permissions and policies

4. **Socket Connection Problems**:
   - Ensure backend is running on port 5000
   - Check CORS configuration for frontend domain

### Development Tips

- Use browser dev tools to monitor WebSocket connections
- Check Docker logs for service-specific issues: `docker-compose logs [service-name]`
- Smart contract ABI fallback is available if deployment fails
- In-memory storage activates automatically if database is unavailable

## 📝 Usage Guide

### Getting Started
1. **Register** a new account or **login** with existing credentials
2. **Join rooms** by clicking on room names in the sidebar
3. **Send messages** using the input field at the bottom
4. **Upload files** using the attachment icon
5. **Create rooms** using the "+" button next to "Rooms"

### Room Management
- **Public rooms**: Accessible to all users
- **Private rooms**: Require PIN for access
- **Room deletion**: Only available to room creators
- **User list**: Shows online users in current room

### Message Features
- **Real-time delivery**: Instant message updates
- **Blockchain verification**: Green checkmark indicates verified messages
- **File attachments**: Upload and share files with download links
- **Timestamps**: All messages show send time

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License - see the package.json files for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review Docker container logs
3. Ensure all services are running correctly
4. Check network connectivity between services

---

**Note**: This application is designed for development and educational purposes. For production deployment, additional security measures, environment variable management, and infrastructure considerations should be implemented.
