const os = require('os');
const fs = require('fs');
const path = require('path');

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  
  // Look for the first non-internal IPv4 address
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
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
  const configPath2 =  path.join(__dirname, 'chat-api', 'config.js');

  const configContent = `const API_BASE_URL = 'http://${ip}:5000';
  module.exports = { API_BASE_URL };
`;

  const configContent2 = `const API_BASE_URL = '${ip}';
  module.exports = { API_BASE_URL };
`;

  const configDir = path.dirname(configPath);
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }

  fs.writeFileSync(configPath, configContent);
  fs.writeFileSync(configPath2, configContent2);
  
  console.log(`Updated frontend config with IP: ${ip}`);
  console.log(`API Base URL: http://${ip}:5000`);
}

updateFrontendConfig();

module.exports = { getLocalIP, updateFrontendConfig };
