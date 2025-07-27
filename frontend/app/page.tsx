'use client';

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';

interface Message {
  message_id: string;
  user_id: string;
  username: string;
  room_id: string;
  content: string;
  message_type: string;
  timestamp: string;
  created_at?: string;
  file_url?: string;
  blockchain_hash?: string;
}

interface User {
  user_id: string;
  username: string;
  is_online: boolean;
}

interface Room {
  room_id: string;
  room_name: string;
  description: string;
  created_by: string;
  is_private: boolean;
  room_type: string;
  created_at: string;
}

export default function ChatDashboard() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [email, setEmail] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [currentUser, setCurrentUser] = useState<any>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const [currentRoom, setCurrentRoom] = useState('general');
  const [onlineUsers, setOnlineUsers] = useState<User[]>([]);
  const [socket, setSocket] = useState<any>(null);
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [showPinDialog, setShowPinDialog] = useState(false);
  const [pendingRoom, setPendingRoom] = useState('');
  const [roomPin, setRoomPin] = useState('');
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newRoom, setNewRoom] = useState({
    room_name: '',
    description: '',
    is_private: false,
    room_pin: ''
  });
  const [deleteConfirmation, setDeleteConfirmation] = useState({
    show: false,
    roomId: '',
    roomName: ''
  });
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Professional Delete Icon Component
  const DeleteIcon = () => (
    <svg 
      width="16" 
      height="16" 
      viewBox="0 0 24 24" 
      fill="none" 
      xmlns="http://www.w3.org/2000/svg"
      className="w-4 h-4"
    >
      <path 
        d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c0-1 1-2 2-2v2m-6 5v6m4-6v6" 
        stroke="currentColor" 
        strokeWidth="2" 
        strokeLinecap="round" 
        strokeLinejoin="round"
      />
    </svg>
  );

  const getApiBase = () => {
    return 'http://localhost:5000';
  };

  const fetchRooms = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const data = await response.json();
        setRooms(data);
      }
    } catch (error) {
      console.error('Error fetching rooms:', error);
    }
  };

  const createRoom = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(newRoom)
      });

      if (response.ok) {
        const result = await response.json();
        console.log('Room created:', result);
        setShowCreateForm(false);
        setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
        fetchRooms(); // Refresh rooms list
      } else {
        alert('Failed to create room');
      }
    } catch (error) {
      console.error('Error creating room:', error);
      alert('Failed to create room');
    }
  };

  const confirmDeleteRoom = (roomId: string, roomName: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent switching to the room when clicking delete
    setDeleteConfirmation({
      show: true,
      roomId,
      roomName
    });
  };

  const deleteRoom = async () => {
    const { roomId } = deleteConfirmation;
    
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms/${roomId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        console.log('Room deleted:', roomId);
        // If we're currently in the deleted room, switch to general
        if (currentRoom === roomId) {
          switchRoom('general');
        }
        setDeleteConfirmation({ show: false, roomId: '', roomName: '' });
        fetchRooms(); // Refresh rooms list
      } else {
        const error = await response.json();
        console.error(error.error || 'Failed to delete room');
        setDeleteConfirmation({ show: false, roomId: '', roomName: '' });
      }
    } catch (error) {
      console.error('Error deleting room:', error);
      setDeleteConfirmation({ show: false, roomId: '', roomName: '' });
    }
  };

  const fetchMessages = async () => {
    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/rooms/${currentRoom}/messages`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      // Ensure data is an array and filter by current room
      const roomMessages = Array.isArray(data) ? data.filter(msg => msg.room_id === currentRoom) : [];
      setMessages(roomMessages);
    } catch (error) {
      console.error('Error fetching messages:', error);
      setMessages([]); // Set empty array on error
    }
  };

  const switchRoom = async (roomId: string, roomType?: string) => {
    // For any room that's not the default public rooms, check if it requires PIN
    const publicRooms = ['general', 'tech', 'random'];
    if (!publicRooms.includes(roomId)) {
      // Find the room to check if it's private
      const room = rooms.find(r => r.room_id === roomId);
      if (room && room.is_private) {
        // Room is private, show PIN dialog
        setPendingRoom(roomId);
        setShowPinDialog(true);
        return;
      }
    }

    // Clear current room data immediately
    setMessages([]);
    setOnlineUsers([]);
    
    // Update current room state
    setCurrentRoom(roomId);
    
    // Switch to room via socket
    if (socket && socket.connected) {
      console.log(`Switching to room: ${roomId}`);
      socket.emit('join_room', roomId);
    }
  };

  const verifyPin = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`http://localhost:5000/api/rooms/${pendingRoom}/verify-pin`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ pin: roomPin })
      });

      if (response.ok) {
        // PIN verified, switch to room
        setMessages([]);
        setOnlineUsers([]);
        setCurrentRoom(pendingRoom);
        
        if (socket && socket.connected) {
          console.log(`Switching to verified room: ${pendingRoom}`);
          socket.emit('join_room', pendingRoom);
        }
        
        setShowPinDialog(false);
        setRoomPin('');
        setPendingRoom('');
      } else {
        alert('Invalid PIN');
      }
    } catch (error) {
      console.error('Error verifying PIN:', error);
      alert('Error verifying PIN');
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const apiBase = getApiBase();

      const url = isRegistering
        ? `${apiBase}/api/auth/register`
        : `${apiBase}/api/auth/login`;

      const payload = isRegistering
        ? { username: loginForm.username, email, password: loginForm.password }
        : { username: loginForm.username, password: loginForm.password };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (response.ok) {
        const data = await response.json();
        localStorage.setItem('token', data.token);
        localStorage.setItem('user_id', data.user.user_id);
        localStorage.setItem('username', data.user.username);
        setUsername(data.user.username);
        setCurrentUser(data.user);
        setIsLoggedIn(true);
      } else {
        alert(isRegistering ? 'Registration failed' : 'Login failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert(isRegistering ? 'Registration failed' : 'Login failed');
    }
  };

  const sendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() && socket && socket.connected) {
      const userId = localStorage.getItem('user_id');
      console.log('Sending message:', { room_id: currentRoom, sender_id: userId, content: newMessage });
      
      socket.emit('send_message', {
        room_id: currentRoom,
        sender_id: userId,
        content: newMessage,
        message_type: 'text'
      });
      setNewMessage('');
    } else {
      console.error('Cannot send message:', { 
        hasMessage: !!newMessage.trim(), 
        hasSocket: !!socket, 
        socketConnected: socket?.connected 
      });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Show upload progress (optional)
    console.log('Uploading file:', file.name);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('room_id', currentRoom);

    try {
      const token = localStorage.getItem('token');
      const apiBase = getApiBase();

      const response = await fetch(`${apiBase}/api/upload`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`
        },
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('File uploaded successfully:', result);
        // The file message will be automatically broadcasted via socket
      } else {
        const error = await response.json();
        console.error('Upload failed:', error);
        alert('Failed to upload file: ' + (error.error || 'Unknown error'));
      }
      
      // Reset file input
      e.target.value = '';
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload file. Please try again.');
    }
  };

  useEffect(() => {
    if (isLoggedIn && username) {
      // Create Socket.IO connection
      const socketUrl = getApiBase();

      const newSocket = io(socketUrl, {
        transports: ['websocket', 'polling'],
        forceNew: true,
        timeout: 20000
      });

      newSocket.on('connect', () => {
        console.log('Connected to server with socket ID:', newSocket.id);
        
        const userId = localStorage.getItem('user_id');
        const storedUsername = localStorage.getItem('username') || username;
        
        // Join as user
        newSocket.emit('user_join', {
          user_id: userId,
          username: storedUsername
        });

        // Join current room after a brief delay to ensure user_join is processed
        setTimeout(() => {
          newSocket.emit('join_room', currentRoom);
          // Fetch messages for the current room
          fetchMessages();
        }, 100);
      });

      newSocket.on('connect_error', (error: Error) => {
        console.error('Socket connection error:', error);
      });

      newSocket.on('disconnect', (reason: string) => {
        console.log('Socket disconnected:', reason);
      });

      // Listen for new messages
      newSocket.on('new_message', (message: Message) => {
        console.log('Received message for room:', message.room_id, 'current room:', currentRoom);
        // Only add message if it's for the current room
        if (message.room_id === currentRoom) {
          setMessages(prev => [...prev, message]);
        }
      });

      // Listen for user updates (room-specific)
      newSocket.on('users_update', (users: User[]) => {
        console.log('Users update for current room:', users);
        setOnlineUsers(users);
      });

      // Listen for user joined room
      newSocket.on('user_joined_room', (data: any) => {
        console.log('User joined room:', data);
      });

      // Listen for typing indicators
      newSocket.on('user_typing', (data: any) => {
        console.log('User typing:', data);
      });

      newSocket.on('user_stop_typing', (data: any) => {
        console.log('User stopped typing:', data);
      });

      // Listen for room deletion
      newSocket.on('room_deleted', (data: any) => {
        console.log('Room deleted:', data);
        if (currentRoom === data.room_id) {
          // Switch to the redirect room (usually 'general')
          switchRoom(data.redirect_to || 'general');
        }
        fetchRooms(); // Refresh rooms list
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [isLoggedIn, currentRoom, username]);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const storedUsername = localStorage.getItem('username');
    const storedUserId = localStorage.getItem('user_id');
    
    if (token && storedUsername) {
      setUsername(storedUsername);
      setCurrentUser({ user_id: storedUserId, username: storedUsername });
      setIsLoggedIn(true);
      fetchRooms(); // Fetch rooms when logged in
    }

    // Check URL parameters for room
    const urlParams = new URLSearchParams(window.location.search);
    const roomParam = urlParams.get('room');
    if (roomParam) {
      setCurrentRoom(roomParam);
    }
  }, []);

  // Update URL when room changes
  useEffect(() => {
    const url = new URL(window.location.href);
    url.searchParams.set('room', currentRoom);
    window.history.replaceState({}, '', url.toString());
  }, [currentRoom]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
        <div className="bg-[#2c2c2e] p-8 rounded-xl shadow-xl w-full max-w-md">
          <h1 className="text-2xl font-semibold mb-6 text-center">
            {isRegistering ? 'Register to Chat' : 'Login to Chat'}
          </h1>
          <form onSubmit={handleLogin} className="space-y-4">
            {isRegistering && (
              <input
                type="email"
                placeholder="Email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            )}
            <input
              type="text"
              placeholder="Username"
              value={loginForm.username}
              onChange={(e) => setLoginForm(prev => ({ ...prev, username: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <input
              type="password"
              placeholder="Password"
              value={loginForm.password}
              onChange={(e) => setLoginForm(prev => ({ ...prev, password: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <button
              type="submit"
              className="w-full bg-blue-600 hover:bg-blue-700 text-white py-2 rounded-md"
            >
              {isRegistering ? 'Register' : 'Login'}
            </button>
            <button
              type="button"
              onClick={() => setIsRegistering(!isRegistering)}
              className="w-full text-blue-400 hover:text-blue-300 text-sm mt-2"
            >
              {isRegistering ? 'Already have an account? Login' : 'Need an account? Register'}
            </button>
          </form>
        </div>
      </div>
    );
  }

 return (
  <div className="min-h-screen flex flex-col lg:flex-row bg-[#1e1e1e] text-white">
    {/* Sidebar */}
    <aside className={`
      lg:w-64 w-full bg-[#2c2c2e] border-r border-[#3a3a3c]
      lg:block ${showMobileSidebar ? 'block' : 'hidden'}
      lg:relative absolute lg:h-screen h-[calc(100vh-80px)] z-20 flex flex-col
    `}>
      {/* Mobile close button */}
      <div className="lg:hidden flex justify-between items-center p-4 border-b border-[#3a3a3c]">
        <h2 className="text-lg font-semibold">Menu</h2>
        <button 
          onClick={() => setShowMobileSidebar(false)}
          className="bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md text-white"
        >
          ✕
        </button>
      </div>

      {/* Desktop header */}
      <div className="hidden lg:block p-4 border-b border-[#3a3a3c]">
        <h2 className="text-lg font-semibold">Online Users ({onlineUsers.length})</h2>
      </div>

      {/* Sidebar content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div className="lg:hidden">
          <h3 className="text-md font-medium mb-4">Online Users ({onlineUsers.length})</h3>
        </div>
        <div className="space-y-2 max-h-48 overflow-y-auto">
          {onlineUsers.map((user) => (
            <div key={user.user_id} className="flex items-center space-x-2">
              <span className="w-2 h-2 bg-green-400 rounded-full flex-shrink-0" />
              <span className="text-sm text-white truncate">{user.username}</span>
            </div>
          ))}
        </div>
        <div>
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-sm font-medium">Rooms</h3>
            <button
              onClick={() => setShowCreateForm(true)}
              className="bg-blue-600 text-white px-2 py-1 rounded text-xs hover:bg-blue-700 transition-colors"
            >
              +
            </button>
          </div>
          <div className="space-y-1">
            {/* Default Rooms */}
            {['general', 'tech', 'random'].map((room) => (
              <button
                key={room}
                onClick={() => {
                  switchRoom(room);
                  setShowMobileSidebar(false);
                }}
                className={`w-full text-left px-2 py-2 rounded text-sm transition-colors ${
                  currentRoom === room
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-[#3a3a3c] text-gray-300'
                }`}
              >
                # {room}
              </button>
            ))}
            
            {/* Custom Rooms */}
            {rooms.map((room) => (
              <div
                key={room.room_id}
                className={`w-full flex items-center justify-between px-2 py-2 rounded text-sm transition-colors ${
                  currentRoom === room.room_id
                    ? 'bg-blue-600 text-white'
                    : 'hover:bg-[#3a3a3c] text-gray-300'
                }`}
              >
                <button
                  onClick={() => {
                    switchRoom(room.room_id);
                    setShowMobileSidebar(false);
                  }}
                  title={room.description || `${room.room_name} room`}
                  className="flex-1 text-left flex items-center justify-between"
                >
                  <span># {room.room_name}</span>
                  {room.is_private && (
                    <span className="text-xs text-orange-400 mr-2">🔒</span>
                  )}
                </button>
                {room.created_by === currentUser?.user_id && (
                  <button
                    onClick={(e) => confirmDeleteRoom(room.room_id, room.room_name, e)}
                    className="ml-2 p-1 text-red-400 hover:text-red-300 hover:bg-red-900/20 rounded transition-colors"
                    title="Delete room"
                  >
                    <DeleteIcon />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </aside>

    {/* PIN Verification Dialog */}
    {showPinDialog && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
          <h3 className="text-lg font-semibold mb-4 text-white">Enter Room PIN</h3>
          <div className="space-y-4">
            <input
              type="password"
              placeholder="Room PIN"
              value={roomPin}
              onChange={(e) => setRoomPin(e.target.value)}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  verifyPin();
                }
              }}
            />
            <div className="flex space-x-2">
              <button
                onClick={verifyPin}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Enter
              </button>
              <button
                onClick={() => {
                  setShowPinDialog(false);
                  setRoomPin('');
                  setPendingRoom('');
                }}
                className="bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      </div>
    )}

    {/* Delete Confirmation Dialog */}
    {deleteConfirmation.show && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
          <h3 className="text-lg font-semibold mb-4 text-white">Delete Room</h3>
          <p className="text-gray-300 mb-6">
            Are you sure you want to delete the room <span className="font-semibold text-white">#{deleteConfirmation.roomName}</span>? 
            This action cannot be undone and all messages will be permanently lost.
          </p>
          <div className="flex space-x-3">
            <button
              onClick={deleteRoom}
              className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors font-medium"
            >
              Delete Room
            </button>
            <button
              onClick={() => setDeleteConfirmation({ show: false, roomId: '', roomName: '' })}
              className="bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors"
            >
              Cancel
            </button>
          </div>
        </div>
      </div>
    )}

    {/* Main Chat Column */}
    {/* Create Room Form Modal */}
    {showCreateForm && (
      <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
        <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
          <h3 className="text-lg font-semibold mb-4 text-white">Create New Room</h3>
          <form onSubmit={createRoom} className="space-y-4">
            <input
              type="text"
              placeholder="Room Name"
              value={newRoom.room_name}
              onChange={(e) => setNewRoom(prev => ({ ...prev, room_name: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              required
            />
            <textarea
              placeholder="Description (optional)"
              value={newRoom.description}
              onChange={(e) => setNewRoom(prev => ({ ...prev, description: e.target.value }))}
              className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              rows={3}
            />
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="private"
                checked={newRoom.is_private}
                onChange={(e) => setNewRoom(prev => ({ ...prev, is_private: e.target.checked }))}
                className="rounded border-[#48484a] bg-[#3a3a3c] text-blue-600 focus:ring-blue-500"
              />
              <label htmlFor="private" className="text-white">Private Room</label>
            </div>
            {newRoom.is_private && (
              <input
                type="password"
                placeholder="Room PIN"
                value={newRoom.room_pin}
                onChange={(e) => setNewRoom(prev => ({ ...prev, room_pin: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
                required
              />
            )}
            <div className="flex space-x-2">
              <button
                type="submit"
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors"
              >
                Create
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowCreateForm(false);
                  setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
                }}
                className="bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    <div className="flex-1 flex flex-col h-screen">
      {/* Mobile Header */}
      <div className="lg:hidden bg-[#2c2c2e] p-4 border-b border-[#3a3a3c] flex justify-between items-center">
        <div>
          <h1 className="text-lg font-bold">#{currentRoom}</h1>
          <p className="text-xs text-gray-400">Welcome, {username}!</p>
        </div>
        <button 
          onClick={() => setShowMobileSidebar(!showMobileSidebar)}
          className="bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md"
        >
          ☰
        </button>
      </div>

      {/* Desktop Header */}
      <div className="hidden lg:block bg-[#2c2c2e] p-4 border-b border-[#3a3a3c]">
        <h1 className="text-lg font-bold">#{currentRoom}</h1>
        <p className="text-xs text-gray-400">Welcome, {username}!</p>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-gray-500 text-center mt-10">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div key={msg.message_id} className="bg-[#3a3a3c] p-3 rounded-xl shadow">
            <div className="flex items-center text-sm text-gray-300 mb-1">
              <span className="font-semibold text-white mr-2">{msg.username}</span>
              <span className="text-xs">{new Date(msg.timestamp || msg.created_at || '').toLocaleTimeString()}</span>
              {msg.blockchain_hash && (
                <span className="ml-2 text-green-400 text-xs">🔗 Verified</span>
              )}
              {msg.message_type === 'file' && (
                <span className="ml-2 text-blue-400 text-xs">📎 File</span>
              )}
            </div>
            <div className="text-white text-sm break-words">
              {msg.message_type === 'file' && msg.file_url ? (
                <div>
                  <p className="mb-2">{msg.content}</p>
                  <a 
                    href={msg.file_url} 
                    target="_blank" 
                    rel="noopener noreferrer"
                    className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-xs transition-colors"
                  >
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                    </svg>
                    Download File
                  </a>
                </div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* WhatsApp-like Input */}
      <footer className="bg-[#2c2c2e] px-4 py-3 border-t border-[#3a3a3c] flex-shrink-0">
        <form onSubmit={sendMessage} className="flex items-center gap-3">
          
          {/* Attach Icon */}
          <label className="cursor-pointer text-gray-300 hover:text-white transition-colors p-2 rounded-md hover:bg-[#48484a]" title="Attach file">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M21.44 11.05l-9.19 9.19c-1.78 1.78-4.61 1.78-6.39 0s-1.78-4.61 0-6.39l9.19-9.19c1.17-1.17 3.07-1.17 4.24 0s1.17 3.07 0 4.24L11.05 17.1c-.59.59-1.54.59-2.12 0s-.59-1.54 0-2.12L16.76 7.05" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
            <input 
              type="file" 
              onChange={handleFileUpload} 
              className="hidden"
              accept="*/*"
              title="Select file to upload"
            />
          </label>

          {/* Textarea */}
          <div className="flex-1">
            <textarea
              value={newMessage}
              onChange={(e) => setNewMessage(e.target.value)}
              placeholder="Type a message"
              rows={1}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  sendMessage(e as any);
                }
              }}
              className="w-full resize-none rounded-full bg-[#3a3a3c] border border-[#48484a] px-4 py-2 text-white focus:outline-none focus:ring-2 focus:ring-blue-500 text-sm leading-tight"
            />
          </div>

          {/* Send Button */}
          <button
            type="submit"
            className="text-white bg-blue-600 hover:bg-blue-700 rounded-full px-4 py-2 text-sm font-medium"
          >
            Send
          </button>
        </form>
      </footer>
    </div>
  </div>
);
}