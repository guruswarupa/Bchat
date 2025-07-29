
# BChat - Blockchain-Powered Chat Application

A modern, secure chat application built with blockchain technology for message verification, real-time communication, file sharing, and comprehensive user management.

## 🚀 Project Overview

BChat is a full-stack decentralized chat application that combines traditional real-time messaging with blockchain technology for enhanced security and message verification. The application features user authentication, room-based messaging, file sharing, user profile management, and smart contract integration for message immutability.

### Key Features

- **Real-time Messaging**: WebSocket-based instant messaging with Socket.IO
- **Blockchain Verification**: Smart contract integration for message authenticity
- **User Authentication**: JWT-based secure login and registration
- **Room Management**: Create public/private rooms with PIN protection
- **File Sharing**: Encrypted upload and share files with MinIO object storage
- **User Profile Management**: Complete profile settings with avatar upload
- **Friend System**: Send friend requests, manage friendships, and view friends list
- **Friend Requests**: Real-time friend request notifications and management
- **Online Status**: See which friends are currently online
- **Password Management**: Secure password change functionality
- **Account Management**: Safe account deletion with confirmation
- **Database Integration**: PostgreSQL with in-memory fallback
- **Message Encryption**: End-to-end encryption for messages and files
- **Notification System**: Toast notifications using Sonner
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
  - Profile settings modal
  - Password change dialog
  - Account deletion confirmation
  - Toast notifications with Sonner
  - Mobile-responsive design

### 2. Backend API (Node.js + Express)
- **Location**: `/chat-api`
- **Technology**: Node.js, Express, Socket.IO
- **Port**: 5000
- **Features**:
  - RESTful API endpoints
  - WebSocket server for real-time communication
  - JWT authentication middleware
  - File upload handling with encryption
  - User profile management
  - Password change endpoints
  - Account deletion with data cleanup
  - Database operations with PostgreSQL

### 3. Smart Contract (Solidity)
- **Location**: `/blockchain`
- **Technology**: Solidity, Web3.js
- **Network**: Ganache (local blockchain)
- **Features**:
  - Message hash storage
  - Message verification
  - Immutable record keeping

### 4. Infrastructure Services
- **PostgreSQL Database**: User and message data storage
- **MinIO**: Encrypted file storage and retrieval
- **Ganache**: Local Ethereum blockchain

## 🛠️ Technology Stack

### Frontend
- **Next.js 14**: React framework with App Router
- **TypeScript**: Type-safe development
- **Tailwind CSS**: Utility-first styling
- **Socket.IO Client**: Real-time communication
- **Sonner**: Toast notification system

### Backend
- **Node.js**: Runtime environment
- **Express.js**: Web application framework
- **Socket.IO**: WebSocket implementation
- **JWT**: Authentication tokens
- **Multer**: File upload middleware
- **Bcrypt**: Password hashing
- **Crypto**: Message and file encryption

### Database & Storage
- **PostgreSQL**: Primary database
- **MinIO**: S3-compatible object storage with encryption
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

1. **Clone and install dependencies**:
   ```bash
   git clone https://github.com/guruswarupa/Bchat
   cd Bchat
   npm install
   cd blockchain && npm install && cd ..
   cd chat-api && npm install && cd ..
   cd frontend && npm install && cd ..
   ```
2. **Start all services**:
   ```bash
   docker-compose up -d
   ```

## 📡 API Endpoints

### Authentication
- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login

### User Profile
- `GET /api/profile` - Get user profile
- `PUT /api/profile` - Update profile (username, email)
- `POST /api/profile/avatar` - Upload profile picture
- `PUT /api/profile/password` - Change password
- `DELETE /api/profile` - Delete account

### Rooms
- `GET /api/rooms` - Get all chat rooms
- `POST /api/rooms` - Create new room
- `DELETE /api/rooms/:roomId` - Delete room
- `POST /api/rooms/:roomId/verify-pin` - Verify room PIN

### Messages
- `GET /api/rooms/:roomId/messages` - Get room messages (encrypted)
- Socket events: `send_message`, `new_message`, `join_room`

### Files
- `POST /api/upload` - Upload encrypted file
- `GET /api/files` - List uploaded files
- `GET /api/files/:roomId/:fileName` - Download decrypted file
- `GET /api/avatars/:fileName` - Get user avatar

### Friends
- `GET /api/friends` - Get user's friends list
- `POST /api/friends/request` - Send friend request
- `POST /api/friends/accept` - Accept friend request
- `POST /api/friends/reject` - Reject friend request
- `DELETE /api/friends/:friendId` - Remove friend
- `GET /api/friends/requests` - Get pending friend requests

### Blockchain
- `GET /api/verify/:messageId` - Verify message on blockchain

### System
- `GET /api/health` - System health check
- `POST /api/admin/cleanup-rooms` - Admin room cleanup

## 🔐 Security Features

### Authentication & Authorization
- JWT tokens for session management
- Bcrypt password hashing with salt rounds
- Protected API routes with middleware
- Account deletion with password verification

### Message & File Encryption
- AES-256-GCM encryption for messages
- Room-specific encryption keys
- Encrypted file storage in MinIO
- SHA-256 content hashing for blockchain

### Room Security
- Private rooms with PIN protection
- User role management (admin/member)
- Room creator privileges
- Automatic membership for public rooms

### Profile Security
- Secure avatar upload with validation
- Password change with current password verification
- Account deletion with complete data cleanup

## 🌐 How It Works

### User Registration & Profile Management
1. **Registration** → User creates account with email verification
2. **Profile Setup** → Upload avatar, update personal information
3. **Password Management** → Change password with current password verification
4. **Account Deletion** → Secure deletion with password confirmation and data cleanup

