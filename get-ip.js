
const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Look for the first non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Skip internal (loopback) and non-IPv4 addresses
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  
  return 'localhost'; // Fallback
}

function updateFrontendConfig() {
  const ip = getLocalIP();
  const configPath = path.join(__dirname, 'frontend', 'config.js');
  
  const configContent = `export const API_BASE_URL = 'http://${ip}:5000';
`;
  
  // Create config directory if it doesn't exist
  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  
  fs.writeFileSync(configPath, configContent);
  console.log(`Updated frontend config with IP: ${ip}`);
  console.log(`API Base URL: http://${ip}:5000`);
}

// Run the update
updateFrontendConfig();

module.exports = { getLocalIP, updateFrontendConfig };
