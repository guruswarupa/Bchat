
'use client';

import { useState, useRef } from 'react';
import Link from 'next/link';

interface SharedFile {
  file_id: string;
  filename: string;
  file_size: number;
  file_type: string;
  uploaded_by: string;
  upload_date: string;
  download_url: string;
}

export default function FilesPage() {
  const [files, setFiles] = useState<SharedFile[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    const fileInput = fileInputRef.current;
    if (!fileInput?.files?.[0]) return;

    const formData = new FormData();
    formData.append('file', fileInput.files[0]);
    formData.append('room_id', 'general');

    setUploading(true);
    try {
      const response = await fetch('http://localhost:5000/api/upload', {
        method: 'POST',
        body: formData
      });

      if (response.ok) {
        const result = await response.json();
        console.log('File uploaded:', result);
        fileInput.value = '';
        // Refresh files list
        fetchFiles();
      }
    } catch (error) {
      console.error('Upload error:', error);
    } finally {
      setUploading(false);
    }
  };

  const fetchFiles = async () => {
    try {
      const response = await fetch('http://localhost:5000/api/files');
      const data = await response.json();
      setFiles(data);
    } catch (error) {
      console.error('Error fetching files:', error);
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <div>
            <h1 className="text-3xl font-bold text-gray-900">📁 Shared Files</h1>
            <p className="text-gray-600">Upload and manage shared files</p>
          </div>
          <Link href="/" className="bg-gray-600 text-white px-4 py-2 rounded-md hover:bg-gray-700">
            ← Back to Chat
          </Link>
        </div>

        {/* Upload Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-8">
          <h2 className="text-xl font-semibold mb-4">📤 Upload File</h2>
          <form onSubmit={handleFileUpload} className="space-y-4">
            <div>
              <input
                ref={fileInputRef}
                type="file"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                required
              />
            </div>
            <button
              type="submit"
              disabled={uploading}
              className="bg-blue-600 text-white px-6 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? 'Uploading...' : 'Upload File'}
            </button>
          </form>
        </div>

        {/* Files List */}
        <div className="bg-white rounded-lg shadow-lg">
          <div className="p-6 border-b">
            <h2 className="text-xl font-semibold">📋 Shared Files</h2>
          </div>
          <div className="divide-y">
            {files.length === 0 ? (
              <div className="p-8 text-center text-gray-500">
                No files uploaded yet
              </div>
            ) : (
              files.map((file) => (
                <div key={file.file_id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-center justify-between">
                    <div className="flex-1">
                      <h3 className="font-medium">{file.filename}</h3>
                      <div className="text-sm text-gray-500 space-x-4">
                        <span>Size: {formatFileSize(file.file_size)}</span>
                        <span>Type: {file.file_type}</span>
                        <span>Uploaded by: {file.uploaded_by}</span>
                        <span>Date: {new Date(file.upload_date).toLocaleDateString()}</span>
                      </div>
                    </div>
                    <a
                      href={file.download_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 text-sm"
                    >
                      Download
                    </a>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Tech Info */}
        <div className="mt-8 bg-gray-50 rounded-lg p-6">
          <h3 className="text-lg font-semibold mb-4">🔧 File Storage Technology</h3>
          <div className="grid md:grid-cols-3 gap-4 text-sm">
            <div>
              <strong>MinIO:</strong> Distributed object storage for files
            </div>
            <div>
              <strong>Blockchain:</strong> File integrity verification
            </div>
            <div>
              <strong>Oracle DB:</strong> File metadata and permissions
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