### Message Flow with Encryption
1. **User sends message** → Frontend captures input
2. **Encryption** → Message encrypted with room-specific key
3. **Socket emission** → Encrypted message sent via WebSocket
4. **Database storage** → Encrypted message saved to PostgreSQL
5. **Hash generation** → SHA-256 hash created for blockchain
6. **Blockchain recording** → Hash stored in smart contract
7. **Real-time broadcast** → Decrypted message sent to room users

### File Sharing with Encryption
1. **File selection** → User chooses file
2. **Encryption** → File encrypted with room-specific key
3. **Upload to MinIO** → Encrypted file stored in object storage
4. **Database record** → Encrypted file message created
5. **URL generation** → Secure download link provided
6. **Message broadcast** → File message sent to room

### Room Management
1. **Public rooms** → Automatic membership for all users
2. **Private rooms** → PIN-based access control
3. **Room creation** → User becomes admin with full permissions
4. **Room deletion** → Only admins can delete rooms

## 🔧 Configuration

### Database Configuration (chat-api/index.js)
```javascript
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/chatdb',
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

### Database Schema
The application includes these main tables:
- **users**: User accounts with authentication and profile data
- **chat_rooms**: Room information including public/private settings
- **room_members**: User membership and roles in rooms
- **messages**: Encrypted chat messages with blockchain hashes
- **friendships**: Friend relationships between users &  Pending friend requests with status tracking

### MinIO Configuration
```javascript
const minioClient = new Minio.Client({
  endPoint: 'minio',
  port: 9000,
  useSSL: false,
  accessKey: 'minioadmin',
  secretKey: 'minioadmin'
});
```

### Web3 Configuration
```javascript
const web3 = new Web3('http://ganache:8545');
```

## 🐛 Troubleshooting

### Common Issues

1. **Database Connection Failed**:
   - Ensure PostgreSQL is running and accessible
   - Check connection string in environment variables
   - App automatically falls back to in-memory storage

2. **Smart Contract Not Deployed**:
   - Run: `cd blockchain && npm run deploy`
   - Check Ganache is running on port 8545
   - Blockchain features gracefully degrade if unavailable

3. **File Upload Issues**:
   - Verify MinIO is accessible
   - Check bucket permissions and policies
   - Ensure sufficient disk space

4. **Frontend Not Starting**:
   - Run `npm install` in frontend directory
   - Check if port 3000 is available
   - Verify Next.js dependencies are installed

### Development Tips

- Use browser dev tools to monitor WebSocket connections
- Check console logs for detailed error messages
- Smart contract ABI fallback is available if deployment fails
- In-memory storage activates automatically if database is unavailable
- Toast notifications show system status and errors

## 📝 Usage Guide

### Getting Started
1. **Register** a new account with email and password
2. **Set up profile** by uploading an avatar and updating information
3. **Join rooms** by clicking on room names in the sidebar
4. **Send messages** using the input field at the bottom
5. **Upload files** using the attachment icon (files are encrypted)
6. **Create rooms** using the "+" button next to "Rooms"
7. **Add friends** by sending friend requests to other users
8. **Manage friendships** through the friends section in the sidebar

### Profile Management
- **Update Profile**: Access settings to change username and email
- **Change Password**: Secure password update with current password verification
- **Upload Avatar**: Profile picture with automatic resizing and validation
- **Delete Account**: Permanent account deletion with confirmation

### Room Features
- **Public rooms**: Accessible to all users automatically
- **Private rooms**: Require PIN for access
- **Room deletion**: Only available to room creators
- **User list**: Shows online users in current room
- **Message encryption**: All messages are encrypted per room

### Message Features
- **Real-time delivery**: Instant message updates
- **Blockchain verification**: Green checkmark indicates verified messages
- **File attachments**: Encrypted upload and share files with download links
- **Timestamps**: All messages show send time
- **Message persistence**: Messages stored securely in database

### Friend System Features
- **Friend Requests**: Send and receive friend requests with real-time notifications
- **Friends Management**: Accept, reject, or remove friends easily
- **Online Status**: See which friends are currently online with green indicators
- **Friends List**: View all friends in the sidebar with avatars and status
- **Request Notifications**: Get notified when someone sends you a friend request

### Notification System
- **Toast notifications**: Real-time feedback for all actions
- **Error handling**: Clear error messages for failed operations
- **Success confirmations**: Visual feedback for completed actions
- **Friend notifications**: Real-time alerts for friend requests and status changes

## 🔄 Data Flow

### Message Encryption Flow
```
User Input → AES-256-GCM Encryption → Database Storage → Blockchain Hash → Real-time Broadcast → Client Decryption
```

### File Upload Flow
```
File Selection → File Encryption → MinIO Upload → Database Record → Download URL → Broadcast Notification
```

### User Authentication Flow
```
Login Request → JWT Generation → Socket Authentication → Room Access → Real-time Features
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Implement changes with proper encryption
4. Test thoroughly with all features
5. Submit a pull request

## 📄 License

This project is licensed under the ISC License - see the package.json files for details.

## 🆘 Support

For issues and questions:
1. Check the troubleshooting section above
2. Review console logs for detailed error messages
3. Ensure all services are running correctly
4. Check network connectivity between services
5. Verify database and storage configurations

## 🔒 Privacy & Security

- All messages are encrypted using AES-256-GCM
- User passwords are hashed with bcrypt
- File uploads are encrypted before storage
- Blockchain provides immutable message verification
- Secure session management with JWT tokens
- Safe account deletion with complete data cleanup

---

**Note**: This application includes comprehensive security features and is suitable for development and educational purposes.
