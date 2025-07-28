'use client';

import { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import { toast, Toaster } from 'sonner';

// Try to import API_BASE_URL, fallback to localhost
let API_BASE_URL = 'http://localhost:5000';
try {
  const config = require('../config.js');
  API_BASE_URL = config.API_BASE_URL;
} catch (error) {
  // Using default localhost configuration
}

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
  avatar_url?: string;
}

interface UserProfile {
  user_id: string;
  username: string;
  email: string;
  avatar_url?: string;
  created_at: string;
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
  const [isLoading, setIsLoading] = useState(true);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [profileForm, setProfileForm] = useState({
    username: '',
    email: ''
  });
  const [avatarFile, setAvatarFile] = useState<File | null>(null);
  const [avatarPreview, setAvatarPreview] = useState<string | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [passwordLoading, setPasswordLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
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
    return API_BASE_URL;
  };

  // Fetch user profile
  const fetchUserProfile = async () => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBase()}/api/profile`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const profile = await response.json();
        setUserProfile(profile);
        setProfileForm({
          username: profile.username,
          email: profile.email
        });
      }
    } catch (error) {
      toast.error('Error fetching profile');
    }
  };

  // Reset profile form
  const resetProfile = () => {
    setProfileForm({
      username: userProfile?.username || '',
      email: userProfile?.email || ''
    });
    setAvatarFile(null);
    setAvatarPreview(null);
    toast.info('Profile form reset');
  };

  // Update user profile
  const updateProfile = async () => {
    try {
      setProfileLoading(true);
      const token = localStorage.getItem('token');
      
      // Update profile info
      const response = await fetch(`${getApiBase()}/api/profile`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(profileForm)
      });

      if (response.ok) {
        const updatedProfile = await response.json();
        
        // Upload avatar if selected
        if (avatarFile) {
          const formData = new FormData();
          formData.append('avatar', avatarFile);
          
          const avatarResponse = await fetch(`${getApiBase()}/api/profile/avatar`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${token}`
            },
            body: formData
          });

          if (avatarResponse.ok) {
            const avatarResult = await avatarResponse.json();
            updatedProfile.avatar_url = avatarResult.avatar_url;
          }
        }

        setUserProfile(updatedProfile);
        setCurrentUser(updatedProfile);
        localStorage.setItem('username', updatedProfile.username);
        setUsername(updatedProfile.username);
        setShowProfileModal(false);
        setAvatarFile(null);
        setAvatarPreview(null);
        toast.success('Profile updated successfully!');
      } else {
        const error = await response.json();
        toast.error('Failed to update profile: ' + error.error);
      }
    } catch (error) {
      toast.error('Failed to update profile');
    } finally {
      setProfileLoading(false);
    }
  };

  // Change password
  const changePassword = async () => {
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('New passwords do not match');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('New password must be at least 6 characters long');
      return;
    }

    try {
      setPasswordLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${getApiBase()}/api/profile/password`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          currentPassword: passwordForm.currentPassword,
          newPassword: passwordForm.newPassword
        })
      });

      if (response.ok) {
        toast.success('Password changed successfully!');
        setShowPasswordChange(false);
        setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
      } else {
        const error = await response.json();
        toast.error('Failed to change password: ' + error.error);
      }
    } catch (error) {
      toast.error('Failed to change password');
    } finally {
      setPasswordLoading(false);
    }
  };

  // Delete account
  const deleteAccount = async () => {
    if (!deletePassword) {
      toast.error('Please enter your password to confirm account deletion');
      return;
    }

    const confirmed = confirm('Are you sure you want to delete your account? This action cannot be undone and all your data will be permanently lost.');
    if (!confirmed) return;

    try {
      setDeleteLoading(true);
      const token = localStorage.getItem('token');
      
      const response = await fetch(`${getApiBase()}/api/profile`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ password: deletePassword })
      });

      if (response.ok) {
        toast.success('Account deleted successfully. You will be logged out.');
        handleLogout();
      } else {
        const error = await response.json();
        toast.error('Failed to delete account: ' + error.error);
      }
    } catch (error) {
      toast.error('Failed to delete account');
    } finally {
      setDeleteLoading(false);
    }
  };

  // Handle avatar file selection
  const handleAvatarChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      // Validate file type
      const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        toast.error('Please select an image file (JPEG, PNG, GIF, WebP)');
        return;
      }

      // Validate file size (5MB)
      const maxSize = 5 * 1024 * 1024;
      if (file.size > maxSize) {
        toast.error('File size must be less than 5MB');
        return;
      }

      setAvatarFile(file);
      
      // Create preview
      const reader = new FileReader();
      reader.onload = (e) => {
        setAvatarPreview(e.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  // Get avatar URL with fallback
  const getAvatarUrl = (avatarUrl?: string) => {
    if (avatarUrl) {
      return `${getApiBase()}${avatarUrl}`;
    }
    return null;
  };

  const handleFileDownload = async (fileUrl: string, fileName: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBase()}${fileUrl}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName || 'download';
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      } else {
        alert('Failed to download file');
      }
    } catch (error) {
      console.error('Download error:', error);
      alert('Failed to download file');
    }
  };

  const getFilePreviewUrl = async (fileUrl: string) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${getApiBase()}${fileUrl}`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        const blob = await response.blob();
        return window.URL.createObjectURL(blob);
      }
    } catch (error) {
      console.error('Preview error:', error);
    }
    return null;
  };

  const isImageFile = (fileName: string) => {
    const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
    return imageExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  const isVideoFile = (fileName: string) => {
    const videoExtensions = ['.mp4', '.mov', '.avi', '.mkv', '.webm', '.flv', '.wmv'];
    return videoExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  const isAudioFile = (fileName: string) => {
    const audioExtensions = ['.mp3', '.wav', '.ogg', '.aac', '.flac', '.m4a'];
    return audioExtensions.some(ext => fileName.toLowerCase().endsWith(ext));
  };

  // Cache for loaded preview URLs to prevent re-loading
  const previewCache = useRef(new Map<string, string>());

  const MediaPreview = ({ fileUrl, fileName }: { fileUrl: string; fileName: string }) => {
    const [previewUrl, setPreviewUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
      // Check if we already have this URL cached
      if (previewCache.current.has(fileUrl)) {
        setPreviewUrl(previewCache.current.get(fileUrl)!);
        setLoading(false);
        return;
      }

      // Load preview only if not cached
      const loadPreview = async () => {
        const url = await getFilePreviewUrl(fileUrl);
        if (url) {
          previewCache.current.set(fileUrl, url);
          setPreviewUrl(url);
        }
        setLoading(false);
      };
      
      loadPreview();

      // Cleanup function that only runs on unmount
      return () => {
        if (previewUrl && previewCache.current.has(fileUrl)) {
          window.URL.revokeObjectURL(previewUrl);
          previewCache.current.delete(fileUrl);
        }
      };
    }, []); // Empty dependency array - only run once per component instance

    if (loading) {
      return <div className="text-gray-400 text-sm">Loading preview...</div>;
    }

    if (!previewUrl) {
      return <div className="text-red-400 text-sm">Failed to load preview</div>;
    }

    if (isImageFile(fileName) && previewUrl) {
      return (
        <div className="mt-2">
          <img 
            src={previewUrl} 
            alt={fileName}
            className="max-w-full h-auto max-h-96 rounded-lg shadow-lg cursor-pointer"
            onClick={() => window.open(previewUrl, '_blank')}
          />
        </div>
      );
    }

    if (isVideoFile(fileName) && previewUrl) {
      return (
        <div className="mt-2">
          <video 
            controls 
            className="max-w-full h-auto max-h-96 rounded-lg shadow-lg"
            preload="metadata"
          >
            <source src={previewUrl || undefined} />
            Your browser does not support the video tag.
          </video>
        </div>
      );
    }

    if (isAudioFile(fileName) && previewUrl) {
      return (
        <div className="mt-2">
          <audio 
            controls 
            className="w-full max-w-md"
            preload="metadata"
          >
            <source src={previewUrl || undefined} />
            Your browser does not support the audio tag.
          </audio>
        </div>
      );
    }

    return null;
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
        toast.success('Room created successfully!');
        setShowCreateForm(false);
        setNewRoom({ room_name: '', description: '', is_private: false, room_pin: '' });
        fetchRooms(); // Refresh rooms list
      } else {
        toast.error('Failed to create room');
      }
    } catch (error) {
      toast.error('Failed to create room');
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
      const response = await fetch(`${API_BASE_URL}/api/rooms/${pendingRoom}/verify-pin`, {
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
        // Fetch full profile after login
        setTimeout(() => fetchUserProfile(), 100);
      } else {
        alert(isRegistering ? 'Registration failed' : 'Login failed');
      }
    } catch (error) {
      console.error('Auth error:', error);
      alert(isRegistering ? 'Registration failed' : 'Login failed');
    }
  };

  const handleLogout = () => {
    // Clear local storage
    localStorage.removeItem('token');
    localStorage.removeItem('user_id');
    localStorage.removeItem('username');
    
    // Disconnect socket
    if (socket) {
      socket.disconnect();
      setSocket(null);
    }
    
    // Reset state
    setIsLoggedIn(false);
    setCurrentUser(null);
    setUsername('');
    setMessages([]);
    setOnlineUsers([]);
    setCurrentRoom('general');
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
        console.log('Received message for room:', message.room_id, 'current room:', currentRoom, 'message:', message);
        // Only add message if it's for the current room
        if (message.room_id === currentRoom) {
          setMessages(prev => {
            // Check if message already exists to prevent duplicates
            const exists = prev.some(m => m.message_id === message.message_id);
            if (!exists) {
              return [...prev, message];
            }
            return prev;
          });
        }
      });

      // Listen for socket errors
      newSocket.on('error', (error: any) => {
        console.error('Socket error:', error);
        alert('Error: ' + error);
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

      // Listen for account deletion
      newSocket.on('account_deleted', () => {
        alert('Your account has been deleted. You will be logged out.');
        handleLogout();
      });

      setSocket(newSocket);

      return () => {
        newSocket.close();
      };
    }
  }, [isLoggedIn, currentRoom, username]);

  useEffect(() => {
    const checkAuthStatus = async () => {
      try {
        const token = localStorage.getItem('token');
        const storedUsername = localStorage.getItem('username');
        const storedUserId = localStorage.getItem('user_id');
        
        if (token && storedUsername) {
          setUsername(storedUsername);
          setCurrentUser({ user_id: storedUserId, username: storedUsername });
          setIsLoggedIn(true);
          await fetchRooms(); // Fetch rooms when logged in
          await fetchUserProfile(); // Fetch user profile
        }

        // Check URL parameters for room
        const urlParams = new URLSearchParams(window.location.search);
        const roomParam = urlParams.get('room');
        if (roomParam) {
          setCurrentRoom(roomParam);
        }
      } catch (error) {
        console.error('Auth check error:', error);
      } finally {
        setIsLoading(false);
      }
    };

    checkAuthStatus();
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

  // Loading screen
  if (isLoading) {
    return (
      <div className="min-h-screen bg-[#1e1e1e] flex items-center justify-center text-white">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-400">Loading...</p>
        </div>
      </div>
    );
  }

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
    <Toaster 
      theme="dark" 
      position="bottom-right"
      richColors
      closeButton
    />
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
        <div className="space-y-2 max-h-80 overflow-y-auto .hide-scrollbar">
          {onlineUsers.map((user) => (
            <div key={user.user_id} className="flex items-center space-x-3">
              <div className="relative flex-shrink-0">
                <div className="w-8 h-8 rounded-full overflow-hidden bg-[#48484a] flex items-center justify-center">
                  {user.avatar_url ? (
                    <img src={getAvatarUrl(user.avatar_url) || ''} alt={user.username} className="w-full h-full object-cover" />
                  ) : (
                    <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                      <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                    </svg>
                  )}
                </div>
                <span className="absolute -bottom-1 -right-1 w-3 h-3 bg-green-400 rounded-full border-2 border-[#2c2c2e]" />
              </div>
              <span className="text-sm text-white truncate flex-1">{user.username}</span>
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
        <div className="flex items-center space-x-2">
          {/* Mobile Profile Avatar Button */}
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center space-x-1 bg-[#48484a] hover:bg-[#5c5c5e] px-2 py-2 rounded-md transition-colors"
          >
            <div className="w-6 h-6 rounded-full overflow-hidden bg-[#3a3a3c] flex items-center justify-center">
              {userProfile?.avatar_url ? (
                <img src={getAvatarUrl(userProfile.avatar_url) || ''} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
          </button>
          
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white px-3 py-2 rounded-md text-sm flex items-center space-x-1"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
          <button 
            onClick={() => setShowMobileSidebar(!showMobileSidebar)}
            className="bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md"
          >
            ☰
          </button>
        </div>
      </div>

      {/* Password Change Modal */}
      {showPasswordChange && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Change Password</h3>
            <div className="space-y-4">
              <input
                type="password"
                placeholder="Current Password"
                value={passwordForm.currentPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, currentPassword: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="password"
                placeholder="New Password"
                value={passwordForm.newPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, newPassword: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="password"
                placeholder="Confirm New Password"
                value={passwordForm.confirmPassword}
                onChange={(e) => setPasswordForm(prev => ({ ...prev, confirmPassword: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              
              <div className="text-xs text-gray-400">
                Password must be at least 6 characters long
              </div>

              <div className="flex space-x-3">
                <button
                  onClick={changePassword}
                  disabled={passwordLoading}
                  className="bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors font-medium disabled:opacity-50"
                >
                  {passwordLoading ? 'Changing...' : 'Change Password'}
                </button>
                <button
                  onClick={() => {
                    setShowPasswordChange(false);
                    setPasswordForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
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

      {/* Delete Account Modal */}
      {showDeleteConfirm && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-[60] p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Delete Account</h3>
            <div className="space-y-4">
              <div className="text-red-400 text-sm">
                ⚠️ Warning: This action cannot be undone! All your data including messages, rooms, and files will be permanently deleted.
              </div>
              
              <input
                type="password"
                placeholder="Enter your password to confirm"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-red-400"
              />

              <div className="flex space-x-3">
                <button
                  onClick={deleteAccount}
                  disabled={deleteLoading}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors font-medium disabled:opacity-50"
                >
                  {deleteLoading ? 'Deleting...' : 'Delete Account'}
                </button>
                <button
                  onClick={() => {
                    setShowDeleteConfirm(false);
                    setDeletePassword('');
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

      {/* Profile Modal */}
      {showProfileModal && (
        <div className="fixed inset-0 bg-black bg-opacity-75 flex items-center justify-center z-50 p-4">
          <div className="bg-[#2c2c2e] p-6 rounded-xl shadow-xl w-full max-w-md">
            <h3 className="text-lg font-semibold mb-4 text-white">Profile Settings</h3>
            <div className="space-y-4">
              {/* Avatar Section */}
              <div className="flex flex-col items-center space-y-3">
                <div className="relative">
                  <div className="w-20 h-20 rounded-full overflow-hidden bg-[#48484a] flex items-center justify-center">
                    {avatarPreview ? (
                      <img src={avatarPreview} alt="Avatar Preview" className="w-full h-full object-cover" />
                    ) : userProfile?.avatar_url ? (
                      <img src={getAvatarUrl(userProfile.avatar_url) || ''} alt="Current Avatar" className="w-full h-full object-cover" />
                    ) : (
                      <svg className="w-10 h-10 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                      </svg>
                    )}
                  </div>
                  <label className="absolute bottom-0 right-0 bg-blue-600 hover:bg-blue-700 text-white rounded-full p-1 cursor-pointer">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
                    </svg>
                    <input
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarChange}
                      className="hidden"
                    />
                  </label>
                </div>
                <p className="text-xs text-gray-400">Click + to change avatar (max 5MB)</p>
              </div>

              {/* Form Fields */}
              <input
                type="text"
                placeholder="Username"
                value={profileForm.username}
                onChange={(e) => setProfileForm(prev => ({ ...prev, username: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              <input
                type="email"
                placeholder="Email"
                value={profileForm.email}
                onChange={(e) => setProfileForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full px-3 py-2 bg-[#3a3a3c] text-white border border-[#48484a] rounded-md focus:outline-none focus:ring-2 focus:ring-blue-400"
              />
              
              {userProfile && (
                <div className="text-xs text-gray-400">
                  Member since: {new Date(userProfile.created_at).toLocaleDateString()}
                </div>
              )}

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={updateProfile}
                  disabled={profileLoading}
                  className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 transition-colors font-medium disabled:opacity-50 flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{profileLoading ? 'Saving...' : 'Save'}</span>
                </button>
                
                <button
                  onClick={resetProfile}
                  className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Reset</span>
                </button>
                
                <button
                  onClick={() => setShowDeleteConfirm(true)}
                  className="bg-red-600 text-white px-4 py-2 rounded-md hover:bg-red-700 transition-colors flex items-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                  <span>Delete</span>
                </button>
              </div>
              
              <div className="mt-4 pt-4 border-t border-[#48484a]">
                <button
                  onClick={() => setShowPasswordChange(true)}
                  className="w-full bg-orange-600 text-white px-4 py-2 rounded-md hover:bg-orange-700 transition-colors flex items-center justify-center space-x-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" />
                  </svg>
                  <span>Change Password</span>
                </button>
                
                <button
                  onClick={() => {
                    setShowProfileModal(false);
                    setAvatarFile(null);
                    setAvatarPreview(null);
                    setProfileForm({
                      username: userProfile?.username || '',
                      email: userProfile?.email || ''
                    });
                  }}
                  className="w-full mt-2 bg-[#48484a] text-white px-4 py-2 rounded-md hover:bg-[#5c5c5e] transition-colors"
                >
                  Close
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Desktop Header */}
      <div className="hidden lg:flex bg-[#2c2c2e] p-4 border-b border-[#3a3a3c] justify-between items-center">
        <div>
          <h1 className="text-lg font-bold">#{currentRoom}</h1>
          <p className="text-xs text-gray-400">Welcome, {username}!</p>
        </div>
        <div className="flex items-center space-x-3">
          {/* Profile Avatar Button */}
          <button
            onClick={() => setShowProfileModal(true)}
            className="flex items-center space-x-2 bg-[#48484a] hover:bg-[#5c5c5e] px-3 py-2 rounded-md transition-colors"
          >
            <div className="w-8 h-8 rounded-full overflow-hidden bg-[#3a3a3c] flex items-center justify-center">
              {userProfile?.avatar_url ? (
                <img src={getAvatarUrl(userProfile.avatar_url) || ''} alt="Profile" className="w-full h-full object-cover" />
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              )}
            </div>
            <span className="text-sm text-white">{username}</span>
          </button>
          
          <button
            onClick={handleLogout}
            className="bg-red-600 hover:bg-red-700 text-white py-2 px-4 rounded-md transition-colors flex items-center space-x-2 text-sm"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
            </svg>
            <span>Logout</span>
          </button>
        </div>
      </div>

      {/* Messages Area */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scroll-smooth">
        {messages.length === 0 && (
          <div className="text-gray-500 text-center mt-10">No messages yet</div>
        )}
        {messages.map((msg) => (
          <div key={msg.message_id} className="bg-[#3a3a3c] p-3 rounded-xl shadow">
            <div className="flex items-center text-sm text-gray-300 mb-1">
              <div className="w-6 h-6 rounded-full overflow-hidden bg-[#48484a] flex items-center justify-center mr-2 flex-shrink-0">
                {/* For now, show default avatar - you could extend this to show user avatars if available */}
                <svg className="w-4 h-4 text-gray-400" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
                </svg>
              </div>
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
                  
                  {/* Media Preview */}
                  {(() => {
                    const fileName = msg.content.replace('Uploaded file: ', '');
                    if (isImageFile(fileName) || isVideoFile(fileName) || isAudioFile(fileName)) {
                      return <MediaPreview fileUrl={msg.file_url!} fileName={fileName} />;
                    }
                    return null;
                  })()}
                  
                  {/* Download Button */}
                  <div className="mt-2">
                    <button 
                      onClick={() => handleFileDownload(msg.file_url!, msg.content.replace('Uploaded file: ', ''))}
                      className="inline-flex items-center px-3 py-2 bg-blue-600 hover:bg-blue-700 rounded-md text-white text-xs transition-colors"
                    >
                      <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Download File
                    </button>
                  </div>
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